---
created: 2026-05-20
last_updated: 2026-10-11
---

# Modus — state

What is true now. What already happened lives in `state-history.md`.

## Project

**Modus** — see and understand the harmony of what you play, in real time. Aimed at being a complete, professional, useful, universal and didactic app, for studying, transcribing songs, composing, teaching and making videos. No time or budget limits, no marketing or profit goals. GPL-3.0, part of the **memoriainfinita** ecosystem: UMT (developed for Modus, all theory) and notae (diagrams).

- **Spec:** `docs/spec.md` (purpose, design, behaviour) · **UMT contract:** `docs/umt-contract.md` · Executed plans and earlier spec revisions in `.archive/` (local, gitignored)
- **Stack and commands:** `README.md`. Not there: pnpm 11 needs `allowBuilds: esbuild: true` in `pnpm-workspace.yaml` (it blocks install scripts by default); TypeScript held on 5.x on purpose; UMT pinned to `ac10838`, notae to `81b58de`

## Status

- Working: detector, analysis, key panel (diatonic chords, negative harmony, parallel modes, Coltrane axis), history, song builder with several saved songs (each with its own key), audio, CoF, guitar voicings, piano/fretboard, velocity, grand staff, presentation mode, view windows for OBS and export, MIDI out, input channel filter. The roadmap in TODO is open: the app is not complete
- Audio: controller notes follow velocity, note-off and sustain pedal; previews cut the previous one; master volume; the app starts without the soundfont-player script
- Tests 2026-10-11: TSC clean, 263 unit tests against the real UMT bundle, `pnpm test:e2e` 52/52 (installed Chrome + fake Web MIDI, Chrome-style and Firefox-style hot-plug), `pnpm test:e2e:midi` 12/12 (real Web MIDI through loopMIDI in Chrome and Firefox, MIDI out included: it needs a second input, such as the MPK, and is skipped without one). Firefox and a real controller checked by hand, including hot-plug with loopMIDI present. Key panel checked in headless Firefox
- UMT output reviewed 2026-10-10 (every call Modus makes, 24 keys × 24 chords): no throws, shapes as `docs/umt-contract.md`. Pin raised to `ac10838` (audit phase 1: letters in notes and numerals) the same day: all tests pass unchanged. The theory criteria UMT applies (functions, harmonic minor, secondary leading-tone chords, substitutions) are in UMT's `state.md` Patterns
- CoF degrees come from UMT since 2026-10-10 (they had their own semitone table). UMT reads a chromatic chord by the letter `spellChordInKey` picks, not the one written: Gb in C shows ♯IV (reported in the UMT notes)
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
- [view] View windows are the same page with `?view=`: `app.ts` runs `runViewerFromUrl()` instead of `init()`, so a view never opens MIDI or audio. They get the detector state over the `modus-view` BroadcastChannel (`view/channel.ts`); anything a view should follow must go through `publishView()` in `app.ts`. Confirmed 2026-10.
- [midi] Firefox reports no hot-plug (no statechange, `inputs` frozen) but a new `requestMIDIAccess` returns the current ports: `input/midi.ts` rescans every 2 s while visible and on focus. The device the user picked (or the first used) is preferred, found by name (Chrome ids are positional, `input-0`; Firefox ids are stable hashes): a fallback never replaces it. Confirmed 2026-10.

## Preferences

- `pnpm dev` only when a task needs continuous rebuilds, not at session start; otherwise `pnpm build`. When launched: in background (`run_in_background: true`, `timeout: 7200000` — the default background limit kills it after 30 min), never with `!` in chat (it blocks). `--watch=forever` outlives TaskStop and the session: at the end, kill the `cmd.exe` tree whose command line has `watch=forever` (`taskkill /PID <pid> /T /F`).

## TODO

### Analysis, in order (2026-10-10)

Items 1-3 need new UMT functions or UMT fixes: requested in `umt/docs/notas-desde-modus-2026-10.md`.

1. [ ] Voicing analysis: inversion, close / open position, drop 2 / drop 3, doubled and omitted notes
2. [ ] Scales and modes that fit a melody or a set of single notes
3. [ ] Show what UMT computes and Modus does not: upper structures and slash-chord reading (`upper-structures`), neo-Riemannian P/L/R between consecutive chords, Forte number and interval vector
4. [~] Key and scale explorer. Done 2026-10-10: Key panel on the analysis key, with diatonic chords, functions, negative harmony, parallel-mode chords and the Coltrane axis (moved out of the per-chord panel). Open: a mode as the home key (D dorian), which the key selector does not offer; triads in the parallel modes (waits on UMT, requested); a choice of the usual borrowings instead of every parallel mode
5. [ ] Next-chord suggestions, as didactics: what usually follows and why (function, cadences, UMT's named progressions)
6. [~] Progression analysis over the history. Done 2026-10-10: cadence tags between chips. Waiting on UMT (requested): modulations (`detectModulations` picks the first key in chromatic order that fits a 3-chord window: C Am D7 in C reads E minor, not G major; minor keys are natural minor only) and harmonic rhythm (counts chord changes; the history never repeats a chord, so it is always 1, and it has no timing). Also open: romans and cadences after a modulation in the new key
7. [x] Views for OBS and export, 2026-10-10. View windows (popups synced by BroadcastChannel) on a chroma background for Window Capture: not a Browser Source, which is another browser and cannot reach the playing tab. SVG / PNG export of staff, circle, guitar, piano. Checked headless in Chrome and Firefox; not yet in OBS itself
8. [x] MIDI output, 2026-10-10: Out port and channel in the toolbar; previews and virtual inputs always, controller only with Thru; loop guard; notes released on any change. Not yet tried with a DAW or hardware synth

### Rest of the app, in order (2026-10-11)

Ordered by what each one makes cheaper or depends on: strings and colours before more UI is written, didactic text after the interface speaks Spanish, help last because it describes the finished UI.

1. [ ] Interface in English and Spanish: one string table, the language picked or taken from the browser. Every later item writes its text once per language. Fixed-do note names (Do, Re, Mi) with it, if UMT `solfege.ts` names them; movable do waits on UMT (minor)
2. [ ] Colours as theme tokens, then light mode and colour themes (background, dots, frets, piano keys, CoF segments). Today colours are written in CSS and in each diagram's code
3. [ ] Voice leading: how each voice moves from one played chord to the next, on staff and piano (voices paired bass to top). Warnings (parallels, leading tone) from UMT `checkVoiceLeading` wait on UMT: the audit found it fixed to 12-TET steps and checking overlap between any voices
4. [ ] One string-instrument panel: guitar, bass, ukulele, other tunings, with two views (chord positions, whole neck) instead of today's Guitar and Fretboard. First check what notae draws
5. [ ] Explanations: each term the app shows (V7/V, borrowed from dorian, a cadence) explains what it means
6. [ ] Reference progressions and examples (ii-V-I, cadences, modal interchange), loadable, with explanation, from UMT's named progressions
7. [ ] Ear training: the app plays a chord or cadence and the user names it
8. [ ] Audio player for the recording being transcribed: loop, slow down
9. [ ] Microphone input: first monophonic (tuner, the note sung or played; feeds scales-from-notes), then chords from audio. Without it, guitarists, singers and wind players are left out
10. [ ] Works offline and installable: UMT, notae, abcjs, soundfont-player and the samples served with the app instead of from CDNs (also removes the `gleitz.github.io` risk). Before publication
11. [ ] Accessibility: full keyboard use and screen reader
12. [ ] Mobile and touch
13. [ ] Built-in help and a first-run guided tour
14. [ ] Presentation mode, rest: history with its cadences, the key panel. Done 2026-10-11: chord, staff, CoF, guitar, piano large and full screen (⛶ / P), the ones the page shows; not yet tried on a projector

Undecided, before 11 and 12: modular layout (panels placed and resized freely). Today's Notation / Instruments grouping is arbitrary (the CoF is not notation).

### Waiting on UMT

- Metronome, didactic: any meter including additive ones (7/8 as 2+2+3) with accents per group, subdivisions and tuplets, polyrhythms (3:2, 4:3, 5:4), clave and Euclidean patterns, tap tempo, tempo trainer (+N BPM every N bars). Shown as a circular necklace (beats as dots, groups as arcs, current beat lit; a polyrhythm as concentric rings). Clicks synthesized with Web Audio, not the soundfont. From UMT `rhythm.ts` and `clave-patterns.ts`, which the audit found wrong in places (claves, metric modulation)
- Movable-do solfege for didactics, from UMT `solfege.ts` (major only today)
- Scales and modes on the fretboard and piano, with positions, from UMT `getFretboardScale` / `getFretboardScalePositions` (per-fret windows, not CAGED, per the audit). Belongs with the key explorer
- Non-Western and microtonal systems, modes and tunings

### Song builder, frozen

Works and keeps its tests; no new features. Later: a separate app on UMT and notae, or kept as is. Parked until then: export / import to a file, share by URL, MIDI file import / export, MusicXML and chord-sheet PDF, playback at a tempo with time signature, chord durations within the measure, lyrics and notes per measure, undo / redo of edits, free colour for sections, metronome and recording takes into bars. Whole-song analysis moved to the analysis item on the history.
