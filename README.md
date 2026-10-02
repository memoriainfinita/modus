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
| Roman numeral | Scale degree in the active key — `Imaj7`, `ii7`, `V7/ii`, `bVII`. Secondary dominants are written `V7/x` |
| Secondary | Degree a secondary dominant tonicizes — `→ ii` |
| Harmonic function | Tonic / Subdominant / Dominant |
| Figured bass | e.g. `6/4`, `7` |
| Borrowed chord | Modal interchange — source mode shown |
| Suggested scales | Ordered by fit |
| Substitutions | As UMT proposes them — e.g. tritone, sus4, deceptive |
| Cadence | vs. the previous chord: last different chord played, previous history chip, or previous song chord |
| Coltrane axis | Three major-third substitution chords |
| Negative harmony | Mirror chord in the active key |
| Key detection | Krumhansl-Schmuckler running on history note pool. With the key on Auto, the detected key drives the whole app: analysis, history and song romans, Circle of Fifths and staff key signature |

Each field can be toggled individually. Font scale adjustable with +/−.

**Input modes:** Normal, Hold (chord stays after release — useful for arpeggios), Arpeggio (accumulates notes within a 1.2s window).

### Notation panel

Four columns, each togglable independently ([St][An][CoF][Git]):

- **Staff** (abcjs) — chord summary (name, notes, alternatives) always shown above; key signature follows the active key; size −/+
- **Analysis** — all harmonic analysis fields, each field individually togglable; font scale +/−
- **Circle of Fifths** — click any segment to play and show its chord without changing the key; double-click a major or minor segment to set it as the key. A minor key lights its own tonic on the minor ring. Three rings: major, minor, diminished. Controls: enharmonic (b/♯), ring visibility, degree labels (counted from the tonic, major or minor), 7th labels, size
- **Guitar voicing** (notae) — Standard / Drop D / Open G / Custom tuning. Out of every fingering UMT finds, only playable ones are kept (chord bass lowest, no muted string in between, four-fret hand, open strings only in first position), ordered along the neck from the open shapes up; next/prev to browse. Custom tuning accepts note names per string and gets real voicings too

### Instruments panel

- **Piano** (notae) — 4 octaves C2–B5, click any key to play
- **Horizontal fretboard** (notae) — all note positions across 12 frets, each dot labelled with its note (flats or sharps by key), spacing adjustable

### Audio

Any note played on the MIDI controller sounds through the selected soundfont. Click piano keys, CoF segments, or history/song chips to play. 128 GM instruments selectable (grouped by family). Volume slider. Loading progress bar. The instrument starts loading when the page opens; a note that arrives before it can sound (still loading, or no click yet to unlock audio) makes the progress bar flash.

### History

Every chord is logged automatically after 0.8s of stability. Each chip shows chord name and Roman numeral in the selected key (updates live when the key changes; on Auto, the detected key is used). Click to load it in the detector and play it, drag onto a song measure to insert, right-click to remove. Clear empties the strip at once; both can be undone from the toast that appears.

### Song

A scratchpad and structure builder.

- Sections (Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro) with colour coding and repeat counts
- Unlimited chords per measure, unlimited measures per section
- Each chord shows its Roman numeral — borrowed chords highlighted in amber
- Drag to reorder sections and chords; drag history chips directly onto measures
- Click a chord to select and play it
- MIDI fill: arm any chord slot (⊙) and play — each chord fills a slot and the next slot is armed, across measures and sections, until the song ends or Esc
- Transpose entire song in semitone steps (stored voicings move with it)
- Paste a progression as text: `|` marks bar lines (`Dm7 G7 | Cmaj7`); without bars, one chord per measure
- Deleting a chord, measure or section, or starting a new song, happens at once and can be undone
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
- A local server: `pnpm dlx http-server . -p 8080` (`file://` + Web MIDI may be blocked by some Chromium versions)

---

## Running

```bash
# Serve the built app — no build step needed
pnpm dlx http-server . -p 8080
```

Open `http://localhost:8080` in Chrome. Connect your MIDI controller when prompted.

**Rebuild from source** (pnpm):

```bash
pnpm install          # dev dependencies only
pnpm dev              # watch mode — rebuilds on save
pnpm build            # one-shot build
pnpm exec tsc --noEmit  # type check (esbuild does not typecheck)
pnpm test             # run tests
```

UMT and notae are loaded from jsDelivr pinned to a commit hash in `index.html`. Bump the hash deliberately after a release of either library.

---

## Project structure

```
src/
  app.ts              entry point — layout, detector flow, zones, shortcuts
  midi.ts             Web MIDI: device selection, note on/off, modes
  analyzer.ts         chord/interval detection and harmonic analysis
  chord.ts            adapters over UMT chords: family/colour, name normalization, notes
  keys.ts             key names and key signatures
  diagrams.ts         staff, piano, guitar, fretboard, CoF rendering
  history.ts          chord history log
  song-model.ts       song structure: pure operations, transpose, persistence
  song-view.ts        song structure rendering and interaction
  audio.ts            soundfont-player playback, instrument selector
  analysis-panel.ts   harmonic analysis fields rendering
  shortcuts.ts        keyboard shortcuts data and help popup
  storage.ts          localStorage preferences with safe fallbacks
  types.ts            shared TypeScript types
  globals.d.ts        CDN global declarations
tests/
  setup-umt.ts        loads the real UMT bundle (pinned devDependency) as the UMT global
  analyzer.test.ts, chord.test.ts, staff.test.ts, song.test.ts,
  history.test.ts, midi.test.ts, analysis-panel.test.ts
```

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play current chord (or last detected if none active) |
| `H` | Toggle hold mode |
| `A` | Toggle arpeggio mode |
| `S` | Send active history chip to song cursor |
| `C` | Clear history (can be undone) |
| `P` | Same as `Space` |
| `1`–`9` | Select alternative chord interpretation |
| `Esc` | Cancel MIDI fill / close help / deselect |
| `?` | Show / hide keyboard shortcuts |

Shortcuts are disabled while typing in input fields or with a dropdown focused, and never fire with Ctrl/Cmd/Alt held.

---

## License

GPL-3.0. See `LICENSE`. Any software using this must also remain free and open.
