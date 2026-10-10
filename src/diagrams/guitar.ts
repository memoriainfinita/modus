import { tryParseChord, tryUMT } from '../theory/chord'
import { playableVoicings, tuningToMidi, normalizeNoteName } from '../theory/voicings'
import { loadBool, loadChoice, loadJSON, loadNumber, save } from '../ui/storage'
import { DARK_FRETBOARD_STYLE } from './fretboard-style'

let guitarControlsVisible = loadBool('panel-guitarControls', true)
export function setGuitarControlsVisible(v: boolean) { guitarControlsVisible = v }

const EMPTY_FRETBOARD = { name: '', frets: [null, null, null, null, null, null], tuning: ['E','A','D','G','B','E'] }

let guitarVoicingIdx = 0
let onVoicingChange: (idx: number) => void = () => {}

/** The voicing on screen (index into the playable list), for view windows. */
export function getGuitarVoicingIndex(): number { return guitarVoicingIdx }
export function setGuitarVoicingChange(cb: (idx: number) => void) { onVoicingChange = cb }
let lastGuitarSymbol: string | null = null
let lastNoteNames: string[] = []
let guitarLabelMode = loadChoice('guitar-label-mode', ['none', 'tuning', 'notes'] as const, 'none')
type GuitarTuningKey = 'standard' | 'dropD' | 'openG' | 'custom'
let guitarTuningKey = loadChoice<GuitarTuningKey>('guitar-tuning', ['standard', 'dropD', 'openG', 'custom'], 'standard')
let guitarTunerExpanded = false
let guitarSpacing = loadNumber('guitar-spacing', 19, 12, 32)

const GUITAR_TUNINGS: Record<string, { notae: string[]; label: string }> = {
  standard: { notae: ['E','A','D','G','B','E'], label: 'Standard' },
  dropD:    { notae: ['D','A','D','G','B','E'], label: 'Drop D'   },
  openG:    { notae: ['D','G','D','G','B','D'], label: 'Open G'   },
}

function loadStringTuning(): string[] {
  const saved = loadJSON<unknown>('guitar-string-tuning', null)
  if (Array.isArray(saved) && saved.length === 6 && saved.every(n => typeof n === 'string' && normalizeNoteName(n))) {
    return saved.map(n => normalizeNoteName(n)!)
  }
  return [...(GUITAR_TUNINGS[guitarTuningKey]?.notae ?? ['E','A','D','G','B','E'])]
}

let guitarStringTuning: string[] = loadStringTuning()

function detectPreset(notes: string[]): GuitarTuningKey {
  const match = Object.entries(GUITAR_TUNINGS).find(([, t]) => t.notae.every((n, i) => n === notes[i]))
  return match ? match[0] as GuitarTuningKey : 'custom'
}

function guitarStyle(): object {
  const sp = guitarSpacing
  return {
    ...DARK_FRETBOARD_STYLE,
    stringSpacing: sp,
    fretSpacing: Math.round(sp * 23 / 19),
    dotRadius: Math.max(5, Math.round(sp * 9 / 19)),
    fingerNumberSize: Math.max(6, Math.round(sp * 8 / 19)),
    showStringLabels: guitarLabelMode !== 'none',
    ...(guitarLabelMode !== 'none' ? {
      stringLabelMode: guitarLabelMode,
      stringLabelPosition: 'bottom',
      stringLabelColor: '#9ca3af',
    } : {}),
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
  const nav = total > 1 ? `
    <button class="guitar-nav" data-dir="-1" title="Previous voicing">‹</button>
    <span class="guitar-voicing-count">${idx + 1}/${total}</span>
    <button class="guitar-nav" data-dir="1" title="Next voicing">›</button>` : ''
  const tunerRow = guitarTunerExpanded ? `
    <div class="tuner-row">
      ${guitarStringTuning.map((note, i) =>
        `<input class="guitar-string-input" data-string="${i}" value="${note}" title="String ${6 - i}" maxlength="2">`
      ).join('')}
    </div>` : ''
  return `
    <div id="guitar-ctrl-wrap" style="display:${guitarControlsVisible ? 'flex' : 'none'}">
      <div class="guitar-ctrl-row">
        ${nav || '<span class="guitar-nav-placeholder">—</span>'}
        <button class="guitar-size-btn guitar-ctrl" data-action="size-minus" title="Smaller diagram">−</button>
        <button class="guitar-size-btn guitar-ctrl" data-action="size-plus"  title="Larger diagram">+</button>
      </div>
      <div class="guitar-ctrl-row-wrap">
        ${btn('label-none',   'Off',       guitarLabelMode === 'none',    'Hide string labels')}
        ${btn('label-tuning', FORK_ICON,  guitarLabelMode === 'tuning',  'Show open string notes (tuning)')}
        ${btn('label-notes',  NOTE_ICON,  guitarLabelMode === 'notes',   'Show fretted note names')}
        <select class="guitar-tuning-sel" title="Tuning preset">
          ${Object.entries(GUITAR_TUNINGS).map(([k, t]) =>
            `<option value="${k}" ${guitarTuningKey === k ? 'selected' : ''}>${t.label}</option>`
          ).join('')}
          <option value="custom" ${guitarTuningKey === 'custom' ? 'selected' : ''}>Custom</option>
        </select>
        ${btn('toggle-tuner', '✎', guitarTunerExpanded, 'Edit string tuning')}
      </div>
      ${tunerRow}
    </div>`
}

function wireGuitarControls(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('.guitar-ctrl').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action!
      if (action.startsWith('label-')) {
        guitarLabelMode = action.replace('label-', '') as typeof guitarLabelMode
        save('guitar-label-mode', guitarLabelMode)
      } else if (action === 'toggle-tuner') {
        guitarTunerExpanded = !guitarTunerExpanded
      } else if (action === 'size-minus') {
        guitarSpacing = Math.max(12, guitarSpacing - 3)
        save('guitar-spacing', guitarSpacing)
      } else if (action === 'size-plus') {
        guitarSpacing = Math.min(32, guitarSpacing + 3)
        save('guitar-spacing', guitarSpacing)
      }
      renderGuitar(container, lastGuitarSymbol, lastNoteNames)
    })
  })

  const sel = container.querySelector<HTMLSelectElement>('.guitar-tuning-sel')
  if (sel) {
    sel.addEventListener('change', () => {
      const key = sel.value as GuitarTuningKey
      guitarTuningKey = key
      save('guitar-tuning', key)
      if (key !== 'custom' && GUITAR_TUNINGS[key]) {
        guitarStringTuning = [...GUITAR_TUNINGS[key].notae]
        save('guitar-string-tuning', guitarStringTuning)
      }
      const sym = lastGuitarSymbol
      guitarVoicingIdx = 0
      lastGuitarSymbol = null
      renderGuitar(container, sym, lastNoteNames)
    })
  }

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
      const sym = lastGuitarSymbol
      const notes = [...lastNoteNames]
      guitarVoicingIdx = 0
      lastGuitarSymbol = null
      renderGuitar(container, sym, notes)
    })
  })
}

/** `voicingIndex` forces a voicing (a view window shows the one the main window shows). */
export function renderGuitar(container: HTMLElement, chordSymbol: string | null, noteNames: string[] = [], voicingIndex?: number) {
  lastNoteNames = noteNames

  if (!chordSymbol) {
    guitarVoicingIdx = 0
    lastGuitarSymbol = null
    try {
      const ph = { ...EMPTY_FRETBOARD, tuning: guitarStringTuning }
      container.innerHTML =
        `<div class="guitar-placeholder">${Notae.renderFretboard(ph as any, guitarStyle())}</div>` +
        guitarControls(0, 0)
    } catch {
      container.innerHTML = guitarControls(0, 0)
    }
    wireGuitarControls(container)
    return
  }

  if (chordSymbol !== lastGuitarSymbol) {
    guitarVoicingIdx = 0
    lastGuitarSymbol = chordSymbol
  }
  if (voicingIndex !== undefined) guitarVoicingIdx = voicingIndex

  // Every tuning, preset or custom, goes through UMT: open strings as steps from A4.
  const openMidi = tuningToMidi(guitarStringTuning) ?? tuningToMidi(GUITAR_TUNINGS.standard.notae)!
  const umtTuning = openMidi.map(m => m - 69)
  const chord = tryParseChord(chordSymbol)
  const bassPc = chord ? ((((chord.bassStep ?? chord.rootStep) + 9) % 12) + 12) % 12 : 0
  const voicings: any[] = chord
    ? playableVoicings(tryUMT('fretboard voicings', () => UMT.getFretboardVoicings(chord, umtTuning) ?? [], []), openMidi, bassPc)
    : []

  if (!voicings.length) {
    container.innerHTML = '<div class="no-voicing">No voicings</div>' + guitarControls(0, 0)
    wireGuitarControls(container)
    return
  }

  const total = voicings.length
  const idx = Math.min(guitarVoicingIdx, total - 1)
  let svg = ''
  try {
    svg = Notae.renderFretboard(
      { name: chordSymbol, ...voicings[idx], tuning: guitarStringTuning },
      guitarStyle()
    )
  } catch { }

  container.innerHTML = `<div>${svg}</div>` + guitarControls(total, idx)

  container.querySelectorAll<HTMLElement>('.guitar-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      guitarVoicingIdx = (idx + parseInt(btn.dataset.dir!) + total) % total
      renderGuitar(container, lastGuitarSymbol, lastNoteNames)
      onVoicingChange(guitarVoicingIdx)
    })
  })
  wireGuitarControls(container)
}
