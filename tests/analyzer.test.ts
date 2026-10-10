import { describe, it, expect } from 'vitest'
import { analyzeNotes, getAutoKey, buildHarmonicAnalysis, romanInKey } from '../src/detector/analyzer'
import type { DetectionResult, ChordResult, IntervalResult, SingleNoteResult } from '../src/types'

// Runs against the real UMT bundle (tests/setup-umt.ts).

function asChord(r: DetectionResult): ChordResult {
  expect(r?.kind).toBe('chord'); return r as ChordResult
}
function asInterval(r: DetectionResult): IntervalResult {
  expect(r?.kind).toBe('interval'); return r as IntervalResult
}
function asNote(r: DetectionResult): SingleNoteResult {
  expect(r?.kind).toBe('note'); return r as SingleNoteResult
}

describe('analyzeNotes', () => {
  it('returns null for empty notes', () => {
    expect(analyzeNotes([])).toBeNull()
  })

  it('returns SingleNoteResult for 1 note', () => {
    const r = asNote(analyzeNotes([60]))
    expect(r.noteName).toBe('C4')
    expect(r.midiNumber).toBe(60)
    expect(r.pitchClass).toBe('C')
  })

  it('detects Cmaj7 from C E G B', () => {
    expect(asChord(analyzeNotes([60, 64, 67, 71])).candidates[0]).toBe('Cmaj7')
  })

  it('names a plain major triad "C", not UMT\'s "CM"', () => {
    const r = asChord(analyzeNotes([48, 52, 55]))
    expect(r.candidates[0]).toBe('C')
  })

  it('names an inverted major triad "C/E", not "CM/E"', () => {
    const r = asChord(analyzeNotes([52, 55, 60]))
    expect(r.candidates[0]).toBe('C/E')
  })

  it('keeps ranked alternatives', () => {
    const r = asChord(analyzeNotes([50, 53, 57, 60])) // D F A C
    expect(r.candidates).toEqual(['Dm7', 'F6/D'])
  })

  it('maps UMT "Unknown Chord" to the single sentinel "?"', () => {
    const r = asChord(analyzeNotes([48, 49, 50])) // C Db D cluster
    expect(r.candidates).toEqual(['?'])
  })

  it('only returns candidates UMT can parse back', () => {
    const r = asChord(analyzeNotes([60, 64, 68])) // augmented: several enharmonic names
    for (const c of r.candidates) expect(() => UMT.parseChordSymbol(c)).not.toThrow()
  })
})

describe('analyzeNotes — 2 notes (interval)', () => {
  it('returns kind interval', () => {
    expect(analyzeNotes([60, 67])?.kind).toBe('interval')
  })

  it('identifies Perfect 5th (C4–G4, 7 semitones)', () => {
    const r = asInterval(analyzeNotes([60, 67]))
    expect(r.intervalName).toBe('Perfect 5th')
    expect(r.semitones).toBe(7)
    expect(r.inversionName).toBe('Perfect 4th')
  })

  it('identifies Tritone (C4–F#4, 6 semitones)', () => {
    const r = asInterval(analyzeNotes([60, 66]))
    expect(r.intervalName).toBe('Tritone')
    expect(r.inversionName).toBe('Tritone')
  })

  it('identifies Major 3rd (C4–E4, 4 semitones)', () => {
    const r = asInterval(analyzeNotes([60, 64]))
    expect(r.intervalName).toBe('Major 3rd')
    expect(r.inversionName).toBe('Minor 6th')
  })

  it('names an octave as Octave, not Unison', () => {
    const r = asInterval(analyzeNotes([48, 60]))
    expect(r.intervalName).toBe('Octave')
    expect(r.semitones).toBe(12)
  })

  it('reduces compound intervals (C3–E4 is a Major 3rd)', () => {
    const r = asInterval(analyzeNotes([48, 64]))
    expect(r.intervalName).toBe('Major 3rd')
  })

  it('uses absolute distance so note order does not matter', () => {
    expect(asInterval(analyzeNotes([60, 67])).semitones).toBe(asInterval(analyzeNotes([67, 60])).semitones)
  })
})

describe('buildHarmonicAnalysis', () => {
  it('returns object with correct chordName', () => {
    expect(buildHarmonicAnalysis('Cmaj7', null, null).chordName).toBe('Cmaj7')
  })

  it('without key: roman is ? and function is unknown', () => {
    const r = buildHarmonicAnalysis('Cmaj7', null, null)
    expect(r.roman).toBe('?')
    expect(r.function).toBe('unknown')
  })

  it('with key: roman and function from UMT', () => {
    const r = buildHarmonicAnalysis('Cmaj7', 'C Major', null)
    expect(r.roman).toBe('Imaj7')
    expect(r.function).toBe('T')
    expect(r.isDiatonic).toBe(true)
    expect(r.isBorrowed).toBe(false)
  })

  it('flags borrowed chords with their source', () => {
    const r = buildHarmonicAnalysis('Ab', 'C Major', null)
    expect(r.roman).toBe('bVI')
    expect(r.isBorrowed).toBe(true)
    expect(r.borrowedFrom).toBe('minor')
  })

  it('with prevChord: returns cadence', () => {
    expect(buildHarmonicAnalysis('Cmaj7', 'C Major', 'G7').cadence).toBe('Authentic Cadence (V -> I)')
  })

  it('without prevChord: cadence is null', () => {
    expect(buildHarmonicAnalysis('Cmaj7', 'C Major', null).cadence).toBeNull()
  })

  it('drops UMT\'s "No standard cadence"', () => {
    expect(buildHarmonicAnalysis('C', 'C Major', 'C').cadence).toBeNull()
  })

  it('returns suggestedScales', () => {
    expect(buildHarmonicAnalysis('Cmaj7', 'C Major', null).suggestedScales).toContain('C ionian')
  })

  it('returns figured bass for an inversion', () => {
    expect(buildHarmonicAnalysis('C/E', 'C Major', null).figuredBass).toBe('6')
  })

  it('does not throw on a symbol UMT rejects', () => {
    const r = buildHarmonicAnalysis('?', 'C Major', null)
    expect(r.roman).toBe('?')
    expect(r.function).toBe('unknown')
  })
})

describe('getAutoKey', () => {
  it('returns null for empty history', () => {
    expect(getAutoKey([])).toBeNull()
  })

  it('returns the top Krumhansl-Schmuckler key for the history notes', () => {
    const entries = [
      { id: '1', symbol: 'C', notes: ['C4', 'E4', 'G4'] },
      { id: '2', symbol: 'F', notes: ['F4', 'A4', 'C5'] },
      { id: '3', symbol: 'G7', notes: ['G3', 'B3', 'D4', 'F4'] },
    ]
    expect(getAutoKey(entries)).toBe('C Major')
  })
})

describe('romanInKey', () => {
  it('writes secondary dominants as V7/x in the roman', () => {
    expect(romanInKey('D7', 'C Major')?.roman).toBe('V7/V')
    expect(romanInKey('A7', 'C Major')?.roman).toBe('V7/ii')
  })

  it('keeps the plain roman for diatonic chords', () => {
    expect(romanInKey('Cmaj7', 'C Major')?.roman).toBe('Imaj7')
    expect(romanInKey('G7', 'C Major')?.roman).toBe('V7')
  })

  it('returns null without key or for an unknown chord', () => {
    expect(romanInKey('C', null)).toBeNull()
    expect(romanInKey('notachord', 'C Major')).toBeNull()
  })

  it('buildHarmonicAnalysis carries the same roman', () => {
    expect(buildHarmonicAnalysis('A7', 'C Major', null).roman).toBe('V7/ii')
  })
})
