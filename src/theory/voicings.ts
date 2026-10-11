// Picks the playable voicings out of everything UMT finds, on any fretted instrument. UMT
// returns every fingering that covers the chord's notes within a stretch (hundreds per chord
// on a guitar); this keeps the ones a player would actually use and orders them along the neck.

import { pitchClassOf } from './notes'
import { isReentrant } from './instruments'

export interface Voicing {
  frets: number[]   // per string low→high: -1 muted, 0 open, n fretted
  baseFret: number
  [extra: string]: unknown
}

/** Open-string MIDI notes of standard guitar tuning, low→high. */
export const STANDARD_OPEN_MIDI = [40, 45, 50, 55, 59, 64]

const MAX_SPAN = 3       // highest minus lowest fretted fret: a four-fret hand
const MIN_STRINGS = 4
const MAX_FRET_WITH_OPEN = 4   // open strings ring alongside first-position shapes only

/**
 * Open-string MIDI notes for note names like ['D','A','D','G','B','E']. Each string takes
 * the octave closest to the same string in `reference` (standard guitar by default), so a
 * ukulele's high G stays high. Null if a name is not a note or the counts differ.
 */
export function tuningToMidi(names: string[], reference: readonly number[] = STANDARD_OPEN_MIDI): number[] | null {
  if (names.length !== reference.length) return null
  const midi: number[] = []
  for (let i = 0; i < names.length; i++) {
    const pc = pitchClassOf(normalizeNoteName(names[i]) ?? '')
    if (pc === -1) return null
    const ref = reference[i]
    const below = ref - ((ref - pc) % 12 + 12) % 12
    midi.push(ref - below <= 6 ? below : below + 12)
  }
  return midi
}

/** "f#" → "F#", "bb" → "Bb"; null when it is not a note name. */
export function normalizeNoteName(name: string): string | null {
  const m = name.trim().match(/^([a-gA-G])([#b]?)$/)
  return m ? m[1].toUpperCase() + m[2] : null
}

function isPlayable(v: Voicing, openMidi: number[], bassPc: number): boolean {
  const sounding = v.frets.map((f, i) => (f >= 0 ? i : -1)).filter(i => i >= 0)
  // Four strings at least; on a four-string instrument, three
  if (sounding.length < Math.min(MIN_STRINGS, openMidi.length - 1)) return false
  // No muted string between two sounding ones.
  if (sounding[sounding.length - 1] - sounding[0] + 1 !== sounding.length) return false
  // The lowest note is the chord's bass (root, or the slash note). A reentrant tuning
  // (ukulele) plays its chords in any inversion: no bass to ask for.
  if (!isReentrant(openMidi)) {
    const lowest = Math.min(...sounding.map(i => openMidi[i] + v.frets[i]))
    if (lowest % 12 !== bassPc) return false
  }
  const fretted = v.frets.filter(f => f > 0)
  if (fretted.length === 0) return true
  const lo = Math.min(...fretted), hi = Math.max(...fretted)
  if (hi - lo > MAX_SPAN) return false
  if (v.frets.includes(0) && hi > MAX_FRET_WITH_OPEN) return false
  // Four fingers, or a barre at the lowest fret plus three more.
  if (fretted.length <= 4) return true
  return fretted.filter(f => f === lo).length >= 2 && fretted.filter(f => f > lo).length <= 3
}

function lowestFret(v: Voicing): number {
  const fretted = v.frets.filter(f => f > 0)
  return fretted.length ? Math.min(...fretted) : 0
}

/** Where the hand is: 0 for an open shape (open strings ring with it), else its lowest fret. */
const position = (v: Voicing) => v.frets.includes(0) ? 0 : lowestFret(v)

/**
 * Playable voicings ordered by position on the neck (open shapes first), then by more
 * sounding strings, then by the lowest fret. If nothing passes the filter, all voicings
 * come back in that order.
 */
export function playableVoicings<T extends Voicing>(voicings: T[], openMidi: number[], bassPc: number): T[] {
  const seen = new Set<string>()
  const unique = voicings.filter(v => {
    const k = v.frets.join(',')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const strings = (v: Voicing) => v.frets.filter(f => f >= 0).length
  // Open shapes first, the fullest of them first; then up the neck
  const byNeck = (a: T, b: T) => position(a) - position(b) || strings(b) - strings(a) || lowestFret(a) - lowestFret(b)
  const playable = unique.filter(v => isPlayable(v, openMidi, bassPc))
  return (playable.length ? playable : unique).sort(byNeck)
}
