# Modus

[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

See and understand the harmony of what you play, in real time. Connect a controller, play notes, get instant chord detection and full harmonic analysis — Roman numerals, harmonic function, figured bass, scales, substitutions, and more — and a map of the key: its chords, functions, parallel modes, negative harmony and Coltrane axis.

A chord history and song structure builder extend that — log what you play, build chord sequences, document song structure.

No server. No account. No installation. Open in Chrome, Edge or Firefox and play.

---

## What it's for

- **Studying** theory and harmony
- **Transcribing** songs and seeing the harmony of what you work out
- **Composing:** trying progressions and documenting the structure of a piece
- **Teaching:** explaining concepts and giving examples in class
- **Making videos** and other content about music

For any musician, from learners to teachers and content creators. Modus is in active development towards a complete, universal and didactic app: usable with or without a controller, on any device, in English and Spanish, and beyond Western tonal harmony.

---

## What it does

### Detector — real-time harmonic analysis

Connect a MIDI controller and play, or play without one: the computer keyboard works as a piano (⌨ or `M`: A S D F… white keys, W E T… black, Z/X octave, C/V velocity, Tab sustain), the on-screen piano takes clicks (in Hold, each click adds or removes a note of the chord), and a chord name can be typed (`/`). The app detects what you're playing:

- **1 note:** note name, octave, MIDI number
- **2 notes:** interval name, semitone count
- **3+ notes:** full chord detection with ranked alternatives

For each detected chord:

| Field | Detail |
|---|---|
| Chord name | Top candidate + alternatives (clickable, keys 1–9) |
| Roman numeral | Scale degree in the active key — `Imaj7`, `ii7`, `V7/ii`, `bVII`. Secondary dominants are written `V7/x` |
| Secondary | Degree a secondary dominant tonicizes — `→ ii` |
| Harmonic function | Tonic / Subdominant / Dominant / Unknown |
| Figured bass | e.g. `6/4`, `7` |
| Voicing | Inversion, close or open, drop 2 / drop 3, doubled and missing notes |
| Borrowed chord | Modal interchange — source mode shown |
| Suggested scales | Ordered by fit |
| Substitutions | As UMT proposes them — e.g. tritone, sus4, deceptive |
| Fits | Scales that contain the notes on screen — or a melody played note by note |
| P/L/R | Neo-Riemannian moves from the previous triad |
| Voices | How each voice moves from the previous chord: `B→C ↑1  G =`, outer motion, total motion, notes held |
| Rules | Four-part rules broken: parallel fifths and octaves, hidden ones, crossing, leading tone, seventh |
| Upper structures | The triad on top of a dominant (`II UST` over C7 = D: 9 #11 13) |
| Set class | Forte number, prime form, interval vector |
| Cadence | vs. the previous chord: last different chord played, previous history chip, or previous song chord |
| Key detection | Krumhansl-Schmuckler running on history note pool. With the key on Auto, the detected key drives the whole app: analysis, history and song romans, Circle of Fifths and staff key signature |

Each field can be toggled individually. Font scale adjustable with +/−.

**Input modes:** Normal, Hold (chord stays after release — useful for arpeggios), Arpeggio (accumulates notes until 1.2 s pass with no new one).

### Panels and layouts

Every element is a panel on a grid: drag it by its title, resize it from its corner, hide it with ×; it snaps to the grid and the others make room. Diagrams fill their panel. The ▦ menu has ready-made layouts (Standard, Study, Class, Transcription, Recording), layouts you save under a name, and a box per panel to show or hide it. On a phone the panels stack in one column.

- **Chord** — the name, its notes and the alternative readings; it grows with its panel
- **Staff** (abcjs) — grand staff (treble and bass, split at middle C), or treble or bass alone; key signature follows the active key; ⇠ writes the previous chord before it, faded, to see the voices move (on the piano it lights the previous keys)
- **Analysis** — all harmonic analysis fields, each field individually togglable; font scale +/−
- **Progressions** — every named progression of UMT (ii-V-I, blues, rhythm changes, Coltrane changes, Andalusian cadence…) in the key, bar by bar with numerals and cadences and a sentence on what it is; click a chord to hear and analyse it, ▶ to play the whole progression
- **Microphone and Tuner** — 🎤 hears what is sung or played: one note at a time (a melody, a voice, a wind instrument) goes to the detector and the scales of the melody; chords heard by a model (Spotify's Basic Pitch, in a worker), under a second behind what is played. The tuner shows the note, the cents and the frequency
- **Player** — a recording to transcribe, opened from a file: waveform, click to go anywhere, A–B loop, 50–125 % speed without changing the pitch, back 5 s
- **Ear training** — the app plays an interval, a chord or a cadence without showing it; you name it, it keeps the score and shows the answer on the staff, piano and analysis
- **Explanation** — what each term of the analysis means for the chord on screen: "D7 is V7/V: a secondary dominant, the dominant of G…", the borrowed mode and its foreign notes, the cadence, the inversion, the voice-leading rules broken
- **Circle of Fifths** — click any segment to play and show its chord without changing the key; double-click a major or minor segment to set it as the key. A minor key lights its own tonic on the minor ring. Three rings: major, minor, diminished. Controls: enharmonic (b/♯), ring visibility, degree labels (counted from the tonic, major or minor), 7th labels
- **Strings** (notae) — guitar, 7-string guitar, bass, 5-string bass, ukulele, baritone ukulele, mandolin or banjo, each in its usual tunings or a custom one per string. **Shapes:** out of every fingering UMT finds, only playable ones are kept (chord bass lowest, no muted string in between, four-fret hand, open strings only in first position), ordered from the open shapes up the neck; next/prev to browse. **Neck:** every place the notes sounding are over 12 frets, each dot labelled with its note (flats or sharps by key)

**Key** — a map of the analysis key (selected, or detected on Auto), without playing:

- **Diatonic chords** — triads or sevenths (`7`), each with its degree and function (T / S / D). A chord the analysis reads as a secondary (G7 in A minor: `V7/III`) says so on hover
- **Negative harmony** (`Neg`) — the mirror of each diatonic chord, under it
- **Parallel modes** (`Par`) — seventh chords of each mode on the same tonic that use a note outside the key, lydian to locrian, plus harmonic and melodic minor and harmonic major
- **Coltrane axis** (`Colt`) — the three tonics a major third apart

Click a chord to play it and show it in the detector; the key stays. The chord on screen is outlined wherever it appears. Font scale −/+.

- **Piano** (notae) — 4 octaves C2–B5, click any key to play
- **Velocity** — how hard each note on screen was struck, as a bar and a number

### Views for OBS, and export

The ⧉ button opens a window with one element alone — the chord name with its degree, the staff, the circle of fifths, the piano or the guitar — filling the window on a chroma magenta (or green, black, dark) background, following what you play live. In OBS: Window Capture of "Modus view: chord" (or staff, cof…), then a Chroma Key filter with Magenta as its key colour (green would key out the tonic, drawn in green). The same menu saves the staff, circle, guitar or piano as SVG or PNG with a transparent background.

**Presentation** (⛶ or P) shows the current layout over the whole screen with no controls, for a class or a recording of the screen (the Class layout is made for it); Esc leaves.

### MIDI out

Send what sounds to an external synth or DAW: pick the port (**Out**) and channel. Previews, the computer keyboard and the on-screen piano are sent; the controller's own notes only with **Thru**, since the DAW usually hears it already. Notes are always released when you switch port or leave the page. With loopMIDI, Modus can feed a DAW track directly.

### Audio

Any note played on the MIDI controller sounds through the selected soundfont, with its velocity, for as long as the key or the sustain pedal holds it. Click piano keys, CoF segments, or history/song chips to play. 128 GM instruments selectable (grouped by family). Volume slider. Loading progress bar. The instrument starts loading when the page opens; a note that arrives before it can sound (still loading, or no click yet to unlock audio) makes the progress bar flash.

### History

Every chord is logged automatically after 0.8s of stability. Each chip shows chord name and Roman numeral in the selected key (updates live when the key changes; on Auto, the detected key is used). Between two chips, a tag names the cadence they make — Authentic, Half, Plagal, Deceptive, Phrygian… Click to load it in the detector and play it, drag onto a song measure to insert, right-click to remove. Clear empties the strip at once; both can be undone from the toast that appears.

### Song

A scratchpad and structure builder.

- Several songs saved in the browser, listed by last change; each keeps its own key

- Sections (Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro) with colour coding and repeat counts
- Unlimited chords per measure, unlimited measures per section
- Each chord shows its Roman numeral — borrowed chords highlighted in amber
- Drag to reorder sections and chords; drag history chips directly onto measures
- Click a chord to select and play it
- MIDI fill: arm any chord slot (⊙) and play — each chord fills a slot and the next slot is armed, across measures and sections, until the song ends or Esc
- Transpose entire song in semitone steps (stored voicings move with it)
- Paste a progression as text: `|` marks bar lines (`Dm7 G7 | Cmaj7`); without bars, one chord per measure
- Deleting a chord, measure, section or song happens at once and can be undone
- Export as printable chord chart

---

## Ecosystem

Modus is part of the **[memoriainfinita](https://github.com/memoriainfinita)** open source ecosystem:

- **[UMT](https://github.com/memoriainfinita/UMT)** — Universal Music Theory library. Powers all harmonic analysis in Modus.
- **[notae](https://github.com/memoriainfinita/notae)** — SVG diagram renderer for instruments. Renders piano, guitar, and fretboard diagrams.
- **Modus** — the first integration app. Ships UMT and notae with it (`vendor/`), pinned.

All three projects are independent, GPL-3.0, and built for the music community — not for profit.

---

## Stack

| Layer | Technology |
|---|---|
| App | TypeScript → esbuild → `dist/app.js` |
| Theory | [UMT](https://github.com/memoriainfinita/UMT) v0.12.0, served with the app (`vendor/`) |
| Diagrams | [notae](https://github.com/memoriainfinita/notae), pinned commit, served with the app |
| Staff | abcjs 6.7.1, served with the app |
| MIDI | Web MIDI API (Chrome, Edge, Firefox — Firefox asks for MIDI permission per site) |
| Audio | soundfont-player 0.12.0 + FluidR3_GM: the piano served with the app, other instruments from the soundfont's host on first use |
| Offline | Service worker (`sw.js`) and web manifest: installable, works offline once opened |
| Styles | Plain CSS (`src/styles.css`, bundled by esbuild) |
| Persistence | localStorage |

---

## Requirements

- A browser with Web MIDI: Chrome, Edge or Firefox. Without it the app runs, minus the controller
- A MIDI controller (optional — the computer keyboard, the on-screen piano and the chord field play without one)
- A local server: `pnpm dlx http-server . -p 8080`

---

## Running

```bash
# Serve the built app — no build step needed
pnpm dlx http-server . -p 8080
```

Open `http://localhost:8080` in Chrome or Firefox. Connect your MIDI controller when prompted.

**Settings** (⚙ or `,`): language, note names, theme, interface size, MIDI channels and out, how previews sound, chord symbols (Cmaj7 / CΔ7 / CM7), the key-detection profile, voice-leading rules, movable do, detector timings, practice, microphone and tuner (A4), the shortcuts, and export / import / reset of the settings to a file.

The first visit opens a guided tour of the page; the ? panel lists the keys and gestures, says what each panel is for and starts the tour again.

On a phone or tablet the panels stack in one column and the piano takes several fingers at once; a long press removes a history chip.

Everything works from the keyboard (Tab, Enter, Space; arrows on a panel title move it) and with a screen reader, which hears each chord with its degree and function.

Once opened, the app works offline (a service worker keeps it), and the browser offers to install it as an app. The piano plays offline from the first visit; another instrument plays offline once it has been played online.

**Rebuild from source** (pnpm):

```bash
pnpm install          # dev dependencies only
pnpm dev              # watch mode — rebuilds on save
pnpm build            # one-shot build
pnpm exec tsc --noEmit  # type check (esbuild does not typecheck)
pnpm vendor           # after a version bump: copies the pinned libraries and the piano into vendor/
pnpm test             # unit tests (vitest, against the real UMT bundle)
pnpm test:e2e         # browser walk-through: installed Chrome + fake MIDI input (needs network)
pnpm test:e2e:midi    # real Web MIDI in Chrome and Firefox through loopMIDI ("loopMIDI Port" must exist;
                      # Firefox: pnpm exec playwright-core install firefox)
```

UMT and notae are loaded from jsDelivr, pinned in `index.html`: UMT to a release tag (same as `package.json`), notae to a commit hash. Bump deliberately after a release of either library.

---

## Project structure

```
src/
  app.ts                  entry point — state, detector flow, panels, keyboard actions
  types.ts                shared TypeScript types
  globals.d.ts            declarations of the libraries in vendor/ (globals)
  styles.css              all styles, bundled to dist/app.css
  detector/
    analyzer.ts           chord/interval detection and harmonic analysis
    analysis-panel.ts     harmonic analysis fields rendering
    voice-leading.ts      how each voice moves from the previous chord, and the rules broken
    explain.ts            the Explanation panel: each term of the analysis in words
  theory/
    notes.ts              note names ↔ MIDI numbers
    chord.ts              adapters over UMT chords: family/colour, name normalization, notes
    keys.ts               key names, normalization and key signatures (from UMT spelling)
    voicings.ts           playable voicings on any fretted instrument, tuning names → MIDI
    instruments.ts        fretted instruments and their tunings
    spelling.ts           display spelling in the key, over UMT
    key-map.ts            the key panel's chords: diatonic, negative, parallel modes, Coltrane axis
  diagrams/
    staff.ts              staff (abcjs)
    piano.ts              piano (notae), click to play
    guitar.ts             strings panel: instrument, tuning, shapes or the whole neck (notae)
    cof.ts                circle of fifths (custom SVG)
    key-explorer.ts       key panel rendering
    velocity.ts           velocity bars of the notes on screen
    fretboard-style.ts    colours of the strings panel's two views
  history/
    history.ts            chord history log
  metronome/
    pattern.ts            what a meter, cycle, clave, Euclidean rhythm or polyrhythm plays, from UMT
    engine.ts             clicks on the audio clock, tap tempo, the tempo trainer
    panel.ts              the Metronome panel and its necklace
  song/
    model.ts              song structure: pure operations, transpose
    library.ts            saved songs: one localStorage key per song, index, migration
    view.ts               song structure rendering and interaction
    playback.ts           playing the whole song: its steps in time, and the timer
  view/
    channel.ts            BroadcastChannel to the view windows, view names and backgrounds
    viewer.ts             a view window (?view=): one element filling the window
    presentation.ts       presentation mode: the layout without controls, filling the screen
  output/
    midi-out.ts           MIDI out to a synth or DAW
  audio-notes/
    notes.ts              chords from audio: the page's side of the notes worker, the notes at a time
    worker.ts             Spotify's Basic Pitch in a Web Worker (built apart: dist/notes-worker.js)
    worker-env.ts         lets TensorFlow.js 3.21 run in a worker
  input/
    midi.ts               Web MIDI: device selection, note on/off, sustain, modes; the input path the other inputs share
    bindings.ts           the shortcuts: actions, factory keys, the user's keys
    mic.ts                the microphone: notes (YIN) or chords (Basic Pitch) held in the detector
    pitch.ts              pitch detection: YIN; the old chromagram, kept for the bench
    computer-keyboard.ts  the computer keyboard as a piano (M), by physical key
    shortcuts.ts          keyboard handling; help popup with gestures, language and note names
  audio/
    audio.ts              soundfont-player playback: controller notes, previews, volume
  i18n/
    i18n.ts               interface language, note names (letters or Do Re Mi, from UMT)
    en.ts, es.ts          interface strings, one table per language
    instruments.ts        the soundfont's instruments by name, in English and Spanish
  layout/
    grid.ts               panels on a 12-column grid: snap, push down, close up
    presets.ts            the panels and the ready-made layouts
  ui/
    layout.ts             bar and rail, panels on the grid, dragging and resizing, the ▦ menu
    popover.ts            the menus of the bar and the rail: one open at a time, next to its button
    commands.ts           the bar's field: a chord to play, or an order found by its name
    fit.ts                an SVG scaled to its panel
    progressions.ts       the Progressions panel: UMT's named progressions in the key
    ear.ts                the Ear training panel: intervals, chords, cadences
    player.ts             the Player panel: a recording, its waveform, loop and speed
    tuner.ts              the Tuner panel
    tour.ts               the guided tour of the first visit
    a11y.ts               keyboard and screen reader: live region, names, Enter / Space, long press
    settings.ts           the Settings dialog: sections, search, shortcuts, export / import / reset
    undo.ts               Undo toast for destructive actions
    html.ts               HTML escaping
    storage.ts            localStorage preferences with safe fallbacks
    export.ts             SVG / PNG export of the diagrams
    theme.ts              dark / light / system theme; colour tokens for the SVG diagrams
tests/
  setup-umt.ts        loads the real UMT bundle (pinned devDependency) as the UMT global
  setup-theme.ts      puts the stylesheet in the test document, for the theme tokens
  analyzer.test.ts, chord.test.ts, staff.test.ts, song.test.ts, history.test.ts,
  midi.test.ts, analysis-panel.test.ts, cof.test.ts, voicings.test.ts, audio.test.ts,
  library.test.ts, spelling.test.ts, key-explorer.test.ts, cadences.test.ts, midi-out.test.ts,
  structure.test.ts, i18n.test.ts, theme.test.ts, grid.test.ts, voice-leading.test.ts, piano.test.ts, explain.test.ts, progressions.test.ts, ear.test.ts, player.test.ts, pitch.test.ts, settings.test.ts, commands.test.ts, strings.test.ts
  e2e/smoke.mjs       pnpm test:e2e
  e2e/real-midi.mjs   pnpm test:e2e:midi
  e2e/serve.mjs       static server shared by both
docs/
  spec.md             purpose, design and behaviour
  umt-contract.md     UMT API signatures Modus relies on
```

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play current chord (or last detected if none active) |
| `←` `→` | Previous / next chord: through the song when a song chord is selected (across measures and sections), otherwise through history. Plays each one |
| `Del` | Remove the selected song chord (can be undone) |
| `H` | Toggle hold mode |
| `A` | Toggle arpeggio mode |
| `S` | Send active history chip to song cursor |
| `C` | Clear history (can be undone) |
| `1`–`9` | Select alternative chord interpretation |
| `Esc` | Leave presentation / drop a Hold / Arpeggio chord / cancel MIDI fill / close help / deselect |
| `M` | Computer keyboard as a piano (M or Esc to stop) |
| `P` | Presentation: this layout without controls, full screen (P or Esc to leave) |
| `/` | Type a chord name |
| `?` | Help: keys, mouse gestures, panels, guided tour |
| `,` | Settings |

Every shortcut but Esc and 1–9 can be changed in Settings › Shortcuts, two keys per action.

Shortcuts are disabled while typing in input fields or with a dropdown focused, and never fire with Ctrl/Cmd/Alt held.

---

## License

GPL-3.0. See `LICENSE`. Any software using this must also remain free and open.
