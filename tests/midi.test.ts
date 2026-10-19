// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { midiToNoteName } from '../src/theory/notes'
import { isNoteOff, isSustain, setMode, setNoteChangeCallback, setSoundCallbacks, handleMidiMessage, setInputChannel, getVelocity, setHeardNotes } from '../src/input/midi'

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

describe('input channel filter', () => {
  const msg = (...bytes: number[]) => handleMidiMessage({ data: new Uint8Array(bytes) })
  const setup = () => {
    const on = vi.fn(), off = vi.fn(), sustain = vi.fn()
    setSoundCallbacks({ noteOn: on, noteOff: off, sustain })
    setNoteChangeCallback(() => {})
    setMode('normal')
    return { on, off, sustain }
  }

  it('all channels by default; with a channel set, the others are ignored', () => {
    const { on } = setup()
    setInputChannel(0)
    msg(0x93, 60, 100); msg(0x83, 60, 0)
    expect(on).toHaveBeenCalledTimes(1)
    setInputChannel(2)
    msg(0x90, 62, 100)                       // channel 1
    expect(on).toHaveBeenCalledTimes(1)
    msg(0x91, 64, 100); msg(0x81, 64, 0)     // channel 2
    expect(on).toHaveBeenCalledTimes(2)
    setInputChannel(0)
  })

  it('a note let in is let out after the filter changes, and the pedal is released', () => {
    const { off, sustain } = setup()
    setInputChannel(1)
    msg(0x90, 65, 90)
    msg(0xB0, 64, 127)
    setInputChannel(3)
    expect(sustain).toHaveBeenLastCalledWith(false, 'controller')
    msg(0x80, 65, 0)
    expect(off).toHaveBeenCalledWith(65, 'controller')
    msg(0x80, 67, 0)                         // never let in, other channel
    expect(off).toHaveBeenCalledTimes(1)
    setInputChannel(0)
  })

  it('keeps the velocity each note was struck with', () => {
    setup()
    msg(0x90, 70, 37); msg(0x80, 70, 0)
    expect(getVelocity(70)).toBe(37)
    expect(getVelocity(71)).toBeNull()
  })
})

describe('heard notes', () => {
  it('each source keeps its own: the microphone stopping does not let go of the Player\'s chord', () => {
    const cb = vi.fn()
    setNoteChangeCallback(cb)
    setMode('normal')
    setHeardNotes([48, 52, 55], 80, 'player')
    setHeardNotes([57], 80, 'mic')
    expect(cb.mock.calls.at(-1)?.[0]).toEqual([48, 52, 55, 57])
    setHeardNotes([], 0, 'mic')
    expect(cb.mock.calls.at(-1)?.[0]).toEqual([48, 52, 55])
    setHeardNotes([], 0, 'player')
    expect(cb.mock.calls.at(-1)?.[0]).toEqual([])
  })
})
