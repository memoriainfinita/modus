# Modus — history

What left `state.md`. Most recent first.

### 2026-11-21 — The closed roadmap leaves state.md

The numbered roadmap of 2026-10 and the project review of 2026-11-10 moved here as they stood, every item built; what is still open went to the TODO of `state.md`. Two things the review had left unsaid: item 10 of "Rest of the app" (microphone) was marked [~] and nothing in it is open (its "Later" items belong to the Player and are in the open list); the review's steps 1, 2, 3 and 5 are done or moved into "Closing" (scope decided 2026-11-21: non-Western and microtonal systems left open, with README and spec saying so; the rest of the open items stay open).

### Analysis, in order (2026-10-10)

1. [x] Voicing analysis, 2026-10-11: Voicing field from UMT `analyzeVoicing`; chords detected with `detectChordsScored`, so shells are named
2. [x] Scales that fit, 2026-10-11: Fits field from `findScalesForNotes`, on the notes on screen or the melody played note by note. With the microphone (later) it will also hear sung or played lines
3. [x] What UMT computes and Modus did not, 2026-10-11: upper structures sounding over a dominant, neo-Riemannian P/L/R from the previous triad, set class (Forte, prime form, interval vector). 2026-10-19: Slash field (UMT `analyzeSlash`, on the notes played, the symbol when they are not known): a chord over a foreign bass as upper structure, polychord or hybrid, with its tensions ("D over C · upper structure · 9 #11 13"), explained in the Explanation panel; inversions give nothing
4. [x] Key and scale explorer. Done 2026-10-10: Key panel on the analysis key, with diatonic chords, functions, negative harmony, parallel-mode chords and the Coltrane axis (moved out of the per-chord panel). 2026-10-11: parallel modes in triads too, characteristic chords in bold; in minor, harmonic minor's V(7) and vii°(7) under v and VII. 2026-10-21, with UMT 0.9 and 0.10: church modes as keys (key menu, signature, circle, `theory/keys.ts`), Auto finds modes (Settings › Theory, on by default), Usual borrowings only in the key panel's ⋯ menu (UMT `common`; none in a mode)
5. [x] Next-chord suggestions, 2026-10-19: Next panel (`detector/next.ts`), in Study and Class, not in Standard. Each chord once, with every reason: where the chord resolves (a secondary to its target), the cadence it makes with each of the key's chords (UMT `analyzeCadence`), the named progressions it follows the current chord in (only those written in the key's mode, a two-chord match first). A click plays it and shows it after the chord it follows. Released, the panel keeps the last chord played. No rule of function flow (S to D): that would be theory decided in Modus
6. [x] Progression analysis over the history. Done: cadence tags between chips (2026-10-10); modulations marked where the key changes, with numerals and cadences after it in the new key (2026-10-11). Harmonic rhythm, 2026-10-19 (`history/rhythm.ts`): each played chord keeps when it started and when it was last released (a chord held into the next lasts until it, a silence does not count); a line under the history gives the changes per bar from UMT (`analyzeProgression` with durations in beats) when a tempo is set in the History ⋯ menu or Settings (bpm and beats per bar, no tempo by default), otherwise the mean seconds per change; also in the chip tooltips and the Explanation panel. Chords picked by click have no time. The metronome, when it exists, will give the tempo
7. [x] Views for OBS and export, 2026-10-10. View windows (popups synced by BroadcastChannel) on a chroma background for Window Capture: not a Browser Source, which is another browser and cannot reach the playing tab. SVG / PNG export of staff, circle, guitar, piano. Checked headless in Chrome and Firefox; checked in OBS by the user 2026-10-26: the strings view was blank (its CSS showed only the first child, the tabs since the strings redesign; fixed) and the tonic's green was keyed out of the green chroma, so views open on magenta by default (OBS's key colour Magenta, similarity 400 or less: the dominant's red is 0.485 from magenta in CbCr); both fixes checked by the user in OBS the same day
8. [x] MIDI output, 2026-10-10: Out port and channel in the toolbar; previews and virtual inputs always, controller only with Thru; loop guard; notes released on any change. 2026-10-27: heard in REAPER by the user through a second loopMIDI port ("loopMIDI Modus Out", input left on "loopMIDI Port"), circle clicks from Firefox; with that port `pnpm test:e2e:midi` runs its MIDI out check (12/12). Browsers do not offer Microsoft GS Wavetable Synth to the page. Not yet: Thru with a controller

### Rest of the app, in order (2026-10-11)

Ordered by what each one makes cheaper or depends on: strings, colours and the modular layout before more UI is written, didactic text after the interface speaks Spanish, help last because it describes the finished UI.

1. [x] Interface in English and Spanish, 2026-10-11: one string table per language (`src/i18n`), the browser's language or the one picked in Settings; note names in letters or fixed-do solfège from UMT, chords typed in either; scale, cadence and substitution names from UMT v0.5.0. Every later item writes its text in both tables. Movable do: in the explanations since 2026-10-12 (Settings › Theory); it never showed with UMT 0.7.1, which refuses the key in lower case, fixed 2026-10-20 with a test
2. [x] Colours as theme tokens, 2026-10-11: every colour a token in `styles.css`, one block per theme, the SVG diagrams read them through `ui/theme.ts`; dark, light, high contrast, paper, or as the system, in the ? panel, in place. View windows stay dark
3. [x] Modular layout, 2026-10-11: eleven panels on a 12-column grid (`layout/grid.ts`), moved and resized by snapping, never overlapping; presets Standard, Study, Class, Transcription, Recording and saved layouts in the ▦ menu; on a phone one column. Diagrams scale to their panel (their −/+ sizes went). Presentation (P) is the current layout without controls, filling the window. New panels are born as modules: an id in `layout/presets.ts` and a body in `ui/layout.ts`
4. [x] Voice leading, 2026-10-11: Voices field (each voice bass first, outer motion, total, held notes; `detector/voice-leading.ts`) and Rules field (UMT `checkVoiceLeading` strict, only with as many voices in both chords; false relations left out). ⇠ on staff and piano shows the previous chord, faded. Read from the previous chord's notes: played, or a history or song chord captured from MIDI
5. [x] One string-instrument panel, 2026-10-11: Strings replaces Guitar and Fretboard. Guitar, 7-string, bass, 5-string bass, ukulele (reentrant), baritone ukulele, mandolin, banjo, with their usual tunings and a custom one (`theory/instruments.ts`); views Shapes (playable voicings from UMT, which handles any string count) and Neck. notae draws any number of strings as it was
6. [x] Explanations, 2026-10-11: Explanation panel (`detector/explain.ts`) with each term of the analysis said of the chord on screen (degree, numerals, function, secondary with its target, borrowed mode and foreign notes, tritone sub, chromatic, figured bass, position, cadence, P/L/R, substitution types, upper structures, voice-leading rules; intervals); history cadence tags explain in their tooltip. In Standard and Study
7. [x] Reference progressions, 2026-10-11: Progressions panel with UMT's 16 named progressions in the analysis key (its mode), bar by bar with numerals, cadences and modulations, a sentence each in both languages; click a chord or ▶ the whole. Cadences and modal interchange are explained per chord in the Explanation panel. 2026-10-22, with UMT 0.11: groups Cadences (authentic, plagal, deceptive, half, Phrygian half, minor plagal) and Modal mixture (♭VI-♭VII-I, Picardy third), UMT's examples; the minor ones by UMT's `mode`
8. [x] Ear training, 2026-10-11: panel with intervals, chord qualities (10) and cadences (authentic, plagal, deceptive, half in a random major key), a score per kind, the answer shown in the detector. Scale degrees, 2026-10-20: a Degrees tab, I IV V7 I then a note, answered in movable do. Later: answering by playing it, more cadences and minor keys
9. [x] Audio player, 2026-10-11: Player panel with a local file (open or drop), waveform with click to seek, A–B loop, speed 50–125 % keeping the pitch, back 5 s; on top of the Transcription layout. The file is not kept across reloads. Later: pitch shift (a recording a semitone off), markers, the chord heard at the playhead (with the microphone item's audio analysis)
10. [~] Microphone input, 2026-10-11. Done: notes by YIN held in the detector (feeds Fits, history, analysis), never sounded; Tuner panel (note, cents, Hz). 2026-10-19: chords by Spotify's Basic Pitch in a Web Worker (`audio-notes/`, `dist/notes-worker.js`, model in `vendor/basic-pitch/`, loaded on first use): the microphone reads its last ~0.7 s every 300 ms, under a second behind; the Player reads the file once when opened and sends the chord at the playhead to the detector (Chords, on by default), the Player's heard notes kept apart from the microphone's. TensorFlow.js 3.21 needs `window` declared in a worker (`worker-env.ts`). Checked with Chrome's fake capture (a WAV of A3) and Firefox's fake stream (1 kHz → B5 +22 ¢); with a real guitar and voice on a phone by the user 2026-10-29: works. A real guitar and voice through the microphone, tried by the user on a phone 2026-10-29: works (the bench and a synthetic chord file in e2e before); chords offline after first use checked 2026-10-26 in Chrome and Firefox (worker and Basic Pitch model from the service worker's cache, the Player reads a C chord after a reload offline). Bench 2026-10-19 (`pnpm bench:audio`, `scripts/bench/`; needs FluidR3's steel and nylon guitar samples in `.bench/samples`, gitignored): 43 guitar shapes strummed, clean and with noise. Chord name right: the current chromagram 16 % (12 % as it rings), an iterative harmonic estimate 22 % at best, Spotify's Basic Pitch (`@spotify/basic-pitch` 1.0.1, Apache-2.0, TensorFlow.js 3.21) 97–98 % just after the strum and 81 % at 1 s, bass 99–100 %, ~0.6–0.8 s per 2 s window in headless Chrome. Reading the notes of the last strum instead of those sounding is worse (50–78 %). With the microphone's window (0.74 s, notes 0.1 s before its end) 92–94 % and 78–80 % at 1 s, ~280 ms per reading
11. [x] Offline and installable, 2026-10-11: libraries and the piano samples in `vendor/` (`pnpm vendor`), service worker (network first for the app, cache first for samples), manifest and icons. Checked offline in Chrome (e2e) and Firefox. The other 127 instruments still come from `gleitz.github.io` on first use; shipping them all is ~250 MB
12. [x] Accessibility, 2026-10-11: Tab and Enter / Space everywhere (circle segments, history and song chips), panels moved and resized with the arrows, live region for the chord (long name, degree, function), landmarks, named icon buttons and diagrams, help as a dialog, focus outlines. Checked with the keyboard in Chrome (e2e) and Firefox; NVDA 2026.3 (portable, silent synth, its IO log read) 2026-10-26: each chord was said twice (its name, then again with the numeral once the auto key came) and the notes left while lifting it were said; fixed: said once while it sounds (`announce` with what is sounding, `silence` on release), again when played again. Keyboard walk under NVDA 2026-10-26 (Chrome kept in front): the bar, the rail, the key menu, Settings, the circle, the history, the chord field and moving panels read well; Help took no focus (Tab went on behind it) and a panel's ⋯ menu was reached after its ×: fixed (Help a modal dialog with the focus in it, a ⋯ menu opened by keyboard focuses its first option). 2026-10-26: a panel is one tab stop, its header (Enter opens ⋯, Delete hides it and the focus goes to the next panel, arrows move, Shift + arrows resize; ⋯ and × out of the tab order); the circle's segments describe their keys (`aria-description` over the tooltip's `title`); a panel header is `role="button"` (Firefox names no generic header by its `aria-label` and read the ⋯ and × inside it instead), Space opens ⋯ as Enter does, and the "drag to move" tooltip is on the title, which fills the header; a segment played with Enter keeps the focus after the circle redraws (it went to the page's top, so Enter twice could not set a key). Checked in Chrome's accessibility tree (e2e) and under NVDA in Playwright's Firefox (visible, muted, silent synth) 2026-10-26: headers read their name and keys, "button, submenu", nothing else; the circle its name and keys, each segment its name and description. The circle is one tab stop (roving tabindex: the segment last focused, else the chord's, the tonic's, C), left / right round a ring, up / down across the rings, Home to C; its arrows and a header's Delete no longer reach the global shortcuts (step the song, remove the selected song chord: `keyBelongsToControl` in `ui/a11y.ts`); both in the help's fixed keys
13. [x] Mobile and touch, 2026-10-11: multi-finger piano (a key per pointer), two-octave piano on a phone widened to the notes, long press removes a history chip, tap shows a song chord's buttons, text panels keep their layout rows and scroll inside (2026-10-26), no double-tap zoom, larger targets with a coarse pointer. Checked with Chrome's mobile emulation (e2e, synthetic touch pointers) and Firefox at phone width; the piano with the fixed panels checked by the user on a real phone 2026-10-26
14. [x] Help and guided tour, 2026-10-11: the ? panel describes every panel and starts the tour; a ten-step tour on the first visit (spotlight and card, arrows, Esc, remembered), in both languages. 2026-10-27: every tooltip, ⓘ and help text read again in both languages; the confusing ones rewritten (movable do, chroma key, timings, the iso layout, internal API names removed); checked by the user
15. [x] Presentation mode, 2026-10-11: any layout without controls, filling the screen (⛶ / P), so history and key panel too; the Class preset is made for it. 2026-10-27, checked at projector sizes (1280×720, 1024×768): the rows filled the window whatever the layout, and Standard's 64 rows, whose 10 px gaps alone take 630 px, fell to 4 px and ran past the window, unseen; now a layout fills the window only while each row gets 12 px (Class at 1280×720, 15 px), else it keeps its own sizes and scrolls (`MIN_ROW` in `view/presentation.ts`)

16. [x] Settings, 2026-10-12: ⚙ dialog (design A of the canvas `Modus · Ajustes`, claude.ai artifact 3FNjKBDN) with ten sections, search, reset per section; every fixed timing and option exposed through `settings/prefs.ts`; shortcuts customizable (two keys, conflicts asked); export / import / reset with Undo. MIDI channels, out and Thru moved from the toolbar; language, note names and theme from the help panel, which keeps only help. 2026-10-27, asked by the user: the MIDI input in Input and output (the bar's choice, both ways); Panels holds every panel's ⋯ options, panel by panel, Windows the views menu's background and panels, Sound the bar's instrument and volume. What a panel shows in its own body (Strings' view, the player's speed and chords, the metronome's mode, ear training's kinds) stays there

18. [x] Bar and rail, 2026-10-12: the field finds orders by name (modes, keys, layouts, panels, instruments, presentation, view windows); instruments named in Spanish. Then the panels one by one, all reviewed 2026-10-13: Strings (board `Cuerdas C` of the canvas, with the instrument line of A), the Song (19), the key panel, ear training and the piano (21); each panel's preferences also in its ⋯ menu, the staves chosen in view.
19. [x] Song panel, decided and built 2026-10-13 (boards `Canción A` and `Canción C` of the canvas `Modus · Diseño`): the measures flow four to a line with bar lines, as a chord chart, the section's name in a margin on the left (A); above it a strip with the song's form, blocks as long as their bars, as a map: a click goes to the section in the chart (all sections stay below), dragging a block reorders the sections, ×N and "+ section" live in the strip, hidden with one section, the block in play marked during MIDI fill and ← →. Each section can also be written as text ("Am F | C G", the toggle of board B), with what was understood shown below. The song's head: its name opens the song list, then key, bars and sections; "+ Section", "Paste chords" and ⋯ (New, Transpose, Export, Delete); no native select. Chips in the function's colour, their tools (edit, duplicate, MIDI fill, remove) shown on the chip selected. On Auto the key is read from the song's own chords, so the numerals no longer read "—" with an empty history
21. [x] Three panels, decided and built 2026-10-13 with the Song (19), to build together:
   - Key panel: with a wide panel the parallel modes go in two columns, so the panel is half as tall and the left column leaves no gap; narrow, one column as now
   - Ear training: the kinds as tabs (as Strings' view), New question as the main button in the accent, the answers as ordinary chips dimmed only while no question waits; the score reads "right 0 of 0"
   - Piano: the keyboard fills the panel's width, with more octaves where they fit (a low wide panel shows five or six octaves at a readable size instead of three small ones)
20. [x] Playing the song, 2026-10-19 (`song/playback.ts`): ▶ in the song's head, from the chord selected or the top, sections as many times as their ×N, chords sharing their bar; the chart, the form strip and the detector follow; ■ or Esc stops. Tempo and beats per bar per song (♩ 100 · 4/4 in the head)

17. [x] Interface redesign (2026-10-12), design A ("Refinado") with the system of C, canvas `Modus · Diseño` (claude.ai artifact CG3J79w1). From B ("Escenario") the Class layout took the history under the chord, growing with its panel; the rest of B is left to the user, who can arrange and save any layout to present. The icon approved by the user 2026-10-26

### Next session, approved 2026-10-21 (build all, no mock-up first)

Found 2026-10-21 trying the app on a phone: Settings and Help are floating dialogs that read badly there (Settings: ten tabs over three rows, each setting's explanation squeezed beside it; Help: mostly keyboard shortcuts, a gap in the middle); and on a desktop, in Standard with a chord on screen, panels empty for what they show: Key 92 % (no key chosen: only its notice), Explanation 72 %, an empty Song 68 %, an empty History 100 %, Tuner 29 %.

22. [x] Settings like Android's on a phone, 2026-10-21: full screen; first level the search and the sections, a row each with icon, name and a summary of its values ("Español · Do Re Mi · Como el sistema"); a section opens its page, ← to go back, a row per setting with its name and its value under it; switches on the right, choices open a list to pick one, numbers a slider in the row; Reset this section in the page's ⋮ menu; each setting's explanation behind an ⓘ. On a desktop the two-column dialog stays, with the same rows: no explanation in view, the value under the name. MIDI channel and port options read "Channel 5", "None", the port's name (they were short for the old toolbar). Checked in Chrome at desktop and phone width (e2e on a phone too); checked by the user on a real phone over the local network 2026-10-22
23. [x] Help on a phone, full screen too, 2026-10-21: Gestures (tap, double tap, long press, a song chord's buttons, several fingers on the piano) instead of the keyboard shortcuts and the mouse, which show only with a fine pointer (taken as a keyboard: no API tells). Drag is not among the gestures: HTML5 drag on touch not checked. Checked by the user on a real phone over the local network 2026-10-22
25. [x] A bar along the bottom on a phone in place of the rail, 2026-10-21, asked after trying the app on a phone (the rail's menus read badly beside it): Input, Sound, Mic, Panels, More, each with its name; the menus rise as bottom sheets, also from the top bar's statuses; no computer keyboard, no OBS view windows; More holds presentation and export. The tour's layout step points at Panels there. Checked in headless Chrome as a phone (e2e); checked by the user on a real phone over the local network 2026-10-22
24. [x] Panels that fit what they show, 2026-10-21: the text and list panels (Key, Explanation, History, Song, Tuner, Progressions, Ear training, Next) take the height of their content, at least three rows and at most their size in the layout; empty they stay small, filled they grow and the panels under them move. Diagrams, the player and the metronome keep their size. Checked in Chrome at desktop and phone width

### Unblocked by UMT, to place in the order

The UMT audit ended 2026-10-11 (`umt/docs/auditoria-2026-10.md`).

- [x] Metronome, 2026-10-20 (`metronome/`): meters including additive ones, UMT's cycles (talas, flamenco compás, aksak), claves, Euclidean rhythms, polyrhythms a:b, subdivision 1–6, tap tempo, tempo trainer in the ⋯ menu; the necklace (dots, group arcs, counts, the pulse sounding lit, a second voice inside); 2026-10-21, the drawing leads: the mode in a menu over the drawing (recent modes, kinds on the left, choices on the right), the subdivision in its own small menu, the count sounding large, a flash on the accents, a second view of pulses as blocks (from how metronome apps cue the beat: Click, Pro Metronome, Metronome: Tempo), the large count optional; clicks by Web Audio on the audio clock through the master volume. In Standard and Study. While it runs the history's harmonic rhythm uses its tempo and cycle. Not yet: a click under the song playing, takes recorded into bars, metric modulation
- [x] Movable do for didactics, 2026-10-20 (`theory/solfege.ts`, UMT `Solfege.movableDo` with `syllables: 'ti'` in every language: ti on the seventh, di ri fi si li / ra me se le te outside the scale): the Explanation's degree, a Mov. do field in Analysis (the notes on screen or the melody; hidden by default), the Degrees tab of ear training

- [x] Scales on the fretboard and piano, 2026-10-25 (`theory/scales.ts`): a Scale view in Strings beside Shapes and Neck, the analysis key's scale or, in the ⋯ menu, its pentatonic, blues, harmonic or melodic minor on the same tonic; Whole neck (frets 0–12), CAGED (UMT, only where it gives shapes) and 3 per string (only scales of seven notes or more: on a pentatonic UMT's patterns span 10–17 frets), positions with ‹ › and dots, "Em shape · frets 5–8", a warning past 6 frets (a ukulele's 3nps). The tonic in the accent, the notes of the chord sounding in its function's colour, the rest `--scale-dot`; labels degrees (from UMT's spelled letters: ♭3, ♯4), notes or none. Piano: Scale in its ⋯ menu, off by default, the key's scale on every octave drawn, the tonic `--piano-scale-root`. View windows follow. Needed notae `dotColors`, `dotLabels`, `showOpenNotes`. Checked in headless Chrome (e2e, screenshots) and headless Firefox in Spanish (screenshots); at phone width 2026-10-26 (Chrome as a phone, Firefox at 390 px): CAGED, 3 per string and the piano read well; Whole neck, too small there, goes four frets at a time, and so does the Neck view (its window kept across chords) (0–4 with the open strings, 5–8, 9–12, with ‹ ›) when it lies down in a panel narrower than 520 px (`NARROW_NECK` in `diagrams/guitar.ts`): a phone, Class at 1280 and 1440; whole again when the panel widens

### Visualization, approved 2026-10-26 (seen in OrbKord, orbkord.net)

- [x] A fixed card in the chord header, 2026-10-26: Position, Voicing and Degrees rows beside the name ("R 3 ♭7 ♯9", each member once from the bass up, a note outside the chord as "+E"), "—" for a row UMT cannot read, from UMT `analyzeVoicing` (`voicingCard` in `detector/analyzer.ts`). Beside the name where it fits, wrapping under it in a narrow panel. Checked in headless Chrome: Standard, Study with a key (110 px panel, no overflow) and a phone at 390 px
- [x] Isomorphic keyboard, 2026-10-27 (`diagrams/iso.ts`; mock-ups `Isomórfico A`–`D` in the canvas `Modus · Diseño`, built as D; ideas from Musix Pro, Hexatone, 0x33.board, TonnetzViz and OrbKord's Iso view, which marks the notes played strong and the other octaves soft): an Isomorphic panel, not in any preset. notae `hexGrid` lays out the cells for the panel's size from two intervals, `renderHexGrid` draws them with the host's colours and labels and joins neighbouring notes of the chord by lines. ⋯ menu: layout (harmonic table, Wicki-Hayden, Gerhard, Jankó, custom), cell size, centre note, orientation per layout, colour (function, pitch class, piano), labels (notes, degrees, movable do, none), other octaves (soft, hidden), chord shape, scale, SVG/PNG. A chord outside the grid moves the grid to it. A view window of its own. Checked in headless Chrome (e2e; screenshots of every colour mode, in Spanish, light theme); 2026-10-27 in headless Firefox (every layout, colour and label mode, a cell played by the mouse, its view window, a layout window of a saved layout holding it, 390 px wide) and Chrome as a phone (three fingers on three cells make C, released). Under NVDA in Firefox 2026-10-27 (silent synth, its IO log): the drawing focused read every cell's name (~110) before its label, the piano its four; their SVG is now `aria-hidden`, and both read "Isomorphic keyboard: G3 B3 D4 F4, graphic", "Piano: …" alone. In OBS by the user 2026-10-27. Microtonal grids (Bosanquet in EDOs) wait on notae, whose grid knows only MIDI semitones
- [x] Note names beside the staff, 2026-10-26 (`placeNames` in `diagrams/staff.ts`, `staffLabels` in `detector/analyzer.ts`): Names in the staff's ⋯ menu, None (default), Notes or Degrees; a column right of the staff, each label at its note's height by its staff step, eased apart from the bass up, across both staves, the staff ended a little after the chord (abcjs draws it on well past it); only the current chord's under ⇠; degrees from UMT `analyzeVoicing` (a note outside the chord "+D"), names below three notes or without a chord; in `currentColor`, so an export keeps it; view windows follow. abcjs draws staff lines as `<path>` in Chrome and `<line>` in Firefox: both read. Checked in headless Chrome (e2e) and headless Firefox (screenshots); by the user 2026-10-26; view windows not checked

### OBS windows, approved 2026-10-26

Found by the user in OBS: with every view window open some followed and some did not, with a delay. Asked: one window like presentation, to capture while working in other programs, in a layout other than the one played in; fewer buttons in the views menu.

- [x] Layout windows, 2026-10-26: the views menu opens a window per layout (the presets and the saved ones), the whole layout without controls on the windows' background, following the main window (detector, analysis, history, key, song and its playing step); one diagram windows stay. The menu: windows, one diagram, background as chips (one for all windows), the OBS how-to in the tooltips; SVG / PNG moved to each diagram's ⋯ menu (More keeps them on a phone). Checked in headless Chrome (e2e: follows, same history, stored layout unchanged) and headless Firefox; in OBS by the user 2026-10-26. In OBS a covered window does not freeze (user, 2026-10-26). Tools panels (ear training, metronome, tuner, player) show their own idle state there
- [x] Clear panels, 2026-10-26, asked after trying the windows in OBS (they work): Panels in the views menu, with ground (default) or clear; clear panels take the windows' background, so the Chroma Key takes them out too, text and drawings with a `--glow` shadow; the circle gets an opaque disc behind its rings (the minor ring is see-through). Checked in headless Chrome (e2e) and Firefox; in OBS by the user 2026-10-26, with the Chroma Key
- [x] Lag of the layout windows, measured 2026-10-26 (headed Chrome, 24 chords, note to the chord's name painted): main window median 112 ms, max 226; Class layout window 121 / 238, about 10 ms after the main window. The lag seen in OBS is its Window Capture, not Modus; `noopener` and sending the analysis computed are not needed. In OBS: try the capture method (Windows 10 1903+ or BitBlt)
- Presentation keeps the page's background: a chroma option was built and taken out the same day, the layout window does that job

### Next panel, approved 2026-10-26

- [x] Borrowings and substitutions, 2026-10-26 (`detector/next.ts`): a suggestion offers the key's usual borrowings (UMT `common`) that UMT's `getSubstitutions` gives as its `modal` substitutes, by mode ("F … or Fm from aeolian"); no chord makes a named cadence into a usual borrowing, so they come this way. Under the list, "In place of Dm7": the chord on screen's substitutes with their type, `ex.sub.*` in the tooltip; one picked is shown in its place, after the chord before it. In minor UMT gave a wrong deceptive substitute (Fm for E7 in A minor) and none for the dominant triad: asked from Modus, fixed in UMT 0.12 (F, G#dim). Checked in headless Chrome (e2e; screenshots in English and Spanish); by the user 2026-10-26

### 2026-11-10 — Project review (kept as written)

Reviewed without changing the app: spec, README, code, tests, CI and the published app in a browser. TSC clean, 474 unit tests pass, CI green, UMT and notae at their latest. Everything numbered in the roadmap was built.

### 2026-10-26 — The rail removed

**What changed:** the pattern "Bar and rail" (2026-10-12, boards `Barra C` and `Barra E`) is superseded. The rail opened the bar's input and sound menus again from icons and held the computer keyboard and the mic, which the input menu also holds; only layout, presentation and view windows were its own. Those moved to the bar; the mic and keyboard show as icons in the input status while on.
**Why:** the user noticed the duplicated functions. The rail was there so the bar could stand alone with the rail hidden, which left the rail mostly repeating the bar.

### 2026-10-26 — Phone panels no longer grow with their content

Item 13 (2026-10-11) let the text panels grow to their content in one column. On a real phone each chord grew Explanation (110 → 570 px) and Key, and released it shrank: the piano jumped from under the fingers. Now each panel keeps its layout rows and scrolls inside.

### 2026-10-13 — The song builder is reopened

**What changed:** the freeze of 2026-10-10 (no new features for the song builder) no longer holds. The Song panel became a chord chart with the form as a strip, sections written as text and songs as tabs; playing the whole song is TODO.
**Why:** the user asked for it while reviewing the panels one by one.

### 2026-10-10 — Scope: the analysis is Modus; the song builder is frozen

**What changed:** the roadmap was split. Analysis work is ordered (pitch spelling, voicing analysis, scales from a melody, unused UMT output, key explorer, next-chord suggestions, progression analysis over the history, OBS view and image export, MIDI output). The song builder keeps working with its tests but gets no new features; its roadmap items are parked (file export, sharing, MIDI and MusicXML files, PDF, tempo playback, durations, lyrics, undo / redo, metronome, takes). Whole-song analysis moved to the history.
**Why:** Modus started as an analysis tool. The song builder came in later and is useful, but it is a composition / documentation app: every feature it needs (durations, lyrics, tempo, notation export) pulls Modus toward a score or chord-sheet editor and away from the analysis. Later it may become a separate app on UMT and notae.

### 2026-10-10 — UMT theory output fixed upstream (pin `870d3d8` → `debda14`)

**What changed:** a sweep of every UMT call Modus makes (24 keys × 24 chords) found no API drift but wrong theory: figured bass of seventh chords ("" for C7, "10" for C7/Bb), raised degrees in minor read as lowered (G#dim7 in A minor as "bi°7", tonic), secondary dominants with the function of their degree, harmonic-minor V as "borrowed from major", no function for VII / ♭VII, D7 in C also "borrowed from lydian", substitution gaps (none for Dm7 or Fm in C). All fixed in UMT with tests; criteria recorded in UMT's `state.md` Patterns.
**Why:** `tryUMT` swallows throws and the panel shows whatever UMT returns, so wrong theory reached the UI silently. Per the [theory] pattern, fixes went to UMT, not into Modus workarounds.

### 2026-10-09 — src/ organized by area; styles into src/

**What changed:** `src/` grouped into detector, theory, diagrams, history, song, input, audio and ui. `diagrams.ts` split into one file per diagram. Note-name helpers moved from `midi.ts` to `theory/notes.ts`. `styles.css` moved from the root to `src/`, bundled by esbuild to `dist/app.css`.
**Why:** the roadmap adds many features, most of them to the diagrams; a flat `src/` and a five-diagram file would not hold them. Theory code imported from the MIDI input module only for note names. The root keeps only what tools and conventions require there.

### 2026-10-09 — Purpose redefined; the v1 out-of-scope list reopened

**What changed:** Modus aims to be a complete, professional, useful, universal and didactic app. Out of scope now holds only cloud sync/accounts and analytics/monetization; the rest of the v1 list (several songs, MIDI files, mobile, light mode, microtonal, channel filtering, velocity display, free section colours) moved to the roadmap with the gaps found against each use.
**Why:** the user set no time or budget limits and no marketing or profit goals. The v1 list was a scope cut for a first version, and "several songs" contradicted transcribing as a main use.

### 2026-10-09 — Audio engine kept: soundfont-player, not smplr

**What changed:** considered replacing soundfont-player with smplr, and keeping both engines. Rejected.
**Why:** smplr loads its GM soundfonts from the same `gleitz.github.io`, so it removes no risk; soundfont-player is archived but pinned and works. A real reason to move would be smplr's sampled instruments or reverb.

### 2026-10-09 — Blank page without the soundfont-player script

**What changed:** `loadCurrentInstrument` checks that `Soundfont` exists; the status callback receives the current status when registered.
**Why:** `preloadAudio()` runs before the layout is built and threw `Soundfont is not defined`, stopping the whole init. Reproduced by blocking the script in Chrome. The error status was also lost, because it was set before the UI registered its callback.

### 2026-10-09 — Spec audit; Stack and UMT contract out of state.md

**What changed:** spec rewritten after checking every claim against the code: ten statements were false (abcjs version, piano `data-note`, arpeggio window, function labels, transpose to a target key, controller audio listed as out of scope…). The claim that some Chromium versions block Web MIDI on `file://` removed. Previous spec and the three executed May plans moved to `.archive/` (gitignored). In `state.md`, the Stack table went (README has it) and the UMT API contract moved to `docs/umt-contract.md`.
**Why:** the spec had drifted from the code; the `file://` claim had no source. `state.md` follows the animus template: Project, Status, Patterns, Preferences, TODO.

### 2026-10-02 — TODO sweep: interaction model, CoF, voicings, UMT/notae fixes

All base-review TODOs closed in one batch after the user answered the open design questions. 10 Modus commits, one each in UMT (`870d3d8`) and notae (`8fb052d`), both pushed.

**Decisions taken by the user (replace earlier behaviour):**
- Chips play on a single click; double-click to play is gone. The CoF already played on click, so the whole app now matches
- CoF click no longer sets the key (it moved you to G when exploring G in C); double-click on a major or minor segment sets it
- The three confirmation patterns (modal for C, click-twice "?" for Clear/New/delete section, nothing for measures and chords) became one: act at once, Undo toast
- MIDI fill chains slot to slot across measures and sections; paste splits at `|`, otherwise one chord per measure
- Auto key drives every view; Roman field shows `V7/x`
- Theory fixes go to UMT/notae, not Modus

**Removed:**
- `keys.ts` signature tables: UMT now spells heptatonic scales by letter, so the signature is read from `parseScaleSymbol`. Minor key list changed to standard roots (C# / G# / Eb / Bb minor); stored keys are normalized on load
- Piano click mapping by notae's render order: notae tags keys with `data-note`
- `deriveVoicingFromNotes` for custom tunings: custom tunings go through UMT like the presets
- The `P` shortcut (same as Space)

**Non-obvious:**
- The e2e harness rewritten and committed (`pnpm test:e2e`). A check that failed left keys held and broke the next ones: every check now releases all notes
- A history-Clear e2e check started failing after the render memoization only because the app got faster: the chord logs 0.8 s after it settles and the check arrived first
- Suspended AudioContext: `resume()` without a gesture stays pending and would fire every queued note on the next click. Notes are dropped instead when `navigator.userActivation.isActive` is false

### 2026-10-02 — Base review: pnpm, UMT contract, bug batch, detector refactor

Full read of `src/`, tests and docs, plus probing the pinned UMT bundle in Node. 5 commits.

**Why the session-20 audit missed the worst bugs:** tests mocked UMT with the shape Modus assumed, not the real one. The mocks had a `quality` field UMT never had and never returned `"Unknown Chord"`. Tests now load the real bundle via a git devDependency pinned to the same commit as the CDN tag.

- `build:` npm → pnpm 11; esbuild 0.28, vitest 5 + vite 8, jsdom 30, TS held on 5.9; audit clean. UMT/notae CDN pinned by commit hash (was `@main`/`@master`). May plans moved to `docs/archive/`
- `fix:` UMT contract — chord colours were always grey (no `quality` on UMT chords; family now derived from `intervalsInSteps`); `"Unknown Chord"` got logged to history and broke its rendering with a key set; `"CM"` normalized to `"C"`; octave reported as Unison; instrument switch mid-load kept the old instrument; double-click on history chips did not start audio
- `fix:` staff showed B natural as Bb in F major (no `=`, key signature applied); MIDI fill captured the first three notes of a four-note chord; history chip dropped on a song chip was swallowed; song/history cursor invisible on click; transpose left stored voicings untransposed and spelled minor keys by the major list; `S` dropped the voicing; Ctrl+C opened the clear-history modal; `?` button could not close help; saved MIDI device overridden by the first device on every hot-plug
- `refactor:` single detector path in `app.ts` (`showDetection`), which fixed: key change not recomputing analysis, Space/▶ playing the last MIDI chord instead of the shown one, cadence computed against `history[0]` (often the chord itself). `song.ts` → `song-model.ts` + `song-view.ts`. `storage.ts` for preferences (corrupt values no longer break startup). `tryUMT` replaces empty catches around UMT calls
- Verified: 152 unit tests, plus 25/25 headless-Chrome checks driven by a fake Web MIDI input (harness kept in the session scratchpad, not committed)

### 2026-09-28 — state.md split into state + history

**What changed:** History moved here verbatim. File Structure section dropped (the repo shows it). Completed TODOs dropped. Stack table corrected: soundfont-player is loaded via CDN in `index.html`, not npm.
**Why:** state.md holds only what is true now.

### 2026-06-13 — Slop audit: docs lies, dead code, small bugs — session 20

Full project audit for AI slop, dead code and unimplemented claims. TSC clean, 97/97 tests, 3 commits.

**Docs (commit `docs:`):**
- LICENSE created (GPL-3.0) — README badge pointed to a missing file
- Tailwind claims removed from README/spec/state — styles are plain CSS, Tailwind was never installed
- README: Space shortcut corrected (plays chord, not capture), transpose claim corrected (semitones only), test files added to structure listings

**Dead code removed (commit `refactor:`):**
- `audio.ts`: `pendingNotes` queue (written but always discarded since session 15), `getAudioStatus` (never imported), local `noteNameToMidi`/`PC_MAP` moved to `midi.ts`
- `types.ts`/`app.ts`: `AppState.midi` (duplicate of midi.ts module state, never read), `detectedKey` (written, never read), `HarmonicAnalysis.detectedKey` (always null)
- `analyzer.ts`: `analyzeNotes` dropped unused `activeKey`/`prevChordSymbol` params
- Pitch tables centralized in `midi.ts` (`PITCH_NAMES_FLAT`, `NOTE_SEMITONE`, `noteNameToMidi`); quality color map shared from `analysis-panel.ts`

**Bugs fixed (commit `fix:`):**
- CDN error banner never fired — `window.onerror` does not catch resource load errors; replaced with capture-phase listener before the CDN tags. Removed `'surikov'` leftover
- `index.html` title was still "Harmony Companion"
- `renderNeck` dropped sharp-spelled notes (regex only accepted flats)
- `transposeSong`: now transposes slash bass (`C/G` → `D/A`), re-validates instead of forcing `valid: true`
- `history.ts`: dead `'Unknown'` guard → real sentinel `'?'`
- `song.ts`: duplicate `isValidChordSymbolPublic` removed; `detectForm` redundant ABAB check removed and "through-composed" mislabel → strophic

**Deliberately not touched:** the three coexisting confirmation patterns (modal / double-click / confirmOnce) — that is a UX decision for the pending UX audit TODO.

### 2026-05-23 — Dead code cleanup + bug fix — session 19 (part 2)

Eliminated confirmed dead code and fixed one real bug. TSC clean, 97/97 tests.

**Removed:**
- `diagrams.ts` — `loadGuitarDB()` and `nextGuitarVoicing()` (no-op shims)
- `app.ts` — `loadGuitarDB` import and call, listener for `'history-capture-requested'` (event never dispatched)
- `history.ts` — `getHistoryNotes()` (exported, never imported)
- `song.ts` — `moveChord` (pre-drag-and-drop), `moveSectionUp`, `moveSectionDown`, `updateSongState` (all exported but never imported from src/)
- `tests/song.test.ts` — moveChord tests removed alongside the function

**Fixed:**
- `app.ts` — `reRenderNeck` was treating `detection.notes` as `number[]` (applying MIDI conversion) when it is already `string[]`. Fixed to pass notes directly.

**Migrated:**
- `song.ts` localStorage key `'harmony-companion-song'` → `'modus-song'`. `loadSong` reads `'modus-song'` first, falls back to `'harmony-companion-song'` for silent migration. `saveSong` always writes to `'modus-song'`.

**Not removed:**
- `PITCH_NAMES_FLAT` import in `analyzer.ts` — confirmed used at line 33 (`pitchClass` field). Original cleanup note was wrong.

### 2026-05-23 — Comprehensive test suite — session 19 (part 1)

23 → 101 tests. No production code changed.

New files: `tests/history.test.ts` (18 tests — full state coverage: addEntry, removeEntry, clearHistory, callbacks, debounce/dedup in notifyChordDetected), `tests/analysis-panel.test.ts` (7 tests — FIELD_KEYS/LABELS/TOOLTIPS completeness, getChordQuality including error path).

Extended: `tests/analyzer.test.ts` (+11 — interval detection for 2-note input, full buildHarmonicAnalysis suite with/without key, cadence, scales, coltraneAxis, negativeHarmony), `tests/song.test.ts` (+33 — removeSection, addMeasure, removeMeasure, updateSection, duplicateSection, insertChordAfter, updateChord, duplicateChord, moveChord, moveChordToPosition, reorderSections, reorderChordInMeasure, transposeSong, computeDegree, isBorrowedChord).

Behavior documented: `insertChordAfter` with unknown id does nothing (no append). UMT mock in song.test.ts updated to return real analysis data for computeDegree tests.

### 2026-05-23 — dist/ fix + language convention — session 18 (cont.)

dist/app.js no estaba sincronizado con el refactor de sesión 17 — commiteado. Confirmado que dist/ debe estar trackeado en git (igual que notae y UMT — jsDelivr lo sirve directamente desde el repo). El .gitignore solo tiene node_modules/, correcto. Añadida convención de idioma inglés a spec y state.md Patterns.

### 2026-05-23 — Docs audit + spec rewrite — session 18

Sin cambios de código. Sesión completa de revisión y limpieza de documentación.

`docs/spec.md` reescrito desde rev 5 a rev 6: nombre corregido (Modus, no "Harmony Companion"), MuseScore eliminado del objetivo, ecosistema y filosofía añadidos (GPL3, memoriainfinita, not for profit), stack actualizado (soundfont-player, UMT.getFretboardVoicings, Tailwind, sin tombatossals ni WebAudioFont), jerarquía de zonas establecida explícitamente (Detector como núcleo, History y Song como módulos de soporte), layout diagram corregido (Instruments panel separado de Notation, toolbar completo), chord summary documentado, sección Instruments panel añadida, UMT API notes movidas a sección propia. Eliminados: duplicados (device selector, key selector), relleno y marketing, términos inventados ("manual chord analysis", "at actual octave"), detalle de implementación del piano post-processing movido a referencia a state.md.

`README.md` actualizado: sin MuseScore, ecosistema + filosofía, stack correcto (Tailwind, soundfont-player), comandos npm correctos (sin node build.js), project structure con shortcuts.ts y analysis-panel.ts, sección "Who it's for" añadida, Instruments panel documentado como sección separada de Notation. Eliminados: marketing puffery, términos vagos.

`state.md` corregido: descripción del proyecto sin MuseScore, stack actualizado (WebAudioFont y tombatossals eliminados, soundfont-player y Tailwind añadidos), file structure actualizado (build.js eliminado, shortcuts.ts y analysis-panel.ts añadidos), plan marcado como completado.

### 2026-05-23 — app.ts refactor — session 17

Refactor completo sin cambios de comportamiento. Extraídos dos módulos nuevos: `src/shortcuts.ts` (SHORTCUTS data, helpVisible, closeHelp/toggleHelp) y `src/analysis-panel.ts` (field constants, getChordQuality, renderChordSummary, renderZone1Analysis). `buildLayout` split en 5 sub-funciones: buildToolbar, buildNotationPanel, buildInstrumentsPanel, buildZoneHeaders, wireLayoutEvents. También corregido `types.ts` — AppState.panels tenía `piano/neck` en lugar de `instruments/colPiano/colNeck` (bug preexistente que tsc no detectaba porque esbuild no hace typecheck). tsc limpio, 23/23 tests, smoke test manual OK. 3 commits en master.

### 2026-05-23 — Refactor planning — session 16

Sin cambios de código. Sesión de planificación completa: diagnóstico de `app.ts` (969 líneas), spec auditada 3 veces, plan de implementación escrito y auditado. Decisión: Approach A — extraer `shortcuts.ts` + `analysis-panel.ts`, split interno de `buildLayout`. Hallazgos clave del audit: 3 call sites de `renderZone1Analysis` faltaban (init, refreshAll, wireKeyboard 1–9), parámetro `activeKey` innecesario eliminado de la firma, `npm run build` no corre TypeScript (usar `npx tsc --noEmit`). Plan listo para ejecutar en siguiente sesión. Docs en `docs/superpowers/specs/` y `docs/superpowers/plans/`.

### 2026-05-23 — Audio, song, UX y build — session 15

Audio loading: eliminado `await audioCtx.resume()` bloqueante en `loadCurrentInstrument` — barra llega al 100% cuando el soundfont carga de verdad. Nuevo estado `'suspended'` (ámbar, "click to activate") cuando el instrumento está listo pero el AudioContext sigue suspendido. `initAudioOnGesture` transiciona de suspended a ready al primer gesto real. `pendingNotes` se descarta al cargar (evita burst de sonido en primer click).

Voicing real en historial y canción: `HistoryEntry.notes` y `SongChord.notes` (nuevo campo opcional) se usan en toda la cadena — drag historial→canción, captura MIDI (⊙), dblclick en historial/canción, click en chip de historial, click en chip de canción. Todos muestran y reproducen la voicing exacta capturada. Fallback a `playChord(symbol)` cuando no hay notas almacenadas (entrada manual, CoF).

Song chips: botón ⧉ duplicar (copia símbolo + notas). Edit mode muestra notas guardadas con × para limpiar voicing. Drag & drop reescrito: indicador vertical azul de 2px entre chips en lugar de outline en el chip destino. `_insertBeforeChordId` global para coordinar drop en chip vs. drop en chordsRow. Ghost del drag sin controles (ocultos síncronamente en dragstart) y con opacity 0.2 (rAF).

Build: eliminado `build.js`, scripts npm: `build` (one-shot) y `dev` (`--watch=forever`). Claude lanza `npm run dev` en background al inicio de sesión.

Shortcuts: Space reasignado de "capture → history" a "play current chord" (reproduce notas activas en hold mode, o último acorde si no hay detección activa). `playNoteNames` importado en app.ts.

### 2026-05-22 — Repo cleanup (post session 14)

`server.js` eliminado (archivo antiguo no utilizado, nunca trackeado). `.gitignore` limpiado: eliminadas entradas `dist/` y `package-lock.json` — `dist/` ya estaba trackeado desde sesión 12, `package-lock.json` ahora trackeado para installs reproducibles. Repo listo para publicar como open source.

### 2026-05-22 — CoF audio + Song playback session 14

`playChord` reescrito para usar `chord.getNotes()` de UMT (misma fuente que staff/piano) con fallback a `QUALITY_INTERVALS`. Inicialización correcta: `ensureContext()` + `loadCurrentInstrument()` + cola en `pendingNotes` si instrumento aún carga. `QUALITY_INTERVALS` actualizado con nombres reales de UMT (`'dominant seventh'`, `'minor seventh'`, etc.).

CoF: single click en segmento mayor → selecciona clave + toca acorde + muestra en staff/análisis. Single click en menor/dim → toca acorde + muestra en staff (sin cambio de clave). `onKeyClick` extendido a `(key: string | null, chord?: string)`. Minor/dim segments siempre tienen path SVG con `data-minor-chord`/`data-dim-chord` y `pointer-events="all"`. Song chips: dblclick → `initAudioOnGesture()` + `playChord`. Bug corregido: `suffix7` y `relPos` movidos antes del `<path>` en el render loop del CoF (TDZ).

### 2026-05-22 — Audio session 13

Sistema de audio completo. WebAudioFont (versión 2.1.0 inexistente, CDN 404) reemplazado por soundfont-player@0.12.0 + FluidR3_GM. `audio.ts` reescrito: `playNote`, `playNoteByName`, `playMidiNotes`, `playChord`, `setInstrument`, `setVolume/getVolume`, cola de notas pendientes (`pendingNotes`) para cuando el instrumento aún carga. Selector de 128 instrumentos GM en 16 grupos optgroup. Slider de volumen. Barra de progreso animada (asintótica 0→90%, salta a 100% verde al cargar) con texto integrado dentro. Estado idle/loading/ready/error con callback. `setStatus('ready')` solo dispara tras `await audioCtx.resume()`.

MIDI note-on: `setNoteOnCallback` nuevo en `midi.ts` — dispara en cada note-on con el MIDI number exacto, antes del set de notas activas. Callback en app.ts llama `initAudioOnGesture()` + `playNote(note)`. Primer gesto MIDI inicializa AudioContext aunque no se haya hecho clic. Todas las funciones de reproducción usan `audioCtx.resume().then(...)`.

Botón ▶ y atajo `P`: tocan `lastChordMidi` (notas MIDI exactas del último acorde detectado, persiste tras soltar teclas). Piano instruments: Notae sigue renderizando el visual; post-procesamos los `rect` asignando `data-note` por orden conocido (28 blancas C2→B5, 20 negras Db2→Bb5). Click-to-play funciona. History chips: dblclick → playChord.

### 2026-05-22 — UI polish session 12

Layout estable: `.col-analysis` con ancho y alto calculados en JS proporcional a `analysisScale` (19px/pt ancho, fórmula `(N*1.6-0.4)*scale` alto). Filas condicionales (Sec, Colt, Neg, Subs) siempre en DOM con `—` cuando no hay datos — sin layout shift al aparecer análisis.

Piano + Fretboard unificados en panel "Instruments" con botones [Pi][Fr] para visibilidad individual (igual que Notation). `col-piano` / `col-neck` en state + localStorage. `#col-neck` con `padding-top: 50px`. Controles +/- para el neck (`neckSpacing`, rango 10–28, step 2, default 16), exportados desde `diagrams.ts`.

Modales: función `showModal(title, message, onConfirm, onCancel?)` con backdrop oscuro, mismo estilo que help popup. Reemplaza `confirm()` nativo. CSS: `.modal-backdrop`, `.modal-popup`, `.modal-btn-confirm`, `.modal-btn-cancel`.

Grid 5×2 para botones de campo de análisis. Tooltips completos en los botones toggle (antes usaban abreviaturas). Ancho fijo `.col-analysis` que escala con +/-.

CoF mejorado: V degree muestra "7" (dominante) en lugar de "maj7". Diatónicos resaltados: segmentos IV/I/V con fill/stroke más claro; anillo menor con paths SVG propios para diatónicos (ii/vi/iii) y acorde activo. Dim diatónico (vii°) con fill/stroke visible. Bug corregido: `isMinorChordHere` usaba root del anillo mayor en lugar de `minorKeys[i]`; `diatonicDimPos` era `activePos+5` (A#° en C mayor) — corregido a `activePos` (B°). Acorde activo menor ahora marca en anillo menor correcto.

`.gitignore` creado: `node_modules/`, `package-lock.json`, `dist/`.

### 2026-05-22 — UI controls session 11

Controles de Analysis: botones toggle para los 6 campos fijos (Roman, Func, Fig, Diat, Scl, Cad) y los 4 condicionales (Sec, Colt, Neg, Subs). Botones +/- para escala de fuente (8–20px, default 11). Toggle ▼/▲ para mostrar/ocultar el bloque de controles. Todo persiste en localStorage.

Visibilidad de columnas: 4 botones [St][An][CoF][Git] en el panel-header de Notation. Ocultan/muestran columnas enteras del flex. Persisten en localStorage.

Atajos de teclado centralizados: array `SHORTCUTS` como fuente única. Botón `?` redondo en toolbar. Popup flotante centrado con tabla kbd/acción. Se cierra con ×, tecla `?`, `Escape` (Escape cierra el popup primero y solo después limpia cursor).

Archivos modificados: `src/app.ts`, `src/types.ts`, `styles.css`, `dist/app.js`.

### 2026-05-21 — CSS refactor session 10

Estilos inline extraídos a `styles.css` externo (~280 líneas). Eliminado bloque `<style>` de `index.html`, añadido `<link>`. Todos los archivos TS actualizados: `app.ts`, `diagrams.ts`, `history.ts`, `song.ts`. Solo permanecen inline los estilos verdaderamente dinámicos (colores de calidad, colores de sección, border activo). Corregido además import `playChord` mal colocado en mitad de `song.ts` (movido al top). Build limpio, bundle funcional.

También en esta sesión: botones ▼/▲ para ocultar/mostrar controles de CoF y Guitar (con persistencia en localStorage).

### 2026-05-21 — UI overhaul session 9

Layout de 4 columnas y CoF completo:
- Notation panel reorganizado en 4 columnas: Staff | Analysis | CoF | Guitar (panel Analysis separado eliminado)
- Analysis siempre visible desde init — 6 campos fijos (Roman, Function, Fig. bass, Diatonic, Scales, Cadence) con "—" por defecto, campos condicionales al final (Secondary, Coltrane, Neg. harm., Subs.)
- chord-summary movido a dentro de la columna Staff (encima del pentagrama)
- CoF: botones +/- movidos debajo del diagrama (centrados). Tope máximo subido a 400px
- CoF: nuevos controles — b/# (enarmónicas), m (menores+dim toggle), ° (grados), 7 (7as)
- CoF: tercer anillo interior de disminuidos (B°, F#°… → Bø7 con 7as). Se oculta con toggle m
- CoF: grados en los 3 anillos — mayores (I, IV, V…), menores (vi, iii, ii…), dim (nombre+vii°)
- CoF: font scale default 0.55 (maj:7 min:6 dim:4) — elegido via popup de preview temporal
- Guitar: controles en 2 filas — fila 1: nav ‹/› + tamaño; fila 2: Off/diapasón/♩ + preset + ✎
- Guitar: botones Tuning→SVG diapasón, Notes→♩ Unicode. Tooltips en todos los controles
- Guitar: controles centrados bajo el diagrama

### 2026-05-21 — UI overhaul session 8

Cosmética y controles:
- Toggle icons unificados: todos los paneles usan ▲/▼ (applyPanelVisibility actualiza icono)
- Piano y Fretboard neck separados en paneles colapsables independientes, centrados
- Notation-content wrap + justify-content:center → responsive, apilan en móvil/tablet
- Guitar: 1 voicing + nav ‹ 1/n › (antes 3 en línea). Sin salto de layout
- Guitar controls debajo del diagrama, botones +/- de tamaño (guitarSpacing, persiste localStorage)
- Guitar: Off/Tuning/Notes para etiquetas de cuerda; preset dropdown (Standard/Drop D/Open G/Custom); botón ✎ para editar afinación cuerda a cuerda con auto-detección de preset
- Custom tuning: deriva posiciones de traste de las notas MIDI activas (en lugar de voicings UMT), refleja correctamente la afinación custom
- Chord summary encima del staff: nombre del acorde con badge de color, notas, chips de alternativas — siempre visible aunque notation esté colapsado
- min-height:130px en analysis-content para evitar salto de layout al aparecer/desaparecer análisis
- Grados en el neck (showDegrees) cuando hay acorde detectado; dotRadius mayor para texto
- Fixes: stale closure en wireGuitarControls → usa lastGuitarSymbol/lastNoteNames; select handler guardaba null antes de re-render

### 2026-05-21 — UI overhaul session 7

Diapasón horizontal completo junto al piano (renderNeck): muestra todas las posiciones de las notas pulsadas en el mástil (trastes 0–12, afinación estándar), puntos azules, orientación horizontal. Staff escalado a scale:2 (doble tamaño real de las notas). Guitar placeholder: fretboard vacío con opacity:0.35 en lugar de "—" texto. Correcciones CSS: min-height:220px en guitar-container evita que Notation crezca al aparecer los voicings; align-items:center en fila piano+neck centra el diapasón con el piano.

### 2026-05-21 — UI overhaul session 6

Layout 3 columnas en Notation: Staff | CoF | Guitar. Bugs corregidos: `applyPanelVisibility` restauraba `display:''` en vez de `display:flex/grid`, rompiendo el layout al cargar. ABCJS cambiado de `responsive:resize` a `staffwidth` directo (sin depender del CSS para calcular tamaño). Fretboard guitar: colores adaptados a fondo oscuro (chordNameColor, fretLabelColor, nutColor, indicatorColor). Guitar columna independiente (antes anidada dentro del CoF). Botones Staff +/- eliminados (feature descartada temporalmente — ver TODO). Guitar muestra placeholder "—" en init.

### 2026-05-21 — UI overhaul session 5

Layout refactorizado: staff + CoF en misma fila, análisis debajo (grid auto-fill, mínimo 3 por fila), piano debajo del análisis. Guitar (3 voicings en línea) debajo del CoF en la misma columna. Botones +/− para tamaño de staff y CoF (CoF escala bien; staff pendiente — ver TODO).

Guitar: reemplazada dependencia de tombatossals DB (fetch, 404, incompatibilidades) por `UMT.getFretboardVoicings(chord, UMT.GUITAR_STANDARD)` — sin servidor, sin fetch, funciona desde file://. Se muestran 3 voicings simultáneos en flex row.

Bugs corregidos: MIDI normal mode — notas ordenadas por pitch MIDI antes de pasar a UMT (fix para acordes que cambiaban al levantar y repulsar un dedo). Combinaciones no reconocidas por UMT (`?`) ya no crashean — se muestran las notas en staff/piano aunque no haya análisis armónico. Staff muestra clave según key seleccionada (`K:Gm`, `K:Bb`, etc.). Eliminado `4/4` del pentagrama (`M:none`). Análisis: grid `repeat(auto-fill, minmax(130px, 1fr))` — items en múltiples columnas sin scroll horizontal.

### 2026-05-21 — UI overhaul session 4

Bug crítico: ABC notation para bemoles/sostenidos estaba al revés — `'Bb'.replace('b','_')` daba `'B_'` (ABCJS ignoraba el `_` al final y mostraba B natural). Corrección: accidental ANTES de la letra (`_B`, `^C`). Eso explicaba "detecta como notas naturales" en el pentagrama. Piano confirmado OK — Notae convierte flats→sharps internamente. Staff a ancho completo del panel (~536px). CoF + guitar movidos a fila debajo del staff. CoF escalado a 160px. min-height:260px en analysis-content para reservar espacio y evitar desplazamiento del piano.

### 2026-05-21 — UI overhaul session 3

Bug fixes: normal mode stuck note (renderZone1Diagrams called on empty notes). Section DnD fixed (secHeader.draggable instead of wrap — e.target was always wrap). Guitar voicings fixed (chord.quality || 'major' catches empty string; fallback to minor/major on unknown quality). Piano extended to 4 octaves C2-B5. Zone1 layout restructured: notation+CoF+guitar LEFT, analysis RIGHT, piano full-width below. Staff min-height 200px. Cross-section chord drag (moveChordToPosition). History chips now draggable to song measures (dataTransfer 'application/x-history-chord'). Capture and →Song buttons removed from history. History right-click to remove chip. Form shown inline real-time in song header (no more button). Build clean.

### 2026-05-21 — UI overhaul session 2

Header (zone-nav) removed. Layout swapped: notation LEFT, analysis RIGHT. Piano fixed to C3-B4 range. Staff shows empty measure on load. Guitar hides silently when no voicing. All diagrams pre-rendered on init (no abrupt appearance). Transpose bug fixed (chord.root?.name ?? chord.root fallback). Drag & drop added: sections (⠿ handle) and chord chips within measure. System popups replaced with inline: showNotice() for alerts, confirmOnce() double-click for destructive actions, inline color picker (circles), inline repeat count input, inline paste textarea. Capture button renamed ⊕ → ⊙ with tooltip. Tooltips added to all buttons. Build clean (TypeScript + esbuild).

### 2026-05-21 — Visual + bug fixes, smoke test partial

Bug fixes: hold mode chord building (physicallyHeldNotes), stale handlers in song.ts (makeSongHandlers fresh each render), activeCursorId conflation history/song (historyActiveCursorId added), device listener accumulation, state restore on load (key, mode, panels). Arpeggio timer now clears display after 1.2s. Chord alternatives shown as visible chips (up to 8). Layout: staff+CoF inline, page scroll, nav bar added. Notation/analysis panels fixed to always-visible (not persisted). App confirmed working with MIDI controller.

Pending visual work (next session): notation panel LEFT / analysis RIGHT, staff bigger, piano range change less jarring, piano/CoF not appearing abruptly.

### 2026-05-21 — Full implementation

All 11 tasks executed in one session without agents. 23 unit tests passing (midi, analyzer, song). All spec gaps from Task 11 implemented inline (substitutions, capture flow, voicing button, quality badges, colour picker, form analysis, cursor insertion, browser warning). TypeScript clean. Ready for manual smoke test.

### 2026-05-20 — Project initiated

Full brainstorming and spec session. Spec written (rev 5), implementation plan written (11 tasks). Project name chosen: **Modus**. Folder created, git init'd. Ready for scaffold.
