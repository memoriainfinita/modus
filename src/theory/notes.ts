/** Note names and MIDI numbers. Spelling: flats (jazz convention). */
export const PITCH_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']

export const NOTE_SEMITONE: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
}

export function midiToNoteName(midiNote: number): string {
  const pc = midiNote % 12
  const octave = Math.floor(midiNote / 12) - 1
  return PITCH_NAMES_FLAT[pc] + octave
}

export function noteNameToMidi(name: string): number | null {
  const m = name.match(/^([A-G][b#]?)(-?\d+)$/)
  if (!m) return null
  const pc = NOTE_SEMITONE[m[1]]
  if (pc === undefined) return null
  return (parseInt(m[2]) + 1) * 12 + pc
}
