// The strings panel: any fretted instrument (guitar, bass, ukulele…) in any tuning, in two
// views: the chord's playable shapes one at a time, or every place its notes are on the neck.

import { tryParseChord, tryUMT } from '../theory/chord'
import { playableVoicings, tuningToMidi, normalizeNoteName } from '../theory/voicings'
import { INSTRUMENT_IDS, INSTRUMENT_TUNINGS, defaultTuning, referenceStrings, type InstrumentId } from '../theory/instruments'
import { noteNameToMidi, PITCH_NAMES_FLAT } from '../theory/notes'
import { loadBool, loadChoice, loadJSON, save } from '../ui/storage'
import { fretboardColors } from './fretboard-style'
import { color } from '../ui/theme'
import { t, chordLabel, localizeDrawnNoteNames } from '../i18n/i18n'
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
let guitarTunerExpanded = false

/** Shapes: one playable voicing at a time. Neck: every place the notes sounding are, frets 0–12. */
export type StringsView = 'shapes' | 'neck'
let stringsView = loadChoice<StringsView>('guitar-view', ['shapes', 'neck'], 'shapes')
export function getStringsView(): StringsView { return stringsView }

const NECK_FRETS = 12
// Drawn at one spacing and scaled to its panel
const SHAPE_SPACING = 19
const NECK_SPACING = 16

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

function neckStyle(preferFlats: boolean): object {
  const sp = NECK_SPACING
  return {
    ...fretboardColors(),
    numFrets: NECK_FRETS,
    dotColor: color('neck-dot'),
    chordNameSize: 0,
    chordNameY: 4,
    chordNameGapH: 4,
    stringSpacing: sp,
    fretSpacing: Math.round(sp * 28 / 16),
    dotRadius: Math.max(4, Math.round(sp * 7 / 16)),
    fingerNumberSize: Math.max(5, Math.round(sp * 7 / 16)),
    showNoteNames: true,
    preferFlats,
    orientation: 'horizontal',
  }
}

const FORK_ICON = `<svg width="11" height="13" viewBox="0 0 11 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="vertical-align:middle;display:inline-block">
  <path d="M3,7 L3,2 Q3,0.5 5.5,0.5 Q8,0.5 8,2 L8,7"/>
  <line x1="5.5" y1="7" x2="5.5" y2="12.5"/>
</svg>`
const NOTE_ICON = `<span class="note-icon">♩</span>`

function guitarControls(total: number, idx: number): string {
  const btn = (action: string, label: string, active: boolean, tip: string) =>
    `<button class="guitar-ctrl${active ? ' active' : ''}" data-action="${action}" title="${tip}">${label}</button>`
  const nav = stringsView === 'shapes' && total > 1 ? `
    <button class="guitar-nav" data-dir="-1" title="${t('guitar.prev')}">‹</button>
    <span class="guitar-voicing-count">${idx + 1}/${total}</span>
    <button class="guitar-nav" data-dir="1" title="${t('guitar.next')}">›</button>` : ''
  const count = guitarStringTuning.length
  const tunerRow = guitarTunerExpanded ? `
    <div class="tuner-row">
      ${guitarStringTuning.map((note, i) =>
        `<input class="guitar-string-input" data-string="${i}" value="${note}" title="${t('guitar.string', { n: count - i })}" maxlength="2">`
      ).join('')}
    </div>` : ''
  return `
    <div id="guitar-ctrl-wrap" style="display:${guitarControlsVisible ? 'flex' : 'none'}">
      <div class="guitar-ctrl-row">
        ${btn('view-shapes', t('strings.view.shapes'), stringsView === 'shapes', t('strings.view.shapes.title'))}
        ${btn('view-neck', t('strings.view.neck'), stringsView === 'neck', t('strings.view.neck.title'))}
        ${nav}
      </div>
      <div class="guitar-ctrl-row-wrap">
        <select class="guitar-instrument-sel" title="${t('strings.instrument.title')}">
          ${INSTRUMENT_IDS.map(id => `<option value="${id}" ${instrument === id ? 'selected' : ''}>${t(`instrument.${id}`)}</option>`).join('')}
        </select>
        <select class="guitar-tuning-sel" title="${t('guitar.tuning.title')}">
          ${Object.keys(INSTRUMENT_TUNINGS[instrument]).map(k =>
            `<option value="${k}" ${guitarTuningKey === k ? 'selected' : ''}>${t(`tuning.${k}` as StringKey)}</option>`
          ).join('')}
          <option value="custom" ${guitarTuningKey === 'custom' ? 'selected' : ''}>${t('guitar.tuning.custom')}</option>
        </select>
        ${btn('toggle-tuner', '✎', guitarTunerExpanded, t('guitar.tuner.title'))}
      </div>
      <div class="guitar-ctrl-row-wrap"${stringsView === 'neck' ? ' style="display:none"' : ''}>
        ${btn('label-none',   t('guitar.labels.off'), guitarLabelMode === 'none',    t('guitar.labels.off.title'))}
        ${btn('label-tuning', FORK_ICON,  guitarLabelMode === 'tuning',  t('guitar.labels.tuning.title'))}
        ${btn('label-notes',  NOTE_ICON,  guitarLabelMode === 'notes',   t('guitar.labels.notes.title'))}
      </div>
      ${tunerRow}
    </div>`
}

/** Redraws after a change of instrument or tuning: the voicing list starts again. */
function redrawFresh(container: HTMLElement) {
  const sym = lastGuitarSymbol
  guitarVoicingIdx = 0
  lastGuitarSymbol = null
  renderGuitar(container, sym, [...lastNoteNames], undefined, lastPreferFlats)
}

function wireGuitarControls(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('.guitar-ctrl').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action!
      if (action.startsWith('label-')) {
        guitarLabelMode = action.replace('label-', '') as typeof guitarLabelMode
        save('guitar-label-mode', guitarLabelMode)
      } else if (action.startsWith('view-')) {
        stringsView = action.replace('view-', '') as StringsView
        save('guitar-view', stringsView)
      } else if (action === 'toggle-tuner') {
        guitarTunerExpanded = !guitarTunerExpanded
      }
      renderGuitar(container, lastGuitarSymbol, lastNoteNames, undefined, lastPreferFlats)
    })
  })

  const inst = container.querySelector<HTMLSelectElement>('.guitar-instrument-sel')
  inst?.addEventListener('change', () => {
    instrument = inst.value as InstrumentId
    save('guitar-instrument', instrument)
    guitarTuningKey = defaultTuning(instrument)
    save('guitar-tuning', guitarTuningKey)
    guitarStringTuning = namesOf(referenceStrings(instrument))
    redrawFresh(container)
  })

  const sel = container.querySelector<HTMLSelectElement>('.guitar-tuning-sel')
  sel?.addEventListener('change', () => {
    guitarTuningKey = sel.value
    save('guitar-tuning', guitarTuningKey)
    const preset = INSTRUMENT_TUNINGS[instrument][guitarTuningKey]
    if (preset) guitarStringTuning = namesOf(preset)
    save('guitar-string-tuning', guitarStringTuning)
    redrawFresh(container)
  })

  container.querySelectorAll<HTMLInputElement>('.guitar-string-input').forEach(input => {
    input.addEventListener('change', () => {
      const i = parseInt(input.dataset.string!)
      const val = normalizeNoteName(input.value)
      if (!val) {
        // Not a note name: put the string back and flag the field briefly.
        input.value = guitarStringTuning[i]
        input.classList.add('invalid')
        setTimeout(() => input.classList.remove('invalid'), 1200)
        return
      }
      guitarStringTuning[i] = val
      save('guitar-string-tuning', guitarStringTuning)
      guitarTuningKey = detectPreset(guitarStringTuning)
      save('guitar-tuning', guitarTuningKey)
      redrawFresh(container)
    })
  })
}

/** Every fret (0–12) on each string where a sounding note is. */
function neckSvg(noteNames: string[], open: number[], preferFlats: boolean): string {
  const midi = noteNames.map(noteNameToMidi).filter((n): n is number => n !== null)
  const frets = open.map(o => {
    const pos = midi.map(n => n - o).filter(f => f >= 0 && f <= NECK_FRETS)
    return pos.length ? pos : [null]
  })
  return tryUMT('neck', () => Notae.renderFretboard({ name: '', frets, tuning: guitarStringTuning } as any, neckStyle(preferFlats)), '')
}

/**
 * `voicingIndex` forces a voicing (a view window shows the one the main window shows).
 * `preferFlats` names the notes on the neck view.
 */
export function renderGuitar(container: HTMLElement, chordSymbol: string | null, noteNames: string[] = [], voicingIndex?: number, preferFlats = true) {
  lastNoteNames = noteNames
  lastPreferFlats = preferFlats
  const open = openStrings()

  if (chordSymbol !== lastGuitarSymbol) {
    guitarVoicingIdx = 0
    lastGuitarSymbol = chordSymbol
  }
  if (voicingIndex !== undefined) guitarVoicingIdx = voicingIndex

  if (stringsView === 'neck') {
    container.innerHTML = `<div role="img" aria-label="${escapeAttr(t('a11y.strings', { chord: chordSymbol ? chordLabel(chordSymbol) : t('a11y.nothing') }))}">${neckSvg(noteNames, open, preferFlats)}</div>` + guitarControls(0, 0)
    localizeDrawnNoteNames(container.firstElementChild!)
    wireGuitarControls(container)
    return
  }

  if (!chordSymbol) {
    const empty = { name: '', frets: open.map(() => null), tuning: guitarStringTuning }
    const svg = tryUMT('fretboard', () => Notae.renderFretboard(empty as any, shapeStyle()), '')
    container.innerHTML = `<div class="guitar-placeholder">${svg}</div>` + guitarControls(0, 0)
    wireGuitarControls(container)
    return
  }

  // Every tuning, preset or custom, goes through UMT: open strings as steps from A4.
  const chord = tryParseChord(chordSymbol)
  const bassPc = chord ? ((((chord.bassStep ?? chord.rootStep) + 9) % 12) + 12) % 12 : 0
  const voicings: any[] = chord
    ? playableVoicings(tryUMT('fretboard voicings', () => UMT.getFretboardVoicings(chord, open.map(m => m - 69)) ?? [], []), open, bassPc)
    : []

  if (!voicings.length) {
    container.innerHTML = `<div class="no-voicing">${t('guitar.none')}</div>` + guitarControls(0, 0)
    wireGuitarControls(container)
    return
  }

  const total = voicings.length
  const idx = Math.min(guitarVoicingIdx, total - 1)
  const svg = tryUMT('fretboard', () => Notae.renderFretboard(
    { name: chordLabel(chordSymbol), ...voicings[idx], tuning: guitarStringTuning },
    shapeStyle()
  ), '')

  container.innerHTML = `<div role="img" aria-label="${escapeAttr(t('a11y.strings', { chord: `${chordLabel(chordSymbol)} ${voicings[idx].frets.map((f: number) => f < 0 ? 'x' : f).join(' ')}` }))}">${svg}</div>` + guitarControls(total, idx)
  localizeDrawnNoteNames(container.firstElementChild!)

  container.querySelectorAll<HTMLElement>('.guitar-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      guitarVoicingIdx = (idx + parseInt(btn.dataset.dir!) + total) % total
      renderGuitar(container, lastGuitarSymbol, lastNoteNames, undefined, lastPreferFlats)
      onVoicingChange(guitarVoicingIdx)
    })
  })
  wireGuitarControls(container)
}
