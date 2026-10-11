import { describe, it, expect } from 'vitest'
import { pianoRange } from '../src/diagrams/piano'

describe('pianoRange', () => {
  it('four octaves on a wide screen', () => {
    expect(pianoRange(['C4'], false)).toEqual({ from: 'C2', to: 'B5' })
  })

  it('two octaves on a phone, widened to the notes shown', () => {
    expect(pianoRange([], true)).toEqual({ from: 'C3', to: 'B4' })
    expect(pianoRange(['C4', 'E4', 'G4'], true)).toEqual({ from: 'C3', to: 'B4' })
    expect(pianoRange(['E2', 'G5'], true)).toEqual({ from: 'C2', to: 'B5' })
  })
})
