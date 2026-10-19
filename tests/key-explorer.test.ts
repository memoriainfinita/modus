// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

import { buildKeyMap, sameChord } from '../src/theory/key-map'
import { renderKeyExplorer } from '../src/diagrams/key-explorer'
import type { KeyExplorerOptions } from '../src/diagrams/key-explorer'

const OPTS: KeyExplorerOptions = { sevenths: false, showNegative: true, showParallel: true, showColtrane: true, fontScale: 11 }

describe('buildKeyMap: diatonic chords', () => {
  it('C major triads with degree and function', () => {
    const m = buildKeyMap('C Major', false)!
    expect(m.diatonic.map(c => c.symbol)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'])
    expect(m.diatonic.map(c => c.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
    expect(m.diatonic.map(c => c.function)).toEqual(['T', 'S', 'T', 'S', 'D', 'T', 'D'])
  })

  it('sevenths, and letters of the key (E# in F# major)', () => {
    expect(buildKeyMap('F# Major', true)!.diatonic.map(c => c.symbol))
      .toEqual(['F#maj7', 'G#m7', 'A#m7', 'Bmaj7', 'C#7', 'D#m7', 'E#m7b5'])
  })

  it('a minor key lists natural minor, with the harmonic-minor V7 and vii°7 under v and VII', () => {
    const m = buildKeyMap('A Minor', true)!
    expect(m.diatonic.map(c => c.roman)).toEqual(['i7', 'iiø7', 'IIImaj7', 'iv7', 'v7', 'VImaj7', 'VII7'])
    expect(m.diatonic[6].secondary).toBe('V7/III')   // what the analysis panel shows for G7
    expect(m.diatonic[4].alternative?.symbol).toBe('E7')
    expect(m.diatonic[6].alternative?.symbol).toBe('G#dim7')
    expect(m.diatonic.filter(c => c.alternative)).toHaveLength(2)
    // UMT no longer lists them as borrowed; i(maj7) and III+ still are
    const harmonic = m.parallel.find(p => p.mode === 'harmonic minor')!
    expect(harmonic.chords.map(c => c.symbol)).not.toContain('E7')
    expect(harmonic.chords.map(c => c.symbol)).toContain('AmM7')
  })

  it('parallel modes in triads too, the characteristic ones marked', () => {
    const m = buildKeyMap('C Major', false)!
    const lydian = m.parallel.find(p => p.mode === 'lydian')!
    expect(lydian.chords.map(c => c.symbol)).toContain('D')
    const aeolian = m.parallel.find(p => p.mode === 'aeolian')!
    expect(aeolian.chords.find(c => c.symbol === 'Ab')?.characteristic).toBe(true)
    expect(aeolian.chords.find(c => c.symbol === 'Cm')?.characteristic).toBe(false)
  })

  it('null for a key UMT cannot read', () => {
    expect(buildKeyMap('H Major', false)).toBeNull()
  })
})

describe('buildKeyMap: negative harmony, parallel modes, Coltrane axis', () => {
  it('negative harmony per diatonic chord, written in the key', () => {
    expect(buildKeyMap('C Major', false)!.negative).toEqual(['Cm', 'Bb', 'Ab', 'Gm', 'Fm', 'Eb', 'Ddim'])
    // UMT names the mirror of C in A minor Gbm: the key writes it F#m
    expect(buildKeyMap('A Minor', false)!.negative[2]).toBe('F#m')
  })

  it('parallel modes brightest first, chords outside the key only', () => {
    const m = buildKeyMap('C Major', true)!
    expect(m.parallel[0].mode).toBe('lydian')
    expect(m.parallel[m.parallel.length - 1].mode).toBe('locrian')
    const aeolian = m.parallel.find(p => p.mode === 'aeolian')!
    expect(aeolian.chords.map(c => c.symbol)).toEqual(expect.arrayContaining(['Fm7', 'Abmaj7', 'Bb7']))
    expect(aeolian.chords.find(c => c.symbol === 'Abmaj7')!.roman).toBe('bVImaj7')
    // F#m7b5 of C lydian: its degree takes the letter F, not G
    expect(m.parallel[0].chords.find(c => c.symbol === 'F#m7b5')!.roman).toBe('#ivø7')
  })

  it('Coltrane axis spelled in the key', () => {
    expect(buildKeyMap('C Major', false)!.coltraneAxis).toEqual(['C', 'E', 'Ab'])
    expect(buildKeyMap('F# Major', false)!.coltraneAxis).toEqual(['F#', 'A#', 'D'])
  })
})

describe('sameChord', () => {
  it('matches enharmonic spellings, not different chords', () => {
    expect(sameChord('G#7', 'Ab7')).toBe(true)
    expect(sameChord('C/E', 'C')).toBe(false)
    expect(sameChord('Cmaj7', 'C7')).toBe(false)
    expect(sameChord(null, 'C')).toBe(false)
  })
})

describe('renderKeyExplorer', () => {
  const render = (key: string | null, active: string | null = null, opts: Partial<KeyExplorerOptions> = {}, onClick = () => {}) => {
    const el = document.createElement('div')
    const o = { ...OPTS, ...opts }
    renderKeyExplorer(el, key ? buildKeyMap(key, o.sevenths) : null, key ?? '', active, onClick, o)
    return el
  }
  const chords = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.key-chord')].map(b => b.dataset.chord)

  it('without a key it says how to get one', () => {
    expect(render(null).querySelector('.key-empty')).not.toBeNull()
  })

  it('outlines the chord on screen in every place it appears', () => {
    const active = [...render('C Major', 'Ab').querySelectorAll<HTMLElement>('.key-chord.active')].map(b => b.dataset.chord)
    expect(active.length).toBeGreaterThan(0)
    expect(active.every(c => c === 'Ab')).toBe(true)
    expect(render('C Major', 'G#').querySelectorAll('.key-chord.active').length).toBe(active.length)
  })

  it('sections can be hidden', () => {
    const all = chords(render('C Major')).length
    const bare = chords(render('C Major', null, { showNegative: false, showParallel: false }))
    expect(bare).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'])
    expect(all).toBeGreaterThan(bare.length)
  })

  it('a click reports the chord', () => {
    const onClick = vi.fn()
    const el = render('C Major', null, {}, onClick)
    el.querySelector<HTMLElement>('[data-chord="G"]')!.click()
    expect(onClick).toHaveBeenCalledWith('G')
  })
})
