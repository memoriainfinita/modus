// The metronome running: clicks scheduled ahead on the audio clock (a timer every 25 ms puts
// the next 100 ms in place), so the timing holds whatever the page does. Clicks are made with
// Web Audio, not the soundfont, through the master volume. The settings are kept.

import { audioOutput } from '../audio/audio'
import { loadJSON, save } from '../ui/storage'
import { buildPattern, tapTempo, type Click, type ClickKind, type MetronomeMode, type MetronomePattern } from './pattern'

export const TEMPO_MIN = 20, TEMPO_MAX = 300

export interface Trainer { on: boolean; step: number; every: number; max: number }

export interface MetronomeSettings {
  mode: MetronomeMode
  tempo: number
  sub: number                // clicks per pulse, 1–6
  trainer: Trainer           // +step bpm every `every` cycles, up to `max`
}

const DEFAULTS: MetronomeSettings = {
  mode: { kind: 'meter', numerators: [4], denominator: 4 },
  tempo: 100,
  sub: 1,
  trainer: { on: false, step: 2, every: 4, max: 160 },
}

function loadSettings(): MetronomeSettings {
  const s = loadJSON<Partial<MetronomeSettings>>('metronome', {})
  const merged = { ...DEFAULTS, ...s, trainer: { ...DEFAULTS.trainer, ...s.trainer } }
  return buildPattern(merged.mode, merged.sub) ? merged : DEFAULTS
}

let settings = loadSettings()
let pattern: MetronomePattern = buildPattern(settings.mode, settings.sub)!

export const getMetronome = (): Readonly<MetronomeSettings> => settings
export const getPattern = (): MetronomePattern => pattern

let onChange: () => void = () => {}
/** Called when the settings or the tempo change (the trainer moves it while running). */
export function setMetronomeChangeCallback(cb: () => void) { onChange = cb }

/**
 * Changes the settings. A new mode or subdivision starts its cycle from the top at the next
 * click, so what the necklace shows is what plays; a new tempo goes on without a break.
 * Returns false when the mode makes no pattern.
 */
export function setMetronome(patch: Partial<MetronomeSettings>): boolean {
  const next = { ...settings, ...patch, trainer: { ...settings.trainer, ...patch.trainer } }
  next.tempo = Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, next.tempo)))
  next.sub = Math.min(6, Math.max(1, Math.round(next.sub)))
  const p = buildPattern(next.mode, next.sub)
  if (!p) return false
  const newPattern = JSON.stringify(next.mode) !== JSON.stringify(settings.mode) || next.sub !== settings.sub
  settings = next
  if (newPattern) {
    pattern = p
    index = 0
    played.length = 0
  }
  save('metronome', settings)
  onChange()
  return true
}

// ─── Sound ───────────────────────────────────────────────────────────────────

const VOICE: Record<ClickKind, { hz: number; gain: number; len: number; type: OscillatorType }> = {
  strong: { hz: 1760, gain: 0.9, len: 0.05, type: 'sine' },
  accent: { hz: 1320, gain: 0.7, len: 0.04, type: 'sine' },
  beat:   { hz: 880,  gain: 0.5, len: 0.035, type: 'sine' },
  khali:  { hz: 587,  gain: 0.25, len: 0.03, type: 'sine' },     // the wave of a tala: a soft, low click
  sub:    { hz: 1100, gain: 0.2, len: 0.02, type: 'sine' },
  poly:   { hz: 440,  gain: 0.6, len: 0.05, type: 'triangle' },  // the polyrhythm's second voice
}

function click(ctx: AudioContext, out: AudioNode, kind: ClickKind, at: number) {
  const v = VOICE[kind]
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = v.type
  osc.frequency.value = v.hz
  g.gain.setValueAtTime(v.gain, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + v.len)
  osc.connect(g).connect(out)
  osc.start(at)
  osc.stop(at + v.len + 0.01)
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

const TICK_MS = 25, AHEAD_S = 0.1

let running = false
let timer: ReturnType<typeof setInterval> | null = null
let index = 0                                 // the next click in the pattern
let nextAt = 0                                // its time on the audio clock
let cycles = 0                                // cycles begun, for the trainer
// What was scheduled, for the drawing: the necklace lights the click whose time has come
const played: { at: number; click: Click; counts: number[] }[] = []

export const isMetronomeRunning = () => running

function schedule() {
  const { ctx, out } = audioOutput()
  while (nextAt < ctx.currentTime + AHEAD_S) {
    const c = pattern.clicks[index]
    click(ctx, out, c.kind, nextAt)
    played.push({ at: nextAt, click: c, counts: pattern.counts })
    if (played.length > 64) played.shift()
    const secPerBeat = 60 / settings.tempo
    if (index + 1 < pattern.clicks.length) {
      nextAt += (pattern.clicks[index + 1].at - c.at) * secPerBeat
      index++
    } else {
      // A cycle ends; the trainer may raise the tempo
      nextAt += (pattern.beats - c.at) * secPerBeat
      cycles++
      index = 0
      nextAt += pattern.clicks[0].at * 60 / settings.tempo
      const t = settings.trainer
      if (t.on && cycles % Math.max(1, t.every) === 0 && settings.tempo < t.max) {
        settings = { ...settings, tempo: Math.min(t.max, settings.tempo + t.step) }
        save('metronome', settings)
        onChange()
      }
    }
  }
}

export function startMetronome() {
  if (running) return
  const { ctx } = audioOutput()
  running = true
  index = 0
  cycles = 0
  played.length = 0
  nextAt = ctx.currentTime + 0.05
  schedule()
  timer = setInterval(schedule, TICK_MS)
  onChange()
}

export function stopMetronome() {
  if (!running) return
  running = false
  if (timer) clearInterval(timer)
  timer = null
  played.length = 0
  onChange()
}

/** The click sounding now (the last whose time has come), for the necklace; null when stopped. */
export function currentClick(): Click | null {
  if (!running) return null
  const now = audioOutput().ctx.currentTime
  let last: Click | null = null
  for (const p of played) if (p.at <= now) last = p.click
  return last
}

// ─── Tap tempo ───────────────────────────────────────────────────────────────

let taps: number[] = []

/** A tap: after two, the tempo is the mean of the last intervals. A pause of 2 s starts over. */
export function tap(now = performance.now()) {
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = []
  taps.push(now)
  const bpm = tapTempo(taps)
  if (bpm) setMetronome({ tempo: bpm })
}

/** While running, the tempo and the bar it counts: what the history's harmonic rhythm reads. */
export function runningMeter(): { bpm: number; beatsPerBar: number } | null {
  return running ? { bpm: settings.tempo, beatsPerBar: pattern.beats } : null
}
