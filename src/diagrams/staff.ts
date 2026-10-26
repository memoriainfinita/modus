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

/** What the column beside the staff writes for each note: nothing, its name, or its degree in the chord. */
export type StaffNames = 'off' | 'notes' | 'degrees'
export const STAFF_NAMES: readonly StaffNames[] = ['off', 'notes', 'degrees']

/** A staff as drawn: the y of its top line and the distance between two lines. */
export interface StaffLines { top: number; spacing: number }

/** Each staff's bottom line as a staff step: E4 on the treble staff, G2 on the bass staff. */
const BOTTOM_LINE = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 }

/**
 * The y of each label at its note's height, by the note's staff step (not by abcjs'
 * noteheads): on a grand staff the notes from middle C up on the treble staff, the rest on
 * the bass staff, as `buildStaffAbc` writes them. Then eased apart from the bass up, so two
 * labels are never closer than `gap` (a second, a cluster). Labels of unreadable notes are left out.
 */
export function placeNames(noteNames: string[], labels: string[], clef: StaffClef, staves: StaffLines[], gap: number): { y: number; text: string }[] {
  const placed = noteNames.flatMap((n, i) => {
    const step = parseNotes([n], {})[0]?.step
    if (step === undefined || !labels[i]) return []
    const onTreble = clef === 'treble' || (clef === 'grand' && step >= MIDDLE_C)
    const staff = clef === 'grand' && !onTreble ? staves[1] : staves[0]
    if (!staff) return []
    const bottom = staff.top + 4 * staff.spacing
    return [{ step, y: bottom - (step - BOTTOM_LINE[onTreble ? 'treble' : 'bass']) * staff.spacing / 2, text: labels[i] }]
  }).sort((a, b) => a.step - b.step)
  placed.forEach((p, i) => { if (i > 0) p.y = Math.min(p.y, placed[i - 1].y - gap) })
  return placed.map(({ y, text }) => ({ y, text }))
}

// abcjs draws a staff line as a <line> in Firefox and, in Chrome, as a thin filled
// rectangle: a <path> M x y L x2 y L x2 y2 L x y2 z
function lineBox(p: Element | null): { y: number; right: number } | null {
  if (p?.tagName.toLowerCase() === 'line') {
    const a = (name: string) => parseFloat(p.getAttribute(name) ?? '')
    return Number.isFinite(a('y1')) ? { y: a('y1'), right: Math.max(a('x1'), a('x2')) } : null
  }
  const n = (p?.getAttribute('d')?.match(/-?[\d.]+/g) ?? []).map(Number)
  return n.length >= 8 ? { y: (n[1] + n[5]) / 2, right: Math.max(n[0], n[2]) } : null
}

/** Ends a staff line at `right`, in either form. */
function endLineAt(p: Element, right: number) {
  if (p.tagName.toLowerCase() === 'line') { p.setAttribute('x2', String(right)); return }
  const n = (p.getAttribute('d')?.match(/-?[\d.]+/g) ?? []).map(Number)
  if (n.length >= 8) p.setAttribute('d', `M ${n[0]} ${n[1]} L ${right} ${n[3]} L ${right} ${n[5]} L ${n[6]} ${n[7]} z`)
}

/** The staves abcjs drew, top first, each with its five lines. */
function drawnStaves(svg: SVGSVGElement): (StaffLines & { lines: Element[] })[] {
  return [...svg.querySelectorAll('.abcjs-top-line')].flatMap(top => {
    const lines = [top]
    while (lines.length < 5 && lines[lines.length - 1].nextElementSibling) lines.push(lines[lines.length - 1].nextElementSibling!)
    const a = lineBox(lines[0]), b = lineBox(lines[1])
    if (!a || !b || lines.length < 5) return []
    return [{ top: a.y, spacing: b.y - a.y, lines }]
  })
}

/**
 * Writes the labels in a column right of the staff, each at its note's height. abcjs draws
 * the staff on well past the last chord: it is ended a little after it, so the column
 * stands beside the notes whatever their number.
 */
function drawNames(container: HTMLElement, noteNames: string[], labels: string[], clef: StaffClef) {
  const svg = container.querySelector('svg')
  const staves = svg ? drawnStaves(svg) : []
  if (!svg || !staves.length) return
  // A third is one line apart: a label that tall keeps each of a stacked chord at its note
  const size = staves[0].spacing
  const heads = [...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-notehead')].map(h => { const b = h.getBBox(); return b.x + b.width })
  const drawnRight = Math.max(...staves.map(s => lineBox(s.lines[0])?.right ?? 0))
  const right = heads.length ? Math.min(drawnRight, Math.max(...heads) + size * 1.5) : drawnRight
  staves.forEach(s => s.lines.forEach(l => endLineAt(l, right)))
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute('class', 'staff-names')
  g.setAttribute('stroke', 'none')   // abcjs' drawing strokes what it inherits: text would come out bold
  for (const { y, text } of placeNames(noteNames, labels, clef, staves, size)) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    el.setAttribute('x', String(right + size))
    el.setAttribute('y', String(y))
    el.setAttribute('dominant-baseline', 'central')
    el.setAttribute('font-size', String(size))
    el.setAttribute('font-weight', '400')
    el.setAttribute('fill', 'currentColor')   // abcjs draws in currentColor: an export keeps it
    el.setAttribute('fill-opacity', '0.8')
    el.textContent = text
    g.appendChild(el)
  }
  svg.appendChild(g)
}

/** `labels`, parallel to `noteNames`, are written beside the staff: only the current chord's, never the one before. */
export function renderStaff(container: HTMLElement, noteNames: string[], width = 380, keyStr: string | null = null, scale = 2, clef: StaffClef = 'treble', prevNotes: string[] | null = null, labels: string[] | null = null) {
  // add_classes: abcjs marks each element with its measure (abcjs-m0, abcjs-m1)
  ABCJS.renderAbc(container, buildStaffAbc(noteNames, keyStr, clef, prevNotes), { staffwidth: width - 20, scale, add_classes: !!prevNotes?.length })
  // The chord before is the first bar: drawn faded
  if (prevNotes?.length) container.querySelectorAll<SVGElement>('.abcjs-note.abcjs-m0').forEach(el => el.classList.add('staff-prev'))
  if (labels?.length) drawNames(container, noteNames, labels, clef)
}
