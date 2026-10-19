import { describe, it, expect } from 'vitest'
import { suggestNext } from '../src/detector/next'

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
})
