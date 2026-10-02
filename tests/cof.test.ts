import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/audio', () => ({ playNoteByName: vi.fn(), playChord: vi.fn() }))

import { renderCircleOfFifths } from '../src/diagrams'
import type { CofOptions } from '../src/diagrams'

const OPTS: CofOptions = { accidental: 'flat', showMinor: true, showDegrees: false, show7ths: false }

function render(key: string | null, opts: Partial<CofOptions> = {}, chord: string | null = null, onClick = () => {}) {
  const el = document.createElement('div')
  renderCircleOfFifths(el, key, chord, onClick, 200, { ...OPTS, ...opts })
  return el
}
const segment = (el: HTMLElement, chord: string) => el.querySelector<SVGPathElement>(`[data-chord="${chord}"]`)!
const TONIC = '#4f46e5'

describe('circle of fifths: active key', () => {
  it('a minor key puts the tonic colour on the minor segment', () => {
    const el = render('A Minor')
    expect(segment(el, 'Am').getAttribute('fill')).toBe(TONIC)
    expect(segment(el, 'C').getAttribute('fill')).not.toBe(TONIC)
  })

  it('a minor key highlights its own diatonic chords, not the parallel major ones', () => {
    const el = render('A Minor')
    // A minor shares C major's chords: F, C, G are diatonic; A major's E is not
    expect(segment(el, 'F').getAttribute('fill')).toBe('#252550')
    expect(segment(el, 'E').getAttribute('fill')).toBe('#2d2d44')
  })

  it('matches the key by pitch class (F# Major on the Gb segment in flat mode)', () => {
    expect(segment(render('F# Major'), 'Gb').getAttribute('fill')).toBe(TONIC)
    expect(segment(render('Db Major', { accidental: 'sharp' }), 'C#').getAttribute('fill')).toBe(TONIC)
  })

  it('sharp mode writes A#m opposite C#', () => {
    const texts = [...render(null, { accidental: 'sharp' }).querySelectorAll('text')].map(t => t.textContent)
    expect(texts).toContain('A#m')
    expect(texts).not.toContain('Bbm')
  })
})

describe('circle of fifths: degrees', () => {
  const degrees = (el: HTMLElement) => [...el.querySelectorAll('text')].map(t => t.textContent)

  it('each diminished segment shows its own degree', () => {
    const t = degrees(render('C Major', { showDegrees: true }))
    expect(t).toContain('vii°')
    expect(t).toContain('♭v°')   // F#° in C
    expect(t.filter(x => x === 'vii°')).toHaveLength(1)
  })

  it('minor keys count from the minor tonic', () => {
    const t = degrees(render('A Minor', { showDegrees: true }))
    expect(t).toEqual(expect.arrayContaining(['i', 'III', 'v', 'iv', 'VI', 'VII', 'ii°']))
  })
})

describe('circle of fifths: clicks', () => {
  it('reports the chord and the key each segment stands for', () => {
    const onClick = vi.fn()
    const el = render('C Major', {}, null, onClick)
    segment(el, 'G').dispatchEvent(new MouseEvent('click'))
    segment(el, 'Em').dispatchEvent(new MouseEvent('click'))
    segment(el, 'Bdim').dispatchEvent(new MouseEvent('click'))
    expect(onClick.mock.calls).toEqual([['G', 'G Major'], ['Em', 'E Minor'], ['Bdim', null]])
  })
})
