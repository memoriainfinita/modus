---
created: 2026-05-20
last_updated: 2026-10-09
---

# Modus — state

What is true now. What already happened lives in `state-history.md`.

## Project

**Modus** — real-time harmonic analysis tool for musicians. Connect a MIDI controller, play notes, get instant chord detection and full harmonic analysis; a chord history and song structure builder extend the core. Serverless — pure HTML + JS, no backend.

Part of the **memoriainfinita** ecosystem alongside UMT and notae. GPL-3.0.

**Spec:** `docs/spec.md` (design and behaviour only) · Executed plans and earlier spec revisions in `.archive/` (local, gitignored)

## Status

- Core app complete: detection, analysis, history, song builder, audio, CoF, guitar voicings, piano/fretboard
- 2026-10-09: TSC clean, 204 unit tests against the real UMT bundle, `pnpm test:e2e` 28/28 (installed Chrome + fake Web MIDI). Open: the two manual tests (real controller, Firefox)
- Audio: controller notes follow velocity, note-off and sustain pedal; previews (history, song, CoF, arrows, Space) cut the previous one; master gain for volume; the app starts without the soundfont-player script. Checked in Chrome with the real library: no source stops while a key is held; note-off and pedal-up stop with the 0.3 s release
- Detector flow: every source (MIDI, history, song, CoF, arrow keys) goes through `showDetection` in `app.ts`; analysis and diagrams are derived from it. Each diagram re-renders only when its inputs change
- Interaction model: a single click plays (history, song, CoF); double-click on a CoF major/minor segment sets the key; destructive actions run at once with an Undo toast
- With the key on Auto, the detected key drives the whole app
- `song-model.ts` reads localStorage `'modus-song'` and falls back to the old `'harmony-companion-song'` key; empty chord slots are never persisted
- No remote. Old project material in `.archive/` (gitignored)

## Stack

| Layer | Technology |
|---|---|
| App | TypeScript → esbuild → `dist/app.js` |
| Theory | UMT via jsDelivr CDN, pinned to commit `870d3d8` (`UMT.*` global) |
| Diagrams | notae via jsDelivr CDN, pinned to commit `8fb052d` (`Notae.*` global) |
| Staff | abcjs 6.7.1 via CDN (`ABCJS.*` global) |
| MIDI | Web MIDI API (Chrome, Edge, Firefox) |
| Guitar voicings | `UMT.getFretboardVoicings(chord, tuning)` filtered by `voicings.ts` — no fetch |
| Audio | soundfont-player 0.12.0 via CDN + FluidR3_GM |
| Styles | Plain CSS (`styles.css`) |
| Persistence | localStorage |

- **Package manager:** pnpm 11. `pnpm-workspace.yaml` holds `allowBuilds: esbuild: true` (pnpm 11 blocks install scripts by default)
- **Dev:** `pnpm dev` (watch) · `pnpm build` (one-shot) · `pnpm test` · `pnpm test:e2e` · `pnpm exec tsc --noEmit` · `pnpm dlx http-server . -p 8080`
- **Toolchain:** esbuild 0.28 · vitest 5 + vite 8 · jsdom 30 · TypeScript 5.9 (held on 5.x on purpose) · playwright-core (e2e, drives the installed Chrome)
- **Browser:** Chrome, Edge or Firefox for the controller (Web MIDI); the rest runs anywhere
- **CDN script tags:** in `index.html`. UMT/notae pinned by commit hash; abcjs 6.7.1 and soundfont-player 0.12.0 by npm version

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
// roman for D7 in C is "II7"; secondaryTarget is "V7/V" (lower case for minor targets: "V7/ii").
// Modus shows secondaryTarget in the Roman field (romanInKey in analyzer.ts)

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
- [theory] Music-theory fixes go into UMT or notae (their repo, tests, push), then Modus bumps the pin. No workarounds in Modus for library output. Confirmed 2026-10.
- [ux] Destructive actions run at once and offer Undo (`undo.ts`), never a confirmation. Confirmed 2026-10.
- [ux] Play on single click. A double click is detected by hand (same target within 400 ms) wherever the element is rebuilt on click: a rebuilt node never gets the browser's dblclick. Confirmed 2026-10.
- [audio] Stay on soundfont-player 0.12.0 + FluidR3_GM: archived upstream but pinned and working. smplr (same author) loads its GM soundfonts from the same `gleitz.github.io`, so swapping does not remove the sample-host risk. A reason to move would be smplr's sampled instruments (Steinway with velocity layers, electric pianos) or reverb, not maintenance. Confirmed 2026-10.
- [testing] `pnpm test:e2e` after each behaviour change: `tests/e2e/smoke.mjs` serves the repo, opens the installed Chrome (`channel: 'chrome'`) with a fake `navigator.requestMIDIAccess`, and plays notes through `window.__midi`. Each check releases all notes when it ends. Confirmed 2026-10.

## Preferences

- At session start Claude launches `pnpm dev` in background (`run_in_background: true`, `timeout: 7200000` — the default background limit kills it after 30 min); `--watch=forever` keeps it alive when stdin closes. Do not use `!` in chat for this (it blocks). `pnpm build` only to check errors on demand.

## TODO

- [ ] Test with a real MIDI controller: capture (⊙) chaining with its 250 ms settle time, hold/arpeggio modes, device hot-plug, the audio flash when a note arrives before the first click; by ear: the velocity curve (linear, `velocityGain` in `audio.ts`), note-off release and the sustain pedal
- [ ] Colour themes: user-selectable background and diagram colours (dots, frets, piano keys, CoF segments)
- [ ] More display modes [PENDIENTE: which ones — to define with the user]
- [ ] Modular layout (panels placed and resized freely, VSCode-style): undecided whether it is wanted
- [ ] Test in Firefox (Web MIDI behind a per-site permission): connection, playback, layout. The README and the warning already list Firefox; this confirms it
