// The scale the strings panel and the piano draw: the analysis key's own, or another on its
// tonic, and its positions on a fretted instrument. UMT spells the scale and finds the
// positions; here they are only named and labelled.

import { tryUMT } from './chord'
import { keyMode, isMinorKey } from './keys'
import { pitchClassOf } from './notes'

/** Which scale on the key's tonic: the key's own, or one of those usually played over it. */
export const SCALE_CHOICES = ['key', 'pentatonic', 'blues', 'harmonicMinor', 'melodicMinor'] as const
export type ScaleChoice = typeof SCALE_CHOICES[number]

/** How the scale is laid on the neck: all of it (frets 0–12), CAGED shapes or three notes per string. */
export const SCALE_SYSTEMS = ['neck', 'caged', '3nps'] as const
export type ScaleSystem = typeof SCALE_SYSTEMS[number]

/** UMT's scale symbol for a choice in a key: "A Minor" + pentatonic → "A Pentatonic Minor". */
export function scaleSymbol(key: string, choice: ScaleChoice): string | null {
  const [tonic] = key.split(' ')
  if (!keyMode(key) || pitchClassOf(tonic) < 0) return null
  const minor = isMinorKey(key)
  switch (choice) {
    case 'key': return key
    case 'pentatonic': return `${tonic} Pentatonic ${minor ? 'Minor' : 'Major'}`
    case 'blues': return minor ? `${tonic} Blues` : `${tonic} Blues Major`
    case 'harmonicMinor': return `${tonic} Harmonic Minor`
    case 'melodicMinor': return `${tonic} Melodic Minor`
  }
}

export type ScaleInfo = {
  scale: any
  /** The degrees' names without octave, as UMT spells them ("A B C D E F G"). */
  names: string[]
  /** Each degree as an interval over the tonic, read from its letter: 1 2 ♭3 4 5 ♭6 ♭7. */
  degreeLabels: string[]
  pitchClasses: number[]
}

const LETTERS = 'CDEFGAB'
const MAJOR_SEMITONES = [0, 2, 4, 5, 7, 9, 11]

/** "♭3", "♯4", "5": the letter's distance from the tonic, and how far it lies from the major scale's. */
function intervalLabel(tonic: string, name: string): string {
  const steps = (LETTERS.indexOf(name[0]) - LETTERS.indexOf(tonic[0]) + 7) % 7
  const semis = (pitchClassOf(name) - pitchClassOf(tonic) + 12) % 12
  let alter = semis - MAJOR_SEMITONES[steps]
  if (alter > 6) alter -= 12
  if (alter < -6) alter += 12
  const acc = alter > 0 ? '♯'.repeat(alter) : '♭'.repeat(-alter)
  return `${acc}${steps + 1}`
}

/** The scale parsed and named, or null when UMT does not know the symbol. */
export function scaleInfo(symbol: string | null): ScaleInfo | null {
  if (!symbol) return null
  const scale = tryUMT('scale', () => UMT.parseScaleSymbol(symbol), null)
  if (!scale) return null
  const notes: string[] = tryUMT('scale notes', () => scale.getNotes().map((n: { name: string }) => n.name.replace(/-?\d+$/, '')), [])
  // getNotes ends on the octave of the tonic
  const names = notes.length > 1 && notes[notes.length - 1] === notes[0] ? notes.slice(0, -1) : notes
  if (!names.length) return null
  return {
    scale,
    names,
    degreeLabels: names.map(n => intervalLabel(names[0], n)),
    pitchClasses: names.map(pitchClassOf),
  }
}

/** One position to draw: frets and degrees per string, lowest string first, as UMT gives them. */
export type ScalePosition = {
  /** UMT's name ("E shape", "Em shape", "Pattern 3"); '' for the whole neck. */
  name: string
  frets: number[][]
  degrees: number[][]
  baseFret: number
  span: number
}

/** Three notes per string only for a scale of seven notes or more: a pentatonic's patterns span more frets than a hand. */
export function systemsFor(info: ScaleInfo, open: number[]): ScaleSystem[] {
  return SCALE_SYSTEMS.filter(s => s === 'neck' || (s === '3nps' ? info.names.length >= 7 : scalePositions(info, open, s).length > 0))
}

/** The positions of a system: the whole neck is one; CAGED is [] off a 6-string guitar in standard tuning. */
export function scalePositions(info: ScaleInfo, open: number[], system: ScaleSystem, maxFret = 12): ScalePosition[] {
  const tuning = open.map(m => m - 69)
  if (system === 'neck') {
    const map = tryUMT('fretboard scale', () => UMT.getFretboardScale(info.scale, tuning, { maxFret }), null)
    return map ? [{ name: '', frets: map.frets, degrees: map.degrees, baseFret: 1, span: maxFret }] : []
  }
  return tryUMT('fretboard scale shapes', () => UMT.getFretboardScaleShapes(info.scale, tuning, { system }), [])
    .map(s => ({ name: s.name, frets: s.frets, degrees: s.degrees, baseFret: s.baseFret, span: s.span }))
}

/** The whole neck cut into windows of `size` frets (0–4 with the open strings, 5–8, 9–12), for a panel too narrow to read it at once. */
export function neckWindows(whole: ScalePosition, size = 4): ScalePosition[] {
  const windows: ScalePosition[] = []
  for (let base = 1; base <= whole.span; base += size) {
    const top = Math.min(base + size - 1, whole.span)
    const inside = (f: number) => f >= (base === 1 ? 0 : base) && f <= top
    windows.push({
      name: '',
      frets: whole.frets.map(fs => fs.filter(inside)),
      degrees: whole.degrees.map((ds, i) => ds.filter((_, k) => inside(whole.frets[i][k]))),
      baseFret: base,
      span: top - base + 1,
    })
  }
  return windows
}

/** UMT's shape name in parts: "Em shape" → CAGED letter Em; "Pattern 3" → pattern 3. */
export function shapeName(name: string): { caged: string } | { pattern: number } | null {
  const c = name.match(/^([CAGED]m?) shape$/)
  if (c) return { caged: c[1] }
  const p = name.match(/^Pattern (\d+)$/)
  return p ? { pattern: parseInt(p[1]) } : null
}
