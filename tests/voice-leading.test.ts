import { describe, it, expect } from 'vitest'
import { pairVoices, analyzeVoiceLeading, describeVoiceLeading } from '../src/detector/voice-leading'
import { buildHarmonicAnalysis } from '../src/detector/analyzer'
import { buildStaffAbc } from '../src/diagrams/staff'

// Runs against the real UMT bundle (tests/setup-umt.ts).

const steps = (from: string[], to: string[]) => pairVoices(from, to).map(m => m.semitones)

describe('pairVoices', () => {
  it('pairs voices bass to top when both chords have as many', () => {
    // C E G → B D G (V in first inversion): C↓1, E↓2, G held
    expect(steps(['C4', 'E4', 'G4'], ['B3', 'D4', 'G4'])).toEqual([-1, -2, 0])
  })

  it('reads the notes in pitch order, whatever order they come in', () => {
    expect(steps(['G4', 'C4', 'E4'], ['G4', 'B3', 'D4'])).toEqual([-1, -2, 0])
  })

  it('pairs bass with bass and top with top; an inner voice that enters has no step', () => {
    // Three voices to four: E goes to F, the nearer, and D enters
    const moves = pairVoices(['C3', 'E4', 'G4'], ['G2', 'D4', 'F4', 'B4'])
    expect(moves.map(m => [m.from, m.to])).toEqual([['C3', 'G2'], [null, 'D4'], ['E4', 'F4'], ['G4', 'B4']])
  })

  it('a voice that drops out has no step', () => {
    const moves = pairVoices(['G2', 'B3', 'D4', 'F4'], ['C3', 'C4', 'E4'])
    expect(moves.map(m => [m.from, m.to])).toEqual([['G2', 'C3'], ['B3', 'C4'], ['D4', null], ['F4', 'E4']])
  })
})

describe('analyzeVoiceLeading', () => {
  it('names the outer motion, the total and the common tones', () => {
    const vl = analyzeVoiceLeading(['C3', 'E4', 'G4', 'C5'], ['B2', 'D4', 'G4', 'D5'], 'C Major')!
    expect(vl.outer).toBe('contrary')
    expect(vl.total).toBe(1 + 2 + 0 + 2)
    expect(vl.common).toBe(1)
    expect(describeVoiceLeading(vl)).toBe('C→B ↓1  E→D ↓2  G =  C→D ↑2 — outer voices contrary · 5 semitones in all · 1 held')
  })

  it('outer voices: parallel, similar, oblique, held', () => {
    const outer = (a: string[], b: string[]) => analyzeVoiceLeading(a, b, null)!.outer
    expect(outer(['C3', 'G3'], ['D3', 'A3'])).toBe('parallel')
    expect(outer(['C3', 'G3'], ['D3', 'B3'])).toBe('similar')
    expect(outer(['C3', 'G3'], ['C3', 'A3'])).toBe('oblique')
    expect(outer(['C3', 'G3'], ['C3', 'G3'])).toBe('static')
  })

  it('flags parallel fifths and octaves from UMT', () => {
    // C3 G3 C4 E4 → D3 A3 D4 F4: every voice up a step
    const vl = analyzeVoiceLeading(['C3', 'G3', 'C4', 'E4'], ['D3', 'A3', 'D4', 'F4'], 'C Major', 'C', 'Dm')!
    expect(vl.issues.some(i => i.startsWith('parallel fifths'))).toBe(true)
    expect(vl.issues.some(i => i.startsWith('parallel octaves'))).toBe(true)
  })

  it('flags a leading tone that does not rise, in the key', () => {
    // G7 → C with the leading tone B falling to G
    const vl = analyzeVoiceLeading(['G2', 'B3', 'D4', 'F4'], ['C3', 'G3', 'C4', 'E4'], 'C Major', 'G7', 'C')!
    expect(vl.issues.some(i => i.startsWith('leading tone does not rise'))).toBe(true)
  })

  it('a good V7–I has no rules broken', () => {
    const vl = analyzeVoiceLeading(['G2', 'F3', 'B3', 'D4'], ['C3', 'E3', 'C4', 'C4'], 'C Major', 'G7', 'C')!
    expect(vl.issues).toEqual([])
  })

  it('nothing to read without the chord before', () => {
    expect(analyzeVoiceLeading(null, ['C4', 'E4', 'G4'], null)).toBeNull()
    expect(analyzeVoiceLeading([], ['C4', 'E4', 'G4'], null)).toBeNull()
  })

  it('reaches the analysis: the Voices row and the rules', () => {
    const a = buildHarmonicAnalysis('C', 'C Major', 'G7', ['C3', 'E3', 'G3', 'C4'], ['G2', 'F3', 'B3', 'D4'])
    expect(a.voiceLeading).toContain('G→C ↑5')
    expect(a.voiceRules).not.toBeNull()
    expect(buildHarmonicAnalysis('C', 'C Major', 'G7', ['C3', 'E3', 'G3']).voiceLeading).toBeNull()
  })
})

describe('buildStaffAbc with the chord before', () => {
  it('writes the chord before in a bar of its own, then this one', () => {
    const abc = buildStaffAbc(['C4', 'E4', 'G4'], 'C Major', 'treble', ['B3', 'D4', 'G4'])
    expect(abc.split('\n').at(-1)).toBe('[B,DG]1 | [CEG]1')
  })

  it('on a grand staff an empty side of either chord gets an invisible rest', () => {
    const abc = buildStaffAbc(['C4', 'E4'], 'C Major', 'grand', ['G2', 'B3'])
    expect(abc).toContain('V:RH clef=treble\nx | [CE]1')
    expect(abc).toContain('V:LH clef=bass\n[G,,B,]1 | x')
  })
})
