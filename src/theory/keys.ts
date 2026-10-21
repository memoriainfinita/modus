// Key names as the key selector offers them, and their signatures.
// Keys are strings like "C Major" / "F# Minor" / "D Dorian" (the format UMT uses). The
// signature is read from UMT's scale spelling, which names each degree on its own letter.

import { pitchClassOf } from './notes'

/** The modes a key can be in: major and minor, and the church modes as tonalities (UMT 0.9). */
export const KEY_MODES = ['Major', 'Minor', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian'] as const
export type KeyMode = typeof KEY_MODES[number]
/** The church modes, as the key menu lists them under major and minor. */
export const CHURCH_MODES: readonly KeyMode[] = ['Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian']

/** Major-key root per pitch class, as the key selector offers it. */
export const MAJOR_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
/** Minor-key root per pitch class: the spelling with a standard signature (C# minor, not Db minor). */
export const MINOR_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

// A church mode is a degree of a major scale: its tonic lies this many semitones above the major's
const DEGREE_OF: Record<KeyMode, { semitones: number; degree: number }> = {
  Major: { semitones: 0, degree: 0 }, Minor: { semitones: 9, degree: 5 }, Dorian: { semitones: 2, degree: 1 },
  Phrygian: { semitones: 4, degree: 2 }, Lydian: { semitones: 5, degree: 3 }, Mixolydian: { semitones: 7, degree: 4 },
  Locrian: { semitones: 11, degree: 6 },
}

/** Every selectable key: per pitch class, major, minor and the church modes. */
export const ALL_KEYS: string[] = MAJOR_ROOTS.flatMap((_, pc) => KEY_MODES.map(m => keyName(pc, m)))

function parseKey(key: string): { pc: number; mode: KeyMode } | null {
  const [root, raw] = key.split(' ')
  const pc = pitchClassOf(root ?? '')
  const mode = KEY_MODES.find(m => m.toLowerCase() === (raw ?? 'major').toLowerCase())
  if (pc === -1 || !mode) return null
  return { pc, mode }
}

/**
 * The key's name with its tonic spelled as the selector writes it: majors and minors with a
 * standard signature; a church mode's tonic as the degree of its parent major (D Dorian is
 * C major's second degree; C# Dorian, B major's, not Db Dorian).
 */
function keyName(pc: number, mode: KeyMode): string {
  const p = ((pc % 12) + 12) % 12
  if (mode === 'Major') return `${MAJOR_ROOTS[p]} Major`
  if (mode === 'Minor') return `${MINOR_ROOTS[p]} Minor`
  const { semitones, degree } = DEGREE_OF[mode]
  const parent = MAJOR_ROOTS[(p - semitones + 12) % 12]
  let root = MAJOR_ROOTS[p]
  try { root = UMT.parseScaleSymbol(`${parent} Major`).getNotes()[degree].name.replace(/-?\d+$/, '') } catch { }
  return `${root} ${mode}`
}

/** The key in `mode` whose signature is that of the major on `parentPc`: C (0) → D Dorian, A Minor, B Locrian. */
export function keyOnParent(parentPc: number, mode: KeyMode): string {
  return keyName(parentPc + DEGREE_OF[mode].semitones, mode)
}

/** The pitch class of the major scale a key shares its notes with (D Dorian → C, 0); -1 when unknown. */
export function parentMajorPc(key: string | null | undefined): number {
  const k = key ? parseKey(key) : null
  return k ? (k.pc - DEGREE_OF[k.mode].semitones + 12) % 12 : -1
}

/** The mode of a key ("D Dorian" → Dorian), or null when unknown. */
export function keyMode(key: string | null | undefined): KeyMode | null {
  return key ? parseKey(key)?.mode ?? null : null
}

/** A minor third over the tonic (minor, dorian, phrygian, locrian): where minor-key material belongs. */
export function isMinorKey(key: string | null | undefined): boolean {
  const m = keyMode(key)
  return m === 'Minor' || m === 'Dorian' || m === 'Phrygian' || m === 'Locrian'
}

/** A leading tone a semitone under the tonic (major, lydian); the others have a subtonic. */
export function hasLeadingTone(key: string | null | undefined): boolean {
  const m = keyMode(key)
  return m === 'Major' || m === 'Lydian'
}

/** The selector's spelling of a key ("Db Minor" → "C# Minor"), or null when unknown. */
export function normalizeKey(key: string | null | undefined): string | null {
  const k = key ? parseKey(key) : null
  return k ? keyName(k.pc, k.mode) : null
}

/** Transposes a key like "C Major", spelling the new root as the key selector does. */
export function transposeKey(key: string, semitones: number): string {
  const k = parseKey(key)
  return k ? keyName(k.pc + semitones, k.mode) : key
}

const ABC_MODE: Record<KeyMode, string> = { Major: '', Minor: 'm', Dorian: 'dor', Phrygian: 'phr', Lydian: 'lyd', Mixolydian: 'mix', Locrian: 'loc' }

/** ABC K: field and the accidental the signature applies to each letter. */
export function keySignature(key: string | null): { abcKey: string; accidentals: Record<string, '#' | 'b'> } {
  const name = normalizeKey(key)
  let degrees: string[] = []
  try { degrees = name ? UMT.parseScaleSymbol(name).getNotes().slice(0, 7).map(n => n.name) : [] } catch { }
  if (!name || degrees.length !== 7) return { abcKey: 'none', accidentals: {} }
  const accidentals: Record<string, '#' | 'b'> = {}
  for (const n of degrees) {
    const m = n.match(/^([A-G])([#b])/)
    if (m) accidentals[m[1]] = m[2] as '#' | 'b'
  }
  const [root] = name.split(' ')
  return { abcKey: root + ABC_MODE[keyMode(name)!], accidentals }
}

/** True when the key signature uses sharps — the spelling to prefer for chords in that key. */
export function keyPrefersSharps(key: string | null | undefined): boolean {
  return Object.values(keySignature(key ?? null).accidentals).includes('#')
}
