import { describe, it, expect } from 'vitest'
import { detectPitch, frequencyToNote, rms, chromagram, chromaNotes } from '../src/input/pitch'

const RATE = 48000
/** `seconds` of a tone with `harmonics` partials falling as 1/n, as a voice or string gives. */
function tone(freq: number, harmonics = 1, length = 2048, noise = 0): Float32Array {
  const buf = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    let v = 0
    for (let h = 1; h <= harmonics; h++) v += Math.sin(2 * Math.PI * freq * h * i / RATE) / h
    buf[i] = 0.3 * v + noise * (Math.random() * 2 - 1)
  }
  return buf
}

describe('frequencyToNote', () => {
  it('A4 is 440 Hz; a quarter-tone up is 50 cents', () => {
    expect(frequencyToNote(440)).toEqual({ midi: 69, cents: 0 })
    expect(frequencyToNote(261.63)).toEqual({ midi: 60, cents: 0 })
    expect(frequencyToNote(440 * Math.pow(2, 0.49 / 12)).cents).toBe(49)
  })
})

describe('detectPitch', () => {
  it('finds the fundamental of pure and rich tones from E2 to C6', () => {
    for (const f of [82.41, 110, 196, 261.63, 440, 659.25, 1046.5]) {
      for (const h of [1, 6]) {
        const p = detectPitch(tone(f, h), RATE)
        expect(p, `${f} Hz, ${h} partials`).not.toBeNull()
        expect(Math.abs(frequencyToNote(p!.freq).cents - frequencyToNote(f).cents), `${f} Hz`).toBeLessThan(5)
        expect(frequencyToNote(p!.freq).midi).toBe(frequencyToNote(f).midi)
      }
    }
  })

  it('holds with some noise; gives nothing for noise alone', () => {
    expect(frequencyToNote(detectPitch(tone(220, 4, 2048, 0.05), RATE)!.freq).midi).toBe(57)
    const noise = new Float32Array(2048).map(() => Math.random() * 2 - 1)
    expect(detectPitch(noise, RATE)).toBeNull()
  })

  it('rms of silence is 0', () => {
    expect(rms(new Float32Array(512))).toBe(0)
  })
})

describe('chromagram', () => {
  it('the notes of a chord from its spectrum, and the bass', () => {
    // A spectrum in dB with peaks at C3, E4, G4 (C3 loudest in the low range)
    const fft = 8192, db = new Float32Array(fft / 2).fill(-120)
    const peak = (hz: number, level: number) => { db[Math.round(hz / (RATE / fft))] = level }
    peak(130.81, -20); peak(329.63, -24); peak(392, -24)
    const { chroma, bass } = chromagram(db, RATE, fft)
    expect(chromaNotes(chroma)).toEqual([0, 4, 7])
    expect(bass).toBe(0)
  })
})
