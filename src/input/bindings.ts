// Keyboard shortcuts the user can change: each action has up to two keys, its factory ones
// until changed (stored under `shortcuts`). Esc and 1–9 stay fixed: Esc cancels a key being
// set and closes everything, 1–9 pick a reading of the chord.

import { loadJSON, save } from '../ui/storage'

export const ACTIONS = [
  'play', 'stepPrev', 'stepNext', 'delete', 'hold', 'arpeggio', 'send', 'clear',
  'keyboard', 'present', 'type', 'help', 'settings',
] as const
export type Action = typeof ACTIONS[number]

export const DEFAULT_KEYS: Record<Action, string[]> = {
  play: ['Space'], stepPrev: ['ArrowLeft'], stepNext: ['ArrowRight'], delete: ['Delete', 'Backspace'],
  hold: ['H'], arpeggio: ['A'], send: ['S'], clear: ['C'], keyboard: ['M'], present: ['P'],
  type: ['/'], help: ['?'], settings: [','],
}

/** Keys no action can take. */
export const RESERVED = new Set(['Escape', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Tab', 'Enter', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

export const MAX_KEYS = 2

/** A key press by the name bindings use: letters upper case, the space bar "Space". */
export function keyName(e: Pick<KeyboardEvent, 'key'>): string {
  if (e.key === ' ') return 'Space'
  return e.key.length === 1 ? e.key.toUpperCase() : e.key
}

let custom: Partial<Record<Action, string[]>> = loadCustom()

function loadCustom(): Partial<Record<Action, string[]>> {
  const raw = loadJSON<Record<string, unknown>>('shortcuts', {})
  const out: Partial<Record<Action, string[]>> = {}
  for (const a of ACTIONS) {
    const v = raw?.[a]
    if (Array.isArray(v) && v.length <= MAX_KEYS && v.every(k => typeof k === 'string' && !RESERVED.has(k))) out[a] = v as string[]
  }
  return out
}

export function keysOf(action: Action): string[] { return custom[action] ?? DEFAULT_KEYS[action] }
export function isDefaultBinding(action: Action): boolean { return !custom[action] }

/** The action a key press runs, if any. */
export function actionFor(key: string): Action | null {
  return ACTIONS.find(a => keysOf(a).includes(key)) ?? null
}

/** The action that already has `key`, other than `except`. */
export function conflictFor(key: string, except: Action): Action | null {
  return ACTIONS.find(a => a !== except && keysOf(a).includes(key)) ?? null
}

function store() { save('shortcuts', custom) }

export function setKeys(action: Action, keys: string[]) {
  const clean = [...new Set(keys)].filter(k => !RESERVED.has(k)).slice(0, MAX_KEYS)
  if (JSON.stringify(clean) === JSON.stringify(DEFAULT_KEYS[action])) delete custom[action]
  else custom[action] = clean
  store()
}

/** Gives `key` to `action`: in place of its key at `slot`, or added; taken from whoever had it. */
export function assignKey(action: Action, key: string, slot: number) {
  const other = conflictFor(key, action)
  if (other) setKeys(other, keysOf(other).filter(k => k !== key))
  const keys = [...keysOf(action)]
  if (slot < keys.length) keys[slot] = key
  else keys.push(key)
  setKeys(action, keys)
}

export function removeKey(action: Action, key: string) { setKeys(action, keysOf(action).filter(k => k !== key)) }
export function resetKeys(action: Action) { delete custom[action]; store() }
export function resetAllKeys() { custom = {}; store() }

/** For tests: read storage again. */
export function reloadBindings() { custom = loadCustom() }
