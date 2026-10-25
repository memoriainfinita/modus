import { describe, it, expect } from 'vitest'
import { scaleSymbol, scaleInfo, systemsFor, scalePositions, shapeName } from '../src/theory/scales'
import { INSTRUMENT_TUNINGS } from '../src/theory/instruments'

const GUITAR = INSTRUMENT_TUNINGS.guitar.standard
const UKULELE = INSTRUMENT_TUNINGS.ukulele.standard

describe('scaleSymbol: the scale on the key\'s tonic', () => {
  it('the key\'s own, a church mode included', () => {
    expect(scaleSymbol('A Minor', 'key')).toBe('A Minor')
    expect(scaleSymbol('D Dorian', 'key')).toBe('D Dorian')
  })

  it('pentatonic and blues follow the third of the key', () => {
    expect(scaleSymbol('A Minor', 'pentatonic')).toBe('A Pentatonic Minor')
    expect(scaleSymbol('C Major', 'pentatonic')).toBe('C Pentatonic Major')
    expect(scaleSymbol('E Phrygian', 'blues')).toBe('E Blues')
    expect(scaleSymbol('G Mixolydian', 'blues')).toBe('G Blues Major')
  })

  it('harmonic and melodic minor on the tonic; nothing for an unknown key', () => {
    expect(scaleSymbol('C Major', 'harmonicMinor')).toBe('C Harmonic Minor')
    expect(scaleSymbol('F# Minor', 'melodicMinor')).toBe('F# Melodic Minor')
    expect(scaleSymbol('H Major', 'key')).toBeNull()
  })
})

describe('scaleInfo: degrees read from the letters UMT writes', () => {
  it('minor and the modes', () => {
    expect(scaleInfo('A Minor')!.degreeLabels).toEqual(['1', '2', '♭3', '4', '5', '♭6', '♭7'])
    expect(scaleInfo('D Dorian')!.degreeLabels).toEqual(['1', '2', '♭3', '4', '5', '6', '♭7'])
    expect(scaleInfo('F# Lydian')!.degreeLabels).toEqual(['1', '2', '3', '♯4', '5', '6', '7'])
  })

  it('scales of other sizes, without the octave UMT ends on', () => {
    const blues = scaleInfo('E Blues')!
    expect(blues.names).toEqual(['E', 'G', 'A', 'A#', 'B', 'D'])
    expect(blues.degreeLabels).toEqual(['1', '♭3', '4', '♯4', '5', '♭7'])
    expect(scaleInfo('C Pentatonic Major')!.degreeLabels).toEqual(['1', '2', '3', '5', '6'])
    expect(scaleInfo('A Harmonic Minor')!.pitchClasses).toEqual([9, 11, 0, 2, 4, 5, 8])
  })

  it('null for a symbol UMT does not know', () => {
    expect(scaleInfo('C Nonsense')).toBeNull()
    expect(scaleInfo(null)).toBeNull()
  })
})

describe('systemsFor: the systems a scale and instrument allow', () => {
  it('a seven-note scale on a guitar in standard tuning: all three', () => {
    expect(systemsFor(scaleInfo('A Minor')!, GUITAR)).toEqual(['neck', 'caged', '3nps'])
  })

  it('no CAGED without the tonic\'s pentatonic, no 3nps under seven notes', () => {
    expect(systemsFor(scaleInfo('A Harmonic Minor')!, GUITAR)).toEqual(['neck', '3nps'])
    expect(systemsFor(scaleInfo('A Pentatonic Minor')!, GUITAR)).toEqual(['neck', 'caged'])
  })

  it('no CAGED off a 6-string guitar', () => {
    expect(systemsFor(scaleInfo('C Major')!, UKULELE)).toEqual(['neck', '3nps'])
  })
})

describe('scalePositions', () => {
  it('the whole neck is one position, frets 0–12', () => {
    const [neck, ...rest] = scalePositions(scaleInfo('A Minor')!, GUITAR, 'neck')
    expect(rest).toEqual([])
    expect(neck.frets[0]).toEqual([0, 1, 3, 5, 7, 8, 10, 12])
    expect(neck.degrees[0]).toEqual([5, 6, 7, 1, 2, 3, 4, 5])
  })

  it('the CAGED shapes in UMT\'s order, minor names on a minor tonic', () => {
    expect(scalePositions(scaleInfo('A Minor')!, GUITAR, 'caged').map(p => p.name))
      .toEqual(['Em shape', 'Dm shape', 'Cm shape', 'Am shape', 'Gm shape'])
  })

  it('a pattern per degree with 3nps; on a ukulele too wide to play', () => {
    expect(scalePositions(scaleInfo('G Major')!, GUITAR, '3nps')).toHaveLength(7)
    expect(Math.min(...scalePositions(scaleInfo('C Major')!, UKULELE, '3nps').map(p => p.span))).toBeGreaterThan(6)
  })
})

describe('shapeName', () => {
  it('reads UMT\'s names', () => {
    expect(shapeName('E shape')).toEqual({ caged: 'E' })
    expect(shapeName('Gm shape')).toEqual({ caged: 'Gm' })
    expect(shapeName('Pattern 3')).toEqual({ pattern: 3 })
    expect(shapeName('')).toBeNull()
  })
})
