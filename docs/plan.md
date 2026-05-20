# Harmony Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time MIDI chord analyzer and song structure builder as a TypeScript + esbuild single-page app.

**Architecture:** Three-zone layout — Zone 1 detects and analyzes chords from MIDI input in real time, Zone 2 maintains a history log, Zone 3 is a song structure builder with degree display. Pure logic in `analyzer.ts` and `song.ts` is unit-tested with vitest; browser modules (MIDI, audio, diagrams) are manually tested.

**Tech Stack:** TypeScript, esbuild, vitest, Web MIDI API, UMT CDN, notae CDN, abcjs CDN, WebAudioFont CDN, @tombatossals/chords-db CDN (JSON via fetch).

**Spec:** `docs/superpowers/specs/2026-05-20-harmony-companion-design.md`

---

## File Map

```
modus/
  src/
    types.ts        — all shared types (HistoryEntry, Song, Section, Measure, SongChord, etc.)
    globals.d.ts    — CDN global declarations (UMT, Notae, ABCJS, WebAudioFontPlayer)
    midi.ts         — Web MIDI: permission, device select, note on/off, mode state
    analyzer.ts     — pure: MIDI→note, chord detect, interval detect, full harmonic analysis
    audio.ts        — WebAudioFont init, playNote(midi), playChord(symbol)
    diagrams.ts     — render staff/piano/guitar/circle-of-fifths into DOM containers
    history.ts      — HistoryEntry state, auto-append debounce, chip rendering
    song.ts         — Song pure state ops + DOM rendering + event binding
    app.ts          — entry: zone layout, panel toggles, keyboard shortcuts, wiring
  tests/
    analyzer.test.ts
    song.test.ts
  index.html
  build.js
  vitest.config.ts
  package.json
  tsconfig.json
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `modus/package.json`
- Create: `modus/tsconfig.json`
- Create: `modus/vitest.config.ts`
- Create: `modus/build.js`
- Create: `modus/index.html`
- Create: `modus/src/globals.d.ts`

- [ ] **Step 1: Create directory and package.json**

From the repo root (`UNIVERSAL MUSIC LIBRARY - ok/`):

```bash
mkdir harmony-companion && cd harmony-companion
```

`package.json`:
```json
{
  "name": "modus",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "node build.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "esbuild": "^0.20.2",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "jsdom": "^24.0.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  }
})
```

- [ ] **Step 5: Create build.js**

```js
import * as esbuild from 'esbuild'

const ctx = await esbuild.context({
  entryPoints: ['src/app.ts'],
  bundle: true,
  outfile: 'dist/app.js',
  format: 'iife',
  sourcemap: true,
})

console.log('Watching...')
await ctx.watch()
```

- [ ] **Step 6: Create src/globals.d.ts**

```ts
declare const UMT: {
  parseNote: (str: string, defaultOctave?: number) => any
  parseChordSymbol: (symbol: string, tuning?: any) => any
  parseScaleSymbol: (symbol: string, tuning?: any) => any
  Harmony: {
    detectChords: (notes: any[]) => string[]
    analyzeProgression: (chords: any[], key: string) => { analysis: any[]; modulations: any[]; harmonicRhythm: number }
    analyzeCadence: (c1: any, c2: any, key: string) => string
    getSuggestedScales: (chord: any) => { scale: string; hint?: string }[]
    getColtraneAxis: (key: string) => { root: string; majorThirds: [string, string, string] }
    getNegativeHarmony: (chord: any, key: string) => any
    getColtraneSubstitutions: (chord: any, key: string) => any[]
  }
  FiguredBass: {
    fromChord: (chord: any, bassNote: any) => string
  }
  KeyDetection: {
    detect: (notes: any[]) => { key: string; confidence: number }[]
  }
  getSubstitutions: (chord: any, key: string) => any[]
  CircleOfFifths: new () => any
}

declare const Notae: {
  renderPiano: (chord: { name: string; keys: string[]; colors?: string[]; root?: string }, opts?: any) => string
  renderFretboard: (chord: any, opts?: any) => string
}

declare const ABCJS: {
  renderAbc: (target: string | HTMLElement, abc: string, options?: any) => any[]
}

declare class WebAudioFontPlayer {
  loader: { decodeAfterLoading: (ctx: AudioContext, varName: string) => void }
  queueWaveTable: (ctx: AudioContext, dest: AudioNode, instrument: any, when: number, pitch: number, duration: number, volume?: number) => void
  cancelQueue: (ctx: AudioContext) => void
}

declare const _tone_0000_GeneralUserGS_sf2_file: any
```

- [ ] **Step 7: Create index.html skeleton**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Harmony Companion</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; }
    #app { display: flex; flex-direction: column; height: 100vh; }
    #browser-warning { display: none; position: fixed; inset: 0; background: #1a1a2e; z-index: 999; place-items: center; }
    #browser-warning.visible { display: grid; }
    #cdn-error-banner { display: none; background: #7f1d1d; padding: 8px 16px; text-align: center; font-size: 13px; }
    #cdn-error-banner.visible { display: block; }
  </style>
</head>
<body>
  <div id="browser-warning">
    <div style="text-align:center;max-width:400px;padding:24px">
      <h2>Chrome or Edge required</h2>
      <p>Harmony Companion needs Web MIDI API support, available only in Chrome and Edge.</p>
    </div>
  </div>
  <div id="cdn-error-banner">Failed to load a required resource. Check your internet connection.</div>
  <div id="app">
    <div id="zone1"></div>
    <div id="zone2"></div>
    <div id="zone3"></div>
  </div>

  <!-- CDN dependencies -->
  <script src="https://cdn.jsdelivr.net/gh/memoriainfinita/UMT@main/dist/umt.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/memoriainfinita/notae@master/dist/notae.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/abcjs@6.4.0/dist/abcjs-basic-min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/webaudiofont@2.1.0/npm/dist/WebAudioFontPlayer.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/webaudiofont@2.1.0/npm/dist/sf2staccato/_tone_0000_GeneralUserGS_sf2_file.js"></script>

  <script>
    window.onerror = function(msg, src) {
      if (src && (src.includes('jsdelivr') || src.includes('surikov'))) {
        document.getElementById('cdn-error-banner').classList.add('visible')
      }
    }
  </script>
  <script src="dist/app.js"></script>
</body>
</html>
```

- [ ] **Step 8: Create stub src/app.ts so build succeeds**

```ts
console.log('Harmony Companion starting...')
```

- [ ] **Step 9: Verify build works**

```bash
mkdir -p dist && node build.js
```

Expected: `dist/app.js` created, "Watching..." printed. Open `index.html` via http-server and confirm no console errors beyond "MIDI not available" (expected without Chrome).

- [ ] **Step 10: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold harmony-companion project"
```

---

## Task 2: Shared Types

**Files:**
- Create: `modus/src/types.ts`

- [ ] **Step 1: Write types.ts**

```ts
// ─── MIDI ────────────────────────────────────────────────────────────────────

export type MidiMode = 'normal' | 'hold' | 'arpeggio'

// ─── Detection results ───────────────────────────────────────────────────────

export interface SingleNoteResult {
  kind: 'note'
  noteName: string   // e.g. "C4"
  midiNumber: number
  pitchClass: string // e.g. "C"
}

export interface IntervalResult {
  kind: 'interval'
  notes: string[]
  intervalName: string    // e.g. "Major 3rd"
  semitones: number
  inversionName: string   // e.g. "Minor 6th"
}

export interface ChordResult {
  kind: 'chord'
  notes: string[]
  candidates: string[]    // ranked chord names from Harmony.detectChords
  selectedIndex: number   // which candidate is active (0 = top)
}

export type DetectionResult = SingleNoteResult | IntervalResult | ChordResult | null

// ─── Full analysis (Zone 1 panel) ────────────────────────────────────────────

export interface HarmonicAnalysis {
  chordName: string
  roman: string             // e.g. "ii7", "bVII"
  function: 'T' | 'S' | 'D' | 'unknown'
  isDiatonic: boolean
  isBorrowed: boolean
  borrowedFrom?: string
  isSecondary: boolean
  secondaryTarget?: string
  figuredBass: string
  suggestedScales: string[]
  cadence: string | null    // null = no standard cadence vs prev chord
  coltraneAxis: [string, string, string] | null
  negativeHarmony: string | null
  detectedKey: string | null  // from running K-S pool
}

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string
  symbol: string    // top candidate at capture time, e.g. "Cmaj7"
  notes: string[]   // note names, e.g. ["C4","E4","G4","B4"]
}

// ─── Song structure ──────────────────────────────────────────────────────────

export type SectionColor = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'outro' | 'custom'

export interface SongChord {
  id: string
  symbol: string
  valid: boolean
}

export interface Measure {
  id: string
  chords: SongChord[]
}

export interface Section {
  id: string
  name: string
  color: SectionColor
  measures: Measure[]
  collapsed: boolean
  repeatCount: number   // 1 = no badge; ≥2 = "×N"
}

export interface Song {
  schemaVersion: 1
  title: string
  sections: Section[]
}

// ─── App state ───────────────────────────────────────────────────────────────

export interface AppState {
  midi: {
    deviceId: string | null
    mode: MidiMode
    activeNotes: Set<number>   // MIDI note numbers currently held
    lastArpeggioNotes: number[]
    arpeggioTimer: ReturnType<typeof setTimeout> | null
  }
  activeKey: string | null     // e.g. "C Major", null = auto
  detectedKey: string | null   // from K-S on history
  detection: DetectionResult
  analysis: HarmonicAnalysis | null
  history: HistoryEntry[]
  song: Song
  activeCursorId: string | null   // id of active SongChord slot
  panels: {
    notation: boolean
    analysis: boolean
    history: boolean
    song: boolean
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types"
```

---

## Task 3: MIDI Module

**Files:**
- Create: `modus/src/midi.ts`
- Create: `modus/tests/midi.test.ts`

- [ ] **Step 1: Write failing tests for pure MIDI functions**

`tests/midi.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { midiToNoteName, isNoteOff, PITCH_NAMES_FLAT } from '../src/midi'

describe('midiToNoteName', () => {
  it('converts middle C (MIDI 60) to C4', () => {
    expect(midiToNoteName(60)).toBe('C4')
  })
  it('converts A4 (MIDI 69) to A4', () => {
    expect(midiToNoteName(69)).toBe('A4')
  })
  it('converts Bb3 (MIDI 58) to Bb3', () => {
    expect(midiToNoteName(58)).toBe('Bb3')
  })
  it('converts lowest MIDI note 0 to C-1', () => {
    expect(midiToNoteName(0)).toBe('C-1')
  })
})

describe('isNoteOff', () => {
  it('treats 0x80 status as note-off', () => {
    expect(isNoteOff(0x80, 64)).toBe(true)
  })
  it('treats note-on with velocity=0 as note-off', () => {
    expect(isNoteOff(0x90, 0)).toBe(true)
  })
  it('treats note-on with velocity>0 as note-on', () => {
    expect(isNoteOff(0x90, 64)).toBe(false)
  })
  it('handles all MIDI channels for note-off (0x8F)', () => {
    expect(isNoteOff(0x8F, 64)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../src/midi'`

- [ ] **Step 3: Implement midi.ts**

```ts
import type { MidiMode } from './types'

export const PITCH_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']

export function midiToNoteName(midiNote: number): string {
  const pc = midiNote % 12
  const octave = Math.floor(midiNote / 12) - 1
  return PITCH_NAMES_FLAT[pc] + octave
}

export function isNoteOff(status: number, velocity: number): boolean {
  return (status & 0xF0) === 0x80 || ((status & 0xF0) === 0x90 && velocity === 0)
}

// ─── State ───────────────────────────────────────────────────────────────────

let midiAccess: MIDIAccess | null = null
let selectedDeviceId: string | null = null
let mode: MidiMode = 'normal'
let activeNotes = new Set<number>()
let arpeggioNotes: number[] = []
let arpeggioTimer: ReturnType<typeof setTimeout> | null = null

type NoteChangeCallback = (notes: number[]) => void
let onNoteChange: NoteChangeCallback = () => {}

export function setNoteChangeCallback(cb: NoteChangeCallback) {
  onNoteChange = cb
}

// ─── Permission + init ───────────────────────────────────────────────────────

export async function initMidi(): Promise<{ ok: boolean; denied: boolean; unsupported: boolean }> {
  if (!navigator.requestMIDIAccess) {
    return { ok: false, denied: false, unsupported: true }
  }
  try {
    midiAccess = await navigator.requestMIDIAccess()
    midiAccess.onstatechange = () => refreshDeviceList()
    restoreDevice()
    return { ok: true, denied: false, unsupported: false }
  } catch {
    return { ok: false, denied: true, unsupported: false }
  }
}

export function getDevices(): { id: string; name: string }[] {
  if (!midiAccess) return []
  return Array.from(midiAccess.inputs.values()).map(i => ({ id: i.id, name: i.name ?? i.id }))
}

export function selectDevice(id: string) {
  selectedDeviceId = id
  localStorage.setItem('midi-device-id', id)
  attachToDevice(id)
}

function restoreDevice() {
  const saved = localStorage.getItem('midi-device-id')
  const devices = getDevices()
  const target = saved && devices.find(d => d.id === saved) ? saved : devices[0]?.id ?? null
  if (target) selectDevice(target)
}

function attachToDevice(id: string) {
  if (!midiAccess) return
  for (const input of midiAccess.inputs.values()) {
    input.onmidimessage = input.id === id ? handleMidiMessage : null
  }
}

function refreshDeviceList() {
  // Called on device connect/disconnect — let app re-query getDevices()
  window.dispatchEvent(new CustomEvent('midi-devices-changed'))
  if (selectedDeviceId && !getDevices().find(d => d.id === selectedDeviceId)) {
    window.dispatchEvent(new CustomEvent('midi-device-disconnected'))
  }
}

// ─── Message handling ────────────────────────────────────────────────────────

function handleMidiMessage(e: MIDIMessageEvent) {
  if (!e.data || e.data.length < 3) return
  const [status, note, velocity] = e.data

  if (isNoteOff(status, velocity)) {
    handleNoteOff(note)
  } else if ((status & 0xF0) === 0x90) {
    handleNoteOn(note)
  }
}

function handleNoteOn(note: number) {
  if (mode === 'normal') {
    activeNotes.add(note)
    onNoteChange(Array.from(activeNotes))
  } else if (mode === 'hold') {
    activeNotes.clear()
    activeNotes.add(note)
    onNoteChange(Array.from(activeNotes))
  } else if (mode === 'arpeggio') {
    if (arpeggioTimer) clearTimeout(arpeggioTimer)
    arpeggioNotes.push(note)
    onNoteChange([...new Set(arpeggioNotes)])
    arpeggioTimer = setTimeout(() => {
      arpeggioNotes = []
      arpeggioTimer = null
    }, 1200)
  }
}

function handleNoteOff(note: number) {
  if (mode === 'normal') {
    activeNotes.delete(note)
    onNoteChange(Array.from(activeNotes))
  }
  // hold + arpeggio: ignore note-off
}

export function setMode(m: MidiMode) {
  if (m === mode) return
  mode = m
  activeNotes.clear()
  arpeggioNotes = []
  if (arpeggioTimer) { clearTimeout(arpeggioTimer); arpeggioTimer = null }
  localStorage.setItem('midi-mode', m)
}

export function getMode(): MidiMode { return mode }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/midi.ts tests/midi.test.ts
git commit -m "feat: add MIDI module with note conversion and mode handling"
```

---

## Task 4: Analysis Engine

**Files:**
- Create: `modus/src/analyzer.ts`
- Create: `modus/tests/analyzer.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/analyzer.test.ts`:
```ts
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { midiToNoteName } from '../src/midi'

// Mock UMT globally before importing analyzer
const mockUMT = {
  parseNote: vi.fn((s: string) => ({ _name: s })),
  parseChordSymbol: vi.fn((s: string) => ({ _sym: s, getNotes: () => [{ _name: 'C4' }] })),
  Harmony: {
    detectChords: vi.fn(() => ['Cmaj7', 'Em/C']),
    analyzeProgression: vi.fn(() => ({
      analysis: [{
        roman: 'I△7', degree: 1, function: 'T',
        isDiatonic: true, isBorrowed: false,
        isSecondary: false, cadenceWithNext: undefined
      }],
      modulations: [], harmonicRhythm: 1
    })),
    analyzeCadence: vi.fn(() => 'Authentic (V7->I)'),
    getSuggestedScales: vi.fn(() => [{ scale: 'C major' }]),
    getColtraneAxis: vi.fn(() => ({ root: 'C', majorThirds: ['E', 'Ab', 'C'] as [string,string,string] })),
    getNegativeHarmony: vi.fn(() => ({ name: 'Fm' })),
    getColtraneSubstitutions: vi.fn(() => []),
  },
  FiguredBass: { fromChord: vi.fn(() => '5/3') },
  KeyDetection: { detect: vi.fn(() => [{ key: 'C Major', confidence: 0.9 }]) },
  getSubstitutions: vi.fn(() => []),
  CircleOfFifths: class {},
}
;(globalThis as any).UMT = mockUMT

import { analyzeNotes, getAutoKey } from '../src/analyzer'

describe('analyzeNotes', () => {
  it('returns null for empty notes', () => {
    expect(analyzeNotes([], null, null)).toBeNull()
  })

  it('returns SingleNoteResult for 1 note', () => {
    const r = analyzeNotes([60], null, null)
    expect(r?.kind).toBe('note')
    if (r?.kind === 'note') {
      expect(r.noteName).toBe('C4')
      expect(r.midiNumber).toBe(60)
    }
  })

  it('returns ChordResult for 3+ notes', () => {
    const r = analyzeNotes([60, 64, 67, 71], 'C Major', null)
    expect(r?.kind).toBe('chord')
    if (r?.kind === 'chord') {
      expect(r.candidates[0]).toBe('Cmaj7')
    }
  })
})

describe('getAutoKey', () => {
  it('returns null for empty history', () => {
    expect(getAutoKey([])).toBeNull()
  })

  it('returns top key from KeyDetection.detect', () => {
    const entries = [{ id: '1', symbol: 'Cmaj7', notes: ['C4', 'E4', 'G4', 'B4'] }]
    expect(getAutoKey(entries)).toBe('C Major')
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../src/analyzer'`

- [ ] **Step 3: Implement analyzer.ts**

```ts
import type { DetectionResult, HarmonicAnalysis, HistoryEntry, SingleNoteResult, IntervalResult, ChordResult } from './types'
import { midiToNoteName, PITCH_NAMES_FLAT } from './midi'

const INTERVAL_NAMES = [
  'Unison','Minor 2nd','Major 2nd','Minor 3rd','Major 3rd','Perfect 4th',
  'Tritone','Perfect 5th','Minor 6th','Major 6th','Minor 7th','Major 7th'
]

function semitonesToInterval(semitones: number): { name: string; inversionName: string } {
  const n = ((semitones % 12) + 12) % 12
  const inv = n === 0 ? 0 : 12 - n
  return { name: INTERVAL_NAMES[n], inversionName: INTERVAL_NAMES[inv] }
}

function noteNameToUMT(name: string): any {
  return UMT.parseNote(name)
}

export function analyzeNotes(
  midiNotes: number[],
  activeKey: string | null,
  prevChordSymbol: string | null
): DetectionResult {
  if (midiNotes.length === 0) return null

  const noteNames = midiNotes.map(midiToNoteName)

  if (midiNotes.length === 1) {
    const result: SingleNoteResult = {
      kind: 'note',
      noteName: noteNames[0],
      midiNumber: midiNotes[0],
      pitchClass: PITCH_NAMES_FLAT[midiNotes[0] % 12],
    }
    return result
  }

  if (midiNotes.length === 2) {
    const semitones = Math.abs(midiNotes[0] - midiNotes[1])
    const { name, inversionName } = semitonesToInterval(semitones)
    const result: IntervalResult = {
      kind: 'interval',
      notes: noteNames,
      intervalName: name,
      semitones,
      inversionName,
    }
    return result
  }

  // ≥3 notes: chord detection
  const umtNotes = noteNames.map(noteNameToUMT)
  const candidates = UMT.Harmony.detectChords(umtNotes)
  const result: ChordResult = {
    kind: 'chord',
    notes: noteNames,
    candidates: candidates.length ? candidates : ['Unknown'],
    selectedIndex: 0,
  }
  return result
}

export function buildHarmonicAnalysis(
  chordSymbol: string,
  activeKey: string | null,
  prevChordSymbol: string | null
): HarmonicAnalysis {
  const chord = UMT.parseChordSymbol(chordSymbol)
  const notes = chord.getNotes ? chord.getNotes() : []
  const bassNote = notes[0] ?? null

  let roman = '?'
  let fn: 'T' | 'S' | 'D' | 'unknown' = 'unknown'
  let isDiatonic = false
  let isBorrowed = false
  let borrowedFrom: string | undefined
  let isSecondary = false
  let secondaryTarget: string | undefined
  let cadence: string | null = null

  if (activeKey) {
    try {
      const { analysis } = UMT.Harmony.analyzeProgression([chord], activeKey)
      const a = analysis[0]
      roman = a.roman ?? '?'
      fn = a.function ?? 'unknown'
      isDiatonic = a.isDiatonic ?? false
      isBorrowed = a.isBorrowed ?? false
      borrowedFrom = a.borrowedFrom
      isSecondary = a.isSecondary ?? false
      secondaryTarget = a.secondaryTarget
    } catch { /* unsupported tuning or parse error */ }

    if (prevChordSymbol) {
      try {
        const prevChord = UMT.parseChordSymbol(prevChordSymbol)
        const cad = UMT.Harmony.analyzeCadence(prevChord, chord, activeKey)
        if (cad && cad !== 'No standard cadence') cadence = cad
      } catch { /* ignore */ }
    }
  }

  let figuredBass = ''
  if (bassNote) {
    try { figuredBass = UMT.FiguredBass.fromChord(chord, bassNote) } catch { }
  }

  const suggestedScales: string[] = []
  try {
    UMT.Harmony.getSuggestedScales(chord).forEach((s: any) => suggestedScales.push(s.scale))
  } catch { }

  let coltraneAxis: [string, string, string] | null = null
  try {
    if (activeKey) {
      const ax = UMT.Harmony.getColtraneAxis(activeKey)
      coltraneAxis = ax.majorThirds
    }
  } catch { }

  let negativeHarmony: string | null = null
  try {
    if (activeKey) {
      const neg = UMT.Harmony.getNegativeHarmony(chord, activeKey)
      negativeHarmony = neg?.name ?? null
    }
  } catch { }

  return {
    chordName: chordSymbol,
    roman,
    function: fn,
    isDiatonic,
    isBorrowed,
    borrowedFrom,
    isSecondary,
    secondaryTarget,
    figuredBass,
    suggestedScales,
    cadence,
    coltraneAxis,
    negativeHarmony,
    detectedKey: null, // filled by getAutoKey separately
  }
}

export function getAutoKey(history: HistoryEntry[]): string | null {
  if (history.length === 0) return null
  const allNotes = history.flatMap(e => e.notes.map(n => UMT.parseNote(n)))
  if (allNotes.length === 0) return null
  try {
    const results = UMT.KeyDetection.detect(allNotes)
    return results[0]?.key ?? null
  } catch { return null }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```

Expected: all analyzer tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/analyzer.ts tests/analyzer.test.ts
git commit -m "feat: add analysis engine with chord/interval detection and harmonic analysis"
```

---

## Task 5: Audio Module

**Files:**
- Create: `modus/src/audio.ts`

- [ ] **Step 1: Implement audio.ts**

```ts
let audioCtx: AudioContext | null = null
let player: WebAudioFontPlayer | null = null
let ready = false

function ensureContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext()
    player = new WebAudioFontPlayer()
    player.loader.decodeAfterLoading(audioCtx, '_tone_0000_GeneralUserGS_sf2_file')
  }
}

export function initAudioOnGesture() {
  // Call once on any user interaction
  if (ready) return
  ensureContext()
  audioCtx!.resume().then(() => { ready = true })
}

export function playNote(midiNumber: number, duration = 1.5) {
  if (!audioCtx || !player) return
  audioCtx.resume()
  player.queueWaveTable(
    audioCtx,
    audioCtx.destination,
    _tone_0000_GeneralUserGS_sf2_file,
    0,
    midiNumber,
    duration,
    0.8
  )
}

export function playNoteByName(noteName: string, duration = 1.5) {
  // "C4" → MIDI 60
  const midi = noteNameToMidi(noteName)
  if (midi !== null) playNote(midi, duration)
}

export function playChord(chordSymbol: string) {
  try {
    const chord = UMT.parseChordSymbol(chordSymbol)
    const notes = chord.getNotes ? chord.getNotes() : []
    for (const note of notes) {
      const name = note.name ?? note._name
      if (name) playNoteByName(name)
    }
  } catch { /* invalid symbol */ }
}

// ─── Note name → MIDI ────────────────────────────────────────────────────────

const PC_MAP: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
}

function noteNameToMidi(name: string): number | null {
  const m = name.match(/^([A-G][b#]?)(-?\d+)$/)
  if (!m) return null
  const pc = PC_MAP[m[1]]
  if (pc === undefined) return null
  return (parseInt(m[2]) + 1) * 12 + pc
}
```

- [ ] **Step 2: Manual test** — open index.html in Chrome, open DevTools console and run:

```js
App  // should exist (once app.ts is wired)
```

This will be fully tested in Task 10. For now, verify no TypeScript errors:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/audio.ts
git commit -m "feat: add WebAudioFont audio module"
```

---

## Task 6: Diagrams Module

**Files:**
- Create: `modus/src/diagrams.ts`

- [ ] **Step 1: Implement diagrams.ts**

```ts
import { playNoteByName } from './audio'

// ─── Guitar voicings database ─────────────────────────────────────────────────

type GuitarDB = Record<string, Record<string, { frets: number[]; fingers?: number[]; baseFret?: number; barres?: any[] }[]>>
let guitarDB: GuitarDB | null = null
const CHORDS_DB_URL = 'https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@1.4.5/src/data/guitar.json'

export async function loadGuitarDB() {
  try {
    const res = await fetch(CHORDS_DB_URL)
    const data = await res.json()
    guitarDB = data.chords as GuitarDB
  } catch {
    console.warn('Could not load guitar chord database')
  }
}

// Map UMT root names → DB keys
const ROOT_MAP: Record<string, string> = {
  'C': 'C', 'C#': 'Csharp', 'Db': 'Db', 'D': 'D', 'D#': 'Dsharp',
  'Eb': 'Eb', 'E': 'E', 'F': 'F', 'F#': 'Fsharp', 'Gb': 'Gb',
  'G': 'G', 'G#': 'Gsharp', 'Ab': 'Ab', 'A': 'A', 'A#': 'Asharp',
  'Bb': 'Bb', 'B': 'B'
}

// Map UMT quality strings → DB suffix keys
const QUALITY_MAP: Record<string, string> = {
  'major': 'major', 'minor': 'minor', 'dominant seventh': 'dominant7',
  'major seventh': 'major7', 'minor seventh': 'minor7',
  'diminished': 'dim', 'diminished seventh': 'dim7',
  'half-diminished seventh': 'm7b5', 'augmented': 'aug',
  'suspended fourth': 'sus4', 'suspended second': 'sus2',
  'major sixth': 'major6', 'minor sixth': 'minor6',
  'dominant ninth': 'dominant9', 'major ninth': 'major9', 'minor ninth': 'minor9',
}

let voicingIndexMap: Map<string, number> = new Map()

function getGuitarVoicings(chordSymbol: string): any[] {
  if (!guitarDB) return []
  try {
    const chord = UMT.parseChordSymbol(chordSymbol)
    const root = chord.root?.name ?? chord.root ?? ''
    const quality = chord.quality ?? 'major'
    const dbRoot = ROOT_MAP[root] ?? root
    const dbQuality = QUALITY_MAP[quality.toLowerCase()] ?? quality.toLowerCase()
    return guitarDB[dbRoot]?.[dbQuality] ?? []
  } catch { return [] }
}

export function nextGuitarVoicing(chordSymbol: string) {
  const idx = (voicingIndexMap.get(chordSymbol) ?? 0) + 1
  voicingIndexMap.set(chordSymbol, idx)
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export function renderStaff(container: HTMLElement, noteNames: string[]) {
  if (!noteNames.length) { container.innerHTML = ''; return }
  // Build ABC: chord = [C4E4G4B4] with explicit octave
  const abcNotes = noteNames.map(n => {
    const m = n.match(/^([A-G][b#]?)(-?\d+)$/)
    if (!m) return 'C'
    const name = m[1].replace('b', '_').replace('#', '^')
    const oct = parseInt(m[2])
    // abcjs octave convention: C4 = C (middle c); +1 octave = lowercase; -1 octave = ,
    let abc = name
    if (oct >= 5) abc = name.toLowerCase() + "'".repeat(oct - 5)
    else if (oct === 4) abc = name
    else abc = name + ','.repeat(4 - oct)
    return abc
  })
  const abcStr = `X:1\nM:4/4\nL:1/4\nK:C\n[${abcNotes.join('')}]4`
  ABCJS.renderAbc(container, abcStr, { responsive: 'resize' })
}

// ─── Piano ────────────────────────────────────────────────────────────────────

const QUALITY_COLORS: Record<string, string> = {
  major: '#f59e0b', minor: '#3b82f6', 'dominant seventh': '#ef4444',
  'major seventh': '#f59e0b', 'minor seventh': '#3b82f6',
  diminished: '#7c3aed', 'diminished seventh': '#7c3aed',
  'half-diminished seventh': '#7c3aed', augmented: '#0d9488',
}

export function renderPiano(container: HTMLElement, noteNames: string[], quality: string) {
  const color = QUALITY_COLORS[quality?.toLowerCase()] ?? '#6b7280'
  const colors = noteNames.map(() => color)
  const svg = Notae.renderPiano({ name: '', keys: noteNames, colors })
  container.innerHTML = svg

  // Attach click listeners to piano keys
  // notae marks keys with data-note; fall back to position-based overlay if absent
  const keyEls = container.querySelectorAll<SVGElement>('[data-note]')
  if (keyEls.length > 0) {
    keyEls.forEach(el => {
      el.style.cursor = 'pointer'
      el.addEventListener('click', () => playNoteByName(el.dataset.note!))
    })
  }
  // If no data-note attributes, piano is display-only until notae API is confirmed
}

// ─── Guitar ───────────────────────────────────────────────────────────────────

export function renderGuitar(container: HTMLElement, chordSymbol: string) {
  const voicings = getGuitarVoicings(chordSymbol)
  const idx = (voicingIndexMap.get(chordSymbol) ?? 0) % Math.max(voicings.length, 1)

  if (!voicings.length) {
    container.innerHTML = `<div class="no-voicing">${chordSymbol}<br><small>no voicing</small></div>`
    return
  }

  const v = voicings[idx]
  const svg = Notae.renderFretboard({
    name: chordSymbol,
    frets: v.frets,
    fingers: v.fingers,
    baseFret: v.baseFret ?? 1,
    barres: v.barres ?? [],
    tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
  })
  container.innerHTML = svg
}

// ─── Circle of fifths ─────────────────────────────────────────────────────────

const CIRCLE_KEYS = ['C','G','D','A','E','B','F#/Gb','Db','Ab','Eb','Bb','F']
const CIRCLE_KEYS_MINOR = ['Am','Em','Bm','F#m','C#m','G#m','D#m/Ebm','Bbm','Fm','Cm','Gm','Dm']

export function renderCircleOfFifths(
  container: HTMLElement,
  activeKey: string | null,
  chordRoot: string | null,
  onKeyClick: (key: string) => void
) {
  const size = 220
  const cx = size / 2, cy = size / 2
  const outerR = 95, innerR = 62, labelR = 80, minorR = 48

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">`

  CIRCLE_KEYS.forEach((key, i) => {
    const angle = (i * 30 - 90) * Math.PI / 180
    const nextAngle = ((i + 1) * 30 - 90) * Math.PI / 180
    const x1o = cx + outerR * Math.cos(angle), y1o = cy + outerR * Math.sin(angle)
    const x2o = cx + outerR * Math.cos(nextAngle), y2o = cy + outerR * Math.sin(nextAngle)
    const x1i = cx + innerR * Math.cos(angle), y1i = cy + innerR * Math.sin(angle)
    const x2i = cx + innerR * Math.cos(nextAngle), y2i = cy + innerR * Math.sin(nextAngle)

    const isActiveKey = activeKey?.startsWith(key.split('/')[0])
    const isChordRoot = chordRoot === key.split('/')[0]
    const fill = isActiveKey ? '#4f46e5' : isChordRoot ? '#0d9488' : '#2d2d44'
    const stroke = isChordRoot ? '#0d9488' : '#4a4a6a'

    const midAngle = (i * 30 + 15 - 90) * Math.PI / 180
    const lx = cx + labelR * Math.cos(midAngle)
    const ly = cy + labelR * Math.sin(midAngle)

    svg += `<path d="M${x1i},${y1i} L${x1o},${y1o} A${outerR},${outerR} 0 0,1 ${x2o},${y2o} L${x2i},${y2i} A${innerR},${innerR} 0 0,0 ${x1i},${y1i}"
      fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor:pointer"
      data-key="${key.split('/')[0]} Major" />`
    svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
      font-size="10" fill="#e0e0e0" pointer-events="none">${key}</text>`

    // Minor inner ring
    const mKey = CIRCLE_KEYS_MINOR[i]
    const mx = cx + minorR * Math.cos(midAngle)
    const my = cy + minorR * Math.sin(midAngle)
    svg += `<text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="middle"
      font-size="8" fill="#9ca3af" pointer-events="none">${mKey}</text>`
  })

  svg += '</svg>'
  container.innerHTML = svg

  container.querySelectorAll<SVGPathElement>('[data-key]').forEach(el => {
    el.addEventListener('click', () => onKeyClick(el.dataset.key!))
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/diagrams.ts
git commit -m "feat: add diagrams module (staff, piano, guitar, circle of fifths)"
```

---

## Task 7: History Module

**Files:**
- Create: `modus/src/history.ts`

- [ ] **Step 1: Implement history.ts**

```ts
import type { HistoryEntry, HarmonicAnalysis } from './types'
import { buildHarmonicAnalysis } from './analyzer'
import { playChord } from './audio'

const MAX_ENTRIES = 200
const QUALITY_COLORS: Record<string, string> = {
  'T': '#f59e0b', 'S': '#3b82f6', 'D': '#ef4444', 'unknown': '#6b7280'
}

let entries: HistoryEntry[] = []
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastAutoAppended: string | null = null

type HistoryChangeCallback = (entries: HistoryEntry[]) => void
let onChange: HistoryChangeCallback = () => {}

export function setHistoryChangeCallback(cb: HistoryChangeCallback) { onChange = cb }

export function getEntries(): HistoryEntry[] { return entries }

export function addEntry(symbol: string, notes: string[]) {
  const entry: HistoryEntry = { id: crypto.randomUUID(), symbol, notes }
  entries = [entry, ...entries].slice(0, MAX_ENTRIES)
  onChange(entries)
}

export function removeEntry(id: string) {
  entries = entries.filter(e => e.id !== id)
  onChange(entries)
}

export function clearHistory() {
  entries = []
  lastAutoAppended = null
  onChange(entries)
}

/** Called on every chord detection. Debounces auto-append at 0.8s stability. */
export function notifyChordDetected(symbol: string, notes: string[]) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (symbol !== lastAutoAppended && symbol !== 'Unknown') {
      addEntry(symbol, notes)
      lastAutoAppended = symbol
    }
  }, 800)
}

/** Returns all unique note objects for K-S key detection */
export function getHistoryNotes(): string[] {
  return entries.flatMap(e => e.notes)
}

// ─── Rendering ────────────────────────────────────────────────────────────────

export function renderHistory(
  container: HTMLElement,
  activeKey: string | null,
  onChipClick: (entry: HistoryEntry) => void,
  onSendToSong: (entry: HistoryEntry) => void,
  activeCursorEntryId: string | null
) {
  const strip = document.createElement('div')
  strip.style.cssText = 'display:flex;gap:6px;overflow-x:auto;padding:8px 12px;align-items:center'

  entries.forEach(entry => {
    const analysis = activeKey ? buildHarmonicAnalysis(entry.symbol, activeKey, null) : null
    const roman = analysis?.roman ?? '—'
    const fn = analysis?.function ?? 'unknown'
    const color = QUALITY_COLORS[fn] ?? '#6b7280'

    const chip = document.createElement('div')
    chip.className = 'history-chip'
    chip.dataset.id = entry.id
    chip.style.cssText = `
      display:flex;flex-direction:column;align-items:center;padding:4px 8px;
      border-radius:6px;border:1.5px solid ${activeCursorEntryId === entry.id ? '#fff' : '#3a3a5c'};
      background:#252540;cursor:pointer;min-width:50px;user-select:none;
      border-left:3px solid ${color};
    `
    chip.innerHTML = `
      <span style="font-size:12px;font-weight:600">${entry.symbol}</span>
      <span style="font-size:10px;color:#9ca3af">${roman}</span>
    `

    chip.addEventListener('click', () => onChipClick(entry))
    chip.addEventListener('contextmenu', e => {
      e.preventDefault()
      if (confirm(`Remove ${entry.symbol} from history?`)) removeEntry(entry.id)
    })

    strip.appendChild(chip)
  })

  // → song button
  const sendBtn = document.createElement('button')
  sendBtn.textContent = '→ song'
  sendBtn.style.cssText = 'margin-left:auto;padding:4px 10px;border-radius:4px;background:#4f46e5;color:#fff;border:none;cursor:pointer;white-space:nowrap'
  sendBtn.addEventListener('click', () => {
    const active = activeCursorEntryId ? entries.find(e => e.id === activeCursorEntryId) : entries[0]
    if (active) onSendToSong(active)
  })

  const clearBtn = document.createElement('button')
  clearBtn.textContent = 'Clear'
  clearBtn.style.cssText = 'padding:4px 10px;border-radius:4px;background:#374151;color:#fff;border:none;cursor:pointer'
  clearBtn.addEventListener('click', () => {
    if (confirm('Clear all history?')) clearHistory()
  })

  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;gap:8px;align-items:center'
  wrap.appendChild(strip)
  wrap.appendChild(sendBtn)
  wrap.appendChild(clearBtn)

  container.innerHTML = ''
  container.appendChild(wrap)
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/history.ts
git commit -m "feat: add history module with auto-append debounce and chip rendering"
```

---

## Task 8: Song State (Pure Functions)

**Files:**
- Create: `modus/src/song.ts` (state functions only)
- Create: `modus/tests/song.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/song.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  createSong, addSection, addMeasure, addChord,
  removeChord, removeSection, transposeSong,
  parseProgressionText, computeMeasureNumbers, duplicateSection
} from '../src/song'

// Minimal UMT mock for transpose
;(globalThis as any).UMT = {
  parseChordSymbol: (s: string) => ({
    root: { name: s[0] },
    quality: 'major',
    name: s,
    getNotes: () => [],
  }),
  parseNote: (s: string) => ({ name: s }),
  Harmony: { analyzeProgression: () => ({ analysis: [], modulations: [], harmonicRhythm: 0 }) },
  FiguredBass: { fromChord: () => '' },
  KeyDetection: { detect: () => [] },
  getSubstitutions: () => [],
  CircleOfFifths: class {},
}

describe('createSong', () => {
  it('creates empty song with schemaVersion 1', () => {
    const s = createSong()
    expect(s.schemaVersion).toBe(1)
    expect(s.sections).toHaveLength(0)
    expect(s.title).toBe('Untitled')
  })
})

describe('addSection', () => {
  it('adds section with one empty measure', () => {
    const s = addSection(createSong(), 'Verse', 'verse')
    expect(s.sections).toHaveLength(1)
    expect(s.sections[0].measures).toHaveLength(1)
    expect(s.sections[0].name).toBe('Verse')
  })
})

describe('addChord / removeChord', () => {
  it('adds chord to measure', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const sectionId = s.sections[0].id
    const measureId = s.sections[0].measures[0].id
    s = addChord(s, sectionId, measureId, 'Cmaj7')
    expect(s.sections[0].measures[0].chords).toHaveLength(1)
    expect(s.sections[0].measures[0].chords[0].symbol).toBe('Cmaj7')
  })

  it('removes chord by id', () => {
    let s = addSection(createSong(), 'Verse', 'verse')
    const sId = s.sections[0].id
    const mId = s.sections[0].measures[0].id
    s = addChord(s, sId, mId, 'Am7')
    const chordId = s.sections[0].measures[0].chords[0].id
    s = removeChord(s, chordId)
    expect(s.sections[0].measures[0].chords).toHaveLength(0)
  })
})

describe('parseProgressionText', () => {
  it('splits on spaces', () => {
    expect(parseProgressionText('Cmaj7 Am7 F G')).toEqual(['Cmaj7','Am7','F','G'])
  })
  it('splits on commas', () => {
    expect(parseProgressionText('Cmaj7,Am7,F,G')).toEqual(['Cmaj7','Am7','F','G'])
  })
  it('handles newlines', () => {
    expect(parseProgressionText('Cmaj7\nAm7')).toEqual(['Cmaj7','Am7'])
  })
  it('keeps slash chords intact', () => {
    expect(parseProgressionText('Am/E G/B')).toEqual(['Am/E','G/B'])
  })
  it('filters empty tokens', () => {
    expect(parseProgressionText('  Cmaj7   G  ')).toEqual(['Cmaj7','G'])
  })
})

describe('computeMeasureNumbers', () => {
  it('numbers measures sequentially across sections', () => {
    let s = addSection(createSong(), 'Intro', 'intro')
    s = addMeasure(s, s.sections[0].id)
    s = addSection(s, 'Verse', 'verse')
    const nums = computeMeasureNumbers(s)
    const allIds = s.sections.flatMap(sec => sec.measures.map(m => m.id))
    expect(nums.get(allIds[0])).toBe(1)
    expect(nums.get(allIds[1])).toBe(2)
    expect(nums.get(allIds[2])).toBe(3)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement song.ts pure state functions**

```ts
import type { Song, Section, Measure, SongChord, SectionColor } from './types'

export function createSong(): Song {
  return { schemaVersion: 1, title: 'Untitled', sections: [] }
}

function newId(): string { return crypto.randomUUID() }

function newMeasure(): Measure { return { id: newId(), chords: [] } }

export function addSection(song: Song, name: string, color: SectionColor): Song {
  const section: Section = {
    id: newId(), name, color,
    measures: [newMeasure()],
    collapsed: false,
    repeatCount: 1,
  }
  return { ...song, sections: [...song.sections, section] }
}

export function removeSection(song: Song, sectionId: string): Song {
  return { ...song, sections: song.sections.filter(s => s.id !== sectionId) }
}

export function updateSection(song: Song, sectionId: string, patch: Partial<Section>): Song {
  return {
    ...song,
    sections: song.sections.map(s => s.id === sectionId ? { ...s, ...patch } : s)
  }
}

export function moveSectionUp(song: Song, sectionId: string): Song {
  const idx = song.sections.findIndex(s => s.id === sectionId)
  if (idx <= 0) return song
  const sections = [...song.sections]
  ;[sections[idx - 1], sections[idx]] = [sections[idx], sections[idx - 1]]
  return { ...song, sections }
}

export function moveSectionDown(song: Song, sectionId: string): Song {
  const idx = song.sections.findIndex(s => s.id === sectionId)
  if (idx < 0 || idx >= song.sections.length - 1) return song
  const sections = [...song.sections]
  ;[sections[idx], sections[idx + 1]] = [sections[idx + 1], sections[idx]]
  return { ...song, sections }
}

export function duplicateSection(song: Song, sectionId: string): Song {
  const src = song.sections.find(s => s.id === sectionId)
  if (!src) return song
  const copy: Section = {
    ...src,
    id: newId(),
    measures: src.measures.map(m => ({
      id: newId(),
      chords: m.chords.map(c => ({ ...c, id: newId() }))
    }))
  }
  const idx = song.sections.findIndex(s => s.id === sectionId)
  const sections = [...song.sections]
  sections.splice(idx + 1, 0, copy)
  return { ...song, sections }
}

export function addMeasure(song: Song, sectionId: string): Song {
  return {
    ...song,
    sections: song.sections.map(s =>
      s.id === sectionId ? { ...s, measures: [...s.measures, newMeasure()] } : s
    )
  }
}

export function removeMeasure(song: Song, sectionId: string, measureId: string): Song {
  return {
    ...song,
    sections: song.sections.map(s => {
      if (s.id !== sectionId || s.measures.length <= 1) return s
      return { ...s, measures: s.measures.filter(m => m.id !== measureId) }
    })
  }
}

export function addChord(song: Song, sectionId: string, measureId: string, symbol: string): Song {
  const valid = isValidChordSymbol(symbol)
  const chord: SongChord = { id: newId(), symbol, valid }
  return {
    ...song,
    sections: song.sections.map(s => s.id !== sectionId ? s : {
      ...s,
      measures: s.measures.map(m => m.id !== measureId ? m : {
        ...m, chords: [...m.chords, chord]
      })
    })
  }
}

export function updateChord(song: Song, chordId: string, symbol: string): Song {
  const valid = isValidChordSymbol(symbol)
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => ({
        ...m,
        chords: m.chords.map(c => c.id === chordId ? { ...c, symbol, valid } : c)
      }))
    }))
  }
}

export function removeChord(song: Song, chordId: string): Song {
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => ({
        ...m, chords: m.chords.filter(c => c.id !== chordId)
      }))
    }))
  }
}

export function moveChord(song: Song, chordId: string, direction: 'left' | 'right'): Song {
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => {
        const idx = m.chords.findIndex(c => c.id === chordId)
        if (idx === -1) return m
        const chords = [...m.chords]
        const swapIdx = direction === 'left' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= chords.length) return m
        ;[chords[idx], chords[swapIdx]] = [chords[swapIdx], chords[idx]]
        return { ...m, chords }
      })
    }))
  }
}

export function computeMeasureNumbers(song: Song): Map<string, number> {
  const map = new Map<string, number>()
  let n = 1
  for (const section of song.sections) {
    for (const measure of section.measures) {
      map.set(measure.id, n++)
    }
  }
  return map
}

export function parseProgressionText(text: string): string[] {
  return text.split(/[\s,\n]+/).map(t => t.trim()).filter(Boolean)
}

export function computeDegree(chordSymbol: string, activeKey: string | null): string {
  if (!activeKey || !chordSymbol) return '—'
  try {
    const chord = UMT.parseChordSymbol(chordSymbol)
    const { analysis } = UMT.Harmony.analyzeProgression([chord], activeKey)
    const a = analysis[0]
    if (!a) return '?'
    const label = a.roman ?? '?'
    return label
  } catch { return '?' }
}

export function isBorrowedChord(chordSymbol: string, activeKey: string | null): boolean {
  if (!activeKey) return false
  try {
    const chord = UMT.parseChordSymbol(chordSymbol)
    const { analysis } = UMT.Harmony.analyzeProgression([chord], activeKey)
    return analysis[0]?.isBorrowed ?? false
  } catch { return false }
}

function isValidChordSymbol(symbol: string): boolean {
  try { UMT.parseChordSymbol(symbol); return true } catch { return false }
}

const SEMITONE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const SEMITONE_NAMES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const SHARP_KEYS = ['G','D','A','E','B','F#','C#']

function transposeRoot(root: string, semitones: number, preferSharps: boolean): string {
  const names = preferSharps ? SEMITONE_NAMES_SHARP : SEMITONE_NAMES_FLAT
  const all = [...SEMITONE_NAMES_SHARP, ...SEMITONE_NAMES_FLAT]
  const idx = all.indexOf(root)
  if (idx === -1) return root
  const pc = all.indexOf(root) % 12
  return names[((pc + semitones) % 12 + 12) % 12]
}

export function transposeSong(song: Song, semitones: number, targetKey?: string): Song {
  const preferSharps = targetKey ? SHARP_KEYS.includes(targetKey.split(' ')[0]) : false
  const transposeSymbol = (symbol: string): string => {
    try {
      const chord = UMT.parseChordSymbol(symbol)
      const root = chord.root?.name ?? ''
      const newRoot = transposeRoot(root, semitones, preferSharps)
      return symbol.replace(root, newRoot)
    } catch { return symbol }
  }
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => ({
        ...m,
        chords: m.chords.map(c => ({ ...c, symbol: transposeSymbol(c.symbol), valid: true }))
      }))
    }))
  }
}

export function saveSong(song: Song) {
  localStorage.setItem('harmony-companion-song', JSON.stringify(song))
}

export function loadSong(): Song {
  try {
    const raw = localStorage.getItem('harmony-companion-song')
    if (!raw) return createSong()
    const parsed = JSON.parse(raw)
    if (parsed.schemaVersion !== 1) {
      console.warn('Song schema version mismatch — resetting')
      return createSong()
    }
    return parsed as Song
  } catch { return createSong() }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```

Expected: all song tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/song.ts tests/song.test.ts
git commit -m "feat: add song state module with pure CRUD, transpose, and measure numbers"
```

---

## Task 9: Song UI Rendering

**Files:**
- Modify: `modus/src/song.ts` (append rendering functions)

- [ ] **Step 1: Append renderSong and helpers to song.ts**

```ts
// ─── Song UI (append after pure functions) ───────────────────────────────────

import { playChord } from './audio'

const SECTION_COLORS: Record<SectionColor, string> = {
  intro: '#7c3aed', verse: '#2563eb', prechorus: '#0891b2',
  chorus: '#16a34a', bridge: '#d97706', outro: '#6b7280', custom: '#4b5563'
}

type SongEventHandlers = {
  onChordClick: (chordId: string, symbol: string) => void
  onChordCapture: (chordId: string) => void
  activeCursorId: string | null
  activeKey: string | null
  onSongChange: (song: Song) => void
}

let _song: Song = createSong()
let _handlers: SongEventHandlers | null = null
let _container: HTMLElement | null = null

export function mountSong(container: HTMLElement, song: Song, handlers: SongEventHandlers) {
  _song = song
  _handlers = handlers
  _container = container
  rerender()
}

export function updateSongState(song: Song) {
  _song = song
  if (_container && _handlers) rerender()
}

function rerender() {
  if (!_container || !_handlers) return
  _container.innerHTML = ''
  _container.appendChild(buildSongDOM(_song, _handlers))
}

function buildSongDOM(song: Song, h: SongEventHandlers): HTMLElement {
  const root = document.createElement('div')
  root.style.cssText = 'padding:12px;display:flex;flex-direction:column;gap:8px'

  // ── Title + controls ──
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap'

  const titleInput = document.createElement('input')
  titleInput.value = song.title
  titleInput.style.cssText = 'font-size:16px;font-weight:700;background:transparent;border:none;border-bottom:1px solid #4a4a6a;color:#e0e0e0;padding:2px 4px;min-width:120px'
  titleInput.addEventListener('blur', () => {
    _song = { ..._song, title: titleInput.value }
    h.onSongChange(_song)
  })

  const newBtn = makeBtn('New', '#374151', () => {
    if (confirm('Start a new song? Current song will be lost.')) {
      _song = createSong(); saveSong(_song); h.onSongChange(_song)
    }
  })

  // Template buttons
  const templates: { label: string; name: string; color: SectionColor }[] = [
    { label: 'Intro', name: 'Intro', color: 'intro' },
    { label: 'Verse', name: 'Verse', color: 'verse' },
    { label: 'Pre', name: 'Pre-Chorus', color: 'prechorus' },
    { label: 'Chorus', name: 'Chorus', color: 'chorus' },
    { label: 'Bridge', name: 'Bridge', color: 'bridge' },
    { label: 'Outro', name: 'Outro', color: 'outro' },
  ]
  const templateWrap = document.createElement('div')
  templateWrap.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap'
  templates.forEach(t => {
    const btn = makeBtn(`+ ${t.label}`, SECTION_COLORS[t.color], () => {
      _song = addSection(_song, t.name, t.color); saveSong(_song); h.onSongChange(_song)
    })
    btn.style.fontSize = '11px'
    templateWrap.appendChild(btn)
  })

  // Transpose
  const transposeSelect = document.createElement('select')
  transposeSelect.style.cssText = 'background:#252540;color:#e0e0e0;border:1px solid #4a4a6a;border-radius:4px;padding:3px'
  transposeSelect.innerHTML = '<option value="">⇄ Transpose</option>' +
    Array.from({length:11},(_,i)=>`<option value="${i+1}">+${i+1} st</option>`).join('')
  transposeSelect.addEventListener('change', () => {
    const n = parseInt(transposeSelect.value)
    if (n) { _song = transposeSong(_song, n); saveSong(_song); h.onSongChange(_song) }
    transposeSelect.value = ''
  })

  // Export
  const exportBtn = makeBtn('⎙ Export', '#374151', () => {
    const printWin = window.open('', '_blank')!
    printWin.document.write(buildPrintHTML(_song, h.activeKey))
    printWin.document.close()
    printWin.print()
  })

  // Paste
  const pasteBtn = makeBtn('Paste', '#374151', () => {
    const text = prompt('Paste chord progression (space/comma/newline separated):')
    if (!text) return
    const symbols = parseProgressionText(text)
    const focusedSection = _song.sections[_song.sections.length - 1]
    if (!focusedSection) { _song = addSection(_song, 'Section', 'verse') }
    const section = _song.sections[_song.sections.length - 1]
    const measure = newPasteMeasure(symbols)
    _song = {
      ..._song,
      sections: _song.sections.map(s => s.id !== section.id ? s : {
        ...s, measures: [...s.measures, measure]
      })
    }
    if (symbols.length > 8) alert('All chords added to one measure — split as needed.')
    saveSong(_song); h.onSongChange(_song)
  })

  header.append(titleInput, newBtn, templateWrap, transposeSelect, exportBtn, pasteBtn)
  root.appendChild(header)

  // ── Sections ──
  const measureNums = computeMeasureNumbers(song)

  song.sections.forEach(section => {
    root.appendChild(buildSectionDOM(section, song, h, measureNums))
  })

  return root
}

function newPasteMeasure(symbols: string[]): Measure {
  return {
    id: crypto.randomUUID(),
    chords: symbols.map(sym => ({
      id: crypto.randomUUID(),
      symbol: sym,
      valid: isValidChordSymbolPublic(sym)
    }))
  }
}

function isValidChordSymbolPublic(symbol: string): boolean {
  try { UMT.parseChordSymbol(symbol); return true } catch { return false }
}

function buildSectionDOM(
  section: Section, song: Song,
  h: SongEventHandlers,
  measureNums: Map<string, number>
): HTMLElement {
  const color = SECTION_COLORS[section.color]
  const wrap = document.createElement('div')
  wrap.style.cssText = `border-left:3px solid ${color};border-radius:4px;background:#1e1e35;overflow:hidden`

  // Header
  const secHeader = document.createElement('div')
  secHeader.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 10px;background:#252540'

  const toggle = document.createElement('span')
  toggle.textContent = section.collapsed ? '▶' : '▼'
  toggle.style.cssText = 'cursor:pointer;font-size:11px;color:#9ca3af'
  toggle.addEventListener('click', () => {
    _song = updateSection(_song, section.id, { collapsed: !section.collapsed })
    saveSong(_song); h.onSongChange(_song)
  })

  const nameInput = document.createElement('input')
  nameInput.value = section.name
  nameInput.style.cssText = `font-size:13px;font-weight:600;color:${color};background:transparent;border:none;border-bottom:1px dashed transparent;padding:1px 2px`
  nameInput.addEventListener('focus', () => nameInput.style.borderBottomColor = color)
  nameInput.addEventListener('blur', () => {
    nameInput.style.borderBottomColor = 'transparent'
    _song = updateSection(_song, section.id, { name: nameInput.value })
    saveSong(_song); h.onSongChange(_song)
  })

  if (section.repeatCount > 1) {
    const repeatBadge = document.createElement('span')
    repeatBadge.textContent = `×${section.repeatCount}`
    repeatBadge.title = 'Click to edit repeat count'
    repeatBadge.style.cssText = 'font-size:10px;color:#9ca3af;cursor:pointer;background:#374151;border-radius:3px;padding:1px 4px'
    repeatBadge.addEventListener('click', () => {
      const n = parseInt(prompt('Repeat count (1-16):', String(section.repeatCount)) ?? '1')
      if (n >= 1 && n <= 16) {
        _song = updateSection(_song, section.id, { repeatCount: n })
        saveSong(_song); h.onSongChange(_song)
      }
    })
    secHeader.appendChild(repeatBadge)
  }

  const upBtn = makeSmallBtn('↑', () => { _song = moveSectionUp(_song, section.id); saveSong(_song); h.onSongChange(_song) })
  const downBtn = makeSmallBtn('↓', () => { _song = moveSectionDown(_song, section.id); saveSong(_song); h.onSongChange(_song) })
  const dupBtn = makeSmallBtn('⧉', () => { _song = duplicateSection(_song, section.id); saveSong(_song); h.onSongChange(_song) })
  const delBtn = makeSmallBtn('×', () => {
    if (confirm(`Delete section "${section.name}"?`)) {
      _song = removeSection(_song, section.id); saveSong(_song); h.onSongChange(_song)
    }
  })
  delBtn.style.color = '#f87171'

  secHeader.append(toggle, nameInput, upBtn, downBtn, dupBtn, delBtn)

  const addMeasureBtn = makeSmallBtn('+ Bar', () => {
    _song = addMeasure(_song, section.id); saveSong(_song); h.onSongChange(_song)
  })
  secHeader.appendChild(addMeasureBtn)

  wrap.appendChild(secHeader)

  // Measures (if not collapsed)
  if (!section.collapsed) {
    const measuresWrap = document.createElement('div')
    measuresWrap.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px'

    section.measures.forEach(measure => {
      measuresWrap.appendChild(buildMeasureDOM(measure, section, h, measureNums.get(measure.id) ?? 0))
    })

    wrap.appendChild(measuresWrap)
  }

  return wrap
}

function buildMeasureDOM(
  measure: Measure, section: Section,
  h: SongEventHandlers, measureNum: number
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;align-items:flex-start;gap:4px'

  const numLabel = document.createElement('span')
  numLabel.textContent = String(measureNum)
  numLabel.style.cssText = 'font-size:10px;color:#6b7280;min-width:18px;padding-top:8px'
  wrap.appendChild(numLabel)

  const chordsRow = document.createElement('div')
  chordsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start'

  measure.chords.forEach(chord => {
    chordsRow.appendChild(buildChordChip(chord, section, measure, h))
  })

  // Add chord button
  const addBtn = document.createElement('button')
  addBtn.textContent = '+'
  addBtn.style.cssText = 'width:32px;height:40px;border-radius:4px;background:#252540;color:#9ca3af;border:1px dashed #4a4a6a;cursor:pointer;font-size:18px'
  addBtn.addEventListener('click', () => {
    _song = addChord(_song, section.id, measure.id, '')
    saveSong(_song); h.onSongChange(_song)
    // Focus the new input after re-render
    setTimeout(() => {
      const inputs = _container?.querySelectorAll<HTMLInputElement>('.chord-input')
      inputs?.[inputs.length - 1]?.focus()
    }, 50)
  })
  chordsRow.appendChild(addBtn)

  wrap.appendChild(chordsRow)

  // Delete measure button (only if section has >1 measure)
  const delMBtn = makeSmallBtn('×', () => {
    _song = removeMeasure(_song, section.id, measure.id); saveSong(_song); h.onSongChange(_song)
  })
  delMBtn.style.color = '#f87171'
  delMBtn.style.alignSelf = 'center'
  // Only show if section has more than 1 measure
  const sectionObj = _song.sections.find(s => s.id === section.id)
  if (!sectionObj || sectionObj.measures.length <= 1) delMBtn.style.display = 'none'
  wrap.appendChild(delMBtn)

  return wrap
}

function buildChordChip(chord: SongChord, section: Section, measure: Measure, h: SongEventHandlers): HTMLElement {
  const isActive = h.activeCursorId === chord.id
  const degree = chord.valid && chord.symbol ? computeDegree(chord.symbol, h.activeKey) : '—'
  const borrowed = chord.valid && chord.symbol ? isBorrowedChord(chord.symbol, h.activeKey) : false

  const wrap = document.createElement('div')
  wrap.style.cssText = `
    position:relative;display:flex;flex-direction:column;align-items:center;
    min-width:52px;padding:4px 6px;border-radius:6px;
    background:#252540;cursor:pointer;
    border:1.5px solid ${isActive ? '#fff' : chord.valid === false ? '#ef4444' : '#3a3a5c'};
  `

  // Editing mode: show input
  const isEditing = !chord.symbol  // start in edit mode if empty
  if (isEditing) {
    const input = document.createElement('input')
    input.className = 'chord-input'
    input.style.cssText = 'width:52px;background:transparent;border:none;color:#e0e0e0;font-size:12px;font-weight:600;text-align:center;outline:none'
    input.placeholder = 'Am7'

    let prevValue = chord.symbol

    const confirm = () => {
      const val = input.value.trim()
      if (val) {
        _song = updateChord(_song, chord.id, val)
      } else {
        _song = removeChord(_song, chord.id)
      }
      saveSong(_song); h.onSongChange(_song)
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); confirm() }
      if (e.key === 'Escape') {
        if (!prevValue) _song = removeChord(_song, chord.id)
        // else revert — re-render will restore prevValue
        saveSong(_song); h.onSongChange(_song)
      }
      if (e.key === 'Backspace' && input.value === '') {
        _song = removeChord(_song, chord.id); saveSong(_song); h.onSongChange(_song)
      }
    })
    input.addEventListener('blur', confirm)
    wrap.appendChild(input)
    return wrap
  }

  // Display mode
  const symbolEl = document.createElement('div')
  symbolEl.textContent = chord.symbol
  symbolEl.style.cssText = `font-size:12px;font-weight:600;color:${chord.valid ? '#e0e0e0' : '#ef4444'}`

  const degreeEl = document.createElement('div')
  degreeEl.textContent = degree
  degreeEl.style.cssText = `font-size:9px;color:${borrowed ? '#f59e0b' : '#6b7280'};margin-top:2px`

  wrap.appendChild(symbolEl)
  wrap.appendChild(degreeEl)

  // Hover controls
  const controls = document.createElement('div')
  controls.style.cssText = 'display:none;position:absolute;top:-20px;left:0;gap:2px;background:#1a1a2e;border-radius:3px;padding:1px 2px'
  controls.innerHTML = ''

  const editBtn = makeSmallBtn('✎', () => {
    // Replace chip with input — rebuild chip in editing mode
    const input = document.createElement('input')
    input.className = 'chord-input'
    input.value = chord.symbol
    input.style.cssText = 'width:52px;background:transparent;border:none;color:#e0e0e0;font-size:12px;font-weight:600;text-align:center;outline:none'
    let prevVal = chord.symbol
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { _song = updateChord(_song, chord.id, input.value.trim() || prevVal); saveSong(_song); h.onSongChange(_song) }
      if (e.key === 'Escape') { h.onSongChange(_song) } // revert
    })
    input.addEventListener('blur', () => { _song = updateChord(_song, chord.id, input.value.trim() || prevVal); saveSong(_song); h.onSongChange(_song) })
    wrap.innerHTML = ''; wrap.appendChild(input); input.focus()
  })
  const delBtn = makeSmallBtn('×', () => { _song = removeChord(_song, chord.id); saveSong(_song); h.onSongChange(_song) })
  const leftBtn = makeSmallBtn('←', () => { _song = moveChord(_song, chord.id, 'left'); saveSong(_song); h.onSongChange(_song) })
  const rightBtn = makeSmallBtn('→', () => { _song = moveChord(_song, chord.id, 'right'); saveSong(_song); h.onSongChange(_song) })
  const captureBtn = makeSmallBtn('⊕', () => h.onChordCapture(chord.id))

  controls.append(leftBtn, rightBtn, editBtn, captureBtn, delBtn)
  wrap.appendChild(controls)

  wrap.addEventListener('mouseenter', () => controls.style.display = 'flex')
  wrap.addEventListener('mouseleave', () => controls.style.display = 'none')

  wrap.addEventListener('click', () => h.onChordClick(chord.id, chord.symbol))
  wrap.addEventListener('dblclick', () => playChord(chord.symbol))

  return wrap
}

function makeBtn(label: string, bg: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.style.cssText = `padding:4px 10px;border-radius:4px;background:${bg};color:#fff;border:none;cursor:pointer;font-size:12px`
  btn.addEventListener('click', onClick)
  return btn
}

function makeSmallBtn(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.style.cssText = 'padding:2px 5px;border-radius:3px;background:#374151;color:#e0e0e0;border:none;cursor:pointer;font-size:11px'
  btn.addEventListener('click', e => { e.stopPropagation(); onClick() })
  return btn
}

function buildPrintHTML(song: Song, activeKey: string | null): string {
  const measureNums = computeMeasureNumbers(song)
  let html = `<html><head><style>
    body{font-family:sans-serif;padding:24px} h1{margin-bottom:4px} .key{color:#555;margin-bottom:16px}
    .section{margin-bottom:20px} .section-name{font-weight:700;font-size:14px;border-bottom:2px solid #333;margin-bottom:8px;padding-bottom:4px}
    .measures{display:flex;flex-wrap:wrap;gap:8px} .measure{border:1px solid #ccc;border-radius:4px;padding:6px 8px;min-width:80px}
    .bar-num{font-size:10px;color:#999;margin-bottom:4px} .chord{font-size:13px;font-weight:600} .degree{font-size:10px;color:#666}
  </style></head><body>
    <h1>${song.title}</h1>
    <div class="key">${activeKey ? 'Key: ' + activeKey : ''}</div>`
  for (const section of song.sections) {
    html += `<div class="section"><div class="section-name">${section.name}${section.repeatCount > 1 ? ` ×${section.repeatCount}` : ''}</div><div class="measures">`
    for (const measure of section.measures) {
      const num = measureNums.get(measure.id) ?? ''
      html += `<div class="measure"><div class="bar-num">${num}</div>`
      for (const chord of measure.chords) {
        const degree = activeKey ? computeDegree(chord.symbol, activeKey) : '—'
        html += `<div class="chord">${chord.symbol}</div><div class="degree">${degree}</div>`
      }
      html += '</div>'
    }
    html += '</div></div>'
  }
  html += '</body></html>'
  return html
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/song.ts
git commit -m "feat: add song UI rendering with chord chips, degree display, and print export"
```

---

## Task 10: App Wiring

**Files:**
- Modify: `modus/src/app.ts`
- Modify: `modus/index.html` (add CSS)

- [ ] **Step 1: Write app.ts**

```ts
import { initMidi, setNoteChangeCallback, setMode, getMode, getDevices, selectDevice, midiToNoteName } from './midi'
import { analyzeNotes, buildHarmonicAnalysis, getAutoKey } from './analyzer'
import { initAudioOnGesture, playChord } from './audio'
import { loadGuitarDB, renderStaff, renderPiano, renderGuitar, renderCircleOfFifths, nextGuitarVoicing } from './diagrams'
import { setHistoryChangeCallback, getEntries, addEntry, clearHistory, notifyChordDetected, getHistoryNotes, renderHistory } from './history'
import { loadSong, saveSong, mountSong, updateSongState, addChord as songAddChord } from './song'
import type { AppState, DetectionResult, HistoryEntry } from './types'

// ─── State ───────────────────────────────────────────────────────────────────

const state: AppState = {
  midi: { deviceId: null, mode: 'normal', activeNotes: new Set(), lastArpeggioNotes: [], arpeggioTimer: null },
  activeKey: null,
  detectedKey: null,
  detection: null,
  analysis: null,
  history: [],
  song: loadSong(),
  activeCursorId: null,
  panels: {
    notation: true, analysis: true,
    history: JSON.parse(localStorage.getItem('panel-history') ?? 'true'),
    song: JSON.parse(localStorage.getItem('panel-song') ?? 'true'),
  }
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id)!

function init() {
  // Browser compat check
  if (!navigator.requestMIDIAccess) {
    $('browser-warning').classList.add('visible')
  }

  document.addEventListener('click', initAudioOnGesture, { once: true })

  loadGuitarDB()
  buildLayout()
  wireKeyboard()
  initMidi().then(result => {
    if (result.denied) {
      showMidiBanner('MIDI access denied. Grant permission in browser settings to use a controller.')
    }
    if (!result.unsupported) refreshDeviceDropdown()
  })

  setNoteChangeCallback(onNoteChange)
  setHistoryChangeCallback(onHistoryChange)

  mountSong($('zone3-content'), state.song, {
    onChordClick: (id, symbol) => {
      state.activeCursorId = id
      if (symbol) triggerChordAnalysis(symbol)
    },
    onChordCapture: (id) => { state.activeCursorId = id },
    activeCursorId: state.activeCursorId,
    activeKey: state.activeKey,
    onSongChange: (song) => { state.song = song; saveSong(song) }
  })

  renderZone3()
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function buildLayout() {
  // Zone 1
  $('zone1').innerHTML = `
    <div id="z1-toolbar" style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:#111128;border-bottom:1px solid #2d2d44;flex-wrap:wrap">
      <span id="midi-status" style="font-size:12px;color:#6b7280">MIDI: —</span>
      <select id="midi-device" style="background:#252540;color:#e0e0e0;border:1px solid #4a4a6a;border-radius:4px;padding:3px;font-size:12px"></select>
      <button id="btn-normal" class="mode-btn active-mode" data-mode="normal">Normal</button>
      <button id="btn-hold" class="mode-btn" data-mode="hold">Hold</button>
      <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio">Arpeggio</button>
      <select id="key-select" style="background:#252540;color:#e0e0e0;border:1px solid #4a4a6a;border-radius:4px;padding:3px;font-size:12px">
        <option value="">Key: Auto</option>
        ${['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'].flatMap(r =>
          [`<option value="${r} Major">${r} Major</option>`, `<option value="${r} Minor">${r} Minor</option>`]
        ).join('')}
      </select>
      <span id="auto-key-label" style="font-size:11px;color:#6b7280"></span>
    </div>
    <div style="display:flex;gap:0;padding:12px;gap:12px">
      <div id="notation-panel" style="flex:0 0 260px">
        <div class="panel-header"><span>Notation</span><button class="toggle-btn" data-panel="notation">👁</button></div>
        <div id="notation-content">
          <div id="staff-container" style="min-height:80px"></div>
          <div id="piano-container" style="margin-top:8px"></div>
          <div id="guitar-container" style="margin-top:8px"></div>
          <div id="cof-container" style="margin-top:8px"></div>
        </div>
      </div>
      <div id="analysis-panel" style="flex:1">
        <div class="panel-header"><span>Analysis</span><button class="toggle-btn" data-panel="analysis">👁</button></div>
        <div id="analysis-content" style="font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:6px 16px"></div>
      </div>
    </div>
    <div id="midi-banner" style="display:none;background:#7f1d1d;padding:6px 12px;font-size:12px"></div>
  `

  // Zone 2
  $('zone2').innerHTML = `
    <div class="zone-header">
      <span style="font-size:12px;font-weight:600">History</span>
      <button class="toggle-btn" data-panel="history">▼</button>
    </div>
    <div id="zone2-content"></div>
  `

  // Zone 3
  $('zone3').innerHTML = `
    <div class="zone-header">
      <span style="font-size:12px;font-weight:600">Song Structure</span>
      <button class="toggle-btn" data-panel="song">▼</button>
    </div>
    <div id="zone3-content"></div>
  `

  // Mode buttons
  document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode as any
      // Mutually exclusive
      if (getMode() === m) return
      setMode(m)
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active-mode'))
      btn.classList.add('active-mode')
    })
  })

  // Key selector
  $('key-select').addEventListener('change', (e) => {
    state.activeKey = (e.target as HTMLSelectElement).value || null
    refreshAll()
  })

  // Panel toggles
  document.querySelectorAll<HTMLButtonElement>('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel as keyof typeof state.panels
      state.panels[panel] = !state.panels[panel]
      localStorage.setItem(`panel-${panel}`, JSON.stringify(state.panels[panel]))
      applyPanelVisibility()
    })
  })
}

function applyPanelVisibility() {
  const nc = $('notation-content'); if (nc) nc.style.display = state.panels.notation ? '' : 'none'
  const ac = $('analysis-content'); if (ac) ac.style.display = state.panels.analysis ? '' : 'none'
  const z2 = $('zone2-content'); if (z2) z2.style.display = state.panels.history ? '' : 'none'
  const z3 = $('zone3-content'); if (z3) z3.style.display = state.panels.song ? '' : 'none'
}

// ─── MIDI callbacks ───────────────────────────────────────────────────────────

function onNoteChange(notes: number[]) {
  const result = analyzeNotes(notes, state.activeKey, getLastHistorySymbol())
  state.detection = result

  if (result?.kind === 'chord') {
    const sym = result.candidates[result.selectedIndex]
    state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol())
    notifyChordDetected(sym, result.notes)
    renderZone1Diagrams(result.notes, sym)
  } else if (result?.kind === 'note' || result?.kind === 'interval') {
    state.analysis = null
    renderZone1Diagrams(result.notes ?? [result.noteName], null)
  } else {
    state.analysis = null
  }

  renderZone1Analysis()
  refreshAutoKey()
}

function getLastHistorySymbol(): string | null {
  return state.history[0]?.symbol ?? null
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderZone1Diagrams(noteNames: string[], chordSymbol: string | null) {
  renderStaff($('staff-container'), noteNames)
  renderPiano($('piano-container'), noteNames, chordSymbol ?? '')
  if (chordSymbol) renderGuitar($('guitar-container'), chordSymbol)
  renderCircleOfFifths($('cof-container'), state.activeKey, chordSymbol ? chordSymbol[0] : null, (key) => {
    state.activeKey = key;
    ($('key-select') as HTMLSelectElement).value = key
    refreshAll()
  })
}

function renderZone1Analysis() {
  const el = $('analysis-content')
  if (!el) return
  if (!state.detection) { el.innerHTML = '<span style="color:#6b7280;font-size:12px">Play notes to analyze</span>'; return }

  const d = state.detection
  if (d.kind === 'note') {
    el.innerHTML = `<div><b>${d.noteName}</b><br><small>MIDI ${d.midiNumber} · ${d.pitchClass}</small></div>`
    return
  }
  if (d.kind === 'interval') {
    el.innerHTML = `<div><b>${d.intervalName}</b><br><small>${d.semitones} semitones · inversion: ${d.inversionName}</small></div>`
    return
  }

  // Chord
  const a = state.analysis
  const chordName = d.candidates[d.selectedIndex]

  let html = `
    <div style="grid-column:1/-1;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap">
      <span style="font-size:22px;font-weight:700">${chordName}</span>
      ${d.candidates.slice(1, 5).map((c, i) =>
        `<span class="alt-chord" data-idx="${i+1}" style="font-size:12px;color:#9ca3af;cursor:pointer;text-decoration:underline">${c}</span>`
      ).join('')}
    </div>
    <div><label>Notes</label><span>${d.notes.join(' · ')}</span></div>
  `

  if (a) {
    html += `
      <div><label>Roman</label><span>${a.roman}</span></div>
      <div><label>Function</label><span>${{T:'Tonic',S:'Subdominant',D:'Dominant',unknown:'Unknown'}[a.function]}</span></div>
      <div><label>Figured bass</label><span>${a.figuredBass || '—'}</span></div>
      <div><label>Diatonic</label><span>${a.isDiatonic ? 'Yes' : a.isBorrowed ? `Borrowed from ${a.borrowedFrom ?? '?'}` : 'Chromatic'}</span></div>
      ${a.isSecondary ? `<div style="grid-column:1/-1"><label>Secondary</label><span>→ ${a.secondaryTarget}</span></div>` : ''}
      <div><label>Scales</label><span>${a.suggestedScales.slice(0, 4).join(', ') || '—'}</span></div>
      ${a.cadence ? `<div><label>Cadence</label><span>${a.cadence}</span></div>` : ''}
      ${a.coltraneAxis ? `<div><label>Coltrane axis</label><span>${a.coltraneAxis.join(' · ')}</span></div>` : ''}
      ${a.negativeHarmony ? `<div><label>Negative harmony</label><span>${a.negativeHarmony}</span></div>` : ''}
    `
  }

  el.innerHTML = html

  // Wire alt chord clicks
  el.querySelectorAll<HTMLElement>('.alt-chord').forEach(el => {
    el.addEventListener('click', () => {
      if (state.detection?.kind === 'chord') {
        state.detection.selectedIndex = parseInt(el.dataset.idx!)
        const sym = state.detection.candidates[state.detection.selectedIndex]
        state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol())
        renderZone1Analysis()
        renderZone1Diagrams(state.detection.notes, sym)
      }
    })
  })
}

function renderZone2() {
  renderHistory(
    $('zone2-content'),
    state.activeKey,
    (entry) => {
      state.activeCursorId = entry.id
      triggerChordAnalysis(entry.symbol)
    },
    (entry) => sendToSong(entry),
    state.activeCursorId
  )
}

function renderZone3() {
  updateSongState(state.song)
}

function refreshAll() {
  renderZone1Analysis()
  renderZone2()
  renderZone3()
}

function triggerChordAnalysis(symbol: string) {
  state.analysis = buildHarmonicAnalysis(symbol, state.activeKey, getLastHistorySymbol())
  state.detection = { kind: 'chord', notes: [], candidates: [symbol], selectedIndex: 0 }
  renderZone1Analysis()
  const dummyNotes: string[] = []
  try {
    const chord = UMT.parseChordSymbol(symbol)
    chord.getNotes?.().forEach((n: any) => { if (n.name) dummyNotes.push(n.name) })
  } catch {}
  renderZone1Diagrams(dummyNotes, symbol)
}

function sendToSong(entry: HistoryEntry) {
  // Insert after active cursor, or at end of last section
  if (!state.song.sections.length) return
  const lastSection = state.song.sections[state.song.sections.length - 1]
  const lastMeasure = lastSection.measures[lastSection.measures.length - 1]
  state.song = songAddChord(state.song, lastSection.id, lastMeasure.id, entry.symbol)
  saveSong(state.song)
  renderZone3()
}

function onHistoryChange(entries: HistoryEntry[]) {
  state.history = entries
  renderZone2()
  refreshAutoKey()
}

function refreshAutoKey() {
  const auto = getAutoKey(state.history)
  state.detectedKey = auto
  const label = $('auto-key-label')
  if (label) label.textContent = state.activeKey ? '' : (auto ? `auto: ${auto}` : '')
  if (!state.activeKey && auto && state.analysis) {
    // Re-render analysis with auto key
    const sym = state.detection?.kind === 'chord' ? state.detection.candidates[0] : null
    if (sym) {
      state.analysis = buildHarmonicAnalysis(sym, auto, getLastHistorySymbol())
      renderZone1Analysis()
    }
  }
}

// ─── Device dropdown ─────────────────────────────────────────────────────────

function refreshDeviceDropdown() {
  const sel = $('midi-device') as HTMLSelectElement
  const devices = getDevices()
  sel.innerHTML = devices.length
    ? devices.map(d => `<option value="${d.id}">${d.name}</option>`).join('')
    : '<option>No MIDI devices</option>'
  sel.addEventListener('change', () => selectDevice(sel.value))
  if (devices[0]) selectDevice(devices[0].id)

  window.addEventListener('midi-devices-changed', () => refreshDeviceDropdown())
  window.addEventListener('midi-device-disconnected', () => {
    $('midi-status').textContent = 'MIDI: disconnected'
    $('midi-status').style.color = '#f87171'
  })
  $('midi-status').textContent = 'MIDI: connected'
  $('midi-status').style.color = '#4ade80'
}

function showMidiBanner(msg: string) {
  const el = $('midi-banner')
  el.textContent = msg
  el.style.display = 'block'
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    switch (e.key) {
      case 'h': case 'H':
        setModeBtn(getMode() === 'hold' ? 'normal' : 'hold'); break
      case 'a': case 'A':
        setModeBtn(getMode() === 'arpeggio' ? 'normal' : 'arpeggio'); break
      case ' ':
        e.preventDefault()
        if (state.detection?.kind === 'chord') {
          const sym = state.detection.candidates[0]
          const notes = state.detection.notes
          addEntry(sym, notes)
        }
        break
      case 's': case 'S':
        if (state.history[0]) sendToSong(state.history[0]); break
      case 'c': case 'C':
        if (confirm('Clear history?')) clearHistory(); break
      case 'Escape':
        state.activeCursorId = null; renderZone3(); break
      default:
        if (e.key >= '1' && e.key <= '9') {
          const idx = parseInt(e.key) - 1
          if (state.detection?.kind === 'chord' && idx < state.detection.candidates.length) {
            state.detection.selectedIndex = idx
            const sym = state.detection.candidates[idx]
            state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol())
            renderZone1Analysis()
          }
        }
    }
  })
}

function setModeBtn(mode: string) {
  setMode(mode as any)
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active-mode', (b as HTMLElement).dataset.mode === mode)
  })
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

init()
```

- [ ] **Step 2: Add CSS to index.html `<style>` block**

Inside the existing `<style>` tag in `index.html`, append:

```css
.zone-header { display:flex; justify-content:space-between; align-items:center; padding:6px 12px; background:#111128; border-bottom:1px solid #2d2d44; }
.panel-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:12px; font-weight:600; color:#9ca3af; }
.toggle-btn { background:none; border:none; cursor:pointer; color:#9ca3af; font-size:14px; }
.mode-btn { padding:3px 10px; border-radius:4px; background:#252540; color:#9ca3af; border:1px solid #4a4a6a; cursor:pointer; font-size:12px; }
.mode-btn.active-mode { background:#4f46e5; color:#fff; border-color:#4f46e5; }
#zone1 { border-bottom:1px solid #2d2d44; }
#zone2 { border-bottom:1px solid #2d2d44; min-height:48px; }
#zone3 { flex:1; overflow-y:auto; }
#analysis-content label { font-size:10px; color:#6b7280; display:block; }
#analysis-content > div { padding:4px 0; }
.no-voicing { font-size:11px; color:#6b7280; text-align:center; padding:16px; }
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Build**

```bash
node build.js &
npx http-server . -p 8080
```

Open `http://localhost:8080` in Chrome.

- [ ] **Step 5: Manual smoke test checklist**

- [ ] Page loads, no console errors from CDN scripts
- [ ] "Play notes to analyze" shown in analysis panel
- [ ] Connect MIDI controller → device appears in dropdown, status shows "connected"
- [ ] Play single note → shows note name + MIDI number
- [ ] Play two notes → shows interval name
- [ ] Play a major triad → shows chord name with colour badge
- [ ] Play Cmaj7 → Roman numeral shows when key set to C Major
- [ ] Guitar diagram appears for known chords
- [ ] Piano diagram shows highlighted keys
- [ ] Staff renders chord notes
- [ ] Circle of fifths appears; click segment sets key
- [ ] Hold mode: chord stays after releasing notes
- [ ] Arpeggio mode: play notes one by one, chord detected after 1.2s
- [ ] History auto-appends after 0.8s stability
- [ ] Click history chip → loads analysis
- [ ] Double-click chord in song → plays audio
- [ ] Add section → chord chips with degree lines appear
- [ ] Change key → degrees update in song structure
- [ ] Paste progression → chords appear in new measure
- [ ] Export → print dialog opens with chord chart
- [ ] `H` toggles hold mode, `Space` captures, `C` clears history
- [ ] Keyboard shortcuts disabled while typing in chord input

- [ ] **Step 6: Commit**

```bash
git add src/app.ts index.html
git commit -m "feat: complete app wiring — Zone 1/2/3 connected, keyboard shortcuts, MIDI, audio"
```

---

## Task 11: Fix Spec Gaps

**Files:**
- Modify: `modus/src/types.ts` — add `substitutions` + `captureTargetId` to state
- Modify: `modus/src/analyzer.ts` — add substitutions to buildHarmonicAnalysis
- Modify: `modus/src/diagrams.ts` — piano range extension, next voicing button
- Modify: `modus/src/history.ts` — add capture button to Zone 2 strip
- Modify: `modus/src/song.ts` — insertChordAfter helper, colour picker, repeat count badge always shown, formal analysis button
- Modify: `modus/src/app.ts` — quality badge, pitch classes, browser warning fix, cursor insertion, MIDI capture flow

- [ ] **Step 1: Add `substitutions` to HarmonicAnalysis type and captureTargetId to AppState**

In `src/types.ts`, replace the HarmonicAnalysis interface and add captureTargetId to AppState:

```ts
// In HarmonicAnalysis, add field after negativeHarmony:
  substitutions: string[]       // e.g. ["Db7 (tritone sub)", "Fmaj7 (diatonic)"]

// In AppState, add field after activeCursorId:
  captureTargetId: string | null   // SongChord.id waiting for MIDI capture
```

- [ ] **Step 2: Add substitutions to buildHarmonicAnalysis in analyzer.ts**

After the `negativeHarmony` block in `buildHarmonicAnalysis`, add:

```ts
  const substitutions: string[] = []
  try {
    if (activeKey) {
      const subs = UMT.getSubstitutions(chord, activeKey)
      subs.forEach((s: any) => {
        const name = s.chord?.name ?? s.name ?? String(s)
        const type = s.type ?? ''
        substitutions.push(type ? `${name} (${type})` : name)
      })
    }
  } catch { }
```

And add `substitutions` to the return object:

```ts
  return {
    // ... existing fields ...
    substitutions,
    detectedKey: null,
  }
```

- [ ] **Step 3: Add insertChordAfter helper to song.ts**

Add this pure function to `src/song.ts` after `addChord`:

```ts
/** Insert a new chord immediately after the chord with the given id. */
export function insertChordAfter(song: Song, afterChordId: string, symbol: string): Song {
  const valid = isValidChordSymbol(symbol)
  const newChord: SongChord = { id: newId(), symbol, valid }
  return {
    ...song,
    sections: song.sections.map(s => ({
      ...s,
      measures: s.measures.map(m => {
        const idx = m.chords.findIndex(c => c.id === afterChordId)
        if (idx === -1) return m
        const chords = [...m.chords]
        chords.splice(idx + 1, 0, newChord)
        return { ...m, chords }
      })
    }))
  }
}
```

- [ ] **Step 4: Add colour picker and always-visible repeat count to buildSectionDOM in song.ts**

In `buildSectionDOM`, after the `nameInput`, add a colour swatch button and make repeat count always visible:

```ts
  // Colour swatch (always shown)
  const PRESET_COLORS: SectionColor[] = ['intro','verse','prechorus','chorus','bridge','outro','custom']
  const swatchEl = document.createElement('button')
  swatchEl.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:none;cursor:pointer;flex-shrink:0`
  swatchEl.title = 'Change section colour'
  swatchEl.addEventListener('click', () => {
    const options = PRESET_COLORS.map((c, i) => `${i}: ${c}`).join('\n')
    const choice = prompt(`Choose colour:\n${options}`, String(PRESET_COLORS.indexOf(section.color)))
    const idx = parseInt(choice ?? '-1')
    if (idx >= 0 && idx < PRESET_COLORS.length) {
      _song = updateSection(_song, section.id, { color: PRESET_COLORS[idx] })
      saveSong(_song); h.onSongChange(_song)
    }
  })

  // Repeat count badge — always shown (×1 included)
  const repeatBadge = document.createElement('span')
  repeatBadge.textContent = `×${section.repeatCount}`
  repeatBadge.title = 'Click to edit repeat count'
  repeatBadge.style.cssText = 'font-size:10px;color:#9ca3af;cursor:pointer;background:#374151;border-radius:3px;padding:1px 4px'
  repeatBadge.addEventListener('click', () => {
    const n = parseInt(prompt('Repeat count (1-16):', String(section.repeatCount)) ?? '1')
    if (n >= 1 && n <= 16) {
      _song = updateSection(_song, section.id, { repeatCount: n })
      saveSong(_song); h.onSongChange(_song)
    }
  })
```

Replace the existing conditional `if (section.repeatCount > 1)` block with `secHeader.append(swatchEl, repeatBadge)` (always appended).

- [ ] **Step 5: Add Formal Analysis button to buildSongDOM in song.ts**

After `pasteBtn` in `buildSongDOM`, add:

```ts
  const analyzeFormBtn = makeBtn('🔍 Form', '#374151', () => {
    const names = _song.sections.map(s => s.name)
    const form = detectForm(names)
    alert(`Form analysis: ${form}`)
  })
  header.appendChild(analyzeFormBtn)
```

Add the `detectForm` helper at the bottom of song.ts:

```ts
function detectForm(sectionNames: string[]): string {
  if (sectionNames.length === 0) return 'Empty'
  // Normalize: map each unique name to a letter
  const map = new Map<string, string>()
  let letter = 65 // 'A'
  const letters = sectionNames.map(name => {
    const key = name.trim().toLowerCase()
    if (!map.has(key)) map.set(key, String.fromCharCode(letter++))
    return map.get(key)!
  })
  const pattern = letters.join('')
  if (/^(AB)+$/.test(pattern) || pattern === 'ABAB') return `Verse-Chorus (${pattern})`
  if (/^AABA/.test(pattern)) return `AABA (${pattern})`
  if (/^(A+B+A+)$/.test(pattern)) return `Ternary (${pattern})`
  if (/^A+$/.test(pattern)) return `Through-composed — single section (${pattern})`
  return `${pattern}`
}
```

- [ ] **Step 6: Fix piano range extension in diagrams.ts**

Replace `renderPiano` call with range-aware version:

```ts
export function renderPiano(container: HTMLElement, noteNames: string[], quality: string) {
  const color = QUALITY_COLORS[quality?.toLowerCase()] ?? '#6b7280'
  const colors = noteNames.map(() => color)

  // Extend range if notes fall outside default C3-B4
  let rangeFrom = 'C3', rangeTo = 'B4'
  const octaves = noteNames.map(n => parseInt(n.match(/(-?\d+)$/)?.[1] ?? '4'))
  if (octaves.length) {
    const minOct = Math.min(...octaves)
    const maxOct = Math.max(...octaves)
    if (minOct < 3) rangeFrom = `C${minOct}`
    if (maxOct > 4) rangeTo = `B${maxOct}`
  }

  const svg = Notae.renderPiano({
    name: '', keys: noteNames, colors,
    range: { from: rangeFrom, to: rangeTo }
  })
  container.innerHTML = svg

  const keyEls = container.querySelectorAll<SVGElement>('[data-note]')
  if (keyEls.length > 0) {
    keyEls.forEach(el => {
      el.style.cursor = 'pointer'
      el.addEventListener('click', () => playNoteByName(el.dataset.note!))
    })
  }
}
```

- [ ] **Step 7: Add "Next voicing" button in renderGuitar in diagrams.ts**

Replace the last line of `renderGuitar` (which sets `container.innerHTML = svg`) with:

```ts
  const wrap = document.createElement('div')
  wrap.innerHTML = svg

  const nextBtn = document.createElement('button')
  nextBtn.textContent = 'Next voicing ›'
  nextBtn.style.cssText = 'display:block;margin:4px auto;font-size:10px;padding:2px 8px;background:#374151;color:#9ca3af;border:none;border-radius:3px;cursor:pointer'
  nextBtn.addEventListener('click', () => {
    nextGuitarVoicing(chordSymbol)
    renderGuitar(container, chordSymbol)
  })
  if (voicings.length > 1) wrap.appendChild(nextBtn)

  container.innerHTML = ''
  container.appendChild(wrap)
```

- [ ] **Step 8: Add Capture button to Zone 2 history strip in history.ts**

In `renderHistory`, add a Capture button before the `→song` button:

```ts
  const captureBtn = document.createElement('button')
  captureBtn.textContent = '⊙ Capture'
  captureBtn.title = 'Add current chord to history (Space)'
  captureBtn.style.cssText = 'padding:4px 10px;border-radius:4px;background:#374151;color:#fff;border:none;cursor:pointer;white-space:nowrap;font-size:12px'
  captureBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('history-capture-requested'))
  })
```

In app.ts, listen for this event:

```ts
  window.addEventListener('history-capture-requested', () => {
    if (state.detection?.kind === 'chord') {
      addEntry(state.detection.candidates[0], state.detection.notes)
    }
  })
```

- [ ] **Step 9: Fix browser warning to allow non-MIDI features**

In `index.html`, change the browser warning to a dismissible banner instead of a full-page overlay:

```html
<!-- Replace the existing #browser-warning div with: -->
<div id="browser-warning" style="display:none;background:#7c2d12;padding:8px 16px;text-align:center;font-size:13px">
  Chrome or Edge required for MIDI support. Non-MIDI features (song builder, chord analysis by click) still work.
  <button onclick="this.parentElement.style.display='none'" style="margin-left:12px;background:transparent;border:1px solid #fff;color:#fff;border-radius:3px;padding:2px 8px;cursor:pointer">×</button>
</div>
```

Update `init()` in app.ts:

```ts
  // Replace full-page overlay logic with:
  if (!navigator.requestMIDIAccess) {
    $('browser-warning').style.display = 'block'
  }
```

- [ ] **Step 10: Fix Zone 2→Zone 3 cursor insertion in app.ts**

Replace `sendToSong` with cursor-aware version:

```ts
function sendToSong(entry: HistoryEntry) {
  if (!state.song.sections.length) {
    state.song = addSection(state.song, 'Verse', 'verse')
  }

  if (state.activeCursorId) {
    // Insert after active cursor slot
    state.song = insertChordAfter(state.song, state.activeCursorId, entry.symbol)
    // Advance cursor: find the new chord (last inserted after activeCursorId)
    const newChord = findChordAfter(state.song, state.activeCursorId)
    state.activeCursorId = newChord?.id ?? state.activeCursorId
  } else {
    // Append to end of last measure of last section
    const lastSection = state.song.sections[state.song.sections.length - 1]
    const lastMeasure = lastSection.measures[lastSection.measures.length - 1]
    state.song = songAddChord(state.song, lastSection.id, lastMeasure.id, entry.symbol)
  }

  saveSong(state.song)
  renderZone3()
}

function findChordAfter(song: Song, afterId: string): SongChord | null {
  for (const section of song.sections) {
    for (const measure of section.measures) {
      const idx = measure.chords.findIndex(c => c.id === afterId)
      if (idx !== -1 && idx + 1 < measure.chords.length) {
        return measure.chords[idx + 1]
      }
    }
  }
  return null
}
```

Add `insertChordAfter` to the import from song.ts.

- [ ] **Step 11: Implement MIDI capture-to-fill flow in app.ts**

Add `captureTargetId` to app state (already in types from Step 1). Wire the capture flow:

```ts
// In onNoteChange(), at the top, add:
  if (state.captureTargetId && notes.length >= 1) {
    const result = analyzeNotes(notes, state.activeKey, getLastHistorySymbol())
    if (result?.kind === 'chord') {
      const sym = result.candidates[0]
      state.song = updateChord(state.song, state.captureTargetId, sym)
      saveSong(state.song)
      // Advance cursor to next slot
      const next = findChordAfter(state.song, state.captureTargetId)
      state.activeCursorId = next?.id ?? null
      state.captureTargetId = null
      renderZone3()
      return  // don't process as normal detection
    }
  }
```

In `mountSong` call in app.ts, update `onChordCapture`:

```ts
  onChordCapture: (id) => {
    state.captureTargetId = id
    state.activeCursorId = id
    renderZone3()  // re-render so slot shows pulsing outline
  },
```

Add pulsing CSS to `index.html`:

```css
@keyframes pulse-border {
  0%, 100% { border-color: #4f46e5; }
  50% { border-color: #a5b4fc; }
}
.capture-target { animation: pulse-border 0.8s infinite; }
```

In `buildChordChip` in song.ts, add capture target class when active:

```ts
  // Add to isActive check at top of buildChordChip:
  const isCapture = (h as any).captureTargetId === chord.id
  if (isCapture) wrap.classList.add('capture-target')
```

Update `SongEventHandlers` type to include `captureTargetId`:

```ts
type SongEventHandlers = {
  onChordClick: (chordId: string, symbol: string) => void
  onChordCapture: (chordId: string) => void
  activeCursorId: string | null
  captureTargetId: string | null   // add this
  activeKey: string | null
  onSongChange: (song: Song) => void
}
```

- [ ] **Step 12: Fix quality color badge and pitch classes in renderZone1Analysis in app.ts**

Replace the chord name display section:

```ts
  // Replace the chord name line in renderZone1Analysis:
  const CHORD_QUALITY_COLORS: Record<string, string> = {
    major: '#f59e0b', minor: '#3b82f6', 'dominant seventh': '#ef4444',
    'major seventh': '#f59e0b', 'minor seventh': '#3b82f6',
    diminished: '#7c3aed', 'diminished seventh': '#7c3aed',
    'half-diminished seventh': '#7c3aed', augmented: '#0d9488',
    sus: '#6b7280',
  }
  let chordQuality = 'major'
  try { chordQuality = UMT.parseChordSymbol(chordName).quality?.toLowerCase() ?? 'major' } catch {}
  const badgeColor = CHORD_QUALITY_COLORS[chordQuality] ?? '#6b7280'

  // Active notes as pitch classes (strip octave):
  const pitchClasses = d.notes.map(n => n.replace(/(-?\d+)$/, ''))

  let html = `
    <div style="grid-column:1/-1;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap">
      <span style="font-size:22px;font-weight:700;padding:2px 8px;border-radius:4px;background:${badgeColor}22;border-left:3px solid ${badgeColor}">${chordName}</span>
      ${d.candidates.slice(1, 5).map((c, i) =>
        `<span class="alt-chord" data-idx="${i+1}" style="font-size:12px;color:#9ca3af;cursor:pointer;text-decoration:underline">${c}</span>`
      ).join('')}
    </div>
    <div><label>Notes</label><span>${pitchClasses.join(' · ')}</span></div>
  `
```

Also add substitutions to the analysis HTML:

```ts
  // After the cadence line in the html += block, add:
  ${a.substitutions?.length ? `<div style="grid-column:1/-1"><label>Substitutions</label><span>${a.substitutions.join(' · ')}</span></div>` : ''}
```

- [ ] **Step 13: Run full test suite and manual smoke test**

```bash
npm test
```

Expected: all tests pass.

Manual additions to smoke test checklist:
- [ ] Play major chord → amber badge border on chord name
- [ ] Play minor chord → blue badge border
- [ ] Substitutions row appears when key is set
- [ ] Guitar diagram shows "Next voicing ›" button; clicking cycles voicings
- [ ] ⊕ button on chord slot → slot pulses; play a chord → slot fills
- [ ] → song inserts after active cursor, not at end
- [ ] Section colour swatch clickable → colour changes
- [ ] Section ×1 badge visible; click → can set repeat count
- [ ] 🔍 Form button → shows form pattern
- [ ] Firefox: banner shown but song structure still usable

- [ ] **Step 14: Commit**

```bash
git add src/types.ts src/analyzer.ts src/diagrams.ts src/history.ts src/song.ts src/app.ts index.html
git commit -m "feat: fix 12 spec gaps — substitutions, capture flow, voicing button, badges, colour picker, form analysis"
```

---

## Self-review vs. Spec

| Spec requirement | Task |
|---|---|
| Browser compat warning (Chrome/Edge) | Task 10 — `init()` |
| CDN URLs exact + failure handler | Task 1 — index.html |
| MIDI permission denial banner | Task 3 + Task 10 |
| note-on vel=0 as note-off | Task 3 |
| PITCH_NAMES_FLAT policy | Task 3 |
| Device selector + reconnect | Task 3 + Task 10 |
| Normal / Hold / Arpeggio modes (mutually exclusive) | Task 3 |
| 1 note / 2 notes / ≥3 notes routing | Task 4 |
| Chord detection + ranked candidates | Task 4 |
| Roman numeral from analyzeProgression | Task 4 |
| Figured bass from FiguredBass.fromChord | Task 4 |
| Scales, cadence, Coltrane axis, negative harmony | Task 4 |
| Substitutions (UMT.getSubstitutions) | Task 4 + Task 11 (step 2) |
| Quality color badge on chord name | Task 11 (step 12) |
| Active notes as pitch classes (no octave) | Task 11 (step 12) |
| Staff / Piano / Guitar / Circle of fifths | Task 6 |
| Piano clickable keys + data-note fallback | Task 6 |
| Piano range extension for out-of-range notes | Task 11 (step 6) |
| Guitar voicing DB + normalize | Task 6 |
| Next voicing button | Task 11 (step 7) |
| Circle of fifths custom SVG + click-to-set-key | Task 6 |
| WebAudioFont init + AudioContext resume | Task 5 |
| playNote / playChord | Task 5 |
| HistoryEntry type | Task 2 |
| Auto-append 0.8s debounce | Task 7 |
| Max 200 entries | Task 7 |
| Romans recomputed on key change | Task 7 |
| Capture button in Zone 2 | Task 11 (step 8) |
| → song button + active chip | Task 7 + 10 |
| Zone 2→3 cursor insertion (after active slot) | Task 11 (step 10) |
| Song data model with IDs + schemaVersion | Task 2 + 8 |
| addSection / addChord / removeChord etc. | Task 8 |
| computeMeasureNumbers (not stored) | Task 8 |
| Degree display: in-key / borrowed / invalid | Task 8 + 9 |
| Global key reference shared zone1↔zone3 | Task 10 |
| Section templates with color | Task 9 |
| Section colour picker (click swatch) | Task 11 (step 4) |
| Collapse / repeat count (always settable) / duplicate | Task 9 + Task 11 (step 4) |
| Transpose with enharmonic policy | Task 8 |
| Formal analysis button + pattern matcher | Task 11 (step 5) |
| Paste with measure allocation + >8 notice | Task 9 |
| Export / print | Task 9 |
| Edit inline + Escape cancel | Task 9 |
| Capture from MIDI + cursor + pulsing outline | Task 11 (step 11) |
| Browser warning non-blocking (non-MIDI features work) | Task 11 (step 9) |
| Keyboard shortcuts (disabled in inputs) | Task 10 |
| New song button | Task 9 |
| localStorage persistence + schemaVersion guard | Task 8 |
