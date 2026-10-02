import { playNoteByName } from './audio'
import { NOTE_SEMITONE, noteNameToMidi } from './midi'
import { chordColor, NEUTRAL_COLOR, tryParseChord, tryUMT } from './chord'
import { keySignature } from './keys'
import { playableVoicings, tuningToMidi, normalizeNoteName } from './voicings'
import { loadBool, loadChoice, loadJSON, loadNumber, save } from './storage'

let guitarControlsVisible = loadBool('panel-guitarControls', true)
export function setGuitarControlsVisible(v: boolean) { guitarControlsVisible = v }

// ─── Staff ────────────────────────────────────────────────────────────────────

/** ABC source for a block chord. Accidentals are written only where they differ from the key signature. */
export function buildStaffAbc(noteNames: string[], keyStr: string | null): string {
  const { abcKey, accidentals } = keySignature(keyStr)
  const header = `X:1\nM:none\nL:1\nK:${abcKey}\n`
  const abcNotes = noteNames.flatMap(n => {
    const m = n.match(/^([A-G])([b#]?)(-?\d+)$/)
    if (!m) return []
    const [, letter, acc, octStr] = m
    const keyAcc = accidentals[letter] ?? ''
    const mark = acc === keyAcc ? '' : acc === 'b' ? '_' : acc === '#' ? '^' : '='
    const oct = parseInt(octStr)
    const pitch = oct >= 5 ? letter.toLowerCase() + "'".repeat(oct - 5)
      : oct === 4 ? letter
      : letter + ','.repeat(4 - oct)
    return [mark + pitch]
  })
  return header + (abcNotes.length ? `[${abcNotes.join('')}]1` : 'z')
}

export function renderStaff(container: HTMLElement, noteNames: string[], width = 380, keyStr: string | null = null, scale = 2) {
  ABCJS.renderAbc(container, buildStaffAbc(noteNames, keyStr), { staffwidth: width - 20, scale })
}

// ─── Full-neck horizontal fretboard ──────────────────────────────────────────

const OPEN_MIDI = [40, 45, 50, 55, 59, 64]  // E2 A2 D3 G3 B3 E4
const NECK_FRETS = 12

let neckSpacing = loadNumber('neck-spacing', 16, 10, 28)
export function adjustNeckSpacing(delta: number) {
  neckSpacing = Math.min(28, Math.max(10, neckSpacing + delta))
  save('neck-spacing', neckSpacing)
}

export function renderNeck(container: HTMLElement, noteNames: string[], preferFlats = true) {
  const midi = noteNames.map(noteNameToMidi).filter((n): n is number => n !== null)

  const frets = OPEN_MIDI.map(open => {
    const pos = midi.map(n => n - open).filter(f => f >= 0 && f <= NECK_FRETS)
    return pos.length ? pos : [null]
  })

  const sp = neckSpacing
  const style = {
    ...DARK_FRETBOARD_STYLE,
    numFrets: NECK_FRETS,
    dotColor: '#3b82f6',
    chordNameSize: 0,
    chordNameY: 4,
    chordNameGapH: 4,
    stringSpacing: sp,
    fretSpacing: Math.round(sp * 28 / 16),
    dotRadius: Math.max(4, Math.round(sp * 7 / 16)),
    fingerNumberSize: Math.max(5, Math.round(sp * 7 / 16)),
    showNoteNames: true,
    preferFlats,
  }

  try {
    container.innerHTML = Notae.renderFretboard(
      { name: '', frets, tuning: ['E','A','D','G','B','E'] } as any,
      { ...style, orientation: 'horizontal' }
    )
  } catch {
    container.innerHTML = ''
  }
}

// ─── Piano ────────────────────────────────────────────────────────────────────

export function renderPiano(container: HTMLElement, noteNames: string[], chordSymbol: string | null) {
  const color = chordSymbol ? chordColor(chordSymbol) : NEUTRAL_COLOR
  const colors = noteNames.map(() => color)

  container.innerHTML = Notae.renderPiano({
    name: '', keys: noteNames, colors,
    range: { from: 'C2', to: 'B5' }
  })

  // notae tags every key with data-note (sharp spelling + octave).
  container.querySelectorAll<SVGRectElement>('rect[data-note]').forEach(el => {
    const note = el.dataset.note!
    el.style.cursor = 'pointer'
    el.addEventListener('click', () => playNoteByName(note))
  })
}

// ─── Guitar ───────────────────────────────────────────────────────────────────

const DARK_FRETBOARD_STYLE = {
  chordNameColor: '#e0e0e0',
  fretLabelColor: '#9ca3af',
  nutColor: '#aaaaaa',
  indicatorColor: '#9ca3af',
  stringLabelColor: '#9ca3af',
}

const EMPTY_FRETBOARD = { name: '', frets: [null, null, null, null, null, null], tuning: ['E','A','D','G','B','E'] }

let guitarVoicingIdx = 0
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

export function renderGuitar(container: HTMLElement, chordSymbol: string | null, noteNames: string[] = []) {
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
    })
  })
  wireGuitarControls(container)
}

// ─── Circle of fifths ─────────────────────────────────────────────────────────

const CIRCLE_KEYS_FLAT  = ['C','G','D','A','E','B','Gb','Db','Ab','Eb','Bb','F']
const CIRCLE_KEYS_SHARP = ['C','G','D','A','E','B','F#','C#','G#','D#','Bb','F']
const CIRCLE_KEYS_MINOR_FLAT  = ['Am','Em','Bm','F#m','C#m','G#m','Ebm','Bbm','Fm','Cm','Gm','Dm']
const CIRCLE_KEYS_MINOR_SHARP = ['Am','Em','Bm','F#m','C#m','G#m','D#m','A#m','Fm','Cm','Gm','Dm']
const CIRCLE_DIM = ['B','F#','C#','G#','D#','A#','F','C','G','D','A','E']

// Roman numeral by semitones above the tonic. In a minor key the natural-minor degrees
// (III, VI, VII) carry no accidental.
const DEGREE_IN_MAJOR = ['I','♭II','II','♭III','III','IV','♭V','V','♭VI','VI','♭VII','VII']
const DEGREE_IN_MINOR = ['I','♭II','II','III','♯III','IV','♭V','V','VI','♯VI','VII','♯VII']

const pitchClass = (note: string): number => NOTE_SEMITONE[note] ?? -1
const rootOf = (symbol: string): string => symbol.match(/^([A-G][b#]?)/)?.[1] ?? ''

export type CofOptions = { accidental: 'sharp' | 'flat', showMinor: boolean, showDegrees: boolean, show7ths: boolean, fontScale?: number }

/**
 * Renders the circle. `onSegmentClick` receives the segment's chord and, for major and
 * minor segments, the key it stands for ("G Major", "E Minor"); the caller decides what
 * a click or a double click does.
 */
export function renderCircleOfFifths(
  container: HTMLElement,
  activeKey: string | null,
  activeChord: string | null,
  onSegmentClick: (chord: string, key: string | null) => void,
  size = 160,
  opts: CofOptions = { accidental: 'flat', showMinor: true, showDegrees: false, show7ths: false }
) {
  const keys = opts.accidental === 'sharp' ? CIRCLE_KEYS_SHARP : CIRCLE_KEYS_FLAT
  const minorKeys = opts.accidental === 'sharp' ? CIRCLE_KEYS_MINOR_SHARP : CIRCLE_KEYS_MINOR_FLAT

  // The active key sits on its relative major's segment; a minor key's tonic is the minor
  // segment there. Matching is by pitch class, so F# Major finds Gb in flat mode.
  const [keyRoot, keyMode] = activeKey?.split(' ') ?? []
  const keyIsMinor = keyMode?.toLowerCase() === 'minor'
  const tonicPc = keyRoot ? pitchClass(keyRoot) : -1
  const activePos = tonicPc === -1 ? -1
    : keyIsMinor ? minorKeys.findIndex(m => pitchClass(rootOf(m)) === tonicPc)
    : keys.findIndex(k => pitchClass(k) === tonicPc)
  const degreeTable = keyIsMinor ? DEGREE_IN_MINOR : DEGREE_IN_MAJOR
  const degreeOf = (root: string) => tonicPc === -1 ? '' : degreeTable[(pitchClass(root) - tonicPc + 12) % 12]

  const chordRootPc = activeChord ? pitchClass(rootOf(activeChord)) : -1
  const isDimActiveChord = activeChord ? /^[A-G][b#]?(dim|°|m7b5|ø)/.test(activeChord) : false
  const isMinorActiveChord = !isDimActiveChord && activeChord ? /^[A-G][b#]?m(?!aj)/.test(activeChord) : false

  const cx = size / 2, cy = size / 2
  const outerR    = size * 0.425
  const innerR    = size * 0.275
  const labelR    = size * 0.356
  const minorOutR = size * 0.265
  const minorInR  = size * 0.165
  const minorR    = size * 0.21
  const dimOutR   = size * 0.155
  const dimInR    = size * 0.065
  const dimLabR   = size * 0.11
  const fs = opts.fontScale ?? 0.55
  const majorFont = Math.max(4, Math.round(size * 0.0625 * fs))
  const minorFont = Math.max(3, Math.round(size * 0.05   * fs))
  const dimFont   = Math.max(3, Math.round(size * 0.04   * fs))

  const ring = (rOut: number, rIn: number, a1: number, a2: number) => {
    const p = (r: number, a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
    return `M${p(rIn, a1)} L${p(rOut, a1)} A${rOut},${rOut} 0 0,1 ${p(rOut, a2)} L${p(rIn, a2)} A${rIn},${rIn} 0 0,0 ${p(rIn, a1)}`
  }
  const label = (x: number, y: number, font: number, fill: string, main: string, sub: string | null, subFill: string) => sub
    ? `<text x="${x}" y="${y - font * 0.5}" text-anchor="middle" dominant-baseline="middle" font-size="${font}" fill="${fill}" pointer-events="none">${main}</text>` +
      `<text x="${x}" y="${y + font * 0.72}" text-anchor="middle" dominant-baseline="middle" font-size="${font * 0.85}" fill="${subFill}" pointer-events="none">${sub}</text>`
    : `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${font}" fill="${fill}" pointer-events="none">${main}</text>`
  const TIP = 'Click: play · double-click: set as key'

  const diatonicPos = activePos !== -1
    ? new Set([(activePos + 11) % 12, activePos, (activePos + 1) % 12])
    : new Set<number>()

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">`

  keys.forEach((key, i) => {
    const angle = (i * 30 - 90) * Math.PI / 180
    const nextAngle = ((i + 1) * 30 - 90) * Math.PI / 180
    const midAngle = (i * 30 + 15 - 90) * Math.PI / 180
    const relPos = activePos !== -1 ? (i - activePos + 12) % 12 : -1
    const isDiatonic = diatonicPos.has(i)
    const showDeg = opts.showDegrees && activePos !== -1

    // Major ring
    const isTonic = activePos === i && !keyIsMinor
    const isChordRoot = !isMinorActiveChord && !isDimActiveChord && chordRootPc === pitchClass(key)
    const fill = isTonic ? '#4f46e5' : isChordRoot ? '#0d9488' : isDiatonic ? '#252550' : '#2d2d44'
    const stroke = isChordRoot ? '#0d9488' : isDiatonic ? '#7c7ca0' : '#4a4a6a'
    // The dominant seventh sits one step clockwise of the relative major (V in major, VII in minor).
    const suffix7 = opts.show7ths ? (relPos === 1 && !keyIsMinor ? '7' : 'maj7') : ''
    svg += `<path d="${ring(outerR, innerR, angle, nextAngle)}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor:pointer"
      data-chord="${key + suffix7}" data-key="${key} Major"><title>${TIP}</title></path>`
    svg += label(cx + labelR * Math.cos(midAngle), cy + labelR * Math.sin(midAngle), majorFont, '#e0e0e0',
      key + suffix7, showDeg ? degreeOf(key) : null, '#a5b4fc')

    if (!opts.showMinor) return

    // Minor ring
    const minorRoot = rootOf(minorKeys[i])
    const isMinorTonic = activePos === i && keyIsMinor
    const isMinorChordHere = isMinorActiveChord && chordRootPc === pitchClass(minorRoot)
    const minorChord = minorKeys[i] + (opts.show7ths ? '7' : '')
    const minorSegFill   = isMinorTonic ? '#4f46e5' : isMinorChordHere ? '#0d9488' : isDiatonic ? '#252550' : 'transparent'
    const minorSegStroke = isMinorTonic ? '#4f46e5' : isMinorChordHere ? '#0d9488' : isDiatonic ? '#7c7ca0' : 'transparent'
    svg += `<path d="${ring(minorOutR, minorInR, angle, nextAngle)}" fill="${minorSegFill}" stroke="${minorSegStroke}" stroke-width="1"
      pointer-events="all" style="cursor:pointer" data-chord="${minorChord}" data-key="${minorRoot} Minor"><title>${TIP}</title></path>`
    const minorFill = isMinorTonic || isMinorChordHere ? '#e0e0e0' : isDiatonic ? '#c4b5fd' : '#9ca3af'
    svg += label(cx + minorR * Math.cos(midAngle), cy + minorR * Math.sin(midAngle), minorFont, minorFill,
      minorChord, showDeg ? degreeOf(minorRoot).toLowerCase() : null, '#818cf8')

    // Diminished ring: the leading-tone chord of the major key on this segment
    const dimRoot = CIRCLE_DIM[i]
    const isDiatonicDim = i === activePos
    const isDimChordHere = isDimActiveChord && chordRootPc === pitchClass(dimRoot)
    const dimChord = `${dimRoot}${opts.show7ths ? 'm7b5' : 'dim'}`
    svg += `<path d="${ring(dimOutR, dimInR, angle, nextAngle)}"
      fill="${isDimChordHere ? '#0d9488' : isDiatonicDim ? '#2a2a5a' : '#1e1e35'}" stroke="${isDiatonicDim ? '#a0a0d8' : '#3a3a5c'}" stroke-width="${isDiatonicDim ? 1.5 : 1}"
      pointer-events="all" style="cursor:pointer" data-chord="${dimChord}"><title>Click: play</title></path>`
    const dimText = opts.show7ths ? `${dimRoot}ø7` : `${dimRoot}°`
    svg += label(cx + dimLabR * Math.cos(midAngle), cy + dimLabR * Math.sin(midAngle), dimFont,
      isDimChordHere ? '#e0e0e0' : isDiatonicDim ? '#a78bfa' : '#6b7280',
      dimText, showDeg ? `${degreeOf(dimRoot).toLowerCase()}°` : null, '#818cf8')
  })

  svg += '</svg>'
  container.innerHTML = svg

  container.querySelectorAll<SVGPathElement>('[data-chord]').forEach(el => {
    el.addEventListener('click', () => onSegmentClick(el.dataset.chord!, el.dataset.key ?? null))
  })
}
