import type { DetectionResult, HarmonicAnalysis, NoteSetAnalysis, HistoryEntry, SingleNoteResult, IntervalResult, ChordResult } from '../types'
import { midiToNoteName, pitchClassOf, PITCH_NAMES_FLAT } from '../theory/notes'
import { tryParseChord, isKnownChord, normalizeChordName, tryUMT } from '../theory/chord'
import { normalizeKey } from '../theory/keys'
import { t, chordLabel, scaleLabel, substitutionTypeLabel } from '../i18n/i18n'
import { analyzeVoiceLeading, describeVoiceLeading } from './voice-leading'

const intervalName = (n: number) => t(`interval.${n}` as `interval.${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11}`)

// Compound intervals are reduced to their simple form; whole octaves are named as such.
function semitonesToInterval(semitones: number): { name: string; inversionName: string } {
  const n = ((semitones % 12) + 12) % 12
  if (n === 0) return semitones === 0
    ? { name: intervalName(0), inversionName: t('interval.octave') }
    : { name: t('interval.octave'), inversionName: intervalName(0) }
  return { name: intervalName(n), inversionName: intervalName(12 - n) }
}

export function analyzeNotes(midiNotes: number[]): DetectionResult {
  if (midiNotes.length === 0) return null

  const noteNames = midiNotes.map(midiToNoteName)

  if (midiNotes.length === 1) {
    const result: SingleNoteResult = {
      kind: 'note',
      noteName: noteNames[0],
      midiNumber: midiNotes[0],
      pitchClass: PITCH_NAMES_FLAT[midiNotes[0] % 12],
    }
    return result
  }

  if (midiNotes.length === 2) {
    const semitones = Math.abs(midiNotes[0] - midiNotes[1])
    const { name, inversionName } = semitonesToInterval(semitones)
    const result: IntervalResult = {
      kind: 'interval',
      notes: noteNames,
      intervalName: name,
      semitones,
      inversionName,
    }
    return result
  }

  // ≥3 notes: chord detection, best reading first (UMT's score: root in the bass, nothing
  // missing). Readings may leave out the fifth, so shells (G B F) and rootless-fifth
  // voicings are named. Keep only names UMT can parse back: '?' is the single unknown.
  let candidates: string[] = []
  candidates = tryUMT('chord detection', () =>
    (UMT.Harmony.detectChordsScored(noteNames.map(n => UMT.parseNote(n))) ?? []).map(c => normalizeChordName(c.name)).filter(isKnownChord), [])
  candidates = [...new Set(candidates)]
  const result: ChordResult = {
    kind: 'chord',
    notes: noteNames,
    candidates: candidates.length ? candidates : ['?'],
    selectedIndex: 0,
  }
  return result
}

/** Roman-numeral level analysis of one chord in a key — what the chips need. */
export interface RomanInfo {
  roman: string               // secondary dominants written as V7/x
  degree: string              // the plain degree: VII7 for G7 in A minor, where roman reads V7/III
  function: HarmonicAnalysis['function']
  isDiatonic: boolean
  isBorrowed: boolean
  borrowedFrom?: string
  isSecondary: boolean
  secondaryTarget?: string    // e.g. "V7/ii"
  degreeNumber?: number       // 1–7
  substitutionCandidate?: string
}

// History and song chips ask for the same (chord, key) pairs on every render.
const romanCache = new Map<string, RomanInfo | null>()

export function romanInKey(chordSymbol: string, key: string | null): RomanInfo | null {
  if (!key || !chordSymbol) return null
  const cacheKey = `${chordSymbol}|${key}`
  if (romanCache.has(cacheKey)) return romanCache.get(cacheKey)!
  const chord = tryParseChord(chordSymbol)
  const a = chord ? tryUMT('progression', () => UMT.Harmony.analyzeProgression([chord], key, WRITTEN).analysis[0], null) : null
  const info = a ? toRomanInfo(a) : null
  romanCache.set(cacheKey, info)
  return info
}

// Every symbol Modus passes is already written: MIDI detections are spelled in the key
// before they get here, chords picked by name keep their letters. So the numeral follows
// the letter given (Gb in C is bV, F# is #IV), never a respelling.
const WRITTEN = { spelling: 'written' } as const

function toRomanInfo(a: any): RomanInfo {
  return {
    roman: (a.isSecondary && a.secondaryTarget) ? a.secondaryTarget : (a.roman ?? '?'),
    degree: a.roman ?? '?',
    function: a.function ?? 'unknown',
    isDiatonic: a.isDiatonic ?? false,
    isBorrowed: a.isBorrowed ?? false,
    borrowedFrom: a.borrowedFrom,
    isSecondary: a.isSecondary ?? false,
    secondaryTarget: a.secondaryTarget,
    degreeNumber: a.degree,
    substitutionCandidate: a.substitutionCandidate,
  }
}

/** One chord of a progression, read in the key in force at that point. */
export interface ProgressionStep {
  key: string | null          // the local key: changes where UMT finds a modulation
  info: RomanInfo | null      // numeral and function in that key
  cadence: string | null      // to the next chord, read in the key of the chord it reaches
}

/**
 * A progression in playing order, as UMT reads it: modulations (three chords or more in
 * a new key; fewer is a tonicization), each chord's numeral in its local key, and the
 * cadence from each chord to the next; `style: 'blues'` reads I7, IV7 and V7 as the key's own. An unreadable symbol is left out of the reading
 * and gets no numeral; no cadence is read across it.
 */
export function analyzeChordProgression(chords: string[], key: string | null, style?: 'blues'): ProgressionStep[] {
  const none = (k: string | null) => chords.map(() => ({ key: k, info: null, cadence: null }))
  if (!key) return none(null)
  const parsed = chords.map(tryParseChord)
  const readable = parsed.flatMap((c, i) => c ? [i] : [])
  if (!readable.length) return none(key)
  const analysis = tryUMT<any[]>('progression',
    () => UMT.Harmony.analyzeProgression(readable.map(i => parsed[i]), key, { ...WRITTEN, style }).analysis, [])
  const steps: ProgressionStep[] = none(key)
  let local: string | null = key
  readable.forEach((orig, j) => {
    const a = analysis[j]
    if (!a) return
    local = normalizeKey(a.key) ?? local
    const nextIsNeighbour = readable[j + 1] === orig + 1
    steps[orig] = { key: local, info: toRomanInfo(a), cadence: nextIsNeighbour ? a.cadenceWithNext ?? null : null }
  })
  // An unreadable chord stays in the key around it
  steps.forEach((s, i) => { if (!s.info && i > 0) s.key = steps[i - 1].key })
  return steps
}

const pcName = (n: string) => n.replace(/-?\d+$/, '')

/** How the chord is laid out (UMT `analyzeVoicing`), in one line. Null for fewer than 3 notes. */
export function describeVoicing(noteNames: string[], chord: any): string | null {
  if (noteNames.length < 3) return null
  const v = tryUMT('voicing', () => UMT.analyzeVoicing(noteNames.map(n => UMT.parseNote(n)), chord), null)
  if (!v) return null
  const bass = v.inversion >= 0 && v.inversion <= 3
    ? t(`voicing.inversion${v.inversion as 0 | 1 | 2 | 3}`)
    : t('voicing.inBass', { degree: v.bassDegree ?? pcName(v.bass) })
  return [
    bass, t(`voicing.${v.position}`), v.drop,
    v.doubled.length ? t('voicing.doubled', { notes: v.doubled.join(' ') }) : null,
    v.omitted.length ? t('voicing.missing', { notes: v.omitted.join(' ') }) : null,
    v.added.length ? `+ ${v.added.map(pcName).join(' ')}` : null,
  ].filter(Boolean).join(' · ')
}

const pcOf = (name: string) => pitchClassOf(pcName(name))

/**
 * Upper-structure triads over a dominant (UMT `getUpperStructures`) whose three notes are
 * all sounding: what a pianist's right hand is playing over the left-hand shell.
 */
export function presentUpperStructures(noteNames: string[], chord: any): string[] {
  const sounding = new Set(noteNames.map(pcOf))
  const all = tryUMT('upper structures', () => UMT.getUpperStructures(chord), [] as ReturnType<typeof UMT.getUpperStructures>)
  return all.flatMap(u => {
    const triad = tryUMT('upper structures', () => u.triad.getNotes().map(n => n.name), [] as string[])
    return triad.length && triad.every(n => sounding.has(pcOf(n)))
      ? [`${u.label} (${chordLabel(u.triad.name)}: ${u.tensions.join(' ')})`] : []
  })
}

/**
 * The shortest chain of neo-Riemannian moves (P, L, R from UMT) from one triad to the
 * next, up to three. Null when either is not a major or minor triad, or nothing that short.
 */
export function neoRiemannianPath(from: any, to: any): string | null {
  const id = (c: any) => c ? `${((c.rootStep % 12) + 12) % 12}:${c.intervalsInSteps.join(',')}` : ''
  const target = id(to)
  const isTriad = (c: any) => !!tryUMT('neo-Riemannian', () => UMT.NeoRiemannian.P(c), null)
  if (!target || !isTriad(from) || !isTriad(to)) return null
  if (id(from) === target) return null
  let frontier: { chord: any; path: string }[] = [{ chord: from, path: '' }]
  for (let depth = 1; depth <= 3; depth++) {
    const next: typeof frontier = []
    for (const { chord, path } of frontier) for (const op of ['P', 'L', 'R'] as const) {
      const c = tryUMT('neo-Riemannian', () => UMT.NeoRiemannian[op](chord), null)
      if (!c) continue
      if (id(c) === target) return path + op
      next.push({ chord: c, path: path + op })
    }
    frontier = next
  }
  return null
}

/** Set class (Forte number, prime form, interval vector) and the scales that hold the notes. */
export function analyzeNoteSet(noteNames: string[], key: string | null, fromMelody = false): NoteSetAnalysis | null {
  const names = [...new Set(noteNames.map(pcName))]
  if (!names.length) return null
  const notes = names.map(n => tryUMT('notes', () => UMT.parseNote(n + '4'), null)).filter(Boolean)
  const pcs = tryUMT('set theory', () => UMT.SetTheory.getPitchClasses(notes), [] as number[])
  let forte: string | null = null
  if (pcs.length >= 3) {
    const number = tryUMT('set theory', () => UMT.SetTheory.getForteNumber(pcs), '')
    const prime = tryUMT('set theory', () => UMT.SetTheory.primeForm(pcs), [] as number[])
    const vector = tryUMT('set theory', () => UMT.SetTheory.intervalVector(pcs), [] as number[])
    // Prime forms past 9 use t and e, as in Forte's tables
    const digits = prime.map(p => p === 10 ? 't' : p === 11 ? 'e' : String(p)).join('')
    forte = [number, prime.length ? `[${digits}]` : '', vector.length ? `<${vector.join('')}>` : ''].filter(Boolean).join(' · ') || null
  }
  const tonic = key?.split(' ')[0]
  // The chromatic scale holds every set: it says nothing, so it is left out
  const fits = tryUMT('scales', () => UMT.findScalesForNotes(notes, { tonic, limit: 7 })
    .filter(s => s.notes.length < 12).slice(0, 6).map(s => scaleLabel(s.name)), [] as string[])
  return { notes: names, fromMelody, forte, fits }
}

export function buildHarmonicAnalysis(
  chordSymbol: string,
  activeKey: string | null,
  prevChordSymbol: string | null,
  noteNames: string[] = [],
  prevNotes: string[] | null = null
): HarmonicAnalysis {
  const chord = tryParseChord(chordSymbol)
  if (!chord) return emptyAnalysis(chordSymbol)
  const result = emptyAnalysis(chordSymbol)

  // Each field is optional: UMT throws for cases it does not support (e.g. non-12-TET).
  const bassNote = tryUMT('notes', () => chord.getNotes()[0] ?? null, null)
  if (bassNote) result.figuredBass = tryUMT('figured bass', () => UMT.FiguredBass.fromChord(chord, bassNote), '')
  result.suggestedScales = tryUMT('scales', () => UMT.Harmony.getSuggestedScales(chord).map(s => scaleLabel(s.scale)), [])
  result.voicing = describeVoicing(noteNames, chord)
  result.upperStructures = presentUpperStructures(noteNames, chord)

  const prevChord = tryParseChord(prevChordSymbol)
  if (prevChord) result.transformation = neoRiemannianPath(prevChord, chord)
  const vl = analyzeVoiceLeading(prevNotes, noteNames, activeKey, prevChordSymbol, chordSymbol)
  if (vl) { result.voiceLeading = describeVoiceLeading(vl); result.voiceRules = vl.issues; result.voiceRuleKeys = vl.issueKeys }

  if (!activeKey) return result

  const a = romanInKey(chordSymbol, activeKey)
  if (a) Object.assign(result, a)

  if (prevChord) {
    const cad = tryUMT('cadence', () => UMT.Harmony.analyzeCadence(prevChord, chord, activeKey), null)
    if (cad && cad !== 'No standard cadence') result.cadence = cad
  }

  const subs = tryUMT('substitutions', () => UMT.getSubstitutions(chord, activeKey) as any[], [])
  result.substitutions = subs.map((s: any) => {
    const name = chordLabel(s.chord?.name ?? s.name ?? String(s))
    return s.type ? `${name} (${substitutionTypeLabel(s.type)})` : name
  })
  result.substitutionTypes = [...new Set(subs.flatMap((s: any) => s.type ? [s.type as string] : []))]

  return result
}

function emptyAnalysis(chordName: string): HarmonicAnalysis {
  return {
    chordName, roman: '?', function: 'unknown',
    isDiatonic: false, isBorrowed: false, isSecondary: false,
    figuredBass: '', suggestedScales: [], substitutions: [],
    cadence: null, voicing: null, upperStructures: [], transformation: null,
    substitutionTypes: [], voiceLeading: null, voiceRules: null, voiceRuleKeys: [],
  }
}

export function getAutoKey(history: HistoryEntry[]): string | null {
  const noteNames = history.flatMap(e => e.notes)
  if (noteNames.length === 0) return null
  // Spelled as the key selector does ("Gb Major" → "F# Major").
  return normalizeKey(tryUMT('key detection', () => UMT.KeyDetection.detect(noteNames.map(n => UMT.parseNote(n)))[0]?.key ?? null, null))
}
