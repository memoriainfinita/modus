// Adapters between UMT chord output and what the UI needs.
// UMT is the source of truth; nothing here re-implements theory beyond
// reading the interval set UMT already computed.

export type ChordFamily = 'major' | 'minor' | 'dominant' | 'diminished' | 'half-diminished' | 'augmented' | 'sus'

export const CHORD_FAMILY_COLORS: Record<ChordFamily, string> = {
  major: '#f59e0b',
  minor: '#3b82f6',
  dominant: '#ef4444',
  diminished: '#7c3aed',
  'half-diminished': '#7c3aed',
  augmented: '#0d9488',
  sus: '#6b7280',
}

export const NEUTRAL_COLOR = '#6b7280'

/**
 * Runs an optional UMT call. UMT throws for inputs it does not support; the caller gets
 * the fallback, and the reason is logged at debug level so API drift stays traceable.
 */
export function tryUMT<T>(what: string, fn: () => T, fallback: T): T {
  try { return fn() } catch (err) {
    console.debug(`[umt] ${what} unavailable:`, err)
    return fallback
  }
}

/** Parsed UMT chord, or null when UMT rejects the symbol. */
export function tryParseChord(symbol: string | null | undefined): any | null {
  if (!symbol) return null
  try { return UMT.parseChordSymbol(symbol) } catch { return null }
}

export function isKnownChord(symbol: string | null | undefined): symbol is string {
  return tryParseChord(symbol) !== null
}

/** UMT.detectChords names a plain major triad "CM" ("CM/E" when inverted). Show it as "C". */
export function normalizeChordName(name: string): string {
  return name.replace(/^([A-G][b#]*)M(?=\/|$)/, '$1')
}

/** Broad chord family from the UMT interval set (12-TET steps above the root). */
export function chordFamily(symbol: string | null | undefined): ChordFamily | null {
  const chord = tryParseChord(symbol)
  if (!chord) return null
  const pcs = new Set<number>((chord.intervalsInSteps ?? []).map((s: number) => ((s % 12) + 12) % 12))
  if (pcs.has(4)) {
    if (pcs.has(8) && !pcs.has(7)) return 'augmented'
    return pcs.has(10) ? 'dominant' : 'major'
  }
  if (pcs.has(3)) {
    if (pcs.has(6) && !pcs.has(7)) return pcs.has(10) ? 'half-diminished' : 'diminished'
    return 'minor'
  }
  if (pcs.has(5) || pcs.has(2)) return 'sus'
  return null
}

export function chordColor(symbol: string | null | undefined): string {
  const family = chordFamily(symbol)
  return family ? CHORD_FAMILY_COLORS[family] : NEUTRAL_COLOR
}

/** Note names with octave (e.g. "C4") of the chord, each named by its interval above the root (Cm7b5: C Eb Gb Bb); [] when unparseable. */
export function chordNoteNames(symbol: string | null | undefined): string[] {
  const chord = tryParseChord(symbol)
  if (!chord) return []
  return tryUMT<string[]>('chord tones', () => UMT.spellChord(chord), []).filter(Boolean)
}

/** Root pitch name of a chord symbol, e.g. "Bb" for "Bbm7/F". */
export function chordRoot(symbol: string | null | undefined): string | null {
  return symbol?.match(/^([A-G][b#]*)/)?.[1] ?? null
}
