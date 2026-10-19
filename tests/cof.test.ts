// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

import { renderCircleOfFifths, cofAccidentalFor } from '../src/diagrams/cof'
import type { CofOptions } from '../src/diagrams/cof'

const OPTS: CofOptions = { accidental: 'flat', showMinor: true, showDegrees: false, show7ths: false }

function render(key: string | null, opts: Partial<CofOptions> = {}, chord: string | null = null, onClick = () => {}) {
  const el = document.createElement('div')
  renderCircleOfFifths(el, key, chord, onClick, 200, { ...OPTS, ...opts })
  return el
}
const segment = (el: HTMLElement, chord: string) => el.querySelector<SVGPathElement>(`[data-chord="${chord}"]`)!
const TONIC = '#d9c9a3'

describe('circle of fifths: active key', () => {
  it('a minor key puts the tonic colour on the minor segment', () => {
    const el = render('A Minor')
    expect(segment(el, 'Am').getAttribute('fill')).toBe(TONIC)
    expect(segment(el, 'C').getAttribute('fill')).not.toBe(TONIC)
  })

  it('a minor key highlights its own diatonic chords, not the parallel major ones', () => {
    const el = render('A Minor')
    // A minor shares C major's chords: F, C, G are diatonic; A major's E is not
    expect(segment(el, 'F').getAttribute('fill')).toBe('#2e2e2e')
    expect(segment(el, 'E').getAttribute('fill')).toBe('#1a1a1a')
  })

  it('matches the key by pitch class (F# Major on the Gb segment in flat mode)', () => {
    expect(segment(render('F# Major'), 'Gb').getAttribute('fill')).toBe(TONIC)
    expect(segment(render('Db Major', { accidental: 'sharp' }), 'C#').getAttribute('fill')).toBe(TONIC)
  })

  it('the chord is marked in the colour of its function in the key, not of its quality', () => {
    expect(segment(render('C Major', {}, 'G7'), 'G').getAttribute('fill')).toBe('#f87171')
    expect(segment(render('C Major', {}, 'Dm'), 'Dm').getAttribute('fill')).toBe('#f59e0b')
    // Without a key there is no function: the mark is ink
    expect(segment(render(null, {}, 'G7'), 'G').getAttribute('fill')).toBe('#b8a47a')
  })

  it('sharp mode writes A#m opposite C#', () => {
    const texts = [...render(null, { accidental: 'sharp' }).querySelectorAll('text')].map(t => t.textContent)
    expect(texts).toContain('A#m')
    expect(texts).not.toContain('Bbm')
  })

  it('sharp mode keeps Ab and Eb: G# and D# major need double sharps', () => {
    const texts = [...render(null, { accidental: 'sharp' }).querySelectorAll('text')].map(t => t.textContent)
    expect(texts).toEqual(expect.arrayContaining(['F#', 'C#', 'Ab', 'Eb']))
    expect(texts).not.toContain('G#')
    expect(texts).not.toContain('D#')
  })
})

describe('circle of fifths: sevenths', () => {
  it('the dominant seventh sits on V in major and on VII in minor', () => {
    expect(segment(render('C Major', { show7ths: true }), 'G7')).not.toBeNull()
    expect(segment(render('C Major', { show7ths: true }), 'Fmaj7')).not.toBeNull()
    const minor = render('A Minor', { show7ths: true })
    expect(segment(minor, 'G7')).not.toBeNull()
    expect(segment(minor, 'Cmaj7')).not.toBeNull()
    expect(segment(minor, 'Fmaj7')).not.toBeNull()
  })
})

describe('circle of fifths: degrees', () => {
  const degrees = (el: HTMLElement) => [...el.querySelectorAll('text')].map(t => t.textContent)

  it('each diminished segment shows its own degree', () => {
    const t = degrees(render('C Major', { showDegrees: true }))
    expect(t).toContain('vii°')
    expect(t).toContain('♯iv°')   // F#° in C, by its letter as the analysis panel reads it
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

describe('cofAccidentalFor', () => {
  it('with a key, the signature decides; the buttons only without one', () => {
    expect(cofAccidentalFor('E Major', 'flat')).toBe('sharp')
    expect(cofAccidentalFor('Bb Major', 'sharp')).toBe('flat')
    expect(cofAccidentalFor('C Major', 'sharp')).toBe('flat')
    expect(cofAccidentalFor('E Minor', 'flat')).toBe('sharp')
    expect(cofAccidentalFor(null, 'sharp')).toBe('sharp')
  })
})
