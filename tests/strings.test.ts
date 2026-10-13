import { describe, it, expect } from 'vitest'
import { whereLabel } from '../src/diagrams/guitar'

describe('whereLabel: where a shape is played', () => {
  it('open, with every fretted note in the first frets and an open string', () => {
    expect(whereLabel([3, 2, 0, 0, 0, 1])).toBe('Open')   // G7
    expect(whereLabel([0, 0, 0, 0, 0, 0])).toBe('Open')
  })

  it('open strings with the hand further up', () => {
    expect(whereLabel([-1, 0, 2, 3, 2, -1])).toBe('Open strings, from fret 2')
  })

  it('a barre: the lowest fret on three strings or more', () => {
    expect(whereLabel([3, 5, 3, 4, 3, 3])).toBe('Barre at fret 3')   // G7, E shape
  })

  it('from a fret, without a barre', () => {
    expect(whereLabel([-1, -1, 5, 7, 6, 7])).toBe('From fret 5')
  })
})
