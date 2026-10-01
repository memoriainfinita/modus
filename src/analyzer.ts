import type { DetectionResult, HarmonicAnalysis, HistoryEntry, SingleNoteResult, IntervalResult, ChordResult } from './types'
import { midiToNoteName, PITCH_NAMES_FLAT } from './midi'
import { tryParseChord, isKnownChord, normalizeChordName } from './chord'

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
  try {
    const umtNotes = noteNames.map(n => UMT.parseNote(n))
    candidates = (UMT.Harmony.detectChords(umtNotes) ?? []).map(normalizeChordName).filter(isKnownChord)
    candidates = [...new Set(candidates)]
  } catch { }
  const result: ChordResult = {
    kind: 'chord',
    notes: noteNames,
    candidates: candidates.length ? candidates : ['?'],
    selectedIndex: 0,
  }
  return result
}

export function buildHarmonicAnalysis(
  chordSymbol: string,
  activeKey: string | null,
  prevChordSymbol: string | null
): HarmonicAnalysis {
  const chord = tryParseChord(chordSymbol)
  if (!chord) return emptyAnalysis(chordSymbol)
  const notes = chord.getNotes ? chord.getNotes() : []
  const bassNote = notes[0] ?? null

  let roman = '?'
  let fn: 'T' | 'S' | 'D' | 'unknown' = 'unknown'
  let isDiatonic = false
  let isBorrowed = false
  let borrowedFrom: string | undefined
  let isSecondary = false
  let secondaryTarget: string | undefined
  let cadence: string | null = null

  if (activeKey) {
    try {
      const { analysis } = UMT.Harmony.analyzeProgression([chord], activeKey)
      const a = analysis[0]
      roman = a.roman ?? '?'
      fn = a.function ?? 'unknown'
      isDiatonic = a.isDiatonic ?? false
      isBorrowed = a.isBorrowed ?? false
      borrowedFrom = a.borrowedFrom
      isSecondary = a.isSecondary ?? false
      secondaryTarget = a.secondaryTarget
    } catch { /* unsupported tuning or parse error */ }

    if (prevChordSymbol) {
      try {
        const prevChord = UMT.parseChordSymbol(prevChordSymbol)
        const cad = UMT.Harmony.analyzeCadence(prevChord, chord, activeKey)
        if (cad && cad !== 'No standard cadence') cadence = cad
      } catch { /* ignore */ }
    }
  }

  let figuredBass = ''
  if (bassNote) {
    try { figuredBass = UMT.FiguredBass.fromChord(chord, bassNote) } catch { }
  }

  const suggestedScales: string[] = []
  try {
    UMT.Harmony.getSuggestedScales(chord).forEach((s: any) => suggestedScales.push(s.scale))
  } catch { }

  let coltraneAxis: [string, string, string] | null = null
  try {
    if (activeKey) {
      const ax = UMT.Harmony.getColtraneAxis(activeKey)
      coltraneAxis = ax.majorThirds
    }
  } catch { }

  let negativeHarmony: string | null = null
  try {
    if (activeKey) {
      const neg = UMT.Harmony.getNegativeHarmony(chord, activeKey)
      negativeHarmony = neg?.name ?? null
    }
  } catch { }

  const substitutions: string[] = []
  try {
    if (activeKey) {
      const subs = UMT.getSubstitutions(chord, activeKey)
      subs.forEach((s: any) => {
        const name = s.chord?.name ?? s.name ?? String(s)
        const type = s.type ?? ''
        substitutions.push(type ? `${name} (${type})` : name)
      })
    }
  } catch { }

  return {
    chordName: chordSymbol,
    roman,
    function: fn,
    isDiatonic,
    isBorrowed,
    borrowedFrom,
    isSecondary,
    secondaryTarget,
    figuredBass,
    suggestedScales,
    substitutions,
    cadence,
    coltraneAxis,
    negativeHarmony,
  }
}

function emptyAnalysis(chordName: string): HarmonicAnalysis {
  return {
    chordName, roman: '?', function: 'unknown',
    isDiatonic: false, isBorrowed: false, isSecondary: false,
    figuredBass: '', suggestedScales: [], substitutions: [],
    cadence: null, coltraneAxis: null, negativeHarmony: null,
  }
}

export function getAutoKey(history: HistoryEntry[]): string | null {
  if (history.length === 0) return null
  const allNotes = history.flatMap(e => e.notes.map(n => UMT.parseNote(n)))
  if (allNotes.length === 0) return null
  try {
    const results = UMT.KeyDetection.detect(allNotes)
    return results[0]?.key ?? null
  } catch { return null }
}
