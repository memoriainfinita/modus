import { describe, it, expect } from 'vitest'
import { suggestNext, substitutesFor } from '../src/detector/next'

const find = (cur: string, key: string | null, sym: string, prev: string | null = null) =>
  suggestNext(cur, key, prev).find(s => s.symbol === sym)

describe('suggestNext', () => {
  it('a secondary dominant resolves to the chord it treats as a tonic, first', () => {
    const [first] = suggestNext('A7', 'C Major')
    expect(first).toMatchObject({ symbol: 'Dm7', roman: 'ii7', function: 'S' })
    expect(first.resolution).toContain('V7/ii')
  })

  it('the key chords a dominant makes a cadence with', () => {
    expect(find('G7', 'C Major', 'Cmaj7')?.cadence?.name).toMatch(/Authentic/)
    expect(find('G7', 'C Major', 'Am7')?.cadence?.name).toMatch(/Deceptive/)
    expect(find('F', 'C Major', 'C')?.cadence?.name).toMatch(/Plagal/)
  })

  it('the named progressions the chord is in, a two-chord match first', () => {
    expect(find('Dm7', 'C Major', 'G7')?.progressions).toContain('ii-V-I')
    const g = find('G7', 'C Major', 'Cmaj7', 'Dm7')!
    expect(g.progressions[0]).toBe('ii-V-I')
    expect(find('C', 'C Major', 'Am')?.progressions).toContain('I-vi-IV-V')
  })

  it('only the progressions written in the mode of the key', () => {
    const inMajor = suggestNext('G7', 'C Major').flatMap(s => s.progressions)
    expect(inMajor).not.toContain('ii-V-i')
    expect(suggestNext('G7', 'C Major').some(s => s.symbol === 'Cm')).toBe(false)
    const inMinor = suggestNext('E7', 'A Minor')
    expect(inMinor.flatMap(s => s.progressions)).toContain('ii-V-i')
    expect(inMinor.some(s => s.symbol === 'Amaj7')).toBe(false)
  })

  it('each chord once, never the chord on screen, triads after a triad', () => {
    const list = suggestNext('C', 'C Major')
    expect(new Set(list.map(s => s.symbol)).size).toBe(list.length)
    expect(list.some(s => s.symbol === 'C')).toBe(false)
    expect(list.every(s => !/7/.test(s.symbol))).toBe(true)
  })

  it('nothing without a key or a readable chord', () => {
    expect(suggestNext('G7', null)).toEqual([])
    expect(suggestNext('?', 'C Major')).toEqual([])
  })

  it('a suggestion offers the usual borrowings UMT gives as its modal substitutes, with their mode', () => {
    const rows = suggestNext('C', 'C Major').filter(s => s.borrowings.length)
    expect(rows.length).toBeGreaterThan(0)
    const usual = ['Ddim', 'Eb', 'Fm', 'Ab', 'Bb']   // UMT 0.11's usual borrowings of C major, triads
    for (const s of rows) for (const b of s.borrowings) {
      expect(usual).toContain(b.symbol)
      expect(b.mode).toBe('aeolian')
    }
    const f = suggestNext('C', 'C Major').find(s => s.symbol === 'F')
    expect(f?.borrowings.map(b => b.symbol)).toContain('Fm')
  })

  it('no borrowing equals the chord on screen or repeats in a row', () => {
    for (const cur of ['C', 'Fm', 'G7', 'Dm7']) for (const s of suggestNext(cur, 'C Major')) {
      expect(s.borrowings.some(b => b.symbol === cur)).toBe(false)
      expect(new Set(s.borrowings.map(b => b.symbol)).size).toBe(s.borrowings.length)
    }
  })
})

describe('substitutesFor', () => {
  it("UMT's substitutes in its order, with their type", () => {
    expect(substitutesFor('G7', 'C Major')).toEqual([
      { symbol: 'Db7', type: 'tritone' }, { symbol: 'Gsus4', type: 'sus4' },
      { symbol: 'Am', type: 'deceptive' }, { symbol: 'Bm7b5', type: 'diatonic' },
    ])
    expect(substitutesFor('Dm7', 'C Major').map(s => s.symbol)).toEqual(['Fmaj7', 'Fm7', 'Bb7', 'Dm7b5'])
  })

  it('nothing without a key or a readable chord', () => {
    expect(substitutesFor('G7', null)).toEqual([])
    expect(substitutesFor('?', 'C Major')).toEqual([])
  })
})
