// What a key offers, read from UMT without playing: its diatonic chords, their negative
// harmony, the chords of its parallel modes and the Coltrane axis. Degrees and functions
// come from the same call the analysis panel uses (romanInKey); a chord the panel reads
// as a secondary (G7 in A minor: V7/III) is listed by its degree and carries that reading.

import type { HarmonicAnalysis } from '../types'
import { romanInKey } from '../detector/analyzer'
import { tryParseChord, tryUMT } from './chord'
import { spellChordSymbol, spellPitchClassInKey } from './spelling'

export interface KeyChord {
  symbol: string
  roman: string                // the degree (VII7), as a key chart writes it
  secondary?: string           // the reading the analysis panel shows when it differs (V7/III)
  function: HarmonicAnalysis['function']
}

export interface ParallelMode {
  mode: string                 // UMT mode name: "aeolian", "harmonic minor"…
  brightness: number           // UMT's scale: lydian 1 … locrian -5
  chords: KeyChord[]
}

export interface KeyMap {
  key: string
  diatonic: KeyChord[]
  negative: (string | null)[]  // negative harmony of each diatonic chord, same order
  parallel: ParallelMode[]     // seventh chords only: getBorrowedChords builds sevenths
  coltraneAxis: string[] | null
}

function keyChord(symbol: string, key: string): KeyChord {
  const a = romanInKey(symbol, key)
  const secondary = a && a.roman !== a.degree ? a.roman : undefined
  return { symbol, roman: a?.degree ?? '?', secondary, function: a?.function ?? 'unknown' }
}

const cache = new Map<string, KeyMap | null>()

/** The map of a key like "C Major" / "A Minor", triads or sevenths; null when UMT cannot read the key. */
export function buildKeyMap(key: string, sevenths: boolean): KeyMap | null {
  const cacheKey = `${key}|${sevenths}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)!

  const chords = tryUMT<any[]>('diatonic chords', () => UMT.parseScaleSymbol(key).getDiatonicChords(sevenths ? 'seventh' : 'triad'), [])
  if (!chords.length) { cache.set(cacheKey, null); return null }

  const diatonic = chords.map(c => keyChord(c.name, key))
  const negative = chords.map(c =>
    tryUMT('negative harmony', () => {
      const name = UMT.Harmony.getNegativeHarmony(c, key)?.name
      return name ? spellChordSymbol(name, key) : null
    }, null))

  const byMode = new Map<string, ParallelMode>()
  for (const b of tryUMT<any[]>('borrowed chords', () => UMT.Harmony.getBorrowedChords(key), [])) {
    const name = b.chord?.name
    if (!name || !tryParseChord(name)) continue
    let row = byMode.get(b.sourceMode)
    if (!row) byMode.set(b.sourceMode, row = { mode: b.sourceMode, brightness: b.brightness ?? 0, chords: [] })
    row.chords.push(keyChord(name, key))
  }
  // Brightest first, as the modes are usually taught (lydian → locrian).
  const parallel = [...byMode.values()].sort((a, b) => b.brightness - a.brightness)

  const axis = tryUMT('coltrane axis', () => UMT.Harmony.getColtraneAxis(key).majorThirds, null)
  const coltraneAxis = axis ? axis.map(n => spellPitchClassInKey(n, key)) : null

  const map: KeyMap = { key, diatonic, negative, parallel, coltraneAxis }
  cache.set(cacheKey, map)
  return map
}

/** Same chord whatever its spelling: root pitch class, intervals and bass (G#7 = Ab7). */
export function sameChord(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const ca = tryParseChord(a), cb = tryParseChord(b)
  if (!ca || !cb) return false
  const pc = (s: number | undefined) => s === undefined ? -1 : ((s % 12) + 12) % 12
  return pc(ca.rootStep) === pc(cb.rootStep)
    && (ca.intervalsInSteps ?? []).join() === (cb.intervalsInSteps ?? []).join()
    && pc(ca.bassStep) === pc(cb.bassStep)
}
