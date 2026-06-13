# Modus

[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

Real-time MIDI harmonic analysis for musicians. Connect a controller, play notes, get instant chord detection and full harmonic analysis — Roman numerals, harmonic function, figured bass, scales, substitutions, Coltrane axis, negative harmony, and more.

A chord history and song structure builder extend that — log what you play, build chord sequences, document song structure.

No server. No account. No installation. Open in Chrome or Edge and play.

---

## Who it's for

Students, scholars, composers, teachers, music theory educators — anyone who wants to understand or demonstrate harmony.

---

## What it does

### Detector — real-time harmonic analysis

Connect a MIDI controller and play. The app detects what you're playing:

- **1 note:** note name, octave, MIDI number
- **2 notes:** interval name, semitone count
- **3+ notes:** full chord detection with ranked alternatives

For each detected chord:

| Field | Detail |
|---|---|
| Chord name | Top candidate + alternatives (clickable, keys 1–9) |
| Roman numeral | Scale degree in the active key — `I△7`, `ii7`, `V7/ii`, `bVII` |
| Harmonic function | Tonic / Subdominant / Dominant |
| Figured bass | e.g. `6/4`, `7` |
| Borrowed chord | Modal interchange — source mode shown |
| Suggested scales | Ordered by fit |
| Substitutions | Tritone sub, diatonic, sus4 |
| Cadence | vs. last chord in history |
| Coltrane axis | Three major-third substitution chords |
| Negative harmony | Mirror chord in the active key |
| Key detection | Krumhansl-Schmuckler running on history note pool |

Each field can be toggled individually. Font scale adjustable with +/−.

**Input modes:** Normal, Hold (chord stays after release — useful for arpeggios), Arpeggio (accumulates notes within a 1.2s window).

### Notation panel

Four columns, each togglable independently ([St][An][CoF][Git]):

- **Staff** (abcjs) — chord summary (name, notes, alternatives) always shown above; key signature follows the active key
- **Analysis** — all harmonic analysis fields, each field individually togglable; font scale +/−
- **Circle of Fifths** — click major segments to set key + play chord; minor/dim segments play without changing key. Three rings: major, minor, diminished. Controls: enharmonic (b/♯), ring visibility, degree labels, 7th labels, size
- **Guitar voicing** (notae) — Standard / Drop D / Open G / Custom tuning, next/prev voicing

### Instruments panel

- **Piano** (notae) — 4 octaves C2–B5, click any key to play
- **Horizontal fretboard** (notae) — all note positions across 12 frets, spacing adjustable

### Audio

Any note played on the MIDI controller sounds through the selected soundfont. Click piano keys, CoF segments, or history/song chips to play. 128 GM instruments selectable (grouped by family). Volume slider. Loading progress bar.

### History

Every chord is logged automatically after 0.8s of stability. Each chip shows chord name and Roman numeral (updates live when the key changes). Click to reload in the detector, double-click to play, drag onto a song measure to insert, right-click to remove.

### Song

A scratchpad and structure builder.

- Sections (Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro) with colour coding and repeat counts
- Unlimited chords per measure, unlimited measures per section
- Each chord shows its Roman numeral — borrowed chords highlighted in amber
- Drag to reorder sections and chords; drag history chips directly onto measures
- MIDI fill: arm any chord slot (⊙) and play to fill it from the controller
- Transpose entire song in semitone steps
- Paste a progression as text (`Cmaj7 Am7 F G`)
- Export as printable chord chart

---

## Ecosystem

Modus is part of the **[memoriainfinita](https://github.com/memoriainfinita)** open source ecosystem:

- **[UMT](https://github.com/memoriainfinita/UMT)** — Universal Music Theory library. Powers all harmonic analysis in Modus.
- **[notae](https://github.com/memoriainfinita/notae)** — SVG diagram renderer for instruments. Renders piano, guitar, and fretboard diagrams.
- **Modus** — the first integration app. Uses UMT + notae as CDN dependencies.

All three projects are independent, GPL-3.0, and built for the music community — not for profit.

---

## Stack

| Layer | Technology |
|---|---|
| App | TypeScript → esbuild → `dist/app.js` |
| Theory | [UMT](https://github.com/memoriainfinita/UMT) via jsDelivr CDN |
| Diagrams | [notae](https://github.com/memoriainfinita/notae) via jsDelivr CDN |
| Staff | abcjs 6.4.0 via CDN |
| MIDI | Web MIDI API (Chrome/Edge only) |
| Audio | soundfont-player 0.12.0 + FluidR3_GM |
| Styles | Plain CSS (`styles.css`) |
| Persistence | localStorage |

---

## Requirements

- Chrome or Edge (Web MIDI API required)
- A MIDI controller (optional — song builder and CoF interaction work without one)
- A local server: `npx http-server . -p 8080` (`file://` + Web MIDI may be blocked by some Chromium versions)

---

## Running

```bash
# Serve the built app — no build step needed
npx http-server . -p 8080
```

Open `http://localhost:8080` in Chrome. Connect your MIDI controller when prompted.

**Rebuild from source:**

```bash
npm install           # dev dependencies only
npm run dev           # watch mode — rebuilds on save
npm run build         # one-shot build
npx tsc --noEmit      # type check (esbuild does not typecheck)
npx vitest run        # run tests
```

---

## Project structure

```
src/
  app.ts              entry point — wires all modules
  midi.ts             Web MIDI: device selection, note on/off, modes
  analyzer.ts         chord/interval detection and harmonic analysis
  diagrams.ts         staff, piano, guitar, fretboard, CoF rendering
  history.ts          chord history log
  song.ts             song structure state and rendering
  audio.ts            soundfont-player playback, instrument selector
  analysis-panel.ts   harmonic analysis fields rendering
  shortcuts.ts        keyboard shortcuts data and help popup
  types.ts            shared TypeScript types
  globals.d.ts        CDN global declarations
tests/
  analyzer.test.ts
  song.test.ts
  history.test.ts
  midi.test.ts
  analysis-panel.test.ts
```

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play current chord (or last detected if none active) |
| `H` | Toggle hold mode |
| `A` | Toggle arpeggio mode |
| `S` | Send active history chip to song cursor |
| `C` | Clear history (with confirmation) |
| `P` | Play last detected chord |
| `1`–`9` | Select alternative chord interpretation |
| `Esc` | Cancel MIDI fill / close help / deselect |
| `?` | Show / hide keyboard shortcuts |

Shortcuts are disabled while typing in input fields.

---

## License

GPL-3.0. See `LICENSE`. Any software using this must also remain free and open.
