import { playNoteByName, playChord } from './audio'
import { NOTE_SEMITONE, noteNameToMidi } from './midi'
import { chordColor, NEUTRAL_COLOR, tryParseChord, tryUMT } from './chord'
import { keySignature } from './keys'
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

export function renderStaff(container: HTMLElement, noteNames: string[], width = 380, keyStr: string | null = null) {
  ABCJS.renderAbc(container, buildStaffAbc(noteNames, keyStr), { staffwidth: width - 20, scale: 2 })
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

function deriveVoicingFromNotes(noteNames: string[], tuning: string[]): { frets: (number|null)[], baseFret: number } {
  const activeClasses = new Set(
    noteNames.map(n => NOTE_SEMITONE[n.match(/^([A-G][b#]?)/)?.[1] ?? ''] ?? -1).filter(n => n >= 0)
  )
  if (!activeClasses.size) return { frets: tuning.map(() => null), baseFret: 1 }

  const frets = tuning.map(open => {
    const base = NOTE_SEMITONE[open] ?? 0
    for (let f = 0; f <= 12; f++) { if (activeClasses.has((base + f) % 12)) return f }
    return null
  })
  const nonOpen = frets.filter((f): f is number => f !== null && f > 0)
  const baseFret = nonOpen.length ? Math.min(...nonOpen) : 1
  return { frets, baseFret }
}

let guitarVoicingIdx = 0
let lastGuitarSymbol: string | null = null
let lastNoteNames: string[] = []
let guitarLabelMode = loadChoice('guitar-label-mode', ['none', 'tuning', 'notes'] as const, 'none')
type GuitarTuningKey = 'standard' | 'dropD' | 'openG' | 'custom'
let guitarTuningKey = loadChoice<GuitarTuningKey>('guitar-tuning', ['standard', 'dropD', 'openG', 'custom'], 'standard')
let guitarTunerExpanded = false
let guitarSpacing = loadNumber('guitar-spacing', 19, 12, 32)

const GUITAR_TUNINGS: Record<string, { umt: () => any; notae: string[]; label: string }> = {
  standard: { umt: () => UMT.GUITAR_STANDARD,  notae: ['E','A','D','G','B','E'], label: 'Standard' },
  dropD:    { umt: () => UMT.GUITAR_DROPPED_D, notae: ['D','A','D','G','B','E'], label: 'Drop D'   },
  openG:    { umt: () => UMT.GUITAR_OPEN_G,    notae: ['D','G','D','G','B','D'], label: 'Open G'   },
}

function loadStringTuning(): string[] {
  const saved = loadJSON<unknown>('guitar-string-tuning', null)
  if (Array.isArray(saved) && saved.length === 6 && saved.every(n => typeof n === 'string')) return saved
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
      const val = input.value.trim()
      if (!val) return
      guitarStringTuning[parseInt(input.dataset.string!)] = val
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

  // Custom tuning: derive fret positions directly from active notes
  if (guitarTuningKey === 'custom') {
    const { frets, baseFret } = deriveVoicingFromNotes(noteNames, guitarStringTuning)
    let svg = ''
    try {
      svg = Notae.renderFretboard(
        { name: chordSymbol, frets, tuning: guitarStringTuning, baseFret } as any,
        guitarStyle()
      )
    } catch { }
    container.innerHTML = `<div>${svg}</div>` + guitarControls(0, 0)
    wireGuitarControls(container)
    return
  }

  // Preset tuning: use UMT voicings
  const umtTuning = GUITAR_TUNINGS[guitarTuningKey].umt()
  const chord = tryParseChord(chordSymbol)
  const voicings: any[] = chord ? tryUMT('fretboard voicings', () => UMT.getFretboardVoicings(chord, umtTuning) ?? [], []) : []

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
const CIRCLE_KEYS_MINOR_SHARP = ['Am','Em','Bm','F#m','C#m','G#m','D#m','Bbm','Fm','Cm','Gm','Dm']
const CIRCLE_DIM = ['B°','F#°','C#°','G#°','D#°','A#°','F°','C°','G°','D°','A°','E°']
const COF_DEGREES       = ['I','V','II','VI','III','VII','♭V','♭II','♭VI','♭III','♭VII','IV']
const COF_DEGREES_MINOR = ['vi','iii','vii','♯iv','♭ii','♭vi','♭iii','♭vii','iv','i','v','ii']

export function renderCircleOfFifths(
  container: HTMLElement,
  activeKey: string | null,
  activeChord: string | null,
  onKeyClick: (key: string | null, chord?: string) => void,
  size = 160,
  opts: { accidental: 'sharp' | 'flat', showMinor: boolean, showDegrees: boolean, show7ths: boolean, fontScale?: number } = { accidental: 'flat', showMinor: true, showDegrees: false, show7ths: false }
) {
  const keys = opts.accidental === 'sharp' ? CIRCLE_KEYS_SHARP : CIRCLE_KEYS_FLAT
  const minorKeys = opts.accidental === 'sharp' ? CIRCLE_KEYS_MINOR_SHARP : CIRCLE_KEYS_MINOR_FLAT

  const activeRoot = activeKey?.split(' ')[0] ?? null
  const activePos = activeRoot !== null ? keys.findIndex(k => k === activeRoot) : -1

  const activeChordRoot = activeChord?.match(/^([A-G][b#]?)/)?.[1] ?? null
  const isMinorActiveChord = activeChord ? /^[A-G][b#]?m(?!aj)/.test(activeChord) : false

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

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">`

  const diatonicPos = activePos !== -1
    ? new Set([(activePos + 11) % 12, activePos, (activePos + 1) % 12])
    : new Set<number>()
  const diatonicDimPos = activePos

  keys.forEach((key, i) => {
    const angle = (i * 30 - 90) * Math.PI / 180
    const nextAngle = ((i + 1) * 30 - 90) * Math.PI / 180
    const x1o = cx + outerR * Math.cos(angle), y1o = cy + outerR * Math.sin(angle)
    const x2o = cx + outerR * Math.cos(nextAngle), y2o = cy + outerR * Math.sin(nextAngle)
    const x1i = cx + innerR * Math.cos(angle), y1i = cy + innerR * Math.sin(angle)
    const x2i = cx + innerR * Math.cos(nextAngle), y2i = cy + innerR * Math.sin(nextAngle)

    const isActiveKey = activeRoot && key === activeRoot
    const isChordRoot = !isMinorActiveChord && activeChordRoot === key
    const minorKeyRoot = minorKeys[i].match(/^([A-G][b#]?)/)?.[1] ?? ''
    const isMinorChordHere = isMinorActiveChord && activeChordRoot === minorKeyRoot
    const isDiatonic = diatonicPos.has(i)
    const fill = isActiveKey ? '#4f46e5' : isChordRoot ? '#0d9488' : isDiatonic ? '#252550' : '#2d2d44'
    const stroke = isChordRoot ? '#0d9488' : isDiatonic ? '#7c7ca0' : '#4a4a6a'

    const midAngle = (i * 30 + 15 - 90) * Math.PI / 180
    const lx = cx + labelR * Math.cos(midAngle)
    const ly = cy + labelR * Math.sin(midAngle)

    const degree = opts.showDegrees && activePos !== -1
      ? COF_DEGREES[(i - activePos + 12) % 12]
      : null

    const relPos = activePos !== -1 ? (i - activePos + 12) % 12 : -1
    const suffix7 = opts.show7ths ? (relPos === 1 ? '7' : 'maj7') : ''
    const keyLabel = key + suffix7

    svg += `<path d="M${x1i},${y1i} L${x1o},${y1o} A${outerR},${outerR} 0 0,1 ${x2o},${y2o} L${x2i},${y2i} A${innerR},${innerR} 0 0,0 ${x1i},${y1i}"
      fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor:pointer"
      data-key="${key} Major" data-chord="${key + suffix7}" />`
    if (degree) {
      svg += `<text x="${lx}" y="${ly - majorFont * 0.45}" text-anchor="middle" dominant-baseline="middle"
        font-size="${majorFont}" fill="#e0e0e0" pointer-events="none">${keyLabel}</text>`
      svg += `<text x="${lx}" y="${ly + majorFont * 0.7}" text-anchor="middle" dominant-baseline="middle"
        font-size="${majorFont * 0.85}" fill="#a5b4fc" pointer-events="none">${degree}</text>`
    } else {
      svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
        font-size="${majorFont}" fill="#e0e0e0" pointer-events="none">${keyLabel}</text>`
    }

    if (opts.showMinor) {
      const mx = cx + minorR * Math.cos(midAngle)
      const my = cy + minorR * Math.sin(midAngle)
      const minorLabel = minorKeys[i] + (opts.show7ths ? '7' : '')
      const minorDegree = opts.showDegrees && activePos !== -1
        ? COF_DEGREES_MINOR[(i - activePos + 12) % 12]
        : null

      // Minor ring path segment
      const mx1o = cx + minorOutR * Math.cos(angle),    my1o = cy + minorOutR * Math.sin(angle)
      const mx2o = cx + minorOutR * Math.cos(nextAngle), my2o = cy + minorOutR * Math.sin(nextAngle)
      const mx1i = cx + minorInR  * Math.cos(angle),    my1i = cy + minorInR  * Math.sin(angle)
      const mx2i = cx + minorInR  * Math.cos(nextAngle), my2i = cy + minorInR  * Math.sin(nextAngle)
      const minorSegFill   = isMinorChordHere ? '#0d9488' : isDiatonic ? '#252550' : 'transparent'
      const minorSegStroke = isMinorChordHere ? '#0d9488' : isDiatonic ? '#7c7ca0' : 'transparent'
      const minorChordSym = minorKeys[i] + (opts.show7ths ? '7' : '')
      svg += `<path d="M${mx1i},${my1i} L${mx1o},${my1o} A${minorOutR},${minorOutR} 0 0,1 ${mx2o},${my2o} L${mx2i},${my2i} A${minorInR},${minorInR} 0 0,0 ${mx1i},${my1i}"
        fill="${minorSegFill}" stroke="${minorSegStroke}" stroke-width="1"
        pointer-events="all" style="cursor:pointer" data-minor-chord="${minorChordSym}"/>`

      const minorFill = isMinorChordHere ? '#e0e0e0' : isDiatonic ? '#c4b5fd' : '#9ca3af'
      if (minorDegree) {
        svg += `<text x="${mx}" y="${my - minorFont * 0.55}" text-anchor="middle" dominant-baseline="middle"
          font-size="${minorFont}" fill="${minorFill}" pointer-events="none">${minorLabel}</text>`
        svg += `<text x="${mx}" y="${my + minorFont * 0.75}" text-anchor="middle" dominant-baseline="middle"
          font-size="${minorFont * 0.85}" fill="#818cf8" pointer-events="none">${minorDegree}</text>`
      } else {
        svg += `<text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="middle"
          font-size="${minorFont}" fill="${minorFill}" pointer-events="none">${minorLabel}</text>`
      }

      // Diminished inner ring
      const da = angle, dna = nextAngle
      const dx1o = cx + dimOutR * Math.cos(da),  dy1o = cy + dimOutR * Math.sin(da)
      const dx2o = cx + dimOutR * Math.cos(dna), dy2o = cy + dimOutR * Math.sin(dna)
      const dx1i = cx + dimInR  * Math.cos(da),  dy1i = cy + dimInR  * Math.sin(da)
      const dx2i = cx + dimInR  * Math.cos(dna), dy2i = cy + dimInR  * Math.sin(dna)
      const isDiatonicDim = i === diatonicDimPos
      const dimRoot = CIRCLE_DIM[i].replace('°', '')
      const dimChordSym = `${dimRoot}${opts.show7ths ? 'm7b5' : 'dim'}`
      svg += `<path d="M${dx1i},${dy1i} L${dx1o},${dy1o} A${dimOutR},${dimOutR} 0 0,1 ${dx2o},${dy2o} L${dx2i},${dy2i} A${dimInR},${dimInR} 0 0,0 ${dx1i},${dy1i}"
        fill="${isDiatonicDim ? '#2a2a5a' : '#1e1e35'}" stroke="${isDiatonicDim ? '#a0a0d8' : '#3a3a5c'}" stroke-width="${isDiatonicDim ? 1.5 : 1}"
        pointer-events="all" style="cursor:pointer" data-dim-chord="${dimChordSym}"/>`
      const dlx = cx + dimLabR * Math.cos(midAngle)
      const dly = cy + dimLabR * Math.sin(midAngle)
      const dimChord = opts.show7ths ? CIRCLE_DIM[i].replace('°', 'ø7') : CIRCLE_DIM[i]
      const dimTextFill = isDiatonicDim ? '#a78bfa' : '#6b7280'
      if (opts.showDegrees && activePos !== -1) {
        svg += `<text x="${dlx}" y="${dly - dimFont * 0.55}" text-anchor="middle" dominant-baseline="middle"
          font-size="${dimFont}" fill="${dimTextFill}" pointer-events="none">${dimChord}</text>`
        svg += `<text x="${dlx}" y="${dly + dimFont * 0.75}" text-anchor="middle" dominant-baseline="middle"
          font-size="${dimFont * 0.85}" fill="#818cf8" pointer-events="none">vii°</text>`
      } else {
        svg += `<text x="${dlx}" y="${dly}" text-anchor="middle" dominant-baseline="middle"
          font-size="${dimFont}" fill="${dimTextFill}" pointer-events="none">${dimChord}</text>`
      }
    }
  })

  svg += '</svg>'
  container.innerHTML = svg

  container.querySelectorAll<SVGPathElement>('[data-key]').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.chord) playChord(el.dataset.chord)
      onKeyClick(el.dataset.key!, el.dataset.chord)
    })
  })
  container.querySelectorAll<SVGPathElement>('[data-minor-chord]').forEach(el => {
    el.addEventListener('click', () => {
      playChord(el.dataset.minorChord!)
      onKeyClick(null, el.dataset.minorChord)
    })
  })
  container.querySelectorAll<SVGPathElement>('[data-dim-chord]').forEach(el => {
    el.addEventListener('click', () => {
      playChord(el.dataset.dimChord!)
      onKeyClick(null, el.dataset.dimChord)
    })
  })
}
