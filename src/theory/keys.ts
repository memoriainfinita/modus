// Key names as the key selector offers them, and their signatures.
// Keys are strings like "C Major" / "F# Minor" (the format UMT uses). The signature is
// read from UMT's scale spelling, which names each degree on its own letter.

import { NOTE_SEMITONE } from './notes'

/** Major-key root per pitch class, as the key selector offers it. */
export const MAJOR_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
/** Minor-key root per pitch class: the spelling with a standard signature (C# minor, not Db minor). */
export const MINOR_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

/** Every selectable key, major then minor per pitch class. */
export const ALL_KEYS: string[] = MAJOR_ROOTS.flatMap((root, pc) => [`${root} Major`, `${MINOR_ROOTS[pc]} Minor`])

function parseKey(key: string): { pc: number; minor: boolean } | null {
  const [root, mode] = key.split(' ')
  const pc = NOTE_SEMITONE[root]
  if (pc === undefined) return null
  return { pc, minor: mode?.toLowerCase() === 'minor' }
}

function keyName(pc: number, minor: boolean): string {
  const p = ((pc % 12) + 12) % 12
  return minor ? `${MINOR_ROOTS[p]} Minor` : `${MAJOR_ROOTS[p]} Major`
}

/** The selector's spelling of a key ("Db Minor" → "C# Minor"), or null when unknown. */
export function normalizeKey(key: string | null | undefined): string | null {
  const k = key ? parseKey(key) : null
  return k ? keyName(k.pc, k.minor) : null
}

/** Transposes a key like "C Major", spelling the new root as the key selector does. */
export function transposeKey(key: string, semitones: number): string {
  const k = parseKey(key)
  return k ? keyName(k.pc + semitones, k.minor) : key
}

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
  const [root, mode] = name.split(' ')
  return { abcKey: root + (mode === 'Minor' ? 'm' : ''), accidentals }
}

/** True when the key signature uses sharps — the spelling to prefer for chords in that key. */
export function keyPrefersSharps(key: string | null | undefined): boolean {
  return Object.values(keySignature(key ?? null).accidentals).includes('#')
}
