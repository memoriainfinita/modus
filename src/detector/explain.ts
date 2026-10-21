// The Explanation panel: what each term the analysis shows means, said of the chord on
// screen in its key ("D7 is V7/V: the dominant of G…"). Built from the same analysis the
// panel shows, plus the raw UMT readings it keeps (cadence, borrowed mode, substitution
// types, voice-leading rules); nothing here decides theory, it only puts it into words.

import type { DetectionResult, HarmonicAnalysis } from '../types'
import type { StringKey } from '../i18n/en'
import { t, chordLabel, keyLabel, noteLabel, scaleLabel, cadenceLabel, substitutionTypeLabel } from '../i18n/i18n'
import { chordNoteNames, tryParseChord, tryUMT } from '../theory/chord'
import { pitchClassOf } from '../theory/notes'
import { buildKeyMap } from '../theory/key-map'
import { movableSyllable } from '../theory/solfege'
import { hasLeadingTone } from '../theory/keys'
import { escapeHtml } from '../ui/html'
import { getPref } from '../settings/prefs'

/** One term and what it means here. */
export interface Explanation { term: string; text: string }

type Degree = 1 | 2 | 3 | 4 | 5 | 6 | 7
const nth = (n: number) => t(`ex.nth.${n as Degree}`)

const pc = (name: string) => pitchClassOf(name.replace(/-?\d+$/, ''))

/** The chord's notes that are not in the key's scale (natural minor in a minor key). */
function notesOutside(symbol: string, key: string): string[] {
  const scale = new Set(tryUMT('scale', () => UMT.parseScaleSymbol(key).getNotes().slice(0, 7).map(n => pc(n.name)), [] as number[]))
  return chordNoteNames(symbol).filter(n => !scale.has(pc(n))).map(n => noteLabel(n.replace(/-?\d+$/, '')))
}

function romanEntry(symbol: string, key: string, a: HarmonicAnalysis): Explanation | null {
  const roman = a.degree ?? a.roman
  const n = a.degreeNumber
  if (!roman || roman === '?' || !n || n < 1 || n > 7) return null
  const vars = { chord: chordLabel(symbol), roman, key: keyLabel(key), nth: nth(n) }
  // The root in movable do, when asked for: a chromatic root has its own syllable too (♭VII is te)
  const withDo = (text: string) => ({ term: roman, text: getPref('movable-do') ? `${text} ${movableDo(symbol, key)}` : text })
  const acc = roman.match(/^([b#♭♯])/)?.[1]
  if (acc) {
    const flat = acc === 'b' || acc === '♭'
    return withDo(t('ex.romanAltered', { ...vars, dir: t(flat ? 'ex.lowered' : 'ex.raised'), acc: flat ? '♭' : '♯', n }))
  }
  // The 7th degree a whole step under the tonic is the subtonic (minor, dorian, mixolydian…); a semitone, the leading tone
  const subtonic = n === 7 && !hasLeadingTone(key) && /^VII/.test(roman)
  const name = subtonic ? t('ex.deg.subtonic') : t(`ex.deg.${n as Degree}`)
  return withDo(t('ex.roman', { ...vars, name }))
}

/** The root in movable do (the tonic is do; minor is la-based; a chromatic root has its own syllable). */
function movableDo(symbol: string, key: string): string {
  const root = symbol.match(/^[A-G][#b]*/)?.[0]
  const syllable = root ? movableSyllable(root, key) : null
  return syllable ? t('ex.movableDo', { syllable }) : ''
}

/** The tonicized chord of a secondary reading: "V7/V" in C → G. */
function secondaryTarget(target: string, key: string): string | null {
  const map = buildKeyMap(key, false)
  const plain = (r: string) => r.replace(/[°ø+7]/g, '').toLowerCase()
  return map?.diatonic.find(c => plain(c.roman) === plain(target))?.symbol ?? null
}

function colourEntries(symbol: string, key: string, a: HarmonicAnalysis): Explanation[] {
  const chord = chordLabel(symbol)
  const k = keyLabel(key)
  if (a.isSecondary && a.secondaryTarget) {
    const [kind, target] = a.secondaryTarget.split('/')
    const targetChord = target ? secondaryTarget(target, key) : null
    const vars = { chord, roman: a.secondaryTarget, target: targetChord ? chordLabel(targetChord) : target, targetRoman: target }
    return [{ term: a.secondaryTarget, text: t(kind.startsWith('vii') ? 'ex.secondaryVii' : 'ex.secondaryV', vars) }]
  }
  if (a.isDiatonic) return [{ term: t('ex.term.diatonic'), text: t('ex.diatonic', { chord, key: k }) }]
  const notes = notesOutside(symbol, key).join(' ')
  if (a.isBorrowed && a.borrowedFrom) {
    const mode = scaleLabel(`${key.split(' ')[0]} ${a.borrowedFrom}`)
    return [{ term: t('analysis.borrowed', { mode: a.borrowedFrom }), text: t('ex.borrowed', { chord, mode, key: k, notes }) }]
  }
  if (a.substitutionCandidate?.startsWith('tritone')) return [{ term: substitutionTypeLabel('tritone'), text: t('ex.tritoneSub', { chord }) }]
  return [{ term: t('analysis.chromatic'), text: t('ex.chromatic', { chord, key: k, notes }) }]
}

// UMT's cadence names, by how they start
const CADENCES: [string, string][] = [
  ['Authentic', 'authentic'], ['Minor Plagal', 'minorPlagal'], ['Plagal', 'plagal'], ['Deceptive', 'deceptive'],
  ['Phrygian Half', 'phrygianHalf'], ['Phrygian', 'phrygian'], ['Backdoor', 'backdoor'], ['Half', 'half'], ['Picardy', 'picardy'],
]

/** What a cadence UMT names is ("Authentic Cadence (V -> I)"); null for one it does not explain. */
export function explainCadence(cadence: string): string | null {
  const k = CADENCES.find(([start]) => cadence.startsWith(start))?.[1]
  return k ? t(`ex.cad.${k}` as StringKey) : null
}

const FIGURES: Record<string, StringKey> = {
  '': 'ex.fig.root', '5/3': 'ex.fig.root', '6': 'ex.fig.6', '6/3': 'ex.fig.6', '6/4': 'ex.fig.64',
  '7': 'ex.fig.7', '6/5': 'ex.fig.65', '4/3': 'ex.fig.43', '4/2': 'ex.fig.42', '2': 'ex.fig.42',
}

function voicingEntries(noteNames: string[], symbol: string): Explanation[] {
  if (noteNames.length < 3) return []
  const chord = tryParseChord(symbol)
  const v = tryUMT('voicing', () => UMT.analyzeVoicing(noteNames.map(n => UMT.parseNote(n)), chord), null)
  if (!v) return []
  const out: Explanation[] = [{ term: t('ex.term.voicing', { v: t(`voicing.${v.position}`) }), text: t(`ex.voicing.${v.position}`) }]
  if (v.drop) out.push({ term: v.drop, text: t('ex.voicing.drop') })
  return out
}

const PLR_EXAMPLES = { P: ['C', 'Cm'], R: ['C', 'Am'], L: ['C', 'Em'] } as const
const SUBSTITUTION_TYPES = ['tritone', 'diatonic', 'deceptive', 'chromatic-mediant', 'sus4', 'modal']

/** Every term of the analysis of what is on screen, explained. */
export function explainDetection(detection: DetectionResult, a: HarmonicAnalysis | null, key: string | null, prevSymbol: string | null): Explanation[] {
  if (detection?.kind === 'interval') {
    return [{ term: detection.intervalName, text: t('ex.interval', { n: detection.semitones % 12 || 12, inv: detection.inversionName }) }]
  }
  if (detection?.kind !== 'chord' || !a) return []
  const symbol = detection.candidates[detection.selectedIndex]
  const out: Explanation[] = []
  if (key) {
    const roman = romanEntry(symbol, key, a)
    if (roman) out.push(roman, { term: t('ex.case.term'), text: t('ex.case') })
    if (a.function !== 'unknown') out.push({ term: t(`fn.${a.function}`), text: t(`ex.fn.${a.function}`) })
    out.push(...colourEntries(symbol, key, a))
  }
  const fig = FIGURES[a.figuredBass ?? '']
  if (fig) out.push({ term: t('ex.term.figbass', { fig: a.figuredBass || '5/3' }), text: `${t(fig)} ${t('ex.fig.intro')}` })
  out.push(...voicingEntries(detection.notes, symbol))
  if (a.cadence) {
    const text = explainCadence(a.cadence)
    if (text) out.push({ term: cadenceLabel(a.cadence), text })
  }
  if (a.transformation && prevSymbol) {
    out.push({ term: a.transformation, text: t('ex.plr', { chord: chordLabel(symbol), prev: chordLabel(prevSymbol), path: a.transformation }) })
    for (const op of new Set(a.transformation.split('')) as Set<'P' | 'L' | 'R'>) {
      const [x, y] = PLR_EXAMPLES[op]
      out.push({ term: op, text: t(`ex.plr.${op}`, { a: chordLabel(x), b: chordLabel(y) }) })
    }
  }
  for (const type of a.substitutionTypes) {
    if (SUBSTITUTION_TYPES.includes(type)) out.push({ term: substitutionTypeLabel(type), text: t(`ex.sub.${type}` as StringKey) })
  }
  if (a.upperStructures.length) out.push({ term: a.upperStructures.join(', '), text: t('ex.upper') })
  if (a.slash) {
    const s = a.slash
    const vars = { upper: s.upper ? chordLabel(s.upper) : '', bass: noteLabel(s.bass), tensions: s.tensions.join(' ') }
    out.push({ term: t(`slash.type.${s.type}`), text: t(`ex.slash.${s.type}`, vars) })
  }
  // The rule's name, without the voices it names in the Rules row
  for (const k of a.voiceRuleKeys) out.push({ term: t(`vl.issue.${k}` as StringKey, { voices: '' }).replace(/\s*\(\)$/, ''), text: t(`ex.vl.${k}` as StringKey) })
  return out
}

export function renderExplanation(container: HTMLElement, items: Explanation[]) {
  container.innerHTML = items.length
    ? `<dl class="explain-list">${items.map(i => `<dt>${escapeHtml(i.term)}</dt><dd>${escapeHtml(i.text)}</dd>`).join('')}</dl>`
    : `<p class="explain-empty">${escapeHtml(t('ex.empty'))}</p>`
}
