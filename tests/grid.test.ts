import { describe, it, expect } from 'vitest'
import { compact, placeCell, addCell, removeCell, parseGrid, overlaps, clampCell, gridRows, COLS } from '../src/layout/grid'
import type { Grid } from '../src/layout/grid'
import { PRESETS, PRESET_IDS, MODULE_IDS } from '../src/layout/presets'

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

  it('standard shows every panel', () => {
    expect(PRESETS.standard.map(c => c.id).sort()).toEqual([...MODULE_IDS].sort())
  })
})
