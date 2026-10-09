import { describe, it, expect, vi } from 'vitest'
import { midiToNoteName } from '../src/theory/notes'
import { isNoteOff, isSustain, setMode, setNoteChangeCallback } from '../src/input/midi'

describe('midiToNoteName', () => {
  it('converts middle C (MIDI 60) to C4', () => {
    expect(midiToNoteName(60)).toBe('C4')
  })
  it('converts A4 (MIDI 69) to A4', () => {
    expect(midiToNoteName(69)).toBe('A4')
  })
  it('converts Bb3 (MIDI 58) to Bb3', () => {
    expect(midiToNoteName(58)).toBe('Bb3')
  })
  it('converts lowest MIDI note 0 to C-1', () => {
    expect(midiToNoteName(0)).toBe('C-1')
  })
})

describe('isNoteOff', () => {
  it('treats 0x80 status as note-off', () => {
    expect(isNoteOff(0x80, 64)).toBe(true)
  })
  it('treats note-on with velocity=0 as note-off', () => {
    expect(isNoteOff(0x90, 0)).toBe(true)
  })
  it('treats note-on with velocity>0 as note-on', () => {
    expect(isNoteOff(0x90, 64)).toBe(false)
  })
  it('handles all MIDI channels for note-off (0x8F)', () => {
    expect(isNoteOff(0x8F, 64)).toBe(true)
  })
})

describe('isSustain', () => {
  it('is CC 64 on any channel', () => {
    expect(isSustain(0xB0, 64)).toBe(true)
    expect(isSustain(0xBF, 64)).toBe(true)
  })
  it('ignores other controllers and note messages', () => {
    expect(isSustain(0xB0, 1)).toBe(false)
    expect(isSustain(0x90, 64)).toBe(false)
  })
})

describe('setMode', () => {
  it('does not touch the detector when no MIDI notes were active', () => {
    const cb = vi.fn()
    setNoteChangeCallback(cb)
    setMode('hold')
    setMode('normal')
    expect(cb).not.toHaveBeenCalled()
  })
})
