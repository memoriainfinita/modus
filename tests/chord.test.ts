import { describe, it, expect } from 'vitest'
import {
  chordFamily, functionColor, neutralColor,
  normalizeChordName, isKnownChord, tryParseChord, chordNoteNames, chordRoot,
} from '../src/theory/chord'

// Runs against the real UMT bundle (tests/setup-umt.ts).

describe('chordFamily', () => {
  it.each([
    ['C', 'major'], ['Cmaj7', 'major'], ['C6', 'major'], ['C/E', 'major'],
    ['Cm', 'minor'], ['Cm7', 'minor'], ['Cm(maj7)', 'minor'],
    ['C7', 'dominant'], ['C9', 'dominant'], ['C7#9', 'dominant'],
    ['Bdim', 'diminished'], ['Bdim7', 'diminished'],
    ['Bm7b5', 'half-diminished'],
    ['Caug', 'augmented'],
    ['Csus4', 'sus'], ['Csus2', 'sus'], ['C7sus4', 'sus'],
  ])('%s → %s', (symbol, family) => {
    expect(chordFamily(symbol)).toBe(family)
  })

  it('returns null for a power chord (no third, no sus tone)', () => {
    expect(chordFamily('C5')).toBeNull()
  })

  it('returns null for symbols UMT rejects', () => {
    expect(chordFamily('?')).toBeNull()
    expect(chordFamily('Unknown Chord')).toBeNull()
    expect(chordFamily('')).toBeNull()
  })
})

describe('functionColor', () => {
  it('colours by function, the one colour code of the page', () => {
    expect(functionColor('T')).toBe('#4ade80')
    expect(functionColor('S')).toBe('#f59e0b')
    expect(functionColor('D')).toBe('#f87171')
  })

  it('a chord without a function is drawn in chord-none, or the token asked for', () => {
    expect(functionColor('unknown')).toBe('#b8a47a')
    expect(functionColor(null)).toBe('#b8a47a')
    expect(functionColor(null, 'text-strong')).toBe('#f7f4ee')
    expect(neutralColor()).toBe('#77746e')
  })
})

describe('normalizeChordName', () => {
  it('turns UMT "CM" into "C"', () => {
    expect(normalizeChordName('CM')).toBe('C')
    expect(normalizeChordName('BbM')).toBe('Bb')
  })

  it('keeps the slash bass', () => {
    expect(normalizeChordName('CM/E')).toBe('C/E')
  })

  it('leaves other qualities alone', () => {
    for (const s of ['Cmaj7', 'CM7', 'Cm', 'C', 'F6/D', 'Cmaj7/E']) expect(normalizeChordName(s)).toBe(s)
  })
})

describe('isKnownChord / tryParseChord', () => {
  it('accepts what UMT parses', () => {
    expect(isKnownChord('Cmaj7')).toBe(true)
    expect(tryParseChord('Cmaj7')?.name).toBe('Cmaj7')
  })

  it('rejects sentinels and empty input', () => {
    for (const s of ['?', 'Unknown Chord', '', null, undefined]) expect(isKnownChord(s)).toBe(false)
  })
})

describe('chordNoteNames', () => {
  it('returns UMT spelling with octaves', () => {
    expect(chordNoteNames('G7')).toEqual(['G4', 'B4', 'D5', 'F5'])
  })

  it('puts the slash bass first', () => {
    expect(chordNoteNames('C/E')[0]).toBe('E3')
  })

  it('returns [] for unparseable symbols', () => {
    expect(chordNoteNames('?')).toEqual([])
  })
})

describe('chordRoot', () => {
  it('extracts the root with its accidental', () => {
    expect(chordRoot('Bbm7/F')).toBe('Bb')
    expect(chordRoot('F#dim')).toBe('F#')
    expect(chordRoot(null)).toBeNull()
  })
})
