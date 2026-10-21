// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { normalizeKey, keyOnParent, keySignature, parentMajorPc, isMinorKey, hasLeadingTone, transposeKey, ALL_KEYS } from '../src/theory/keys'
import { buildKeyMap } from '../src/theory/key-map'
import { romanInKey, getAutoKey } from '../src/detector/analyzer'
import { keyLabel, useLang } from '../src/i18n/i18n'

describe('church modes as keys', () => {
  it('a mode\'s tonic spelled as the degree of its parent major', () => {
    expect(keyOnParent(0, 'Dorian')).toBe('D Dorian')
    expect(keyOnParent(11, 'Dorian')).toBe('C# Dorian')
    expect(normalizeKey('Db Dorian')).toBe('C# Dorian')
    expect(keyOnParent(0, 'Locrian')).toBe('B Locrian')
    expect(transposeKey('D Dorian', 2)).toBe('E Dorian')
    expect(ALL_KEYS).toContain('G Mixolydian')
  })

  it('the signature of its parent major, written with the mode for the staff', () => {
    expect(keySignature('D Dorian')).toEqual({ abcKey: 'Ddor', accidentals: {} })
    expect(keySignature('A Mixolydian')).toEqual({ abcKey: 'Amix', accidentals: { C: '#', F: '#' } })
    expect(parentMajorPc('E Phrygian')).toBe(0)
  })

  it('minor third and leading tone by mode', () => {
    expect([isMinorKey('D Dorian'), isMinorKey('G Mixolydian'), isMinorKey('A Minor')]).toEqual([true, false, true])
    expect([hasLeadingTone('F Lydian'), hasLeadingTone('G Mixolydian')]).toEqual([true, false])
  })

  it('named as UMT names the mode, in the interface language', () => {
    useLang('es')
    try { expect(keyLabel('D Dorian')).toBe('Re dórico') } finally { useLang('en') }
  })

  it('read by UMT as the mode\'s own: G7 is IV7 (S) in D Dorian, F is VII (D) in G Mixolydian', () => {
    expect(romanInKey('G7', 'D Dorian')).toMatchObject({ roman: 'IV7', function: 'S', isSecondary: false })
    expect(romanInKey('F', 'G Mixolydian')).toMatchObject({ roman: 'VII', function: 'D' })
    expect(buildKeyMap('D Dorian', true)!.diatonic.map(c => c.symbol).slice(0, 4)).toEqual(['Dm7', 'Em7', 'Fmaj7', 'G7'])
  })

  it('the usual borrowings in major (the parallel minor\'s), none marked in a mode', () => {
    const common = buildKeyMap('C Major', false)!.parallel.flatMap(r => r.chords.filter(c => c.common).map(c => c.symbol))
    expect(common).toEqual(expect.arrayContaining(['Fm', 'Ab', 'Bb']))
    expect(buildKeyMap('D Dorian', false)!.parallel.some(r => r.chords.some(c => c.common))).toBe(false)
  })

  it('Auto finds a dorian vamp', () => {
    const vamp = ['D3', 'F3', 'A3', 'C4', 'G3', 'B3', 'D4', 'F4']
    expect(getAutoKey([1, 2, 3, 4].map(i => ({ id: String(i), symbol: i % 2 ? 'Dm7' : 'G7', notes: i % 2 ? vamp.slice(0, 4) : vamp.slice(4) })))).toBe('D Dorian')
  })
})
