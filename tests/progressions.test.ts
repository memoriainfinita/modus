import { describe, it, expect } from 'vitest'
import { PROGRESSION_IDS, progressionKey, realizeProgression } from '../src/ui/progressions'
import { en } from '../src/i18n/en'
import { es } from '../src/i18n/es'

// Runs against the real UMT bundle (tests/setup-umt.ts).

describe('progressionKey', () => {
  it('writes a progression in the key given, in the progression\'s mode', () => {
    expect(progressionKey('ii-V-I', 'D Major')).toBe('D Major')
    expect(progressionKey('ii-V-i', 'D Major')).toBe('D Minor')
    expect(progressionKey('I-IV-V', 'A Minor')).toBe('A Major')
  })

  it('without a key, the progression\'s own key, or C major / A minor', () => {
    expect(progressionKey('rhythm-changes', null)).toBe('Bb Major')
    expect(progressionKey('ii-V-I', null)).toBe('C Major')
    expect(progressionKey('andalusian', null)).toBe('A Minor')
  })
})

describe('realizeProgression', () => {
  it('a ii-V-I in C: the chords, their numerals and the cadence into the tonic', () => {
    const p = realizeProgression('ii-V-I', 'C Major')
    expect(p.map(c => c.symbol)).toEqual(['Dm7', 'G7', 'Cmaj7'])
    expect(p.map(c => c.roman)).toEqual(['ii7', 'V7', 'Imaj7'])
    expect(p[2].cadence).toMatch(/^Authentic/)
    expect(p.map(c => c.fn)).toEqual(['S', 'D', 'T'])
  })

  it('bars with two chords keep their bar', () => {
    const p = realizeProgression('blues-jazz', 'Bb Major')
    expect(p.length).toBe(15)
    expect(p.filter(c => c.bar === 3).map(c => c.symbol)).toEqual(['Fm7', 'Bb7'])
    expect(Math.max(...p.map(c => c.bar))).toBe(11)
  })

  it('every progression comes out, and has a name and a text in both languages', () => {
    for (const id of PROGRESSION_IDS) {
      expect(realizeProgression(id, progressionKey(id, null)).length, id).toBeGreaterThan(2)
      for (const table of [en, es] as Record<string, string>[]) {
        expect(table[`prog.${id}`], id).toBeTruthy()
        expect(table[`prog.${id}.about`], id).toBeTruthy()
      }
    }
  })

  it('every one of UMT\'s named progressions is offered', () => {
    expect([...PROGRESSION_IDS].sort()).toEqual(Object.keys(UMT.PROGRESSIONS).sort())
  })
})

describe('blues', () => {
  it('the 12-bar blues reads I7, IV7, V7 as the key\'s own, not secondary dominants', () => {
    const p = realizeProgression('blues-12', 'C Major')
    expect(p.map(c => c.roman)).toEqual(['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'])
    expect(p.map(c => c.fn).slice(0, 5)).toEqual(['T', 'T', 'T', 'T', 'S'])
  })

  it('the jazz blues turnaround stays in the key', () => {
    expect(realizeProgression('blues-jazz', 'Bb Major').some(c => c.modulation)).toBe(false)
  })
})
