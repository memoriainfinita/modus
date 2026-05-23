# app.ts Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break app.ts (969 lines) into focused modules without changing any behavior.

**Architecture:** Three steps in isolation order — extract `shortcuts.ts` (self-contained, no state), extract `analysis-panel.ts` (pure render functions with explicit params), then split `buildLayout()` internally into named sub-functions. Each step is independently verifiable with `npm run build`.

**Tech Stack:** TypeScript, esbuild (`npm run build` / `npm run dev`), browser manual test.

> **Note on TDD:** this is a pure refactor — no new behavior. The "test" is TypeScript compilation (`npm run build` must produce zero errors after each task) plus a manual smoke test at the end. Do not add unit tests during this refactor.

---

## Files

| File | Action | Result |
|---|---|---|
| `src/shortcuts.ts` | Create | help popup + SHORTCUTS data |
| `src/analysis-panel.ts` | Create | renderZone1Analysis, renderChordSummary (private), getChordQuality, field constants |
| `src/app.ts` | Modify | remove extracted code, update imports, add onAltSelect function, split buildLayout internally |

---

## Task 1: Create `src/shortcuts.ts`

**Files:**
- Create: `src/shortcuts.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Create `src/shortcuts.ts`**

Create the file with this exact content:

```ts
const SHORTCUTS: { key: string; action: string }[] = [
  { key: 'Space', action: 'Play current chord (or last if none active)' },
  { key: 'H',     action: 'Toggle Hold mode' },
  { key: 'A',     action: 'Toggle Arpeggio mode' },
  { key: 'S',     action: 'Send history chip → Song' },
  { key: 'C',     action: 'Clear history' },
  { key: 'Esc',   action: 'Clear cursor / capture' },
  { key: '1–9',   action: 'Select chord candidate' },
  { key: 'P',     action: 'Play current chord' },
  { key: '?',     action: 'Show / hide this panel' },
]

let helpVisible = false

export function closeHelp(): boolean {
  if (!helpVisible) return false
  helpVisible = false
  document.getElementById('shortcut-help')?.remove()
  document.removeEventListener('mousedown', closeHelpOnOutsideClick)
  return true
}

export function toggleHelp() {
  if (helpVisible) { closeHelp(); return }
  helpVisible = true
  const popup = document.createElement('div')
  popup.id = 'shortcut-help'
  popup.className = 'shortcut-help-popup'
  popup.innerHTML = `
    <div class="shortcut-help-header">
      <span>Keyboard shortcuts</span>
      <button class="shortcut-help-close">×</button>
    </div>
    ${SHORTCUTS.map(s => `
      <div class="shortcut-row">
        <kbd class="shortcut-key">${s.key}</kbd>
        <span class="shortcut-action">${s.action}</span>
      </div>`).join('')}`
  document.body.appendChild(popup)
  popup.querySelector('.shortcut-help-close')!.addEventListener('click', closeHelp)
  document.addEventListener('mousedown', closeHelpOnOutsideClick)
}

function closeHelpOnOutsideClick(e: MouseEvent) {
  const popup = document.getElementById('shortcut-help')
  if (popup && !popup.contains(e.target as Node)) closeHelp()
}
```

- [ ] **Step 2: Add import to `src/app.ts`**

At the top of `src/app.ts`, after the existing imports, add:

```ts
import { toggleHelp, closeHelp } from './shortcuts'
```

- [ ] **Step 3: Remove SHORTCUTS and help functions from `src/app.ts`**

Delete these blocks from `src/app.ts`:

Block A — lines 43–55 (SHORTCUTS array):
```ts
// ─── Keyboard shortcuts registry ─────────────────────────────────────────────

const SHORTCUTS: { key: string; action: string }[] = [
  { key: 'Space', action: 'Play current chord (or last if none active)' },
  ...
]
```

Block B — lines 113–145 (`helpVisible`, `closeHelp`, `toggleHelp`, `closeHelpOnOutsideClick`):
```ts
let helpVisible = false

function closeHelp() { ... }
function toggleHelp() { ... }
function closeHelpOnOutsideClick(e: MouseEvent) { ... }
```

- [ ] **Step 4: Update the Escape handler in `wireKeyboard`**

Find this in `wireKeyboard` (currently around line 942):
```ts
      case 'Escape':
        if (helpVisible) { closeHelp(); break }
        state.activeCursorId = null
        state.captureTargetId = null
        renderZone3(); break
```

Replace with:
```ts
      case 'Escape':
        if (closeHelp()) break
        state.activeCursorId = null
        state.captureTargetId = null
        renderZone3(); break
```

- [ ] **Step 5: Verify build**

```
npm run build
```

Expected: zero TypeScript errors, `dist/app.js` generated. If there are errors, they will name the exact line — fix before continuing.

- [ ] **Step 6: Commit**

```
git add src/shortcuts.ts src/app.ts
git commit -m "refactor: extract shortcuts.ts — help popup and SHORTCUTS data"
```

---

## Task 2: Create `src/analysis-panel.ts`

**Files:**
- Create: `src/analysis-panel.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Create `src/analysis-panel.ts`**

Create the file with this exact content:

```ts
import type { DetectionResult, HarmonicAnalysis } from './types'

// ─── Field config ─────────────────────────────────────────────────────────────

export const ANALYSIS_FIELD_KEYS = ['roman','function','figbass','diatonic','scales','cadence','secondary','coltrane','negharm','subs'] as const
export type AnalysisFieldKey = (typeof ANALYSIS_FIELD_KEYS)[number]

export const ANALYSIS_FIELD_LABELS: Record<AnalysisFieldKey, string> = {
  roman: 'Roman', function: 'Func', figbass: 'Fig', diatonic: 'Diat', scales: 'Scl', cadence: 'Cad',
  secondary: 'Sec', coltrane: 'Colt', negharm: 'Neg', subs: 'Subs'
}

export const ANALYSIS_FIELD_TOOLTIPS: Record<AnalysisFieldKey, string> = {
  roman: 'Roman numeral', function: 'Harmonic function', figbass: 'Figured bass',
  diatonic: 'Diatonic / borrowed', scales: 'Suggested scales', cadence: 'Cadence',
  secondary: 'Secondary dominant', coltrane: 'Coltrane axis', negharm: 'Negative harmony', subs: 'Substitutions'
}

// ─── Chord quality ────────────────────────────────────────────────────────────

const CHORD_QUALITY_COLORS: Record<string, string> = {
  major: '#f59e0b', minor: '#3b82f6', 'dominant seventh': '#ef4444',
  'major seventh': '#f59e0b', 'minor seventh': '#3b82f6',
  diminished: '#7c3aed', 'diminished seventh': '#7c3aed',
  'half-diminished seventh': '#7c3aed', augmented: '#0d9488',
  sus: '#6b7280',
}

export function getChordQuality(chordSymbol: string): string {
  try { return UMT.parseChordSymbol(chordSymbol).quality?.toLowerCase() ?? '' } catch { return '' }
}

// ─── Chord summary (private — called only by renderZone1Analysis) ─────────────

function renderChordSummary(
  detection: DetectionResult,
  onAltSelect: (index: number) => void
) {
  const el = document.getElementById('chord-summary')
  if (!el) return
  if (!detection || detection.kind !== 'chord') { el.innerHTML = ''; return }

  const chordName = detection.candidates[detection.selectedIndex]
  const color = CHORD_QUALITY_COLORS[getChordQuality(chordName)] ?? '#6b7280'
  const notes = detection.notes.map(n => n.replace(/(-?\d+)$/, '')).join(' · ')
  const alts = detection.candidates.slice(1, 7)

  el.innerHTML = `
    <div class="chord-summary-row">
      <span class="chord-name-badge" style="background:${color}22;border-left:3px solid ${color}">${chordName}</span>
      <span class="chord-notes">${notes}</span>
      ${alts.map((c, i) =>
        `<button class="alt-chord-btn alt-chord-sum" data-idx="${i + 1}">${c}</button>`
      ).join('')}
    </div>`

  el.querySelectorAll<HTMLElement>('.alt-chord-sum').forEach(btn => {
    btn.addEventListener('click', () => onAltSelect(parseInt(btn.dataset.idx!)))
  })
}

// ─── Analysis panel ───────────────────────────────────────────────────────────

export function renderZone1Analysis(
  detection: DetectionResult,
  analysis: HarmonicAnalysis | null,
  fieldsVisible: Record<AnalysisFieldKey, boolean>,
  scale: number,
  onAltSelect: (index: number) => void
) {
  renderChordSummary(detection, onAltSelect)

  const el = document.getElementById('analysis-content')
  if (!el) return

  el.style.fontSize = scale + 'px'
  const visibleCount = ANALYSIS_FIELD_KEYS.filter(f => fieldsVisible[f]).length
  el.style.height = Math.ceil((visibleCount * 1.6 - 0.4) * scale) + 'px'
  const colEl = document.getElementById('col-analysis')
  if (colEl) { const w = Math.round(scale * 19) + 'px'; colEl.style.width = w; colEl.style.flex = `0 0 ${w}` }

  const row = (label: string, val: string) =>
    `<div class="analysis-row">
      <span class="analysis-label">${label}</span>
      <span class="analysis-value">${val}</span>
    </div>`
  const maybeRow = (f: AnalysisFieldKey, label: string, val: string) =>
    fieldsVisible[f] ? row(label, val) : ''
  const conditionalRow = (f: AnalysisFieldKey, label: string, val: string | null) =>
    fieldsVisible[f] ? row(label, val ?? '—') : ''

  let roman = '—', func_ = '—', figuredBass = '—', diatonic = '—', scales = '—', cadence = '—'
  let secondary: string | null = null, coltrane: string | null = null
  let negharm: string | null = null, subs: string | null = null
  let extra = ''

  if (detection?.kind === 'note') {
    extra = row('Note', `${detection.noteName} · MIDI ${detection.midiNumber}`)
  } else if (detection?.kind === 'interval') {
    extra = row('Interval', `${detection.intervalName} · ${detection.semitones} st`) + row('Inversion', detection.inversionName)
  } else if (detection?.kind === 'chord' && analysis) {
    roman = analysis.roman
    func_ = ({ T: 'Tonic', S: 'Subdominant', D: 'Dominant', unknown: 'Unknown' } as Record<string, string>)[analysis.function]
    figuredBass = analysis.figuredBass || '—'
    diatonic = analysis.isDiatonic ? 'Yes' : analysis.isBorrowed ? `Borrowed (${analysis.borrowedFrom ?? '?'})` : 'Chromatic'
    scales = analysis.suggestedScales.slice(0, 4).join(', ') || '—'
    cadence = analysis.cadence || '—'
    if (analysis.isSecondary) secondary = `→ ${analysis.secondaryTarget}`
    if (analysis.coltraneAxis) coltrane = analysis.coltraneAxis.join(' · ')
    if (analysis.negativeHarmony) negharm = analysis.negativeHarmony
    if (analysis.substitutions?.length) subs = analysis.substitutions.join(', ')
  }

  el.innerHTML =
    maybeRow('roman', 'Roman', roman) +
    maybeRow('function', 'Function', func_) +
    maybeRow('figbass', 'Fig. bass', figuredBass) +
    maybeRow('diatonic', 'Diatonic', diatonic) +
    maybeRow('scales', 'Scales', scales) +
    maybeRow('cadence', 'Cadence', cadence) +
    conditionalRow('secondary', 'Secondary', secondary) +
    conditionalRow('coltrane', 'Coltrane', coltrane) +
    conditionalRow('negharm', 'Neg. harm.', negharm) +
    conditionalRow('subs', 'Subs.', subs) +
    extra
}
```

- [ ] **Step 2: Update imports in `src/app.ts`**

Replace the block at the top of app.ts that starts `// ─── Size preferences ───` — specifically, add these imports after the existing import block:

```ts
import {
  ANALYSIS_FIELD_KEYS, ANALYSIS_FIELD_LABELS, ANALYSIS_FIELD_TOOLTIPS,
  getChordQuality, renderZone1Analysis
} from './analysis-panel'
import type { AnalysisFieldKey } from './analysis-panel'
```

- [ ] **Step 3: Remove extracted code from `src/app.ts`**

Delete these blocks from `src/app.ts` (they are now in `analysis-panel.ts`):

Block A — `ANALYSIS_FIELD_KEYS`, `ANALYSIS_FIELD_LABELS`, `ANALYSIS_FIELD_TOOLTIPS`, `AnalysisFieldKey` (lines 18–28):
```ts
const ANALYSIS_FIELD_KEYS = ['roman', 'function', ...] as const
type AnalysisFieldKey = (typeof ANALYSIS_FIELD_KEYS)[number]
const ANALYSIS_FIELD_LABELS: ...
const ANALYSIS_FIELD_TOOLTIPS: ...
```

Block B — `analysisFieldsVisible` type annotation update. The variable stays in `app.ts` but its type `Record<AnalysisFieldKey, boolean>` now resolves via the import. No code change needed here — just ensure the import is present.

Block C — `CHORD_QUALITY_COLORS` map (lines 670–676):
```ts
const CHORD_QUALITY_COLORS: Record<string, string> = { ... }
```

Block D — `getChordQuality` function (lines 666–668):
```ts
function getChordQuality(chordSymbol: string): string { ... }
```

Block E — `renderChordSummary` function (lines 678–709).

Block F — `renderZone1Analysis` function (lines 711–769).

- [ ] **Step 4: Add `onAltSelect` as a named module-level function in `src/app.ts`**

Add this function after `getLastHistorySymbol` (around line 629 in the original, now earlier after deletions):

```ts
function onAltSelect(idx: number) {
  if (state.detection?.kind !== 'chord') return
  state.detection.selectedIndex = idx
  const sym = state.detection.candidates[idx]
  state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol())
  renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
  renderZone1Diagrams(state.detection.notes, sym)
}
```

- [ ] **Step 5: Update all `renderZone1Analysis()` call sites in `src/app.ts`**

There are **10 call sites**. Each bare `renderZone1Analysis()` call becomes `renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)`.

> Note: `activeKey` is NOT a parameter — it is not used inside the function. 5 params only.

**Call site 1** — `init()` — initial render on load:
```ts
// before
renderZone1Diagrams([], null)
renderZone1Analysis()
// after
renderZone1Diagrams([], null)
renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
```

**Call site 2** — `makeSongHandlers` → `onChordClick`:
```ts
// before
renderZone1Analysis()
// after
renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
```

**Call site 3** — `btn-analysis-minus` handler in `buildLayout`:
```ts
// before
$('btn-analysis-minus').addEventListener('click', () => {
  analysisScale = Math.max(8, analysisScale - 1)
  localStorage.setItem('analysis-scale', String(analysisScale))
  renderZone1Analysis()
})
// after
$('btn-analysis-minus').addEventListener('click', () => {
  analysisScale = Math.max(8, analysisScale - 1)
  localStorage.setItem('analysis-scale', String(analysisScale))
  renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
})
```

**Call site 4** — `btn-analysis-plus` handler in `buildLayout`:
```ts
// before
$('btn-analysis-plus').addEventListener('click', () => {
  analysisScale = Math.min(20, analysisScale + 1)
  localStorage.setItem('analysis-scale', String(analysisScale))
  renderZone1Analysis()
})
// after
$('btn-analysis-plus').addEventListener('click', () => {
  analysisScale = Math.min(20, analysisScale + 1)
  localStorage.setItem('analysis-scale', String(analysisScale))
  renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
})
```

**Call site 5** — `ANALYSIS_FIELD_KEYS.forEach` handler in `buildLayout`:
```ts
// before
ANALYSIS_FIELD_KEYS.forEach(f => {
  $(`btn-field-${f}`).addEventListener('click', () => {
    analysisFieldsVisible[f] = !analysisFieldsVisible[f]
    localStorage.setItem(`analysis-field-${f}`, String(analysisFieldsVisible[f]))
    updateAnalysisFieldButtons()
    renderZone1Analysis()
  })
})
// after
ANALYSIS_FIELD_KEYS.forEach(f => {
  $(`btn-field-${f}`).addEventListener('click', () => {
    analysisFieldsVisible[f] = !analysisFieldsVisible[f]
    localStorage.setItem(`analysis-field-${f}`, String(analysisFieldsVisible[f]))
    updateAnalysisFieldButtons()
    renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
  })
})
```

**Call site 6** — `onNoteChange`:
```ts
// before (near end of onNoteChange)
renderZone1Analysis()
// after
renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
```

**Call site 7** — `renderZone2` → `onChipClick` callback:
```ts
// before
renderZone1Analysis()
renderZone1Diagrams(entry.notes, entry.symbol)
// after
renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
renderZone1Diagrams(entry.notes, entry.symbol)
```

**Call site 8** — `refreshAll`:
```ts
// before
function refreshAll() {
  reRenderDiagrams()
  renderZone1Analysis()
  renderZone2()
  renderZone3()
}
// after
function refreshAll() {
  reRenderDiagrams()
  renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
  renderZone2()
  renderZone3()
}
```

**Call site 9** — `triggerChordAnalysis`:
```ts
// before
state.detection = { kind: 'chord', notes: [], candidates: [symbol], selectedIndex: 0 }
renderZone1Analysis()
// after
state.detection = { kind: 'chord', notes: [], candidates: [symbol], selectedIndex: 0 }
renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
```

**Call site 10** — `refreshAutoKey`:
```ts
// before
state.analysis = buildHarmonicAnalysis(sym, auto, getLastHistorySymbol())
renderZone1Analysis()
// after
state.analysis = buildHarmonicAnalysis(sym, auto, getLastHistorySymbol())
renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
```

**Call site 11 — wait:** the `wireKeyboard` 1–9 key handler also calls `renderZone1Analysis`. Find this block inside `wireKeyboard`:
```ts
// before
        if (e.key >= '1' && e.key <= '9') {
          const idx = parseInt(e.key) - 1
          if (state.detection?.kind === 'chord' && idx < state.detection.candidates.length) {
            state.detection.selectedIndex = idx
            const sym = state.detection.candidates[idx]
            state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol())
            renderZone1Analysis()
          }
        }
// after
        if (e.key >= '1' && e.key <= '9') {
          const idx = parseInt(e.key) - 1
          if (state.detection?.kind === 'chord' && idx < state.detection.candidates.length) {
            state.detection.selectedIndex = idx
            const sym = state.detection.candidates[idx]
            state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol())
            renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
          }
        }
```

> Total: 11 external call sites. TypeScript strict mode will catch any missed ones at build time — the error will name the exact line.

- [ ] **Step 6: Verify build**

```
npm run build
```

Expected: zero TypeScript errors. If errors appear, they name the exact symbol and file — fix them before continuing. Common issues: forgotten call site, missing import, wrong param count.

- [ ] **Step 7: Commit**

```
git add src/analysis-panel.ts src/app.ts
git commit -m "refactor: extract analysis-panel.ts — renderZone1Analysis, getChordQuality, field constants"
```

---

## Task 3: Split `buildLayout()` internally in `src/app.ts`

**Files:**
- Modify: `src/app.ts` only

No new files. No interface changes. This is readability only — same scope, same variables, just named sub-functions.

- [ ] **Step 1: Extract `buildToolbar()` from `buildLayout`**

Find the opening of `buildLayout` and the toolbar HTML. Extract it to a new function placed just before `buildLayout`:

```ts
function buildToolbar(): string {
  return `
    <div id="z1-toolbar" class="toolbar">
      <span id="midi-status" class="midi-status">MIDI: —</span>
      <select id="midi-device" class="ctrl-select"></select>
      <button id="btn-normal" class="mode-btn" data-mode="normal">Normal</button>
      <button id="btn-hold" class="mode-btn" data-mode="hold">Hold</button>
      <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio">Arpeggio</button>
      <select id="key-select" class="ctrl-select">
        <option value="">Key: Auto</option>
        ${['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'].flatMap(r =>
          [`<option value="${r} Major">${r} Major</option>`, `<option value="${r} Minor">${r} Minor</option>`]
        ).join('')}
      </select>
      <span id="auto-key-label" class="auto-key-label"></span>
      <span class="toolbar-sep"></span>
      <div id="audio-progress" class="audio-progress" title="Soundfont status">
        <div id="audio-progress-fill" class="audio-progress-fill"></div>
        <span id="audio-status" class="audio-status">♪ idle</span>
      </div>
      <button id="btn-play-chord" class="ctrl-btn" title="Play current chord (P)">▶</button>
      <select id="audio-instrument" class="ctrl-select" title="Soundfont instrument">
        ${GM_INSTRUMENT_GROUPS.map(g =>
          `<optgroup label="${g.label}">${g.instruments.map(i =>
            `<option value="${i}"${i === getCurrentInstrument() ? ' selected' : ''}>${i.replace(/_/g,' ')}</option>`
          ).join('')}</optgroup>`
        ).join('')}
      </select>
      <input id="audio-volume" type="range" min="0" max="1" step="0.05" value="${getVolume()}" title="Volume" class="volume-slider">
      <button id="btn-help" class="help-btn" title="Keyboard shortcuts">?</button>
    </div>`
}
```

- [ ] **Step 2: Extract `buildNotationPanel()` from `buildLayout`**

```ts
function buildNotationPanel(): string {
  return `
    <div id="notation-panel" class="zone-panel">
      <div class="panel-header">
        <span>Notation</span>
        <div class="col-vis-row">
          <button class="col-vis-btn${state.panels.colStaff ? ' active' : ''}" data-col="colStaff" title="Staff">St</button>
          <button class="col-vis-btn${state.panels.colAnalysis ? ' active' : ''}" data-col="colAnalysis" title="Analysis">An</button>
          <button class="col-vis-btn${state.panels.colCoF ? ' active' : ''}" data-col="colCoF" title="Circle of Fifths">CoF</button>
          <button class="col-vis-btn${state.panels.colGuitar ? ' active' : ''}" data-col="colGuitar" title="Guitar">Git</button>
        </div>
        <button class="toggle-btn" data-panel="notation">▼</button>
      </div>
      <div id="notation-content">
        <div class="col-auto" id="col-staff">
          <div class="col-label">Staff</div>
          <div id="chord-summary"></div>
          <div id="staff-container"></div>
        </div>
        <div class="col-analysis" id="col-analysis">
          <div class="col-header">
            <div class="col-label">Analysis</div>
            <button class="toggle-btn small" data-panel="analysisControls">▼</button>
          </div>
          <div id="analysis-content"></div>
          <div id="analysis-controls">
            <div class="ctrl-row">
              <button id="btn-analysis-minus" class="size-ctrl-btn" title="Smaller">−</button>
              <button id="btn-analysis-plus"  class="size-ctrl-btn" title="Larger">+</button>
            </div>
            <div class="ctrl-row" style="display:grid;grid-template-columns:repeat(5,1fr);gap:2px">
              ${ANALYSIS_FIELD_KEYS.map(f =>
                `<button id="btn-field-${f}" class="size-ctrl-btn${analysisFieldsVisible[f] ? ' active' : ''}"
                  title="${ANALYSIS_FIELD_TOOLTIPS[f]}">${ANALYSIS_FIELD_LABELS[f]}</button>`
              ).join('')}
            </div>
          </div>
        </div>
        <div class="col-auto" id="col-cof">
          <div class="col-header">
            <div class="col-label">CoF</div>
            <button class="toggle-btn small" data-panel="cofControls">▼</button>
          </div>
          <div id="cof-container"></div>
          <div id="cof-controls">
            <div class="ctrl-row">
              <button id="btn-cof-minus" class="size-ctrl-btn" title="Smaller">−</button>
              <button id="btn-cof-plus"  class="size-ctrl-btn" title="Larger">+</button>
            </div>
            <div class="ctrl-row">
              <button id="btn-cof-flat"   class="size-ctrl-btn" title="Show flat enharmonics (Gb, Db…)">b</button>
              <button id="btn-cof-sharp"  class="size-ctrl-btn" title="Show sharp enharmonics (F#, C#…)">#</button>
              <button id="btn-cof-minor"  class="size-ctrl-btn" title="Show/hide minor and diminished rings">m</button>
              <button id="btn-cof-deg"    class="size-ctrl-btn" title="Show scale degrees (I, IV, V…)">°</button>
              <button id="btn-cof-7"      class="size-ctrl-btn" title="Show 7th chords (maj7, m7, ø7)">7</button>
            </div>
          </div>
        </div>
        <div class="col-auto" id="col-guitar">
          <div class="col-header">
            <div class="col-label">Guitar</div>
            <button class="toggle-btn small" data-panel="guitarControls">▼</button>
          </div>
          <div id="guitar-container"></div>
        </div>
      </div>
    </div>`
}
```

- [ ] **Step 3: Extract `buildInstrumentsPanel()` from `buildLayout`**

```ts
function buildInstrumentsPanel(): string {
  return `
    <div id="instruments-panel" class="zone-panel">
      <div class="panel-header">
        <span>Instruments</span>
        <div class="col-vis-row">
          <button class="col-vis-btn${state.panels.colPiano ? ' active' : ''}" data-col="colPiano" title="Piano">Pi</button>
          <button class="col-vis-btn${state.panels.colNeck  ? ' active' : ''}" data-col="colNeck"  title="Fretboard">Fr</button>
        </div>
        <button class="toggle-btn" data-panel="instruments">▼</button>
      </div>
      <div id="instruments-content">
        <div id="col-piano"><div id="piano-container"></div></div>
        <div id="col-neck">
          <div id="neck-container"></div>
          <div class="ctrl-row" style="justify-content:center;margin-top:4px">
            <button id="btn-neck-minus" class="size-ctrl-btn" title="Smaller">−</button>
            <button id="btn-neck-plus"  class="size-ctrl-btn" title="Larger">+</button>
          </div>
        </div>
      </div>
    </div>`
}
```

- [ ] **Step 4: Extract `buildZoneHeaders()` from `buildLayout`**

```ts
function buildZoneHeaders() {
  $('zone2').innerHTML = `
    <div class="zone-header">
      <span class="zone-title">History</span>
      <button class="toggle-btn" data-panel="history">▼</button>
    </div>
    <div id="zone2-content"></div>`

  $('zone3').innerHTML = `
    <div class="zone-header">
      <span class="zone-title">Song Structure</span>
      <button class="toggle-btn" data-panel="song">▼</button>
    </div>
    <div id="zone3-content"></div>`
}
```

- [ ] **Step 5: Extract `wireLayoutEvents()` from `buildLayout`**

Everything in `buildLayout` after the HTML injection becomes `wireLayoutEvents()`. Move the entire block starting from the CoF controls section down to (but not including) `applyPanelVisibility()`. The local helpers `updateCofButtons`, `updateAnalysisFieldButtons`, and `reRenderNeck` move with it as local functions inside `wireLayoutEvents`.

```ts
function wireLayoutEvents() {
  const updateCofButtons = () => {
    ;($('btn-cof-flat')  as HTMLButtonElement).classList.toggle('active', cofAccidental === 'flat')
    ;($('btn-cof-sharp') as HTMLButtonElement).classList.toggle('active', cofAccidental === 'sharp')
    ;($('btn-cof-minor') as HTMLButtonElement).style.opacity = cofShowMinor   ? '1' : '0.4'
    ;($('btn-cof-deg')   as HTMLButtonElement).style.opacity = cofShowDegrees ? '1' : '0.4'
    ;($('btn-cof-7')     as HTMLButtonElement).style.opacity = cofShow7ths    ? '1' : '0.4'
  }
  updateCofButtons()

  $('btn-cof-minus').addEventListener('click', () => {
    cofSize = Math.max(100, cofSize - 20)
    localStorage.setItem('cof-size', String(cofSize))
    reRenderDiagrams()
  })
  $('btn-cof-plus').addEventListener('click', () => {
    cofSize = Math.min(400, cofSize + 20)
    localStorage.setItem('cof-size', String(cofSize))
    reRenderDiagrams()
  })
  $('btn-cof-flat').addEventListener('click', () => {
    cofAccidental = 'flat'
    localStorage.setItem('cof-accidental', cofAccidental)
    updateCofButtons(); reRenderDiagrams()
  })
  $('btn-cof-sharp').addEventListener('click', () => {
    cofAccidental = 'sharp'
    localStorage.setItem('cof-accidental', cofAccidental)
    updateCofButtons(); reRenderDiagrams()
  })
  $('btn-cof-minor').addEventListener('click', () => {
    cofShowMinor = !cofShowMinor
    localStorage.setItem('cof-show-minor', String(cofShowMinor))
    updateCofButtons(); reRenderDiagrams()
  })
  $('btn-cof-deg').addEventListener('click', () => {
    cofShowDegrees = !cofShowDegrees
    localStorage.setItem('cof-show-degrees', String(cofShowDegrees))
    updateCofButtons(); reRenderDiagrams()
  })
  $('btn-cof-7').addEventListener('click', () => {
    cofShow7ths = !cofShow7ths
    localStorage.setItem('cof-show-7ths', String(cofShow7ths))
    updateCofButtons(); reRenderDiagrams()
  })

  const updateAnalysisFieldButtons = () => {
    ANALYSIS_FIELD_KEYS.forEach(f => {
      const btn = document.getElementById(`btn-field-${f}`) as HTMLButtonElement | null
      if (btn) btn.classList.toggle('active', analysisFieldsVisible[f])
    })
  }
  $('btn-analysis-minus').addEventListener('click', () => {
    analysisScale = Math.max(8, analysisScale - 1)
    localStorage.setItem('analysis-scale', String(analysisScale))
    renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
  })
  $('btn-analysis-plus').addEventListener('click', () => {
    analysisScale = Math.min(20, analysisScale + 1)
    localStorage.setItem('analysis-scale', String(analysisScale))
    renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
  })

  const reRenderNeck = () => {
    const notes = state.detection?.kind !== 'note' && (state.detection as any)?.notes
      ? (state.detection as any).notes.map((n: number) => {
          const FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
          return FLAT[n % 12] + (Math.floor(n / 12) - 1)
        })
      : []
    const sym = state.detection?.kind === 'chord'
      ? state.detection.candidates[state.detection.selectedIndex]
      : null
    const chordRoot = sym ? (sym.match(/^([A-G][b#]?)/) ?? [,''])[1] || null : null
    renderNeck($('neck-container'), notes, chordRoot)
  }
  $('btn-neck-minus').addEventListener('click', () => { adjustNeckSpacing(-2); reRenderNeck() })
  $('btn-neck-plus').addEventListener('click',  () => { adjustNeckSpacing(2);  reRenderNeck() })

  ANALYSIS_FIELD_KEYS.forEach(f => {
    $(`btn-field-${f}`).addEventListener('click', () => {
      analysisFieldsVisible[f] = !analysisFieldsVisible[f]
      localStorage.setItem(`analysis-field-${f}`, String(analysisFieldsVisible[f]))
      updateAnalysisFieldButtons()
      renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
    })
  })

  document.querySelectorAll<HTMLButtonElement>('.col-vis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const col = btn.dataset.col as keyof typeof state.panels
      state.panels[col] = !state.panels[col]
      localStorage.setItem(`panel-${col}`, JSON.stringify(state.panels[col]))
      applyPanelVisibility()
    })
  })

  if (state.activeKey) {
    ($('key-select') as HTMLSelectElement).value = state.activeKey
  }

  document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode as any
      if (getMode() === m) return
      setMode(m)
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active-mode'))
      btn.classList.add('active-mode')
    })
  })

  $('key-select').addEventListener('change', (e) => {
    state.activeKey = (e.target as HTMLSelectElement).value || null
    localStorage.setItem('active-key', state.activeKey ?? '')
    refreshAll()
  })

  document.querySelectorAll<HTMLButtonElement>('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel as keyof typeof state.panels
      state.panels[panel] = !state.panels[panel]
      if (panel === 'history' || panel === 'song' || panel === 'instruments' || panel === 'cofControls' || panel === 'guitarControls' || panel === 'analysisControls') {
        localStorage.setItem(`panel-${panel}`, JSON.stringify(state.panels[panel]))
      }
      applyPanelVisibility()
    })
  })

  $('btn-help').addEventListener('click', toggleHelp)

  $('btn-play-chord').addEventListener('click', () => {
    initAudioOnGesture()
    if (lastChordMidi.length > 0) {
      playMidiNotes(lastChordMidi)
    } else if (lastChordSymbol) {
      audioPlayChord(lastChordSymbol)
    }
  })

  $('audio-instrument').addEventListener('change', (e) => {
    setInstrument((e.target as HTMLSelectElement).value)
  })

  $('audio-volume').addEventListener('input', (e) => {
    setVolume(parseFloat((e.target as HTMLInputElement).value))
  })
}
```

- [ ] **Step 6: Replace `buildLayout()` body**

Replace the entire body of `buildLayout` with the orchestrating calls:

```ts
function buildLayout() {
  $('zone1').innerHTML =
    buildToolbar() +
    buildNotationPanel() +
    buildInstrumentsPanel() +
    '<div id="midi-banner"></div>'

  buildZoneHeaders()
  wireLayoutEvents()
  applyPanelVisibility()
}
```

- [ ] **Step 7: Verify build**

```
npm run build
```

Expected: zero TypeScript errors.

- [ ] **Step 8: Commit**

```
git add src/app.ts
git commit -m "refactor: split buildLayout into named sub-functions"
```

---

## Task 4: Manual smoke test

No code changes. Verify the app behaves identically to before the refactor.

- [ ] **Step 1: Start the dev server**

```
npx http-server . -p 8080
```

Open `http://localhost:8080` in Chrome or Edge.

- [ ] **Step 2: Test MIDI and chord detection**

Connect a MIDI controller. Play 3–4 notes forming a chord. Verify:
- Chord name appears in the chord summary badge
- Analysis panel shows Roman numeral, function, scales, etc.
- Staff, CoF, guitar, piano all update

- [ ] **Step 3: Test alt chord selection**

With a chord displayed, click one of the alternate chord buttons (e.g. "Em/C"). Verify:
- Chord summary updates to the selected chord
- Analysis panel updates
- Diagrams update

- [ ] **Step 4: Test keyboard shortcuts popup**

Press `?`. Verify the shortcuts popup appears. Press `Escape` — verify it closes without clearing any cursor state. Press `?` again, then click outside — verify it closes.

- [ ] **Step 5: Test analysis field toggles**

Click the `Roman` toggle button in the Analysis panel. Verify the Roman numeral row disappears. Click again — verify it reappears.

- [ ] **Step 6: Test CoF interaction**

Click a major segment in the CoF. Verify it plays the chord and updates the analysis. Click a minor segment — verify it plays without changing the key.

- [ ] **Step 7: Final commit**

```
git add src/app.ts src/analysis-panel.ts src/shortcuts.ts
git status
```

If status is clean (all committed), the refactor is complete. Update `state.md` with a History entry for this session.

---

## Self-review checklist (completed)

- [x] Spec coverage: shortcuts.ts ✓, analysis-panel.ts ✓, buildLayout internal split ✓, onAltSelect callback ✓, closeHelp returns boolean ✓, getChordQuality exported ✓
- [x] No placeholders — all steps contain exact code
- [x] `activeKey` removed from `renderZone1Analysis` signature — confirmed unused in function body
- [x] Type consistency — `AnalysisFieldKey` defined once in analysis-panel.ts, imported everywhere; `onAltSelect` signature consistent across all 11 call sites
- [x] All 11 `renderZone1Analysis` call sites enumerated: init(), makeSongHandlers, btn-minus, btn-plus, field-forEach, onNoteChange, renderZone2/onChipClick, refreshAll, triggerChordAnalysis, refreshAutoKey, wireKeyboard 1–9
- [x] `wireLayoutEvents` (Task 3) contains updated call sites matching Task 2 signatures
- [x] `tsconfig.json` includes `src/**/*` — new files picked up automatically
- [x] `globals.d.ts` is ambient — `UMT` available in `analysis-panel.ts` without import
