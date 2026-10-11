// The panels the page is made of, and the ready-made layouts. A layout is a grid of
// panels (layout/grid.ts); a panel not in it is hidden.

import type { Grid } from './grid'

export const MODULE_IDS = [
  'chord', 'staff', 'analysis', 'explain', 'cof', 'guitar', 'key', 'piano', 'velocity', 'progressions', 'ear', 'history', 'song',
] as const
export type ModuleId = typeof MODULE_IDS[number]

/** Width and height a panel takes when it is added (columns of 12, rows). */
export const MODULE_SIZE: Record<ModuleId, { w: number; h: number }> = {
  chord: { w: 4, h: 3 }, staff: { w: 4, h: 8 }, analysis: { w: 3, h: 11 }, explain: { w: 4, h: 11 }, cof: { w: 3, h: 7 },
  guitar: { w: 3, h: 9 }, key: { w: 12, h: 11 }, piano: { w: 7, h: 5 },
  velocity: { w: 2, h: 5 }, progressions: { w: 12, h: 4 }, ear: { w: 6, h: 5 }, history: { w: 12, h: 3 }, song: { w: 12, h: 12 },
}

export const PRESET_IDS = ['standard', 'study', 'class', 'transcription', 'recording'] as const
export type PresetId = typeof PRESET_IDS[number]

type Spec = [ModuleId, number, number, number, number]   // id, x, y, w, h
const grid = (specs: Spec[]): Grid => specs.map(([id, x, y, w, h]) => ({ id, x, y, w, h }))

export const PRESETS: Record<PresetId, Grid> = {
  // Everything, as the page was before panels could move
  standard: grid([
    ['chord', 0, 0, 3, 3], ['staff', 0, 3, 3, 8], ['analysis', 3, 0, 3, 11], ['cof', 6, 0, 3, 7],
    ['guitar', 9, 0, 3, 11], ['velocity', 6, 7, 3, 4],
    ['key', 0, 11, 8, 11], ['explain', 8, 11, 4, 11],
    ['piano', 0, 22, 12, 5],
    ['progressions', 0, 27, 12, 4], ['ear', 0, 31, 6, 5], ['history', 0, 36, 12, 3], ['song', 0, 39, 12, 12],
  ]),
  // Harmony at the desk: the key and the analysis large, what is played next to them
  study: grid([
    ['chord', 0, 0, 4, 3], ['analysis', 4, 0, 4, 12], ['cof', 8, 0, 4, 8],
    ['staff', 0, 3, 4, 9], ['history', 8, 8, 4, 4],
    ['key', 0, 12, 8, 11], ['explain', 8, 12, 4, 11],
    ['piano', 0, 23, 12, 5],
    ['progressions', 0, 28, 12, 4],
    ['ear', 0, 32, 6, 5],
  ]),
  // Teaching on a projector (made to be presented with P): few panels, large
  class: grid([
    ['chord', 0, 0, 12, 4],
    ['staff', 0, 4, 4, 10], ['cof', 4, 4, 4, 10], ['guitar', 8, 4, 4, 10],
    ['piano', 0, 14, 12, 6],
  ]),
  // Writing down a recording: the song and the history in reach of what is heard
  transcription: grid([
    ['chord', 0, 0, 3, 3], ['staff', 0, 3, 3, 8], ['analysis', 3, 0, 3, 11],
    ['piano', 6, 0, 6, 5], ['guitar', 6, 5, 6, 6],
    ['history', 0, 11, 12, 3], ['song', 0, 14, 12, 14],
  ]),
  // On camera or screen capture: the chord and the instruments, no controls in view
  recording: grid([
    ['chord', 0, 0, 6, 4], ['staff', 6, 0, 6, 9], ['guitar', 0, 4, 6, 9],
    ['piano', 0, 13, 12, 6],
  ]),
}
