// Microphone input. Notes: the one note sung or played (YIN), once it holds for a few frames,
// goes to the detector as a key held, and is let go after a short silence. Chords: the last
// ~0.7 s of sound goes to the notes worker (Basic Pitch, audio-notes/) a few times a second,
// and the notes sounding at its end are the chord, held until the next reading or a silence.
// Nothing heard is sounded: the microphone would hear it again.

import { detectPitch, frequencyToNote, rms } from './pitch'
import { loadChoice, save } from '../ui/storage'
import { getPref } from '../settings/prefs'
import { transcribe, toModelRate, soundingAt } from '../audio-notes/notes'

export type MicMode = 'notes' | 'chords'
export const MIC_MODES: readonly MicMode[] = ['notes', 'chords']

/** What the tuner shows each frame: the note heard, how far from it, the frequency; null in silence. */
export interface Heard { midi: number; cents: number; freq: number; level: number }

export interface MicCallbacks {
  /** The notes the microphone holds now (MIDI), bass first; empty when it stops hearing. */
  notes: (midis: number[], velocity: number) => void
  /** Every frame: for the tuner. */
  frame: (heard: Heard | null) => void
  /** The microphone started, stopped or was refused. */
  state: (on: boolean, error?: string) => void
}

const FRAME_MS = 40
const RELEASE_FRAMES = 5   // and is let go after ~200 ms without it
// Below this level, silence; how many frames a note holds before it counts (2, 3, 5: ~80, 120, 200 ms)
const GATES = { low: 0.02, normal: 0.01, high: 0.004 }
const HOLDS = { fast: 2, normal: 3, steady: 5 }
// Chords: how often the sound is read, and how far before the window's end the notes are taken
// (the model reads a note's end a little early at the window's edge)
const CHORD_EVERY_MS = 300
const CHORD_READ_BEFORE_END_S = 0.1

let mode = loadChoice<MicMode>('mic-mode', MIC_MODES, 'notes')
export function getMicMode(): MicMode { return mode }
export function setMicMode(m: MicMode) { mode = m; save('mic-mode', m) }

let ctx: AudioContext | null = null
let stream: MediaStream | null = null
let timer: ReturnType<typeof setInterval> | null = null
let callbacks: MicCallbacks | null = null

export function isMicOn(): boolean { return !!timer }

let held: number[] = []
let candidate = ''
let candidateFrames = 0
let missFrames = 0
// Chords: a reading in progress, when the last one was asked for, and the level then
let reading = false
let lastReadAt = 0
let soundLevel = 0

function commit(notes: number[], level: number) {
  if (notes.join() === held.join()) return
  held = notes
  callbacks?.notes(notes, Math.max(1, Math.min(127, Math.round(level * 600))))
}

/** Chords: the window to the notes worker; the notes sounding at its end, two or more, are held. */
async function readChord(time: Float32Array, rate: number) {
  reading = true
  try {
    const audio = await toModelRate(time, rate)
    const notes = await transcribe(audio)
    const at = time.length / rate - CHORD_READ_BEFORE_END_S
    const midis = soundingAt(notes, at)
    // A silence while it was read has let the chord go: it stays gone
    if (timer && missFrames < RELEASE_FRAMES && midis.length >= 2) commit(midis, soundLevel)
  } catch { /* the model could not load or run: the chord stays as it was */ }
  reading = false
}

/** One frame: what is heard, and when it has held long enough, what the detector gets. */
function hear(analyser: AnalyserNode, time: Float32Array<ArrayBuffer>, rate: number) {
  analyser.getFloatTimeDomainData(time)
  // The newest 2048 samples (~43 ms) for the pitch: the whole window lags behind
  const recent = time.subarray(time.length - 2048)
  const level = rms(recent)
  const sounding = level >= GATES[getPref('mic-sensitivity') as keyof typeof GATES]
  let heard: Heard | null = null
  const p = sounding ? detectPitch(recent, rate) : null
  if (p) heard = { ...frequencyToNote(p.freq, getPref('a4-hz')), freq: p.freq, level }
  callbacks?.frame(heard)

  if (mode === 'chords') {
    if (!sounding) {
      if (++missFrames >= RELEASE_FRAMES) commit([], 0)
      return
    }
    missFrames = 0
    soundLevel = level
    const now = performance.now()
    if (!reading && now - lastReadAt >= CHORD_EVERY_MS) {
      lastReadAt = now
      readChord(time.slice(), rate)
    }
    return
  }

  const notes = heard ? [heard.midi] : []
  const key = notes.join()
  if (notes.length) {
    missFrames = 0
    if (key === candidate) candidateFrames++
    else { candidate = key; candidateFrames = 1 }
    if (candidateFrames >= HOLDS[getPref('mic-response') as keyof typeof HOLDS]) commit(notes, level)
  } else if (++missFrames >= RELEASE_FRAMES) {
    candidate = ''
    commit([], 0)
  }
}

export async function startMic(cb: MicCallbacks): Promise<void> {
  if (timer) return
  callbacks = cb
  // Outside a secure context (plain http on the network) the browser offers no microphone at all
  if (!navigator.mediaDevices?.getUserMedia) {
    cb.state(false, window.isSecureContext ? 'NotSupportedError' : 'InsecureContext')
    return
  }
  try {
    // The raw signal: echo cancelling, noise suppression and gain control bend a sung note
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
  } catch (e) {
    cb.state(false, (e as Error).name)
    return
  }
  ctx = new AudioContext()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  // The largest window the analyser keeps: ~0.7 s at 48 kHz, what a chord is read from
  analyser.fftSize = 32768
  source.connect(analyser)
  const time = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>
  const rate = ctx.sampleRate
  timer = setInterval(() => hear(analyser, time, rate), FRAME_MS)
  cb.state(true)
}

export function stopMic() {
  if (timer) clearInterval(timer)
  timer = null
  stream?.getTracks().forEach(t => t.stop())
  stream = null
  ctx?.close().catch(() => {})
  ctx = null
  commit([], 0)
  callbacks?.frame(null)
  callbacks?.state(false)
}
