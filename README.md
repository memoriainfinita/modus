# Modus

Real-time MIDI harmonic analysis and song structure builder. Play notes on a MIDI controller and see full harmonic analysis instantly — chord names, Roman numerals, scales, substitutions, figured bass, and more. Build annotated chord charts for songs with Roman numeral degree display per chord.

Designed to run alongside MuseScore or any notation software during transcription.

Zero runtime dependencies. No server. Open in Chrome and play.

---

## What it does

**Zone 1 — Real-time detector**

Connect a MIDI controller and play. The app detects what you're playing:

- **1 note:** note name, octave, MIDI number
- **2 notes:** interval name, semitone count, inversion
- **3+ notes:** full chord detection with ranked alternatives

For each detected chord, the analysis panel shows:

| Field | Detail |
|---|---|
| Chord name | Top candidate + all alternatives (clickable) |
| Roman numeral | Scale degree in the active key — `I△7`, `ii7`, `V7/ii`, `bVII` |
| Harmonic function | Tonic / Subdominant / Dominant |
| Figured bass | e.g. `6/4`, `7` |
| Borrowed chord | Modal interchange detected, source mode shown |
| Suggested scales | Ordered by fit |
| Substitutions | Tritone sub, diatonic, sus4 |
| Cadence | vs. last chord in history |
| Coltrane axis | Three major-third substitution chords |
| Negative harmony | Mirror chord in the active key |
| Key detection | Krumhansl-Schmuckler running on history pool |

The notation panel shows a staff (abcjs), piano diagram (notae), guitar voicing diagram (notae + chords-db), and an interactive circle of fifths — all updating in real time.

**Input modes:** Normal, Hold (chord stays after release — great for arpeggios), Arpeggio (accumulates notes in a 1.2s window).

**Zone 2 — History**

Every chord you play is logged automatically after 0.8s of stability. Each chip shows the chord name, Roman numeral, and a quality colour badge. Click any chip to reload it in Zone 1. Send chords directly to the song structure.

**Zone 3 — Song structure builder**

Build a chord chart for the song you're transcribing:

- Sections (Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro) with colour coding
- Unlimited chords per measure, unlimited measures per section
- Each chord chip shows its Roman numeral degree below — at a glance you see the harmonic map of the whole song
- Borrowed chords highlighted in amber
- Capture from MIDI: arm any slot and play the chord to fill it
- Transpose entire song with enharmonic spelling by target key
- Paste a progression as text (`Cmaj7 Am7 F G`)
- Export as a clean print-ready chord chart

---

## Stack

| Layer | Technology |
|---|---|
| App | TypeScript → esbuild |
| Music theory | [UMT](https://github.com/memoriainfinita/UMT) — Universal Music Theory Library |
| Diagrams | [notae](https://github.com/memoriainfinita/notae) — SVG chord diagram renderer |
| Staff | abcjs |
| MIDI | Web MIDI API |
| Guitar voicings | @tombatossals/chords-db |
| Audio | WebAudioFont (GM piano) |

All dependencies loaded via CDN. No npm install needed to run.

---

## Requirements

- Chrome or Edge (Web MIDI API)
- A MIDI controller (optional — song builder works without one)
- A local server to serve the files (`npx http-server . -p 8080`)

---

## Running

```bash
# Clone and install dev dependencies (TypeScript + esbuild only)
git clone https://github.com/memoriainfinita/modus
cd modus
npm install

# Build (watch mode)
node build.js

# Serve (in a second terminal)
npx http-server . -p 8080
```

Open `http://localhost:8080` in Chrome. Connect your MIDI controller when prompted.

---

## Project structure

```
src/
  app.ts          entry point — wires all modules, keyboard shortcuts
  midi.ts         Web MIDI: device selection, note on/off, modes
  analyzer.ts     chord/interval detection and harmonic analysis via UMT
  diagrams.ts     staff, piano, guitar, circle of fifths rendering
  history.ts      chord history log
  song.ts         song structure state (pure) + DOM rendering
  audio.ts        WebAudioFont playback
  types.ts        shared TypeScript types
  globals.d.ts    CDN global declarations
tests/
  analyzer.test.ts
  song.test.ts
```

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `H` | Toggle hold mode |
| `A` | Toggle arpeggio mode |
| `Space` | Capture current chord to history |
| `S` | Send last history chip to active song slot |
| `C` | Clear history |
| `1`–`9` | Select alternative chord interpretation |
| `Esc` | Cancel capture / deselect |

Shortcuts disabled while typing in chord input fields.

---

## Related

- [UMT](https://github.com/memoriainfinita/UMT) — the music theory engine powering the analysis
- [notae](https://github.com/memoriainfinita/notae) — the SVG diagram renderer for piano, guitar, and fretboard

---

## License

GPL-3.0. Any software using this must also remain free and open.
