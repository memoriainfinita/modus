// Adapters between UMT chord output and what the UI needs.
// UMT is the source of truth; nothing here re-implements theory beyond
// reading the interval set UMT already computed.

import { color } from '../ui/theme'

export type ChordFamily = 'major' | 'minor' | 'dominant' | 'diminished' | 'half-diminished' | 'augmented' | 'sus'

export type HarmonicFunction = 'T' | 'S' | 'D' | 'unknown'

/** The colour of the chord before, drawn next to this one, in the theme shown. */
export const neutralColor = () => color('chord-other')

/**
 * The one colour code of the page: a chord's function in the key (tonic, subdominant,
 * dominant). Quality is read in the name, not in a colour. Without a function (no key,
 * or a chord outside it) a mark is drawn in `chord-none`.
 */
export function functionColor(fn: HarmonicFunction | null | undefined, none = 'chord-none'): string {
  return color(fn === 'T' ? 'fn-t' : fn === 'S' ? 'fn-s' : fn === 'D' ? 'fn-d' : none)
}

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

/** "CM" → "C" ("CM/E" → "C/E"). UMT stopped returning "CM" in 6750e23; a name typed that way still needs it. */
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

// Chord names typed in Spanish (Lam7, Sib/Re), as UMT reads them
let typedAliases: Record<string, string> | null = null
const SOLFEGE_START = /^(Do|Re|Mi|Fa|Sol|La|Si)/

/**
 * A chord as the user typed it, in letters or in solfège ("Lam7" → "Am7"). A name that
 * starts with a syllable is read in solfège first: "Do7" is C7, though UMT also reads it as
 * D°7. When that is no chord the letters stand ("Fadd9"); unknown text comes back as typed.
 */
export function readTypedChord(text: string): string {
  const s = normalizeChordName(text.trim())
  if (SOLFEGE_START.test(s)) {
    typedAliases ??= tryUMT('typed chords', () => ({ ...UMT.SOLFEGE_ROOTS, ...UMT.QUALITY_ALIASES_ES }), {})
    const translated = normalizeChordName(tryUMT('typed chords', () => UMT.translateSymbol(s, typedAliases!), s))
    if (translated !== s && isKnownChord(translated)) return translated
  }
  return s
}
