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
let physicallyHeldNotes = new Set<number>()  // tracks keys currently depressed in hold mode
let arpeggioNotes: number[] = []
let arpeggioTimer: ReturnType<typeof setTimeout> | null = null

type NoteChangeCallback = (notes: number[]) => void
type NoteOnCallback = (note: number) => void

let onNoteChange: NoteChangeCallback = () => {}
let onNoteOn: NoteOnCallback = () => {}

export function setNoteChangeCallback(cb: NoteChangeCallback) { onNoteChange = cb }
export function setNoteOnCallback(cb: NoteOnCallback) { onNoteOn = cb }

// ─── Permission + init ───────────────────────────────────────────────────────

export async function initMidi(): Promise<{ ok: boolean; denied: boolean; unsupported: boolean }> {
  if (!navigator.requestMIDIAccess) {
    return { ok: false, denied: false, unsupported: true }
  }
  try {
    midiAccess = await navigator.requestMIDIAccess()
    midiAccess.onstatechange = () => refreshDeviceList()
    const savedMode = localStorage.getItem('midi-mode') as MidiMode | null
    if (savedMode && ['normal', 'hold', 'arpeggio'].includes(savedMode)) mode = savedMode
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

function sortedNotes(s: Set<number>): number[] {
  return Array.from(s).sort((a, b) => a - b)
}

function handleNoteOn(note: number) {
  onNoteOn(note)
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
  activeNotes.clear()
  physicallyHeldNotes.clear()
  arpeggioNotes = []
  if (arpeggioTimer) { clearTimeout(arpeggioTimer); arpeggioTimer = null }
  localStorage.setItem('midi-mode', m)
}

export function getMode(): MidiMode { return mode }
