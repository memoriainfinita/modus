import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A fake MIDI access with one output that records what it is sent
const sent: number[][] = []
const output = { id: 'out-1', name: 'Synth', state: 'connected', send: (b: number[]) => sent.push([...b]) }
let inputName: string | null = 'Keys'
vi.mock('../src/input/midi', () => ({
  getMidiAccess: () => ({ inputs: new Map(), outputs: new Map([['out-1', output]]) }),
  getSelectedInputName: () => inputName,
}))

import {
  outLiveOn, outLiveOff, outSustain, outPreview, allNotesOff, chooseOutput,
  setOutputChannel, setThru, outputLoops, resetMidiOut, getOutputs,
} from '../src/output/midi-out'

beforeEach(() => {
  resetMidiOut()
  inputName = 'Keys'
  chooseOutput('out-1')
  sent.length = 0
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('MIDI out: what is sent', () => {
  it('lists the outputs', () => {
    expect(getOutputs()).toEqual([{ id: 'out-1', name: 'Synth' }])
  })

  it('computer keyboard and on-screen piano notes go out on the channel', () => {
    setOutputChannel(3)
    sent.length = 0
    outLiveOn(60, 100, 'virtual')
    outLiveOff(60, 'virtual')
    expect(sent).toEqual([[0x92, 60, 100], [0x82, 60, 0]])
  })

  it('controller notes only with Thru', () => {
    outLiveOn(60, 100, 'controller')
    outSustain(true, 'controller')
    expect(sent).toEqual([])
    setThru(true)
    outLiveOn(62, 80, 'controller')
    outSustain(true, 'controller')
    expect(sent).toEqual([[0x90, 62, 80], [0xB0, 64, 127]])
  })

  it('nothing is sent with the output off', () => {
    chooseOutput(null)
    sent.length = 0
    outLiveOn(60, 100, 'virtual')
    outPreview([60, 64], 2, true)
    expect(sent).toEqual([])
  })
})

describe('MIDI out: previews', () => {
  it('a preview ends after its duration', () => {
    outPreview([60, 64, 67], 2, true)
    expect(sent).toEqual([[0x90, 60, 90], [0x90, 64, 90], [0x90, 67, 90]])
    sent.length = 0
    vi.advanceTimersByTime(2000)
    expect(sent).toEqual([[0x80, 60, 0], [0x80, 64, 0], [0x80, 67, 0]])
  })

  it('a new preview cuts the previous one, and the old timer does not cut the new notes', () => {
    outPreview([60, 64, 67], 2, true)
    vi.advanceTimersByTime(1000)
    sent.length = 0
    outPreview([60, 65, 69], 2, true)
    expect(sent).toEqual([[0x80, 60, 0], [0x80, 64, 0], [0x80, 67, 0], [0x90, 60, 90], [0x90, 65, 90], [0x90, 69, 90]])
    sent.length = 0
    vi.advanceTimersByTime(1500)   // past the first preview's end
    expect(sent).toEqual([])
    vi.advanceTimersByTime(500)
    expect(sent).toEqual([[0x80, 60, 0], [0x80, 65, 0], [0x80, 69, 0]])
  })

  it('a piano-key preview does not cut what sounds', () => {
    outPreview([60, 64, 67], 2, true)
    sent.length = 0
    outPreview([72], 1.5, false)
    expect(sent).toEqual([[0x90, 72, 90]])
  })

  it('a key held over a preview note keeps it when the preview ends', () => {
    outPreview([60, 64], 2, true)
    outLiveOn(60, 100, 'virtual')
    sent.length = 0
    vi.advanceTimersByTime(2000)
    expect(sent).toEqual([[0x80, 64, 0]])
  })
})

describe('MIDI out: nothing left hanging', () => {
  it('All notes off releases the pedal, each note and sends CC 123', () => {
    outLiveOn(60, 100, 'virtual')
    outSustain(true, 'virtual')
    sent.length = 0
    allNotesOff()
    expect(sent).toEqual([[0xB0, 64, 0], [0x80, 60, 0], [0xB0, 123, 0]])
  })

  it('changing the channel releases on the old one first', () => {
    outLiveOn(60, 100, 'virtual')
    sent.length = 0
    setOutputChannel(2)
    expect(sent[0]).toEqual([0x80, 60, 0])
    outLiveOn(60, 100, 'virtual')
    expect(sent[sent.length - 1]).toEqual([0x91, 60, 100])
  })

  it('the same port as the input sends nothing (it would loop)', () => {
    inputName = 'Synth'
    expect(outputLoops()).toBe(true)
    outLiveOn(60, 100, 'virtual')
    expect(sent).toEqual([])
  })
})
