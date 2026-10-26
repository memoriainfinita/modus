// The strings panel: any fretted instrument (guitar, bass, ukulele…) in any tuning, in three
// views: the chord's playable shapes one at a time, every place its notes are on the neck, or
// the key's scale on the neck, whole or by positions (CAGED, three notes per string).

import { tryParseChord, tryUMT, functionColor, type HarmonicFunction } from '../theory/chord'
import { SCALE_CHOICES, SCALE_SYSTEMS, scaleSymbol, scaleInfo, systemsFor, scalePositions, neckWindows, shapeName, type ScaleChoice, type ScaleSystem, type ScalePosition } from '../theory/scales'
import { playableVoicings, tuningToMidi, normalizeNoteName } from '../theory/voicings'
import { INSTRUMENT_IDS, INSTRUMENT_TUNINGS, defaultTuning, referenceStrings, type InstrumentId } from '../theory/instruments'
import { noteNameToMidi, PITCH_NAMES_FLAT } from '../theory/notes'
import { loadBool, loadChoice, loadJSON, save } from '../ui/storage'
import { fretboardColors } from './fretboard-style'
import { color } from '../ui/theme'
import { t, chordLabel, noteLabel, scaleLabel, localizeDrawnNoteNames } from '../i18n/i18n'
import type { StringKey } from '../i18n/en'
import { escapeHtml as escapeAttr } from '../ui/html'

let guitarControlsVisible = loadBool('panel-guitarControls', true)
export function setGuitarControlsVisible(v: boolean) { guitarControlsVisible = v }

let guitarVoicingIdx = 0
let onVoicingChange: (idx: number) => void = () => {}

/** The voicing or scale position on screen (index into the view's list), for view windows. */
export function getGuitarVoicingIndex(): number { return stringsView === 'scale' ? scaleIdx : guitarVoicingIdx }
export function setGuitarVoicingChange(cb: (idx: number) => void) { onVoicingChange = cb }
let lastGuitarSymbol: string | null = null
let lastNoteNames: string[] = []
let lastPreferFlats = true

let guitarLabelMode = loadChoice('guitar-label-mode', ['none', 'tuning', 'notes'] as const, 'none')
let instrument = loadChoice<InstrumentId>('guitar-instrument', INSTRUMENT_IDS, 'guitar')
const tuningKeys = () => [...Object.keys(INSTRUMENT_TUNINGS[instrument]), 'custom']
let guitarTuningKey = loadChoice('guitar-tuning', tuningKeys(), defaultTuning(instrument))

/**
 * Shapes: one playable voicing at a time. Neck: every place the notes sounding are, frets 0–12.
 * Scale: the analysis key's scale, whole or one position at a time.
 */
export type StringsView = 'shapes' | 'neck' | 'scale'
let stringsView = loadChoice<StringsView>('guitar-view', ['shapes', 'neck', 'scale'], 'shapes')
export function getStringsView(): StringsView { return stringsView }

const SCALE_LABEL_MODES = ['degrees', 'notes', 'none'] as const
let scaleChoice = loadChoice<ScaleChoice>('guitar-scale', SCALE_CHOICES, 'key')
let scaleSystem = loadChoice<ScaleSystem>('guitar-scale-system', SCALE_SYSTEMS, 'neck')
let scaleLabelMode = loadChoice('guitar-scale-labels', SCALE_LABEL_MODES, 'degrees')
let scaleIdx = 0
let lastScaleSig = ''
let scaleKey: string | null = null
let scaleChordFn: HarmonicFunction | null = null

/** The key whose scale the Scale view draws, and the function of the chord sounding, whose notes it colours. */
export function setGuitarScaleContext(key: string | null, fn: HarmonicFunction | null) {
  scaleKey = key
  scaleChordFn = fn
}

const NECK_FRETS = 12
// Drawn at one spacing and scaled to its panel
const SHAPE_SPACING = 19
const NECK_SPACING = 16
const NECK_SPACING_VERTICAL = 28

const nameOf = (midi: number) => PITCH_NAMES_FLAT[((midi % 12) + 12) % 12]

/** The open strings as note names, without octave: what the tuning row edits and notae labels. */
function namesOf(open: number[]): string[] { return open.map(nameOf) }

function loadStringTuning(): string[] {
  const saved = loadJSON<unknown>('guitar-string-tuning', null)
  const count = referenceStrings(instrument).length
  if (guitarTuningKey === 'custom' && Array.isArray(saved) && saved.length === count && saved.every(n => typeof n === 'string' && normalizeNoteName(n))) {
    return saved.map(n => normalizeNoteName(n)!)
  }
  return namesOf(INSTRUMENT_TUNINGS[instrument][guitarTuningKey] ?? referenceStrings(instrument))
}

let guitarStringTuning: string[] = loadStringTuning()

/** The open strings as MIDI: a preset as written (so a ukulele's high G is high), a custom tuning by nearest octave. */
function openStrings(): number[] {
  const preset = INSTRUMENT_TUNINGS[instrument][guitarTuningKey]
  return preset ?? tuningToMidi(guitarStringTuning, referenceStrings(instrument)) ?? referenceStrings(instrument)
}

function detectPreset(names: string[]): string {
  const match = Object.entries(INSTRUMENT_TUNINGS[instrument]).find(([, open]) => namesOf(open).every((n, i) => n === names[i]))
  return match ? match[0] : 'custom'
}

function shapeStyle(): object {
  const sp = SHAPE_SPACING
  return {
    ...fretboardColors(),
    stringSpacing: sp,
    fretSpacing: Math.round(sp * 23 / 19),
    dotRadius: Math.max(5, Math.round(sp * 9 / 19)),
    fingerNumberSize: Math.max(6, Math.round(sp * 8 / 19)),
    showStringLabels: guitarLabelMode !== 'none',
    ...(guitarLabelMode !== 'none' ? {
      stringLabelMode: guitarLabelMode,
      stringLabelPosition: 'bottom',
    } : {}),
  }
}

function neckStyle(preferFlats: boolean, vertical: boolean): object {
  // Standing, the strings are drawn wider apart and the frets closer: the string names fit
  // under it and the neck is not a thin stick in its panel
  const sp = vertical ? NECK_SPACING_VERTICAL : NECK_SPACING
  return {
    ...fretboardColors(),
    numFrets: NECK_FRETS,
    dotColor: color('neck-dot'),
    chordNameSize: 0,
    chordNameY: 4,
    chordNameGapH: 4,
    stringSpacing: sp,
    fretSpacing: vertical ? Math.round(sp * 0.85) : Math.round(sp * 28 / 16),
    dotRadius: vertical ? Math.round(sp * 0.36) : Math.max(4, Math.round(sp * 7 / 16)),
    fingerNumberSize: Math.max(5, Math.round(sp * 7 / 16)),
    showNoteNames: true,
    preferFlats,
    orientation: vertical ? 'vertical' : 'horizontal',
  }
}

let showChordName = true
/** Off while the Chord panel names the chord: the strings need not say it twice. */
export function setGuitarShowsName(v: boolean) { showChordName = v }

const SOLFEGE: Record<string, string> = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' }
/** A string's note as typed: in letters (D, Eb) or in solfège (Re, Mib). */
function readStringNote(text: string): string | null {
  const m = text.trim().toLowerCase().match(/^(do|re|mi|fa|sol|la|si)([#b]?)$/)
  return m ? SOLFEGE[m[1]] + m[2] : normalizeNoteName(text)
}

/** Where a shape is played: open, across a fret with a barre, or from a fret up. */
export function whereLabel(frets: number[]): string {
  const fretted = frets.filter(f => f > 0)
  if (!fretted.length) return t('strings.open')
  const low = Math.min(...fretted)
  if (frets.includes(0)) return low <= 1 ? t('strings.open') : t('strings.openFrom', { n: low })
  return fretted.filter(f => f === low).length >= 3 ? t('strings.barre', { n: low }) : t('strings.fromFret', { n: low })
}

function setupLabel(): string {
  const tuning = guitarTuningKey === 'custom' ? guitarStringTuning.map(noteLabel).join(' ') : t(`tuning.${guitarTuningKey}` as StringKey)
  return `${t(`instrument.${instrument}`)}, ${tuning.toLowerCase()}`
}

// The panel's own controls (hidden by the menu's Controls item, in presentation and in view
// windows): the view, the arrows beside the drawing, the shapes as dots and where it is played
function tabs(): string {
  const tab = (v: StringsView, label: string, tip: string) =>
    `<button type="button" class="strings-tab" data-view="${v}" aria-pressed="${stringsView === v}" title="${escapeAttr(tip)}">${escapeAttr(label)}</button>`
  return `<div class="strings-tabs guitar-chrome" role="group" aria-label="${escapeAttr(t('strings.view'))}">
    ${tab('shapes', t('strings.view.shapes'), t('strings.view.shapes.title'))}${tab('neck', t('strings.view.neck'), t('strings.view.neck.title'))}${tab('scale', t('strings.view.scale'), t('strings.view.scale.title'))}</div>`
}

/** The Scale view's systems the scale and instrument allow; none shown when only the whole neck does. */
function systemTabs(systems: ScaleSystem[], current: ScaleSystem): string {
  if (systems.length < 2) return ''
  return `<div class="strings-tabs strings-systems guitar-chrome" role="group" aria-label="${escapeAttr(t('strings.scale.system'))}">${systems.map(s =>
    `<button type="button" class="strings-tab strings-system" data-system="${s}" aria-pressed="${s === current}" title="${escapeAttr(t(`strings.scale.system.${s}.title`))}">${escapeAttr(t(`strings.scale.system.${s}`))}</button>`).join('')}</div>`
}

function stage(drawing: string, label: string, total: number): string {
  const nav = (dir: -1 | 1, tip: string) => total > 1
    ? `<button type="button" class="guitar-nav guitar-chrome" data-dir="${dir}" title="${escapeAttr(tip)}" aria-label="${escapeAttr(tip)}">${dir < 0 ? '‹' : '›'}</button>` : ''
  return `<div class="strings-stage">${nav(-1, t('guitar.prev'))}<div class="strings-drawing" role="img" aria-label="${escapeAttr(label)}">${drawing}</div>${nav(1, t('guitar.next'))}</div>`
}

const MAX_DOTS = 16
function foot(where: string, total: number, idx: number): string {
  const count = `${idx + 1}/${total}`
  const shapes = total > 1
    ? `<div class="strings-dots" data-count="${count}" role="img" aria-label="${escapeAttr(t('strings.position', { i: idx + 1, n: total }))}">${total <= MAX_DOTS
      ? Array.from({ length: total }, (_, i) => `<span class="strings-dot${i === idx ? ' on' : ''}"></span>`).join('')
      : `<span class="strings-count">${idx + 1} / ${total}</span>`}</div>` : ''
  return `<div class="strings-foot guitar-chrome">${shapes}
    <button type="button" class="strings-caption" title="${escapeAttr(t('strings.setup.title'))}">${escapeAttr([where, setupLabel()].filter(Boolean).join(' · '))}</button></div>`
}

/** Instrument, tuning, its strings and the labels, in the panel's ⋯ menu. */
function renderMenu() {
  const menu = document.getElementById('strings-menu')
  if (!menu) return
  const chip = (attr: string, value: string, label: string, on: boolean) =>
    `<button type="button" class="menu-chip" ${attr}="${value}" data-label="${escapeAttr(label)}" aria-pressed="${on}">${escapeAttr(label)}</button>`
  const tunings = Object.keys(INSTRUMENT_TUNINGS[instrument])
  const count = guitarStringTuning.length
  menu.innerHTML = `
    <div class="menu-heading">${t('strings.instrument')}</div>
    <div class="menu-chips">${INSTRUMENT_IDS.map(id => chip('data-instrument', id, t(`instrument.${id}`), id === instrument)).join('')}</div>
    <div class="menu-heading">${t('strings.tuning')}</div>
    <div class="menu-chips">${tunings.map(k => chip('data-tuning', k, t(`tuning.${k}` as StringKey), k === guitarTuningKey)).join('')}${guitarTuningKey === 'custom' ? chip('data-tuning', 'custom', t('guitar.tuning.custom'), true) : ''}</div>
    <div class="menu-heading">${t('strings.strings')}</div>
    <div class="strings-inputs" style="grid-template-columns: repeat(${count}, minmax(0, 1fr))">${guitarStringTuning.map((note, i) =>
      `<input class="guitar-string-input" data-string="${i}" value="${escapeAttr(noteLabel(note))}" aria-label="${escapeAttr(t('guitar.string', { n: count - i }))}" maxlength="4" autocomplete="off" spellcheck="false">`).join('')}</div>
    <div class="menu-heading">${t('strings.labels')}</div>
    <div class="menu-chips">${(['none', 'tuning', 'notes'] as const).map(m => chip('data-labels', m, t(`strings.labels.${m}`), guitarLabelMode === m)).join('')}</div>${stringsView === 'scale' ? `
    <div class="menu-heading">${t('strings.scale')}</div>
    <div class="menu-chips">${SCALE_CHOICES.map(c => chip('data-scale', c, t(`strings.scale.${c}`), scaleChoice === c)).join('')}</div>
    <div class="menu-heading">${t('strings.scale.labels')}</div>
    <div class="menu-chips">${SCALE_LABEL_MODES.map(m => chip('data-scale-labels', m, t(`strings.scale.labels.${m}`), scaleLabelMode === m)).join('')}</div>` : ''}`
  if (menu.dataset.wired) return
  menu.dataset.wired = '1'
  const redraw = () => { const c = document.getElementById('guitar-container'); if (c) redrawFresh(c) }
  menu.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-instrument], [data-tuning], [data-labels], [data-scale], [data-scale-labels]')
    if (!b) return
    if (b.dataset.scale) {
      scaleChoice = b.dataset.scale as ScaleChoice
      save('guitar-scale', scaleChoice)
    } else if (b.dataset.scaleLabels) {
      scaleLabelMode = b.dataset.scaleLabels as typeof scaleLabelMode
      save('guitar-scale-labels', scaleLabelMode)
    } else if (b.dataset.instrument) {
      instrument = b.dataset.instrument as InstrumentId
      save('guitar-instrument', instrument)
      guitarTuningKey = defaultTuning(instrument)
      save('guitar-tuning', guitarTuningKey)
      guitarStringTuning = namesOf(referenceStrings(instrument))
    } else if (b.dataset.tuning) {
      const preset = INSTRUMENT_TUNINGS[instrument][b.dataset.tuning]
      if (!preset) return
      guitarTuningKey = b.dataset.tuning
      save('guitar-tuning', guitarTuningKey)
      guitarStringTuning = namesOf(preset)
      save('guitar-string-tuning', guitarStringTuning)
    } else if (b.dataset.labels) {
      guitarLabelMode = b.dataset.labels as typeof guitarLabelMode
      save('guitar-label-mode', guitarLabelMode)
    }
    redraw()
  })
  menu.addEventListener('change', e => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('.guitar-string-input')
    if (!input) return
    const i = parseInt(input.dataset.string!)
    const val = readStringNote(input.value)
    if (!val) {
      // Not a note name: the string stays and the field is marked a moment
      input.value = noteLabel(guitarStringTuning[i])
      input.classList.add('invalid')
      setTimeout(() => input.classList.remove('invalid'), 1200)
      return
    }
    guitarStringTuning[i] = val
    save('guitar-string-tuning', guitarStringTuning)
    guitarTuningKey = detectPreset(guitarStringTuning)
    save('guitar-tuning', guitarTuningKey)
    redraw()
  })
}

/** Redraws after a change of instrument or tuning: the voicing list starts again. */
function redrawFresh(container: HTMLElement) {
  const sym = lastGuitarSymbol
  guitarVoicingIdx = 0
  lastGuitarSymbol = null
  renderGuitar(container, sym, [...lastNoteNames], undefined, lastPreferFlats)
}

function wireChrome(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('.strings-tab[data-view]').forEach(b => b.addEventListener('click', () => {
    stringsView = b.dataset.view as StringsView
    save('guitar-view', stringsView)
    renderGuitar(container, lastGuitarSymbol, lastNoteNames, undefined, lastPreferFlats)
  }))
  container.querySelectorAll<HTMLElement>('.strings-system').forEach(b => b.addEventListener('click', () => {
    scaleSystem = b.dataset.system as ScaleSystem
    save('guitar-scale-system', scaleSystem)
    renderGuitar(container, lastGuitarSymbol, lastNoteNames, undefined, lastPreferFlats)
  }))
  // The caption opens the ⋯ menu, where instrument and tuning are changed
  container.querySelector('.strings-caption')?.addEventListener('click', e => {
    e.stopPropagation()
    document.querySelector<HTMLElement>('#mod-guitar .module-more')?.click()
  })
}

/** The neck stands up in a tall panel and lies down in a wide one. */
const neckVertical = (container: HTMLElement) => container.clientHeight > container.clientWidth * 1.15
// Lying down in a panel narrower than this (a phone, Class on a laptop), the scale's whole neck
// is too small to read: it goes four frets at a time
const NARROW_NECK = 520
const neckNarrow = (container: HTMLElement) => container.clientWidth < NARROW_NECK
let neckDrawnVertical: boolean | null = null
let neckDrawnNarrow = false
const watched = new WeakSet<HTMLElement>()
function watchShape(container: HTMLElement) {
  if (watched.has(container) || typeof ResizeObserver === 'undefined') return
  watched.add(container)
  new ResizeObserver(() => {
    if (stringsView !== 'shapes' && neckDrawnVertical !== null && (neckVertical(container) !== neckDrawnVertical || neckNarrow(container) !== neckDrawnNarrow)) {
      renderGuitar(container, lastGuitarSymbol, lastNoteNames, undefined, lastPreferFlats)
    }
  }).observe(container)
}

/** Every fret (0–12) on each string where a sounding note is. */
function neckSvg(noteNames: string[], open: number[], preferFlats: boolean, vertical: boolean): string {
  const midi = noteNames.map(noteNameToMidi).filter((n): n is number => n !== null)
  const frets = open.map(o => {
    const pos = midi.map(n => n - o).filter(f => f >= 0 && f <= NECK_FRETS)
    return pos.length ? pos : [null]
  })
  return tryUMT('neck', () => Notae.renderFretboard({ name: '', frets, tuning: guitarStringTuning } as any, neckStyle(preferFlats, vertical)), '')
}

// A position wider than this many frets is not played with the hand in one place
const REACH = 6

/** Where a position lies, as the foot names it: "E shape · frets 2–5", "Pattern 3 · frets 5–10 · too wide". */
function positionLabel(pos: ScalePosition): string {
  const shape = shapeName(pos.name)
  if (!shape) return ''
  const all = pos.frets.flat()
  const parts = [
    'caged' in shape ? t('strings.scale.shape', { shape: shape.caged }) : t('strings.scale.pattern', { n: shape.pattern }),
    t('strings.scale.frets', { from: Math.min(...all), to: Math.max(...all) }),
  ]
  if (pos.span > REACH) parts.push(t('strings.scale.wide', { n: pos.span }))
  return parts.join(' · ')
}

/**
 * The scale on the strings: the tonic in the accent, the notes of the chord sounding in its
 * function's colour, the rest of the scale quiet; each dot labelled by degree, by name or not.
 */
function scaleSvg(pos: ScalePosition, info: NonNullable<ReturnType<typeof scaleInfo>>, open: number[], noteNames: string[], whole: boolean, vertical: boolean): string {
  const sounding = new Set(noteNames.map(noteNameToMidi).filter((m): m is number => m !== null).map(m => m % 12))
  const chordColor = functionColor(scaleChordFn)
  const dotColors = pos.frets.map((fs, i) => fs.map((f, k) =>
    sounding.has((open[i] + f) % 12) ? chordColor : pos.degrees[i][k] === 1 ? color('fret-dot') : color('scale-dot')))
  const dotLabels = pos.degrees.map(ds => ds.map(d =>
    scaleLabelMode === 'degrees' ? info.degreeLabels[d - 1] ?? '' : scaleLabelMode === 'notes' ? info.names[d - 1] ?? '' : ''))
  const high = Math.max(...pos.frets.flat())
  const numFrets = whole ? NECK_FRETS : Math.max(4, high - pos.baseFret + 1)
  const style = { ...neckStyle(true, vertical), numFrets, showNoteNames: false, showOpenNotes: true, showFingerNumbers: false, dotColor: color('scale-dot') }
  return tryUMT('scale', () => Notae.renderFretboard({ name: '', frets: pos.frets, baseFret: pos.baseFret, dotColors, dotLabels, tuning: guitarStringTuning }, style), '')
}

/** The Scale view: the analysis key's scale (or another on its tonic) by the system chosen. */
function renderScaleView(container: HTMLElement, noteNames: string[], open: number[], forcedIdx: number | undefined) {
  const symbol = scaleKey ? scaleSymbol(scaleKey, scaleChoice) : null
  const info = scaleInfo(symbol)
  if (!symbol || !info) {
    neckDrawnVertical = null
    container.innerHTML = tabs() + `<div class="no-voicing">${t('strings.scale.noKey')}</div>` + foot('', 0, 0)
    wireChrome(container)
    return
  }
  const systems = systemsFor(info, open)
  const system = systems.includes(scaleSystem) ? scaleSystem : 'neck'
  const vertical = neckVertical(container)
  const split = system === 'neck' && !vertical && neckNarrow(container)
  const positions = split ? scalePositions(info, open, system).flatMap(w => neckWindows(w)) : scalePositions(info, open, system)
  const sig = `${symbol}|${system}|${open.join(' ')}|${split}`
  if (sig !== lastScaleSig) { scaleIdx = 0; lastScaleSig = sig }
  if (forcedIdx !== undefined) scaleIdx = forcedIdx
  const total = positions.length
  const named = scaleLabel(symbol)
  if (!total) {
    neckDrawnVertical = null
    container.innerHTML = tabs() + systemTabs(systems, system) + `<div class="no-voicing">${t('strings.scale.none')}</div>` + foot(named, 0, 0)
    wireChrome(container)
    return
  }
  const idx = Math.min(scaleIdx, total - 1)
  const pos = positions[idx]
  neckDrawnVertical = vertical
  neckDrawnNarrow = neckNarrow(container)
  const frets = split ? t('strings.scale.frets', { from: pos.baseFret === 1 ? 0 : pos.baseFret, to: pos.baseFret + pos.span - 1 }) : positionLabel(pos)
  const where = [named, frets].filter(Boolean).join(' · ')
  container.innerHTML = tabs() + systemTabs(systems, system)
    + stage(scaleSvg(pos, info, open, noteNames, system === 'neck' && !split, vertical), t('a11y.strings.scale', { scale: where }), total)
    + foot(where, total, idx)
  localizeDrawnNoteNames(container.querySelector('.strings-drawing')!)
  container.querySelectorAll<HTMLElement>('.guitar-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      scaleIdx = (idx + parseInt(btn.dataset.dir!) + total) % total
      renderGuitar(container, lastGuitarSymbol, lastNoteNames, undefined, lastPreferFlats)
      onVoicingChange(scaleIdx)
    })
  })
  wireChrome(container)
}

/**
 * `voicingIndex` forces a voicing (a view window shows the one the main window shows).
 * `preferFlats` names the notes on the neck view.
 */
export function renderGuitar(container: HTMLElement, chordSymbol: string | null, noteNames: string[] = [], voicingIndex?: number, preferFlats = true) {
  lastNoteNames = noteNames
  lastPreferFlats = preferFlats
  const open = openStrings()
  container.classList.toggle('strings-bare', !guitarControlsVisible)
  watchShape(container)
  renderMenu()

  if (chordSymbol !== lastGuitarSymbol) {
    guitarVoicingIdx = 0
    lastGuitarSymbol = chordSymbol
  }
  if (stringsView === 'scale') {
    renderScaleView(container, noteNames, open, voicingIndex)
    return
  }
  if (voicingIndex !== undefined) guitarVoicingIdx = voicingIndex
  const named = chordSymbol ? chordLabel(chordSymbol) : t('a11y.nothing')

  if (stringsView === 'neck') {
    neckDrawnVertical = neckVertical(container)
    neckDrawnNarrow = neckNarrow(container)
    container.innerHTML = tabs() + stage(neckSvg(noteNames, open, preferFlats, neckDrawnVertical), t('a11y.strings', { chord: named }), 0) + foot('', 0, 0)
    localizeDrawnNoteNames(container.querySelector('.strings-drawing')!)
    wireChrome(container)
    return
  }
  neckDrawnVertical = null

  if (!chordSymbol) {
    const empty = { name: '', frets: open.map(() => null), tuning: guitarStringTuning }
    const svg = tryUMT('fretboard', () => Notae.renderFretboard(empty as any, shapeStyle()), '')
    container.innerHTML = tabs() + stage(`<div class="guitar-placeholder">${svg}</div>`, t('a11y.strings', { chord: named }), 0) + foot('', 0, 0)
    wireChrome(container)
    return
  }

  // Every tuning, preset or custom, goes through UMT: open strings as steps from A4.
  const chord = tryParseChord(chordSymbol)
  const bassPc = chord ? ((((chord.bassStep ?? chord.rootStep) + 9) % 12) + 12) % 12 : 0
  const voicings: any[] = chord
    ? playableVoicings(tryUMT('fretboard voicings', () => UMT.getFretboardVoicings(chord, open.map(m => m - 69)) ?? [], []), open, bassPc)
    : []

  if (!voicings.length) {
    container.innerHTML = tabs() + `<div class="no-voicing">${t('guitar.none')}</div>` + foot('', 0, 0)
    wireChrome(container)
    return
  }

  const total = voicings.length
  const idx = Math.min(guitarVoicingIdx, total - 1)
  const voicing = voicings[idx]
  const svg = tryUMT('fretboard', () => Notae.renderFretboard(
    { name: showChordName ? chordLabel(chordSymbol) : '', ...voicing, tuning: guitarStringTuning },
    showChordName ? shapeStyle() : { ...shapeStyle(), chordNameSize: 0, chordNameY: 4, chordNameGapH: 4 }
  ), '')
  const label = t('a11y.strings', { chord: `${chordLabel(chordSymbol)} ${voicing.frets.map((f: number) => f < 0 ? 'x' : f).join(' ')}` })
  container.innerHTML = tabs() + stage(svg, label, total) + foot(whereLabel(voicing.frets), total, idx)
  localizeDrawnNoteNames(container.querySelector('.strings-drawing')!)

  container.querySelectorAll<HTMLElement>('.guitar-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      guitarVoicingIdx = (idx + parseInt(btn.dataset.dir!) + total) % total
      renderGuitar(container, lastGuitarSymbol, lastNoteNames, undefined, lastPreferFlats)
      onVoicingChange(guitarVoicingIdx)
    })
  })
  wireChrome(container)
}
