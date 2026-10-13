// The strings panel: any fretted instrument (guitar, bass, ukulele…) in any tuning, in two
// views: the chord's playable shapes one at a time, or every place its notes are on the neck.

import { tryParseChord, tryUMT } from '../theory/chord'
import { playableVoicings, tuningToMidi, normalizeNoteName } from '../theory/voicings'
import { INSTRUMENT_IDS, INSTRUMENT_TUNINGS, defaultTuning, referenceStrings, type InstrumentId } from '../theory/instruments'
import { noteNameToMidi, PITCH_NAMES_FLAT } from '../theory/notes'
import { loadBool, loadChoice, loadJSON, save } from '../ui/storage'
import { fretboardColors } from './fretboard-style'
import { color } from '../ui/theme'
import { t, chordLabel, noteLabel, localizeDrawnNoteNames } from '../i18n/i18n'
import type { StringKey } from '../i18n/en'
import { escapeHtml as escapeAttr } from '../ui/html'

let guitarControlsVisible = loadBool('panel-guitarControls', true)
export function setGuitarControlsVisible(v: boolean) { guitarControlsVisible = v }

let guitarVoicingIdx = 0
let onVoicingChange: (idx: number) => void = () => {}

/** The voicing on screen (index into the playable list), for view windows. */
export function getGuitarVoicingIndex(): number { return guitarVoicingIdx }
export function setGuitarVoicingChange(cb: (idx: number) => void) { onVoicingChange = cb }
let lastGuitarSymbol: string | null = null
let lastNoteNames: string[] = []
let lastPreferFlats = true

let guitarLabelMode = loadChoice('guitar-label-mode', ['none', 'tuning', 'notes'] as const, 'none')
let instrument = loadChoice<InstrumentId>('guitar-instrument', INSTRUMENT_IDS, 'guitar')
const tuningKeys = () => [...Object.keys(INSTRUMENT_TUNINGS[instrument]), 'custom']
let guitarTuningKey = loadChoice('guitar-tuning', tuningKeys(), defaultTuning(instrument))

/** Shapes: one playable voicing at a time. Neck: every place the notes sounding are, frets 0–12. */
export type StringsView = 'shapes' | 'neck'
let stringsView = loadChoice<StringsView>('guitar-view', ['shapes', 'neck'], 'shapes')
export function getStringsView(): StringsView { return stringsView }

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
    ${tab('shapes', t('strings.view.shapes'), t('strings.view.shapes.title'))}${tab('neck', t('strings.view.neck'), t('strings.view.neck.title'))}</div>`
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
    <div class="menu-chips">${(['none', 'tuning', 'notes'] as const).map(m => chip('data-labels', m, t(`strings.labels.${m}`), guitarLabelMode === m)).join('')}</div>`
  if (menu.dataset.wired) return
  menu.dataset.wired = '1'
  const redraw = () => { const c = document.getElementById('guitar-container'); if (c) redrawFresh(c) }
  menu.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-instrument], [data-tuning], [data-labels]')
    if (!b) return
    if (b.dataset.instrument) {
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
  container.querySelectorAll<HTMLElement>('.strings-tab').forEach(b => b.addEventListener('click', () => {
    stringsView = b.dataset.view as StringsView
    save('guitar-view', stringsView)
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
let neckDrawnVertical: boolean | null = null
const watched = new WeakSet<HTMLElement>()
function watchShape(container: HTMLElement) {
  if (watched.has(container) || typeof ResizeObserver === 'undefined') return
  watched.add(container)
  new ResizeObserver(() => {
    if (stringsView === 'neck' && neckDrawnVertical !== null && neckVertical(container) !== neckDrawnVertical) {
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
  if (voicingIndex !== undefined) guitarVoicingIdx = voicingIndex
  const named = chordSymbol ? chordLabel(chordSymbol) : t('a11y.nothing')

  if (stringsView === 'neck') {
    neckDrawnVertical = neckVertical(container)
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
