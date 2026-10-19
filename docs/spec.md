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

Single page, dark or light (see Theme): the bar on top, the rail down the left, then the panels on a grid of 12 columns and rows of 30 px. Each panel has a header with its title, its own buttons and × to hide it; it is moved by dragging the header and resized from its bottom-right corner, and both snap to the grid. The panels it lands on go below it, and every panel then rises as far as it can, so they never overlap and leave no holes (`layout/grid.ts`, tested on its own). Diagrams (staff, circle, strings, piano) scale to fill their panel, so a panel's size is its diagram's size; text panels (analysis, key, history, song) scroll inside it.

Panels: Chord (name, notes, alternatives), Staff, Analysis, Explanation, Circle of fifths, Strings, Key, Piano, Velocity, Progressions, Ear training, Player, Tuner, History, Song. A stored layout with the Fretboard panel of before (now the strings panel's Neck view) drops it.

The ▦ menu in the rail:
- **Layouts:** Standard (every panel, as the page was before panels could move), Study (key and analysis large), Class (the chord and its history across the top, then staff, circle, strings and piano, large, made to be presented with P), Transcription (the player and tuner on top, history and song next to piano and strings), Recording (chord, staff, strings, piano). A preset replaces the current layout
- **Saved:** the current layout saved under a name; opened or deleted from the menu
- **Panels:** a box per panel to show or hide it; a panel shown again goes at the bottom, at its usual size

The current layout is kept as it is left (`layout`), saved ones under `layouts`; a stored layout that cannot be read falls back to Standard, and unknown panels in it are dropped.

**Phone** (720 px wide or less): the same panels in one column, in layout order (top to bottom, left to right); diagrams as tall as their rows, text panels (analysis, explanation, key, progressions, ear training, history, song) as tall as their content, so nothing is cut off; no dragging.

**Touch:** each finger on the on-screen piano holds its own key, so a chord can be pressed with several; on a phone the piano shows two octaves (C3–B4), widened to every note shown. A long press on a history chip removes it, as a right click does; a tap on a song chord shows its buttons, which a mouse gets on hover. No double-tap zoom (the circle sets a key with two taps); buttons, selects and chips are at least 34 px with a coarse pointer, and the corner that resizes a panel is larger.

## Detector

### Bar and rail

**The bar**, left to right (`ui/layout.ts`, wired in `app.ts`):
- **Rail button:** shows or hides the rail. It is kept as left (`rail-open`); a phone starts without it.
- **Key:** the key in use, marked "auto" when it is read from what is played. It opens the key menu: Auto, Major or Minor, and the twelve tonics in the order of the circle of fifths. On Auto the key detected drives the whole app; the choice belongs to the open song (see Song).
- **Field (/):** a chord or an order (`ui/commands.ts`). A chord name, in letters or in solfège (Am7, Lam7), is offered first as "Play …": Enter shows and plays it like a chord picked from history, and an unknown name is marked red. Any other text finds the orders whose name has a word starting with each word typed, without regard to case or accents: a mode, the computer keyboard, the microphone, a key, a layout, showing or hiding a panel, every option of the panels' ⋯ menus, playing the chord, sending it to the song, clearing the history, letting go of a held chord (Esc), presentation, a view window, saving a diagram, Settings and each of its rows (it opens Settings on that row), Help, the guided tour, the rail, an instrument. So whatever has only a key or a gesture can be done by touch too. The arrows move through the list and Enter does the one marked; Esc closes the list, and then leaves the field.
- **Input status:** the device in use, with a dot (green connected, grey none, red disconnected), and the mode. It opens the input menu.
- **Sound status:** the instrument, with a dot for the soundfont (amber waiting for a gesture, green ready, red failed). It opens the sound menu.
- **⚙ (,):** Settings (see Settings). **? :** help: the keys, mouse gestures, what each panel is for, the guided tour.

**The rail**, held in view while the page scrolls: the input menu, the sound menu, ⌨ (M, the computer keyboard as a piano), 🎤 (the microphone), then the page: ▦ (layouts and panels), ⛶ (P, presentation) and ⧉ (view windows and export). With the rail hidden nothing is lost: the bar's statuses open the same menus, and the rest is in the field and the shortcuts. On a phone the rail covers the page from the left and a touch outside closes it.

**Menus** (`ui/popover.ts`): one open at a time, next to the button that opened it (beside the rail, or below the bar); a press outside or Esc closes it. Lists of buttons stand for the selects, which stay hidden as the holders of the values.
- **Input:** the MIDI devices (updated on connect and disconnect; Firefox reports neither, so the list is rescanned every 2 s while the page is visible, and on focus; the device the user picks, or the first one used, is preferred by name and taken back when it reappears, and a fallback used meanwhile does not replace it), the computer keyboard with its octave and velocity, the microphone, and the mode: Normal, Hold, Arpeggio, which apply to every input (controller, computer keyboard, on-screen piano), with what the one chosen does.
- **Sound:** play (▶, same as Space), volume, the soundfont's status, and the instruments by family with a search; the names are the General MIDI ones, in Spanish in the Spanish interface (`i18n/instruments.ts`).

The bar and the rail keep what is touched while playing; setup (MIDI channels and out, language, theme…) is in Settings.

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

The Chord panel, a header across the page in Standard: the chord's name, its notes (pitch class), its degree and its function in the function's colour, the cadence from the chord before ("from G7 · V7 · Authentic"), and the other readings of the same notes as chips. Selecting one (click or `1`–`9`) switches the whole analysis to it. A note or an interval is shown the same way. In a narrow panel the line from the chord before is left out (the cadence stays in Analysis) and the rest goes on two lines.

One colour code for harmony across the app, the function: tonic green, subdominant amber, dominant red; a chord with no function in the key is drawn in a neutral tone. The quality is read in the name.

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
| P/L/R | Neo-Riemannian moves from the previous triad: the shortest chain of UMT's `NeoRiemannian.P / L / R`, up to three (C → Am: R); only between major and minor triads |
| Voices | Voice leading from the previous chord, when its notes are known (played, or a history or song chord captured from MIDI): each voice bass first (`B→C ↑1`, `G =` held, `+ F` enters, `− D` drops out), then the outer voices' motion (parallel, similar, contrary, oblique, held), the semitones moved in all and the notes held. Voices are read in pitch order; with as many notes in both chords the nth goes to the nth; otherwise bass to bass, top to top, and the inner voices pair in order with the least motion (`detector/voice-leading.ts`) |
| Rules | Four-part rules broken from the previous chord, from `Harmony.checkVoiceLeading` (strict) with the key and both chords: parallel fifths and octaves, hidden fifths and octaves in the outer voices, crossing, overlap, wide leaps, a leading tone of V that does not rise to the tonic, a doubled leading tone, a seventh that does not fall by step. Only when both chords have as many notes (UMT pairs voices by position). UMT's false relations are left out: it marks any chromatic neighbour in another voice as possible |
| Upper structures | Upper-structure triads over a dominant (`getUpperStructures`) whose three notes all sound: `II UST (D: 9 #11 13)` |
| Set class | `SetTheory`: Forte number, prime form, interval vector, for any 3 notes or more (`3-11 · [037] · <001110>`) |
| Key detection | `KeyDetection.detect` over the history note pool |

Each field is shown or hidden from the panel's ⋯ menu, which also sets the text size (10–24 px, 13 by default). The panel scrolls when it is taller than its place.

### Explanation

A panel that says, of the chord on screen and in its key, what each term of the analysis means (`detector/explain.ts`): the degree it stands on and its name (tonic … leading tone; subtonic for the whole-step 7th of a minor key; a lowered or raised degree is a note outside the scale), how numerals are written, the function, and then whichever applies: diatonic, a secondary dominant or leading-tone chord with the chord it tonicizes (D7 in C: the dominant of G), borrowed from a named mode with its notes from outside the key, a tritone substitute, or chromatic. Then the figured bass, close / open position and drop voicings, the cadence from the chord before, each P / L / R move with an example, each substitution type UMT offers, upper structures and each voice-leading rule broken. An interval gets its size and its inversion. Nothing is decided here: the sentences come from the same analysis the panel shows. The cadence tags of the history carry the same explanation as a tooltip.


### Progressions

Every named progression of UMT (`PROGRESSIONS`, `getProgression`): ii-V-I and ii-V-i, the jazz turnaround, the backdoor ii-V, rhythm changes, Coltrane changes, the opening of Giant Steps, the 12-bar, minor, jazz and Bird blues, I-V-vi-IV, I-vi-IV-V, I-IV-V, Pachelbel's Canon and the Andalusian cadence (`ui/progressions.ts`). The one picked is written in the analysis key, in the progression's mode (ii-V-i, the minor blues and the Andalusian cadence in the parallel minor of a major key); with no key, in its own (rhythm changes in B♭) or in C major / A minor. It is drawn bar by bar as the history draws its chips: each chord with its numeral and function colour, cadence tags and the key where UMT finds a modulation, all from `analyzeProgression`, with `style: 'blues'` for the 12-bar, jazz and Bird blues (their I7, IV7, V7 are the key's own). A sentence says what the progression is, written by Modus in both languages (UMT's descriptions are English only).

Picked by kind (Jazz, Blues, Pop and classical) and then by name, as buttons. A click on a chord shows and plays it, compared with the one before it in the progression (cadence, voice leading); ▶ walks the whole progression, a bar every 2.4 s, two chords sharing a bar, ■ stops. Showing a chord sets the analysis key to the progression's when it differs, without storing it in the open song. The panel is drawn again when the analysis key changes; the progression picked is remembered (`progression`).

### Microphone and tuner

🎤 in the rail or the input menu, or the Tuner panel's button, turns the microphone on (`input/mic.ts`, `input/pitch.ts`); the browser asks for it the first time. It is read raw (no echo cancelling, noise suppression or gain control, which bend a sung note), every 40 ms, below a level gate as silence. Two modes, remembered (`mic-mode`):
- **Notes:** the one note sung or played, by YIN (de Cheveigné & Kawahara, 2002) over the newest 2048 samples, 50–1600 Hz. A note that holds for three frames (~120 ms) is held in the detector like a key, and let go after five frames (~200 ms) without it; so a melody sung feeds Fits (the scales of the melody) as one played on keys does, and chords played note by note on a guitar are read as an arpeggio is
- **Chords:** every 300 ms while there is sound, the last ~0.7 s (the analyser's 32768 samples) goes to the notes worker (`audio-notes/`: Spotify's Basic Pitch, Apache-2.0, on TensorFlow.js, in a Web Worker built apart as `dist/notes-worker.js`, its model in `vendor/basic-pitch/`, loaded on first use). The notes sounding 0.1 s before the window's end, two or more, are the chord, held until the next reading or a silence, with their real octaves. Under a second behind what is played. On FluidR3 guitar samples it names the chord 92–94 % of the time just after the strum (the chromagram it replaced, 16 %; `pnpm bench:audio`)

Nothing heard is sounded, sent to MIDI out or played back: the microphone would hear it again. Its notes go through the same path as the controller's (mode, history, analysis), with a velocity from their level. The Tuner panel shows the note heard, how many cents off (green within 5, red beyond 15) and its frequency.

### Player

A recording being transcribed, from a local file opened with Open… or dropped on the panel (`ui/player.ts`). It is played by an `<audio>` element, apart from the instrument sound, and is not stored: it stays on the computer and is opened again after a reload. Its waveform (the first channel, decoded once, the loudest sample per pixel column) fills the panel; a click goes to that point, the playhead moves while it plays. Speed 50 %–125 % in steps (− and +) without changing the pitch (`preservesPitch`), remembered (`player-speed`). A sets the loop start where the playhead is, B its end; from B (or the end of the file with no B) it goes back to A; × removes the loop; the loop is drawn on the waveform. ⟲5 goes back 5 seconds, not before A. The time shows tenths, so a loop can be set to a beat. Opened, the recording is read once by the notes worker (the same Basic Pitch as the microphone's chords; its progress next to the name); with Chords on (on by default, remembered: `player-chords`) the notes sounding at the playhead go to the detector as heard notes, never sounded, while it plays, where it jumps to and paused. Off lets them go. The Player's notes and the microphone's are held apart: one stopping does not let go of the other's

### Ear training

The app plays without showing and the user names what was heard (`ui/ear.ts`). Three kinds of question, each with its own score (right / asked, kept in `ear-score`; the kind in `ear-mode`):
- **Intervals:** minor 2nd to octave, from a random note G3–F#4: the two notes one after the other, then together
- **Chords:** major, minor, diminished, augmented, sus4, dominant 7th, major 7th, minor 7th, half-diminished, diminished 7th, on a random root, as UMT spells it
- **Cadences:** authentic (V7 I), plagal (IV I), deceptive (V7 vi), half (IV V) in a random major key: the tonic first so the key is heard, then the two chords. Each chord is kept between G3 and F#4 with its root doubled in the bass, read from UMT's `parseRomanProgression`

New question plays one, ↺ plays it again; answers open only while a question waits. Once answered the panel says right or what it was (and the key, for a cadence), marks the right button and the one picked, and the answer goes to the detector as any chord does: the notes for an interval, the chord for a chord, the last chord compared with the one before it in its key for a cadence (the analysis key is set to it, without storing it in the song).

### Staff, circle and strings

**Staff:** detected notes in ABC notation, rendered by abcjs. Grand staff by default: notes from middle C up on the treble staff, the rest on the bass staff, split by the written letter (B♯3 sounds as C4 and goes below); an empty staff stays blank, nothing at all shows a rest on both. The staves (Grand, Treble or Bass) are chosen in the panel's ⋯ menu, the three in view and the one chosen marked. Key signature from the active key, read from UMT's letter-spelled scale. The drawing is cropped to what abcjs draws and fills its panel. Chord before (in the ⋯ menu here or on the piano, one setting for both) writes the previous chord first, faded and in a bar of its own so its accidentals do not carry, to see each voice move.

**Circle of Fifths:** custom SVG (`diagrams/cof.ts`). Rings: major, minor, diminished. Active key filled; active chord root outlined. Its ⋯ menu: flats or sharps, minor/dim rings, degree labels, seventh labels. The enharmonic segments are spelled by the key in effect (selected, or detected on Auto): sharps for a sharp signature, flats otherwise. b/♯ only apply with no key, and are greyed out while one decides. Click a segment: play and show its chord, key unchanged. Double-click a major or minor segment: set that key. A minor key sits on its relative major's segment with its tonic lit on the minor ring. Degrees are the ones the analysis fields give (`analyzeProgression`), counted from the tonic: F#° in C is ♯iv°.

**Strings:** one panel for any fretted instrument, drawn by notae. Instruments (`theory/instruments.ts`, open strings as MIDI, thickest first): guitar (standard, drop D, open G, open D, DADGAD), 7-string guitar, bass and 5-string bass (standard, drop D), ukulele (standard reentrant G4 C4 E4 A4, low G), baritone ukulele, mandolin, 5-string banjo (open G, the short string first); each with a custom tuning per string, whose octaves are the instrument's usual ones (a ukulele's G stays high). Changing the instrument goes back to its usual tuning. The panel shows the view (Shapes or Neck) on top, the drawing between two arrows, the shapes as dots (a count past 16) and a line saying where the shape is played (open; open strings from fret N; a barre at fret N; from fret N) and on what instrument and tuning. That line opens the ⋯ menu, which holds the instrument, the tuning, the strings (one field each, lowest first, in the note names chosen: typing a note makes a tuning of one's own) and the labels under the strings (nothing, tuning, notes), with Controls to hide the view, arrows, dots and line (as presentation and view windows do). The chord's name is drawn over the shape only when no Chord panel names it. Two views:
- **Shapes:** `UMT.getFretboardVoicings(chord, tuning)` kept only when playable — bass lowest (not asked of a reentrant tuning, which plays chords in any inversion), contiguous strings, four sounding strings (three on a four-string instrument), four-fret span, open strings only in first position — ordered with the open shapes first (the fullest first), then up the neck; the arrows go through them
- **Neck:** every place the sounding notes are over frets 0–12, each dot named (flats or sharps by key); standing in a panel taller than wide, lying in a wide one, and drawn again when the panel changes shape

### Key panel

What the analysis key (selected, or detected on Auto) offers, without playing. Without a key it says how to get one.

| Section | Source |
|---|---|
| Diatonic chords, triads or sevenths | `parseScaleSymbol(key).getDiatonicChords`; degree and function from `analyzeProgression`, the same call as the analysis fields. Listed by degree (VII7); a secondary reading (V7/III) is in the tooltip |
| Negative harmony of each diatonic chord | `Harmony.getNegativeHarmony`, written in the key |
| Parallel modes | `Harmony.getBorrowedChords`: seventh chords of each mode on the tonic that use a note outside the key, grouped by mode, brightest first |
| Coltrane axis | `Harmony.getColtraneAxis`, written in the key |

Its ⋯ menu: text size (12 px by default), triads / sevenths (`7`), show/hide Neg, Par, Colt. A click plays the chord and shows it in the detector like a CoF segment; the key does not change. The chord on screen is outlined in every section where it appears (matched by pitch, so G#7 lights Ab7).

### Piano and velocity

**Piano:** notae, as many octaves as the panel holds at its height, centred on middle C (from two, C3–B4, to seven, C1–B7; two on a phone, see Layout), widened to every note shown; key labels in the note names chosen. Pressing a key plays it through the input path (see Input without a controller); notae tags each key with `data-note`. With Chord before the keys of the previous chord that are not held now are lit in the neutral colour.

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
- Modulations: where UMT finds one (three chords or more in a new key; fewer is a tonicization), a tag `→ G Major` sits next to the first chip in the new key, and from there each chip's numeral and the cadences are read in it (`ChordAnalysis.key`). The numeral is in the chip's tooltip with its key. Harmonic rhythm: each played chord keeps when it started and when it was last released; a line under the strip gives UMT's changes per bar when a tempo is set (History ⋯ menu or Settings: bpm and beats per bar), otherwise the mean seconds per change; each chip says in its tooltip how long it sounded
- Auto-append: a chord held steady for 0.8 s, not twice in a row
- Max 200 entries; oldest dropped
- Click: load in the detector, play, mark active
- Right-click: remove (Undo)
- Drag onto a song measure to insert
- → Song (shown with the Song panel) / `S`: insert the active chip, or the newest, at the song cursor
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
type Song = { schemaVersion: 2; id: string; title: string; key: string | null; updatedAt: number; sections: Section[]; tempo?: number; beatsPerBar?: number }
```

Several songs, each under its own localStorage key `modus-song:<id>`; the index `modus-songs` lists them and holds the open one. Each song keeps its key (`null` = Auto): opening a song restores it, picking a key stores it in the open song. The single schema-1 song of earlier versions (`modus-song`, or the older `harmony-companion-song`) is migrated once as the first song, with the key that was selected (`active-key`); the old keys are left in place. An unreadable song is skipped. Empty chord slots are never persisted. The first time a song with content is saved, the app asks the browser for persistent storage (once ever), so songs and preferences are not evicted under storage pressure: Firefox shows its permission prompt then, Chromium decides silently.

### Chord chip

```
Cmaj7      ← symbol
I △7       ← Roman numeral + quality (recomputed on key change)
```

Its left edge in its function's colour (T green, S amber, D red), as on the history chips; a borrowed numeral in amber. Invalid: red, `?`. No key: `—`. The key the song is read in is the one chosen; on Auto, the one its own chords give (three or more, through `KeyDetection` on their notes), else the history's, so a song shows its numerals with an empty history.

### Layout

The songs as tabs above, in the order they were made (they do not move as songs change; a double click renames, + starts a new song; a tab is never closed: Delete is in ⋯, with Undo). The head: the song's name (edited in place), what it is (key, marked auto when read; bars counting repeats; the form), then + Section (Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro), Paste chords and ⋯ (New song, Transpose up 1–11 semitones, Export or print, Delete the song). With two sections or more a strip above the chart shows the form: a block per section as long as its bars (×N counted), coloured by its section; a click goes to the section, dragging a block reorders the sections, + adds one, and the block of the chord in play (cursor, MIDI fill) is marked. Each section has its name, colour, ×N, duplicate and delete in a margin on the left, quiet until pointed at, and its bars as a chord chart, four to a line (two in a narrow panel), a bar line between them and a double one at its end; the + of a bar shows when it is pointed at (always on a touch screen). A section is written with chips, or as text ("Am F | C G", in letters or Do Re Mi; what is understood shows below as it is typed, Enter keeps it, Esc leaves it): a chord the text keeps in its place keeps its captured voicing. On a phone the margin goes above the chart.

### Interactions

**Chords:** click → load in the detector, play, set cursor. Del removes the selected chord (Undo). Inline edit, parsed by UMT on confirm. Drag within a measure; drag in from history. MIDI fill: ⊙ arms a slot; each chord played fills it and arms the next, across measures and sections, until the song ends or Esc. Duplicate (⧉).

**Measures:** add (+ Bar), delete (× on the bar, when the section has more than one; Undo).

**Sections:** rename, colour, collapse, repeat count (×N), duplicate, reorder by dragging their block in the form strip, delete (Undo), write as text.

**Playing the song** (`song/playback.ts`): ▶ in the head plays it from the chord selected, or from the top: the sections in order, each as many times as its ×N; a bar lasts its beats at the song's tempo and its chords share it equally (as the Progressions panel plays); an empty bar or an invalid chord is a rest. Each chord sounds as long as it lasts, its captured notes when it has them. The chord sounding is outlined in the chart and kept in view, its section marked in the form strip, and shown in the detector read from the chord before it. ■ or Esc stops it; opening another song too. The tempo (40–240 bpm, 100 by default) and the beats per bar (1–12, 4) are the song's own (`tempo`, `beatsPerBar`, unset in songs saved before), shown in the head as ♩ 100 · 4/4 and edited in its menu.

**Song:** song list (most recently changed first; opening one resets the cursor, MIDI fill and any pending Undo), title, New (a new empty song on Auto; the current one stays in the list; nothing happens on an empty untitled song), Delete (Undo; opens the most recent remaining song, or a new one), quick-add templates (Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro), Transpose (⇄, +1 to +11 semitones; with a key set, spelling follows the transposed key; stored voicings move too), Export (⎙, browser print), Paste (`|` separates measures; without bars, one chord per measure).

### Cursor

The active slot is the last chord that received focus. →song and `S` insert after it and advance it. No active slot → append to the last section. ← → walk the whole song.

## Audio

soundfont-player + FluidR3_GM. 128 GM instruments grouped by family.

**States:** idle → loading (progress bar) → suspended (until a click, key or touch anywhere on the page; a MIDI note does not count) → ready; error if the instrument or the soundfont-player script fails to load. Without the script the rest of the app runs, silent.

The instrument starts loading at page load; the first gesture (click, key or touch, anywhere) resumes the AudioContext.

**Volume:** one master gain; the slider also moves notes already sounding.

**Controller notes:** sound with their velocity (gain = velocity / 127) while the key is held, in every input mode; release on note-off. Sustain pedal (CC 64, down at ≥ 64) holds released notes until it lifts. A repeated key retriggers.

**Previews** — history and song chip click, CoF segment click, ← → navigation, Space (current chord, or the last one after the keys are released): fixed duration; a new preview stops the previous one. Controller notes are never cut by a preview. A piano key click plays one note and cuts nothing.

Notes requested before the instrument can sound (still loading, or suspended with no user gesture) are dropped, not queued, and the audio bar flashes.

## View windows and export

For recording and streaming (`view/`, `ui/export.ts`).

**View windows.** The ⧉ menu opens a popup per view: Chord (name in its function's colour, degree and function below), Staff, Circle of Fifths, Piano, Guitar. Each is the same page with `?view=<name>&bg=<green|magenta|black|dark>`: it hides the app, draws only that element filling the window, starts no MIDI and plays nothing. Background green by default (`#00ff00`, OBS's chroma key default), chosen in the menu and remembered. Title `Modus view: <name>`, so OBS Window Capture keeps finding it. Opening a view again brings its window back.

The main window sends what the detector shows over a `BroadcastChannel` (`modus-view`): key, chord, notes, degree, function, guitar voicing. A view that opens asks for the current state. Guitar tuning and CoF options are read from localStorage; when the main window changes them, the views reload. An OBS Browser Source cannot be the view: it is another browser, with no channel to the tab where one plays, and on Windows 10 the controller usually cannot be opened by two programs at once.

**Presentation** (⛶ or P; Esc or P to leave), for teaching and recording: the current layout with no bar, rail, panel headers or controls, its rows stretched so the layout fills the window, full screen when the browser allows it. The Class preset is made for it; any layout can be presented. MIDI, audio and shortcuts keep working; leaving the browser's full screen leaves it too.

**Export.** The same menu saves the staff, circle, guitar or piano on screen as SVG or PNG (3× the screen size), transparent background, cropped to the drawing, named `modus-<diagram>-<chord or key>`. The circle gets the page colour behind its rings (its minor ring is transparent).

## Language

The interface is in English or Spanish: the browser's first language when it is Spanish, otherwise English, and changeable in Settings › General. Note names are a separate choice, letters (C D E) or fixed-do solfège (Do Re Mi): they follow the language until chosen. Changing either reloads the page; the history is carried over, songs and settings are stored anyway.

- Strings: one table per language (`src/i18n/en.ts`, `es.ts`); Spanish has every English key, with the same values filled in (checked by a test)
- Notes and chords in solfège come from UMT: `localizeNoteName` for notes, `formatChordSymbol(…, { roots: 'solfege' })` for chords (root and slash bass: Sibm7/Re). They apply wherever a note or chord is shown: detector, analysis, history, song, key panel, circle and strings labels, velocity, view windows and presentation. Key names are Modus's (C Major / Do mayor / C mayor)
- Chords typed in solfège (chord field, song chords, pasted progressions) are stored in letters, through UMT `translateSymbol` with `SOLFEGE_ROOTS` and `QUALITY_ALIASES_ES`. A name that starts with a syllable reads as solfège first ("Do7" is C7, not D°7); when that is no chord the letters stand ("Fadd9")
- Theory names come from UMT in the interface language: scales and modes (`scaleName`, root as notes are named: "Re dórico"), cadences (`cadenceName`, the short form on the history tags: "Rota"), substitution types (`substitutionTypeName`). With English and Do Re Mi only the root changes ("Sol mixolydian")
- View window titles stay "Modus view: …" in every language: OBS finds the window by its title. A view reloads when the language or the note names change in the main window
- A new song and new sections are named in the interface language (Sin título, Estrofa); after that the name is the user's

## Theme

Dark, light, high contrast (black ground, bright marks, for a projector or a far screen), paper (warm light ground, ink colours), or as the system (the default: dark or light), chosen in Settings › General; the change applies in place, without a reload. With "as the system" the page follows the operating system while it is open.

- Every colour is a token in `src/styles.css`: one block per theme (`:root` is dark, `[data-theme="light"]` and so on), all with the same tokens; a new theme is one more block and its name in `ui/theme.ts` (checked by a test, as is that the rest of the stylesheet writes no colour)
- The page takes the tokens through `var()`. The SVG diagrams (circle, piano, strings) write their colours into the drawing: they read the tokens through `ui/theme.ts` and are drawn again when the theme changes, so exported SVG and PNG carry the theme's colours
- A script in `index.html` sets `<html data-theme>` before the first paint: no flash of the other theme
- Harmony colours (function, sections) keep their hues in every theme: brighter in high contrast, ink tones in paper; labels that would not read on a light ground are darker there. The history chips take the key panel's function colours (T green, S amber, D red)
- View windows stay dark whatever the theme: their light text and dark glow are made for chroma and the dark background. Presentation mode follows the theme
- The song's print view is always black on white

## Customization

Persisted to localStorage:
- Layout: where each panel is and its size, which panels show; saved layouts; whether the Strings panel shows its controls; whether the rail shows (`rail-open`)
- Analysis fields and font scale
- Staff clef; the previous chord shown on staff and piano (`show-prev-chord`)
- CoF b/♯ (without a key), minor/dim rings, degrees, sevenths
- Key panel font scale, triads / sevenths, sections shown
- View window background
- Strings: instrument, tuning (including custom strings), view, label mode
- MIDI device, input channel, input mode, instrument, volume (the key is stored with each song)
- Interface language and note names
- Theme
- The progression picked, the ear-training kind and score, the microphone mode, the player speed
- Whether the guided tour was seen (`tour-done`)

## Help and guided tour

The ? panel (a dialog, scrolling when it is taller than the window) lists the keys as the user has them (with a button to change them in Settings), the keys that never change, the mouse gestures and what each panel is for. Its Guided tour button starts the tour; Settings › General has one too.

The tour (`ui/tour.ts`) runs by itself on the first visit: ten steps, each dimming the page around what it is about (the input device, the key, analysis, explanation, the circle, history, the layout menu, the practice panels, help) with a card that says what it is for; a step whose panel is hidden shows its card in the middle. Next / Back or the arrows move through it, Skip or Esc ends it, and it is not shown again (`tour-done`). It never starts by itself in a browser driven by tests (`navigator.webdriver`), where it would cover the page.

## Settings

⚙ in the bar, or its shortcut (`,`), opens a dialog (`ui/settings.ts`): an index of sections on the left, a search across every section at the top, and per section a "Reset this section". Changes apply at once and are kept; Esc or × closes it, and the focus goes back where it was. On a phone the index goes on top.

- **General:** interface language and note names (both reload the page; history and songs stay), theme (in place), interface size (80–150 %, applied when the slider is let go: rescaling while dragging moves the slider under the pointer), the guided tour
- **Input and output:** input channel (only notes and pedal on that channel are read; a note let in is always let out on its own channel, and a pedal held is released when the filter changes), MIDI out port, output channel, Thru (see MIDI out). The input device and mode are in the input menu
- **Sound:** length of previews (0.5–4 s), the MIDI velocity of the on-screen piano and previews (how loud they sound, and what MIDI out sends)
- **Theory:** chord symbols (Cmaj7 / CΔ7 / CM7, UMT `formatChordSymbol`), the key profile Auto detects with (Krumhansl-Kessler, Temperley-Kostka-Payne, Aarden-Essen, Bellman-Budge, simple; UMT `KEY_PROFILES`), voice-leading rules (strict, contemporary, species: UMT `checkVoiceLeading`), movable do in the explanation of the degree (UMT `Solfege.movableDo`)
- **Detector and history:** how long a chord holds before it is logged (0.8 s), chips kept (200), arpeggio window (1.2 s), the pause that starts a new melody (6 s), the settle time of MIDI fill (250 ms)
- **A panel's preferences** are in its ⋯ menu as well (`ui/pref-menu.ts`): Analysis the voice-leading rules, Explanation movable do, Piano the velocity of its keys, History the hold and the chips kept, Progressions the tempo, Ear training how intervals sound, the chords and cadences it asks and its score back to zero, Tuner A4, sensitivity and response; a change in one place shows in the other at once
- **Panels:** each panel's own on/off buttons (previous chord, circle rings, degrees, sevenths, key panel sections) as boxes that press them
- **Practice:** progression tempo (60–160 bpm), how intervals are played (rising, falling, together), which chord kinds and cadences ear training asks (none ticked asks all), its score back to zero
- **Microphone and tuner:** notes or chords, A4 (415–466 Hz), sensitivity (the silence gate), response (frames a note holds before it counts)
- **Shortcuts:** see Keyboard shortcuts
- **Data:** export the settings, shortcuts and layouts to `modus-settings.json`; import one (it replaces them, after a reload, with Undo); reset them all as they came (with Undo). Songs, history, the ear-training score and whether the tour was seen are never exported nor reset here

Each preference is in one table (`settings/prefs.ts`): its type, range or options and default, stored as `pref-<name>`; a value out of range falls back to the default.

## Keyboard shortcuts

Disabled while typing in a field or with a dropdown focused, and with Ctrl/Cmd/Alt held. Each action takes up to two keys, changed in Settings › Shortcuts (`input/bindings.ts`, stored as `shortcuts`): Change, then the new key (Esc keeps the old one); + adds a second; × removes one; ↺ puts the factory key back. A key another action has asks first, in a card floating under the row (the list does not move): give it (the other loses it) or pick another. Esc, 1–9, Tab and Enter cannot be taken. The factory keys:

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
| `?` | Help |
| `,` | Settings |

## MIDI out

`output/midi-out.ts`. Settings › Input and output picks a Web MIDI output (off by default; remembered by name, and an unplugged one stays chosen and listed as absent), **ch** its channel 1–16.

| Sent | When |
|---|---|
| Previews (chips, CoF, key panel, arrows, Space, typed chord), velocity 90 | always; they cut and end as the internal sound does |
| Clicked piano key | always; cuts nothing |
| Computer keyboard and on-screen piano: note on/off with velocity, sustain (CC 64) | always |
| Controller notes and pedal | only with **Thru** (off by default: a DAW usually hears the controller itself) |

Every note sent is tracked: changing port or channel, turning Thru off and leaving the page release them (pedal up, note-offs, CC 123). An output on the same port the controller is read from sends nothing (it would come back as input) and the selector turns red. The internal sound keeps playing; the volume slider silences it.

## Accessibility

Everything can be used from the keyboard and read by a screen reader (`ui/a11y.ts`):
- **Keyboard:** Tab reaches every control, the circle's segments, the history and song chips and each panel's title; Enter or Space presses them (Enter twice on a circle segment sets its key, as a double click does; Delete on a history chip removes it). On a focused panel title the arrows move the panel a cell and Shift + arrows resize it, said aloud. The app's shortcuts leave Enter and Space to the button that has the focus. The help panel is a dialog: Esc closes it and the focus goes back where it was. Every focused element shows an outline in the theme's cursor colour
- **Screen reader:** a polite live region says what the detector shows once it holds for 350 ms: the chord's long name with its degree and function ("G major, V, Dominant"), a note, an interval. The bar is a toolbar, the rail a navigation region, and the panels a main region; each panel is a section named by its title. Buttons that only carry an icon are named by their tooltip; the menu buttons say whether their menu is open. The staff, piano and strings drawings are images named by what they show ("Staff: C4 E4 G4", "Strings: C x 3 2 0 1 0"); the computer keyboard (M) plays the piano for someone who cannot point

## Offline and installation

Everything the page loads is served with it: UMT, notae, abcjs and soundfont-player in `vendor/`, and the samples of the default instrument (acoustic grand piano, FluidR3_GM). `scripts/vendor.mjs` (`pnpm vendor`) copies them at the versions pinned there; the files are tracked, as `dist/` is. Any other instrument comes from the soundfont's host (`gleitz.github.io`) the first time it is played.

`sw.js` makes it work offline once opened: on install it keeps the page, the build, the libraries, the piano and the icons. Files of the page are taken from the network when there is one (a new build is seen at once) and from that cache without it; a view window is the same page. Instrument samples from the soundfont's host are kept the first time and taken from the cache after, so an instrument played once plays offline. `manifest.webmanifest` and `icons/` make it installable (standalone window, the app's dark background). A script that fails to load shows a banner. The service worker is registered over http(s) only.

## Out of scope

Only what contradicts the principles:

- Cloud sync and accounts
- Analytics and monetization

Everything else that was out of scope in v1 (MIDI files, mobile, light mode, microtonal, channel filtering, velocity display, free section colours) is on the roadmap.
