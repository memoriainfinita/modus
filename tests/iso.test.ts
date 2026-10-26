// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadIsoOptions, saveIsoOption, isoGrid, mixColor, renderIso, CELL_SIZE } from '../src/diagrams/iso'
import { useLang } from '../src/i18n/i18n'

// notae as the page loads it, from vendor/
beforeAll(() => { ;(0, eval)(readFileSync('vendor/notae.js', 'utf8') + '\n;globalThis.Notae = Notae') })
beforeEach(() => { localStorage.clear(); useLang('en') })

// A container of a given size: jsdom lays nothing out
function box(width: number, height: number): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientWidth', { value: width })
  Object.defineProperty(el, 'clientHeight', { value: height })
  return el
}
const cellsOf = (el: HTMLElement) => [...el.querySelectorAll('polygon')]
const fillOf = (el: HTMLElement, midi: number) => el.querySelector(`polygon[data-midi="${midi}"]`)?.getAttribute('fill')

describe('isomorphic options', () => {
  it('default: harmonic table in columns, medium cells around middle C, function colours, notes, soft octaves, the shape', () => {
    expect(loadIsoOptions()).toEqual({
      layout: 'harmonic', right: 7, upRight: 3, size: 'medium', center: 60, orientation: 'columns',
      colors: 'function', labels: 'notes', octaves: 'soft', links: true, scale: false,
    })
  })

  it('each layout keeps its own orientation; Wicki-Hayden starts in rows', () => {
    const o = loadIsoOptions()
    saveIsoOption(o, 'orientation', 'rows')
    saveIsoOption(o, 'layout', 'wicki')
    expect(o.orientation).toBe('rows')
    saveIsoOption(o, 'orientation', 'columns')
    saveIsoOption(o, 'layout', 'harmonic')
    expect(o.orientation).toBe('rows')
    expect(loadIsoOptions()).toMatchObject({ layout: 'harmonic', orientation: 'rows' })
  })

  it('a stored value out of range falls back', () => {
    localStorage.setItem('iso-center', '200')
    localStorage.setItem('iso-size', 'huge')
    expect(loadIsoOptions()).toMatchObject({ center: 84, size: 'medium' })
  })
})

describe('isoGrid', () => {
  it('smaller cells hold more notes', () => {
    const o = loadIsoOptions()
    const medium = isoGrid(o, 600, 400, []).cells.length
    o.size = 'small'
    expect(isoGrid(o, 600, 400, []).cells.length).toBeGreaterThan(medium * 2)
    expect(CELL_SIZE.small).toBeLessThan(CELL_SIZE.large)
  })

  it('a chord outside the grid moves it to the chord; one inside leaves it', () => {
    const o = loadIsoOptions()
    o.size = 'large'
    const notes = (g: { cells: { note: number }[] }) => new Set(g.cells.map(c => c.note))
    expect(notes(isoGrid(o, 400, 260, [60, 64, 67])).has(60)).toBe(true)
    const low = [28, 32, 35]
    expect(low.every(m => notes(isoGrid(o, 400, 260, [])).has(m))).toBe(false)
    expect(low.every(m => notes(isoGrid(o, 400, 260, low)).has(m))).toBe(true)
  })

  it('the custom layout takes its two intervals', () => {
    const o = loadIsoOptions()
    saveIsoOption(o, 'layout', 'custom')
    saveIsoOption(o, 'right', 5)
    const g = isoGrid(o, 400, 300, [])
    const centre = g.cells.find(c => c.q === 0 && c.p === 0)!
    expect(g.cells.find(c => c.q === 1 && c.p === 0)!.note - centre.note).toBe(5)
  })
})

describe('mixColor', () => {
  it('mixes two hex colours; anything else is returned as it is', () => {
    expect(mixColor('#ffffff', '#000000', 0.5)).toBe('#808080')
    expect(mixColor('#f87171', '#1d1d1d', 1)).toBe('#f87171')
    expect(mixColor('red', '#000000', 0.5)).toBe('red')
  })
})

describe('renderIso', () => {
  it('draws nothing in a hidden panel', () => {
    const el = box(0, 0)
    renderIso(el, ['C4'], null, null, loadIsoOptions())
    expect(el.innerHTML).toBe('')
  })

  it('the notes sounding lit, the same classes in other octaves softer, the rest plain', () => {
    const el = box(600, 400)
    renderIso(el, ['G3', 'B3', 'D4', 'F4'], 'D', 'C Major', loadIsoOptions())
    const lit = fillOf(el, 55), soft = fillOf(el, 67), plain = fillOf(el, 61)
    expect(lit).toBeTruthy()
    expect(new Set([lit, soft, plain]).size).toBe(3)
    expect(el.querySelector('path')).not.toBeNull()   // the chord's shape
  })

  it('hidden octaves, no shape: only the notes sounding marked', () => {
    const el = box(600, 400)
    const o = loadIsoOptions()
    o.octaves = 'hidden'
    o.links = false
    renderIso(el, ['G3', 'B3', 'D4', 'F4'], 'D', 'C Major', o)
    expect(fillOf(el, 67)).toBe(fillOf(el, 61))
    expect(el.querySelector('path')).toBeNull()
  })

  it('labels: names in the key, degrees over its tonic, the octave on C', () => {
    const el = box(600, 400)
    const o = loadIsoOptions()
    renderIso(el, [], null, 'E Major', o)
    const texts = () => [...el.querySelectorAll('text')].map(t => t.textContent)
    expect(texts()).toContain('G#')
    expect(texts()).toContain('C4')
    o.labels = 'degrees'
    renderIso(el, [], null, 'E Major', o)
    expect(texts()).toContain('♭6')
    o.labels = 'none'
    renderIso(el, [], null, 'E Major', o)
    expect(texts()).toEqual([])
  })

  it('a press on a cell gives its MIDI note', () => {
    const el = box(600, 400)
    const pressed: number[] = []
    renderIso(el, [], null, null, loadIsoOptions(), m => pressed.push(m))
    const cell = el.querySelector('polygon[data-midi="60"]')!
    cell.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }))
    expect(pressed).toEqual([60])
    expect(cellsOf(el).length).toBeGreaterThan(50)
  })
})
