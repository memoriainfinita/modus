---
created: 2026-05-20
last_updated: 2026-10-11
---

# Modus — state

What is true now. What already happened lives in `state-history.md`.

## Project

**Modus** — see and understand the harmony of what you play, in real time. Aimed at being a complete, professional, useful, universal and didactic app, for studying, transcribing songs, composing, teaching and making videos. No time or budget limits, no marketing or profit goals. GPL-3.0, part of the **memoriainfinita** ecosystem: UMT (developed for Modus, all theory) and notae (diagrams).

- **Spec:** `docs/spec.md` (purpose, design, behaviour) · **UMT contract:** `docs/umt-contract.md` · Executed plans and earlier spec revisions in `.archive/` (local, gitignored)
- **Stack and commands:** `README.md`. Not there: pnpm 11 needs `allowBuilds: esbuild: true` in `pnpm-workspace.yaml` (it blocks install scripts by default); TypeScript held on 5.x on purpose; UMT pinned to the tag `v0.6.0`, notae to `81b58de`, both served from `vendor/`

## Status

- Working: detector, analysis with voice leading, explanation, key panel (diatonic chords, negative harmony, parallel modes, Coltrane axis), history, song builder with several saved songs (each with its own key), audio, CoF, strings panel (any fretted instrument, shapes or neck), piano, velocity, grand staff, progressions, ear training, player, microphone and tuner, modular layout and presentation, view windows for OBS and export, MIDI out, input channel filter, offline and installable, keyboard and screen reader, touch, guided tour. The roadmap in TODO is open: the app is not complete
- Audio: controller notes follow velocity, note-off and sustain pedal; previews cut the previous one; master volume; the app starts without the soundfont-player script
- Tests 2026-10-12: TSC clean, 373 unit tests against the real UMT bundle, `pnpm test:e2e` 75/75 (installed Chrome + fake Web MIDI, Chrome-style and Firefox-style hot-plug), `pnpm test:e2e:midi` 12/12 (real Web MIDI through loopMIDI in Chrome and Firefox, MIDI out included: it needs a second input, such as the MPK, and is skipped without one). Firefox and a real controller checked by hand, including hot-plug with loopMIDI present. Key panel checked in headless Firefox
- UMT output reviewed 2026-10-10 (every call Modus makes, 24 keys × 24 chords): no throws, shapes as `docs/umt-contract.md`. Pin raised to `v0.4.0` on 2026-10-11, when the UMT audit ended (all tests passed unchanged), and to `v0.4.1` and `v0.5.0` (theory names in Spanish) the same day; to `v0.6.0` on 2026-10-12 (P/L/R on triads only, turnarounds as tonicizations, the blues style the Progressions panel passes). The theory criteria UMT applies (functions, harmonic minor, secondary leading-tone chords, substitutions) are in UMT's `state.md` Patterns
- Numerals follow the letter written (`analyzeProgression` with `spelling: 'written'`): Gb in C is ♭V, F# is ♯IV. CoF degrees come from the same call
- Scope 2026-10-10: Modus is the detector and its analysis. The song builder is frozen: it works and keeps its tests, no new features (see TODO)
- Publication: when the app is complete. Until then no remote; then public repo and Pages, like `2_finished`
- Interface languages: English and Spanish, with note names in letters or Do Re Mi (spec → Language). Docs, code and commits stay in English

## Patterns

- [language] Everything in English: code, comments, documentation (spec, README, state.md), commit messages. Confirmed 2026-05.
- [typescript] esbuild watch mode, same toolchain as UMT and notae. Confirmed 2026-05.
- [typescript] `pnpm build` does not typecheck (esbuild). Use `pnpm exec tsc --noEmit`. Confirmed 2026-05.
- [build] `dist/` is tracked in git, same as notae and UMT. Commit it in sync with `src/`. Confirmed 2026-05.
- [build] pnpm, not npm. Confirmed 2026-10.
- [deps] UMT pinned to a release tag (`v0.6.0`) in `package.json` and `scripts/vendor.mjs`, notae to a commit hash there; never `@main`/`@master`. The page loads them from `vendor/` (tracked): after a bump, `pnpm vendor`, then the tests. Bump deliberately, reading UMT's `CHANGELOG.md`. Confirmed 2026-10.
- [naming] Project name: Modus (Latin — mode, measure). Confirmed 2026-05.
- [theory] Music-theory fixes go into UMT or notae, then Modus bumps the pin. No workarounds in Modus for library output. Since 2026-10-10 only the session running the UMT audit (`umt/docs/auditoria-2026-10.md`) commits to UMT: Modus writes what it needs in `umt/docs/notas-desde-modus-2026-10.md` (both local, gitignored) and waits. Confirmed 2026-10.
- [ux] The look (redesign 2026-10-12): neutral black (#141414, panels #1d1d1d) and one accent, parchment #d9c9a3, for what is on, focus, terms and cadences; the indigo and the blue-tinted ground are gone. One colour code for harmony, the function (`--fn-t/s/d`, `functionColor` in `theory/chord.ts`): chord header, piano keys, circle, key-panel chips, history and view windows; quality is read in the name, a chord without a function is drawn in `--chord-none`. The light, contrast and paper themes follow the same tokens. Confirmed 2026-10.
- [ux] Quiet controls: a panel's options go in the ⋯ menu of its header (`panelMenu` in `ui/layout.ts`), not on view; panels have no border, 10 px apart; the toolbar is four groups (input, key, sound, page) with line icons (`ui/icons.ts`), the page group anchored right. The chord is a header across the page in Standard; Velocity is left to the layout menu. Type: chord 64, numeral 30, panel title 15, values 13–14 (Analysis 13, key panel 12 by default, so each shows all it showed before the redesign), labels 12. Checked 2026-10-12 against the version before, per layout: no panel hides more than it did. Confirmed 2026-10.
- [ux] Destructive actions run at once and offer Undo (`ui/undo.ts`), never a confirmation. Confirmed 2026-10.
- [ux] Play on single click. A double click is detected by hand (same target within 400 ms) wherever the element is rebuilt on click: a rebuilt node never gets the browser's dblclick. Confirmed 2026-10.
- [audio] Stay on soundfont-player 0.12.0 + FluidR3_GM: archived upstream but pinned and working. smplr (same author) loads its GM soundfonts from the same `gleitz.github.io`, so swapping does not remove the sample-host risk. A reason to move would be smplr's sampled instruments (Steinway with velocity layers, electric pianos) or reverb, not maintenance. Confirmed 2026-10.
- [spelling] Display spelling goes through `theory/spelling.ts` over UMT's `spellPitchInKey` / `spellChord` / `spellChordInKey`: MIDI detections are written in the analysis key and rewritten on a key change; a chord picked from history, song or CoF keeps its symbol and its notes are named by interval; history chips render in the current key. Note names may carry any accidentals (`notes.ts`: F##4, B#3 = MIDI 60). Confirmed 2026-10.
- [testing] `pnpm test:e2e` after each behaviour change: `tests/e2e/smoke.mjs` serves the repo, opens the installed Chrome (`channel: 'chrome'`) with a fake `navigator.requestMIDIAccess`, and plays notes through `window.__midi`. Each check releases all notes when it ends. `window.__plug(id, name|null)` hot-plugs; `__hotplug(false)` switches to Firefox behaviour. Confirmed 2026-10.
- [testing] `pnpm test:e2e:midi` (`tests/e2e/real-midi.mjs`) for the real Web MIDI path: Node writes to "loopMIDI Port" with `jzz`; Chrome gets `grantPermissions(['midi'])`; Playwright's Firefox gets a fresh profile whose `permissions.sqlite` holds the `midi` rows the site-permission add-on would write (no pref skips the add-on; Playwright knows no `midi` permission for Firefox). Needs loopMIDI running. Browsers launch muted (`--mute-audio`, `media.volume_scale` 0). Hot-plug stays in the fake: loopMIDI's GUI cannot unplug a port. Confirmed 2026-10.
- [testing] Every e2e browser context pins English (`locale: 'en-US'`, Firefox `intl.accept_languages`): Modus follows the browser's language, and Chrome without a locale takes the system's, Spanish on this machine. The Spanish checks switch from the ? panel. Confirmed 2026-10.
- [view] View windows are the same page with `?view=`: `app.ts` runs `runViewerFromUrl()` instead of `init()`, so a view never opens MIDI or audio. They get the detector state over the `modus-view` BroadcastChannel (`view/channel.ts`); anything a view should follow must go through `publishView()` in `app.ts`. Confirmed 2026-10.
- [midi] Firefox reports no hot-plug (no statechange, `inputs` frozen) but a new `requestMIDIAccess` returns the current ports: `input/midi.ts` rescans every 2 s while visible and on focus. The device the user picked (or the first used) is preferred, found by name (Chrome ids are positional, `input-0`; Firefox ids are stable hashes): a fallback never replaces it. Confirmed 2026-10.

## Preferences

- `pnpm dev` only when a task needs continuous rebuilds, not at session start; otherwise `pnpm build`. When launched: in background (`run_in_background: true`, `timeout: 7200000` — the default background limit kills it after 30 min), never with `!` in chat (it blocks). `--watch=forever` outlives TaskStop and the session: at the end, kill the `cmd.exe` tree whose command line has `watch=forever` (`taskkill /PID <pid> /T /F`).

## TODO

### Analysis, in order (2026-10-10)

1. [x] Voicing analysis, 2026-10-11: Voicing field from UMT `analyzeVoicing`; chords detected with `detectChordsScored`, so shells are named
2. [x] Scales that fit, 2026-10-11: Fits field from `findScalesForNotes`, on the notes on screen or the melody played note by note. With the microphone (later) it will also hear sung or played lines
3. [~] What UMT computes and Modus did not, 2026-10-11: upper structures sounding over a dominant, neo-Riemannian P/L/R from the previous triad, set class (Forte, prime form, interval vector). Open: slash-chord reading (a triad over a foreign bass, D/C as C13#11 or as a polychord)
4. [~] Key and scale explorer. Done 2026-10-10: Key panel on the analysis key, with diatonic chords, functions, negative harmony, parallel-mode chords and the Coltrane axis (moved out of the per-chord panel). 2026-10-11: parallel modes in triads too, characteristic chords in bold; in minor, harmonic minor's V(7) and vii°(7) under v and VII. Open: a mode as the home key (D dorian), which the key selector does not offer; a choice of the usual borrowings instead of every parallel mode
5. [ ] Next-chord suggestions, as didactics: what usually follows and why (function, cadences, UMT's named progressions)
6. [~] Progression analysis over the history. Done: cadence tags between chips (2026-10-10); modulations marked where the key changes, with numerals and cadences after it in the new key (2026-10-11). Open: harmonic rhythm, which needs the time each chord lasts (the history has no timing)
7. [x] Views for OBS and export, 2026-10-10. View windows (popups synced by BroadcastChannel) on a chroma background for Window Capture: not a Browser Source, which is another browser and cannot reach the playing tab. SVG / PNG export of staff, circle, guitar, piano. Checked headless in Chrome and Firefox; not yet in OBS itself
8. [x] MIDI output, 2026-10-10: Out port and channel in the toolbar; previews and virtual inputs always, controller only with Thru; loop guard; notes released on any change. Not yet tried with a DAW or hardware synth

### Rest of the app, in order (2026-10-11)

Ordered by what each one makes cheaper or depends on: strings, colours and the modular layout before more UI is written, didactic text after the interface speaks Spanish, help last because it describes the finished UI.

1. [x] Interface in English and Spanish, 2026-10-11: one string table per language (`src/i18n`), the browser's language or the one picked in Settings; note names in letters or fixed-do solfège from UMT, chords typed in either; scale, cadence and substitution names from UMT v0.5.0. Every later item writes its text in both tables. Movable do: in the explanations since 2026-10-12 (Settings › Theory)
2. [x] Colours as theme tokens, 2026-10-11: every colour a token in `styles.css`, one block per theme, the SVG diagrams read them through `ui/theme.ts`; dark, light, high contrast, paper, or as the system, in the ? panel, in place. View windows stay dark
3. [x] Modular layout, 2026-10-11: eleven panels on a 12-column grid (`layout/grid.ts`), moved and resized by snapping, never overlapping; presets Standard, Study, Class, Transcription, Recording and saved layouts in the ▦ menu; on a phone one column. Diagrams scale to their panel (their −/+ sizes went). Presentation (P) is the current layout without controls, filling the window. New panels are born as modules: an id in `layout/presets.ts` and a body in `ui/layout.ts`
4. [x] Voice leading, 2026-10-11: Voices field (each voice bass first, outer motion, total, held notes; `detector/voice-leading.ts`) and Rules field (UMT `checkVoiceLeading` strict, only with as many voices in both chords; false relations left out). ⇠ on staff and piano shows the previous chord, faded. Read from the previous chord's notes: played, or a history or song chord captured from MIDI
5. [x] One string-instrument panel, 2026-10-11: Strings replaces Guitar and Fretboard. Guitar, 7-string, bass, 5-string bass, ukulele (reentrant), baritone ukulele, mandolin, banjo, with their usual tunings and a custom one (`theory/instruments.ts`); views Shapes (playable voicings from UMT, which handles any string count) and Neck. notae draws any number of strings as it was
6. [x] Explanations, 2026-10-11: Explanation panel (`detector/explain.ts`) with each term of the analysis said of the chord on screen (degree, numerals, function, secondary with its target, borrowed mode and foreign notes, tritone sub, chromatic, figured bass, position, cadence, P/L/R, substitution types, upper structures, voice-leading rules; intervals); history cadence tags explain in their tooltip. In Standard and Study
7. [x] Reference progressions, 2026-10-11: Progressions panel with UMT's 16 named progressions in the analysis key (its mode), bar by bar with numerals, cadences and modulations, a sentence each in both languages; click a chord or ▶ the whole. Cadences and modal interchange are explained per chord in the Explanation panel; examples of them as progressions of their own wait on UMT having them named
8. [x] Ear training, 2026-10-11: panel with intervals, chord qualities (10) and cadences (authentic, plagal, deceptive, half in a random major key), a score per kind, the answer shown in the detector. Later: answering by playing it, scale degrees, more cadences and minor keys
9. [x] Audio player, 2026-10-11: Player panel with a local file (open or drop), waveform with click to seek, A–B loop, speed 50–125 % keeping the pitch, back 5 s; on top of the Transcription layout. The file is not kept across reloads. Later: pitch shift (a recording a semitone off), markers, the chord heard at the playhead (with the microphone item's audio analysis)
10. [~] Microphone input, 2026-10-11. Done: notes by YIN held in the detector (feeds Fits, history, analysis), never sounded; Tuner panel (note, cents, Hz); chords from a chromagram, experimental. Checked with Chrome's fake capture (a WAV of A3) and Firefox's fake stream (1 kHz → B5 +22 ¢); not yet with a real voice or guitar. Open: chords from audio that hold up on a real guitar (a better model than a chromagram threshold), the chord heard at the Player's playhead
11. [x] Offline and installable, 2026-10-11: libraries and the piano samples in `vendor/` (`pnpm vendor`), service worker (network first for the app, cache first for samples), manifest and icons. Checked offline in Chrome (e2e) and Firefox. The other 127 instruments still come from `gleitz.github.io` on first use; shipping them all is ~250 MB
12. [x] Accessibility, 2026-10-11: Tab and Enter / Space everywhere (circle segments, history and song chips), panels moved and resized with the arrows, live region for the chord (long name, degree, function), landmarks, named icon buttons and diagrams, help as a dialog, focus outlines. Checked with the keyboard in Chrome (e2e) and Firefox; not yet with a screen reader (NVDA)
13. [x] Mobile and touch, 2026-10-11: multi-finger piano (a key per pointer), two-octave piano on a phone widened to the notes, long press removes a history chip, tap shows a song chord's buttons, text panels grow to their content in one column, no double-tap zoom, larger targets with a coarse pointer. Checked with Chrome's mobile emulation (e2e, synthetic touch pointers) and Firefox at phone width; not yet on a real phone or tablet
14. [x] Help and guided tour, 2026-10-11: the ? panel describes every panel and starts the tour; a ten-step tour on the first visit (spotlight and card, arrows, Esc, remembered), in both languages
15. [x] Presentation mode, 2026-10-11: any layout without controls, filling the screen (⛶ / P), so history and key panel too; the Class preset is made for it. Not yet tried on a projector

16. [x] Settings, 2026-10-12: ⚙ dialog (design A of the canvas `Modus · Ajustes`, claude.ai artifact 3FNjKBDN) with ten sections, search, reset per section; every fixed timing and option exposed through `settings/prefs.ts`; shortcuts customizable (two keys, conflicts asked); export / import / reset with Undo. MIDI channels, out and Thru moved from the toolbar; language, note names and theme from the help panel, which keeps only help

17. [x] Interface redesign (2026-10-12), design A ("Refinado") with the system of C, canvas `Modus · Diseño` (claude.ai artifact CG3J79w1). Open: whether B ("Escenario") becomes the Class layout; the user judges the icon within the new design

### Unblocked by UMT v0.4.0, to place in the order

The UMT audit ended 2026-10-11 (`umt/docs/auditoria-2026-10.md`).

- Metronome, didactic: any meter including additive ones (7/8 as 2+2+3) with accents per group, subdivisions and tuplets, polyrhythms (3:2, 4:3, 5:4), clave and Euclidean patterns, tap tempo, tempo trainer (+N BPM every N bars), and the cycles UMT now has (talas, flamenco compás, aksak: `RHYTHMIC_CYCLES`, `cycleStrokes`, `cycleCounts`). Shown as a circular necklace (beats as dots, groups as arcs, current beat lit; a polyrhythm as concentric rings). Clicks synthesized with Web Audio, not the soundfont. Clave patterns corrected in the audit
- Movable-do solfege for didactics, from UMT `Solfege.movableDo` (minor la-based, modes from their major's do, since the audit). Fixed do is in since item 1

### Waiting on UMT

- Scales and modes on the fretboard and piano, with positions, from UMT `getFretboardScale` / `getFretboardScalePositions`: positions are per-fret windows, not CAGED or 3-notes-per-string. Belongs with the key explorer. Not yet requested
- Non-Western and microtonal systems, modes and tunings: UMT has them (ragas, maqamat, EDOs, Scala); what Modus would show is not designed yet

### Song builder, frozen

Works and keeps its tests; no new features. Later: a separate app on UMT and notae, or kept as is. Parked until then: export / import to a file, share by URL, MIDI file import / export, MusicXML and chord-sheet PDF, playback at a tempo with time signature, chord durations within the measure, lyrics and notes per measure, undo / redo of edits, free colour for sections, metronome and recording takes into bars. Whole-song analysis moved to the analysis item on the history.
