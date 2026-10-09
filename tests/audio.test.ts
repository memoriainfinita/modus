import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stubs for what the browser and the soundfont CDN provide.
let ctxState: 'suspended' | 'running' = 'running'
let userActive = true
let resolveInstrument: (inst: unknown) => void = () => {}
let instrumentOptions: any = null
const masterSet = vi.fn()

// Each played note returns a node whose stop() is recorded.
type FakeNode = { midi: number; opts: any; stop: ReturnType<typeof vi.fn> }
let nodes: FakeNode[] = []
const play = vi.fn((midi: number, _when: number, opts: any) => {
  const node = { midi, opts, stop: vi.fn() }
  nodes.push(node)
  return node
})

class FakeAudioContext {
  get state() { return ctxState }
  currentTime = 0
  destination = {}
  resume() { if (userActive) ctxState = 'running'; return Promise.resolve() }
  createGain() { return { gain: { value: 1, setTargetAtTime: masterSet }, connect: () => {} } }
}

beforeEach(() => {
  vi.resetModules()
  play.mockClear()
  masterSet.mockReset()
  nodes = []
  ctxState = 'running'
  userActive = true
  instrumentOptions = null
  ;(globalThis as any).AudioContext = FakeAudioContext
  ;(globalThis as any).Soundfont = {
    instrument: (_ctx: unknown, _name: string, opts: unknown) => {
      instrumentOptions = opts
      return new Promise(res => { resolveInstrument = res })
    },
  }
  Object.defineProperty(navigator, 'userActivation', {
    configurable: true,
    get: () => ({ isActive: userActive }),
  })
})

async function flush() { await Promise.resolve(); await Promise.resolve() }

async function loadAudio() {
  const audio = await import('../src/audio')
  const missed = vi.fn()
  const status = vi.fn()
  audio.setAudioMissedCallback(missed)
  audio.setAudioStatusCallback(status)
  return { audio, missed, status }
}

async function loadedAudio() {
  const loaded = await loadAudio()
  loaded.audio.preloadAudio()
  resolveInstrument({ play })
  await flush()
  return loaded
}

const live = (midi: number) => nodes.filter(n => n.midi === midi && !('duration' in n.opts))

describe('audio loading', () => {
  it('a note before the instrument loads is dropped and reported', async () => {
    const { audio, missed } = await loadAudio()
    audio.preloadAudio()
    audio.liveNoteOn(60, 100)
    expect(missed).toHaveBeenCalledOnce()
    expect(play).not.toHaveBeenCalled()
  })

  it('a MIDI note on a suspended context without a gesture is dropped, not queued', async () => {
    const { audio, missed } = await loadedAudio()
    ctxState = 'suspended'
    userActive = false
    audio.liveNoteOn(60, 100)
    await flush()
    expect(missed).toHaveBeenCalledOnce()
    expect(play).not.toHaveBeenCalled()
  })

  it('switching instrument mid-load keeps only the newest one', async () => {
    const { audio } = await loadAudio()
    audio.preloadAudio()
    const first = resolveInstrument
    audio.setInstrument('violin')
    const second = resolveInstrument
    const oldPlay = vi.fn()
    second({ play })
    first({ play: oldPlay })
    await flush()
    audio.playNoteByName('C4')
    expect(play).toHaveBeenCalled()
    expect(oldPlay).not.toHaveBeenCalled()
  })

  it('without the soundfont-player script the status is error and nothing throws', async () => {
    delete (globalThis as any).Soundfont
    const { audio, status, missed } = await loadAudio()
    expect(() => audio.preloadAudio()).not.toThrow()
    expect(status).toHaveBeenLastCalledWith('error')
    expect(() => audio.liveNoteOn(60, 100)).not.toThrow()
    expect(missed).toHaveBeenCalled()
  })

  it('the instrument plays into the master gain', async () => {
    await loadedAudio()
    expect(instrumentOptions.destination).toBeDefined()
  })
})

describe('controller notes', () => {
  it('sound with their velocity and no fixed duration', async () => {
    const { audio } = await loadedAudio()
    audio.liveNoteOn(60, 127)
    audio.liveNoteOn(64, 32)
    expect(play).toHaveBeenCalledWith(60, 0, { gain: 1 })
    expect(play).toHaveBeenCalledWith(64, 0, { gain: 32 / 127 })
  })

  it('stop on note-off', async () => {
    const { audio } = await loadedAudio()
    audio.liveNoteOn(60, 100)
    audio.liveNoteOff(60)
    expect(live(60)[0].stop).toHaveBeenCalled()
  })

  it('a repeated key retriggers: the previous node stops', async () => {
    const { audio } = await loadedAudio()
    audio.liveNoteOn(60, 100)
    audio.liveNoteOn(60, 100)
    const [first, second] = live(60)
    expect(first.stop).toHaveBeenCalled()
    expect(second.stop).not.toHaveBeenCalled()
  })

  it('the sustain pedal holds released notes until it lifts', async () => {
    const { audio } = await loadedAudio()
    audio.setSustain(true)
    audio.liveNoteOn(60, 100)
    audio.liveNoteOff(60)
    expect(live(60)[0].stop).not.toHaveBeenCalled()
    audio.setSustain(false)
    expect(live(60)[0].stop).toHaveBeenCalled()
  })

  it('lifting the pedal does not stop keys still held', async () => {
    const { audio } = await loadedAudio()
    audio.setSustain(true)
    audio.liveNoteOn(60, 100)
    audio.setSustain(false)
    expect(live(60)[0].stop).not.toHaveBeenCalled()
  })
})

describe('previews', () => {
  it('a new chord cuts the previous one', async () => {
    const { audio } = await loadedAudio()
    audio.playNoteNames(['C4', 'E4', 'G4'])
    const first = [...nodes]
    audio.playNoteNames(['D4', 'F4', 'A4'])
    expect(first.every(n => n.stop.mock.calls.length > 0)).toBe(true)
    expect(nodes.slice(3).every(n => n.stop.mock.calls.length === 0)).toBe(true)
  })

  it('a chord does not cut controller notes', async () => {
    const { audio } = await loadedAudio()
    audio.liveNoteOn(48, 100)
    audio.playNoteNames(['C4', 'E4', 'G4'])
    audio.playNoteNames(['D4', 'F4', 'A4'])
    expect(live(48)[0].stop).not.toHaveBeenCalled()
  })

  it('previews keep their fixed duration', async () => {
    const { audio } = await loadedAudio()
    audio.playNoteByName('C4')
    expect(play).toHaveBeenCalledWith(60, 0, expect.objectContaining({ duration: 1.5 }))
  })
})

describe('volume', () => {
  it('moves the master gain, so sounding notes follow it', async () => {
    const { audio } = await loadedAudio()
    audio.setVolume(0.3)
    expect(masterSet).toHaveBeenCalledWith(0.3, 0, expect.any(Number))
  })
})
