import { keySignature } from '../theory/keys'

/** ABC source for a block chord. Accidentals are written only where they differ from the key signature. */
export function buildStaffAbc(noteNames: string[], keyStr: string | null): string {
  const { abcKey, accidentals } = keySignature(keyStr)
  const header = `X:1\nM:none\nL:1\nK:${abcKey}\n`
  const abcNotes = noteNames.flatMap(n => {
    const m = n.match(/^([A-G])([b#]?)(-?\d+)$/)
    if (!m) return []
    const [, letter, acc, octStr] = m
    const keyAcc = accidentals[letter] ?? ''
    const mark = acc === keyAcc ? '' : acc === 'b' ? '_' : acc === '#' ? '^' : '='
    const oct = parseInt(octStr)
    const pitch = oct >= 5 ? letter.toLowerCase() + "'".repeat(oct - 5)
      : oct === 4 ? letter
      : letter + ','.repeat(4 - oct)
    return [mark + pitch]
  })
  return header + (abcNotes.length ? `[${abcNotes.join('')}]1` : 'z')
}

export function renderStaff(container: HTMLElement, noteNames: string[], width = 380, keyStr: string | null = null, scale = 2) {
  ABCJS.renderAbc(container, buildStaffAbc(noteNames, keyStr), { staffwidth: width - 20, scale })
}
