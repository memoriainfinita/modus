import { playNoteByName } from './audio'

// ─── Guitar voicings database ─────────────────────────────────────────────────

type GuitarDB = Record<string, Record<string, { frets: number[]; fingers?: number[]; baseFret?: number; barres?: any[] }[]>>
let guitarDB: GuitarDB | null = null
const CHORDS_DB_URL = 'https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@1.4.5/src/data/guitar.json'

export async function loadGuitarDB() {
  try {
    const res = await fetch(CHORDS_DB_URL)
    const data = await res.json()
    guitarDB = data.chords as GuitarDB
  } catch {
    console.warn('Could not load guitar chord database')
  }
}

const ROOT_MAP: Record<string, string> = {
  'C': 'C', 'C#': 'Csharp', 'Db': 'Db', 'D': 'D', 'D#': 'Dsharp',
  'Eb': 'Eb', 'E': 'E', 'F': 'F', 'F#': 'Fsharp', 'Gb': 'Gb',
  'G': 'G', 'G#': 'Gsharp', 'Ab': 'Ab', 'A': 'A', 'A#': 'Asharp',
  'Bb': 'Bb', 'B': 'B'
}

const QUALITY_MAP: Record<string, string> = {
  'major': 'major', 'minor': 'minor', 'dominant seventh': 'dominant7',
  'major seventh': 'major7', 'minor seventh': 'minor7',
  'diminished': 'dim', 'diminished seventh': 'dim7',
  'half-diminished seventh': 'm7b5', 'augmented': 'aug',
  'suspended fourth': 'sus4', 'suspended second': 'sus2',
  'major sixth': 'major6', 'minor sixth': 'minor6',
  'dominant ninth': 'dominant9', 'major ninth': 'major9', 'minor ninth': 'minor9',
}

let voicingIndexMap: Map<string, number> = new Map()

function getGuitarVoicings(chordSymbol: string): any[] {
  if (!guitarDB) return []
  try {
    const chord = UMT.parseChordSymbol(chordSymbol)
    const root = chord.root?.name ?? chord.root ?? ''
    const quality = chord.quality ?? 'major'
    const dbRoot = ROOT_MAP[root] ?? root
    const dbQuality = QUALITY_MAP[quality.toLowerCase()] ?? quality.toLowerCase()
    return guitarDB[dbRoot]?.[dbQuality] ?? []
  } catch { return [] }
}

export function nextGuitarVoicing(chordSymbol: string) {
  const idx = (voicingIndexMap.get(chordSymbol) ?? 0) + 1
  voicingIndexMap.set(chordSymbol, idx)
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export function renderStaff(container: HTMLElement, noteNames: string[]) {
  if (!noteNames.length) { container.innerHTML = ''; return }
  const abcNotes = noteNames.map(n => {
    const m = n.match(/^([A-G][b#]?)(-?\d+)$/)
    if (!m) return 'C'
    const name = m[1].replace('b', '_').replace('#', '^')
    const oct = parseInt(m[2])
    let abc = name
    if (oct >= 5) abc = name.toLowerCase() + "'".repeat(oct - 5)
    else if (oct === 4) abc = name
    else abc = name + ','.repeat(4 - oct)
    return abc
  })
  const abcStr = `X:1\nM:4/4\nL:1/4\nK:C\n[${abcNotes.join('')}]4`
  ABCJS.renderAbc(container, abcStr, { responsive: 'resize' })
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

  // Extend range if notes fall outside default C3-B4
  let rangeFrom = 'C3', rangeTo = 'B4'
  const octaves = noteNames.map(n => parseInt(n.match(/(-?\d+)$/)?.[1] ?? '4'))
  if (octaves.length) {
    const minOct = Math.min(...octaves)
    const maxOct = Math.max(...octaves)
    if (minOct < 3) rangeFrom = `C${minOct}`
    if (maxOct > 4) rangeTo = `B${maxOct}`
  }

  const svg = Notae.renderPiano({
    name: '', keys: noteNames, colors,
    range: { from: rangeFrom, to: rangeTo }
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

export function renderGuitar(container: HTMLElement, chordSymbol: string) {
  const voicings = getGuitarVoicings(chordSymbol)
  const idx = (voicingIndexMap.get(chordSymbol) ?? 0) % Math.max(voicings.length, 1)

  if (!voicings.length) {
    container.innerHTML = `<div class="no-voicing">${chordSymbol}<br><small>no voicing</small></div>`
    return
  }

  const v = voicings[idx]
  const svg = Notae.renderFretboard({
    name: chordSymbol,
    frets: v.frets,
    fingers: v.fingers,
    baseFret: v.baseFret ?? 1,
    barres: v.barres ?? [],
    tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
  })

  const wrap = document.createElement('div')
  wrap.innerHTML = svg

  const nextBtn = document.createElement('button')
  nextBtn.textContent = 'Next voicing ›'
  nextBtn.style.cssText = 'display:block;margin:4px auto;font-size:10px;padding:2px 8px;background:#374151;color:#9ca3af;border:none;border-radius:3px;cursor:pointer'
  nextBtn.addEventListener('click', () => {
    nextGuitarVoicing(chordSymbol)
    renderGuitar(container, chordSymbol)
  })
  if (voicings.length > 1) wrap.appendChild(nextBtn)

  container.innerHTML = ''
  container.appendChild(wrap)
}

// ─── Circle of fifths ─────────────────────────────────────────────────────────

const CIRCLE_KEYS = ['C','G','D','A','E','B','F#/Gb','Db','Ab','Eb','Bb','F']
const CIRCLE_KEYS_MINOR = ['Am','Em','Bm','F#m','C#m','G#m','D#m/Ebm','Bbm','Fm','Cm','Gm','Dm']

export function renderCircleOfFifths(
  container: HTMLElement,
  activeKey: string | null,
  chordRoot: string | null,
  onKeyClick: (key: string) => void
) {
  const size = 220
  const cx = size / 2, cy = size / 2
  const outerR = 95, innerR = 62, labelR = 80, minorR = 48

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
      font-size="10" fill="#e0e0e0" pointer-events="none">${key}</text>`

    const mKey = CIRCLE_KEYS_MINOR[i]
    const mx = cx + minorR * Math.cos(midAngle)
    const my = cy + minorR * Math.sin(midAngle)
    svg += `<text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="middle"
      font-size="8" fill="#9ca3af" pointer-events="none">${mKey}</text>`
  })

  svg += '</svg>'
  container.innerHTML = svg

  container.querySelectorAll<SVGPathElement>('[data-key]').forEach(el => {
    el.addEventListener('click', () => onKeyClick(el.dataset.key!))
  })
}
