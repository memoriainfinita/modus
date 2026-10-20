// What the metronome plays in one turn of its cycle: each click's time (in beats of the tempo),
// its kind, its voice and the pulse it belongs to. Meters, talas, flamenco compás, aksak,
// claves and Euclidean rhythms come from UMT (TimeSignature's additive numerators,
// RHYTHMIC_CYCLES with cycleStrokes and cycleCounts, CLAVE_PATTERNS, Polyrhythm.euclidean);
// this file only lays them out in time.

/** Strong: the first pulse of the cycle. Khali: a tala's wave, a soft click. Sub: a subdivision. */
export type ClickKind = 'strong' | 'accent' | 'beat' | 'khali' | 'sub' | 'poly'

export interface Click {
  at: number        // beats from the cycle's start
  kind: ClickKind
  voice: 0 | 1      // 1: the second voice of a polyrhythm
  pulse: number     // index of the pulse (dot) it belongs to, in its voice
}

export interface MetronomePattern {
  beats: number             // length of the cycle in beats of the tempo
  pulses: number[]          // dots per voice: [n] or, for a polyrhythm, [a, b]
  groups: number[]          // pulses per group (arcs of the necklace), adding up to pulses[0]
  counts: number[]          // what each pulse of voice 0 is called (1…n; a bulería starts at 12)
  clicks: Click[]           // sorted by time
}

export type MetronomeMode =
  | { kind: 'meter'; numerators: number[]; denominator: number }
  | { kind: 'cycle'; id: string }
  | { kind: 'clave'; id: string }
  | { kind: 'euclid'; pulses: number; steps: number }
  | { kind: 'poly'; a: number; b: number }

/** "3+2+2/8", "4/4", "7/8" → numerators and denominator; null when it is not a meter. */
export function parseMeter(text: string): { numerators: number[]; denominator: number } | null {
  const m = text.replace(/\s/g, '').match(/^(\d+(?:\+\d+)*)\/(\d+)$/)
  if (!m) return null
  const numerators = m[1].split('+').map(Number)
  const denominator = Number(m[2])
  if (numerators.some(n => n < 1 || n > 32) || ![1, 2, 4, 8, 16, 32].includes(denominator)) return null
  return { numerators, denominator }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

/** Pulses with their kinds, each split into `sub` clicks: the first keeps the kind, the rest are 'sub'. */
function subdivide(kinds: ClickKind[], sub: number): Click[] {
  return kinds.flatMap((kind, pulse) => range(sub).map(s => ({ at: pulse + s / sub, kind: s === 0 ? kind : 'sub' as ClickKind, voice: 0 as const, pulse })))
}

/**
 * The pattern of a mode, with `sub` clicks per pulse (1–6) where pulses can be split
 * (meters, cycles, Euclidean rhythms; a clave is already in sixteenths, a polyrhythm is two voices).
 */
export function buildPattern(mode: MetronomeMode, sub = 1): MetronomePattern | null {
  if (mode.kind === 'meter') {
    const total = mode.numerators.reduce((a, b) => a + b, 0)
    // The first pulse of the bar strong, the first of each other group accented
    const starts = mode.numerators.reduce<number[]>((acc, _n, i) => [...acc, i ? acc[i - 1] + mode.numerators[i - 1] : 0], [])
    const kinds = range(total).map<ClickKind>(i => i === 0 ? 'strong' : starts.includes(i) ? 'accent' : 'beat')
    return { beats: total, pulses: [total], groups: mode.numerators, counts: range(total).map(i => i + 1), clicks: subdivide(kinds, sub) }
  }
  if (mode.kind === 'cycle') {
    const cycle = UMT.RHYTHMIC_CYCLES[mode.id]
    if (!cycle) return null
    const strokes = UMT.cycleStrokes(cycle)
    const kinds = strokes.map<ClickKind>(s => s === 'sam' ? 'strong' : s === 'tali' || s === 'accent' ? 'accent' : s === 'khali' ? 'khali' : 'beat')
    return { beats: cycle.beats, pulses: [cycle.beats], groups: cycle.groups, counts: UMT.cycleCounts(cycle), clicks: subdivide(kinds, sub) }
  }
  if (mode.kind === 'clave') {
    const clave = UMT.CLAVE_PATTERNS[mode.id]
    if (!clave) return null
    // Sixteen steps are a bar of 4/4: four steps a beat. The onsets are the clave; each beat ticks softly under it
    const n = clave.steps.length
    const perBeat = n % 4 === 0 ? 4 : 1
    const clicks: Click[] = []
    clave.steps.forEach((on, i) => {
      if (on) clicks.push({ at: i / perBeat, kind: i === 0 ? 'strong' : 'accent', voice: 0, pulse: i })
      else if (i % perBeat === 0) clicks.push({ at: i / perBeat, kind: 'sub', voice: 0, pulse: i })
    })
    return { beats: n / perBeat, pulses: [n], groups: perBeat === 4 ? [n / 2, n / 2] : [n], counts: range(n).map(i => i + 1), clicks }
  }
  if (mode.kind === 'euclid') {
    const { pulses, steps } = mode
    if (steps < 1 || pulses < 0 || pulses > steps) return null
    const onsets = UMT.Polyrhythm.euclidean(pulses, steps)
    const kinds = onsets.map<ClickKind>((on, i) => on ? (i === 0 ? 'strong' : 'accent') : 'sub')
    return { beats: steps, pulses: [steps], groups: [steps], counts: range(steps).map(i => i + 1), clicks: subdivide(kinds, sub) }
  }
  // a:b, both over a cycles of a beats: voice 0 on each beat, voice 1 b times in the same span
  const { a, b } = mode
  if (a < 1 || b < 1) return null
  const clicks: Click[] = [
    ...range(a).map(i => ({ at: i, kind: (i === 0 ? 'strong' : 'beat') as ClickKind, voice: 0 as const, pulse: i })),
    ...range(b).map(i => ({ at: i * a / b, kind: 'poly' as ClickKind, voice: 1 as const, pulse: i })),
  ].sort((x, y) => x.at - y.at || x.voice - y.voice)
  return { beats: a, pulses: [a, b], groups: [a], counts: range(a).map(i => i + 1), clicks }
}

/** Tap tempo: the mean of the intervals between the last taps (ms), as bpm; null with fewer than two. */
export function tapTempo(taps: number[], max = 6): number | null {
  const recent = taps.slice(-max)
  if (recent.length < 2) return null
  const gaps = recent.slice(1).map((t, i) => t - recent[i])
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length
  return mean > 0 ? Math.round(60000 / mean) : null
}
