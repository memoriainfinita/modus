# Modus — State

## System

- **Location:** `C:\Users\mykl\OneDrive\Scriptorium\DOCS\CODING GIT\MODUS\`
- **Status:** Implementation complete — ready for manual smoke test in Chrome
- **Dev command:** `node build.js` (watch) + `npx http-server . -p 8080`
- **Browser:** Chrome or Edge (Web MIDI API required)

---

## Project

**Modus** — real-time MIDI harmonic analysis tool and song structure builder.

A single-page TypeScript app used alongside MuseScore during song transcription. Connect a MIDI controller, play notes, see chord detection + full harmonic analysis in real time. Build and annotate song structures with Roman numeral degree display.

**Spec:** `docs/spec.md`
**Plan:** `docs/plan.md`

The plan has **11 tasks**. All code is written out step by step. Start from Task 1.

---

## Stack

| Layer | Technology |
|---|---|
| App | TypeScript → esbuild → `dist/app.js` |
| Theory | UMT via jsDelivr CDN (`UMT.*` global) |
| Diagrams | notae via jsDelivr CDN (`Notae.*` global) |
| Staff | abcjs 6.4.0 via CDN (`ABCJS.*` global) |
| MIDI | Web MIDI API (Chrome/Edge only) |
| Guitar voicings | @tombatossals/chords-db 1.4.5 via jsDelivr (JSON fetch) |
| Audio | WebAudioFont 2.1.0 via jsDelivr CDN (GM piano) |
| Persistence | localStorage |

### Exact CDN URLs (for index.html)

```html
<script src="https://cdn.jsdelivr.net/gh/memoriainfinita/UMT@main/dist/umt.js"></script>
<script src="https://cdn.jsdelivr.net/gh/memoriainfinita/notae@master/dist/notae.js"></script>
<script src="https://cdn.jsdelivr.net/npm/abcjs@6.4.0/dist/abcjs-basic-min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/webaudiofont@2.1.0/npm/dist/WebAudioFontPlayer.js"></script>
<script src="https://cdn.jsdelivr.net/npm/webaudiofont@2.1.0/npm/dist/sf2staccato/_tone_0000_GeneralUserGS_sf2_file.js"></script>
```
Guitar DB (fetch): `https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@1.4.5/src/data/guitar.json`

---

## UMT API — verified directly from source

These were confirmed by reading the actual TypeScript source of the UMT library. Do not assume — use these exact signatures.

```ts
// Convert note string to UMT Note object
UMT.parseNote(str: string, defaultOctave?: number): Note
// e.g. UMT.parseNote("C4"), UMT.parseNote("Bb3")

// Chord detection — takes Note[] objects, NOT strings
UMT.Harmony.detectChords(notes: Note[]): string[]
// Returns ranked chord name strings, e.g. ["Cmaj7", "Em/C", ...]

// Full harmonic analysis — returns .analysis (NOT .analyses)
UMT.Harmony.analyzeProgression(chords: Chord[], key: string): {
  analysis: ChordAnalysis[]   // ← .analysis, array
  modulations: ModulationEvent[]
  harmonicRhythm: number
}
// ChordAnalysis has: roman, degree, function ('T'|'S'|'D'|'unknown'),
// isDiatonic, isBorrowed, borrowedFrom, isSecondary, secondaryTarget, cadenceWithNext

// Figured bass FROM a chord (not parsing — generating)
UMT.FiguredBass.fromChord(chord: Chord, bassNote: Note): string

// Key detection (Krumhansl-Schmuckler)
UMT.KeyDetection.detect(notes: Note[]): { key: string; confidence: number }[]

// Substitutions — standalone function, NOT Harmony.getSubstitutions
UMT.getSubstitutions(chord: Chord, key: string): SubstitutionResult[]

// Other confirmed methods
UMT.Harmony.analyzeCadence(c1: Chord, c2: Chord, key: string): string
UMT.Harmony.getSuggestedScales(chord: Chord): { scale: string; hint?: string }[]
UMT.Harmony.getColtraneAxis(key: string): { root: string; majorThirds: [string,string,string] }
UMT.Harmony.getNegativeHarmony(chord: Chord, key: string): Chord  // 12-TET only
UMT.parseChordSymbol(symbol: string): Chord
```

### MIDI → UMT Note conversion

```ts
// Pitch spelling: flats by default (jazz convention)
const PITCH_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const noteName = PITCH_NAMES_FLAT[midiNote % 12] + (Math.floor(midiNote / 12) - 1)
// MIDI 60 → "C4", MIDI 58 → "Bb3"
const umtNote = UMT.parseNote(noteName)
```

---

## File Structure (target)

```
modus/
  src/
    app.ts         types.ts       globals.d.ts
    midi.ts        analyzer.ts    audio.ts
    diagrams.ts    history.ts     song.ts
  tests/
    analyzer.test.ts   song.test.ts
  index.html   build.js   package.json   tsconfig.json   vitest.config.ts
  dist/app.js  (generated)
```

---

## Patterns

- [typescript] esbuild watch mode, same toolchain as UMT and notae. Confirmed 2026-05.
- [naming] Project name: Modus (Latin — mode, measure). Confirmed 2026-05.
- [umt] detectChords takes Note[] not strings — always convert with parseNote first.
- [umt] analyzeProgression returns .analysis (array), not .analyses.
- [umt] getSubstitutions is top-level, not Harmony.getSubstitutions.

---

## History

### 2026-05-21 — Visual + bug fixes, smoke test partial

Bug fixes: hold mode chord building (physicallyHeldNotes), stale handlers in song.ts (makeSongHandlers fresh each render), activeCursorId conflation history/song (historyActiveCursorId added), device listener accumulation, state restore on load (key, mode, panels). Arpeggio timer now clears display after 1.2s. Chord alternatives shown as visible chips (up to 8). Layout: staff+CoF inline, page scroll, nav bar added. Notation/analysis panels fixed to always-visible (not persisted). App confirmed working with MIDI controller.

Pending visual work (next session): notation panel LEFT / analysis RIGHT, staff bigger, piano range change less jarring, piano/CoF not appearing abruptly.

### 2026-05-21 — Full implementation

All 11 tasks executed in one session without agents. 23 unit tests passing (midi, analyzer, song). All spec gaps from Task 11 implemented inline (substitutions, capture flow, voicing button, quality badges, colour picker, form analysis, cursor insertion, browser warning). TypeScript clean. Ready for manual smoke test.

### 2026-05-20 — Project initiated

Full brainstorming and spec session. Spec written (rev 5), implementation plan written (11 tasks). Project name chosen: **Modus**. Folder created, git init'd. Ready for scaffold.

---

## TODO

- [x] Manual smoke test — app confirmed working with MIDI controller
- [ ] Layout: notación LEFT / análisis RIGHT (interrumpido en sesión anterior)
- [ ] Staff más grande (min-height mayor, ocupar el espacio bien)
- [ ] Piano: range adjustment sin saltos bruscos de tamaño
- [ ] Piano y CoF: no aparecer de repente (transición suave o placeholder)
- [ ] Revisar header de navegación (usuario lo encuentra confuso)
