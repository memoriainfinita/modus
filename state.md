# Modus — State

## System

- **Location:** `C:\Users\mykl\OneDrive\Scriptorium\DOCS\CODING GIT\MODUS\`
- **Status:** Active development — session 18 complete (docs audit + spec rewrite)
- **Dev command:** `npm run dev` (watch) · `npm run build` (one-shot) · `npx http-server . -p 8080`
- **Build workflow:** Claude lanza `npm run dev` en background con `run_in_background: true` al inicio de sesión — usa `--watch=forever` para que no pare al cerrarse stdin. No usar `!` en el chat para esto (bloquea). Claude usa `npm run build` solo para verificar errores puntuales.
- **Browser:** Chrome or Edge (Web MIDI API required)

---

## Project

**Modus** — real-time harmonic analysis tool for musicians.

Connect a MIDI controller, play notes, get instant chord detection and full harmonic analysis. A chord history and song structure builder extend the core. Serverless — pure HTML + JS, no backend.

Part of the **memoriainfinita** ecosystem alongside UMT and notae. GPL-3.0.

**Spec:** `docs/spec.md`  
**Plan:** `docs/plan.md` (11 tasks — completed, session 21-May-2026)

---

## Stack

| Layer | Technology |
|---|---|
| App | TypeScript → esbuild → `dist/app.js` |
| Theory | UMT via jsDelivr CDN (`UMT.*` global) |
| Diagrams | notae via jsDelivr CDN (`Notae.*` global) |
| Staff | abcjs 6.4.0 via CDN (`ABCJS.*` global) |
| MIDI | Web MIDI API (Chrome/Edge only) |
| Guitar voicings | `UMT.getFretboardVoicings(chord, UMT.GUITAR_STANDARD)` — no fetch |
| Audio | soundfont-player 0.12.0 + FluidR3_GM (npm) |
| Styles | Tailwind CSS |
| Persistence | localStorage |

### CDN script tags (index.html)

```html
<script src="https://cdn.jsdelivr.net/gh/memoriainfinita/UMT@main/dist/umt.js"></script>
<script src="https://cdn.jsdelivr.net/gh/memoriainfinita/notae@master/dist/notae.js"></script>
<script src="https://cdn.jsdelivr.net/npm/abcjs@6.4.0/dist/abcjs-basic-min.js"></script>
```

---

## UMT API — verified directly from source

These were confirmed by reading the actual TypeScript source of the UMT library. Do not assume — use these exact signatures.

```ts
// Convert note string to UMT Note object
UMT.parseNote(str: string, defaultOctave?: number): Note
// e.g. UMT.parseNote("C4"), UMT.parseNote("Bb3")

// Chord detection — takes Note[] objects, NOT strings
UMT.Harmony.detectChords(notes: Note[]): string[]
// Returns ranked chord name strings, e.g. ["Cmaj7", "Em/C", ...]

// Full harmonic analysis — returns .analysis (NOT .analyses)
UMT.Harmony.analyzeProgression(chords: Chord[], key: string): {
  analysis: ChordAnalysis[]   // ← .analysis, array
  modulations: ModulationEvent[]
  harmonicRhythm: number
}
// ChordAnalysis has: roman, degree, function ('T'|'S'|'D'|'unknown'),
// isDiatonic, isBorrowed, borrowedFrom, isSecondary, secondaryTarget, cadenceWithNext

UMT.FiguredBass.fromChord(chord: Chord, bassNote: Note): string

// Key detection (Krumhansl-Schmuckler)
UMT.KeyDetection.detect(notes: Note[]): { key: string; confidence: number }[]

// Substitutions — standalone function, NOT Harmony.getSubstitutions
UMT.getSubstitutions(chord: Chord, key: string): SubstitutionResult[]

// Other confirmed methods
UMT.Harmony.analyzeCadence(c1: Chord, c2: Chord, key: string): string
UMT.Harmony.getSuggestedScales(chord: Chord): { scale: string; hint?: string }[]
UMT.Harmony.getColtraneAxis(key: string): { root: string; majorThirds: [string,string,string] }
UMT.Harmony.getNegativeHarmony(chord: Chord, key: string): Chord  // 12-TET only
UMT.parseChordSymbol(symbol: string): Chord
```

### MIDI → UMT Note conversion

```ts
// Pitch spelling: flats by default (jazz convention)
const PITCH_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const noteName = PITCH_NAMES_FLAT[midiNote % 12] + (Math.floor(midiNote / 12) - 1)
// MIDI 60 → "C4", MIDI 58 → "Bb3"
const umtNote = UMT.parseNote(noteName)
```

---

## File Structure

```
modus/
  src/
    app.ts              — entry point, wires all modules
    types.ts            — shared types
    globals.d.ts        — CDN global declarations
    midi.ts             — Web MIDI setup, modes, callbacks
    analyzer.ts         — chord/interval detection via UMT
    diagrams.ts         — staff, piano, fretboard, CoF rendering
    history.ts          — chord history log
    song.ts             — song structure state and rendering
    audio.ts            — soundfont-player, instrument selector, playback
    shortcuts.ts        — SHORTCUTS data, help popup
    analysis-panel.ts   — analysis fields rendering (renderZone1Analysis)
  tests/
    analyzer.test.ts
    song.test.ts
  index.html   package.json   tsconfig.json   vitest.config.ts
  styles.css   (to be migrated to Tailwind)
  dist/app.js  (generated)
```

---

## Patterns

- [language] Everything in English: code, comments, documentation (spec, README, state.md), commit messages. This is a public GitHub project. Confirmed 2026-05.
- [typescript] esbuild watch mode, same toolchain as UMT and notae. Confirmed 2026-05.
- [naming] Project name: Modus (Latin — mode, measure). Confirmed 2026-05.
- [umt] detectChords takes Note[] not strings — always convert with parseNote first.
- [umt] analyzeProgression returns .analysis (array), not .analyses.
- [umt] getSubstitutions is top-level, not Harmony.getSubstitutions.

---

## History

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

---

## TODO

- [x] Manual smoke test — app confirmed working with MIDI controller
- [x] Layout: notación LEFT / análisis RIGHT
- [x] Piano: fixed range C3-B4 (no dynamic resize)
- [x] Piano y CoF: no aparecer de repente — renderZone1Diagrams([], null) on init
- [x] Header de navegación eliminado (zone-nav)
- [x] Staff más grande (ancho completo del panel, ~536px)
- [x] Piano 4 octavas (C2-B5)
- [x] Notas bemol/sostenido en pentagrama (bug ABC notation)
- [x] Guitar voicings — UMT.getFretboardVoicings, 3 en línea, sin fetch
- [x] Notas no reconocidas por UMT — se muestran en staff/piano con badge '?'
- [x] MIDI note ordering — fix para acordes variables al levantar/repulsar dedos
- [x] Clave en pentagrama según key selector
- [x] Quitar 4/4 del pentagrama (M:none)
- [x] Análisis grid multi-columna (auto-fill minmax 130px)
- [ ] Staff +/- size control — botones eliminados (no funcionaban). Pendiente: probar ABCJS `scale` option o CSS transform en el contenedor.
- [x] Guitar tuning selector — Standard/Drop D/Open G presets + custom por cuerda implementados
- [ ] showNoteNames en Notae — añadir opción a la librería para mostrar nota en los puntos del neck (actualmente usa showDegrees como interim)
- [x] Fretboard horizontal junto al piano — renderNeck(), trastes 0-12, puntos azules, misma fila que piano
- [x] Guitar diagrams: diagrama vacío en init — fretboard vacío opacity:0.35 como placeholder
- [x] Audio: soundfont-player (FluidR3_GM), selector 128 instrumentos GM, volumen, barra de carga
- [x] Piano instruments: SVG propio con click-to-play (Notae no genera data-note)
- [x] CoF: click en segmento mayor → reproducir el acorde (single click = select + play)
- [x] CoF: click en segmento menor y dim → reproducir el acorde (single click = play only)
- [ ] CoF: click en segmento menor → seleccionar modo menor (ej. click en Am pone "A Minor" como clave activa, resalta los mismos diatónicos que C Major pero con Am como i — el color de tónica se mueve a Am)
- [ ] Song: click en acorde → reproducir (actualmente solo dblclick, revisar si es suficiente o añadir botón ▶ por acorde)
- [ ] Revisión de organización de código — app.ts es el fichero principal pero ha crecido mucho. Evaluar si conviene extraer más responsabilidades a módulos (p.ej. zone renderers, keyboard shortcuts, panel state). Ver si la separación actual src/*.ts es la correcta o hay que reorganizar.
- [ ] Revisión de cobertura de tests — los tests actuales cubren analyzer y song (lógica pura). Pendiente: revisar qué casos críticos no están cubiertos y si hay lógica en audio.ts, diagrams.ts o app.ts que merezca test.
- [ ] UX audit — hay comportamientos no obvios repartidos por la app que el usuario no sabe que existen o no entiende: debounce de 800ms en historial, que el mismo acorde no se registra dos veces seguidas, dblclick para reproducir, ⊙ para captura MIDI, drag entre secciones, etc. Hacer un recorrido sistemático de toda la app e identificar qué necesita: cambio de comportamiento, tooltip, texto de ayuda en el popup ?, o nada. Priorizar lo que causa confusión activa.
- [ ] Revisar shortcuts completos — Space ya reproduce acorde actual/último pero P es redundante. Hacer revisión de todos los shortcuts: cuáles tienen sentido, cuáles sobran, cuáles faltan. Decidir asignaciones antes de tocar código.
- [ ] CoF audit completo — el comportamiento actual del CoF tiene varias cosas que no son las esperadas (más allá del TODO de modo menor ya anotado). Antes de tocar código, hacer una sesión de revisión: qué hace ahora vs. qué debería hacer, qué interacciones faltan o están mal, qué es confuso visualmente. Documentar y priorizar antes de implementar.
