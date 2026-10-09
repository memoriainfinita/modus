import { describe, it, expect } from 'vitest'
import { buildStaffAbc } from '../src/diagrams/staff'
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
