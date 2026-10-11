# Modus — UMT API contract

Verified by reading the UMT TypeScript source and, on 2026-10-10, by running the pinned bundle in Node. Pinned to the release tag `v0.5.0` since 2026-10-11 (changes per version in UMT's `CHANGELOG.md`; the npm package exports the IIFE as `umt/iife`). Do not assume — use these exact signatures. Tests load the real bundle (`tests/setup-umt.ts`), so drift shows up as a failing test.

```ts
// Convert note string to UMT Note object
UMT.parseNote(str: string, defaultOctave?: number): Note
// e.g. UMT.parseNote("C4"), UMT.parseNote("Bb3")

// Chord detection — takes Note[] objects, NOT strings
UMT.Harmony.detectChords(notes: Note[]): string[]
// Returns ranked chord name strings, e.g. ["Cmaj7"], ["Dm7", "F6/D"]
// Plain major triad is "C" / "C/E" (since 6750e23; it was "CM")
// No match returns ["Unknown Chord"], which parseChordSymbol rejects (filtered in detector/analyzer.ts)
UMT.Harmony.detectChordsScored(notes: Note[]): { name, root, bass, quality, score, rootInBass, omitted, tensions }[]
// What Modus uses since v0.3.0: best first; readings may omit the fifth (G2 B3 F4 → G7, omitted ['5'])

// Analysis fields added with v0.3.0
UMT.analyzeVoicing(notes: Note[], chord?: Chord): { chord, voices, bass, bassDegree, inversion, position: 'close'|'open', drop: 'drop 2'|'drop 3'|'drop 2+4'|null, doubled, omitted, added, span }
// degrees as 'R', '3', '5', 'b7', '9'…; added are note names outside the chord
UMT.findScalesForNotes(notes: Note[], { tonic?, tonicOnly?, limit? }): { name: 'C major', root, type, aliases, notes, extra, rootIsTonic, tier }[]
// ranked by tonic, tier, then fewest extra notes; includes the chromatic scale, which Modus drops
UMT.getUpperStructures(dominant: Chord): { triad: Chord, tensions: string[], label: 'II UST' … }[]  // [] unless the chord has a 3rd and b7
UMT.NeoRiemannian.P / L / R(chord: Chord): Chord | null   // null for anything but a major or minor triad
UMT.SetTheory.getPitchClasses(notes) / getForteNumber(pcs) / primeForm(pcs) / intervalVector(pcs)

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
UMT.Harmony.getBorrowedChords(key: string, { type: 'triad' | 'seventh' } = seventh): { chord: Chord; sourceMode: string; brightness: number; function; characteristic: boolean }[]
// Chords of lydian, mixolydian, dorian, aeolian, phrygian, locrian, harmonic minor, melodic minor,
// harmonic major on the key's tonic, keeping those with a note outside the key's scale. A mode identical to the key is skipped.
// brightness: lydian 1, mixolydian -1, dorian -2, aeolian -3, phrygian -4, locrian -5, harmonic minor -3, melodic minor -2, harmonic major -1
// In a minor key, harmonic minor's V, V7, vii°, vii°7 are not listed (diatonic, as in analyzeProgression; since v0.4.0): Modus shows them under v and VII
// characteristic (v0.4.0): carries the degree that sets the mode apart from its reference scale (#4 lydian, b7 mixolydian, 6 dorian, b2 phrygian, b2 or b5 locrian, b6 aeolian…)
UMT.Harmony.getNegativeHarmony(chord: Chord, key: string): Chord  // 12-TET only; rootStep is the named root, a different lowest note goes to bassStep (C6 in C → Cm7/Bb)
UMT.parseChordSymbol(symbol: string): Chord  // accepts 6/9, m6/9, 6/9/<bass>

// Spelling (12-TET; other tunings fall back to getNotes names / the chord unchanged)
UMT.spellPitchInKey(stepsFromA4: number, key: string): string  // "G#4" for MIDI 68 in "E Major"; flats for an unknown key
UMT.spellChord(chord: Chord, rootName?: string): string[]       // tones by interval, getNotes() order: Cm7b5 → C4 Eb4 Gb4 Bb4
UMT.spellChordInKey(chord: Chord, key: string): Chord           // Ab7 in A Major → G#7; unknown key → same chord
// Chord.getNotes() and spellChord agree since ac10838; Modus names chord notes with spellChord

// Names in Spanish (v0.3.0), for the interface language (src/i18n)
UMT.localizeNoteName(name: string, language: 'en' | 'es', long?: boolean): string   // 'F#4' → 'Fa#4'; octave kept
UMT.formatChordSymbol(chord: Chord | string, { style?, roots?: 'letters' | 'solfege' }): string  // 'Bbm7/D' → 'Sibm7/Re'; the quality as written
UMT.translateSymbol(input: string, aliases: Record<string, string>): string  // with { ...SOLFEGE_ROOTS, ...QUALITY_ALIASES_ES }: 'Lam7' → 'Am7'
// Greedy and case-sensitive: 'Fadd9' → 'Fdd9', so Modus keeps the letters when the translation is no chord.
// parseChordSymbol reads 'Do' and 'Do7' as D°, D°7: Modus reads a syllable-initial name as solfège first
UMT.SOLFEGE_ROOTS: Record<string, string>        // Do Re Mi Fa Sol La Si
UMT.QUALITY_ALIASES_ES: Record<string, string>   // mayor, menor, disminuido, aumentado, semidisminuido, dominante
// Theory names (v0.5.0); an unknown name is returned unchanged
UMT.scaleName(name: string, language?: 'en' | 'es', { roots?: 'letters' | 'solfege' }): string  // 'D dorian' → 'Re dórico'; without root too
UMT.cadenceName(cadence: string, language?: 'en' | 'es', { short?: boolean }): string  // 'Deceptive Cadence (V -> VI)' → 'Cadencia rota (V -> VI)', short 'Rota'; en short 'Phrygian half'
UMT.substitutionTypeName(type: string, language?: 'en' | 'es'): string   // 'tritone' → 'tritonal', 'chromatic-mediant' → 'mediante cromática'
// Spelled-out qualities ('Re menor') translate to 'D minor', which UMT parses and keeps as its name
```

## MIDI → UMT Note conversion

```ts
// Names handed to UMT for detection: flats. What is shown is respelled in the key (theory/spelling.ts)
const PITCH_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const noteName = PITCH_NAMES_FLAT[midiNote % 12] + (Math.floor(midiNote / 12) - 1)
// MIDI 60 → "C4", MIDI 58 → "Bb3"
const umtNote = UMT.parseNote(noteName)
```
