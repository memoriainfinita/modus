# Modus

Real-time MIDI harmonic analysis and song structure builder. Play notes on a MIDI controller and see full harmonic analysis instantly — chord names, Roman numerals, scales, substitutions, figured bass, and more. Build annotated chord charts for songs with Roman numeral degree display per chord.

Designed to run alongside MuseScore or any notation software during transcription.

Zero runtime dependencies to run. No server. Open in Chrome and play.

---

## What it does

**Analyzer — real-time detector**

Connect a MIDI controller and play. The app detects what you're playing:

- **1 note:** note name, octave, MIDI number
- **2 notes:** interval name, semitone count, inversion
- **3+ notes:** full chord detection with ranked alternatives

For each detected chord, the analysis panel shows:

| Field | Detail |
|---|---|
| Chord name | Top candidate + all alternatives (clickable, keys 1–9) |
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

Each analysis field can be toggled on/off. Font scale adjustable with +/−. Column visibility (Staff, Analysis, CoF, Guitar) controlled per column.

**Notation panel**

- Staff (abcjs) — clef follows active key
- Circle of Fifths — interactive, shows active chord highlighted. Controls: enharmonic (b/♯), minor ring, dim ring, degree labels, 7th labels, size
- Guitar voicing (notae) — Standard/Drop D/Open G/Custom tuning, fret labels, degree labels
- Horizontal fretboard (notae) — all note positions across 12 frets

**Instruments panel**

- 4-octave piano (C2–B5, Notae) — click any key to play it
- Horizontal fretboard — notes highlighted per chord

**Input modes:** Normal, Hold (chord stays after release — great for arpeggios), Arpeggio (accumulates notes in a 1.2s window).

**Audio**

Any note you play on the MIDI controller sounds through the selected soundfont. Click any piano key to play it. Double-click any history chip or song chord to replay it. Play button (▶) and `P` key replay the last detected chord.

- 128 GM instruments selectable from the toolbar (grouped by family)
- Volume slider
- Loading progress bar — shows loading/ready/error state

**History**

Every chord you play is logged automatically after 0.8s of stability. Each chip shows the chord name and Roman numeral. Click to reload in the analyzer, double-click to play, drag onto a song section to insert, right-click to remove.

**Song structure builder**

Build a chord chart for the song you're transcribing:

- Sections (Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro) with colour coding
- Unlimited chords per measure, unlimited measures per section
- Each chord shows its Roman numeral degree — borrowed chords highlighted in amber
- **Drag to reorder:** sections (grab the ⠿ handle), chords within or across sections
- **Drag from history:** drop any history chip onto a section to insert the chord
- MIDI fill: arm any chord slot (⊙) and play to fill it from the controller
- Inline color picker per section, inline repeat count
- Transpose entire song (semitone selector)
- Paste a progression as text (`Cmaj7 Am7 F G`)
- Form analysis shown inline in real time (AABA, verse-chorus, etc.)

---

## Stack

| Layer | Technology |
|---|---|
| App | TypeScript → esbuild |
| Music theory | [UMT](https://github.com/memoriainfinita/UMT) — Universal Music Theory Library |
| Diagrams | [notae](https://github.com/memoriainfinita/notae) — SVG diagram renderer (piano, guitar, fretboard) |
| Staff | abcjs 6.4.0 |
| MIDI | Web MIDI API |
| Guitar voicings | UMT.getFretboardVoicings (no fetch needed) |
| Audio | soundfont-player 0.12.0 + FluidR3_GM (128 GM instruments) |
| Persistence | localStorage |

All runtime dependencies loaded via CDN. No npm install needed to run the built app.

---

## Requirements

- Chrome or Edge (Web MIDI API + Web Audio API)
- A MIDI controller (optional — song builder and click-based analysis work without one)
- A local server to serve the files (`npx http-server . -p 8080`)

---

## Running

```bash
# Serve the built app (no build step needed)
npx http-server . -p 8080
```

Open `http://localhost:8080` in Chrome. Connect your MIDI controller when prompted.

**To rebuild from source:**

```bash
npm install        # dev dependencies only (esbuild + TypeScript)
node build.js      # watch mode — rebuilds on save
```

---

## Project structure

```
src/
  app.ts          entry point — layout, wiring, keyboard shortcuts
  midi.ts         Web MIDI: device selection, note on/off, modes
  analyzer.ts     chord/interval detection and harmonic analysis via UMT
  diagrams.ts     staff, piano, guitar, fretboard, circle of fifths rendering
  history.ts      chord history log
  song.ts         song structure state + DOM rendering
  audio.ts        soundfont-player playback, instrument management
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
| `Space` | Capture current chord to history |
| `H` | Toggle hold mode |
| `A` | Toggle arpeggio mode |
| `S` | Send last history chip to active song slot |
| `C` | Clear history (confirm with second press) |
| `P` | Play last detected chord |
| `1`–`9` | Select alternative chord interpretation |
| `Esc` | Cancel MIDI fill / close help / deselect |
| `?` | Show / hide keyboard shortcuts |

Shortcuts disabled while typing in input fields.

---

## Related

- [UMT](https://github.com/memoriainfinita/UMT) — the music theory engine powering the analysis
- [notae](https://github.com/memoriainfinita/notae) — the SVG diagram renderer for piano, guitar, and fretboard

---

## License

GPL-3.0. Any software using this must also remain free and open.
