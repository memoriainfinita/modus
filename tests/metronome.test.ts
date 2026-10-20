import { describe, it, expect } from 'vitest'
import { buildPattern, parseMeter, tapTempo } from '../src/metronome/pattern'

const kinds = (p: ReturnType<typeof buildPattern>) => p!.clicks.map(c => c.kind)

describe('parseMeter', () => {
  it('reads simple and additive meters', () => {
    expect(parseMeter('4/4')).toEqual({ numerators: [4], denominator: 4 })
    expect(parseMeter(' 2+2+3 / 8')).toEqual({ numerators: [2, 2, 3], denominator: 8 })
    expect(parseMeter('7/7')).toBeNull()
    expect(parseMeter('abc')).toBeNull()
  })
})

describe('buildPattern', () => {
  it('a meter: the first pulse strong, each group\'s first accented', () => {
    const p = buildPattern({ kind: 'meter', numerators: [2, 2, 3], denominator: 8 })!
    expect(p.beats).toBe(7)
    expect(p.groups).toEqual([2, 2, 3])
    expect(kinds(p)).toEqual(['strong', 'beat', 'accent', 'beat', 'accent', 'beat', 'beat'])
  })

  it('subdivisions: each pulse split, the extra clicks soft', () => {
    const p = buildPattern({ kind: 'meter', numerators: [2], denominator: 4 }, 3)!
    expect(p.clicks.map(c => +c.at.toFixed(3))).toEqual([0, 0.333, 0.667, 1, 1.333, 1.667])
    expect(kinds(p)).toEqual(['strong', 'sub', 'sub', 'beat', 'sub', 'sub'])
  })

  it('a tala from UMT: sam, tali and khali on its vibhags', () => {
    const p = buildPattern({ kind: 'cycle', id: 'teental' })!
    expect(p.beats).toBe(16)
    expect([0, 4, 8, 12].map(i => p.clicks[i].kind)).toEqual(['strong', 'accent', 'khali', 'accent'])
  })

  it('bulerías counts from 12, its accents from UMT', () => {
    const p = buildPattern({ kind: 'cycle', id: 'bulerias' })!
    expect(p.counts.slice(0, 3)).toEqual([12, 1, 2])
    expect(p.clicks.filter(c => c.kind === 'accent').map(c => p.counts[c.pulse])).toEqual([12, 3, 6, 8, 10])
  })

  it('a clave: its onsets over a bar of four beats', () => {
    const p = buildPattern({ kind: 'clave', id: 'son-3-2' })!
    expect(p.beats).toBe(4)
    expect(p.clicks.filter(c => c.kind !== 'sub').map(c => c.at)).toEqual([0, 0.75, 1.5, 2.5, 3])
  })

  it('a Euclidean rhythm: k onsets spread over n steps', () => {
    const p = buildPattern({ kind: 'euclid', pulses: 3, steps: 8 })!
    expect(p.clicks.filter(c => c.kind !== 'sub').length).toBe(3)
    expect(buildPattern({ kind: 'euclid', pulses: 9, steps: 8 })).toBeNull()
  })

  it('a polyrhythm 3:2: two voices over the same three beats', () => {
    const p = buildPattern({ kind: 'poly', a: 3, b: 2 })!
    expect(p.pulses).toEqual([3, 2])
    expect(p.clicks.filter(c => c.voice === 1).map(c => c.at)).toEqual([0, 1.5])
    expect(p.clicks.filter(c => c.voice === 0).map(c => c.at)).toEqual([0, 1, 2])
  })
})

describe('tapTempo', () => {
  it('the mean of the last intervals', () => {
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120)
    expect(tapTempo([0])).toBeNull()
  })
})
