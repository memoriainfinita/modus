import { describe, it, expect } from 'vitest'
import { pianoRange, pianoOctaves } from '../src/diagrams/piano'

describe('pianoRange', () => {
  it('four octaves on a wide screen', () => {
    expect(pianoRange(['C4'], 4)).toEqual({ from: 'C2', to: 'B5' })
  })

  it('two octaves on a phone, widened to the notes shown', () => {
    expect(pianoRange([], 2)).toEqual({ from: 'C3', to: 'B4' })
    expect(pianoRange(['C4', 'E4', 'G4'], 2)).toEqual({ from: 'C3', to: 'B4' })
    expect(pianoRange(['E2', 'G5'], 2)).toEqual({ from: 'C2', to: 'B5' })
  })

  it('more octaves centred on middle C', () => {
    expect(pianoRange([], 3)).toEqual({ from: 'C3', to: 'B5' })
    expect(pianoRange([], 7)).toEqual({ from: 'C1', to: 'B7' })
  })
})

describe('pianoOctaves: as many as the panel holds at its height', () => {
  it('a low wide panel gets the most, a square one the fewest', () => {
    expect(pianoOctaves(1332, 140, false)).toBe(7)
    expect(pianoOctaves(800, 223, false)).toBe(3)
    expect(pianoOctaves(300, 300, false)).toBe(2)
  })

  it('a phone keeps two; a hidden panel four', () => {
    expect(pianoOctaves(1332, 140, true)).toBe(2)
    expect(pianoOctaves(0, 0, false)).toBe(4)
  })
})
