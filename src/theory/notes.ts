/** Note names and MIDI numbers. MIDI input arrives spelled with flats; theory/spelling.ts
 *  respells it in the key. Names may carry any number of accidentals (F##4, Cb5). */
export const PITCH_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']

const LETTER_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** Semitones the accidentals add: "##" → 2, "b" → -1. */
function accidentalSemitones(acc: string): number {
  let n = 0
  for (const ch of acc) n += ch === '#' ? 1 : ch === 'b' ? -1 : 0
  return n
}

/** Pitch class 0–11 of a note name without octave ("C#", "Fb", "E##"); -1 when it is not one. */
export function pitchClassOf(name: string): number {
  const m = name.match(/^([A-G])([#b]*)$/)
  if (!m) return -1
  return (((LETTER_SEMITONE[m[1]] + accidentalSemitones(m[2])) % 12) + 12) % 12
}

export function midiToNoteName(midiNote: number): string {
  const pc = midiNote % 12
  const octave = Math.floor(midiNote / 12) - 1
  return PITCH_NAMES_FLAT[pc] + octave
}

/** MIDI number of a name with octave. The octave belongs to the letter: B#3 is 60, Cb4 is 59. */
export function noteNameToMidi(name: string): number | null {
  const m = name.match(/^([A-G])([#b]*)(-?\d+)$/)
  if (!m) return null
  return (parseInt(m[3]) + 1) * 12 + LETTER_SEMITONE[m[1]] + accidentalSemitones(m[2])
}

/** A name without octave ("G#") placed on a MIDI pitch it spells: G# at 68 → "G#4", B# at 60 → "B#3". */
export function nameAtMidi(base: string, midi: number): string | null {
  const m = base.match(/^([A-G])([#b]*)$/)
  if (!m) return null
  const offset = midi - LETTER_SEMITONE[m[1]] - accidentalSemitones(m[2])
  return offset % 12 === 0 ? `${base}${offset / 12 - 1}` : null
}
