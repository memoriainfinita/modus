import { describe, it, expect } from 'vitest'
import { soundingAt } from '../src/audio-notes/notes'

describe('soundingAt', () => {
  const notes = [
    { midi: 48, start: 0, end: 2 }, { midi: 64, start: 0.02, end: 0.9 },
    { midi: 55, start: 0.01, end: 1.95 }, { midi: 60, start: 1.0, end: 2 }, { midi: 48, start: 1.0, end: 2 },
  ]

  it('the notes started by then and not yet ended, low to high, each once', () => {
    expect(soundingAt(notes, 0.5)).toEqual([48, 55, 64])
    expect(soundingAt(notes, 1.5)).toEqual([48, 55, 60])
  })

  it('a note that ended just before is still read (the model reads ends a little early)', () => {
    expect(soundingAt(notes, 0.93)).toEqual([48, 55, 64])
    expect(soundingAt(notes, 1.0)).toEqual([48, 55, 60])
  })

  it('nothing before the first note', () => {
    expect(soundingAt(notes, -0.1)).toEqual([])
  })
})
