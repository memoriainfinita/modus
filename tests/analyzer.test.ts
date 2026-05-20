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

import { analyzeNotes, getAutoKey } from '../src/analyzer'

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

describe('getAutoKey', () => {
  it('returns null for empty history', () => {
    expect(getAutoKey([])).toBeNull()
  })

  it('returns top key from KeyDetection.detect', () => {
    const entries = [{ id: '1', symbol: 'Cmaj7', notes: ['C4', 'E4', 'G4', 'B4'] }]
    expect(getAutoKey(entries)).toBe('C Major')
  })
})
