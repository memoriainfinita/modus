# Refactor: app.ts — Approach A

**Date:** 2026-05-23  
**Scope:** app.ts (969 lines) → two file extractions + internal buildLayout split  
**Constraint:** App must stay fully functional throughout. No behavior changes.

---

## Problem

`app.ts` has grown to 969 lines. The two pain points are:

1. `buildLayout()` — 294-line function that builds all HTML AND wires all event handlers inline.
2. Analysis rendering logic — ~120 lines of `renderChordSummary` + `renderZone1Analysis` mixed in with coordination code.

The keyboard/help block (~80 lines) is self-contained and easy to move.

---

## Approach A — Two extractions + internal split

### 1. New file: `src/analysis-panel.ts`

**What moves:**
- `ANALYSIS_FIELD_KEYS`, `ANALYSIS_FIELD_LABELS`, `ANALYSIS_FIELD_TOOLTIPS` constants
- `AnalysisFieldKey` type (derived from `ANALYSIS_FIELD_KEYS` — stays co-located with the array)
- `CHORD_QUALITY_COLORS` map
- `getChordQuality(chordSymbol: string): string`
- `renderChordSummary(detection, onAltSelect)`
- `renderZone1Analysis(detection, analysis, fieldsVisible, scale, activeKey, onAltSelect)`

**Interface:**

```ts
// analysis-panel.ts exports:

export const ANALYSIS_FIELD_KEYS = ['roman','function','figbass','diatonic','scales','cadence','secondary','coltrane','negharm','subs'] as const
export type AnalysisFieldKey = (typeof ANALYSIS_FIELD_KEYS)[number]  // derived — single source of truth
export const ANALYSIS_FIELD_LABELS: Record<AnalysisFieldKey, string>
export const ANALYSIS_FIELD_TOOLTIPS: Record<AnalysisFieldKey, string>

export function getChordQuality(chordSymbol: string): string

// renderChordSummary is NOT exported — internal to analysis-panel.ts, called only by renderZone1Analysis
function renderChordSummary(detection: DetectionResult, onAltSelect: (index: number) => void): void

export function renderZone1Analysis(
  detection: DetectionResult,
  analysis: HarmonicAnalysis | null,
  fieldsVisible: Record<AnalysisFieldKey, boolean>,
  scale: number,
  activeKey: string | null,
  onAltSelect: (index: number) => void
): void
```

**DOM access inside `analysis-panel.ts`:** both functions query their containers internally via `document.getElementById` (no `$` shorthand — that's local to `app.ts`). `renderZone1Analysis` gets `#analysis-content` and `#col-analysis` (for column width update) internally. `renderChordSummary` gets `#chord-summary` internally.

**`renderZone1Analysis` calls `renderChordSummary` internally** (same as now). It passes `detection` and `onAltSelect` down to it. `app.ts` only calls `renderZone1Analysis` — not `renderChordSummary` directly.

**`onAltSelect` callback** (provided by `app.ts`): fires when user clicks an alt chord button. `app.ts` handles the full update cycle:
```ts
const onAltSelect = (idx: number) => {
  if (state.detection?.kind !== 'chord') return
  state.detection.selectedIndex = idx
  const sym = state.detection.candidates[idx]
  state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol())
  renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, state.activeKey, onAltSelect)
  renderZone1Diagrams(state.detection.notes, sym)
}
```

**`getChordQuality` is also used by `renderZone1Diagrams` in `app.ts`** — so it must be exported from `analysis-panel.ts` and imported back into `app.ts`.

**`types.ts` does NOT change.** `AnalysisFieldKey` stays in `analysis-panel.ts` co-located with the array it derives from. `app.ts` imports it from there.

---

### 2. New file: `src/shortcuts.ts`

**What moves:**
- `SHORTCUTS` array
- `helpVisible` flag (private)
- `toggleHelp()`
- `closeHelp()`
- `closeHelpOnOutsideClick()` (private)

**Interface:**

```ts
// shortcuts.ts exports:
export function toggleHelp(): void
export function closeHelp(): boolean  // returns true if popup was open and got closed
```

**`closeHelp` returns `boolean`** to preserve the Escape key behavior. Current logic in `wireKeyboard`:
```ts
case 'Escape':
  if (helpVisible) { closeHelp(); break }  // closes help, stops — does NOT clear cursors
  state.activeCursorId = null              // only runs if help was already closed
```
After extraction, `helpVisible` is private to `shortcuts.ts`. The return value replaces the direct read:
```ts
case 'Escape':
  if (closeHelp()) break  // if help was open, closeHelp closed it and returns true → stop
  state.activeCursorId = null  // only runs if help wasn't open
```

**`app.ts` changes:** imports `toggleHelp` and `closeHelp` from `./shortcuts`. Call sites:
- `$('btn-help').addEventListener('click', toggleHelp)`
- `wireKeyboard`: Escape handler uses `if (closeHelp()) break`; `?` key calls `toggleHelp()`

No state access. No circular deps. `SHORTCUTS` and `helpVisible` stay private inside `shortcuts.ts`.

---

### 3. Internal split of `buildLayout()` in `app.ts`

`buildLayout()` stays in `app.ts` but gets broken into named sub-functions. All sub-functions remain in `app.ts` scope — they access module-level variables (`state.panels`, `cofAccidental`, `analysisFieldsVisible`, etc.) via closure as they do now.

Sub-functions:
- `buildToolbar(): string` — toolbar HTML (MIDI controls, key select, audio, help button)
- `buildNotationPanel(): string` — notation panel HTML (staff, analysis, CoF, guitar columns)
- `buildInstrumentsPanel(): string` — instruments panel HTML (piano + neck)
- `buildZoneHeaders(): void` — injects zone2 and zone3 headers
- `wireLayoutEvents(): void` — all event handlers (CoF controls, analysis field buttons, neck spacing, column visibility, key select, panel toggles, audio instrument/volume)
- `buildLayout()` — calls the above in order

**`buildNotationPanel` uses `ANALYSIS_FIELD_KEYS`, `ANALYSIS_FIELD_LABELS`, `ANALYSIS_FIELD_TOOLTIPS`** to render the field toggle buttons. These will be imported from `analysis-panel.ts`. No new coupling — it's data, not behavior.

No new files. Only readability improvement.

---

## What stays in `app.ts`

- All module-level state variables (`state`, `cofSize`, `cofAccidental`, `analysisFieldsVisible`, `analysisScale`, etc.)
- `init()`
- `makeSongHandlers()`
- `onNoteChange()` (MIDI callback, chord detection flow)
- `renderZone1Diagrams()`, `reRenderDiagrams()`
- `renderZone2()`, `renderZone3()`, `refreshAll()`
- `triggerChordAnalysis()`
- `sendToSong()`, `findChordAfter()`
- `onHistoryChange()`, `refreshAutoKey()`
- `applyPanelVisibility()`
- `showModal()`
- `refreshDeviceDropdown()`, `showMidiBanner()`
- `wireKeyboard()`, `setModeBtn()`
- `buildLayout()` (split internally)

**Target size after refactor:** ~680 lines.

---

## Imports summary after refactor

### `app.ts` new imports from `analysis-panel.ts`:
```ts
import {
  ANALYSIS_FIELD_KEYS, ANALYSIS_FIELD_LABELS, ANALYSIS_FIELD_TOOLTIPS,
  getChordQuality, renderZone1Analysis
} from './analysis-panel'
import type { AnalysisFieldKey } from './analysis-panel'
```

### `app.ts` new imports from `shortcuts.ts`:
```ts
import { toggleHelp, closeHelp } from './shortcuts'
```

---

## File size summary

| File | Before | After |
|---|---|---|
| `app.ts` | 969 | ~680 |
| `analysis-panel.ts` | — | ~140 |
| `shortcuts.ts` | — | ~60 |
| `types.ts` | 123 | 123 (unchanged) |

---

## Risk management

- `analysis-panel.ts` extraction: **low risk**. TypeScript will catch missing/wrong params at `npm run build`. The `onAltSelect` callback pattern is the only new interface — test it first.
- `shortcuts.ts` extraction: **very low risk**. Self-contained, no state access.
- `buildLayout` internal split: **very low risk**. Same scope, same variables, just named functions.
- No changes to `midi.ts`, `audio.ts`, `diagrams.ts`, `history.ts`, `song.ts`, `analyzer.ts`, `types.ts`.

**Pre-existing issue (not in scope):** `AppState.panels` in `types.ts` declares `piano` and `neck` but `app.ts` uses `instruments`, `colPiano`, `colNeck`. Type mismatch predates this refactor — do not fix here.

---

## Order of operations

1. Extract `shortcuts.ts` — move SHORTCUTS + help popup functions
2. `npm run build` — verify zero TypeScript errors
3. Extract `analysis-panel.ts` — move constants, getChordQuality, renderChordSummary, renderZone1Analysis; update call sites in `app.ts`
4. `npm run build` — verify zero TypeScript errors
5. Split `buildLayout()` internally into sub-functions
6. `npm run build` — final verify
7. Manual smoke test — open app, play MIDI notes, check analysis panel renders, check alt chord selection, check shortcuts popup
8. Commit

Each step leaves the build in a clean, working state. If step N fails, revert step N only.
