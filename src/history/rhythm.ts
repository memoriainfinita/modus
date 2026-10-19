// Harmonic rhythm of the history: how long each chord sounded and how often the chords
// change. Modus only measures the time; the reading per bar is UMT's (analyzeProgression
// with durations in beats). Without a tempo, the mean time between changes.

import type { HistoryEntry } from '../types'
import { tryParseChord, tryUMT } from '../theory/chord'

/** How long an entry sounded, in seconds: until its release, or until the next chord if it was held into it. Null when unknown. */
export function entrySeconds(entries: HistoryEntry[], i: number): number | null {
  const e = entries[i]
  if (e?.at === undefined) return null
  const next = i > 0 ? entries[i - 1].at : undefined   // newest first: the chord after it is on its left
  const end = e.until !== undefined && next !== undefined ? Math.min(e.until, next) : e.until ?? next
  return end !== undefined && end > e.at ? (end - e.at) / 1000 : null
}

/** The newest run of timed entries, in playing order, with how long each sounded. */
export function timedRun(entries: HistoryEntry[]): { symbols: string[]; seconds: number[] } {
  const symbols: string[] = [], seconds: number[] = []
  for (let i = 0; i < entries.length && entries[i].at !== undefined; i++) {
    const s = entrySeconds(entries, i)
    if (s === null || !tryParseChord(entries[i].symbol)) continue
    symbols.unshift(entries[i].symbol)
    seconds.unshift(s)
  }
  return { symbols, seconds }
}

export type HarmonicRhythm =
  | { kind: 'per-bar'; changes: number; bpm: number; beatsPerBar: number }
  | { kind: 'seconds'; secondsPerChange: number }

/**
 * The history's harmonic rhythm, from two timed chords on. With a tempo (bpm > 0), chord
 * changes per bar as UMT reads it; without one, the mean time each chord lasts.
 */
export function harmonicRhythm(entries: HistoryEntry[], bpm: number, beatsPerBar: number): HarmonicRhythm | null {
  const { symbols, seconds } = timedRun(entries)
  if (symbols.length < 2) return null
  if (bpm <= 0) return { kind: 'seconds', secondsPerChange: seconds.reduce((a, b) => a + b, 0) / seconds.length }
  const chords = symbols.map(tryParseChord)
  const durations = seconds.map(s => s * bpm / 60)
  // The rhythm does not depend on the key; analyzeProgression asks for one
  const r = tryUMT('harmonic rhythm', () => UMT.Harmony.analyzeProgression(chords, 'C Major', { durations, beatsPerBar }), null)
  return r && r.harmonicRhythmUnit === 'per-bar' ? { kind: 'per-bar', changes: r.harmonicRhythm, bpm, beatsPerBar } : null
}
