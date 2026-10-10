---
created: 2026-05-20
last_updated: 2026-10-10
---

# Modus — state

What is true now. What already happened lives in `state-history.md`.

## Project

**Modus** — see and understand the harmony of what you play, in real time. Aimed at being a complete, professional, useful, universal and didactic app, for studying, transcribing songs, composing, teaching and making videos. No time or budget limits, no marketing or profit goals. GPL-3.0, part of the **memoriainfinita** ecosystem: UMT (developed for Modus, all theory) and notae (diagrams).

- **Spec:** `docs/spec.md` (purpose, design, behaviour) · **UMT contract:** `docs/umt-contract.md` · Executed plans and earlier spec revisions in `.archive/` (local, gitignored)
- **Stack and commands:** `README.md`. Not there: pnpm 11 needs `allowBuilds: esbuild: true` in `pnpm-workspace.yaml` (it blocks install scripts by default); TypeScript held on 5.x on purpose; UMT pinned to `801e5ec`, notae to `81b58de`

## Status

- Working: detector, analysis, history, song builder with several saved songs (each with its own key), audio, CoF, guitar voicings, piano/fretboard. The roadmap in TODO is open: the app is not complete
- Audio: controller notes follow velocity, note-off and sustain pedal; previews cut the previous one; master volume; the app starts without the soundfont-player script
- Tests 2026-10-10: TSC clean, 225 unit tests against the real UMT bundle, `pnpm test:e2e` 38/38 (installed Chrome + fake Web MIDI, Chrome-style and Firefox-style hot-plug), `pnpm test:e2e:midi` 10/10 (real Web MIDI through loopMIDI in Chrome and Firefox). Firefox and a real controller checked by hand, including hot-plug with loopMIDI present
- UMT output reviewed 2026-10-10 (every call Modus makes, 24 keys × 24 chords): no throws, shapes as `docs/umt-contract.md`. The theory criteria UMT applies (functions, harmonic minor, secondary leading-tone chords, substitutions) are in UMT's `state.md` Patterns
- Scope 2026-10-10: Modus is the detector and its analysis. The song builder is frozen: it works and keeps its tests, no new features (see TODO)
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
- [theory] Music-theory fixes go into UMT or notae, then Modus bumps the pin. No workarounds in Modus for library output. Since 2026-10-10 only the session running the UMT audit (`umt/docs/auditoria-2026-10.md`) commits to UMT: Modus writes what it needs in `umt/docs/notas-desde-modus-2026-10.md` (both local, gitignored) and waits. Confirmed 2026-10.
- [ux] Destructive actions run at once and offer Undo (`ui/undo.ts`), never a confirmation. Confirmed 2026-10.
- [ux] Play on single click. A double click is detected by hand (same target within 400 ms) wherever the element is rebuilt on click: a rebuilt node never gets the browser's dblclick. Confirmed 2026-10.
- [audio] Stay on soundfont-player 0.12.0 + FluidR3_GM: archived upstream but pinned and working. smplr (same author) loads its GM soundfonts from the same `gleitz.github.io`, so swapping does not remove the sample-host risk. A reason to move would be smplr's sampled instruments (Steinway with velocity layers, electric pianos) or reverb, not maintenance. Confirmed 2026-10.
- [spelling] Display spelling goes through `theory/spelling.ts` over UMT's `spellPitchInKey` / `spellChord` / `spellChordInKey`: MIDI detections are written in the analysis key and rewritten on a key change; a chord picked from history, song or CoF keeps its symbol and its notes are named by interval; history chips render in the current key. Note names may carry any accidentals (`notes.ts`: F##4, B#3 = MIDI 60). Confirmed 2026-10.
- [testing] `pnpm test:e2e` after each behaviour change: `tests/e2e/smoke.mjs` serves the repo, opens the installed Chrome (`channel: 'chrome'`) with a fake `navigator.requestMIDIAccess`, and plays notes through `window.__midi`. Each check releases all notes when it ends. `window.__plug(id, name|null)` hot-plugs; `__hotplug(false)` switches to Firefox behaviour. Confirmed 2026-10.
- [testing] `pnpm test:e2e:midi` (`tests/e2e/real-midi.mjs`) for the real Web MIDI path: Node writes to "loopMIDI Port" with `jzz`; Chrome gets `grantPermissions(['midi'])`; Playwright's Firefox gets a fresh profile whose `permissions.sqlite` holds the `midi` rows the site-permission add-on would write (no pref skips the add-on; Playwright knows no `midi` permission for Firefox). Needs loopMIDI running. Browsers launch muted (`--mute-audio`, `media.volume_scale` 0). Hot-plug stays in the fake: loopMIDI's GUI cannot unplug a port. Confirmed 2026-10.
- [midi] Firefox reports no hot-plug (no statechange, `inputs` frozen) but a new `requestMIDIAccess` returns the current ports: `input/midi.ts` rescans every 2 s while visible and on focus. The device the user picked (or the first used) is preferred, found by name (Chrome ids are positional, `input-0`; Firefox ids are stable hashes): a fallback never replaces it. Confirmed 2026-10.

## Preferences

- `pnpm dev` only when a task needs continuous rebuilds, not at session start; otherwise `pnpm build`. When launched: in background (`run_in_background: true`, `timeout: 7200000` — the default background limit kills it after 30 min), never with `!` in chat (it blocks). `--watch=forever` outlives TaskStop and the session: at the end, kill the `cmd.exe` tree whose command line has `watch=forever` (`taskkill /PID <pid> /T /F`).

## TODO

### Analysis, in order (2026-10-10)

Items 1-3 need new UMT functions or UMT fixes: requested in `umt/docs/notas-desde-modus-2026-10.md`.

1. [ ] Voicing analysis: inversion, close / open position, drop 2 / drop 3, doubled and omitted notes
2. [ ] Scales and modes that fit a melody or a set of single notes
3. [ ] Show what UMT computes and Modus does not: upper structures and slash-chord reading (`upper-structures`), neo-Riemannian P/L/R between consecutive chords, Forte number and interval vector
4. [ ] Key and scale explorer: pick a key or mode, see its diatonic chords, functions and usual borrowings, without playing. The Coltrane axis and negative harmony move here from the per-chord panel (the axis depends only on the key)
5. [ ] Next-chord suggestions, as didactics: what usually follows and why (function, cadences, UMT's named progressions)
6. [ ] Progression analysis over the history: modulations, harmonic rhythm, cadences (`analyzeProgression` returns them, unused today)
7. [ ] OBS view (a URL showing only the chord, staff or circle on a transparent or chroma background, for a browser source) and export of diagrams as SVG / PNG
8. [ ] MIDI output: send what sounds to an external synth or DAW

### Added 2026-10-10, not yet ordered

- [ ] Metronome, didactic: any meter including additive ones (7/8 as 2+2+3) with accents per group, subdivisions and tuplets, polyrhythms (3:2, 4:3, 5:4), clave and Euclidean patterns, tap tempo, tempo trainer (+N BPM every N bars). Shown as a circular necklace (beats as dots, groups as arcs, current beat lit; a polyrhythm as concentric rings). Clicks synthesized with Web Audio, not the soundfont. Theory from UMT `rhythm.ts` and `clave-patterns.ts`, which the audit found wrong in places (claves, metric modulation): waits on UMT
- [ ] Microphone input: first monophonic (tuner, the note sung or played; feeds the scales-from-notes item), then chords from audio. Without it, guitarists, singers and wind players are left out
- [ ] Note names as Do-Re-Mi (with the Spanish interface) and movable-do solfege for didactics, from UMT `solfege.ts` (movable do is major-only today: waits on UMT)
- [ ] Scales and modes shown on the fretboard and piano, with positions, from UMT `getFretboardScale` / `getFretboardScalePositions` (positions are per-fret windows, not CAGED, per the audit: waits on UMT). Belongs with the key explorer

### Analysis, not yet ordered (agreed 2026-10-09)

Input
- [ ] Clicking the on-screen piano feeds the detector (today it only sounds the note, `diagrams/piano.ts:17`)
- [ ] Computer keyboard as note input
- [ ] Type a chord name in the detector and see it on every diagram
- [ ] MIDI channel filtering

Visualization
- [ ] Grand staff, treble and bass clef (today treble only)
- [ ] Voice leading: how each voice moves from one chord to the next, on staff or piano
- [ ] Presentation mode for teaching and recording: large elements, no controls (today text is 10-13 px and the CoF is hard to read at a distance)
- [ ] Velocity display
- [ ] More instruments: bass, ukulele, other tunings, as one string-instrument panel with two views (chord positions, whole neck) instead of today's separate Guitar and Fretboard panels. First check what notae draws
- [ ] CoF b/# buttons only on Auto: with a key set, spelling comes from the key
- [ ] Colour themes: background and diagram colours (dots, frets, piano keys, CoF segments)
- [ ] Light mode
- [ ] Modular layout (panels placed and resized freely): undecided whether it is wanted. Today's Notation / Instruments grouping is arbitrary (the CoF is not notation)

Didactics
- [ ] Explanations: each term the app shows (V7/V, borrowed from dorian...) can explain what it means
- [ ] Reference progressions and examples (ii-V-I, cadences, modal interchange), loadable, with explanation
- [ ] Ear training: the app plays a chord or cadence and the user identifies it
- [ ] Built-in help and a first-run guided tour

Universal
- [ ] Interface in English and Spanish
- [ ] Mobile and touch
- [ ] Accessibility: full keyboard use and screen reader
- [ ] Non-Western and microtonal systems, modes and tunings, through UMT
- [ ] Works offline and installable: UMT, notae, abcjs, soundfont-player and the samples served with the app instead of from CDNs (also removes the `gleitz.github.io` risk)

Transcription
- [ ] Audio player for the recording being transcribed: loop, slow down

### Song builder, frozen

Works and keeps its tests; no new features. Later: a separate app on UMT and notae, or kept as is. Parked until then: export / import to a file, share by URL, MIDI file import / export, MusicXML and chord-sheet PDF, playback at a tempo with time signature, chord durations within the measure, lyrics and notes per measure, undo / redo of edits, free colour for sections, metronome and recording takes into bars. Whole-song analysis moved to the analysis item on the history.
