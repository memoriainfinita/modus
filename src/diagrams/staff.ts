import { keySignature } from '../theory/keys'

/** Which staves the chord is written on: both (piano), treble only, bass only. */
export type StaffClef = 'grand' | 'treble' | 'bass'
export const STAFF_CLEFS: readonly StaffClef[] = ['grand', 'treble', 'bass']

const LETTERS = 'CDEFGAB'

type Parsed = { mark: string; pitch: string; step: number }

/** A note name as ABC (accidental against the key signature, octave marks) and its staff step. */
function parseNotes(noteNames: string[], accidentals: Record<string, string>): Parsed[] {
  return noteNames.flatMap(n => {
    const m = n.match(/^([A-G])(#{0,2}|b{0,2})(-?\d+)$/)
    if (!m) return []
    const [, letter, acc, octStr] = m
    const keyAcc = accidentals[letter] ?? ''
    // ABC: ^ sharp, _ flat, doubled for double accidentals, = natural against the signature
    const mark = acc === keyAcc ? '' : acc ? acc.replace(/#/g, '^').replace(/b/g, '_') : '='
    const oct = parseInt(octStr)
    const pitch = oct >= 5 ? letter.toLowerCase() + "'".repeat(oct - 5)
      : oct === 4 ? letter
      : letter + ','.repeat(4 - oct)
    return [{ mark, pitch, step: oct * 7 + LETTERS.indexOf(letter) }]
  })
}

const chordOf = (notes: Parsed[]) => `[${notes.map(n => n.mark + n.pitch).join('')}]1`

/** Middle C as a staff step: a note is written on the treble staff from middle C up, by its letter (B#3 goes below). */
const MIDDLE_C = 4 * 7

/**
 * ABC source for a block chord. Accidentals are written only where they differ from the key
 * signature. On a grand staff the notes from middle C up go on the treble staff, the rest on
 * the bass staff; an empty staff gets an invisible rest, and both get a rest when there is
 * nothing to write.
 */
export function buildStaffAbc(noteNames: string[], keyStr: string | null, clef: StaffClef = 'treble'): string {
  const { abcKey, accidentals } = keySignature(keyStr)
  const notes = parseNotes(noteNames, accidentals)
  if (clef !== 'grand') {
    const header = `X:1\nM:none\nL:1\nK:${abcKey}${clef === 'bass' ? ' clef=bass' : ''}\n`
    return header + (notes.length ? chordOf(notes) : 'z')
  }
  const upper = notes.filter(n => n.step >= MIDDLE_C)
  const lower = notes.filter(n => n.step < MIDDLE_C)
  const empty = notes.length ? 'x' : 'z'
  return `X:1\nM:none\nL:1\n%%staves {RH LH}\nK:${abcKey}\n` +
    `V:RH clef=treble\n${upper.length ? chordOf(upper) : empty}\n` +
    `V:LH clef=bass\n${lower.length ? chordOf(lower) : empty}`
}

export function renderStaff(container: HTMLElement, noteNames: string[], width = 380, keyStr: string | null = null, scale = 2, clef: StaffClef = 'treble') {
  ABCJS.renderAbc(container, buildStaffAbc(noteNames, keyStr, clef), { staffwidth: width - 20, scale })
}
