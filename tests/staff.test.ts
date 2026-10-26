import { describe, it, expect } from 'vitest'
import { buildStaffAbc, placeNames } from '../src/diagrams/staff'
import { staffLabels } from '../src/detector/analyzer'
import { useLang } from '../src/i18n/i18n'
import { keySignature, keyPrefersSharps, normalizeKey } from '../src/theory/keys'

const body = (abc: string) => abc.split('\n').pop()

describe('keySignature', () => {
  it('no key → K:none, no accidentals', () => {
    expect(keySignature(null)).toEqual({ abcKey: 'none', accidentals: {} })
  })

  it('F Major → one flat on B', () => {
    expect(keySignature('F Major')).toEqual({ abcKey: 'F', accidentals: { B: 'b' } })
  })

  it('D Major → F# and C#', () => {
    expect(keySignature('D Major').accidentals).toEqual({ F: '#', C: '#' })
  })

  it('C Minor → three flats', () => {
    expect(keySignature('C Minor')).toEqual({ abcKey: 'Cm', accidentals: { B: 'b', E: 'b', A: 'b' } })
  })

  it('Db Minor is written as C# minor (four sharps)', () => {
    expect(keySignature('Db Minor')).toEqual({ abcKey: 'C#m', accidentals: { F: '#', C: '#', G: '#', D: '#' } })
  })
})

describe('keySignature from UMT letter spelling', () => {
  it('F# Major has six sharps including E#', () => {
    expect(keySignature('F# Major')).toEqual({ abcKey: 'F#', accidentals: { F: '#', C: '#', G: '#', D: '#', A: '#', E: '#' } })
  })

  it('Eb Minor has six flats including Cb', () => {
    expect(keySignature('Eb Minor')).toEqual({ abcKey: 'Ebm', accidentals: { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b', C: 'b' } })
  })

  it('unknown keys have no signature', () => {
    expect(keySignature('H Major')).toEqual({ abcKey: 'none', accidentals: {} })
  })
})

describe('normalizeKey', () => {
  it('respells minor keys to the selector root', () => {
    expect(normalizeKey('Db Minor')).toBe('C# Minor')
    expect(normalizeKey('A# Minor')).toBe('Bb Minor')
    expect(normalizeKey('Gb Major')).toBe('F# Major')
    expect(normalizeKey('')).toBeNull()
  })
})

describe('keyPrefersSharps', () => {
  it('follows the key signature, including minor keys', () => {
    expect(keyPrefersSharps('D Major')).toBe(true)
    expect(keyPrefersSharps('E Minor')).toBe(true)
    expect(keyPrefersSharps('G Minor')).toBe(false)
    expect(keyPrefersSharps('F Major')).toBe(false)
    expect(keyPrefersSharps('C Major')).toBe(false)
    expect(keyPrefersSharps(null)).toBe(false)
  })
})

describe('buildStaffAbc', () => {
  it('empty chord renders a rest', () => {
    expect(body(buildStaffAbc([], null))).toBe('z')
  })

  it('maps octaves to ABC (C3 → C,  C4 → C  C5 → c  C6 → c\')', () => {
    expect(body(buildStaffAbc(['C3', 'C4', 'C5', 'C6'], null))).toBe("[C,Ccc']1")
  })

  it('without key: accidentals explicit, naturals bare', () => {
    expect(body(buildStaffAbc(['C4', 'Eb4', 'F#4'], null))).toBe('[C_E^F]1')
  })

  it('B natural in F major gets a natural sign (key signature would make it Bb)', () => {
    expect(body(buildStaffAbc(['B4'], 'F Major'))).toBe('[=B]1')
  })

  it('Bb in F major needs no accidental', () => {
    expect(body(buildStaffAbc(['Bb4'], 'F Major'))).toBe('[B]1')
  })

  it('writes the K: header from the active key', () => {
    expect(buildStaffAbc(['C4'], 'Eb Major')).toContain('K:Eb\n')
  })
})

describe('buildStaffAbc on a grand staff', () => {
  const voices = (abc: string) => {
    const lines = abc.split('\n')
    return { rh: lines[lines.indexOf('V:RH clef=treble') + 1], lh: lines[lines.indexOf('V:LH clef=bass') + 1] }
  }

  it('splits at middle C: C4 and up on the treble staff, the rest on the bass staff', () => {
    expect(voices(buildStaffAbc(['C3', 'G3', 'C4', 'E4'], null, 'grand'))).toEqual({ rh: '[CE]1', lh: '[C,G,]1' })
  })

  it('splits by the written letter: B#3 sounds as C4 but is written below it', () => {
    expect(voices(buildStaffAbc(['B#3', 'E4'], null, 'grand'))).toEqual({ rh: '[E]1', lh: '[^B,]1' })
  })

  it('an empty staff gets an invisible rest; nothing at all gets a rest on both', () => {
    expect(voices(buildStaffAbc(['E4', 'G4'], null, 'grand')).lh).toBe('x')
    expect(voices(buildStaffAbc([], null, 'grand'))).toEqual({ rh: 'z', lh: 'z' })
  })

  it('joins the staves with a brace and keeps one key signature', () => {
    const abc = buildStaffAbc(['C4'], 'D Major', 'grand')
    expect(abc).toContain('%%staves {RH LH}')
    expect(abc).toContain('K:D\n')
  })

  it('bass clef alone puts the clef on the key line', () => {
    expect(buildStaffAbc(['C3'], 'F Major', 'bass')).toContain('K:F clef=bass\n')
  })
})

describe('names beside the staff', () => {
  // Two staves as abcjs draws them: lines 10 apart, the bass staff 100 lower
  const staves = [{ top: 0, spacing: 10 }, { top: 100, spacing: 10 }]
  const ys = (p: { y: number }[]) => p.map(x => x.y)

  it('each label at its note height: E4 on the bottom line, F5 on the top, G2 on the bass staff', () => {
    expect(ys(placeNames(['E4', 'F5'], ['E', 'F'], 'treble', staves, 5))).toEqual([40, 0])
    expect(ys(placeNames(['G2', 'A3'], ['G', 'A'], 'bass', staves, 5))).toEqual([40, 0])
  })

  it('on a grand staff middle C goes on the treble staff, B3 on the bass staff, by the letter (B#3 too)', () => {
    expect(ys(placeNames(['C4', 'B3'], ['C', 'B'], 'grand', staves, 5))).toEqual([95, 50])
    expect(ys(placeNames(['C4', 'B#3'], ['C', 'B#'], 'grand', staves, 5))).toEqual([95, 50])
  })

  it('eased apart from the bass up, in pitch order: a second never overlaps', () => {
    const p = placeNames(['D4', 'C4', 'E4'], ['D', 'C', 'E'], 'treble', staves, 8)
    expect(p.map(x => x.text)).toEqual(['C', 'D', 'E'])
    expect(ys(p)).toEqual([50, 42, 34])
  })

  it('a note it cannot read or without a label is left out', () => {
    expect(placeNames(['C4', '?', 'G4'], ['C', 'x', ''], 'treble', staves, 5).map(x => x.text)).toEqual(['C'])
  })
})

describe('staffLabels', () => {
  it('off writes nothing; notes as the page names them', () => {
    expect(staffLabels('off', ['C4', 'E4', 'G4'], 'C')).toBeNull()
    expect(staffLabels('notes', ['C4', 'Eb4', 'G4'], 'Cm')).toEqual(['C', 'Eb', 'G'])
    useLang('es')
    try { expect(staffLabels('notes', ['C4', 'Eb4'], null)).toEqual(['Do', 'Mib']) } finally { useLang('en') }
  })

  it('degrees in the chord, a note outside it with +; names without a chord or under three notes', () => {
    expect(staffLabels('degrees', ['E3', 'C4', 'G4', 'Bb4'], 'C7')).toEqual(['3', 'R', '5', '♭7'])
    expect(staffLabels('degrees', ['C4', 'E4', 'G4', 'D5'], 'C')).toEqual(['R', '3', '5', '+D'])
    expect(staffLabels('degrees', ['C4', 'E4'], null)).toEqual(['C', 'E'])
    expect(staffLabels('degrees', ['C4', 'E4'], 'C')).toEqual(['C', 'E'])
  })
})
