# Modus — Design Spec
_2026-05-23 (rev 6)_

## What it is

Modus is a real-time harmonic analysis tool. Connect a MIDI controller, play notes, and get instant chord detection with full harmonic analysis — Roman numerals, harmonic function, figured bass, scales, substitutions, Coltrane axis, negative harmony, and more.

The core is the **Detector**: MIDI input → chord detection → harmonic analysis, displayed immediately. A chord history log and song structure builder extend that core — they let you work with progressions over time, compare with songs you're transcribing, test combinations, or document a full composition.

**Who it's for:** students, scholars, composers, teachers, music theory educators — anyone who wants to understand or demonstrate harmony.

Use cases: listening and analyzing harmony by ear, transcribing songs, composing, studying theory, teaching.

No server, no account, no installation. Open in Chrome or Edge and play.

---

## Ecosystem

Modus is part of the **memoriainfinita** open source ecosystem:

- **[UMT](https://github.com/memoriainfinita/UMT)** — Universal Music Theory library. Modus uses it for all theory computation.
- **[notae](https://github.com/memoriainfinita/notae)** — SVG diagram renderer for instruments. Modus uses it for piano and fretboard diagrams.
- **Modus** — harmonic analysis app. Uses UMT + notae as CDN dependencies.

Projects are independent but designed to work together. Modus is the first integration app in the ecosystem.

GPL-3.0. Built for the music community, not for profit. No analytics, no accounts, no monetization.

---

## Design principles

**Information density over decoration.** The app exposes everything UMT can compute. Fields are configurable — users choose what to show. Adding theory depth to UMT means Modus gains it automatically.

**Neutral functional dark — neobrutalista.** Colors carry meaning only: chord quality (major → amber, minor → blue, dominant → red-orange, diminished → purple), harmonic function, borrowed chords. UI chrome is monochrome — borders, not buttons; structure, not decoration. No decorative color, no rounded pill buttons, no gradients. Implemented with Tailwind CSS.

**User-configurable.** Every panel is togglable. Font sizes, diagram sizes, visible analysis fields — all adjustable and persisted to localStorage. Direction: modular layout where the user controls panel positions (VSCode-style), color themes for background and diagrams.

**Serverless.** No backend, no database, no account system. Pure HTML + JS served from any static host. A local file server (`http-server`) is needed for development because some Chromium versions block Web MIDI API on `file://` URLs — but no application server is ever required.

---

## Browser compatibility

Web MIDI API requires Chrome or Edge. Firefox and Safari do not support it.

On unsupported browsers: full-page warning — "Modus requires Chrome or Edge for MIDI support." Song builder and CoF interaction remain functional without MIDI.

---

## Stack

| Layer | Technology |
|---|---|
| App | TypeScript → esbuild → `dist/app.js` |
| Theory | UMT via jsDelivr CDN (`UMT.*` global) |
| Diagrams | notae via jsDelivr CDN (`Notae.*` global) |
| Staff | abcjs 6.4.0 via CDN (`ABCJS.*` global) |
| MIDI | Web MIDI API (Chrome/Edge only) |
| Audio | soundfont-player 0.12.0 + FluidR3_GM (npm) |
| Styles | Tailwind CSS |
| Persistence | localStorage |

### CDN script tags

```html
<script src="https://cdn.jsdelivr.net/gh/memoriainfinita/UMT@main/dist/umt.js"></script>
<script src="https://cdn.jsdelivr.net/gh/memoriainfinita/notae@master/dist/notae.js"></script>
<script src="https://cdn.jsdelivr.net/npm/abcjs@6.4.0/dist/abcjs-basic-min.js"></script>
```

Guitar voicings: `UMT.getFretboardVoicings(chord, UMT.GUITAR_STANDARD)` — no external fetch needed.

### CDN globals (`src/globals.d.ts`)

```ts
declare const UMT: any
declare const Notae: any
declare const ABCJS: any
```

---

## File structure

```
modus/
  src/
    app.ts              — entry point, wires all modules
    types.ts            — shared types
    globals.d.ts        — CDN global type declarations
    midi.ts             — Web MIDI setup, device selection, note on/off, modes
    analyzer.ts         — chord detection and harmonic analysis via UMT
    diagrams.ts         — staff (abcjs), piano/fretboard (notae), circle of fifths SVG
    history.ts          — chord history log
    song.ts             — song structure state and rendering
    audio.ts            — soundfont-player init, instrument selector, playback
    shortcuts.ts        — keyboard shortcuts data and help popup
    analysis-panel.ts   — analysis fields rendering (renderZone1Analysis)
  tests/
    analyzer.test.ts
    song.test.ts
  index.html
  package.json
  tsconfig.json
  vitest.config.ts
  dist/app.js           (generated)
  styles.css            (to be migrated to Tailwind)
```

---

## Layout

Single page, dark theme. Three zones stacked vertically. Each zone is collapsible.

```
┌──────────────────────────────────────────────────────────────┐
│  ZONE 1 — Detector (always visible)                          │
│  [MIDI device ▾] [Hold] [Arpeggio] [Key: C maj ▾]           │
│  [Instrument ▾] [Vol ──] [?]                                 │
│                                                              │
│  Notation [▼]  [St][An][CoF][Git]  ← column toggles         │
│  ┌──────────┐ ┌────────────────┐ ┌───────┐ ┌────────────┐  │
│  │  Staff   │ │   Analysis     │ │  CoF  │ │  Guitar    │  │
│  │ summary  │ │ Roman · Func   │ │       │ │  voicing   │  │
│  │  staff   │ │ Fig · Borrowed │ │       │ │            │  │
│  └──────────┘ │ Scales · Cad.  │ └───────┘ └────────────┘  │
│               │ Coltrane · Neg │                             │
│               │ Subs           │                             │
│               └────────────────┘                             │
│  Instruments [▼]  [Pi][Fr]                                   │
│  ┌────────────────────────┐ ┌────────────────────────────┐  │
│  │  Piano  (C2–B5)        │ │  Fretboard  (0–12 frets)   │  │
│  └────────────────────────┘ └────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  ZONE 2 — History [▼]                                        │
│  [C△7 / I] [Am7 / vi] [F / IV] [G7 / V]  [→song] [Clear]   │
├──────────────────────────────────────────────────────────────┤
│  ZONE 3 — Song [▼]                                           │
│  "Title"  [New] [Verse▾][Chorus▾]  [⇄] [⎙] [Paste]         │
│  ▶ Verse ×2  1:[Cmaj7/I][Am7/vi][+]   [+ Bar][⧉][↑][↓][×]  │
└──────────────────────────────────────────────────────────────┘
```

**Architecture note:** Zone 1 (Detector) is the primary module — always visible. Zone 2 (History) and Zone 3 (Song) are support modules that extend the Detector's usefulness over time; both are collapsible.

**Direction:** modular layout where the user places each panel freely (VSCode-style — drag panels to any position, resize). Current implementation uses fixed stacked zones; modular layout is the target architecture.

---

## Zone 1 — Detector

### Toolbar

- **MIDI device selector:** dropdown of available inputs. Updates on connect/disconnect. Persisted to localStorage.
- **Mode buttons:** Hold, Arpeggio (mutually exclusive with Normal).
- **Key selector:** 24 major/minor keys + "auto". Shared with Zone 3.
- **Instrument selector:** 128 GM instruments grouped by family (soundfont-player).
- **Volume slider.**
- **? button:** opens keyboard shortcuts popup.

### MIDI input

`navigator.requestMIDIAccess()` called on load. If denied: non-blocking banner; song builder and CoF remain usable.

**Input modes (mutually exclusive):**

- **Normal:** chord detected while ≥1 note held. Updates on every note-on/off.
- **Hold:** chord stays after all notes released. Next note-on clears and restarts.
- **Arpeggio:** accumulates note-on events within a 1.2s sliding window.

**Note-off handling:**

```ts
const isNoteOff = (status: number, velocity: number) =>
  (status & 0xF0) === 0x80 || ((status & 0xF0) === 0x90 && velocity === 0)
```

### Pitch spelling

Flats by default (jazz convention): `Bb`, `Eb`, `Ab`, `Db`, `Gb`.

```ts
const PITCH_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const noteName = PITCH_NAMES_FLAT[midiNote % 12] + (Math.floor(midiNote / 12) - 1)
// MIDI 60 → "C4", MIDI 58 → "Bb3"
const umtNote = UMT.parseNote(noteName)
```

### Detection logic

| Notes active | Behavior |
|---|---|
| 0 (hold mode) | Last state frozen |
| 0 (normal mode) | Idle — panel cleared |
| 1 | Note name + octave + MIDI number |
| 2 | Interval name + semitone count |
| ≥3 | Full chord detection via `UMT.Harmony.detectChords(notes: Note[])` |

### Chord summary and display

The chord summary is always visible — above the staff, outside the collapsible Notation panel. It shows:

- **Chord name** + quality color badge
- **Active note names** (pitch class, no octave)
- **Alternative interpretations** as clickable chips — selecting one switches the full analysis to that reading. Keys `1`–`9` select by number.

Quality color coding:

| Quality | Color |
|---|---|
| Major | amber |
| Minor | cool blue |
| Dominant 7th | red-orange |
| Diminished / half-dim | dark purple |
| Augmented | teal |
| Sus / other | neutral grey |

### Harmonic analysis panel

Key reference: set from the toolbar key selector (24 major/minor keys or "auto"). Shared with Zone 3.

| Field | Implementation |
|---|---|
| Roman numeral | Chord root mapped to scale degree + quality suffix |
| Harmonic function | Tonic / Subdominant / Dominant / Ambiguous |
| Figured bass | `UMT.FiguredBass.fromChord(chord, bassNote)` |
| Diatonic / borrowed | Flags chords outside the active key; source mode shown |
| Suggested scales | `UMT.Harmony.getSuggestedScales(chord)` |
| Substitutions | `UMT.getSubstitutions(chord, key)` — top-level function, not `Harmony.getSubstitutions` |
| Cadence | `UMT.Harmony.analyzeCadence(prev, current, key)` — prev = last history entry |
| Coltrane axis | `UMT.Harmony.getColtraneAxis(key)` — three axis chords, highlights active |
| Negative harmony | `UMT.Harmony.getNegativeHarmony(chord, key)` |
| Key detection | `UMT.KeyDetection.detect(notes)` — pool from history. Returns `{ key, confidence }[]` |

Analysis fields have toggle buttons (show/hide each field individually) and a font scale control (+/-). All persisted to localStorage.

### Notation panel

Four columns toggled individually with [St][An][CoF][Git] buttons in the panel header.

**Staff column:** Detected notes rendered as ABC notation. Treble clef. Key signature follows the active key selector. Rendered by abcjs.

**Analysis column:** All harmonic analysis fields (see table above). Toggle buttons per field, font scale +/-.

**CoF column (Circle of Fifths):** Custom SVG rendered in `diagrams.ts`. Three rings: 12 major segments, inner minor ring, innermost diminished ring. Active key segment filled; active chord root outlined. Controls: +/- size, b/# enharmonic toggle, m (minor/dim visibility), ° (degree labels), 7 (seventh chord labels). Single click on major segment: select key + play chord. Single click on minor/dim segment: play chord only (no key change).

**Guitar column:** Voicings from `UMT.getFretboardVoicings(chord, UMT.GUITAR_STANDARD)`. Navigation ‹/›. Rendered by `Notae.renderFretboard()`. Custom tuning: Standard / Drop D / Open G / custom per-string. String labels: Off / Tuning / Notes (♩). Fret spacing +/-.

### Instruments panel

Separate collapsible panel below Notation. Two sub-panels toggled with [Pi][Fr].

**Piano [Pi]:** `Notae.renderPiano({ name, keys, colors })`. Range C2–B5. Click any key to play. Note: notae does not generate `data-note` on piano SVGs — click listeners are attached via custom post-processing after render (see state.md).

**Fretboard [Fr]:** Horizontal neck rendered by `Notae.renderFretboard()`. Shows all positions of active notes across frets 0–12. Spacing control (+/- neckSpacing, range 10–28, default 16).

---

## Zone 2 — History

### Data model

```ts
type HistoryEntry = {
  id: string
  symbol: string    // top candidate at capture time
  notes: string[]   // note names that produced this chord
}
```

Roman numeral and badge computed on render from `symbol` + current key — not stored.

### Behavior

- Horizontal scrollable strip of chips
- **Auto-append:** new distinct chord stable for ≥0.8s
- **Capture button (⊙):** force-add immediately — also `Space` shortcut
- Max 200 entries; oldest dropped when exceeded
- **Click chip:** loads chord in Zone 1; marks chip active
- **Right-click:** context menu → Delete
- **Drag to Song:** chips are draggable into Zone 3 measures
- **→song button / S shortcut:** inserts active chip at song cursor
- **Clear button (C shortcut):** wipe all history with confirmation
- History note pool feeds running key detection

---

## Zone 3 — Song

A support module for the Detector. Works as a quick scratchpad (try a progression, see the Roman numerals) or as a full song editor (document sections, repeat counts, the complete harmonic structure of a piece).

### Data model

```ts
type SongChord = {
  id: string
  symbol: string
  notes?: string[]  // captured voicing (optional — manual entries have none)
  valid: boolean
}

type Measure = {
  id: string
  chords: SongChord[]
}

type SectionColor = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'outro' | 'custom'

type Section = {
  id: string
  name: string
  color: SectionColor
  measures: Measure[]
  collapsed: boolean
  repeatCount: number
}

type Song = {
  schemaVersion: 1
  title: string
  sections: Section[]
}
```

Persisted to localStorage. On load: missing or mismatched `schemaVersion` → reset to empty song.

### Chord chip display

```
Cmaj7      ← symbol
I △7       ← Roman numeral + quality (recomputes on key change)
```

In-key: standard colour. Borrowed: amber. Invalid: red, `?`. No key: `—`.

### Interactions

**Chord chips:** click → load in Zone 1 + mark cursor. Double-click → play. Edit → inline input, UMT parse on confirm. Drag within measure. Drag from history. Capture from MIDI (⊙ button arms capture mode on the slot). Duplicate (⧉).

**Measures:** add (+ Bar), delete (× if section has >1 measure).

**Sections:** rename (click), color (swatch picker), collapse/expand, repeat count (×N), duplicate (⧉), reorder (↑/↓), delete (×).

**Song-level:** title (inline edit), New (clear with confirmation), quick-add templates (Intro/Verse/Pre-Chorus/Chorus/Bridge/Outro), Transpose (⇄ — semitone steps or target key, enharmonic spelling follows target key), Export (⎙ — browser print), Paste (modal textarea — space/comma/newline separated symbols).

### Cursor

Active slot = last chord that received focus. `→song` and `S` insert after cursor and advance it. No active slot → append to end of last section.

---

## Audio

soundfont-player 0.12.0 + FluidR3_GM. 128 GM instruments selectable. Volume control.

**States:** idle → loading (progress bar, asynchronous fill) → suspended (AudioContext suspended, click to activate) → ready → error.

`initAudioOnGesture()` resumes AudioContext on first real user gesture (click or MIDI note-on).

**Playback triggers:** MIDI note-on (individual notes), piano key click, CoF segment click, chord chip double-click, Space/P shortcut (last detected chord).

`pendingNotes` queue: notes received before instrument is ready are discarded on load to avoid burst on first gesture.

---

## Customization

All preferences persisted to localStorage.

**Currently configurable:**
- Notation columns visible/hidden individually (Staff, Analysis, CoF, Guitar)
- Instruments sub-panels visible/hidden individually (Piano, Fretboard)
- Analysis fields shown/hidden individually
- Analysis font scale (8–20px)
- CoF size and display options (enharmonics, minor/dim, degrees, sevenths)
- Guitar fret spacing and tuning
- Neck (fretboard) spacing

**Direction:**
- Color themes: user-selectable background and diagram colors (dots, frets, piano keys, CoF segments)
- Modular layout: panels freely repositionable and resizable (VSCode-style)

---

## Keyboard shortcuts

Disabled when `<input>` or `<textarea>` has focus.

| Key | Action |
|---|---|
| `H` | Toggle hold mode |
| `A` | Toggle arpeggio mode |
| `Space` | Capture current chord to history |
| `P` | Play current / last detected chord |
| `S` | Send active history chip to song cursor |
| `C` | Clear history (with confirmation) |
| `1`–`9` | Select Nth alternative interpretation |
| `Escape` | Cancel capture mode / close help popup |
| `?` | Toggle help popup |

---

## Build

```bash
npm run build   # one-shot: esbuild src/app.ts → dist/app.js
npm run dev     # watch mode (--watch=forever, survives stdin close)
```

Dev server: `npx http-server . -p 8080` (required — `file://` + Web MIDI may be blocked).

TypeScript check (esbuild does not typecheck): `npx tsc --noEmit`

Tests: `npx vitest run`

---

## UMT implementation notes

Gotchas confirmed by reading UMT source — do not assume:

- `UMT.Harmony.detectChords(notes)` takes `Note[]` objects, not strings. Always convert: `UMT.parseNote(noteName)`.
- `UMT.getSubstitutions(chord, key)` is a top-level function — not `UMT.Harmony.getSubstitutions`.
- `UMT.Harmony.analyzeProgression(chords, key)` returns `{ analysis: ChordAnalysis[], ... }` — `.analysis`, not `.analyses`.
- `UMT.FiguredBass.fromChord(chord, bassNote)` generates a figured bass string — `FiguredBass.parse` does not exist in UMT.
- `UMT.KeyDetection.detect(notes)` returns `{ key: string, confidence: number }[]`.

---

## Out of scope (v1)

- Multiple saved songs
- Cloud sync / account
- Mobile / touch layout
- MIDI file import/export
- Microtonal / non-12TET analysis
- MIDI channel filtering
- Note velocity display
- Free color picker for section colors (preset palette only)
- Light mode (dark only)
- Audio passthrough from MIDI controller
