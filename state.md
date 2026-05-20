# Modus — State

## System

- **Location:** `C:\Users\mykl\OneDrive\Scriptorium\DOCS\CODING GIT\MODUS\`
- **Status:** Pre-implementation — scaffold pending
- **Dev command:** `node build.js` (watch) + `npx http-server . -p 8080`
- **Browser:** Chrome or Edge (Web MIDI API required)

---

## Project

**Modus** — real-time MIDI harmonic analysis tool and song structure builder.

A single-page TypeScript app used alongside MuseScore during song transcription. Connect a MIDI controller, play notes, see chord detection + full harmonic analysis in real time. Build and annotate song structures with Roman numeral degree display.

**Spec:** `../UNIVERSAL MUSIC LIBRARY - ok/docs/superpowers/specs/2026-05-20-harmony-companion-design.md`
**Plan:** `../UNIVERSAL MUSIC LIBRARY - ok/docs/superpowers/plans/2026-05-20-harmony-companion.md`

---

## Stack

| Layer | Technology |
|---|---|
| App | TypeScript → esbuild → `dist/app.js` |
| Theory | UMT via jsDelivr CDN |
| Diagrams | notae via jsDelivr CDN |
| Staff | abcjs via CDN |
| MIDI | Web MIDI API (Chrome/Edge only) |
| Guitar voicings | @tombatossals/chords-db via jsDelivr (JSON fetch) |
| Audio | WebAudioFont via CDN (GM piano) |
| Persistence | localStorage |

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

---

## History

### 2026-05-20 — Project initiated

Full brainstorming and spec session. Spec written (rev 5), implementation plan written (11 tasks). Project name chosen: **Modus**. Folder created. Ready for scaffold.

**Key decisions:**
- TypeScript + esbuild (same as UMT/notae)
- UMT and notae loaded via CDN (both published)
- `Harmony.analyzeProgression` provides roman/function/isBorrowed directly — no manual Roman numeral computation
- `FiguredBass.fromChord(chord, bassNote)` confirmed for figured bass generation
- `KeyDetection.detect(notes)` confirmed for Krumhansl-Schmuckler
- Guitar voicings: @tombatossals/chords-db via fetch (JSON)
- WebAudioFont via jsDelivr npm CDN (not GitHub Pages)
- Piano clickable keys via `data-note` attribute query post-innerHTML injection

---

## TODO

- [ ] Run Task 1: project scaffold (package.json, tsconfig, build.js, index.html, globals.d.ts)
- [ ] Run Tasks 2–10: core modules
- [ ] Run Task 11: fix spec gaps (12 items)
- [ ] Manual smoke test in Chrome
