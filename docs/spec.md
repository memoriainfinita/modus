# Modus — Design Spec
_Rev 8 · 2026-10-09_

Purpose, design and behaviour. Stack, build and commands: `README.md`. UMT API contract: `docs/umt-contract.md`. Roadmap: TODO in `state.md`.

## Purpose

See and understand the harmony of what you play, in real time. Modus aims to be a complete, professional, useful, universal and didactic app. No marketing or profit goals.

**Uses**
- Studying theory and harmony
- Transcribing songs: seeing the harmony of what you work out
- Composing: trying progressions, documenting the structure of a piece
- Teaching: explaining concepts and giving examples in class
- Making videos and other content about music

**For whom:** any musician, from learners to teachers and content creators.

**Universal** means all of:
- With or without a MIDI controller; on desktop, phone or tablet
- In English and Spanish
- Accessible by keyboard and screen reader
- Not limited to Western tonal harmony: other systems, modes and tunings

**Didactic:** the app does not only name things (V7/V, borrowed from dorian); it can explain what they mean.

All theory comes from UMT, developed for Modus. What UMT lacks is added to UMT, never worked around in Modus.

## Structure

The core is the **Detector**: input → chord detection → harmonic analysis, shown at once. A chord history and a song builder extend it, to work with progressions over time.

## Design principles

**Information density over decoration.** The app exposes everything UMT can compute. Each field can be shown or hidden. Theory added to UMT reaches Modus through a pin bump.

**Two ways to look.** The full view is for studying; a presentation view (planned) is for teaching and recording: large elements, no controls.

**Neutral functional dark — neobrutalista.** Colour carries meaning only: chord quality, harmonic function, borrowed chords. UI chrome is monochrome: borders, not buttons; no decorative colour, no pill buttons, no gradients. Plain CSS (`styles.css`). Dark today; light mode and colour themes are planned.

**User-configurable.** Every panel can be toggled; sizes and visible fields persist in localStorage.

**Serverless, the data is the user's.** Pure HTML + JS from any static host. No backend, no account; songs live in the browser or in the user's files.

## Browser compatibility

Web MIDI: Chrome, Edge, Firefox (Firefox asks for permission per site). Safari has none.

Without Web MIDI a dismissible warning says a controller cannot connect. Song builder, CoF and history keep working.

## Layout

Single page, dark. Three zones stacked vertically.

```
┌──────────────────────────────────────────────────────────────┐
│  ZONE 1 — Detector (always visible)                          │
│  MIDI status [device ▾] [Normal][Hold][Arpeggio] [Key ▾] auto│
│  [audio status bar] [▶] [Instrument ▾] [Vol ──] [?]          │
│                                                              │
│  Notation  [St][An][CoF][Git]                                │
│  ┌──────────┐ ┌────────────────┐ ┌───────┐ ┌────────────┐   │
│  │  Staff   │ │   Analysis     │ │  CoF  │ │  Guitar    │   │
│  └──────────┘ └────────────────┘ └───────┘ └────────────┘   │
│  Instruments [▼]  [Pi][Fr]                                   │
│  ┌────────────────────────┐ ┌────────────────────────────┐  │
│  │  Piano  (C2–B5)        │ │  Fretboard  (0–12 frets)   │  │
│  └────────────────────────┘ └────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  ZONE 2 — History [▼]                                        │
├──────────────────────────────────────────────────────────────┤
│  ZONE 3 — Song [▼]                                           │
└──────────────────────────────────────────────────────────────┘
```

Zone 1 is the primary module. Instruments, History and Song are collapsible.

## Zone 1 — Detector

### Toolbar

- **MIDI status and device selector:** updates on connect/disconnect; device persisted.
- **Mode buttons:** Normal, Hold, Arpeggio (mutually exclusive).
- **Key selector:** 24 major/minor keys + Auto. On Auto, the detected key is shown next to it and drives the whole app.
- **Audio status bar, play button (▶, same as Space), instrument selector, volume.**
- **? button:** shortcuts and mouse gestures.

### MIDI input

`navigator.requestMIDIAccess()` on load. Denied: non-blocking banner.

| Mode | Behaviour |
|---|---|
| Normal | Chord shown while ≥1 note is held; updates on every note-on/off |
| Hold | Chord stays after all keys are released; the next note-on after a full release starts a new chord |
| Arpeggio | Note-ons accumulate until 1.2 s pass with no new note; then the display clears. Note-off is ignored |

Changing mode drops the notes held by the previous mode.

Pitch spelling of MIDI input: flats (`Bb`, `Eb`, `Ab`, `Db`, `Gb`).

### Detection

| Notes active | Shown |
|---|---|
| 0 (Hold) | Last state kept |
| 0 (Normal) | Panel cleared |
| 1 | Note name + octave + MIDI number |
| 2 | Interval name + semitones + inversion |
| ≥3 | Chord detection via UMT, ranked candidates |

Every source — MIDI, history, song, CoF, arrow keys — goes through the same detector path; analysis and diagrams derive from it.

### Chord summary

Always visible above the staff: chord name with quality colour, note names (pitch class), and alternative readings as chips. Selecting one (click or `1`–`9`) switches the whole analysis to it.

| Quality | Colour |
|---|---|
| Major | amber |
| Minor | blue |
| Dominant | red-orange |
| Diminished / half-diminished | purple |
| Augmented | teal |
| Sus / other | grey |

### Analysis fields

Key reference: the key selector (or the detected key on Auto).

| Field | Source |
|---|---|
| Roman numeral | `analyzeProgression`; secondary dominants written `V7/x` |
| Harmonic function | Tonic / Subdominant / Dominant / Unknown |
| Figured bass | `FiguredBass.fromChord` |
| Diatonic / borrowed | Source mode shown |
| Suggested scales | `Harmony.getSuggestedScales` |
| Substitutions | `getSubstitutions` |
| Cadence | `Harmony.analyzeCadence` against the previous chord |
| Coltrane axis | `Harmony.getColtraneAxis` |
| Negative harmony | `Harmony.getNegativeHarmony` |
| Key detection | `KeyDetection.detect` over the history note pool |

Each field has a show/hide toggle; font scale 8–20 px.

### Notation panel

Four columns, toggled with [St][An][CoF][Git].

**Staff:** detected notes in ABC notation, treble clef, rendered by abcjs. Key signature from the active key, read from UMT's letter-spelled scale. Size −/+.

**Analysis:** the fields above.

**Circle of Fifths:** custom SVG (`diagrams.ts`). Rings: major, minor, diminished. Active key filled; active chord root outlined. Controls: size, b/♯, minor/dim rings, degree labels, seventh labels. Click a segment: play and show its chord, key unchanged. Double-click a major or minor segment: set that key. A minor key sits on its relative major's segment with its tonic lit on the minor ring; degrees count from the tonic.

**Guitar:** `UMT.getFretboardVoicings(chord, tuning)` kept only when playable — bass lowest, contiguous strings, four-fret span, open strings only in first position — ordered along the neck; ‹/› to browse. Tunings: Standard, Drop D, Open G, custom per string. String labels: off / tuning / notes. Fret spacing −/+. Rendered by notae.

### Instruments panel

Toggled with [Pi][Fr].

**Piano:** notae, C2–B5. Click a key to play it (notae tags each key with `data-note`).

**Fretboard:** notae, horizontal, all positions of the active notes over frets 0–12. Spacing −/+.

## Zone 2 — History

```ts
type HistoryEntry = {
  id: string
  symbol: string    // top candidate at capture time
  notes: string[]   // note names that produced it
}
```

Roman numeral and badge are computed on render from `symbol` + current key.

- Horizontal strip of chips
- Auto-append: a chord held steady for 0.8 s, not twice in a row
- Max 200 entries; oldest dropped
- Click: load in the detector, play, mark active
- Right-click: remove (Undo)
- Drag onto a song measure to insert
- →song / `S`: insert the active chip at the song cursor
- Clear / `C`: empty the strip (Undo)
- The note pool feeds key detection

## Zone 3 — Song

Quick scratchpad or full song editor.

```ts
type SongChord = { id: string; symbol: string; notes?: string[]; valid: boolean }
type Measure = { id: string; chords: SongChord[] }
type SectionColor = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'outro' | 'custom'
type Section = {
  id: string; name: string; color: SectionColor
  measures: Measure[]; collapsed: boolean; repeatCount: number
}
type Song = { schemaVersion: 1; title: string; sections: Section[] }
```

Persisted to localStorage under `modus-song` (falls back to the old `harmony-companion-song`). Schema version other than 1 → empty song. Empty chord slots are never persisted.

### Chord chip

```
Cmaj7      ← symbol
I △7       ← Roman numeral + quality (recomputed on key change)
```

In key: standard colour. Borrowed: amber. Invalid: red, `?`. No key: `—`.

### Interactions

**Chords:** click → load in the detector, play, set cursor. Del removes the selected chord (Undo). Inline edit, parsed by UMT on confirm. Drag within a measure; drag in from history. MIDI fill: ⊙ arms a slot; each chord played fills it and arms the next, across measures and sections, until the song ends or Esc. Duplicate (⧉).

**Measures:** add (+ Bar), delete (× when the section has more than one; Undo).

**Sections:** rename, colour, collapse, repeat count (×N), duplicate, reorder by dragging the header, delete (Undo).

**Song:** title, New (Undo), quick-add templates (Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro), Transpose (⇄, +1 to +11 semitones; with a key set, spelling follows the transposed key; stored voicings move too), Export (⎙, browser print), Paste (`|` separates measures; without bars, one chord per measure).

### Cursor

The active slot is the last chord that received focus. →song and `S` insert after it and advance it. No active slot → append to the last section. ← → walk the whole song.

## Audio

soundfont-player + FluidR3_GM. 128 GM instruments grouped by family.

**States:** idle → loading (progress bar) → suspended (click to activate) → ready; error if the instrument or the soundfont-player script fails to load. Without the script the rest of the app runs, silent.

The instrument starts loading at page load; the first click resumes the AudioContext.

**Volume:** one master gain; the slider also moves notes already sounding.

**Controller notes:** sound with their velocity (gain = velocity / 127) while the key is held, in every input mode; release on note-off. Sustain pedal (CC 64, down at ≥ 64) holds released notes until it lifts. A repeated key retriggers.

**Previews** — history and song chip click, CoF segment click, ← → navigation, Space (current chord, or the last one after the keys are released): fixed duration; a new preview stops the previous one. Controller notes are never cut by a preview. A piano key click plays one note and cuts nothing.

Notes requested before the instrument can sound (still loading, or suspended with no user gesture) are dropped, not queued, and the audio bar flashes.

## Customization

Persisted to localStorage:
- Panels: notation columns, instruments sub-panels, history, song, control rows
- Analysis fields and font scale
- Staff size
- CoF size, b/♯, minor/dim rings, degrees, sevenths
- Guitar tuning (including custom strings), label mode, fret spacing
- Fretboard spacing
- Key, MIDI device, input mode, instrument, volume

## Keyboard shortcuts

Disabled while typing in a field or with a dropdown focused, and with Ctrl/Cmd/Alt held.

| Key | Action |
|---|---|
| `Space` | Play current chord (or the last one) |
| `←` `→` | Previous / next chord: song when a song chord is selected, else history; plays it |
| `Del` / `Backspace` | Remove the selected song chord (Undo) |
| `H` | Toggle Hold |
| `A` | Toggle Arpeggio |
| `S` | Send the active history chip to the song cursor |
| `C` | Clear history (Undo) |
| `1`–`9` | Select the Nth alternative reading |
| `Esc` | Close help; otherwise stop MIDI fill and clear the cursor |
| `?` | Toggle shortcuts and gestures help |

## Out of scope

Only what contradicts the principles:

- Cloud sync and accounts
- Analytics and monetization

Everything else that was out of scope in v1 (several songs, MIDI files, mobile, light mode, microtonal, channel filtering, velocity display, free section colours) is on the roadmap.
