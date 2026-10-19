import { describe, it, expect } from 'vitest'
import { entrySeconds, timedRun, harmonicRhythm } from '../src/history/rhythm'
import type { HistoryEntry } from '../src/types'

// Newest first, as the history keeps them. Times in ms.
const e = (symbol: string, at?: number, until?: number): HistoryEntry => ({ id: symbol + at, symbol, notes: [], at, until })

describe('entrySeconds', () => {
  it('until its release, or until the next chord when it was held into it', () => {
    const list = [e('G7', 4000, 6000), e('Dm7', 2000), e('C', 0, 1500)]
    expect(entrySeconds(list, 0)).toBe(2)     // released
    expect(entrySeconds(list, 1)).toBe(2)     // held into G7
    expect(entrySeconds(list, 2)).toBe(1.5)   // released before Dm7: the silence does not count
  })

  it('unknown while the newest still sounds, or without a time', () => {
    expect(entrySeconds([e('C', 0)], 0)).toBeNull()
    expect(entrySeconds([e('C')], 0)).toBeNull()
  })
})

describe('timedRun', () => {
  it('the newest timed chords in playing order; an older one without a time ends the run', () => {
    const list = [e('G7', 4000, 6000), e('Dm7', 2000), e('C', 0, 2000), e('F'), e('Am', -9000, -8000)]
    expect(timedRun(list)).toEqual({ symbols: ['C', 'Dm7', 'G7'], seconds: [2, 2, 2] })
  })
})

describe('harmonicRhythm', () => {
  const list = [e('G7', 4000, 6000), e('Dm7', 2000), e('C', 0, 2000)]

  it('without a tempo, the mean time a chord lasts', () => {
    expect(harmonicRhythm(list, 0, 4)).toEqual({ kind: 'seconds', secondsPerChange: 2 })
  })

  it('with a tempo, chord changes per bar as UMT reads them', () => {
    // 2 s at 120 bpm is 4 beats: a chord per bar of 4/4, two changes in three bars
    const r = harmonicRhythm(list, 120, 4)
    expect(r?.kind).toBe('per-bar')
    expect(r && r.kind === 'per-bar' ? r.changes : NaN).toBeCloseTo(2 / 3)
  })

  it('nothing with fewer than two timed chords', () => {
    expect(harmonicRhythm([e('C', 0, 1000)], 120, 4)).toBeNull()
  })
})
