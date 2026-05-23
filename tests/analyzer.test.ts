import { describe, it, expect, vi, beforeAll } from 'vitest'
import { midiToNoteName } from '../src/midi'

// Mock UMT globally before importing analyzer
const mockUMT = {
  parseNote: vi.fn((s: string) => ({ _name: s })),
  parseChordSymbol: vi.fn((s: string) => ({ _sym: s, getNotes: () => [{ _name: 'C4' }] })),
  Harmony: {
    detectChords: vi.fn(() => ['Cmaj7', 'Em/C']),
    analyzeProgression: vi.fn(() => ({
      analysis: [{
        roman: 'I△7', degree: 1, function: 'T',
        isDiatonic: true, isBorrowed: false,
        isSecondary: false, cadenceWithNext: undefined
      }],
      modulations: [], harmonicRhythm: 1
    })),
    analyzeCadence: vi.fn(() => 'Authentic (V7->I)'),
    getSuggestedScales: vi.fn(() => [{ scale: 'C major' }]),
    getColtraneAxis: vi.fn(() => ({ root: 'C', majorThirds: ['E', 'Ab', 'C'] as [string,string,string] })),
    getNegativeHarmony: vi.fn(() => ({ name: 'Fm' })),
    getColtraneSubstitutions: vi.fn(() => []),
  },
  FiguredBass: { fromChord: vi.fn(() => '5/3') },
  KeyDetection: { detect: vi.fn(() => [{ key: 'C Major', confidence: 0.9 }]) },
  getSubstitutions: vi.fn(() => []),
  CircleOfFifths: class {},
}
;(globalThis as any).UMT = mockUMT

import { analyzeNotes, getAutoKey, buildHarmonicAnalysis } from '../src/analyzer'

describe('analyzeNotes', () => {
  it('returns null for empty notes', () => {
    expect(analyzeNotes([], null, null)).toBeNull()
  })

  it('returns SingleNoteResult for 1 note', () => {
    const r = analyzeNotes([60], null, null)
    expect(r?.kind).toBe('note')
    if (r?.kind === 'note') {
      expect(r.noteName).toBe('C4')
      expect(r.midiNumber).toBe(60)
    }
  })

  it('returns ChordResult for 3+ notes', () => {
    const r = analyzeNotes([60, 64, 67, 71], 'C Major', null)
    expect(r?.kind).toBe('chord')
    if (r?.kind === 'chord') {
      expect(r.candidates[0]).toBe('Cmaj7')
    }
  })
})

describe('analyzeNotes — 2 notes (interval)', () => {
  it('returns kind interval', () => {
    const r = analyzeNotes([60, 67], null, null)
    expect(r?.kind).toBe('interval')
  })

  it('identifies Perfect 5th (C4–G4, 7 semitones)', () => {
    const r = analyzeNotes([60, 67], null, null)
    if (r?.kind === 'interval') {
      expect(r.intervalName).toBe('Perfect 5th')
      expect(r.semitones).toBe(7)
      expect(r.inversionName).toBe('Perfect 4th')
    }
  })

  it('identifies Tritone (C4–F#4, 6 semitones)', () => {
    const r = analyzeNotes([60, 66], null, null)
    if (r?.kind === 'interval') {
      expect(r.intervalName).toBe('Tritone')
      expect(r.semitones).toBe(6)
      expect(r.inversionName).toBe('Tritone')
    }
  })

  it('identifies Major 3rd (C4–E4, 4 semitones)', () => {
    const r = analyzeNotes([60, 64], null, null)
    if (r?.kind === 'interval') {
      expect(r.intervalName).toBe('Major 3rd')
      expect(r.semitones).toBe(4)
      expect(r.inversionName).toBe('Minor 6th')
    }
  })

  it('uses absolute distance so note order does not matter', () => {
    const asc = analyzeNotes([60, 67], null, null)
    const desc = analyzeNotes([67, 60], null, null)
    if (asc?.kind === 'interval' && desc?.kind === 'interval') {
      expect(asc.semitones).toBe(desc.semitones)
    }
  })

  it('stores both note names', () => {
    const r = analyzeNotes([60, 64], null, null)
    if (r?.kind === 'interval') {
      expect(r.notes).toHaveLength(2)
    }
  })
})

describe('buildHarmonicAnalysis', () => {
  it('returns object with correct chordName', () => {
    const r = buildHarmonicAnalysis('Cmaj7', null, null)
    expect(r.chordName).toBe('Cmaj7')
  })

  it('without key: roman is ? and function is unknown', () => {
    const r = buildHarmonicAnalysis('Cmaj7', null, null)
    expect(r.roman).toBe('?')
    expect(r.function).toBe('unknown')
  })

  it('with key: returns roman and function from UMT', () => {
    const r = buildHarmonicAnalysis('Cmaj7', 'C Major', null)
    expect(r.roman).toBe('I△7')
    expect(r.function).toBe('T')
    expect(r.isDiatonic).toBe(true)
    expect(r.isBorrowed).toBe(false)
  })

  it('with prevChord: returns cadence', () => {
    const r = buildHarmonicAnalysis('Cmaj7', 'C Major', 'G7')
    expect(r.cadence).toBe('Authentic (V7->I)')
  })

  it('without prevChord: cadence is null', () => {
    const r = buildHarmonicAnalysis('Cmaj7', 'C Major', null)
    expect(r.cadence).toBeNull()
  })

  it('returns suggestedScales', () => {
    const r = buildHarmonicAnalysis('Cmaj7', 'C Major', null)
    expect(r.suggestedScales).toContain('C major')
  })

  it('returns figuredBass', () => {
    const r = buildHarmonicAnalysis('Cmaj7', 'C Major', null)
    expect(r.figuredBass).toBe('5/3')
  })

  it('with key: returns coltraneAxis', () => {
    const r = buildHarmonicAnalysis('Cmaj7', 'C Major', null)
    expect(r.coltraneAxis).toEqual(['E', 'Ab', 'C'])
  })

  it('without key: coltraneAxis is null', () => {
    const r = buildHarmonicAnalysis('Cmaj7', null, null)
    expect(r.coltraneAxis).toBeNull()
  })

  it('with key: returns negativeHarmony', () => {
    const r = buildHarmonicAnalysis('Cmaj7', 'C Major', null)
    expect(r.negativeHarmony).toBe('Fm')
  })

  it('detectedKey is always null (filled externally)', () => {
    const r = buildHarmonicAnalysis('Cmaj7', 'C Major', null)
    expect(r.detectedKey).toBeNull()
  })
})

describe('getAutoKey', () => {
  it('returns null for empty history', () => {
    expect(getAutoKey([])).toBeNull()
  })

  it('returns top key from KeyDetection.detect', () => {
    const entries = [{ id: '1', symbol: 'Cmaj7', notes: ['C4', 'E4', 'G4', 'B4'] }]
    expect(getAutoKey(entries)).toBe('C Major')
  })
})
