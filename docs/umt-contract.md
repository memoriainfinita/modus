# Modus — UMT API contract

Verified by reading the UMT TypeScript source and, on 2026-10-02, by running the pinned bundle in Node. Do not assume — use these exact signatures. Tests load the real bundle (`tests/setup-umt.ts`), so drift shows up as a failing test.

```ts
// Convert note string to UMT Note object
UMT.parseNote(str: string, defaultOctave?: number): Note
// e.g. UMT.parseNote("C4"), UMT.parseNote("Bb3")

// Chord detection — takes Note[] objects, NOT strings
UMT.Harmony.detectChords(notes: Note[]): string[]
// Returns ranked chord name strings, e.g. ["Cmaj7"], ["Dm7", "F6/D"]
// Plain major triad is "CM" / "CM/E" (normalized to "C" / "C/E" in src/chord.ts)
// No match returns ["Unknown Chord"], which parseChordSymbol rejects (filtered in analyzer.ts)

// Chord object: name, rootStep, intervalsInSteps (semitones above root), bassStep, preferFlats
// There is NO `quality` field — chord family is derived from intervalsInSteps (src/chord.ts)
// chord.getNotes() → Note[] with name incl. octave, slash bass first: "C/E" → E3 C4 E4 G4

// Full harmonic analysis — returns .analysis (NOT .analyses)
UMT.Harmony.analyzeProgression(chords: Chord[], key: string): {
  analysis: ChordAnalysis[]   // ← .analysis, array
  modulations: ModulationEvent[]
  harmonicRhythm: number
}
// ChordAnalysis has: roman, degree, function ('T'|'S'|'D'|'unknown'),
// isDiatonic, isBorrowed, borrowedFrom, isSecondary, secondaryTarget, cadenceWithNext
// roman for D7 in C is "II7"; secondaryTarget is "V7/V" (lower case for minor targets: "V7/ii").
// Modus shows secondaryTarget in the Roman field (romanInKey in analyzer.ts)
// modulations and harmonicRhythm are not used by Modus yet

// Scales: letter-correct spelling for heptatonic 12-TET scales (F# major has E#)
UMT.parseScaleSymbol(symbol: string): Scale   // e.g. "F# Major"; .getNotes() → Note[] (8, root repeated)

UMT.FiguredBass.fromChord(chord: Chord, bassNote: Note): string

// Key detection (Krumhansl-Schmuckler)
UMT.KeyDetection.detect(notes: Note[]): { key: string; confidence: number }[]
// key like "C Major" / "Eb Minor" / "Gb Major" — Modus normalizes to the selector spelling

// Substitutions — standalone function, NOT Harmony.getSubstitutions
UMT.getSubstitutions(chord: Chord, key: string): SubstitutionResult[]

// Other confirmed methods
UMT.Harmony.analyzeCadence(c1: Chord, c2: Chord, key: string): string
UMT.Harmony.getSuggestedScales(chord: Chord): { scale: string; hint?: string }[]
UMT.Harmony.getColtraneAxis(key: string): { root: string; majorThirds: [string,string,string] }
UMT.Harmony.getNegativeHarmony(chord: Chord, key: string): Chord  // 12-TET only
UMT.parseChordSymbol(symbol: string): Chord
```

## MIDI → UMT Note conversion

```ts
// Pitch spelling: flats by default (jazz convention)
const PITCH_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const noteName = PITCH_NAMES_FLAT[midiNote % 12] + (Math.floor(midiNote / 12) - 1)
// MIDI 60 → "C4", MIDI 58 → "Bb3"
const umtNote = UMT.parseNote(noteName)
```
