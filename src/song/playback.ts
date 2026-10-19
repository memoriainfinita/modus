// Playing the whole song: its sections in order, each as many times as its ×N, a bar lasting
// its beats at the song's tempo and its chords sharing it equally (as the Progressions panel
// plays). An empty bar or a chord with no valid name is a rest. Starts at the chord asked
// for, or at the top.

import type { Song } from '../types'

export const DEFAULT_TEMPO = 100
export const DEFAULT_BEATS = 4
export const TEMPO_RANGE = [40, 240] as const
export const BEATS_RANGE = [1, 12] as const

export const songTempo = (song: Song) => song.tempo ?? DEFAULT_TEMPO
export const songBeats = (song: Song) => song.beatsPerBar ?? DEFAULT_BEATS

/** One step of the song in time: a chord (or a rest, symbol null), from `start` for `beats`. */
export interface SongStep {
  chordId: string | null
  sectionId: string
  symbol: string | null
  notes?: string[]
  start: number   // in beats from the first step
  beats: number
}

/** The song as it sounds, from `fromChordId` (its first time through) or from the top. */
export function songSchedule(song: Song, fromChordId: string | null = null): SongStep[] {
  const beatsPerBar = songBeats(song)
  const steps: SongStep[] = []
  let start = 0
  for (const section of song.sections) {
    for (let r = 0; r < Math.max(1, section.repeatCount); r++) {
      for (const measure of section.measures) {
        const chords = measure.chords
        if (!chords.length) {
          steps.push({ chordId: null, sectionId: section.id, symbol: null, start, beats: beatsPerBar })
          start += beatsPerBar
          continue
        }
        const each = beatsPerBar / chords.length
        for (const c of chords) {
          steps.push({ chordId: c.id, sectionId: section.id, symbol: c.symbol && c.valid ? c.symbol : null, notes: c.notes, start, beats: each })
          start += each
        }
      }
    }
  }
  const from = fromChordId ? steps.findIndex(s => s.chordId === fromChordId) : -1
  if (from <= 0) return steps
  const offset = steps[from].start
  return steps.slice(from).map(s => ({ ...s, start: s.start - offset }))
}

export interface SongPlayHandlers {
  /** A step begins: sound it and show it; `previous` is the chord that sounded before it. */
  step: (step: SongStep, previous: SongStep | null, seconds: number) => void
  /** It ended or was stopped. */
  end: () => void
}

let timer: ReturnType<typeof setTimeout> | null = null
let onEnd: (() => void) | null = null

export const isSongPlaying = () => timer !== null

/** Plays the steps at `tempo` bpm, one timer per step, measured from the start so it does not drift. */
export function playSchedule(steps: SongStep[], tempo: number, h: SongPlayHandlers) {
  stopSong()
  if (!steps.length) { h.end(); return }
  const beatMs = 60000 / tempo
  const t0 = performance.now()
  onEnd = h.end
  let previous: SongStep | null = null
  const run = (i: number) => {
    if (i >= steps.length) { stopSong(); return }
    const s = steps[i]
    h.step(s, previous, s.beats * beatMs / 1000)
    if (s.symbol) previous = s
    const next = i + 1 < steps.length ? steps[i + 1].start : s.start + s.beats
    timer = setTimeout(() => run(i + 1), Math.max(0, t0 + next * beatMs - performance.now()))
  }
  timer = setTimeout(() => run(0), 0)
}

export function stopSong() {
  if (timer) clearTimeout(timer)
  timer = null
  const end = onEnd
  onEnd = null
  end?.()
}
