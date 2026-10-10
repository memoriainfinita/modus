// Picks the playable guitar voicings out of everything UMT finds. UMT returns every
// fingering that covers the chord's notes within a stretch (hundreds per chord); this keeps
// the ones a guitarist would actually play and orders them along the neck.

import { pitchClassOf } from './notes'

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
 * the octave closest to the same string in standard tuning. Null if a name is not a note.
 */
export function tuningToMidi(names: string[]): number[] | null {
  if (names.length !== STANDARD_OPEN_MIDI.length) return null
  const midi: number[] = []
  for (let i = 0; i < names.length; i++) {
    const pc = pitchClassOf(normalizeNoteName(names[i]) ?? '')
    if (pc === -1) return null
    const ref = STANDARD_OPEN_MIDI[i]
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
  if (sounding.length < MIN_STRINGS) return false
  // No muted string between two sounding ones.
  if (sounding[sounding.length - 1] - sounding[0] + 1 !== sounding.length) return false
  // The lowest note is the chord's bass (root, or the slash note).
  const lowest = openMidi[sounding[0]] + v.frets[sounding[0]]
  if (lowest % 12 !== bassPc) return false
  const fretted = v.frets.filter(f => f > 0)
  if (fretted.length === 0) return true
  const lo = Math.min(...fretted), hi = Math.max(...fretted)
  if (hi - lo > MAX_SPAN) return false
  if (v.frets.includes(0) && hi > MAX_FRET_WITH_OPEN) return false
  // Four fingers, or a barre at the lowest fret plus three more.
  if (fretted.length <= 4) return true
  return fretted.filter(f => f === lo).length >= 2 && fretted.filter(f => f > lo).length <= 3
}

function position(v: Voicing): number {
  const fretted = v.frets.filter(f => f > 0)
  return fretted.length ? Math.min(...fretted) : 0
}

/**
 * Playable voicings ordered by position on the neck (open shapes first), then by more
 * sounding strings. If nothing passes the filter, all voicings come back in that order.
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
  const byNeck = (a: T, b: T) => position(a) - position(b) || strings(b) - strings(a)
  const playable = unique.filter(v => isPlayable(v, openMidi, bassPc))
  return (playable.length ? playable : unique).sort(byNeck)
}
