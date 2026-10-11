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
 * nothing to write. With `prevNotes` the chord before is written first, in a bar of its own
 * (so its accidentals do not carry), to show how each voice moves.
 */
export function buildStaffAbc(noteNames: string[], keyStr: string | null, clef: StaffClef = 'treble', prevNotes: string[] | null = null): string {
  const { abcKey, accidentals } = keySignature(keyStr)
  const notes = parseNotes(noteNames, accidentals)
  const prev = prevNotes?.length ? parseNotes(prevNotes, accidentals) : null
  const bar = (before: Parsed[] | null, now: Parsed[], empty: string) => {
    const chord = (ns: Parsed[]) => ns.length ? chordOf(ns) : empty
    return before ? `${chord(before)} | ${chord(now)}` : chord(now)
  }
  if (clef !== 'grand') {
    const header = `X:1
M:none
L:1
K:${abcKey}${clef === 'bass' ? ' clef=bass' : ''}
`
    return header + bar(prev, notes, notes.length || prev ? 'x' : 'z')
  }
  const upper = (ns: Parsed[]) => ns.filter(n => n.step >= MIDDLE_C)
  const lower = (ns: Parsed[]) => ns.filter(n => n.step < MIDDLE_C)
  const empty = notes.length || prev ? 'x' : 'z'
  return `X:1
M:none
L:1
%%staves {RH LH}
K:${abcKey}
` +
    `V:RH clef=treble
${bar(prev && upper(prev), upper(notes), empty)}
` +
    `V:LH clef=bass
${bar(prev && lower(prev), lower(notes), empty)}`
}

export function renderStaff(container: HTMLElement, noteNames: string[], width = 380, keyStr: string | null = null, scale = 2, clef: StaffClef = 'treble', prevNotes: string[] | null = null) {
  // add_classes: abcjs marks each element with its measure (abcjs-m0, abcjs-m1)
  ABCJS.renderAbc(container, buildStaffAbc(noteNames, keyStr, clef, prevNotes), { staffwidth: width - 20, scale, add_classes: !!prevNotes?.length })
  // The chord before is the first bar: drawn faded
  if (prevNotes?.length) container.querySelectorAll<SVGElement>('.abcjs-note.abcjs-m0').forEach(el => el.classList.add('staff-prev'))
}
