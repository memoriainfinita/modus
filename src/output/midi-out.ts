// MIDI output: what sounds in Modus goes to an external synth or DAW. Previews (chips,
// circle, key panel, arrows, Space) and the computer keyboard and on-screen piano always;
// the controller's own notes only with Thru, since a DAW usually hears the controller
// itself. Every note sent on is tracked, so a change of port or channel, or leaving the
// page, never leaves a note hanging.

import { getMidiAccess, getSelectedInputName } from '../input/midi'
import type { NoteSource } from '../input/midi'
import { loadBool, loadJSON, loadNumber, save } from '../ui/storage'

type Port = { id: string; name: string }

const PREVIEW_VELOCITY = 90

let preferred: Partial<Port> = loadJSON<Partial<Port> | null>('midi-out', null) ?? {}
let channel = loadNumber('midi-out-channel', 1, 1, 16)   // 1–16 as shown; 0–15 on the wire
let thru = loadBool('midi-out-thru', false)

const sounding = new Set<number>()       // notes on at the receiver, live or preview
let previewNotes: number[] = []
let previewTimer: ReturnType<typeof setTimeout> | null = null
let pedalDown = false

export function getOutputs(): Port[] {
  const access = getMidiAccess()
  if (!access) return []
  return Array.from(access.outputs.values())
    .filter(o => o.state !== 'disconnected')
    .map(o => ({ id: o.id, name: o.name ?? o.id }))
}

/** The chosen port, found by name (Chrome numbers ports by position); null when off or absent. */
function currentOutput(): MIDIOutput | null {
  const access = getMidiAccess()
  if (!access || !preferred.name) return null
  const outs = Array.from(access.outputs.values()).filter(o => o.state !== 'disconnected' && o.name === preferred.name)
  return outs.find(o => o.id === preferred.id) ?? outs[0] ?? null
}

/**
 * The output is the port the controller is read from: what Modus sends would come back as
 * input, and be sent again. Nothing is sent then.
 */
export function outputLoops(): boolean {
  const input = getSelectedInputName()
  return !!preferred.name && !!input && preferred.name === input
}

function send(bytes: number[]) {
  if (outputLoops()) return
  try { currentOutput()?.send(bytes) } catch { /* port closed meanwhile */ }
}

const status = (kind: number) => kind | (channel - 1)

function noteOn(note: number, velocity: number) {
  send([status(0x90), note, Math.max(1, Math.min(127, velocity))])
  sounding.add(note)
}

function noteOff(note: number) {
  send([status(0x80), note, 0])
  sounding.delete(note)
}

/** Releases everything sent: pedal up, each note off, then All Notes Off for receivers that missed one. */
export function allNotesOff() {
  if (previewTimer) { clearTimeout(previewTimer); previewTimer = null }
  previewNotes = []
  if (pedalDown) { send([status(0xB0), 64, 0]); pedalDown = false }
  for (const n of [...sounding]) noteOff(n)
  send([status(0xB0), 123, 0])
}

// ─── What the inputs and previews call ───────────────────────────────────────

export function outLiveOn(note: number, velocity: number, source: NoteSource) {
  if (source === 'controller' && !thru) return
  if (previewNotes.includes(note)) previewNotes = previewNotes.filter(n => n !== note)   // the key takes the note over
  noteOn(note, velocity)
}

export function outLiveOff(note: number, source: NoteSource) {
  if (source === 'controller' && !thru) return
  if (sounding.has(note)) noteOff(note)
}

export function outSustain(down: boolean, source: NoteSource) {
  if (source === 'controller' && !thru) return
  pedalDown = down
  send([status(0xB0), 64, down ? 127 : 0])
}

/**
 * A preview: `cut` stops the previous preview first (chips, circle, arrows), as the
 * internal sound does; a clicked piano key does not cut. Notes end after `seconds`.
 */
export function outPreview(notes: number[], seconds: number, cut: boolean) {
  if (!notes.length) return
  if (cut) {
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = null }
    for (const n of previewNotes) if (sounding.has(n)) noteOff(n)
    previewNotes = []
  }
  // A note already on (held key, earlier preview) is retriggered
  for (const n of notes) { if (sounding.has(n)) noteOff(n); noteOn(n, PREVIEW_VELOCITY) }
  const these = notes
  previewNotes = [...new Set([...previewNotes, ...notes])]
  const end = () => {
    for (const n of these) if (previewNotes.includes(n) && sounding.has(n)) noteOff(n)
    previewNotes = previewNotes.filter(n => !these.includes(n))
  }
  if (cut) previewTimer = setTimeout(() => { previewTimer = null; end() }, seconds * 1000)
  else setTimeout(end, seconds * 1000)
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getOutputSettings() {
  return { port: preferred.name ? { id: preferred.id ?? '', name: preferred.name } : null, channel, thru }
}

/** Picks the port by id (null = off). What sounds on the old port is released first. */
export function chooseOutput(id: string | null) {
  allNotesOff()
  const port = id ? getOutputs().find(o => o.id === id) ?? null : null
  preferred = port ?? {}
  save('midi-out', port)
}

export function setOutputChannel(ch: number) {
  allNotesOff()
  channel = Math.min(16, Math.max(1, Math.round(ch)))
  save('midi-out-channel', channel)
}

export function setThru(on: boolean) {
  if (!on) allNotesOff()
  thru = on
  save('midi-out-thru', thru)
}

/** For tests: forget the state between cases. */
export function resetMidiOut() {
  sounding.clear(); previewNotes = []; pedalDown = false
  if (previewTimer) { clearTimeout(previewTimer); previewTimer = null }
  preferred = {}; channel = 1; thru = false
}

// Leaving the page must not leave the synth droning
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => allNotesOff())
