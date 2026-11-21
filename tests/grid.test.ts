import { describe, it, expect } from 'vitest'
import { compact, placeCell, addCell, removeCell, parseGrid, overlaps, clampCell, gridRows, fitGrid, twoColumns, WIDE, FIT_MIN_H, COLS } from '../src/layout/grid'
import type { Grid } from '../src/layout/grid'
import { PRESETS, PRESET_IDS, MODULE_IDS, MODULE_GROUPS } from '../src/layout/presets'

const noOverlap = (g: Grid) => g.every(a => g.every(b => !overlaps(a, b)))
const at = (g: Grid, id: string) => g.find(c => c.id === id)!

describe('grid', () => {
  it('keeps a cell inside the columns and above its minimum size', () => {
    expect(clampCell({ id: 'a', x: 11, y: -3, w: 4, h: 1 })).toEqual({ id: 'a', x: 8, y: 0, w: 4, h: 2 })
    expect(clampCell({ id: 'a', x: 0, y: 0, w: 40, h: 3 }).w).toBe(COLS)
  })

  it('panels rise into free rows and never overlap', () => {
    const g = compact([{ id: 'a', x: 0, y: 5, w: 6, h: 2 }, { id: 'b', x: 0, y: 9, w: 6, h: 2 }])
    expect(at(g, 'a').y).toBe(0)
    expect(at(g, 'b').y).toBe(2)
  })

  it('a panel dropped on another takes its place; the other goes below and they close up', () => {
    const g: Grid = [{ id: 'a', x: 0, y: 0, w: 6, h: 2 }, { id: 'b', x: 0, y: 2, w: 6, h: 3 }]
    const moved = placeCell(g, { id: 'a', x: 0, y: 3, w: 6, h: 2 })
    expect(at(moved, 'b').y).toBe(0)
    expect(at(moved, 'a').y).toBe(3)
    expect(noOverlap(moved)).toBe(true)
  })

  it('panels side by side stay side by side', () => {
    const g: Grid = [{ id: 'a', x: 0, y: 0, w: 6, h: 2 }, { id: 'b', x: 6, y: 0, w: 6, h: 2 }]
    const moved = placeCell(g, { id: 'b', x: 6, y: 4, w: 6, h: 2 })
    expect(at(moved, 'b')).toMatchObject({ x: 6, y: 0 })
  })

  it('resizing pushes the panel below further down', () => {
    const g: Grid = [{ id: 'a', x: 0, y: 0, w: 12, h: 2 }, { id: 'b', x: 0, y: 2, w: 12, h: 2 }]
    const grown = placeCell(g, { id: 'a', x: 0, y: 0, w: 12, h: 5 })
    expect(at(grown, 'b').y).toBe(5)
  })

  it('adds at the bottom and closes the gap a removed panel leaves', () => {
    let g: Grid = [{ id: 'a', x: 0, y: 0, w: 12, h: 2 }]
    g = addCell(g, { id: 'b', x: 0, w: 12, h: 3 })
    expect(at(g, 'b').y).toBe(2)
    g = removeCell(g, 'a')
    expect(at(g, 'b').y).toBe(0)
    expect(gridRows(g)).toBe(3)
  })

  it('reads a stored grid, dropping what it does not know', () => {
    const g = parseGrid([{ id: 'chord', x: 0, y: 0, w: 3, h: 3 }, { id: 'chord', x: 3, y: 0, w: 3, h: 3 },
      { id: 'nope', x: 0, y: 0, w: 3, h: 3 }, { id: 'staff', x: 'a', y: 0, w: 3, h: 3 }, null], MODULE_IDS)
    expect(g).toEqual([{ id: 'chord', x: 0, y: 0, w: 3, h: 3 }])
    expect(parseGrid('x', MODULE_IDS)).toBeNull()
    expect(parseGrid([], MODULE_IDS)).toBeNull()
  })

  it('a panel fitted to its content takes its rows, at least three, at most its own, and the panels below rise', () => {
    const g: Grid = [{ id: 'a', x: 0, y: 0, w: 8, h: 12 }, { id: 'b', x: 8, y: 0, w: 4, h: 12 }, { id: 'c', x: 0, y: 12, w: 12, h: 5 }]
    const fitted = fitGrid(g, { a: 1.2, b: 7.4 })
    expect(at(fitted, 'a').h).toBe(FIT_MIN_H)
    expect(at(fitted, 'b').h).toBe(8)
    expect(at(fitted, 'c').y).toBe(8)
    expect(at(fitGrid(g, { a: 40 }), 'a').h).toBe(12)
    expect(at(fitGrid([{ id: 'a', x: 0, y: 0, w: 4, h: 2 }], { a: 1 }), 'a').h).toBe(2)
    expect(g[0].h).toBe(12)
    expect(fitGrid(g, {})).toBe(g)
  })
})

describe('presets', () => {
  it('lay known panels out without overlap, already compact', () => {
    for (const id of PRESET_IDS) {
      const g = PRESETS[id]
      expect(g.every(c => (MODULE_IDS as readonly string[]).includes(c.id)), id).toBe(true)
      expect(noOverlap(g), id).toBe(true)
      expect(g.every(c => c.x + c.w <= COLS), id).toBe(true)
      expect(compact(g).map(c => [c.id, c.y]).sort(), id).toEqual(g.map(c => [c.id, c.y]).sort())
    }
  })

  it('the layout menu lists every panel once, under harmony, practice or tools', () => {
    const listed = MODULE_GROUPS.flatMap(g => [...g.modules])
    expect([...listed].sort()).toEqual([...MODULE_IDS].sort())
    expect(MODULE_GROUPS.find(g => g.id === 'tools')!.modules).toEqual(['tuner', 'player', 'metronome'])
  })

  it('in standard the tools come last, after the history and the song', () => {
    const rows = (id: string) => PRESETS.standard.find(c => c.id === id)!.y
    for (const tool of ['tuner', 'player', 'metronome']) expect(rows(tool)).toBeGreaterThan(rows('song'))
  })

  it('standard shows every panel but Velocity, Next and Isomorphic, the chord across the top', () => {
    expect(PRESETS.standard.map(c => c.id).sort()).toEqual(MODULE_IDS.filter(id => id !== 'velocity' && id !== 'next' && id !== 'iso').sort())
    expect(PRESETS.standard.find(c => c.id === 'chord')).toMatchObject({ x: 0, y: 0, w: 12 })
  })

  describe('twoColumns (a tablet upright)', () => {
    const cols = (g: Grid) => g.every(c => c.x >= 0 && c.x + c.w <= 2)

    it('a wide panel takes both columns; narrow ones go in pairs as tall as the taller', () => {
      const g = twoColumns([
        { id: 'chord', x: 0, y: 0, w: 12, h: 3 },
        { id: 'staff', x: 0, y: 3, w: 3, h: 11 }, { id: 'analysis', x: 3, y: 3, w: 3, h: 8 },
        { id: 'piano', x: 0, y: 14, w: WIDE, h: 5 },
      ])
      expect(at(g, 'chord')).toEqual({ id: 'chord', x: 0, y: 0, w: 2, h: 3 })
      expect(at(g, 'staff')).toEqual({ id: 'staff', x: 0, y: 3, w: 1, h: 11 })
      expect(at(g, 'analysis')).toEqual({ id: 'analysis', x: 1, y: 3, w: 1, h: 11 })
      expect(at(g, 'piano')).toMatchObject({ x: 0, y: 14, w: 2, h: 5 })
    })

    it('a narrow panel with no partner, before a wide one or last, takes both columns', () => {
      const g = twoColumns([
        { id: 'a', x: 0, y: 0, w: 3, h: 4 }, { id: 'b', x: 0, y: 4, w: 12, h: 2 }, { id: 'c', x: 0, y: 6, w: 3, h: 4 },
      ])
      expect(at(g, 'a')).toMatchObject({ x: 0, w: 2 })
      expect(at(g, 'c')).toMatchObject({ x: 0, w: 2, y: 6 })
    })

    it('keeps the layout order, leaves no overlap and uses two columns, for every preset', () => {
      for (const id of PRESET_IDS) {
        const g = twoColumns(PRESETS[id])
        expect(g.length).toBe(PRESETS[id].length)
        expect(noOverlap(g)).toBe(true)
        expect(cols(g)).toBe(true)
        const order = [...PRESETS[id]].sort((a, b) => a.y - b.y || a.x - b.x).map(c => c.id)
        expect(g.map(c => c.id)).toEqual(order)
        expect(gridRows(g)).toBe(g.reduce((s, c) => c.x === 1 ? s : s + c.h, 0))   // no row is left empty
      }
    })

    it('does not change the grid it is given', () => {
      const g: Grid = [{ id: 'a', x: 0, y: 0, w: 3, h: 4 }, { id: 'b', x: 3, y: 0, w: 3, h: 6 }]
      const before = JSON.stringify(g)
      twoColumns(g)
      expect(JSON.stringify(g)).toBe(before)
    })
  })
})
