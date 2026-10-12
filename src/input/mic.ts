// Microphone input. Notes: the one note sung or played (YIN), once it holds for a few frames,
// goes to the detector as a key held, and is let go after a short silence. Chords
// (experimental): the pitch classes of a chromagram, the strongest low one as the bass.
// Nothing heard is sounded: the microphone would hear it again.

import { detectPitch, frequencyToNote, rms, chromagram, chromaNotes } from './pitch'
import { loadChoice, save } from '../ui/storage'
import { getPref } from '../settings/prefs'

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

function commit(notes: number[], level: number) {
  if (notes.join() === held.join()) return
  held = notes
  callbacks?.notes(notes, Math.max(1, Math.min(127, Math.round(level * 600))))
}

/** One frame: what is heard, and when it has held long enough, what the detector gets. */
function hear(analyser: AnalyserNode, time: Float32Array<ArrayBuffer>, spectrum: Float32Array<ArrayBuffer>, rate: number) {
  analyser.getFloatTimeDomainData(time)
  // The newest 2048 samples (~43 ms) for the pitch: the whole window lags behind
  const recent = time.subarray(time.length - 2048)
  const level = rms(recent)
  let notes: number[] = []
  let heard: Heard | null = null
  if (level >= GATES[getPref('mic-sensitivity') as keyof typeof GATES]) {
    if (mode === 'notes') {
      const p = detectPitch(recent, rate)
      if (p) {
        const n = frequencyToNote(p.freq, getPref('a4-hz'))
        heard = { ...n, freq: p.freq, level }
        notes = [n.midi]
      }
    } else {
      analyser.getFloatFrequencyData(spectrum)
      const { chroma, bass } = chromagram(spectrum, rate, analyser.fftSize)
      const pcs = chromaNotes(chroma)
      // Written above the bass: the bass in octave 3, the rest over it in octave 4
      if (pcs.length >= 2) notes = [...(bass !== null ? [48 + bass] : []), ...pcs.filter(pc => pc !== bass).map(pc => 60 + pc)]
      const p = detectPitch(recent, rate)
      if (p) heard = { ...frequencyToNote(p.freq, getPref('a4-hz')), freq: p.freq, level }
    }
  }
  callbacks?.frame(heard)
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
  analyser.fftSize = 8192
  analyser.smoothingTimeConstant = 0.5
  source.connect(analyser)
  const time = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>
  const spectrum = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>
  const rate = ctx.sampleRate
  timer = setInterval(() => hear(analyser, time, spectrum, rate), FRAME_MS)
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
