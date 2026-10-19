// The chord-from-audio bench, run in Chrome by scripts/bench/run.mjs. Each guitar shape is
// strummed with FluidR3's recorded guitar samples (steel and nylon), clean and with noise,
// and read three ways: Modus' chromagram as the microphone reads it now, the harmonic
// estimate of harmonic.ts, and Spotify's Basic Pitch. Scored on the notes' pitch classes,
// the bass, and the chord name UMT gives the notes read against the notes played.

import { chromagram, chromaNotes } from '../../src/input/pitch'
import { harmonicNotes } from './harmonic'
import { SHAPES, shapeMidi } from './chords'
import { basicPitchNotes, loadBasicPitch } from './basic-pitch'

declare const UMT: any

const RATE = 44100
const STRUM_S = 0.015          // between strings
const AT_S = [0.4, 1.0]        // frames read: just after the strum (a 16384 frame fits), and as it rings
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const noteName = (m: number) => NAMES[m % 12] + (Math.floor(m / 12) - 1)
// FluidR3 names its notes with flats
const sampleKey = noteName

async function loadInstrument(name: string): Promise<Map<number, AudioBuffer>> {
  const data: Record<string, string> = await (await fetch(`/.bench/samples/${name}.json`)).json()
  const ctx = new OfflineAudioContext(1, 1, RATE)
  const out = new Map<number, AudioBuffer>()
  for (let m = 40; m <= 88; m++) {
    const b64 = data[sampleKey(m)]
    if (!b64) continue
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    out.set(m, await ctx.decodeAudioData(bytes.buffer))
  }
  return out
}

async function strum(samples: Map<number, AudioBuffer>, midi: number[], rate: number, noiseDb: number | null): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(rate * 2), rate)
  midi.forEach((m, i) => {
    const src = ctx.createBufferSource()
    src.buffer = samples.get(m)!
    const g = ctx.createGain()
    g.gain.value = 0.25
    src.connect(g).connect(ctx.destination)
    src.start(i * STRUM_S)
  })
  const buf = (await ctx.startRendering()).getChannelData(0)
  if (noiseDb !== null) {
    let p = 0
    for (const x of buf) p += x * x
    const sigma = Math.sqrt(p / buf.length) * Math.pow(10, noiseDb / 20)
    for (let i = 0; i < buf.length; i++) buf[i] += sigma * (Math.random() + Math.random() + Math.random() - 1.5) * 2
  }
  return buf
}

/** The analyser's dB spectrum of a frame (Blackman window, |X|/N), as mic.ts reads it. */
function analyserDb(frame: Float32Array): Float32Array {
  const n = frame.length
  const re = new Float64Array(n), im = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / n) + 0.08 * Math.cos(4 * Math.PI * i / n)
    re[i] = frame[i] * w
  }
  fftInPlace(re, im)
  const db = new Float32Array(n / 2)
  for (let k = 0; k < n / 2; k++) db[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) / n + 1e-20)
  return db
}
import { fft as fftInPlace } from './harmonic'

/** What mic.ts gives the detector from a frame today: the bass in octave 3, the rest above it. */
function chromaMethod(frame: Float32Array): number[] {
  const { chroma, bass } = chromagram(analyserDb(frame), RATE, frame.length)
  const pcs = chromaNotes(chroma)
  if (pcs.length < 2) return []
  return [...(bass !== null ? [48 + bass] : []), ...pcs.filter(pc => pc !== bass).map(pc => 60 + pc)]
}

/** The notes of the latest strum before `at`: those whose onsets fall within 150 ms of its last one, ringing or not. */
function strumNotes(events: { midi: number; start: number }[], at: number): number[] {
  const started = events.filter(e => e.start <= at)
  if (!started.length) return []
  const last = Math.max(...started.map(e => e.start))
  return [...new Set(started.filter(e => e.start >= last - 0.15).map(e => e.midi))].sort((a, b) => a - b)
}

const pcsOf = (midi: number[]) => [...new Set(midi.map(m => m % 12))].sort((a, b) => a - b).join(',')
const umtName = (midi: number[]) => {
  if (midi.length < 3) return '—'
  try { return UMT.Harmony.detectChordsScored(midi.map(m => UMT.parseNote(noteName(m))))[0]?.name ?? '?' } catch { return '?' }
}

export interface Row {
  chord: string; instrument: string; noise: string; at: number; method: string
  pcs: boolean; bass: boolean; name: boolean; got: string; ms: number
}

async function run(): Promise<{ rows: Row[] }> {
  const rows: Row[] = []
  const bp = await loadBasicPitch()
  for (const instrument of ['acoustic_guitar_steel', 'acoustic_guitar_nylon']) {
    const samples = await loadInstrument(instrument)
    for (const noiseDb of [null, -30]) {
      for (const [chord, frets] of SHAPES) {
        const midi = shapeMidi(frets)
        const truth = { pcs: pcsOf(midi), bass: midi[0] % 12, name: umtName(midi) }
        const score = (method: string, at: number, got: number[], ms: number) => rows.push({
          chord, instrument: instrument.replace('acoustic_guitar_', ''), noise: noiseDb === null ? 'clean' : `${noiseDb} dB`, at, method,
          pcs: pcsOf(got) === truth.pcs, bass: got.length > 0 && got[0] % 12 === truth.bass, name: umtName(got) === truth.name,
          got: got.map(noteName).join(' '), ms,
        })
        const audio = await strum(samples, midi, RATE, noiseDb)
        for (const at of AT_S) {
          for (const [method, size, read] of [
            ['chroma 8192', 8192, chromaMethod],
            ['harmonic 8192', 8192, (f: Float32Array) => harmonicNotes(f, RATE)],
            ['harmonic 16384', 16384, (f: Float32Array) => harmonicNotes(f, RATE)],
          ] as const) {
            const end = Math.round(at * RATE)
            const frame = audio.slice(end - size, end)
            const t0 = performance.now()
            const got = read(frame)
            score(method, at, got, performance.now() - t0)
          }
        }
        // Basic Pitch reads the whole 2 s at its own rate, 22050 Hz: the notes sounding at each time read
        const audio22 = await strum(samples, midi, 22050, noiseDb)
        const t0 = performance.now()
        const events = await basicPitchNotes(bp, audio22)
        const ms = performance.now() - t0
        for (const at of AT_S) {
          score('basic-pitch', at, events.filter(e => e.start <= at && e.end >= at).map(e => e.midi).sort((a, b) => a - b), ms)
          score('basic-pitch strum', at, strumNotes(events, at), ms)
        }
      }
    }
  }
  return { rows }
}

;(window as any).__bench = run().then(r => r, e => ({ error: String(e?.stack ?? e) }))
