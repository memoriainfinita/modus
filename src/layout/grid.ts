// The layout grid: panels on twelve columns and rows of fixed height, never overlapping.
// A panel moved or resized takes the cells it is dropped on; the panels it lands on go
// below it, and every panel then rises as far as it can, as in a page that reflows.

export const COLS = 12

export type Cell = { id: string; x: number; y: number; w: number; h: number }
export type Grid = Cell[]

export const MIN_W = 2
export const MIN_H = 2

/** The cell kept inside the grid: at least MIN_W × MIN_H, no column past the last. */
export function clampCell(c: Cell): Cell {
  const w = Math.min(COLS, Math.max(MIN_W, Math.round(c.w)))
  const h = Math.max(MIN_H, Math.round(c.h))
  const x = Math.min(COLS - w, Math.max(0, Math.round(c.x)))
  const y = Math.max(0, Math.round(c.y))
  return { id: c.id, x, y, w, h }
}

export function overlaps(a: Cell, b: Cell): boolean {
  return a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

const byPosition = (a: Cell, b: Cell) => a.y - b.y || a.x - b.x

/**
 * Lays the panels out with no overlap: `first`, when given, keeps its place; the rest,
 * top to bottom, each rise while the row above is free and go below whatever they hit.
 */
export function compact(grid: Grid, first?: string): Grid {
  const fixed = grid.find(c => c.id === first)
  const placed: Cell[] = fixed ? [clampCell(fixed)] : []
  const rest = grid.filter(c => c.id !== first).map(clampCell).sort(byPosition)
  for (const c of rest) {
    const cell = { ...c }
    const sameColumns = (p: Cell) => p.x < cell.x + cell.w && cell.x < p.x + p.w
    // Up to just below the nearest panel above it in its columns, then below anything it hits
    cell.y = Math.max(0, ...placed.filter(p => sameColumns(p) && p.y + p.h <= c.y).map(p => p.y + p.h))
    const hits = () => placed.filter(p => overlaps(cell, p))
    for (let h = hits(); h.length; h = hits()) cell.y = Math.max(...h.map(p => p.y + p.h))
    placed.push(cell)
  }
  return placed.sort(byPosition)
}

/** The panel at its new place or size; the others make room and close up. */
export function placeCell(grid: Grid, cell: Cell): Grid {
  const others = grid.filter(c => c.id !== cell.id)
  const moved = compact([...others, clampCell(cell)], cell.id)
  // The moved panel rises too, once the others are out of its way
  return compact(moved)
}

/** A panel added at the bottom, full width unless it says otherwise. */
export function addCell(grid: Grid, cell: Omit<Cell, 'y'>): Grid {
  const bottom = grid.reduce((m, c) => Math.max(m, c.y + c.h), 0)
  return compact([...grid.filter(c => c.id !== cell.id), clampCell({ ...cell, y: bottom })])
}

export function removeCell(grid: Grid, id: string): Grid {
  return compact(grid.filter(c => c.id !== id))
}

/** Rows the grid takes. */
export function gridRows(grid: Grid): number {
  return grid.reduce((m, c) => Math.max(m, c.y + c.h), 0)
}

/** Reads a stored grid: known ids only, once each, as numbers; null when nothing usable is left. */
export function parseGrid(value: unknown, known: readonly string[]): Grid | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<string>()
  const cells = value.flatMap(v => {
    if (!v || typeof v !== 'object') return []
    const { id, x, y, w, h } = v as Record<string, unknown>
    if (typeof id !== 'string' || !known.includes(id) || seen.has(id)) return []
    if (![x, y, w, h].every(n => typeof n === 'number' && Number.isFinite(n))) return []
    seen.add(id)
    return [clampCell({ id, x: x as number, y: y as number, w: w as number, h: h as number })]
  })
  return cells.length ? compact(cells) : null
}
