# Harmony Companion — Design Spec
_2026-05-20 (rev 5)_

## Goal

A real-time harmonic analysis tool for use alongside MuseScore during song transcription. The user plays notes on a MIDI controller; the app detects chords, shows full harmonic analysis, and maintains a song structure builder for the big picture. Single-page TypeScript app, no framework, no server required.

**Closest existing tool:** MidiStickers Pro ($59, desktop). Ours is browser-based, free, deeper theory via UMT, and adds a song structure builder.

---

## Browser compatibility

**Web MIDI API is supported only in Chrome and Edge.** Firefox and Safari do not support it. On unsupported browsers the app shows a full-page warning:

> "Harmony Companion requires Chrome or Edge for MIDI support."

All non-MIDI features (song structure builder, chord analysis via click) remain functional.

**Serving:** open via `http-server` (or any local server). `file://` + Web MIDI may be blocked by some Chromium versions. `http-server . -p 8080` is the canonical dev command.

---

## Stack

| Layer | Technology |
|---|---|
| App code | TypeScript → esbuild → `dist/app.js` |
| Music theory | UMT via jsDelivr CDN (`UMT.*`) |
| Notation diagrams | notae via jsDelivr CDN (`Notae.*`) |
| Staff notation | abcjs via CDN (pinned version) |
| MIDI input | Web MIDI API (browser native, Chrome/Edge only) |
| Guitar voicing data | `@tombatossals/chords-db` via jsDelivr CDN |
| Soundfont playback | WebAudioFont via CDN — instrument file: `_tone_0000_GeneralUserGS_sf2_file.js` (GM piano) |
| Persistence | localStorage |

### CDN script tags (exact URLs for `index.html`)

```html
<!-- UMT -->
<script src="https://cdn.jsdelivr.net/gh/memoriainfinita/UMT@main/dist/umt.js"></script>
<!-- notae -->
<script src="https://cdn.jsdelivr.net/gh/memoriainfinita/notae@master/dist/notae.js"></script>
<!-- abcjs -->
<script src="https://cdn.jsdelivr.net/npm/abcjs@6.4.0/dist/abcjs-basic-min.js"></script>
<!-- WebAudioFont -->
<script src="https://cdn.jsdelivr.net/npm/webaudiofont@2.1.0/npm/dist/WebAudioFontPlayer.js"></script>
<script src="https://cdn.jsdelivr.net/npm/webaudiofont@2.1.0/npm/dist/sf2staccato/_tone_0000_GeneralUserGS_sf2_file.js"></script>
<!-- chord voicings (JSON, loaded via fetch in guitar.ts) -->
<!-- https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@1.4.5/src/data/guitar.json -->
```

`@tombatossals/chords-db` is loaded via `fetch()` at runtime (not a `<script>` tag — it's JSON). URL: `https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@1.4.5/src/data/guitar.json`

**CDN failure handling:** if any `<script>` tag fails to load, a global `window.onerror` catch shows a user-facing banner: "Failed to load a required resource. Check your internet connection." The app does not attempt to function without UMT or notae.

### CDN globals declared in `src/globals.d.ts`

```ts
declare const UMT: any
declare const Notae: any
declare const ABCJS: any
declare const WebAudioFontPlayer: any
declare const _tone_0000_GeneralUserGS_sf2_file: any
```

Build: `build.js` with esbuild watch mode (same pattern as UMT and notae).

---

## File Structure

```
harmony-companion/
  src/
    app.ts              — entry point, wires all modules
    midi.ts             — Web MIDI setup, device selection, note on/off, modes
    analyzer.ts         — chord/interval detection and harmonic analysis via UMT
    diagrams.ts         — staff (abcjs), piano/guitar SVG (Notae), circle of fifths SVG
    history.ts          — chord history log
    song.ts             — song structure state and rendering
    audio.ts            — WebAudioFont init and playback
    types.ts            — shared types
    globals.d.ts        — CDN global type declarations
  index.html            — loads CDN scripts then dist/app.js
  build.js              — esbuild watch script
  package.json
  tsconfig.json
```

### `tsconfig.json` requirements

- `"lib": ["dom", "es2020"]` — for Web MIDI API types
- `"strict": true`
- `"target": "es2020"`

---

## Layout

Single page, dark/neutral theme. Three horizontal zones stacked vertically.

```
┌─────────────────────────────────────────────────────────────┐
│  ZONE 1 — Real-time detector (always visible)               │
│  [MIDI: ▸ Keystation ▾] [Hold] [Arpeggio] [Key: C maj ▾]  │
│  ┌────────────────┐ ┌────────────────────────────────────┐  │
│  │ Notation  [👁] │ │ Harmonic analysis             [👁] │  │
│  │ Staff          │ │ Names · Roman · Function           │  │
│  │ Piano          │ │ Figured bass · Borrowed            │  │
│  │ Guitar         │ │ Scales · Subs · Coltrane axis      │  │
│  │ Circle of 5ths │ │ Negative harmony · Cadence         │  │
│  └────────────────┘ └────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ZONE 2 — History (collapsible [▼])                         │
│  [C△7 / I] [Am7 / vi] [F / IV] [G7 / V]  [→song] [Clear]  │
├─────────────────────────────────────────────────────────────┤
│  ZONE 3 — Song structure (collapsible [▼])                  │
│  "Song title"  [New] [Verse▾][Chorus▾]... [⇄] [⎙] [Paste] │
│  ▶ Intro ×1 🟡  1:[Cmaj7/I△7][Am7/vi7][+]  [+ Bar][⧉][↑][↓][×] │
│  ▶ Verse ×2 🟢  2:[F/IV][G7/V7][+]  3:[Em/iii][Am/vi][+]  │
└─────────────────────────────────────────────────────────────┘
```

Each Zone 1 subpanel has a `[👁]` toggle. Preferences persisted to localStorage.

---

## Zone 1 — Real-time Detector

### MIDI input

**Permission:** `navigator.requestMIDIAccess()` is called on app load. If the user denies permission, the app shows a non-blocking banner: "MIDI access denied. Grant permission in browser settings to use a controller." All non-MIDI features remain usable.

**Device selector:** dropdown listing all available `MIDIInput` ports. Updates if devices connect/disconnect mid-session (`onstatechange`). If the selected device disconnects, shows "disconnected" in the status bar and waits for reconnect without clearing the last analysis. Selection persisted to localStorage.

**Input modes (mutually exclusive — selecting one disables the other):**

- **Normal:** chord detected while ≥1 note held. Updates on every note-on/off event.
- **Hold:** chord stays displayed after all notes released. Next note-on clears and restarts. Useful for arpeggios played slowly.
- **Arpeggio:** accumulates note-on events within a 1.2s sliding window. Each new note resets the window. Display updates as notes arrive.

**MIDI channels:** all channels accepted by default (channel-agnostic). Channel filtering is out of scope for v1.

**Note velocity:** ignored for analysis. Not displayed in v1.

### Note-off handling

Two MIDI message types must be treated as note-off:
- Status byte `0x8X` (explicit note-off)
- Status byte `0x9X` with velocity = 0 (note-on with zero velocity — standard MIDI alternative)

```ts
const isNoteOff = (status: number, velocity: number) =>
  (status & 0xF0) === 0x80 || ((status & 0xF0) === 0x90 && velocity === 0)
```

### Detection input format

MIDI note numbers (0–127) are converted to note names with octave before being passed to UMT.

**Pitch spelling policy: flats by default.** Black keys are spelled as flats (`Bb`, `Eb`, `Ab`, `Db`, `Gb`). This matches jazz/theory conventions and UMT's default enharmonic preference. When a key is set, UMT's own spelling logic takes over for any re-analysis.

```ts
const PITCH_NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const octave = Math.floor(midiNote / 12) - 1
const noteName = PITCH_NAMES[midiNote % 12] + octave   // "C4", "Bb3", "Gb5"
```

UMT functions receive **note name strings** (`"C4"`, `"E4"`, `"G4"`) unless otherwise specified.

### Detection logic

| Notes active | Behavior |
|---|---|
| 0 (hold mode) | Last state frozen on screen |
| 0 (normal mode) | Panel cleared / idle state |
| 1 | Note name + octave + MIDI number. No chord analysis. |
| 2 | Interval name + semitone count + inversion name. Uses `UMT.Interval`. No chord analysis. |
| ≥3 | Full chord detection via `UMT.Harmony.detectChords(noteNames)` → ranked candidates |

### Chord display

- **Top candidate** shown large with a **quality color badge:**
  - Major: warm amber
  - Minor: cool blue
  - Dominant 7th: red-orange
  - Diminished / half-diminished: dark purple
  - Augmented: teal
  - Sus / other: neutral grey
- **Alternative interpretations** listed below, clickable — clicking one switches the full analysis panel to that reading
- **Active notes** shown as pitch class names (no octave) in a row

### Harmonic analysis panel

Given the top (or selected) chord and the active key reference:

| Field | Implementation |
|---|---|
| Roman numeral | Map chord root to scale degree in active key; append quality suffix → `ii7`, `V7`, `bVII` |
| Harmonic function | Tonic / Subdominant / Dominant / Ambiguous — derived from scale degree |
| Figured bass | `UMT.FiguredBass.parse` on chord intervals |
| Borrowed chord | Compare chord root and quality against chords of parallel modes; flag if not diatonic |
| Suggested scales | `UMT.Harmony.getSuggestedScales(chord)` |
| Substitutions | `UMT.getSubstitutions(chord, key)` — tritone, diatonic, sus4 |
| Cadence | `UMT.Harmony.analyzeCadence(prev, current, key)` — prev = last entry in history |
| Coltrane axis | `UMT.Harmony.getColtraneAxis(key)` — show the three axis chords, highlight which one is active |
| Negative harmony | `UMT.Harmony.getNegativeHarmony(chord, key)` — show mirror chord name |
| Key detection | `UMT.KeyDetection.detectKey(notePool)` — pool = all notes from history; shown as "auto: A minor" |

**Key reference:** manual dropdown (24 major/minor keys) or "auto" (live Krumhansl-Schmuckler). Shared globally with Zone 3.

### Notation subpanel

**Staff:** generate ABC notation string from detected notes at their actual octave. Treble clef only (v1). Notes outside C3–C6 shown with ledger lines. Rendered by abcjs.

**Piano diagram:** `Notae.renderPiano({ name, keys, colors })` with active note names. Notes outside the default C3–B4 range: extend the range to the nearest octave boundary that contains all active notes.

Piano keys are clickable. Since notae returns an SVG string injected as `innerHTML`, click listeners must be attached after injection by querying SVG key elements. notae marks keys with `data-note` attributes (e.g. `data-note="C4"`). After each render: `container.querySelectorAll('[data-note]').forEach(el => el.addEventListener('click', () => audio.playNote(el.dataset.note)))`. If notae does not expose `data-note`, the diagrams module wraps the SVG in a transparent click-region overlay mapped to key positions.

**Guitar diagram:** `Notae.renderFretboard(voicing)` with first match from `@tombatossals/chords-db`. "Next voicing ›" button cycles alternatives. If no voicing found, shows a placeholder with the chord name and "no voicing".

**Circle of fifths:** custom SVG rendered by the app (not a UMT output). Data from `UMT.CircleOfFifths`: 12 segments arranged in a circle. Active key segment filled. Current chord root segment outlined. Clicking a segment sets the global key.

---

## Zone 2 — History

### History data model

```ts
type HistoryEntry = {
  id: string        // uuid
  symbol: string    // top candidate name at capture time, e.g. "Cmaj7"
  notes: string[]   // note names that produced this chord, e.g. ["C4","E4","G4","B4"]
}
```

Roman numeral and quality badge are computed on render from `symbol` + current key — not stored.

### History display

Horizontal scrollable strip. Each chip: chord name + Roman numeral (reflects **current key**, not capture-time key — recomputed live on key change) + quality color badge.

- **Max 200 entries.** Oldest entries silently dropped when limit is reached.
- **Auto-append:** new distinct chord stable for ≥0.8s
- **Capture button:** force-add current chord immediately (`Space` shortcut)
- **Click chip:** load chord in Zone 1 for analysis; marks chip as "active" (outlined)
- **Right-click chip:** context menu with Delete
- **→song button:** inserts the most recently clicked/active chip into Zone 3 at the cursor position
- **Clear button:** wipe all history (with confirmation)
- History notes pool feeds the running key detection

---

## Zone 3 — Song Structure Builder

### Data model

```ts
type SongChord = {
  id: string          // uuid — stable reference for cursor tracking
  symbol: string      // raw user input, e.g. "Cmaj7"
  valid: boolean      // false if UMT cannot parse the symbol
}

type Measure = {
  id: string
  chords: SongChord[]
  // measure number is NOT stored — computed on render from position + repeat counts
}

type SectionColor = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'outro' | 'custom'

type Section = {
  id: string
  name: string
  color: SectionColor
  measures: Measure[]
  collapsed: boolean
  repeatCount: number   // 1 = no badge; ≥2 = shows "×N"
}

type Song = {
  schemaVersion: 1      // increment on breaking model changes; trigger migration on load
  title: string
  sections: Section[]
}
```

Persisted to localStorage as JSON on every change. One active song in v1.

**On load:** if `schemaVersion` is missing or mismatched, log a warning and reset to empty song rather than crashing.

### Global key reference

The key selector in Zone 1 is shared globally with Zone 3. All chord chips in Zone 3 recompute their Roman numeral whenever the key changes.

### Chord degree display

Every chord chip in Zone 3 shows two lines:

```
Cmaj7        ← symbol (large)
I △7         ← Roman numeral + quality (small, muted)
```

- **In-key:** Roman numeral in standard colour
- **Borrowed / outside key:** Roman numeral in amber
- **Invalid symbol:** red badge, `?` in degree line, raw text preserved
- **No key set:** degree line shows `—`

### Measure numbers

Computed on render, not stored. Numbering is global across all sections and accounts for repeat counts:

- Section A (×1) with 4 measures → bars 1–4
- Section B (×2) with 2 measures → bars 5–6 (×2 shown as "5–6 ×2", not 5–8)

### Song-level controls

- **Title:** editable inline
- **New:** clears song with confirmation dialog ("Start a new song? Current song will be lost.")
- **Quick-add templates:** Intro / Verse / Pre-Chorus / Chorus / Bridge / Outro — each creates a section with preset name and colour
- **Transpose (⇄):** dropdown with semitone steps (+1 to +11) or target key selection. Transposes all chord symbols. Enharmonic spelling follows the target key: sharp keys prefer sharps, flat keys prefer flats. Roman numerals recompute automatically.
- **Formal analysis (🔍):** simple pattern matcher on section name sequence (not UMT — UMT's `form.ts` operates on chord streams, not section labels). Detects patterns like AABA, verse-chorus, through-composed based on which section names repeat. Shows result in a tooltip/overlay.
- **Export (⎙):** browser print dialog. Print view: song title, key, section headers with colour bar, measures as rows, each chord chip as `symbol / Roman` stacked.
- **Paste (Paste):** modal dialog with a textarea. Parsing rules:
  - Separators: space, comma, or newline (any combination)
  - Chord symbols: parsed left-to-right, each token passed to `UMT.parseChordSymbol`; tokens that fail parsing are flagged as invalid but kept
  - Slash chords (`Am/E`): kept as-is as a single token
  - Accidentals: both `b` (flat) and `#` (sharp) accepted
  - **Measure allocation:** all pasted chords go into a single new measure appended to the focused section. The user splits manually afterward. If the paste contains more than 8 chords a notice says "All chords added to one measure — split as needed."
  - Result appended to the currently focused section (last section if none focused)

### Section interactions

- **Rename:** click name → inline edit
- **Colour:** click colour swatch → picker (preset colours only, no free colour in v1)
- **Collapse/expand:** `▶/▼` toggle; state persisted in model
- **Repeat count:** click `×N` badge → numeric input (1–16)
- **Duplicate (⧉):** deep copy section with new UUIDs for all ids
- **Reorder:** ↑/↓ buttons
- **Delete:** × with confirmation

### Measure interactions

- **Add measure:** "+ Bar" at end of section
- **Delete:** × on hover; only if section has >1 measure

### Chord chip interactions

- **Add:** "+" at end of measure → empty slot, auto-focused input
- **Edit:** click chip → inline text input; on blur/Enter confirms and UMT attempts to parse; `Escape` cancels and reverts to previous value without saving; if invalid on confirm, `valid: false`, red badge
- **Delete:** Backspace on empty input removes slot; × on hover
- **Reorder:** ← → buttons on hover (v1)
- **Play:** double-click → soundfont plays chord
- **Analyze:** single click → loads chord in Zone 1; marks chip as cursor position
- **Capture from MIDI (⊕):** arms capture mode; outline pulses on the slot; next chord detected fills it, cursor advances to next slot

### Cursor for Zone 2 → Zone 3 insertion

The **active slot** = last `SongChord` id that received focus (edit, click, capture, or playback). Marked with a subtle outline. The `→song` button and `S` shortcut insert after the active slot and advance the cursor to the new chip. If no active slot, appends to end of last section.

---

## Audio — WebAudioFont

### Initialization

```html
<!-- in index.html, before dist/app.js -->
<script src="https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js"></script>
<script src="https://surikov.github.io/webaudiofont/npm/dist/sf2staccato/_tone_0000_GeneralUserGS_sf2_file.js"></script>
```

```ts
// audio.ts
const audioCtx = new AudioContext()
const player = new WebAudioFontPlayer()
player.loader.decodeAfterLoading(audioCtx, '_tone_0000_GeneralUserGS_sf2_file')
```

### Playback

On play trigger (double-click chord chip, click piano key):
- Parse note names from UMT chord in octave range C3–C5
- For each note: `player.queueWaveTable(audioCtx, audioCtx.destination, _tone_0000_GeneralUserGS_sf2_file, 0, midiNote, 1.5)`
- Notes scheduled simultaneously for chord playback

AudioContext must be resumed on first user gesture (browser autoplay policy). `audio.ts` handles this with a one-time `audioCtx.resume()` on the first interaction event.

---

## Guitar voicing data

`@tombatossals/chords-db` via jsDelivr as JSON. Normalize UMT chord name → DB key:
- Root: map `Bb` → `Bb`, `C#` → `Csharp`, etc.
- Quality: map UMT quality string → DB suffix (`major` → `major`, `minor` → `minor`, `dominant seventh` → `dominant7`, etc.)

First voicing shown by default. "Next voicing ›" cycles. No match → placeholder.

---

## Keyboard shortcuts

Shortcuts are **disabled when any `<input>` or `<textarea>` has focus** to avoid conflicts with chord symbol editing.

| Key | Action |
|---|---|
| `H` | Toggle hold mode |
| `A` | Toggle arpeggio mode |
| `Space` | Capture current chord to history (preventDefault on scroll) |
| `S` | Send last active history chip to active song slot |
| `C` | Clear history (with confirmation) |
| `1`–`9` | Select Nth alternative chord interpretation |
| `Escape` | Cancel capture mode / deselect active slot |

---

## Build

```js
// build.js
import * as esbuild from 'esbuild'
const ctx = await esbuild.context({
  entryPoints: ['src/app.ts'],
  bundle: true,
  outfile: 'dist/app.js',
  format: 'iife',
})
await ctx.watch()
```

Dev: `node build.js` (watch) + `npx http-server . -p 8080` in parallel.

---

## Out of scope (v1)

- Audio passthrough from MIDI controller
- Multiple saved songs
- Cloud sync
- Mobile / touch layout
- Drag-and-drop reordering
- MIDI file import/export
- Microtonal / non-12TET analysis
- MIDI channel filtering
- Note velocity display
- Free colour picker for sections
- Dark/light theme toggle
