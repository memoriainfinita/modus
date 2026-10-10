// The computer keyboard as a piano, laid out like Ableton Live's and Logic's: the home row
// is the white keys from C, the row above the black ones; Z / X octave, C / V velocity,
// Tab sustain. Keys are read by physical position (event.code), so the layout works on
// any keyboard language (the Spanish Ñ is the E above). M toggles it.

import { keyDown, keyUp, setPedal } from './midi'

// Semitones above the C of the current octave, by physical key
const NOTE_OFFSET: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15,
  Semicolon: 16, Quote: 17,
}

const MIN_C = 24, MAX_C = 96          // C1 … C7
const VELOCITY_STEP = 20

let enabled = false
let baseC = 60                        // C4
let velocity = 100
const sounding = new Map<string, number>()   // physical key → MIDI note it started
let onChange: () => void = () => {}

export function isComputerKeyboardOn(): boolean { return enabled }

/** Octave and velocity, for the toolbar: "C4 · v100". */
export function computerKeyboardStatus(): string {
  return `C${baseC / 12 - 1} · v${velocity}`
}

export function setComputerKeyboardChange(cb: () => void) { onChange = cb }

function releaseAll() {
  for (const note of sounding.values()) keyUp(note)
  sounding.clear()
  setPedal(false)
}

export function toggleComputerKeyboard(on = !enabled) {
  if (on === enabled) return
  enabled = on
  if (!on) releaseAll()
  onChange()
}

function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
    || (t instanceof HTMLElement && t.isContentEditable)
}

/**
 * Listens in the capture phase: while on, the keys it uses never reach the shortcuts
 * (H, A, S, C would otherwise toggle modes or clear history).
 */
export function wireComputerKeyboard() {
  document.addEventListener('keydown', e => {
    if (!enabled || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
    const offset = NOTE_OFFSET[e.code]
    const consume = () => { e.preventDefault(); e.stopImmediatePropagation() }
    if (offset !== undefined) {
      consume()
      if (e.repeat || sounding.has(e.code)) return
      const note = baseC + offset
      sounding.set(e.code, note)
      keyDown(note, velocity)
      return
    }
    switch (e.code) {
      case 'KeyZ': consume(); baseC = Math.max(MIN_C, baseC - 12); onChange(); break
      case 'KeyX': consume(); baseC = Math.min(MAX_C, baseC + 12); onChange(); break
      case 'KeyC': consume(); velocity = Math.max(1, velocity - VELOCITY_STEP); onChange(); break
      case 'KeyV': consume(); velocity = Math.min(127, velocity + VELOCITY_STEP); onChange(); break
      case 'Tab': consume(); if (!e.repeat) setPedal(true); break
      case 'KeyM': case 'Escape': consume(); toggleComputerKeyboard(false); break
    }
  }, true)

  document.addEventListener('keyup', e => {
    if (!enabled) return
    const note = sounding.get(e.code)
    if (note !== undefined) { sounding.delete(e.code); keyUp(note); e.stopImmediatePropagation(); return }
    if (e.code === 'Tab') setPedal(false)
  }, true)

  // A key released while the window has no focus never sends keyup: let nothing hang.
  window.addEventListener('blur', () => { if (enabled) releaseAll() })
}
