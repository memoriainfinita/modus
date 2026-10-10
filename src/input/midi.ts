import type { MidiMode } from '../types'

export function isNoteOff(status: number, velocity: number): boolean {
  return (status & 0xF0) === 0x80 || ((status & 0xF0) === 0x90 && velocity === 0)
}

// ─── State ───────────────────────────────────────────────────────────────────

let midiAccess: MIDIAccess | null = null
let selectedDeviceId: string | null = null
let mode: MidiMode = 'normal'
let activeNotes = new Set<number>()
let physicallyHeldNotes = new Set<number>()  // tracks keys currently depressed in hold mode
let arpeggioNotes: number[] = []
let arpeggioTimer: ReturnType<typeof setTimeout> | null = null

type NoteChangeCallback = (notes: number[]) => void

/** What the controller does to the sound, independent of what the mode keeps on screen. */
export type SoundCallbacks = {
  noteOn: (note: number, velocity: number) => void
  noteOff: (note: number) => void
  sustain: (down: boolean) => void
}

let onNoteChange: NoteChangeCallback = () => {}
let sound: SoundCallbacks = { noteOn: () => {}, noteOff: () => {}, sustain: () => {} }

export function setNoteChangeCallback(cb: NoteChangeCallback) { onNoteChange = cb }
export function setSoundCallbacks(cb: SoundCallbacks) { sound = cb }

export const SUSTAIN_CC = 64

/** Sustain pedal: CC 64, down at value ≥ 64 (MIDI convention). */
export function isSustain(status: number, controller: number): boolean {
  return (status & 0xF0) === 0xB0 && controller === SUSTAIN_CC
}

// ─── Permission + init ───────────────────────────────────────────────────────

export async function initMidi(): Promise<{ ok: boolean; denied: boolean; unsupported: boolean }> {
  if (!navigator.requestMIDIAccess) {
    return { ok: false, denied: false, unsupported: true }
  }
  try {
    useAccess(await navigator.requestMIDIAccess())
    const savedMode = localStorage.getItem('midi-mode') as MidiMode | null
    if (savedMode && ['normal', 'hold', 'arpeggio'].includes(savedMode)) mode = savedMode
    resolveDevice()
    startRescan()
    return { ok: true, denied: false, unsupported: false }
  } catch {
    return { ok: false, denied: true, unsupported: false }
  }
}

function useAccess(access: MIDIAccess) {
  if (midiAccess) {
    midiAccess.onstatechange = null
    for (const input of midiAccess.inputs.values()) input.onmidimessage = null
  }
  midiAccess = access
  midiAccess.onstatechange = () => refreshDeviceList()
}

type Device = { id: string; name: string }

// A browser may keep an unplugged port in `inputs` with state 'disconnected'; it is not a device.
function devicesOf(access: MIDIAccess | null): Device[] {
  if (!access) return []
  return Array.from(access.inputs.values())
    .filter(i => i.state !== 'disconnected')
    .map(i => ({ id: i.id, name: i.name ?? i.id }))
}

export function getDevices(): Device[] { return devicesOf(midiAccess) }

// The device the user picked. A fallback chosen because it went missing does not replace
// it, so the controller is used again as soon as it comes back.
const PREFERRED_KEY = 'midi-device'

// The older 'midi-device-id' key is not read: it stored every switch, fallbacks included.
function loadPreferred(): Partial<Device> {
  try {
    const raw = localStorage.getItem(PREFERRED_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function savePreferred(device: Device) {
  try { localStorage.setItem(PREFERRED_KEY, JSON.stringify(device)) } catch { }
}

/** The user picks a device: it becomes the preferred one. */
export function chooseDevice(id: string) {
  const device = getDevices().find(d => d.id === id)
  if (!device) return
  savePreferred(device)
  attachToDevice(id)
}

/**
 * Picks the device to listen to: the preferred one if present, else the current one, else
 * the first. The preferred one is found by name: Chrome numbers ports by position
 * ("input-0"), so a port that appears ahead of it takes its id. The id only breaks a tie
 * between ports with the same name.
 * With no devices the last selection is kept, so the caller can report it disconnected.
 */
export function resolveDevice(): string | null {
  const devices = getDevices()
  const preferred = loadPreferred()
  const sameName = devices.filter(d => d.name === preferred.name)
  const target = sameName.find(d => d.id === preferred.id) ?? sameName[0]
    ?? devices.find(d => d.id === selectedDeviceId)
    ?? devices[0]
  if (!target) return null
  // Until the user picks one, the first device used is the one to come back to
  if (!preferred.id && !preferred.name) savePreferred(target)
  attachToDevice(target.id)
  return target.id
}

function attachToDevice(id: string) {
  selectedDeviceId = id
  if (!midiAccess) return
  for (const input of midiAccess.inputs.values()) {
    input.onmidimessage = input.id === id ? handleMidiMessage : null
  }
}

// Firefox does not report hot-plug (no statechange; its `inputs` never change), but a new
// requestMIDIAccess returns the current ports. While the page is visible, ask again every
// RESCAN_MS and on focus; switch only when the device list changed.
const RESCAN_MS = 2000
let rescanning = false

function startRescan() {
  setInterval(() => { if (document.visibilityState === 'visible') void rescan() }, RESCAN_MS)
  window.addEventListener('focus', () => void rescan())
}

const signature = (devices: Device[]) => devices.map(d => d.name).sort().join('\n')

async function rescan() {
  if (rescanning || !midiAccess) return
  rescanning = true
  try {
    const fresh = await navigator.requestMIDIAccess()
    if (signature(devicesOf(fresh)) === signature(getDevices())) return
    useAccess(fresh)
    refreshDeviceList()
  } catch { /* access withdrawn: keep what we have */ } finally {
    rescanning = false
  }
}

function refreshDeviceList() {
  window.dispatchEvent(new CustomEvent('midi-devices-changed'))
  if (selectedDeviceId && !getDevices().find(d => d.id === selectedDeviceId)) {
    window.dispatchEvent(new CustomEvent('midi-device-disconnected'))
  }
}

// ─── Message handling ────────────────────────────────────────────────────────

function handleMidiMessage(e: MIDIMessageEvent) {
  if (!e.data || e.data.length < 3) return
  const [status, note, velocity] = e.data

  if (isNoteOff(status, velocity)) keyUp(note)
  else if ((status & 0xF0) === 0x90) keyDown(note, velocity)
  else if (isSustain(status, note)) sound.sustain(velocity >= 64)
}

// ─── Other inputs ────────────────────────────────────────────────────────────
// The computer keyboard plays like a controller; the on-screen piano too, except in Hold,
// where a click adds the note to the chord and a second click takes it out (a mouse can
// press one key at a time, so it builds the chord note by note).

/** A key pressed on any input: sound and the current mode. */
export function keyDown(note: number, velocity: number) {
  sound.noteOn(note, velocity)
  handleNoteOn(note)
}

/** A key released on any input. */
export function keyUp(note: number) {
  sound.noteOff(note)
  handleNoteOff(note)
}

/** Sustain pedal from any input. */
export function setPedal(down: boolean) { sound.sustain(down) }

/** On-screen piano press. */
export function pointerDown(note: number, velocity: number) {
  if (mode !== 'hold') { keyDown(note, velocity); return }
  if (activeNotes.delete(note)) { onNoteChange(sortedNotes(activeNotes)); return }
  sound.noteOn(note, velocity)
  activeNotes.add(note)
  onNoteChange(sortedNotes(activeNotes))
}

/** On-screen piano release: the sound stops; in Hold the note stays in the chord. */
export function pointerUp(note: number) {
  if (mode !== 'hold') { keyUp(note); return }
  sound.noteOff(note)
}

/** Esc: drops the notes a mode is keeping (Hold chord, pending arpeggio). */
export function releaseKeptNotes() {
  if (mode === 'normal') return
  const had = activeNotes.size > 0 || arpeggioNotes.length > 0
  activeNotes.clear()
  physicallyHeldNotes.clear()
  arpeggioNotes = []
  if (arpeggioTimer) { clearTimeout(arpeggioTimer); arpeggioTimer = null }
  if (had) onNoteChange([])
}

function sortedNotes(s: Set<number>): number[] {
  return Array.from(s).sort((a, b) => a - b)
}

function handleNoteOn(note: number) {
  if (mode === 'normal') {
    activeNotes.add(note)
    onNoteChange(sortedNotes(activeNotes))
  } else if (mode === 'hold') {
    // Clear display only when starting a new phrase (no keys physically held)
    if (physicallyHeldNotes.size === 0) activeNotes.clear()
    physicallyHeldNotes.add(note)
    activeNotes.add(note)
    onNoteChange(sortedNotes(activeNotes))
  } else if (mode === 'arpeggio') {
    if (arpeggioTimer) clearTimeout(arpeggioTimer)
    arpeggioNotes.push(note)
    onNoteChange([...new Set(arpeggioNotes)].sort((a, b) => a - b))
    arpeggioTimer = setTimeout(() => {
      arpeggioNotes = []
      arpeggioTimer = null
      onNoteChange([])
    }, 1200)
  }
}

function handleNoteOff(note: number) {
  if (mode === 'normal') {
    activeNotes.delete(note)
    onNoteChange(sortedNotes(activeNotes))
  } else if (mode === 'hold') {
    physicallyHeldNotes.delete(note)
    // activeNotes stays — chord held in display
  }
  // arpeggio: ignore note-off
}

export function setMode(m: MidiMode) {
  if (m === mode) return
  mode = m
  const hadNotes = activeNotes.size > 0 || arpeggioNotes.length > 0
  activeNotes.clear()
  physicallyHeldNotes.clear()
  arpeggioNotes = []
  if (arpeggioTimer) { clearTimeout(arpeggioTimer); arpeggioTimer = null }
  localStorage.setItem('midi-mode', m)
  // The notes were dropped: the detector must not keep showing the old chord.
  // A chord picked from history or song (no MIDI notes) stays.
  if (hadNotes) onNoteChange([])
}

export function getMode(): MidiMode { return mode }
