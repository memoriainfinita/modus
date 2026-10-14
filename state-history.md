# Modus — history

What left `state.md`. Most recent first.

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
