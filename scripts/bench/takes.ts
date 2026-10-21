// Guitar takes for testing by hand (tests/manual): chord progressions strummed with FluidR3's
// recorded guitar samples, each chord a real shape from chords.ts, written as 16-bit WAV.
// Run by takes.mjs in Chrome; the chords and their times go to an answer file beside them.

import { SHAPES, shapeMidi } from './chords'

const RATE = 44100
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const sampleKey = (m: number) => NAMES[m % 12] + (Math.floor(m / 12) - 1)

export interface Take {
  file: string
  instrument: 'acoustic_guitar_steel' | 'acoustic_guitar_nylon'
  bpm: number
  /** Chords and how many beats each lasts; strums on the beats listed (within the chord, from 0). */
  chords: { name: string; beats: number; strums: number[] }[]
}

const shape = (name: string) => {
  const s = SHAPES.find(([n]) => n === name)
  if (!s) throw new Error(`no shape ${name}`)
  return shapeMidi(s[1])
}

async function loadInstrument(name: string): Promise<Map<number, AudioBuffer>> {
  const data: Record<string, string> = await (await fetch(`/.bench/samples/${name}.json`)).json()
  const ctx = new OfflineAudioContext(1, 1, RATE)
  const out = new Map<number, AudioBuffer>()
  for (let m = 40; m <= 88; m++) {
    const b64 = data[sampleKey(m)]
    if (b64) out.set(m, await ctx.decodeAudioData(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer))
  }
  return out
}

/** The take as audio: each strum down the strings (15 ms apart), the chord ringing until the next. */
async function render(take: Take): Promise<Float32Array> {
  const samples = await loadInstrument(take.instrument)
  const beat = 60 / take.bpm
  const total = take.chords.reduce((s, c) => s + c.beats, 0) * beat + 1.5
  const ctx = new OfflineAudioContext(1, Math.ceil(total * RATE), RATE)
  let at = 0.2
  for (const c of take.chords) {
    const midi = shape(c.name)
    const end = at + c.beats * beat
    c.strums.forEach((b, k) => {
      const t0 = at + b * beat
      const t1 = k + 1 < c.strums.length ? at + c.strums[k + 1] * beat : end
      midi.forEach((m, i) => {
        const src = ctx.createBufferSource()
        src.buffer = samples.get(m)!
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.22, t0)
        // Damped at the next strum or chord, as a hand on the strings would
        g.gain.setTargetAtTime(0, t1 - 0.02, 0.03)
        src.connect(g).connect(ctx.destination)
        src.start(t0 + i * 0.015)
        src.stop(t1 + 0.2)
      })
    })
    at = end
  }
  return (await ctx.startRendering()).getChannelData(0)
}

function wav(data: Float32Array): string {
  const buf = new ArrayBuffer(44 + data.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, data.length * 2, true)
  let peak = 0
  for (const x of data) peak = Math.max(peak, Math.abs(x))
  const k = peak > 0 ? 0.9 / peak : 1
  data.forEach((x, i) => v.setInt16(44 + i * 2, Math.round(x * k * 32767), true))
  let s = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

;(window as any).__takes = async (takes: Take[]) => {
  const out: { file: string; wav: string }[] = []
  for (const take of takes) out.push({ file: take.file, wav: wav(await render(take)) })
  return out
}
