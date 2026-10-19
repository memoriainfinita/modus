// Candidate for chords from audio: the notes sounding, estimated one at a time from the
// spectrum's peaks. Each step takes the note whose harmonics carry the most energy, then
// takes those harmonics out, so a note's 3rd and 5th harmonics are not read as its fifth
// and third (iterative multipitch estimation, after Klapuri 2003). The tuning is read from
// the peaks first, so an instrument off A440 still lands on its notes.

export interface HarmonicOptions {
  minMidi?: number      // lowest candidate note (E2 = 40)
  maxMidi?: number      // highest (C6 = 84)
  maxNotes?: number
  stop?: number         // stop when a note's salience falls under this share of the first
  harmonics?: number
}

/** In-place radix-2 FFT of re/im (length a power of two). */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai
        re[i + k] += ar; im[i + k] += ai
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t
      }
    }
  }
}

/** Magnitude spectrum of a Hann-windowed frame. */
export function magnitudes(frame: Float32Array): Float64Array {
  const n = frame.length
  const re = new Float64Array(n), im = new Float64Array(n)
  for (let i = 0; i < n; i++) re[i] = frame[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)))
  fft(re, im)
  const mag = new Float64Array(n / 2)
  for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k])
  return mag
}

interface Peak { f: number; a: number }

/** Local maxima well above the spectrum's median, with parabolic interpolation of frequency and height. */
function peaks(mag: Float64Array, binHz: number, fMax: number): Peak[] {
  const top = Math.min(mag.length - 2, Math.floor(fMax / binHz))
  const sorted = Array.from(mag.subarray(1, top)).sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length / 2)] * 4
  const out: Peak[] = []
  for (let k = 2; k < top; k++) {
    const a = mag[k - 1], b = mag[k], c = mag[k + 1]
    if (b <= a || b < c || b < floor) continue
    const la = Math.log(a + 1e-12), lb = Math.log(b), lc = Math.log(c + 1e-12)
    const d = 0.5 * (la - lc) / (la - 2 * lb + lc)
    out.push({ f: (k + d) * binHz, a: Math.exp(lb - 0.25 * (la - lc) * d) })
  }
  return out
}

const midiHz = (m: number, a4: number) => a4 * Math.pow(2, (m - 69) / 12)

/** The reference pitch the peaks agree on: A4 in Hz, from the weighted mean of their cent offsets. */
function tuning(ps: Peak[]): number {
  let x = 0, y = 0
  for (const p of ps) {
    const semis = 12 * Math.log2(p.f / 440)
    const ang = 2 * Math.PI * (semis - Math.round(semis))
    x += p.a * Math.cos(ang); y += p.a * Math.sin(ang)
  }
  const offset = Math.atan2(y, x) / (2 * Math.PI)   // in semitones, −0.5 … 0.5
  return 440 * Math.pow(2, offset / 12)
}

/** The notes sounding in a frame (MIDI numbers, low to high), at most `maxNotes`. */
export function harmonicNotes(frame: Float32Array, sampleRate: number, o: HarmonicOptions = {}): number[] {
  const { minMidi = 40, maxMidi = 84, maxNotes = 6, stop = 0.15, harmonics = 8 } = o
  const mag = magnitudes(frame)
  const binHz = sampleRate / frame.length
  const ps = peaks(mag, binHz, 5000)
  if (!ps.length) return []
  const a4 = tuning(ps)
  const amp = ps.map(p => p.a)
  // The peak nearest each harmonic, within 40 cents (wider for the inharmonic upper partials of a string)
  const nearest = (f: number, h: number) => {
    const tol = Math.pow(2, (40 + 3 * h) / 1200)
    let best = -1, bestD = Infinity
    for (let i = 0; i < ps.length; i++) {
      const d = Math.abs(Math.log(ps[i].f / f))
      if (d < bestD) { bestD = d; best = i }
    }
    return best >= 0 && Math.exp(bestD) <= tol ? best : -1
  }
  const partials = new Map<number, number[]>()
  for (let m = minMidi; m <= maxMidi; m++) {
    const f0 = midiHz(m, a4)
    partials.set(m, Array.from({ length: harmonics }, (_, h) => nearest(f0 * (h + 1), h + 1)))
  }
  // A note needs its fundamental or its octave: otherwise a low note is made of another's harmonics
  const salience = (m: number) => {
    const idx = partials.get(m)!
    if (idx[0] < 0 && idx[1] < 0) return 0
    return idx.reduce((s, i, h) => i < 0 ? s : s + amp[i] / (h + 1), 0)
  }
  const found: number[] = []
  let first = 0
  while (found.length < maxNotes) {
    let best = -1, bestS = 0
    for (let m = minMidi; m <= maxMidi; m++) {
      if (found.includes(m)) continue
      const s = salience(m)
      if (s > bestS) { bestS = s; best = m }
    }
    if (best < 0 || bestS <= 0) break
    if (!first) first = bestS
    else if (bestS < first * stop) break
    found.push(best)
    // Take this note's harmonics out: each peak loses what a smooth spectrum would give it
    const idx = partials.get(best)!
    const level = amp[idx[0] >= 0 ? idx[0] : idx[1]]
    idx.forEach((i, h) => { if (i >= 0) amp[i] = Math.max(0, amp[i] - level * Math.pow(0.75, h)) })
  }
  return found.sort((a, b) => a - b)
}
