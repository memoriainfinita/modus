---
created: 2026-05-20
last_updated: 2026-10-10
---

# Modus — state

What is true now. What already happened lives in `state-history.md`.

## Project

**Modus** — see and understand the harmony of what you play, in real time. Aimed at being a complete, professional, useful, universal and didactic app, for studying, transcribing songs, composing, teaching and making videos. No time or budget limits, no marketing or profit goals. GPL-3.0, part of the **memoriainfinita** ecosystem: UMT (developed for Modus, all theory) and notae (diagrams).

- **Spec:** `docs/spec.md` (purpose, design, behaviour) · **UMT contract:** `docs/umt-contract.md` · Executed plans and earlier spec revisions in `.archive/` (local, gitignored)
- **Stack and commands:** `README.md`. Not there: pnpm 11 needs `allowBuilds: esbuild: true` in `pnpm-workspace.yaml` (it blocks install scripts by default); TypeScript held on 5.x on purpose; UMT pinned to `debda14`, notae to `8fb052d`

## Status

- Working: detector, analysis, history, song builder, audio, CoF, guitar voicings, piano/fretboard. The roadmap in TODO is open: the app is not complete
- Audio: controller notes follow velocity, note-off and sustain pedal; previews cut the previous one; master volume; the app starts without the soundfont-player script
- Tests 2026-10-10: TSC clean, 206 unit tests against the real UMT bundle, `pnpm test:e2e` 32/32 (installed Chrome + fake Web MIDI, Chrome-style and Firefox-style hot-plug). Firefox and a real controller checked by hand
- UMT output reviewed 2026-10-10 (every call Modus makes, 24 keys × 24 chords): no throws, shapes as `docs/umt-contract.md`. The theory criteria UMT applies (functions, harmonic minor, secondary leading-tone chords, substitutions) are in UMT's `state.md` Patterns
- Publication: when the app is complete. Until then no remote; then public repo and Pages, like `2_finished`
- Interface languages: English and Spanish (today English only). Docs, code and commits stay in English

## Patterns

- [language] Everything in English: code, comments, documentation (spec, README, state.md), commit messages. Confirmed 2026-05.
- [typescript] esbuild watch mode, same toolchain as UMT and notae. Confirmed 2026-05.
- [typescript] `pnpm build` does not typecheck (esbuild). Use `pnpm exec tsc --noEmit`. Confirmed 2026-05.
- [build] `dist/` is tracked in git, same as notae and UMT. Commit it in sync with `src/`. Confirmed 2026-05.
- [build] pnpm, not npm. Confirmed 2026-10.
- [deps] UMT and notae pinned to a commit hash in the CDN URL, never `@main`/`@master`. Bump deliberately. Confirmed 2026-10.
- [naming] Project name: Modus (Latin — mode, measure). Confirmed 2026-05.
- [theory] Music-theory fixes go into UMT or notae (their repo, tests, push), then Modus bumps the pin. No workarounds in Modus for library output. Confirmed 2026-10.
- [ux] Destructive actions run at once and offer Undo (`ui/undo.ts`), never a confirmation. Confirmed 2026-10.
- [ux] Play on single click. A double click is detected by hand (same target within 400 ms) wherever the element is rebuilt on click: a rebuilt node never gets the browser's dblclick. Confirmed 2026-10.
- [audio] Stay on soundfont-player 0.12.0 + FluidR3_GM: archived upstream but pinned and working. smplr (same author) loads its GM soundfonts from the same `gleitz.github.io`, so swapping does not remove the sample-host risk. A reason to move would be smplr's sampled instruments (Steinway with velocity layers, electric pianos) or reverb, not maintenance. Confirmed 2026-10.
- [testing] `pnpm test:e2e` after each behaviour change: `tests/e2e/smoke.mjs` serves the repo, opens the installed Chrome (`channel: 'chrome'`) with a fake `navigator.requestMIDIAccess`, and plays notes through `window.__midi`. Each check releases all notes when it ends. `window.__plug(id, name|null)` hot-plugs; `__hotplug(false)` switches to Firefox behaviour. Confirmed 2026-10.
- [midi] Firefox reports no hot-plug (no statechange, `inputs` frozen) but a new `requestMIDIAccess` returns the current ports: `input/midi.ts` rescans every 2 s while visible and on focus. The device the user picked (or the first used) is preferred: a fallback never replaces it. Confirmed 2026-10.

## Preferences

- `pnpm dev` only when a task needs continuous rebuilds, not at session start; otherwise `pnpm build`. When launched: in background (`run_in_background: true`, `timeout: 7200000` — the default background limit kills it after 30 min), never with `!` in chat (it blocks). `--watch=forever` outlives TaskStop and the session: at the end, kill the `cmd.exe` tree whose command line has `watch=forever` (`taskkill /PID <pid> /T /F`).

## TODO

Roadmap agreed 2026-10-09, not yet prioritized.

### Tests

- [ ] Unplug and replug the controller in Firefox with loopMIDI present: the list drops it within ~2 s, and it plays again once replugged

### Songs and data

- [ ] Several saved songs (today one: `modus-song`, and New replaces it)
- [ ] Export / import songs to a file
- [ ] Share a song or example by URL, encoded in the link (no server)
- [ ] MIDI file import / export
- [ ] Export to MusicXML and a chord-sheet PDF
- [ ] Play the song at a tempo, with time signature (today only chord by chord with the arrows)
- [ ] Whole-song analysis from `analyzeProgression`: modulations and harmonic rhythm (returned by UMT, unused today), key per section, cadences between sections

### Input

- [ ] Clicking the on-screen piano feeds the detector (today it only sounds the note, `diagrams/piano.ts:17`)
- [ ] Computer keyboard as note input
- [ ] Type a chord name in the detector and see it on every diagram (today only inside the song)
- [ ] MIDI channel filtering

### Visualization

- [ ] Grand staff, treble and bass clef (today treble only)
- [ ] Voice leading: how each voice moves from one chord to the next, on staff or piano
- [ ] Presentation mode for teaching and recording: large elements, no controls (today text is 10–13 px and the CoF is hard to read at a distance)
- [ ] Velocity display
- [ ] More instruments in diagrams: bass, ukulele, other tunings. First check what notae draws
- [ ] Colour themes: background and diagram colours (dots, frets, piano keys, CoF segments)
- [ ] Light mode
- [ ] Free colour picker for song sections (today a preset palette)
- [ ] Modular layout (panels placed and resized freely): undecided whether it is wanted

### Didactics

- [ ] Explanations: each term the app shows (V7/V, borrowed from dorian…) can explain what it means
- [ ] Key and scale explorer: pick a key or mode, see its diatonic chords, functions and usual borrowings, without playing
- [ ] Reference progressions and examples (ii-V-I, cadences, modal interchange), loadable, with explanation
- [ ] Ear training: the app plays a chord or cadence and the user identifies it
- [ ] Built-in help and a first-run guided tour

### Universal

- [ ] Interface in English and Spanish
- [ ] Mobile and touch
- [ ] Accessibility: full keyboard use and screen reader
- [ ] Non-Western and microtonal systems, modes and tunings, through UMT
- [ ] Works offline and installable: UMT, notae, abcjs, soundfont-player and the samples served with the app instead of from CDNs (also removes the `gleitz.github.io` risk)

### Transcription

- [ ] Audio player for the recording being transcribed: loop, slow down
