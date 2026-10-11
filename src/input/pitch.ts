// Pitch from sound, for the microphone. Signal processing only, no theory: YIN for the one
// note sung or played (de Cheveigné & Kawahara, 2002), a chromagram for the notes of a chord.

/** The frequency of a note and how far it is from equal temperament (A4 = 440 Hz). */
export function frequencyToNote(freq: number): { midi: number; cents: number } {
  const exact = 69 + 12 * Math.log2(freq / 440)
  const midi = Math.round(exact)
  return { midi, cents: Math.round((exact - midi) * 100) }
}

export function rms(buf: Float32Array): number {
  let s = 0
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]
  return Math.sqrt(s / buf.length)
}

/**
 * The fundamental of a frame, 50–1600 Hz, by YIN: the lag where the signal best matches
 * itself, from the cumulative mean normalized difference, refined between samples. Null
 * when no lag goes under `threshold` (noise, a chord, silence). `clarity` is 1 − that minimum.
 */
export function detectPitch(buf: Float32Array, sampleRate: number, threshold = 0.12): { freq: number; clarity: number } | null {
  const minTau = Math.floor(sampleRate / 1600)
  const maxTau = Math.min(Math.floor(sampleRate / 50), Math.floor(buf.length / 2))
  if (maxTau <= minTau + 2) return null
  const n = buf.length - maxTau
  const d = new Float32Array(maxTau + 1)
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0
    for (let i = 0; i < n; i++) { const x = buf[i] - buf[i + tau]; sum += x * x }
    d[tau] = sum
  }
  // Cumulative mean normalized difference
  const cmnd = new Float32Array(maxTau + 1)
  cmnd[0] = 1
  let running = 0
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau]
    cmnd[tau] = running > 0 ? d[tau] * tau / running : 1
  }
  let tau = -1
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < threshold) {
      // The bottom of this dip, not its edge
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++
      tau = t
      break
    }
  }
  if (tau < 0) return null
  // Parabolic interpolation around the minimum
  const a = cmnd[tau - 1] ?? cmnd[tau], b = cmnd[tau], c = cmnd[tau + 1] ?? cmnd[tau]
  const shift = (a - 2 * b + c) !== 0 ? (a - c) / (2 * (a - 2 * b + c)) : 0
  return { freq: sampleRate / (tau + shift), clarity: 1 - b }
}

/**
 * Energy per pitch class (C = 0) from a spectrum in decibels (an AnalyserNode's), between
 * 60 Hz and 2 kHz, and the pitch class strongest below 260 Hz: the bass.
 */
export function chromagram(db: Float32Array, sampleRate: number, fftSize: number): { chroma: number[]; bass: number | null } {
  const chroma = new Array(12).fill(0)
  const low = new Array(12).fill(0)
  const binHz = sampleRate / fftSize
  for (let i = Math.ceil(60 / binHz); i < db.length && i * binHz <= 2000; i++) {
    const power = Math.pow(10, db[i] / 10)
    if (!isFinite(power)) continue
    const midi = Math.round(69 + 12 * Math.log2((i * binHz) / 440))
    const pc = ((midi % 12) + 12) % 12
    chroma[pc] += power
    if (i * binHz < 260) low[pc] += power
  }
  const lowMax = Math.max(...low)
  return { chroma, bass: lowMax > 0 ? low.indexOf(lowMax) : null }
}

/** The pitch classes sounding: those with at least `share` of the strongest, five at most. */
export function chromaNotes(chroma: number[], share = 0.3): number[] {
  const max = Math.max(...chroma)
  if (max <= 0) return []
  return chroma.map((v, pc) => ({ v, pc })).filter(x => x.v >= max * share)
    .sort((a, b) => b.v - a.v).slice(0, 5).map(x => x.pc).sort((a, b) => a - b)
}
