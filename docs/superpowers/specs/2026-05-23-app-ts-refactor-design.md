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
- `CHORD_QUALITY_COLORS` map
- `renderChordSummary(detection, onAltSelect)`
- `renderZone1Analysis(detection, analysis, fieldsVisible, scale, activeKey)`
- `ANALYSIS_FIELD_KEYS`, `ANALYSIS_FIELD_LABELS`, `ANALYSIS_FIELD_TOOLTIPS` constants

**Interface:**

```ts
// analysis-panel.ts exports:

export const ANALYSIS_FIELD_KEYS: readonly AnalysisFieldKey[]
export const ANALYSIS_FIELD_LABELS: Record<AnalysisFieldKey, string>
export const ANALYSIS_FIELD_TOOLTIPS: Record<AnalysisFieldKey, string>

export function renderChordSummary(
  container: HTMLElement,
  detection: DetectionResult,
  onAltSelect: (index: number) => void
): void

export function renderZone1Analysis(
  container: HTMLElement,
  detection: DetectionResult,
  analysis: HarmonicAnalysis | null,
  fieldsVisible: Record<AnalysisFieldKey, boolean>,
  scale: number,
  activeKey: string | null
): void
```

**Why clean:** these are pure render functions — no access to app state, no side effects beyond DOM writes. `app.ts` calls them and passes all data explicitly. Zero circular dependency risk.

**Note on `renderChordSummary`:** currently it accesses `state.detection` and mutates `state.detection.selectedIndex` directly. The extraction makes this explicit: `onAltSelect(index)` callback fires, `app.ts` updates state and re-renders.

**Note on `AnalysisFieldKey`:** currently defined in `app.ts` as a derived type from `ANALYSIS_FIELD_KEYS`. Moves to `types.ts` (the shared type file) so both `analysis-panel.ts` and `app.ts` can import it without circular deps.

---

### 2. New file: `src/shortcuts.ts`

**What moves:**
- `SHORTCUTS` array (data only)
- `toggleHelp()`, `closeHelp()`, `closeHelpOnOutsideClick()`
- `helpVisible` flag

**Interface:**

```ts
// shortcuts.ts exports:
export function toggleHelp(): void
export function closeHelp(): void
```

**Why clean:** the help popup has no dependency on app state whatsoever. It only reads the `SHORTCUTS` constant (also internal). `app.ts` calls `toggleHelp()` from the keyboard handler and the `?` button. Two import lines, zero risk.

---

### 3. Internal split of `buildLayout()` in `app.ts`

`buildLayout()` stays in `app.ts` but gets broken into named sub-functions:

- `buildToolbar(): string` — returns toolbar HTML
- `buildNotationPanel(): string` — returns notation panel HTML
- `buildInstrumentsPanel(): string` — returns instruments panel HTML
- `wireLayoutEvents()` — all event handlers (CoF, analysis, neck, panels, key, audio)
- `buildLayout()` — orchestrates the above, calls `wireLayoutEvents()`

No new files. No new interfaces. Only readability — each sub-function is ~50–80 lines and has a clear name.

---

## What stays in `app.ts`

- `AppState` initialization and all state variables
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

## File size summary

| File | Before | After |
|---|---|---|
| `app.ts` | 969 | ~680 |
| `analysis-panel.ts` | — | ~130 |
| `shortcuts.ts` | — | ~60 |

Total lines increase slightly (imports/exports boilerplate) but each file has one clear job.

---

## Risk management

- `analysis-panel.ts` extraction: **low risk**. Pure DOM render functions. TypeScript will catch missing params at compile time.
- `shortcuts.ts` extraction: **very low risk**. Self-contained, no state access.
- `buildLayout` internal split: **very low risk**. Same scope, same variables, just named functions.
- No changes to `midi.ts`, `audio.ts`, `diagrams.ts`, `history.ts`, `song.ts`, `analyzer.ts`, `types.ts`.
- Build verification after each extraction before proceeding to the next.

---

## Order of operations

1. Extract `shortcuts.ts` (smallest, zero deps — good warm-up)
2. Build and verify
3. Extract `analysis-panel.ts`
4. Build and verify
5. Split `buildLayout()` internally
6. Final build and verify
7. Commit

Each step is independently verifiable. If any step fails, the previous step is still a clean state.
