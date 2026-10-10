import type { DetectionResult, HarmonicAnalysis, HistoryEntry, SingleNoteResult, IntervalResult, ChordResult } from '../types'
import { midiToNoteName, PITCH_NAMES_FLAT } from '../theory/notes'
import { tryParseChord, isKnownChord, normalizeChordName, tryUMT } from '../theory/chord'
import { normalizeKey } from '../theory/keys'

const INTERVAL_NAMES = [
  'Unison','Minor 2nd','Major 2nd','Minor 3rd','Major 3rd','Perfect 4th',
  'Tritone','Perfect 5th','Minor 6th','Major 6th','Minor 7th','Major 7th'
]

// Compound intervals are reduced to their simple form; whole octaves are named as such.
function semitonesToInterval(semitones: number): { name: string; inversionName: string } {
  const n = ((semitones % 12) + 12) % 12
  if (n === 0) return semitones === 0
    ? { name: 'Unison', inversionName: 'Octave' }
    : { name: 'Octave', inversionName: 'Unison' }
  return { name: INTERVAL_NAMES[n], inversionName: INTERVAL_NAMES[12 - n] }
}

export function analyzeNotes(midiNotes: number[]): DetectionResult {
  if (midiNotes.length === 0) return null

  const noteNames = midiNotes.map(midiToNoteName)

  if (midiNotes.length === 1) {
    const result: SingleNoteResult = {
      kind: 'note',
      noteName: noteNames[0],
      midiNumber: midiNotes[0],
      pitchClass: PITCH_NAMES_FLAT[midiNotes[0] % 12],
    }
    return result
  }

  if (midiNotes.length === 2) {
    const semitones = Math.abs(midiNotes[0] - midiNotes[1])
    const { name, inversionName } = semitonesToInterval(semitones)
    const result: IntervalResult = {
      kind: 'interval',
      notes: noteNames,
      intervalName: name,
      semitones,
      inversionName,
    }
    return result
  }

  // ≥3 notes: chord detection. UMT may throw, and returns "Unknown Chord" when nothing
  // matches — keep only names UMT can parse back, so '?' is the single unknown sentinel.
  let candidates: string[] = []
  candidates = tryUMT('chord detection', () =>
    (UMT.Harmony.detectChords(noteNames.map(n => UMT.parseNote(n))) ?? []).map(normalizeChordName).filter(isKnownChord), [])
  candidates = [...new Set(candidates)]
  const result: ChordResult = {
    kind: 'chord',
    notes: noteNames,
    candidates: candidates.length ? candidates : ['?'],
    selectedIndex: 0,
  }
  return result
}

/** Roman-numeral level analysis of one chord in a key — what the chips need. */
export interface RomanInfo {
  roman: string               // secondary dominants written as V7/x
  degree: string              // the plain degree: VII7 for G7 in A minor, where roman reads V7/III
  function: HarmonicAnalysis['function']
  isDiatonic: boolean
  isBorrowed: boolean
  borrowedFrom?: string
  isSecondary: boolean
  secondaryTarget?: string    // e.g. "V7/ii"
}

// History and song chips ask for the same (chord, key) pairs on every render.
const romanCache = new Map<string, RomanInfo | null>()

export function romanInKey(chordSymbol: string, key: string | null): RomanInfo | null {
  if (!key || !chordSymbol) return null
  const cacheKey = `${chordSymbol}|${key}`
  if (romanCache.has(cacheKey)) return romanCache.get(cacheKey)!
  const chord = tryParseChord(chordSymbol)
  const a = chord ? tryUMT('progression', () => UMT.Harmony.analyzeProgression([chord], key).analysis[0], null) : null
  const info: RomanInfo | null = a ? {
    roman: (a.isSecondary && a.secondaryTarget) ? a.secondaryTarget : (a.roman ?? '?'),
    degree: a.roman ?? '?',
    function: a.function ?? 'unknown',
    isDiatonic: a.isDiatonic ?? false,
    isBorrowed: a.isBorrowed ?? false,
    borrowedFrom: a.borrowedFrom,
    isSecondary: a.isSecondary ?? false,
    secondaryTarget: a.secondaryTarget,
  } : null
  romanCache.set(cacheKey, info)
  return info
}

export function buildHarmonicAnalysis(
  chordSymbol: string,
  activeKey: string | null,
  prevChordSymbol: string | null
): HarmonicAnalysis {
  const chord = tryParseChord(chordSymbol)
  if (!chord) return emptyAnalysis(chordSymbol)
  const result = emptyAnalysis(chordSymbol)

  // Each field is optional: UMT throws for cases it does not support (e.g. non-12-TET).
  const bassNote = tryUMT('notes', () => chord.getNotes()[0] ?? null, null)
  if (bassNote) result.figuredBass = tryUMT('figured bass', () => UMT.FiguredBass.fromChord(chord, bassNote), '')
  result.suggestedScales = tryUMT('scales', () => UMT.Harmony.getSuggestedScales(chord).map(s => s.scale), [])

  if (!activeKey) return result

  const a = romanInKey(chordSymbol, activeKey)
  if (a) Object.assign(result, a)

  const prevChord = tryParseChord(prevChordSymbol)
  if (prevChord) {
    const cad = tryUMT('cadence', () => UMT.Harmony.analyzeCadence(prevChord, chord, activeKey), null)
    if (cad && cad !== 'No standard cadence') result.cadence = cad
  }

  result.substitutions = tryUMT('substitutions', () => UMT.getSubstitutions(chord, activeKey).map((s: any) => {
    const name = s.chord?.name ?? s.name ?? String(s)
    return s.type ? `${name} (${s.type})` : name
  }), [])

  return result
}

function emptyAnalysis(chordName: string): HarmonicAnalysis {
  return {
    chordName, roman: '?', function: 'unknown',
    isDiatonic: false, isBorrowed: false, isSecondary: false,
    figuredBass: '', suggestedScales: [], substitutions: [],
    cadence: null,
  }
}

export function getAutoKey(history: HistoryEntry[]): string | null {
  const noteNames = history.flatMap(e => e.notes)
  if (noteNames.length === 0) return null
  // Spelled as the key selector does ("Gb Major" → "F# Major").
  return normalizeKey(tryUMT('key detection', () => UMT.KeyDetection.detect(noteNames.map(n => UMT.parseNote(n)))[0]?.key ?? null, null))
}
