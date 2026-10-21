// The user's preferences that change how Modus reads and plays, beyond what each panel's
// own buttons keep: one table, so the Settings dialog draws them and the code reads them
// by name. Each lives in localStorage as `pref-<name>`; a value out of range or unknown
// falls back to its default. A change is applied at once through `onPrefChange`.

import { loadJSON, save } from '../ui/storage'

type Choice = { kind: 'choice'; options: readonly string[]; default: string }
type Bool = { kind: 'bool'; default: boolean }
type Num = { kind: 'number'; min: number; max: number; step: number; default: number; unit: string }
type Multi = { kind: 'set'; options: readonly string[]; default: readonly string[] }
export type PrefDef = Choice | Bool | Num | Multi

const choice = (options: readonly string[], d: string): Choice => ({ kind: 'choice', options, default: d })
const num = (min: number, max: number, step: number, d: number, unit = ''): Num => ({ kind: 'number', min, max, step, default: d, unit })

export const EAR_CHORD_TYPES = ['', 'm', 'dim', 'aug', 'sus4', '7', 'maj7', 'm7', 'm7b5', 'dim7'] as const
export const EAR_CADENCE_TYPES = ['authentic', 'plagal', 'deceptive', 'half'] as const

export const PREFS = {
  // Theory
  'chord-style':     choice(['standard', 'symbols', 'short'], 'standard'),        // Cmaj7 / CΔ7 / CM7
  'key-profile':     choice(['krumhansl', 'temperley', 'aarden', 'bellman', 'simple'], 'krumhansl'),
  'voice-rules':     choice(['strict', 'contemporary', 'species'], 'strict'),
  'movable-do':      { kind: 'bool', default: false } as Bool,
  'auto-modes':      { kind: 'bool', default: true } as Bool,     // Auto reads church modes too (UMT 0.10)
  // Detector and history
  'history-hold-ms': num(300, 2000, 100, 800, 'ms'),
  'history-max':     num(20, 1000, 10, 200),
  'history-bpm':     num(0, 240, 1, 0, 'bpm'),   // 0: no tempo, the harmonic rhythm in seconds
  'history-beats':   num(2, 12, 1, 4),
  'arpeggio-ms':     num(500, 3000, 100, 1200, 'ms'),
  'melody-gap-s':    num(2, 15, 1, 6, 's'),
  'capture-ms':      num(100, 800, 50, 250, 'ms'),
  // Sound
  'preview-s':       num(0.5, 4, 0.5, 2, 's'),
  'piano-velocity':  num(20, 127, 1, 90),
  // Practice
  'progression-bpm': num(60, 160, 5, 100, 'bpm'),
  'ear-interval-play': choice(['up', 'down', 'harmonic'], 'up'),
  'ear-chords':      { kind: 'set', options: EAR_CHORD_TYPES, default: EAR_CHORD_TYPES } as Multi,
  'ear-cadences':    { kind: 'set', options: EAR_CADENCE_TYPES, default: EAR_CADENCE_TYPES } as Multi,
  // Microphone and tuner
  'a4-hz':           num(415, 466, 1, 440, 'Hz'),
  'mic-sensitivity': choice(['low', 'normal', 'high'], 'normal'),
  'mic-response':    choice(['fast', 'normal', 'steady'], 'normal'),
  // Interface
  'ui-zoom':         num(80, 150, 10, 100, '%'),
} satisfies Record<string, PrefDef>

export type PrefName = keyof typeof PREFS
type ValueOf<D> = D extends Num ? number : D extends Bool ? boolean : D extends Multi ? string[] : string
export type PrefValue<N extends PrefName> = ValueOf<(typeof PREFS)[N]>

const storageKey = (name: PrefName) => `pref-${name}`

function valid(def: PrefDef, v: unknown): boolean {
  switch (def.kind) {
    case 'choice': return typeof v === 'string' && def.options.includes(v)
    case 'bool': return typeof v === 'boolean'
    case 'number': return typeof v === 'number' && Number.isFinite(v) && v >= def.min && v <= def.max
    case 'set': return Array.isArray(v) && v.every(x => def.options.includes(x))
  }
}

const cache = new Map<PrefName, unknown>()

export function getPref<N extends PrefName>(name: N): PrefValue<N> {
  if (cache.has(name)) return cache.get(name) as PrefValue<N>
  const def = PREFS[name] as PrefDef
  const stored = loadJSON<unknown>(storageKey(name), undefined)
  const v = valid(def, stored) ? stored : Array.isArray(def.default) ? [...def.default] : def.default
  cache.set(name, v)
  return v as PrefValue<N>
}

const listeners = new Set<(name: PrefName) => void>()
export function onPrefChange(cb: (name: PrefName) => void) { listeners.add(cb) }

export function setPref<N extends PrefName>(name: N, value: PrefValue<N>) {
  if (!valid(PREFS[name] as PrefDef, value)) return
  cache.set(name, value)
  save(storageKey(name), value as string | number | boolean | object)
  listeners.forEach(f => f(name))
}

export function isDefault(name: PrefName): boolean {
  const def = PREFS[name] as PrefDef
  return JSON.stringify(getPref(name)) === JSON.stringify(def.default)
}

export function resetPref(name: PrefName) {
  const def = PREFS[name] as PrefDef
  setPref(name, (Array.isArray(def.default) ? [...def.default] : def.default) as PrefValue<typeof name>)
}

/** For tests: forget what was read, so storage is read again. */
export function clearPrefCache() { cache.clear() }
