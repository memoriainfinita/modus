---
created: 2026-05-20
last_updated: 2026-10-02
---

# Modus — state

What is true now. What already happened lives in `state-history.md`.

## Project

**Modus** — real-time harmonic analysis tool for musicians. Connect a MIDI controller, play notes, get instant chord detection and full harmonic analysis; a chord history and song structure builder extend the core. Serverless — pure HTML + JS, no backend.

Part of the **memoriainfinita** ecosystem alongside UMT and notae. GPL-3.0.

**Spec:** `docs/spec.md` · Executed plans in `docs/archive/`

## Status

- Core app complete: detection, analysis, history, song builder, audio, CoF, guitar voicings, piano/fretboard
- 2026-10-02 base review done (pnpm, UMT contract, bug batch, detector refactor). TSC clean, 152 tests (against the real UMT bundle), 25/25 headless-Chrome smoke checks with a fake MIDI input. Not yet re-tested with a real MIDI controller
- Detector flow: every source (MIDI, history, song, CoF) goes through `showDetection` in `app.ts`; analysis and diagrams are derived from it
- Three confirmation patterns coexist on purpose (modal / double-click / `confirmOnce`): left for the UX audit TODO
- `song-model.ts` reads localStorage `'modus-song'` and falls back to the old `'harmony-companion-song'` key
- No remote. Old project material in `.archive/` (gitignored)

## Stack

| Layer | Technology |
|---|---|
| App | TypeScript → esbuild → `dist/app.js` |
| Theory | UMT via jsDelivr CDN, pinned to commit `82d575f` (`UMT.*` global) |
| Diagrams | notae via jsDelivr CDN, pinned to commit `610ddd9` (`Notae.*` global) |
| Staff | abcjs 6.4.0 via CDN (`ABCJS.*` global) |
| MIDI | Web MIDI API (Chrome/Edge only) |
| Guitar voicings | `UMT.getFretboardVoicings(chord, UMT.GUITAR_STANDARD)` — no fetch |
| Audio | soundfont-player 0.12.0 via CDN + FluidR3_GM |
| Styles | Plain CSS (`styles.css`) |
| Persistence | localStorage |

- **Package manager:** pnpm 11. `pnpm-workspace.yaml` holds `allowBuilds: esbuild: true` (pnpm 11 blocks install scripts by default)
- **Dev:** `pnpm dev` (watch) · `pnpm build` (one-shot) · `pnpm test` · `pnpm exec tsc --noEmit` · `pnpm dlx http-server . -p 8080`
- **Toolchain:** esbuild 0.28 · vitest 5 + vite 8 · jsdom 30 · TypeScript 5.9 (held on 5.x on purpose)
- **Browser:** Chrome or Edge (Web MIDI API required)
- **CDN script tags:** in `index.html`. UMT/notae pinned by commit hash; abcjs 6.4.0 and soundfont-player 0.12.0 by npm version

## UMT API — verified directly from source

These were confirmed by reading the actual TypeScript source of the UMT library and, on 2026-10-02, by running the pinned bundle in Node. Do not assume — use these exact signatures. Tests load the real bundle (`tests/setup-umt.ts`), so drift shows up as a failing test.

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
- [typescript] `pnpm build` does not typecheck (esbuild). Use `pnpm exec tsc --noEmit`. Confirmed 2026-05.
- [build] `dist/` is tracked in git, same as notae and UMT. Commit it in sync with `src/`. Confirmed 2026-05.
- [build] pnpm, not npm. Confirmed 2026-10.
- [deps] UMT and notae pinned to a commit hash in the CDN URL, never `@main`/`@master`. Bump deliberately. Confirmed 2026-10.
- [naming] Project name: Modus (Latin — mode, measure). Confirmed 2026-05.

## Preferences

- At session start Claude launches `pnpm dev` in background (`run_in_background: true`); `--watch=forever` keeps it alive when stdin closes. Do not use `!` in chat for this (it blocks). `pnpm build` only to check errors on demand.

## TODO

- [ ] Staff +/- size control — buttons were removed (did not work). Try ABCJS `scale` option or CSS transform on the container.
- [ ] showNoteNames in Notae — add an option to the library to show note names on neck dots (currently `showDegrees` as interim)
- [ ] CoF: click on a minor segment → select minor mode (e.g. click Am sets "A Minor" as active key, highlights the same diatonics as C Major but with Am as i — tonic colour moves to Am)
- [ ] Song: click on chord → play (currently dblclick only; decide if enough or add a ▶ per chord)
- [ ] Code organization review — `song.ts` split into model/view on 2026-10-02; `app.ts` (~760 lines) still holds layout, detector, zones and shortcuts. Evaluate extracting layout/panel state and keyboard shortcuts.
- [ ] Test coverage review — pure logic, staff ABC and chord adapters are tested against real UMT; `audio.ts`, `app.ts` and the song view have no tests. The headless smoke script (scratch, CDP + fake MIDI input) could become a committed e2e check.
- [ ] Test with a real MIDI controller after the 2026-10-02 refactor: capture (⊙) settle time of 250 ms, hold/arpeggio modes, device hot-plug
- [ ] Auto key is half-implemented — only the analysis panel uses it; history chips, song degrees, CoF and staff key signature ignore it
- [ ] Custom guitar tuning shows the first matching fret per string, not a playable voicing, and does not validate input. UMT accepts numeric tunings: derive them and use `getFretboardVoicings`
- [ ] Guitar voicings: UMT returns hundreds (687 for C) navigated one by one. Filter/sort (position, span, playability)
- [ ] Song cursor and MIDI-fill "next slot" stop at the end of a measure; decide whether they should continue into the next measure/section
- [ ] Rendering cost: every MIDI event re-renders all diagrams including the CoF SVG
- [ ] Firefox supports Web MIDI (site permission) — check Modus there and update the Chrome/Edge-only warning
- [ ] UMT: scale/key spelling is by pitch, not by letter (F# major gives F, not E#), so Modus keeps its own key-signature table (`src/keys.ts`). A letter-correct spelling in UMT would let Modus drop it
- [ ] UX audit — non-obvious behaviours the user does not know about: 800ms history debounce, same chord not logged twice in a row, dblclick to play, ⊙ for MIDI capture, drag between sections, the three confirmation patterns. Walk the whole app and decide per item: behaviour change, tooltip, help popup text, or nothing. Prioritize active confusion.
- [ ] Shortcuts review — Space and P now both call the same `playCurrent`, so P is redundant. Decide which shortcuts make sense, which are redundant, which are missing, before touching code.
- [ ] CoF audit — current CoF behaviour has several unexpected things (beyond the minor-mode TODO). Review what it does vs. what it should, missing or wrong interactions, visual confusion. Document and prioritize before implementing. Known from the 2026-10-02 review: a minor active key highlights the parallel major's diatonics; "F# Major" is not highlighted in flat mode (and Db in sharp mode); sharp-mode minor ring shows Bbm opposite C# (should be A#m); the dim ring labels every segment "vii°" when degrees are on; major-segment click also changes the active key
