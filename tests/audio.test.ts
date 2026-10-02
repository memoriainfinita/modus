import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stubs for what the browser and the soundfont CDN provide.
let ctxState: 'suspended' | 'running' = 'running'
let userActive = true
const play = vi.fn()
let resolveInstrument: (inst: unknown) => void = () => {}

class FakeAudioContext {
  get state() { return ctxState }
  currentTime = 0
  resume() { if (userActive) ctxState = 'running'; return Promise.resolve() }
}

beforeEach(() => {
  vi.resetModules()
  play.mockReset()
  ctxState = 'running'
  userActive = true
  ;(globalThis as any).AudioContext = FakeAudioContext
  ;(globalThis as any).Soundfont = {
    instrument: () => new Promise(res => { resolveInstrument = res }),
  }
  Object.defineProperty(navigator, 'userActivation', {
    configurable: true,
    get: () => ({ isActive: userActive }),
  })
})

async function loadAudio() {
  const audio = await import('../src/audio')
  const missed = vi.fn()
  audio.setAudioMissedCallback(missed)
  return { audio, missed }
}

describe('audio playback', () => {
  it('a note before the instrument loads is dropped and reported', async () => {
    const { audio, missed } = await loadAudio()
    audio.preloadAudio()
    audio.playNote(60)
    expect(missed).toHaveBeenCalledOnce()
    expect(play).not.toHaveBeenCalled()
  })

  it('once loaded, notes play', async () => {
    const { audio, missed } = await loadAudio()
    audio.preloadAudio()
    resolveInstrument({ play })
    await Promise.resolve(); await Promise.resolve()
    audio.playNote(60)
    await Promise.resolve(); await Promise.resolve()
    expect(play).toHaveBeenCalledWith(60, 0, expect.objectContaining({ duration: 1.5 }))
    expect(missed).not.toHaveBeenCalled()
  })

  it('a MIDI note on a suspended context without a gesture is dropped, not queued', async () => {
    const { audio, missed } = await loadAudio()
    audio.preloadAudio()
    resolveInstrument({ play })
    await Promise.resolve(); await Promise.resolve()
    ctxState = 'suspended'
    userActive = false
    audio.playNote(60)
    await Promise.resolve(); await Promise.resolve()
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
    await Promise.resolve(); await Promise.resolve()
    audio.playNote(60)
    await Promise.resolve(); await Promise.resolve()
    expect(play).toHaveBeenCalled()
    expect(oldPlay).not.toHaveBeenCalled()
  })
})
