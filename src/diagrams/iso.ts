// The isomorphic keyboard: a grid of hexagons where an interval keeps its shape in every key
// (notae lays it out and draws it). The notes sounding are lit in their function's colour and
// joined by lines where they are neighbours; the same notes in other octaves, softer. Its
// options live in the panel's ⋯ menu and in localStorage as `iso-*`.

import { functionColor, type HarmonicFunction } from '../theory/chord'
import { noteNameToMidi, pitchClassOf, PITCH_NAMES_FLAT } from '../theory/notes'
import { spellPitchClassInKey } from '../theory/spelling'
import { scaleInfo, scaleSymbol, intervalLabel } from '../theory/scales'
import { movableSyllable } from '../theory/solfege'
import { color as themeColor, resolveTheme } from '../ui/theme'
import { loadBool, loadChoice, loadNumber, save } from '../ui/storage'
import { noteLabel } from '../i18n/i18n'

export const ISO_LAYOUTS = ['harmonic', 'wicki', 'gerhard', 'janko', 'custom'] as const
export const ISO_SIZES = ['small', 'medium', 'large'] as const
export const ISO_ORIENTATIONS = ['rows', 'columns'] as const
export const ISO_COLORS = ['function', 'pitch', 'piano'] as const
export const ISO_LABELS = ['notes', 'degrees', 'movable', 'none'] as const
export const ISO_OCTAVES = ['soft', 'hidden'] as const

export type IsoLayout = typeof ISO_LAYOUTS[number]
export type IsoOptions = {
  layout: IsoLayout
  /** The custom layout: semitones a step right and a step up-right, in rows. */
  right: number
  upRight: number
  size: typeof ISO_SIZES[number]
  /** MIDI note at the centre of the grid. */
  center: number
  orientation: typeof ISO_ORIENTATIONS[number]
  colors: typeof ISO_COLORS[number]
  labels: typeof ISO_LABELS[number]
  octaves: typeof ISO_OCTAVES[number]
  links: boolean
  scale: boolean
}

/** Hexagon radius by size, px. */
export const CELL_SIZE = { small: 16, medium: 24, large: 32 } as const
export const CENTER_MIN = 36, CENTER_MAX = 84
const STEP_MIN = -12, STEP_MAX = 12

// Each layout as it is usually drawn: the harmonic table and Gerhard with the fifth (the
// third) going up, Wicki-Hayden and Jankó in rows
const NATIVE_ORIENTATION: Record<IsoLayout, IsoOptions['orientation']> = {
  harmonic: 'columns', gerhard: 'columns', wicki: 'rows', janko: 'rows', custom: 'rows',
}

export function loadIsoOptions(): IsoOptions {
  const layout = loadChoice('iso-layout', ISO_LAYOUTS, 'harmonic')
  return {
    layout,
    right: loadNumber('iso-right', 7, STEP_MIN, STEP_MAX),
    upRight: loadNumber('iso-up-right', 3, STEP_MIN, STEP_MAX),
    size: loadChoice('iso-size', ISO_SIZES, 'medium'),
    center: loadNumber('iso-center', 60, CENTER_MIN, CENTER_MAX),
    orientation: loadChoice(`iso-orientation-${layout}`, ISO_ORIENTATIONS, NATIVE_ORIENTATION[layout]),
    colors: loadChoice('iso-colors', ISO_COLORS, 'function'),
    labels: loadChoice('iso-labels', ISO_LABELS, 'notes'),
    octaves: loadChoice('iso-octaves', ISO_OCTAVES, 'soft'),
    links: loadBool('iso-links', true),
    scale: loadBool('iso-scale', false),
  }
}

/** Saves one option; the orientation is kept per layout, each with its own. */
export function saveIsoOption<K extends keyof IsoOptions>(o: IsoOptions, name: K, value: IsoOptions[K]) {
  o[name] = value
  if (name === 'layout') o.orientation = loadChoice(`iso-orientation-${value}`, ISO_ORIENTATIONS, NATIVE_ORIENTATION[value as IsoLayout])
  const key = name === 'orientation' ? `iso-orientation-${o.layout}` : name === 'upRight' ? 'iso-up-right' : `iso-${name}`
  save(key, value as string | number | boolean)
}

const layoutOf = (o: IsoOptions) => o.layout === 'custom' ? { right: o.right, upRight: o.upRight } : o.layout

/**
 * The grid for the panel's size. When a note sounding falls outside it, the grid is laid
 * around the notes instead, so a chord played low or high is still on the keys (the
 * centre chosen stays as it was).
 */
export function isoGrid(o: IsoOptions, width: number, height: number, played: number[]): NotaeHexGrid {
  const make = (center: number) => Notae.hexGrid({ layout: layoutOf(o), width, height, cellSize: CELL_SIZE[o.size], center, orientation: o.orientation })
  const grid = make(o.center)
  const has = (g: NotaeHexGrid) => { const in_ = new Set(g.cells.map(c => c.note)); return played.every(m => in_.has(m)) }
  if (!played.length || has(grid)) return grid
  const around = make(Math.round((Math.min(...played) + Math.max(...played)) / 2))
  return has(around) ? around : grid
}

/** Each pitch class named in the key (its own spelling for the notes sounding), or with flats. */
function namesByClass(noteNames: string[], key: string | null): string[] {
  const names = PITCH_NAMES_FLAT.map(n => key ? spellPitchClassInKey(n, key) : n)
  for (const n of noteNames) {
    const base = n.replace(/-?\d+$/, '')
    const pc = pitchClassOf(base)
    if (pc >= 0) names[pc] = base
  }
  return names
}

/** The text on each pitch class: name, degree over the key's tonic, movable do, or none. Degrees and do need a key; without one, the names. */
function labelsByClass(o: IsoOptions, names: string[], key: string | null): string[] {
  const tonic = key?.split(' ')[0] ?? null
  return names.map(n => {
    if (o.labels === 'none') return ''
    if (o.labels === 'degrees' && tonic) return intervalLabel(tonic, n)
    if (o.labels === 'movable' && key) return movableSyllable(n, key) ?? noteLabel(n)
    return noteLabel(n)
  })
}

/** `a` over `b` by `amount` (0–1), for #rrggbb colours; `a` itself for any other form. */
export function mixColor(a: string, b: string, amount: number): string {
  const rgb = (c: string) => /^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : null
  const x = rgb(a), y = rgb(b)
  if (!x || !y) return a
  return '#' + x.map((v, i) => Math.round(v * amount + y[i] * (1 - amount)).toString(16).padStart(2, '0')).join('')
}

/**
 * Wires the ⋯ menu of the panel: chips, the custom layout's intervals, the centre note and
 * the two switches. Each change is saved, shown pressed and drawn (`onChange`).
 */
export function wireIsoMenu(o: IsoOptions, onChange: () => void) {
  const menu = document.getElementById('menu-iso')
  if (!menu) return
  const CHIPS = { 'iso-layout': 'layout', 'iso-size': 'size', 'iso-orientation': 'orientation', 'iso-colors': 'colors', 'iso-labels': 'labels', 'iso-octaves': 'octaves' } as const
  const value = (id: string) => menu.querySelector<HTMLElement>(`#${id}-value`)!
  const show = () => {
    for (const [attr, name] of Object.entries(CHIPS)) {
      const data = attr.replace(/-(\w)/g, (_, c) => c.toUpperCase())
      menu.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[data] === o[name])))
    }
    ;(menu.querySelector('#iso-custom') as HTMLElement).hidden = o.layout !== 'custom'
    value('iso-right').textContent = signed(o.right)
    value('iso-up-right').textContent = signed(o.upRight)
    value('iso-center').textContent = noteLabel(`${PITCH_NAMES_FLAT[o.center % 12]}${Math.floor(o.center / 12) - 1}`)
    for (const [id, on] of [['btn-iso-links', o.links], ['btn-iso-scale', o.scale]] as const) {
      const b = document.getElementById(id)!
      b.classList.toggle('active', on)
      b.setAttribute('aria-pressed', String(on))
    }
  }
  const change = () => { show(); onChange() }
  for (const [attr, name] of Object.entries(CHIPS)) {
    const data = attr.replace(/-(\w)/g, (_, c) => c.toUpperCase())
    menu.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach(b => b.addEventListener('click', () => {
      saveIsoOption(o, name, b.dataset[data] as never)
      change()
    }))
  }
  const step = (id: string, name: 'right' | 'upRight' | 'center', min: number, max: number) => {
    for (const [dir, d] of [['down', -1], ['up', 1]] as const) {
      menu.querySelector(`#${id}-${dir}`)!.addEventListener('click', () => {
        saveIsoOption(o, name, Math.max(min, Math.min(max, o[name] + d)))
        change()
      })
    }
  }
  step('iso-right', 'right', STEP_MIN, STEP_MAX)
  step('iso-up-right', 'upRight', STEP_MIN, STEP_MAX)
  step('iso-center', 'center', CENTER_MIN, CENTER_MAX)
  document.getElementById('btn-iso-links')!.addEventListener('click', () => { saveIsoOption(o, 'links', !o.links); change() })
  document.getElementById('btn-iso-scale')!.addEventListener('click', () => { saveIsoOption(o, 'scale', !o.scale); change() })
  show()
}

const signed = (n: number) => n > 0 ? `+${n}` : String(n)

const NATURAL = [true, false, true, false, true, true, false, true, false, true, false, true]

/**
 * Draws the grid into `container`, at its size. A press on a cell calls `onPress` with its
 * MIDI note and the pointer; the caller plays it and watches for the release, as for the piano.
 */
export function renderIso(container: HTMLElement, noteNames: string[], fn: HarmonicFunction | null, key: string | null, o: IsoOptions,
  onPress?: (midi: number, pointerId: number) => void) {
  const width = Math.floor(container.clientWidth), height = Math.floor(container.clientHeight)
  if (!width || !height) { container.innerHTML = ''; return }
  const played = noteNames.map(noteNameToMidi).filter((m): m is number => m !== null)
  const grid = isoGrid(o, width, height, played)
  const light = ['light', 'paper'].includes(resolveTheme())
  const lit = functionColor(fn)
  const onLit = themeColor('on-accent')
  const ground = themeColor('surface-2')
  const playedClasses = new Set(played.map(m => m % 12))
  const scale = o.scale && key ? scaleInfo(scaleSymbol(key, 'key')) : null
  const inScale = (pc: number) => !scale || scale.pitchClasses.includes(pc)
  const tonicPc = key ? pitchClassOf(key.split(' ')[0]) : -1
  const labels = labelsByClass(o, namesByClass(noteNames, key), key)

  // By pitch class: the colour mode, then the scale (its tonic stronger) or the key's tonic outlined
  const classes: NotaeHexKey[] = labels.map((label, pc) => {
    const k: NotaeHexKey = { label }
    if (o.colors === 'piano') Object.assign(k, NATURAL[pc]
      ? { fill: themeColor('piano-white'), text: themeColor('piano-black-label'), stroke: themeColor('piano-white-stroke') }
      : { fill: themeColor('piano-black'), text: themeColor('piano-label') })
    if (scale) {
      if (!inScale(pc)) Object.assign(k, { fill: themeColor('iso-cell'), text: themeColor('iso-off-label') })
      else if (pc === tonicPc) Object.assign(k, { fill: themeColor('piano-scale-root'), text: onLit, bold: true })
      else if (o.colors === 'function') Object.assign(k, { fill: themeColor('iso-scale'), text: themeColor('iso-scale-label') })
    } else if (pc === tonicPc) Object.assign(k, { stroke: themeColor('accent'), bold: true }, o.colors === 'function' ? { text: themeColor('accent-text') } : {})
    if (o.octaves === 'soft' && playedClasses.has(pc)) {
      Object.assign(k, { fill: mixColor(lit, k.fill ?? ground, 0.32), text: themeColor('text-strong'), stroke: undefined })
    }
    return k
  })

  // By note: hue by pitch class along the fifths, brightness by octave (as Hexatone); the
  // octave on each C at the larger sizes; the notes sounding lit
  const notes: Record<number, NotaeHexKey> = {}
  for (const c of grid.cells) {
    const pc = c.note % 12, oct = Math.floor(c.note / 12) - 1
    const k: NotaeHexKey = {}
    if (o.colors === 'pitch' && inScale(pc) && !(o.octaves === 'soft' && playedClasses.has(pc)) && !(scale && pc === tonicPc)) {
      const hue = (pc * 7 % 12) * 30
      const l = light ? 84 - (oct - 4) * 4 : 24 + (oct - 4) * 4
      Object.assign(k, { fill: `hsl(${hue} 45% ${Math.max(10, Math.min(92, l))}%)`, text: themeColor(light ? 'text-strong' : 'text-soft') })
    }
    if (pc === 0 && o.labels === 'notes' && o.size !== 'small') k.label = `${labels[0]}${oct}`
    if (played.includes(c.note)) Object.assign(k, { fill: lit, text: onLit, bold: true, stroke: undefined })
    if (Object.keys(k).length) notes[c.note] = k
  }

  container.innerHTML = Notae.renderHexGrid(grid, { classes, notes, links: o.links ? played : undefined }, {
    hexCellColor: themeColor('iso-cell'),
    hexTextColor: themeColor('iso-label'),
    hexLinkColor: themeColor('iso-link'),
    fontFamily: 'inherit',
  })

  container.querySelectorAll<SVGPolygonElement>('polygon[data-midi]').forEach(el => {
    const midi = Number(el.dataset.midi)
    el.style.cursor = 'pointer'
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return
      e.preventDefault()   // no text selection or focus change while playing
      onPress?.(midi, e.pointerId)
    })
  })
}
