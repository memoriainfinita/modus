import { describe, it, expect } from 'vitest'
import { makeQuestion, answerLabel, EAR_ANSWERS, EAR_MODES } from '../src/ui/ear'
import { noteNameToMidi } from '../src/theory/notes'
import { en } from '../src/i18n/en'
import { es } from '../src/i18n/es'

// Runs against the real UMT bundle (tests/setup-umt.ts).

/** A fixed sequence of "random" numbers. */
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length] }
const midis = (names: string[]) => names.map(n => noteNameToMidi(n)!)

describe('makeQuestion', () => {
  it('an interval: the two notes one after the other, then together, the size of the answer', () => {
    for (let n = 0; n < 12; n++) {
      const q = makeQuestion('interval', seq(n / 12, 0.5))
      const [a, b] = q.steps.map(midis)
      expect(q.steps).toHaveLength(3)
      expect(b[0] - a[0]).toBe(Number(q.answer))
      expect(midis(q.steps[2])).toEqual([a[0], b[0]])
    }
  })

  it('a chord of the kind asked, on the root drawn', () => {
    const q = makeQuestion('chord', seq(6 / 10, 0))   // m7, C
    expect(q.answer).toBe('maj7')
    expect(q.symbol).toBe('Cmaj7')
    expect(midis(q.steps[0]).map(m => m % 12)).toEqual([0, 4, 7, 11])
  })

  it('a cadence: the tonic, then the two chords, near middle C with the root below', () => {
    const q = makeQuestion('cadence', seq(0, 0))   // authentic, C major
    expect(q.answer).toBe('authentic')
    expect(q.key).toBe('C Major')
    expect([q.prev, q.symbol]).toEqual(['G7', 'C'])
    expect(q.steps).toHaveLength(3)
    for (const step of q.steps) {
      const [bass, ...upper] = midis(step)
      expect(bass).toBeLessThan(48)
      expect(Math.min(...upper)).toBeGreaterThanOrEqual(55)
      expect(Math.min(...upper)).toBeLessThan(67)
    }
  })

  it('every cadence in every major key comes out', () => {
    for (let k = 0; k < 12; k++) for (let c = 0; c < 4; c++) {
      const q = makeQuestion('cadence', seq(c / 4, k / 12))
      expect(q.steps.every(s => s.length >= 4), `${q.key} ${q.answer}`).toBe(true)
    }
  })
})

describe('answers', () => {
  it('every answer has a label in both languages', () => {
    for (const mode of EAR_MODES) for (const a of EAR_ANSWERS[mode]) {
      expect(answerLabel(mode, a), `${mode} ${a}`).toBeTruthy()
      if (mode === 'chord') for (const table of [en, es] as Record<string, string>[]) expect(table[`ear.chord.${a || 'maj'}`]).toBeTruthy()
    }
    expect(answerLabel('interval', '12')).toBe('Octave')
    expect(answerLabel('cadence', 'deceptive')).toBe('Deceptive')
  })
})
