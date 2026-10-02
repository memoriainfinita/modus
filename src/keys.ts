// Key names as the key selector offers them, and their signatures.
// Keys are strings like "C Major" / "F# Minor" (the format UMT uses).

/** Root spelling per pitch class, matching the key selector. */
export const KEY_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

// Signature as a count: positive = sharps, negative = flats.
const MAJOR_KEY_SIG: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
}
const MINOR_KEY_SIG: Record<string, number> = {
  A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, 'A#': 7,
  D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6, Ab: -7,
}
// Keys with no standard signature (Db minor = 8 flats) are written as their enharmonic.
const MINOR_ENHARMONIC: Record<string, string> = { Db: 'C#', Gb: 'F#' }
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_ORDER  = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

function parseKey(key: string): { root: string; minor: boolean } {
  const [root, mode] = key.split(' ')
  return { root, minor: mode?.toLowerCase() === 'minor' }
}

/** Written root and signature count (+sharps / −flats), or null for an unknown key. */
function signatureOf(key: string): { root: string; minor: boolean; count: number } | null {
  let { root, minor } = parseKey(key)
  if (minor && MINOR_ENHARMONIC[root]) root = MINOR_ENHARMONIC[root]
  const count = (minor ? MINOR_KEY_SIG : MAJOR_KEY_SIG)[root]
  return count === undefined ? null : { root, minor, count }
}

/** True when the key signature uses sharps — the spelling to prefer for chords in that key. */
export function keyPrefersSharps(key: string | null | undefined): boolean {
  return key ? (signatureOf(key)?.count ?? 0) > 0 : false
}

/** ABC K: field and the accidental the signature applies to each letter. */
export function keySignature(key: string | null): { abcKey: string; accidentals: Record<string, '#' | 'b'> } {
  const sig = key ? signatureOf(key) : null
  if (!sig) return { abcKey: 'none', accidentals: {} }
  const accidentals: Record<string, '#' | 'b'> = {}
  if (sig.count > 0) SHARP_ORDER.slice(0, sig.count).forEach(l => { accidentals[l] = '#' })
  else FLAT_ORDER.slice(0, -sig.count).forEach(l => { accidentals[l] = 'b' })
  return { abcKey: sig.root + (sig.minor ? 'm' : ''), accidentals }
}
