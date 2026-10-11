import { describe, it, expect } from 'vitest'
import { formatTime, computePeaks, loopTarget } from '../src/ui/player'

describe('player', () => {
  it('writes times as minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(75.4)).toBe('1:15')
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(75.46, true)).toBe('1:15.4')
    expect(formatTime(0.3, true)).toBe('0:00.3')
  })

  it('a waveform peak per column, the loudest sample of its slice', () => {
    const s = new Float32Array([0, 0.5, -0.9, 0.1, 0.2, -0.3, 0, 0])
    expect(computePeaks(s, 4).map(p => Math.round(p * 10) / 10)).toEqual([0.5, 0.9, 0.3, 0])
  })

  it('the loop goes back to A at B, or at the end with no B; no A, no loop', () => {
    expect(loopTarget(9.9, 2, 10, 60)).toBeNull()
    expect(loopTarget(10, 2, 10, 60)).toBe(2)
    expect(loopTarget(60, 2, null, 60)).toBe(2)
    expect(loopTarget(30, null, null, 60)).toBeNull()
    expect(loopTarget(30, 5, 3, 60)).toBeNull()   // B before A is no end
  })
})
