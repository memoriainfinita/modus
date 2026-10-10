# Modus — UMT API contract

Verified by reading the UMT TypeScript source and, on 2026-10-10, by running the pinned bundle in Node. Do not assume — use these exact signatures. Tests load the real bundle (`tests/setup-umt.ts`), so drift shows up as a failing test.

```ts
// Convert note string to UMT Note object
UMT.parseNote(str: string, defaultOctave?: number): Note
// e.g. UMT.parseNote("C4"), UMT.parseNote("Bb3")

// Chord detection — takes Note[] objects, NOT strings
UMT.Harmony.detectChords(notes: Note[]): string[]
// Returns ranked chord name strings, e.g. ["Cmaj7"], ["Dm7", "F6/D"]
// Plain major triad is "C" / "C/E" (since 6750e23; it was "CM")
// No match returns ["Unknown Chord"], which parseChordSymbol rejects (filtered in detector/analyzer.ts)

// Chord object: name, rootStep, intervalsInSteps (semitones above root), bassStep, preferFlats
// There is NO `quality` field — chord family is derived from intervalsInSteps (theory/chord.ts)
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
// Secondary leading-tone chords too: F#dim7 in C → secondaryTarget "vii°7/V"
// function: every secondary and the tritone sub of V are 'D'; VII in minor 'D', bVII in major 'S'
// Natural minor: V, V7, vii°, vii°7 with the raised 7th are isDiatonic (G#dim7 in A minor → "vii°7")
// A secondary is never also isBorrowed (D7 in C is V7/V, not lydian)
// Modus shows secondaryTarget in the Roman field (romanInKey in detector/analyzer.ts)
// modulations and harmonicRhythm are not used by Modus yet

// Scales: letter-correct spelling for heptatonic 12-TET scales (F# major has E#)
UMT.parseScaleSymbol(symbol: string): Scale   // e.g. "F# Major"; .getNotes() → Note[] (8, root repeated)

UMT.FiguredBass.fromChord(chord: Chord, bassNote: Note): string
// Triads "", "6", "6/4"; seventh chords "7", "6/5", "4/3", "4/2"

// Key detection (Krumhansl-Schmuckler)
UMT.KeyDetection.detect(notes: Note[]): { key: string; confidence: number }[]
// key like "C Major" / "Eb Minor" / "Gb Major" — Modus normalizes to the selector spelling

// Substitutions — standalone function, NOT Harmony.getSubstitutions
UMT.getSubstitutions(chord: Chord, key: string): SubstitutionResult[]
// { chord, type: 'tritone'|'sus4'|'deceptive'|'diatonic'|'modal', explanation }
// Diatonic subs only in major / natural minor keys; 'modal' = minor subdominant family in major

// Other confirmed methods
UMT.Harmony.analyzeCadence(c1: Chord, c2: Chord, key: string): string  // deceptive: 'Deceptive Cadence (V -> vi)' in major, '(V -> VI)' in minor
UMT.Harmony.getSuggestedScales(chord: Chord): { scale: string; hint?: string }[]
UMT.Harmony.getColtraneAxis(key: string): { root: string; majorThirds: [string,string,string] }
UMT.Harmony.getNegativeHarmony(chord: Chord, key: string): Chord  // 12-TET only; rootStep is the named root, a different lowest note goes to bassStep (C6 in C → Cm7/Bb)
UMT.parseChordSymbol(symbol: string): Chord  // accepts 6/9, m6/9, 6/9/<bass>

// Spelling (12-TET; other tunings fall back to getNotes names / the chord unchanged)
UMT.spellPitchInKey(stepsFromA4: number, key: string): string  // "G#4" for MIDI 68 in "E Major"; flats for an unknown key
UMT.spellChord(chord: Chord, rootName?: string): string[]       // tones by interval, getNotes() order: Cm7b5 → C4 Eb4 Gb4 Bb4
UMT.spellChordInKey(chord: Chord, key: string): Chord           // Ab7 in A Major → G#7; unknown key → same chord
// Chord.getNotes() spells tritones by heuristic (Cm7b5 gives F#): Modus names chord notes with spellChord
```

## MIDI → UMT Note conversion

```ts
// Names handed to UMT for detection: flats. What is shown is respelled in the key (theory/spelling.ts)
const PITCH_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const noteName = PITCH_NAMES_FLAT[midiNote % 12] + (Math.floor(midiNote / 12) - 1)
// MIDI 60 → "C4", MIDI 58 → "Bb3"
const umtNote = UMT.parseNote(noteName)
```
