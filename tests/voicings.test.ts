import { describe, it, expect } from 'vitest'
import { playableVoicings, tuningToMidi, normalizeNoteName, STANDARD_OPEN_MIDI } from '../src/theory/voicings'

// Runs against the real UMT bundle (tests/setup-umt.ts).
const umtVoicings = (symbol: string, open = STANDARD_OPEN_MIDI) =>
  UMT.getFretboardVoicings(UMT.parseChordSymbol(symbol), open.map(m => m - 69))
const shape = (v: { frets: number[] }) => v.frets.map(f => (f < 0 ? 'x' : f)).join('')
const bassPc = (symbol: string) => {
  const c = UMT.parseChordSymbol(symbol)
  return ((((c.bassStep ?? c.rootStep) + 9) % 12) + 12) % 12
}
const playable = (symbol: string, open = STANDARD_OPEN_MIDI) =>
  playableVoicings(umtVoicings(symbol, open), open, bassPc(symbol))

describe('playableVoicings', () => {
  it('cuts hundreds of fingerings down to a handful', () => {
    expect(umtVoicings('C').length).toBeGreaterThan(500)
    const p = playable('C')
    expect(p.length).toBeGreaterThan(3)
    expect(p.length).toBeLessThan(30)
  })

  it('puts the open shapes first', () => {
    expect(shape(playable('C')[0])).toBe('x32010')
    expect(shape(playable('G')[0])).toBe('320003')
    expect(shape(playable('Am')[0])).toBe('x02210')
  })

  it('every result has the chord bass lowest, no inner muted string and fits the hand', () => {
    for (const sym of ['C', 'F', 'G7', 'Bm7b5', 'Ebmaj7', 'C/E']) {
      for (const v of playable(sym)) {
        const sounding = v.frets.map((f: number, i: number) => (f >= 0 ? i : -1)).filter((i: number) => i >= 0)
        expect(sounding[sounding.length - 1] - sounding[0] + 1).toBe(sounding.length)
        expect((STANDARD_OPEN_MIDI[sounding[0]] + v.frets[sounding[0]]) % 12).toBe(bassPc(sym))
        const fretted = v.frets.filter((f: number) => f > 0)
        if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3)
      }
    }
  })

  it('slash chords start on the slash note', () => {
    expect(shape(playable('C/E')[0])).toBe('032010')
  })

  it('falls back to every voicing when none passes', () => {
    const odd = [{ frets: [-1, -1, -1, -1, 1, 0], baseFret: 1 }]
    expect(playableVoicings(odd, STANDARD_OPEN_MIDI, 0)).toHaveLength(1)
  })
})

describe('tuningToMidi', () => {
  it('places each string in the octave of standard tuning', () => {
    expect(tuningToMidi(['E', 'A', 'D', 'G', 'B', 'E'])).toEqual(STANDARD_OPEN_MIDI)
    expect(tuningToMidi(['D', 'A', 'D', 'G', 'B', 'E'])).toEqual([38, 45, 50, 55, 59, 64])
    expect(tuningToMidi(['d', 'g', 'd', 'g', 'b', 'd'])).toEqual([38, 43, 50, 55, 59, 62])
  })

  it('rejects anything that is not six note names', () => {
    expect(tuningToMidi(['E', 'A', 'D', 'G', 'B', 'H'])).toBeNull()
    expect(tuningToMidi(['E', 'A', 'D'])).toBeNull()
  })

  it('custom tunings get real voicings from UMT', () => {
    const openD = tuningToMidi(['D', 'A', 'D', 'F#', 'A', 'D'])!
    expect(shape(playable('D', openD)[0])).toBe('000000')
  })
})

describe('normalizeNoteName', () => {
  it('normalizes case and rejects non-notes', () => {
    expect(normalizeNoteName(' f# ')).toBe('F#')
    expect(normalizeNoteName('bb')).toBe('Bb')
    expect(normalizeNoteName('H')).toBeNull()
    expect(normalizeNoteName('C##')).toBeNull()
  })
})
