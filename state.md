---
created: 2026-05-20
last_updated: 2026-09-28
---

# Modus — state

What is true now. What already happened lives in `state-history.md`.

## Project

**Modus** — real-time harmonic analysis tool for musicians. Connect a MIDI controller, play notes, get instant chord detection and full harmonic analysis; a chord history and song structure builder extend the core. Serverless — pure HTML + JS, no backend.

Part of the **memoriainfinita** ecosystem alongside UMT and notae. GPL-3.0.

**Spec:** `docs/spec.md` · **Plan:** `docs/plan.md` (11 tasks, completed 2026-05-21)

## Status

- Core app complete and confirmed working with a MIDI controller: detection, analysis, history, song builder, audio, CoF, guitar voicings, piano/fretboard
- Last code session: 2026-06-13 (session 20, slop audit). TSC clean and 97 tests passing at that date. Not re-run on 2026-09-28: `node_modules` not installed
- Three confirmation patterns coexist on purpose (modal / double-click / `confirmOnce`): left for the UX audit TODO
- `song.ts` reads localStorage `'modus-song'` and falls back to the old `'harmony-companion-song'` key
- No remote. Old project material in `.archive/` (gitignored)

## Stack

| Layer | Technology |
|---|---|
| App | TypeScript → esbuild → `dist/app.js` |
| Theory | UMT via jsDelivr CDN (`UMT.*` global) |
| Diagrams | notae via jsDelivr CDN (`Notae.*` global) |
| Staff | abcjs 6.4.0 via CDN (`ABCJS.*` global) |
| MIDI | Web MIDI API (Chrome/Edge only) |
| Guitar voicings | `UMT.getFretboardVoicings(chord, UMT.GUITAR_STANDARD)` — no fetch |
| Audio | soundfont-player 0.12.0 via CDN + FluidR3_GM |
| Styles | Plain CSS (`styles.css`) |
| Persistence | localStorage |

- **Dev:** `npm run dev` (watch) · `npm run build` (one-shot) · `npm test` · `npx http-server . -p 8080`
- **Browser:** Chrome or Edge (Web MIDI API required)

### CDN script tags (index.html)

```html
<script src="https://cdn.jsdelivr.net/gh/memoriainfinita/UMT@main/dist/umt.js"></script>
<script src="https://cdn.jsdelivr.net/gh/memoriainfinita/notae@master/dist/notae.js"></script>
<script src="https://cdn.jsdelivr.net/npm/abcjs@6.4.0/dist/abcjs-basic-min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/soundfont-player@0.12.0/dist/soundfont-player.min.js"></script>
```

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

## Patterns

- [language] Everything in English: code, comments, documentation (spec, README, state.md), commit messages. Confirmed 2026-05.
- [typescript] esbuild watch mode, same toolchain as UMT and notae. Confirmed 2026-05.
- [typescript] `npm run build` does not typecheck (esbuild). Use `npx tsc --noEmit`. Confirmed 2026-05.
- [build] `dist/` is tracked in git, same as notae and UMT. Commit it in sync with `src/`. Confirmed 2026-05.
- [naming] Project name: Modus (Latin — mode, measure). Confirmed 2026-05.

## Preferences

- At session start Claude launches `npm run dev` in background (`run_in_background: true`); `--watch=forever` keeps it alive when stdin closes. Do not use `!` in chat for this (it blocks). `npm run build` only to check errors on demand.

## TODO

- [ ] Staff +/- size control — buttons were removed (did not work). Try ABCJS `scale` option or CSS transform on the container.
- [ ] showNoteNames in Notae — add an option to the library to show note names on neck dots (currently `showDegrees` as interim)
- [ ] CoF: click on a minor segment → select minor mode (e.g. click Am sets "A Minor" as active key, highlights the same diatonics as C Major but with Am as i — tonic colour moves to Am)
- [ ] Song: click on chord → play (currently dblclick only; decide if enough or add a ▶ per chord)
- [ ] Code organization review — `app.ts` is still the main file. Evaluate extracting more responsibilities (zone renderers, keyboard shortcuts, panel state).
- [ ] Test coverage review — tests cover pure logic. Check what critical cases are missing and whether audio.ts, diagrams.ts or app.ts deserve tests.
- [ ] UX audit — non-obvious behaviours the user does not know about: 800ms history debounce, same chord not logged twice in a row, dblclick to play, ⊙ for MIDI capture, drag between sections, the three confirmation patterns. Walk the whole app and decide per item: behaviour change, tooltip, help popup text, or nothing. Prioritize active confusion.
- [ ] Shortcuts review — Space already plays current/last chord, so P is redundant. Decide which shortcuts make sense, which are redundant, which are missing, before touching code.
- [ ] CoF audit — current CoF behaviour has several unexpected things (beyond the minor-mode TODO). Review what it does vs. what it should, missing or wrong interactions, visual confusion. Document and prioritize before implementing.
