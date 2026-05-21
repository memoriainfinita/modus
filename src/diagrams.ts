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

export function renderNeck(container: HTMLElement, noteNames: string[]) {
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

export function renderGuitar(container: HTMLElement, chordSymbol: string | null) {
  if (!chordSymbol) {
    try {
      container.innerHTML = `<div style="opacity:0.35">${Notae.renderFretboard(EMPTY_FRETBOARD as any, DARK_FRETBOARD_STYLE)}</div>`
    } catch {
      container.innerHTML = ''
    }
    return
  }

  let voicings: any[] = []
  try {
    const chord = UMT.parseChordSymbol(chordSymbol)
    voicings = UMT.getFretboardVoicings(chord, UMT.GUITAR_STANDARD) ?? []
  } catch { }

  if (!voicings.length) {
    container.innerHTML = '<div class="no-voicing">No voicings</div>'
    return
  }

  const svgs = voicings.slice(0, 3).map(v => {
    try { return `<div>${Notae.renderFretboard({ name: chordSymbol, ...v }, DARK_FRETBOARD_STYLE)}</div>` }
    catch { return '' }
  }).join('')

  container.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:nowrap;align-items:flex-start">${svgs}</div>`
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
