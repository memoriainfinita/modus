# Modus — UMT API contract

Verified by reading the UMT TypeScript source and, on 2026-10-10, by running the pinned bundle in Node. Pinned to the release tag `v0.3.0` since 2026-10-11 (changes per version in UMT's `CHANGELOG.md`; the npm package exports the IIFE as `umt/iife`). Do not assume — use these exact signatures. Tests load the real bundle (`tests/setup-umt.ts`), so drift shows up as a failing test.

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
// Each note by its interval above the written root (since ac10838): D#m → D# F# A#, Cm7b5 → Gb; E#, Cb, double accidentals possible

// Full harmonic analysis — returns .analysis (NOT .analyses)
UMT.Harmony.analyzeProgression(chords: Chord[], key: string, opts?: { spelling?: 'key' | 'written', durations?: number[], beatsPerBar?: number }): {
  analysis: ChordAnalysis[]   // ← .analysis, array
  modulations: ModulationEvent[]   // { atIndex, fromKey, toKey, type: 'pivot' | 'direct', pivotChord? }
  harmonicRhythm: number
  harmonicRhythmUnit: 'per-bar' | 'per-chord'   // per bar only with durations
}
// ChordAnalysis has: roman, degree, function ('T'|'S'|'D'|'unknown'),
// isDiatonic, isBorrowed, borrowedFrom, isSecondary, secondaryTarget, cadenceWithNext, key
// key: the local key, lower-case mode after a modulation ("G major"); Modus normalizes it.
// A modulation needs three chords or more in the new key (authentic cadence, then its tonic, then
// Krumhansl); fewer is a tonicization. Numerals and cadences after it are read in the new key.
// roman for D7 in C is "II7"; secondaryTarget is "V7/V" (lower case for minor targets: "V7/ii").
// Secondary leading-tone chords too: F#dim7 in C → secondaryTarget "vii°7/V"
// Modus always passes { spelling: 'written' }: the numeral follows the letter of the symbol given
// (Gb in C → "bV", F# → "#IV", F#dim7 → "#iv°7"). The default ('key') respells with spellChordInKey.
// function: every secondary and the tritone sub of V are 'D'; VII in minor 'D', bVII in major 'S'
// Natural minor: V, V7, vii°, vii°7 with the raised 7th are isDiatonic (G#dim7 in A minor → "vii°7")
// A secondary is never also isBorrowed (D7 in C is V7/V, not lydian)
// Modus shows secondaryTarget in the Roman field (romanInKey in detector/analyzer.ts)
// Modus reads modulations through ChordAnalysis.key (history); harmonicRhythm is not used: the history has no timing

// Scales: letter-correct spelling for heptatonic 12-TET scales (F# major has E#)
UMT.parseScaleSymbol(symbol: string): Scale   // e.g. "F# Major"; .getNotes() → Note[] (8, root repeated)
scale.getDiatonicChords(type: 'triad' | 'seventh'): Chord[]  // letters of the scale: E#m7b5 in F# Major. "A Minor" is natural minor (Em, G)

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
UMT.Harmony.getColtraneAxis(key: string): { root: string; majorThirds: [string,string,string] }  // names in flats (F# Major → Gb Bb D): Modus writes them in the key
UMT.Harmony.getBorrowedChords(key: string): { chord: Chord; sourceMode: string; brightness: number; function; characteristic: boolean }[]
// Seventh chords only, of lydian, mixolydian, dorian, aeolian, phrygian, locrian, harmonic minor, melodic minor,
// harmonic major on the key's tonic, keeping those with a note outside the key's scale. A mode identical to the key is skipped.
// brightness: lydian 1, mixolydian -1, dorian -2, aeolian -3, phrygian -4, locrian -5, harmonic minor -3, melodic minor -2, harmonic major -1
// In a minor key it lists V7 and vii°7 under harmonic minor, which analyzeProgression counts as diatonic
UMT.Harmony.getNegativeHarmony(chord: Chord, key: string): Chord  // 12-TET only; rootStep is the named root, a different lowest note goes to bassStep (C6 in C → Cm7/Bb)
UMT.parseChordSymbol(symbol: string): Chord  // accepts 6/9, m6/9, 6/9/<bass>

// Spelling (12-TET; other tunings fall back to getNotes names / the chord unchanged)
UMT.spellPitchInKey(stepsFromA4: number, key: string): string  // "G#4" for MIDI 68 in "E Major"; flats for an unknown key
UMT.spellChord(chord: Chord, rootName?: string): string[]       // tones by interval, getNotes() order: Cm7b5 → C4 Eb4 Gb4 Bb4
UMT.spellChordInKey(chord: Chord, key: string): Chord           // Ab7 in A Major → G#7; unknown key → same chord
// Chord.getNotes() and spellChord agree since ac10838; Modus names chord notes with spellChord
```

## MIDI → UMT Note conversion

```ts
// Names handed to UMT for detection: flats. What is shown is respelled in the key (theory/spelling.ts)
const PITCH_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const noteName = PITCH_NAMES_FLAT[midiNote % 12] + (Math.floor(midiNote / 12) - 1)
// MIDI 60 → "C4", MIDI 58 → "Bb3"
const umtNote = UMT.parseNote(noteName)
```
