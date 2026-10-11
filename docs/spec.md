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

The core is the **Detector**: input → chord detection → harmonic analysis, shown at once. A chord history extends it over time. The song builder is kept as it is (frozen since 2026-10-10): new work goes to the detector and the analysis.

## Design principles

**Information density over decoration.** The app exposes everything UMT can compute. Each field can be shown or hidden. Theory added to UMT reaches Modus through a pin bump.

**Two ways to look.** The full view is for studying; presentation (P) is for teaching and recording: the layout with no controls, filling the screen.

**Neutral functional dark — neobrutalista.** Colour carries meaning only: chord quality, harmonic function, borrowed chords. UI chrome is monochrome: borders, not buttons; no decorative colour, no pill buttons, no gradients. Plain CSS (`src/styles.css`). Dark and light themes and two colour themes (see Theme).

**User-configurable.** Every panel can be moved, resized and hidden on the layout grid; layouts, visible fields and options persist in localStorage.

**Serverless, the data is the user's.** Pure HTML + JS from any static host. No backend, no account; songs live in the browser or in the user's files.

## Browser compatibility

Web MIDI: Chrome, Edge, Firefox (Firefox asks for permission per site). Safari has none.

Without Web MIDI a dismissible warning says a controller cannot connect. Song builder, CoF and history keep working.

## Layout

Single page, dark or light (see Theme): the toolbar on top, then the panels on a grid of 12 columns and rows of 30 px. Each panel has a header with its title, its own buttons and × to hide it; it is moved by dragging the header and resized from its bottom-right corner, and both snap to the grid. The panels it lands on go below it, and every panel then rises as far as it can, so they never overlap and leave no holes (`layout/grid.ts`, tested on its own). Diagrams (staff, circle, strings, piano) scale to fill their panel, so a panel's size is its diagram's size; text panels (analysis, key, history, song) scroll inside it.

Panels: Chord (name, notes, alternatives), Staff, Analysis, Circle of fifths, Strings, Key, Piano, Velocity, History, Song. A stored layout with the Fretboard panel of before (now the strings panel's Neck view) drops it.

The ▦ menu in the toolbar:
- **Layouts:** Standard (every panel, as the page was before panels could move), Study (key and analysis large), Class (few panels, large, made to be presented with P), Transcription (history and song next to piano and strings), Recording (chord, staff, strings, piano). A preset replaces the current layout
- **Saved:** the current layout saved under a name; opened or deleted from the menu
- **Panels:** a box per panel to show or hide it; a panel shown again goes at the bottom, at its usual size

The current layout is kept as it is left (`layout`), saved ones under `layouts`; a stored layout that cannot be read falls back to Standard, and unknown panels in it are dropped.

**Phone** (720 px wide or less): the same panels in one column, in layout order (top to bottom, left to right), each as tall as its rows; no dragging.

## Detector

### Toolbar

- **MIDI status and device selector:** updates on connect/disconnect (Firefox reports neither: the list is rescanned every 2 s while the page is visible, and on focus). The device the user picks, or the first one used, is preferred by name and taken back when it reappears; a fallback used meanwhile does not replace it. Connected shows as a green "MIDI" (the full status in its tooltip).
- **Input channel (in: all ch / in: ch N):** only notes and pedal on that channel are read, for a keyboard split or one DAW track. A note let in is always let out on its own channel, and a pedal held down is released when the filter changes, so changing it leaves nothing hanging. Remembered.
- **MIDI out (Out ▾, ch, Thru):** see MIDI out.
- **Mode buttons:** Normal, Hold, Arpeggio (mutually exclusive). They apply to every input: controller, computer keyboard and on-screen piano.
- **⌨ (M):** the computer keyboard as a piano; octave and velocity shown next to it.
- **Chord field (/):** type a chord name, in letters or in solfège (Am7, Lam7), Enter shows and plays it like a chord picked from history; an unknown name is marked red.
- **Key selector:** 24 major/minor keys + Auto. On Auto, the detected key is shown next to it and drives the whole app. The choice belongs to the open song (see Song).
- **Audio status bar, play button (▶, same as Space), instrument selector, volume.**
- **⛶ button (P):** presentation mode (see View windows and export).
- **⧉ button:** view windows for OBS and diagram export (see View windows and export).
- **? button:** shortcuts, mouse gestures, interface language and note names (see Language).

### MIDI input

`navigator.requestMIDIAccess()` on load. Denied: non-blocking banner.

| Mode | Behaviour |
|---|---|
| Normal | Chord shown while ≥1 note is held; updates on every note-on/off |
| Hold | Chord stays after all keys are released; the next note-on after a full release starts a new chord |
| Arpeggio | Note-ons accumulate until 1.2 s pass with no new note; then the display clears. Note-off is ignored |

Changing mode drops the notes held by the previous mode. Esc drops the notes Hold or Arpeggio keep.

### Input without a controller

Both go through the same path as MIDI: modes, sound, spelling in the key, history, MIDI fill.

**Computer keyboard** (⌨ or M; M or Esc to stop), laid out like Ableton Live's and Logic's: home row A S D F G H J K L Ñ ' = white keys from C, W E · T Y U · O P = black keys; Z / X octave down / up (C1–C7), C / V velocity −/+20 (default C4, velocity 100); Tab = sustain pedal. Keys are read by physical position (`event.code`), so any keyboard language works. While on, the keys it uses never reach the shortcuts. Each key sounds while held; leaving the window releases everything. Laptop keyboards may not register more than two or three keys at once: Arpeggio builds bigger chords.

**On-screen piano:** press a key to play it (velocity 90). Normal and Arpeggio: like a controller key, it sounds while pressed. Hold: each click adds the note to the chord and a second click takes it out, so a chord is built note by note with the mouse; a controller phrase replaces it.

**Spelling.** MIDI has no spelling of its own: with a key (selected, or detected on Auto) everything the controller plays is written in that key, through UMT (`spellPitchInKey`, `spellChordInKey`, `spellChord`): chord names and readings, notes, the single note, intervals, the staff and the diagrams. G#m in E major, Abm in C minor. Key notes take the key's letters; chromatic notes follow the harmonic chromatic scale without needless double accidentals; chord tones are named by interval (Cm7b5: Gb). A key change rewrites what is on screen. A chord picked from history, song or CoF keeps the spelling it was given, and its notes are named by interval. History chips are shown in the current key. Without a key, MIDI input stays in flats.

### Detection

| Notes active | Shown |
|---|---|
| 0 (Hold) | Last state kept |
| 0 (Normal) | Panel cleared |
| 1 | Note name + octave + MIDI number |
| 2 | Interval name + semitones + inversion |
| ≥3 | Chord detection via UMT `detectChordsScored`, best reading first; readings may leave out the fifth, so shells (G B F → G7) are named |

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
| Voicing | `analyzeVoicing` on the notes played: inversion, close / open, drop 2 / 3, doubled, missing (`no 5`) and added notes |
| Diatonic / borrowed | Source mode shown |
| Suggested scales | `Harmony.getSuggestedScales` |
| Fits | `findScalesForNotes`: scales holding every note on screen, the key's tonic first, fewest added notes first; the chromatic scale left out. For single notes and intervals, the melody played note by note: the pitch classes struck since the last chord, Esc or a pause over 6 s, shown in brackets |
| Substitutions | `getSubstitutions` |
| Cadence | `Harmony.analyzeCadence` against the previous chord |
| P/L/R | Neo-Riemannian moves from the previous triad: the shortest chain of UMT's `NeoRiemannian.P / L / R`, up to three (C → Am: R) |
| Voices | Voice leading from the previous chord, when its notes are known (played, or a history or song chord captured from MIDI): each voice bass first (`B→C ↑1`, `G =` held, `+ F` enters, `− D` drops out), then the outer voices' motion (parallel, similar, contrary, oblique, held), the semitones moved in all and the notes held. Voices are read in pitch order; with as many notes in both chords the nth goes to the nth; otherwise bass to bass, top to top, and the inner voices pair in order with the least motion (`detector/voice-leading.ts`) |
| Rules | Four-part rules broken from the previous chord, from `Harmony.checkVoiceLeading` (strict) with the key and both chords: parallel fifths and octaves, hidden fifths and octaves in the outer voices, crossing, overlap, wide leaps, a leading tone of V that does not rise to the tonic, a doubled leading tone, a seventh that does not fall by step. Only when both chords have as many notes (UMT pairs voices by position). UMT's false relations are left out: it marks any chromatic neighbour in another voice as possible |
| Upper structures | Upper-structure triads over a dominant (`getUpperStructures`) whose three notes all sound: `II UST (D: 9 #11 13)` |
| Set class | `SetTheory`: Forte number, prime form, interval vector, for any 3 notes or more (`3-11 · [037] · <001110>`) |
| Key detection | `KeyDetection.detect` over the history note pool |

Each field has a show/hide toggle; font scale 8–20 px. The panel grows when a value wraps.

### Staff, circle and strings

**Staff:** detected notes in ABC notation, rendered by abcjs. Grand staff by default: notes from middle C up on the treble staff, the rest on the bass staff, split by the written letter (B♯3 sounds as C4 and goes below); an empty staff stays blank, nothing at all shows a rest on both. The clef button cycles Grand / Treble / Bass. Key signature from the active key, read from UMT's letter-spelled scale. The drawing is cropped to what abcjs draws and fills its panel. ⇠ (here or on the piano, one setting for both) writes the previous chord first, faded and in a bar of its own so its accidentals do not carry, to see each voice move.

**Circle of Fifths:** custom SVG (`diagrams/cof.ts`). Rings: major, minor, diminished. Active key filled; active chord root outlined. Controls: b/♯, minor/dim rings, degree labels, seventh labels. The enharmonic segments are spelled by the key in effect (selected, or detected on Auto): sharps for a sharp signature, flats otherwise. b/♯ only apply with no key, and are greyed out while one decides. Click a segment: play and show its chord, key unchanged. Double-click a major or minor segment: set that key. A minor key sits on its relative major's segment with its tonic lit on the minor ring. Degrees are the ones the analysis fields give (`analyzeProgression`), counted from the tonic: F#° in C is ♯iv°.

**Strings:** one panel for any fretted instrument, drawn by notae. Instruments (`theory/instruments.ts`, open strings as MIDI, thickest first): guitar (standard, drop D, open G, open D, DADGAD), 7-string guitar, bass and 5-string bass (standard, drop D), ukulele (standard reentrant G4 C4 E4 A4, low G), baritone ukulele, mandolin, 5-string banjo (open G, the short string first); each with a custom tuning per string, whose octaves are the instrument's usual ones (a ukulele's G stays high). Changing the instrument goes back to its usual tuning. Two views:
- **Shapes:** `UMT.getFretboardVoicings(chord, tuning)` kept only when playable — bass lowest (not asked of a reentrant tuning, which plays chords in any inversion), contiguous strings, four sounding strings (three on a four-string instrument), four-fret span, open strings only in first position — ordered with the open shapes first (the fullest first), then up the neck; ‹/› to browse. String labels: off / tuning / notes
- **Neck:** horizontal, every place the sounding notes are over frets 0–12, each dot named (flats or sharps by key)

### Key panel

What the analysis key (selected, or detected on Auto) offers, without playing. Without a key it says how to get one.

| Section | Source |
|---|---|
| Diatonic chords, triads or sevenths | `parseScaleSymbol(key).getDiatonicChords`; degree and function from `analyzeProgression`, the same call as the analysis fields. Listed by degree (VII7); a secondary reading (V7/III) is in the tooltip |
| Negative harmony of each diatonic chord | `Harmony.getNegativeHarmony`, written in the key |
| Parallel modes | `Harmony.getBorrowedChords`: seventh chords of each mode on the tonic that use a note outside the key, grouped by mode, brightest first |
| Coltrane axis | `Harmony.getColtraneAxis`, written in the key |

Controls: font scale, triads / sevenths (`7`), show/hide Neg, Par, Colt. A click plays the chord and shows it in the detector like a CoF segment; the key does not change. The chord on screen is outlined in every section where it appears (matched by pitch, so G#7 lights Ab7).

### Piano and velocity

**Piano:** notae, C2–B5. Pressing a key plays it through the input path (see Input without a controller); notae tags each key with `data-note`. With ⇠ the keys of the previous chord that are not held now are lit in the neutral colour.

**Velocity:** one bar per note on screen, highest on top, with the MIDI velocity (1–127) it was struck with on any input. Kept after release, so Hold still shows it. A chord picked from history, song or circle has none and shows nothing. No dynamic marks (p, mf…): there is no standard mapping from velocity.


## History

```ts
type HistoryEntry = {
  id: string
  symbol: string    // top candidate at capture time
  notes: string[]   // note names that produced it
}
```

Roman numeral and badge are computed on render from `symbol` + current key.

- Horizontal strip of chips, newest on the left
- Cadences: with a key, a tag between two chips names the cadence from the older to the newer (`analyzeProgression` → `cadenceWithNext`, i.e. `analyzeCadence`): Authentic, Half, Plagal, Deceptive, Phrygian… Full name and chords in the tooltip.
- Modulations: where UMT finds one (three chords or more in a new key; fewer is a tonicization), a tag `→ G Major` sits next to the first chip in the new key, and from there each chip's numeral and the cadences are read in it (`ChordAnalysis.key`). The numeral is in the chip's tooltip with its key. Harmonic rhythm is not shown: the history has no timing
- Auto-append: a chord held steady for 0.8 s, not twice in a row
- Max 200 entries; oldest dropped
- Click: load in the detector, play, mark active
- Right-click: remove (Undo)
- Drag onto a song measure to insert
- →song / `S`: insert the active chip at the song cursor
- Clear / `C`: empty the strip (Undo)
- The note pool feeds key detection

## Song

Quick scratchpad or full song editor.

```ts
type SongChord = { id: string; symbol: string; notes?: string[]; valid: boolean }
type Measure = { id: string; chords: SongChord[] }
type SectionColor = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'outro' | 'custom'
type Section = {
  id: string; name: string; color: SectionColor
  measures: Measure[]; collapsed: boolean; repeatCount: number
}
type Song = { schemaVersion: 2; id: string; title: string; key: string | null; updatedAt: number; sections: Section[] }
```

Several songs, each under its own localStorage key `modus-song:<id>`; the index `modus-songs` lists them and holds the open one. Each song keeps its key (`null` = Auto): opening a song restores it, picking a key stores it in the open song. The single schema-1 song of earlier versions (`modus-song`, or the older `harmony-companion-song`) is migrated once as the first song, with the key that was selected (`active-key`); the old keys are left in place. An unreadable song is skipped. Empty chord slots are never persisted. The first time a song with content is saved, the app asks the browser for persistent storage (once ever), so songs and preferences are not evicted under storage pressure: Firefox shows its permission prompt then, Chromium decides silently.

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

**Song:** song list (most recently changed first; opening one resets the cursor, MIDI fill and any pending Undo), title, New (a new empty song on Auto; the current one stays in the list; nothing happens on an empty untitled song), Delete (Undo; opens the most recent remaining song, or a new one), quick-add templates (Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro), Transpose (⇄, +1 to +11 semitones; with a key set, spelling follows the transposed key; stored voicings move too), Export (⎙, browser print), Paste (`|` separates measures; without bars, one chord per measure).

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

## View windows and export

For recording and streaming (`view/`, `ui/export.ts`).

**View windows.** The ⧉ menu opens a popup per view: Chord (name in its quality colour, degree and function below), Staff, Circle of Fifths, Piano, Guitar. Each is the same page with `?view=<name>&bg=<green|magenta|black|dark>`: it hides the app, draws only that element filling the window, starts no MIDI and plays nothing. Background green by default (`#00ff00`, OBS's chroma key default), chosen in the menu and remembered. Title `Modus view: <name>`, so OBS Window Capture keeps finding it. Opening a view again brings its window back.

The main window sends what the detector shows over a `BroadcastChannel` (`modus-view`): key, chord, notes, degree, function, guitar voicing. A view that opens asks for the current state. Guitar tuning and CoF options are read from localStorage; when the main window changes them, the views reload. An OBS Browser Source cannot be the view: it is another browser, with no channel to the tab where one plays, and on Windows 10 the controller usually cannot be opened by two programs at once.

**Presentation** (⛶ or P; Esc or P to leave), for teaching and recording: the current layout with no toolbar, panel headers or controls, its rows stretched so the layout fills the window, full screen when the browser allows it. The Class preset is made for it; any layout can be presented. MIDI, audio and shortcuts keep working; leaving the browser's full screen leaves it too.

**Export.** The same menu saves the staff, circle, guitar or piano on screen as SVG or PNG (3× the screen size), transparent background, cropped to the drawing, named `modus-<diagram>-<chord or key>`. The circle gets the page colour behind its rings (its minor ring is transparent).

## Language

The interface is in English or Spanish: the browser's first language when it is Spanish, otherwise English, and changeable in the ? panel. Note names are a separate choice, letters (C D E) or fixed-do solfège (Do Re Mi): they follow the language until chosen. Changing either reloads the page; the history is carried over, songs and settings are stored anyway.

- Strings: one table per language (`src/i18n/en.ts`, `es.ts`); Spanish has every English key, with the same values filled in (checked by a test)
- Notes and chords in solfège come from UMT: `localizeNoteName` for notes, `formatChordSymbol(…, { roots: 'solfege' })` for chords (root and slash bass: Sibm7/Re). They apply wherever a note or chord is shown: detector, analysis, history, song, key panel, circle and strings labels, velocity, view windows and presentation. Key names are Modus's (C Major / Do mayor / C mayor)
- Chords typed in solfège (chord field, song chords, pasted progressions) are stored in letters, through UMT `translateSymbol` with `SOLFEGE_ROOTS` and `QUALITY_ALIASES_ES`. A name that starts with a syllable reads as solfège first ("Do7" is C7, not D°7); when that is no chord the letters stand ("Fadd9")
- Theory names come from UMT in the interface language: scales and modes (`scaleName`, root as notes are named: "Re dórico"), cadences (`cadenceName`, the short form on the history tags: "Rota"), substitution types (`substitutionTypeName`). With English and Do Re Mi only the root changes ("Sol mixolydian")
- View window titles stay "Modus view: …" in every language: OBS finds the window by its title. A view reloads when the language or the note names change in the main window
- A new song and new sections are named in the interface language (Sin título, Estrofa); after that the name is the user's

## Theme

Dark, light, high contrast (black ground, bright marks, for a projector or a far screen), paper (warm light ground, ink colours), or as the system (the default: dark or light), chosen in the ? panel; the change applies in place, without a reload. With "as the system" the page follows the operating system while it is open.

- Every colour is a token in `src/styles.css`: one block per theme (`:root` is dark, `[data-theme="light"]` and so on), all with the same tokens; a new theme is one more block and its name in `ui/theme.ts` (checked by a test, as is that the rest of the stylesheet writes no colour)
- The page takes the tokens through `var()`. The SVG diagrams (circle, piano, strings) write their colours into the drawing: they read the tokens through `ui/theme.ts` and are drawn again when the theme changes, so exported SVG and PNG carry the theme's colours
- A script in `index.html` sets `<html data-theme>` before the first paint: no flash of the other theme
- Harmony colours (chord quality, function, sections) keep their hues in every theme: brighter in high contrast, ink tones in paper; labels that would not read on a light ground are darker there. The history chips take the key panel's function colours (T green, S amber, D red)
- View windows stay dark whatever the theme: their light text and dark glow are made for chroma and the dark background. Presentation mode follows the theme
- The song's print view is always black on white

## Customization

Persisted to localStorage:
- Layout: where each panel is and its size, which panels show; saved layouts; control rows shown under the circle, guitar and analysis
- Analysis fields and font scale
- Staff clef; the previous chord shown on staff and piano (`show-prev-chord`)
- CoF b/♯ (without a key), minor/dim rings, degrees, sevenths
- Key panel font scale, triads / sevenths, sections shown
- View window background
- Strings: instrument, tuning (including custom strings), view, label mode
- MIDI device, input channel, input mode, instrument, volume (the key is stored with each song)
- Interface language and note names
- Theme

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
| `Esc` | Close help or leave presentation; otherwise drop a Hold / Arpeggio chord, stop MIDI fill and clear the cursor |
| `M` | Computer keyboard as a piano (M or Esc to stop) |
| `P` | Presentation mode (P or Esc to leave) |
| `/` | Type a chord name |
| `?` | Toggle shortcuts and gestures help |

## MIDI out

`output/midi-out.ts`. **Out ▾** picks a Web MIDI output (off by default; remembered by name, and an unplugged one stays chosen and listed as absent), **ch** its channel 1–16.

| Sent | When |
|---|---|
| Previews (chips, CoF, key panel, arrows, Space, typed chord), velocity 90 | always; they cut and end as the internal sound does |
| Clicked piano key | always; cuts nothing |
| Computer keyboard and on-screen piano: note on/off with velocity, sustain (CC 64) | always |
| Controller notes and pedal | only with **Thru** (off by default: a DAW usually hears the controller itself) |

Every note sent is tracked: changing port or channel, turning Thru off and leaving the page release them (pedal up, note-offs, CC 123). An output on the same port the controller is read from sends nothing (it would come back as input) and the selector turns red. The internal sound keeps playing; the volume slider silences it.

## Out of scope

Only what contradicts the principles:

- Cloud sync and accounts
- Analytics and monetization

Everything else that was out of scope in v1 (MIDI files, mobile, light mode, microtonal, channel filtering, velocity display, free section colours) is on the roadmap.
