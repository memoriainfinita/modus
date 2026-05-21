import { playNoteByName } from './audio'

// ─── Guitar voicings — via UMT.getFretboardVoicings (no external fetch needed) ─

// loadGuitarDB kept as no-op so app.ts callers don't need to change
export function loadGuitarDB(): Promise<void> { return Promise.resolve() }

// nextGuitarVoicing kept as no-op — voicings shown all at once now
export function nextGuitarVoicing(_chordSymbol: string) {}

// ─── Staff ────────────────────────────────────────────────────────────────────

function activeKeyToAbcKey(keyStr: string | null): string {
  if (!keyStr) return 'none'
  const [root, mode] = keyStr.split(' ')
  return root + (mode?.toLowerCase() === 'minor' ? 'm' : '')
}

export function renderStaff(container: HTMLElement, noteNames: string[], width = 380, keyStr: string | null = null) {
  const abcKey = activeKeyToAbcKey(keyStr)
  const header = `X:1\nM:none\nL:1\nK:${abcKey}\n`
  const opts = { staffwidth: width - 20, scale: 2 }
  if (!noteNames.length) {
    ABCJS.renderAbc(container, header + 'z', opts)
    return
  }
  const abcNotes = noteNames.map(n => {
    const m = n.match(/^([A-G][b#]?)(-?\d+)$/)
    if (!m) return 'C'
    const raw = m[1]
    const name = raw.endsWith('b') ? '_' + raw[0]
      : raw.endsWith('#') ? '^' + raw[0]
      : raw
    const oct = parseInt(m[2])
    let abc = name
    if (oct >= 5) abc = name.toLowerCase() + "'".repeat(oct - 5)
    else if (oct === 4) abc = name
    else abc = name + ','.repeat(4 - oct)
    return abc
  })
  ABCJS.renderAbc(container, header + `[${abcNotes.join('')}]1`, opts)
}

// ─── Full-neck horizontal fretboard ──────────────────────────────────────────

const OPEN_MIDI = [40, 45, 50, 55, 59, 64]  // E2 A2 D3 G3 B3 E4
const PITCH_FLAT_FB = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const NECK_FRETS = 12

function noteToMidi(note: string): number | null {
  const m = note.match(/^([A-G][b]?)(-?\d+)$/)
  if (!m) return null
  const idx = PITCH_FLAT_FB.indexOf(m[1])
  if (idx === -1) return null
  return (parseInt(m[2]) + 1) * 12 + idx
}

export function renderNeck(container: HTMLElement, noteNames: string[], root: string | null = null) {
  const midi = noteNames.map(noteToMidi).filter((n): n is number => n !== null)

  const frets = OPEN_MIDI.map(open => {
    const pos = midi.map(n => n - open).filter(f => f >= 0 && f <= NECK_FRETS)
    return pos.length ? pos : [null]
  })

  const style = {
    ...DARK_FRETBOARD_STYLE,
    numFrets: NECK_FRETS,
    dotColor: '#3b82f6',
    chordNameSize: 0,
    chordNameY: 4,
    chordNameGapH: 4,
    ...(root ? { showDegrees: true, dotRadius: 11, fingerNumberSize: 8 } : {}),
  }

  try {
    container.innerHTML = Notae.renderFretboard(
      { name: '', frets, tuning: ['E','A','D','G','B','E'], ...(root ? { root } : {}) } as any,
      { ...style, orientation: 'horizontal' }
    )
  } catch {
    container.innerHTML = ''
  }
}

// ─── Piano ────────────────────────────────────────────────────────────────────

const QUALITY_COLORS: Record<string, string> = {
  major: '#f59e0b', minor: '#3b82f6', 'dominant seventh': '#ef4444',
  'major seventh': '#f59e0b', 'minor seventh': '#3b82f6',
  diminished: '#7c3aed', 'diminished seventh': '#7c3aed',
  'half-diminished seventh': '#7c3aed', augmented: '#0d9488',
}

export function renderPiano(container: HTMLElement, noteNames: string[], quality: string) {
  const color = QUALITY_COLORS[quality?.toLowerCase()] ?? '#6b7280'
  const colors = noteNames.map(() => color)

  const svg = Notae.renderPiano({
    name: '', keys: noteNames, colors,
    range: { from: 'C2', to: 'B5' }
  })
  container.innerHTML = svg

  const keyEls = container.querySelectorAll<SVGElement>('[data-note]')
  if (keyEls.length > 0) {
    keyEls.forEach(el => {
      el.style.cursor = 'pointer'
      el.addEventListener('click', () => playNoteByName(el.dataset.note!))
    })
  }
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

const NOTE_SEMITONE: Record<string, number> = {
  C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11
}

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
let guitarLabelMode: 'none' | 'tuning' | 'notes' =
  (localStorage.getItem('guitar-label-mode') as any) || 'none'
let guitarTuningKey: 'standard' | 'dropD' | 'openG' | 'custom' =
  (localStorage.getItem('guitar-tuning') as any) || 'standard'
let guitarTunerExpanded = false
let guitarSpacing = parseInt(localStorage.getItem('guitar-spacing') ?? '19')

const GUITAR_TUNINGS: Record<string, { umt: () => any; notae: string[]; label: string }> = {
  standard: { umt: () => UMT.GUITAR_STANDARD,  notae: ['E','A','D','G','B','E'], label: 'Standard' },
  dropD:    { umt: () => UMT.GUITAR_DROPPED_D, notae: ['D','A','D','G','B','E'], label: 'Drop D'   },
  openG:    { umt: () => UMT.GUITAR_OPEN_G,    notae: ['D','G','D','G','B','D'], label: 'Open G'   },
}

function loadStringTuning(): string[] {
  try {
    const saved = localStorage.getItem('guitar-string-tuning')
    if (saved) { const v = JSON.parse(saved); if (Array.isArray(v) && v.length === 6) return v }
  } catch {}
  return [...(GUITAR_TUNINGS[guitarTuningKey]?.notae ?? ['E','A','D','G','B','E'])]
}

let guitarStringTuning: string[] = loadStringTuning()

function detectPreset(notes: string[]): string {
  const match = Object.entries(GUITAR_TUNINGS).find(([, t]) => t.notae.every((n, i) => n === notes[i]))
  return match ? match[0] : 'custom'
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

function guitarControls(total: number, idx: number): string {
  const b = 'border:1px solid #4a4a6a;border-radius:3px;cursor:pointer;font-size:11px;padding:1px 7px'
  const btn = (action: string, label: string, active: boolean) =>
    `<button class="guitar-ctrl" data-action="${action}" style="${b};background:${active ? '#4f46e5' : '#252540'};color:${active ? '#fff' : '#9ca3af'}">${label}</button>`
  const navB = `${b};font-size:13px;padding:0 6px;line-height:1.6`
  const nav = total > 1 ? `
    <button class="guitar-nav" data-dir="-1" style="${navB}">‹</button>
    <span style="font-size:10px;color:#6b7280">${idx + 1}/${total}</span>
    <button class="guitar-nav" data-dir="1" style="${navB}">›</button>` : ''
  const selStyle = 'background:#252540;color:#e0e0e0;border:1px solid #4a4a6a;border-radius:4px;padding:2px 4px;font-size:11px'
  const sizeB = `${b};padding:0 6px;line-height:1.6`
  const tunerRow = guitarTunerExpanded ? `
    <div style="display:flex;gap:4px;align-items:center;margin-top:5px;flex-wrap:wrap">
      ${guitarStringTuning.map((note, i) =>
        `<input class="guitar-string-input" data-string="${i}" value="${note}"
          style="width:28px;background:#1a1a2e;color:#e0e0e0;border:1px solid #4a4a6a;
                 border-radius:3px;font-size:11px;text-align:center;padding:2px 0" maxlength="2">`
      ).join('')}
    </div>` : ''
  return `
    <div style="margin-top:6px">
      <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
        ${btn('label-none',   'Off',    guitarLabelMode === 'none')}
        ${btn('label-tuning', 'Tuning', guitarLabelMode === 'tuning')}
        ${btn('label-notes',  'Notes',  guitarLabelMode === 'notes')}
        <select class="guitar-tuning-sel" style="${selStyle}">
          ${Object.entries(GUITAR_TUNINGS).map(([k, t]) =>
            `<option value="${k}" ${guitarTuningKey === k ? 'selected' : ''}>${t.label}</option>`
          ).join('')}
          <option value="custom" ${guitarTuningKey === 'custom' ? 'selected' : ''}>Custom</option>
        </select>
        ${btn('toggle-tuner', '✎', guitarTunerExpanded)}
        ${nav}
        <button class="guitar-ctrl" data-action="size-minus" style="${sizeB}">−</button>
        <button class="guitar-ctrl" data-action="size-plus"  style="${sizeB}">+</button>
      </div>
      ${tunerRow}
    </div>`
}

function wireGuitarControls(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('.guitar-ctrl').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action!
      if (action.startsWith('label-')) {
        guitarLabelMode = action.replace('label-', '') as any
        localStorage.setItem('guitar-label-mode', guitarLabelMode)
      } else if (action === 'toggle-tuner') {
        guitarTunerExpanded = !guitarTunerExpanded
      } else if (action === 'size-minus') {
        guitarSpacing = Math.max(12, guitarSpacing - 3)
        localStorage.setItem('guitar-spacing', String(guitarSpacing))
      } else if (action === 'size-plus') {
        guitarSpacing = Math.min(32, guitarSpacing + 3)
        localStorage.setItem('guitar-spacing', String(guitarSpacing))
      }
      renderGuitar(container, lastGuitarSymbol, lastNoteNames)
    })
  })

  const sel = container.querySelector<HTMLSelectElement>('.guitar-tuning-sel')
  if (sel) {
    sel.addEventListener('change', () => {
      const key = sel.value as any
      guitarTuningKey = key
      localStorage.setItem('guitar-tuning', key)
      if (key !== 'custom' && GUITAR_TUNINGS[key]) {
        guitarStringTuning = [...GUITAR_TUNINGS[key].notae]
        localStorage.setItem('guitar-string-tuning', JSON.stringify(guitarStringTuning))
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
      localStorage.setItem('guitar-string-tuning', JSON.stringify(guitarStringTuning))
      guitarTuningKey = detectPreset(guitarStringTuning) as any
      localStorage.setItem('guitar-tuning', guitarTuningKey)
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
        `<div style="opacity:0.35">${Notae.renderFretboard(ph as any, guitarStyle())}</div>` +
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
  let voicings: any[] = []
  try {
    const chord = UMT.parseChordSymbol(chordSymbol)
    voicings = UMT.getFretboardVoicings(chord, umtTuning) ?? []
  } catch { }

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

const CIRCLE_KEYS = ['C','G','D','A','E','B','F#/Gb','Db','Ab','Eb','Bb','F']
const CIRCLE_KEYS_MINOR = ['Am','Em','Bm','F#m','C#m','G#m','D#m/Ebm','Bbm','Fm','Cm','Gm','Dm']

export function renderCircleOfFifths(
  container: HTMLElement,
  activeKey: string | null,
  chordRoot: string | null,
  onKeyClick: (key: string) => void,
  size = 160
) {
  const cx = size / 2, cy = size / 2
  const outerR = size * 0.425
  const innerR = size * 0.275
  const labelR = size * 0.356
  const minorR = size * 0.206
  const majorFont = Math.max(7, Math.round(size * 0.0625))
  const minorFont = Math.max(5, Math.round(size * 0.05))

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">`

  CIRCLE_KEYS.forEach((key, i) => {
    const angle = (i * 30 - 90) * Math.PI / 180
    const nextAngle = ((i + 1) * 30 - 90) * Math.PI / 180
    const x1o = cx + outerR * Math.cos(angle), y1o = cy + outerR * Math.sin(angle)
    const x2o = cx + outerR * Math.cos(nextAngle), y2o = cy + outerR * Math.sin(nextAngle)
    const x1i = cx + innerR * Math.cos(angle), y1i = cy + innerR * Math.sin(angle)
    const x2i = cx + innerR * Math.cos(nextAngle), y2i = cy + innerR * Math.sin(nextAngle)

    const isActiveKey = activeKey?.startsWith(key.split('/')[0])
    const isChordRoot = chordRoot === key.split('/')[0]
    const fill = isActiveKey ? '#4f46e5' : isChordRoot ? '#0d9488' : '#2d2d44'
    const stroke = isChordRoot ? '#0d9488' : '#4a4a6a'

    const midAngle = (i * 30 + 15 - 90) * Math.PI / 180
    const lx = cx + labelR * Math.cos(midAngle)
    const ly = cy + labelR * Math.sin(midAngle)

    svg += `<path d="M${x1i},${y1i} L${x1o},${y1o} A${outerR},${outerR} 0 0,1 ${x2o},${y2o} L${x2i},${y2i} A${innerR},${innerR} 0 0,0 ${x1i},${y1i}"
      fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor:pointer"
      data-key="${key.split('/')[0]} Major" />`
    svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
      font-size="${majorFont}" fill="#e0e0e0" pointer-events="none">${key}</text>`

    const mKey = CIRCLE_KEYS_MINOR[i]
    const mx = cx + minorR * Math.cos(midAngle)
    const my = cy + minorR * Math.sin(midAngle)
    svg += `<text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="middle"
      font-size="${minorFont}" fill="#9ca3af" pointer-events="none">${mKey}</text>`
  })

  svg += '</svg>'
  container.innerHTML = svg

  container.querySelectorAll<SVGPathElement>('[data-key]').forEach(el => {
    el.addEventListener('click', () => onKeyClick(el.dataset.key!))
  })
}
