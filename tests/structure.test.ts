import { describe, it, expect } from 'vitest'
import { describeVoicing, voicingCard, presentUpperStructures, neoRiemannianPath, analyzeNoteSet, buildHarmonicAnalysis } from '../src/detector/analyzer'

const chord = (s: string) => UMT.parseChordSymbol(s)

describe('describeVoicing (UMT analyzeVoicing)', () => {
  it('inversion, position, doubled and missing notes', () => {
    expect(describeVoicing(['C4', 'E4', 'G4'], chord('C'))).toBe('root position · close')
    expect(describeVoicing(['E3', 'C4', 'G4'], chord('C'))).toBe('1st inversion · close')
    expect(describeVoicing(['C3', 'G3', 'E4', 'C5'], chord('C'))).toBe('root position · open · doubled R')
    expect(describeVoicing(['C3', 'E3', 'Bb3', 'D4'], chord('C9'))).toBe('root position · close · drop 2 · no 5')
  })

  it('nothing for fewer than three notes', () => {
    expect(describeVoicing(['C4', 'E4'], chord('C'))).toBeNull()
  })
})

describe('voicingCard', () => {
  it('position, layout and each member once from the bass up', () => {
    expect(voicingCard(['C3', 'E3', 'Bb3', 'D#4'], chord('C7#9'))).toEqual({ position: 'root position', layout: 'close · drop 2', degrees: ['R', '3', '♭7', '♯9'] })
    expect(voicingCard(['E3', 'C4', 'G4', 'E4'], chord('C'))).toEqual({ position: '1st inversion', layout: 'close', degrees: ['3', 'R', '5'] })
  })

  it('a note outside the chord as +note; nothing for fewer than three notes', () => {
    expect(voicingCard(['C4', 'E4', 'G4', 'F#5'], chord('C'))?.degrees).toEqual(['R', '3', '5', '+F#'])
    expect(voicingCard(['C4', 'E4'], chord('C'))).toBeNull()
  })
})

describe('presentUpperStructures', () => {
  it('names the triad the right hand plays over a dominant shell', () => {
    // C7 shell (C E Bb) with D major on top: D F# A = 9 #11 13
    const found = presentUpperStructures(['C3', 'E3', 'Bb3', 'D4', 'F#4', 'A4'], chord('C13#11'))
    expect(found.some(s => s.includes('D:') && s.includes('#11'))).toBe(true)
  })

  it('none when no triad is complete, or over a chord that is not a dominant', () => {
    expect(presentUpperStructures(['C3', 'E3', 'Bb3'], chord('C7'))).toEqual([])
    expect(presentUpperStructures(['C4', 'E4', 'G4', 'B4'], chord('Cmaj7'))).toEqual([])
  })
})

describe('neoRiemannianPath (UMT P, L, R)', () => {
  it('single moves and the shortest chain', () => {
    expect(neoRiemannianPath(chord('C'), chord('Cm'))).toBe('P')
    expect(neoRiemannianPath(chord('C'), chord('Am'))).toBe('R')
    expect(neoRiemannianPath(chord('C'), chord('Em'))).toBe('L')
    expect(neoRiemannianPath(chord('C'), chord('Ab'))?.length).toBe(2)
  })

  it('nothing for the same triad or a chord that is not a triad', () => {
    expect(neoRiemannianPath(chord('C'), chord('C'))).toBeNull()
    expect(neoRiemannianPath(chord('C'), chord('G7'))).toBeNull()
  })
})

describe('analyzeNoteSet', () => {
  it('Forte number, prime form and interval vector', () => {
    expect(analyzeNoteSet(['C4', 'E4', 'G4'], null)?.forte).toBe('3-11 · [037] · <001110>')
  })

  it('scales that hold the notes, the key tonic first', () => {
    const set = analyzeNoteSet(['D4', 'E4', 'F#4', 'A4'], 'D Major', true)!
    expect(set.fits[0]).toBe('D pentatonic major')   // fewest added notes first
    expect(set.fits).toContain('D major')
    expect(set.fromMelody).toBe(true)
    expect(set.notes).toEqual(['D', 'E', 'F#', 'A'])
  })

  it('no set class for fewer than three pitch classes', () => {
    expect(analyzeNoteSet(['C4', 'C5'], null)?.forte).toBeNull()
  })
})

describe('buildHarmonicAnalysis with the notes played', () => {
  it('voicing from the notes and P/L/R from the previous chord', () => {
    const a = buildHarmonicAnalysis('Am', 'C Major', 'C', ['C4', 'E4', 'A4'])
    expect(a.voicing).toBe('1st inversion · close')
    expect(a.transformation).toBe('R')
  })
})
