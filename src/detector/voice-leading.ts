import { noteNameToMidi } from '../theory/notes'
import { tryParseChord, tryUMT } from '../theory/chord'
import { t, noteLabel } from '../i18n/i18n'

// How each voice moves from the chord before to the chord now. Voices are read bass to
// top; when the two chords have as many notes, the nth voice goes to the nth. When they
// differ, the bass goes to the bass and the top to the top, and the inner voices pair in
// order with the least total motion; a voice left over enters or drops out.

/** One voice's step: a note that enters has no `from`, one that drops out no `to`. */
export interface VoiceMove {
  from: string | null
  to: string | null
  semitones: number | null   // signed, up positive; null when the voice enters or drops out
}

export type OuterMotion = 'parallel' | 'similar' | 'contrary' | 'oblique' | 'static'

export interface VoiceLeading {
  moves: VoiceMove[]          // bass first
  total: number               // semitones moved, every paired voice
  common: number              // voices that hold their note
  outer: OuterMotion | null   // bass against top; null below two voices
  issues: string[]            // the rules of four-part writing broken, written for the panel
}

type Voice = { name: string; midi: number }

const voices = (names: string[]): Voice[] => names
  .flatMap(name => { const midi = noteNameToMidi(name); return midi === null ? [] : [{ name, midi }] })
  .sort((a, b) => a.midi - b.midi)

/**
 * Inner voices of the shorter chord matched, in order, to inner voices of the longer one,
 * with the least motion: `pick[i]` is the index in `long` that `short[i]` goes to.
 */
function matchInner(short: Voice[], long: Voice[]): number[] {
  const n = short.length, m = long.length
  // cost[i][j]: least motion pairing short[0..i) within long[0..j)
  const cost = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity))
  for (let j = 0; j <= m; j++) cost[0][j] = 0
  for (let i = 1; i <= n; i++) for (let j = i; j <= m; j++)
    cost[i][j] = Math.min(cost[i][j - 1], cost[i - 1][j - 1] + Math.abs(short[i - 1].midi - long[j - 1].midi))
  const pick: number[] = []
  for (let i = n, j = m; i > 0; j--) {
    if (cost[i][j] === cost[i][j - 1] && j > i) continue
    pick.unshift(j - 1); i--
  }
  return pick
}

/** The voices of two chords paired bass to top (see above). */
export function pairVoices(fromNames: string[], toNames: string[]): VoiceMove[] {
  const a = voices(fromNames), b = voices(toNames)
  const move = (x: Voice | null, y: Voice | null): VoiceMove =>
    ({ from: x?.name ?? null, to: y?.name ?? null, semitones: x && y ? y.midi - x.midi : null })
  if (!a.length || !b.length) return []
  if (a.length === b.length) return a.map((x, i) => move(x, b[i]))
  if (a.length === 1 || b.length === 1) return [move(a[0], b[0])]
  const shortIsFrom = a.length < b.length
  const [short, long] = shortIsFrom ? [a, b] : [b, a]
  const pick = matchInner(short.slice(1, -1), long.slice(1, -1)).map(j => j + 1)
  const paired = new Map<number, number>([[0, 0], [long.length - 1, short.length - 1]])
  pick.forEach((j, i) => paired.set(j, i + 1))
  return long.map((voice, j) => {
    const other = paired.has(j) ? short[paired.get(j)!] : null
    return shortIsFrom ? move(other, voice) : move(voice, other)
  })
}

function outerMotion(moves: VoiceMove[]): OuterMotion | null {
  const ends = moves.filter(m => m.semitones !== null)
  if (ends.length < 2) return null
  const bass = ends[0].semitones!, top = ends[ends.length - 1].semitones!
  if (!bass && !top) return 'static'
  if (!bass || !top) return 'oblique'
  if (Math.sign(bass) !== Math.sign(top)) return 'contrary'
  return bass === top ? 'parallel' : 'similar'
}

// UMT's issue types, by the key their text has here. False relations are left out: UMT
// marks them as possible (any chromatic neighbour in another voice), too loose to show.
const ISSUE_KEYS = {
  'Parallel 5th': 'parallel5', 'Parallel Octave': 'parallel8',
  'Hidden Fifth': 'hidden5', 'Direct Fifth': 'hidden5', 'Hidden Octave': 'hidden8', 'Direct Octave': 'hidden8',
  'Voice Crossing': 'crossing', 'Voice Overlap': 'overlap', 'Forbidden Leap': 'leap',
  'Leading Tone Unresolved': 'leadingTone', 'Doubled Leading Tone': 'doubledLeadingTone', '7th Unresolved': 'seventh',
} as const

/** A voice by its place: the bass, the top, or its number from the bass. */
export function voiceName(index: number, count: number): string {
  if (index === 0) return t('vl.bass')
  if (index === count - 1) return t('vl.top')
  return t('vl.voice', { n: index + 1 })
}

/**
 * The rules of four-part writing (UMT `checkVoiceLeading`, strict), only when both chords
 * have as many voices: UMT pairs voices by position.
 */
function ruleIssues(fromNames: string[], toNames: string[], key: string | null, fromSymbol: string | null, toSymbol: string | null): string[] {
  const a = voices(fromNames), b = voices(toNames)
  if (a.length !== b.length || a.length < 2) return []
  const parse = (v: Voice[]) => v.map(x => UMT.parseNote(x.name))
  const context = { keySymbol: key ?? undefined, chordA: tryParseChord(fromSymbol) ?? undefined, chordB: tryParseChord(toSymbol) ?? undefined }
  const found = tryUMT('voice leading', () => (UMT.Harmony.checkVoiceLeading(parse(a), parse(b), 'strict', context) ?? []) as { type: string; voices: number[] }[], [])
  const seen = new Set<string>()
  return found.flatMap(issue => {
    const k = ISSUE_KEYS[issue.type as keyof typeof ISSUE_KEYS]
    if (!k) return []
    const text = t(`vl.issue.${k}`, { voices: issue.voices.map(v => voiceName(v, a.length)).join(t('vl.and')) })
    if (seen.has(text)) return []
    seen.add(text)
    return [text]
  })
}

/** From the chord before to the chord now; null when there is nothing to compare. */
export function analyzeVoiceLeading(fromNames: string[] | null, toNames: string[], key: string | null, fromSymbol: string | null = null, toSymbol: string | null = null): VoiceLeading | null {
  if (!fromNames?.length || toNames.length < 2) return null
  const moves = pairVoices(fromNames, toNames)
  if (!moves.length) return null
  const paired = moves.filter(m => m.semitones !== null)
  return {
    moves,
    total: paired.reduce((s, m) => s + Math.abs(m.semitones!), 0),
    common: paired.filter(m => m.semitones === 0).length,
    outer: outerMotion(moves),
    issues: ruleIssues(fromNames, toNames, key, fromSymbol, toSymbol),
  }
}

const pc = (name: string) => noteLabel(name.replace(/-?\d+$/, ''))

/** One voice as the panel writes it: "E→F ↑1", "G =", "+ B", "− D". */
function moveText(m: VoiceMove): string {
  if (!m.from) return `+ ${pc(m.to!)}`
  if (!m.to) return `− ${pc(m.from)}`
  if (m.semitones === 0) return `${pc(m.to)} =`
  return `${pc(m.from)}→${pc(m.to)} ${m.semitones! > 0 ? '↑' : '↓'}${Math.abs(m.semitones!)}`
}

/** The Voices row: each voice bass first, then outer motion, total motion and common tones. */
export function describeVoiceLeading(vl: VoiceLeading): string {
  const summary = [
    vl.outer ? t(`vl.outer.${vl.outer}`) : null,
    t('vl.total', { n: vl.total }),
    vl.common ? t('vl.common', { n: vl.common }) : null,
  ].filter(Boolean).join(' · ')
  return `${vl.moves.map(moveText).join('  ')} — ${summary}`
}
