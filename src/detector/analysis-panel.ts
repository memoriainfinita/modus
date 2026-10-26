import type { DetectionResult, HarmonicAnalysis, NoteSetAnalysis, SlashReading } from '../types'
import { escapeHtml } from '../ui/html'
import { t, noteLabel, chordLabel, cadenceLabel } from '../i18n/i18n'

// ─── Field config ─────────────────────────────────────────────────────────────

export const ANALYSIS_FIELD_KEYS = ['roman','function','figbass','voicing','diatonic','scales','fits','cadence','plr','voices','rules','secondary','subs','upper','slash','movable','forte'] as const
export type AnalysisFieldKey = (typeof ANALYSIS_FIELD_KEYS)[number]

/** The field's toggle button, its tooltip and its row label in the panel. */
export const fieldLabel = (f: AnalysisFieldKey) => t(`field.${f}`)
export const fieldTooltip = (f: AnalysisFieldKey) => t(`field.${f}.title`)
const rowLabel = (f: AnalysisFieldKey) => t(`field.${f}.row`)

/** A slash reading in one line: "D over C · upper structure · 9 #11 13". */
export function slashText(s: SlashReading): string {
  const over = s.upper ? t('slash.over', { upper: chordLabel(s.upper), bass: noteLabel(s.bass) }) : t('slash.overBass', { bass: noteLabel(s.bass) })
  return [over, t(`slash.type.${s.type}`), s.tensions.join(' ')].filter(Boolean).join(' · ')
}

// ─── Chord header (private — called only by renderZone1Analysis) ──────────────

/** The field's label already says Cadence: its short name and its degrees, "Authentic (V → I)". */
function cadenceWithDegrees(cadence: string): string {
  const degrees = cadence.match(/\(([^)]*)\)/)?.[1]
  return degrees ? `${cadenceLabel(cadence, true)} (${degrees.replace(/->/g, '→')})` : cadenceLabel(cadence, true)
}

/** The chord the cadence is read from, for the header: "from G7 · V7". */
export interface ChordHeadContext {
  from: string | null
  fromRoman: string | null
  fromFunction: HarmonicAnalysis['function'] | null
}

const fnClass = (fn: string | null | undefined) => fn === 'T' || fn === 'S' || fn === 'D' ? ` fn-${fn}` : ''

// The chord as a header: its name large, its notes, its degree and function, the cadence
// from the chord before, and the other readings of the same notes
function renderChordSummary(
  detection: DetectionResult,
  analysis: HarmonicAnalysis | null,
  head: ChordHeadContext,
  onAltSelect: (index: number) => void
) {
  const el = document.getElementById('chord-summary')
  if (!el) return
  const notesOf = (names: string[]) => escapeHtml(names.map(n => noteLabel(n.replace(/(-?\d+)$/, ''))).join(' · '))
  if (!detection) { el.innerHTML = `<div class="chord-head chord-head-empty">${escapeHtml(t('head.empty'))}</div>`; return }
  if (detection.kind === 'note') {
    el.innerHTML = `<div class="chord-head"><span class="chord-head-name">${escapeHtml(noteLabel(detection.pitchClass))}</span><span class="chord-notes">${escapeHtml(noteLabel(detection.noteName))} · MIDI ${detection.midiNumber}</span></div>`
    return
  }
  if (detection.kind === 'interval') {
    el.innerHTML = `<div class="chord-head"><span class="chord-head-name">${escapeHtml(detection.intervalName)}</span><span class="chord-notes">${notesOf(detection.notes)}</span></div>`
    return
  }

  const symbol = detection.candidates[detection.selectedIndex]
  const alts = detection.candidates.slice(1, 7)
  const a = analysis && analysis.roman !== '?' ? analysis : null
  const degree = a ? `
    <span class="chord-head-group">
      <span class="chord-roman${fnClass(a.function)}">${escapeHtml(a.roman)}</span>
      ${a.function !== 'unknown' ? `<span class="fn-pill${fnClass(a.function)}">${escapeHtml(t(`fn.${a.function}`))}</span>` : ''}
    </span>` : ''
  const from = head.from && analysis ? `
    <span class="chord-head-group chord-head-from">
      <span class="chord-head-label">${escapeHtml(t('head.from'))}</span>
      <span class="chord-head-prev">${escapeHtml(chordLabel(head.from))}</span>
      ${head.fromRoman && head.fromRoman !== '?' ? `<span class="chord-head-prev-roman${fnClass(head.fromFunction)}">${escapeHtml(head.fromRoman)}</span>` : ''}
      ${analysis.cadence ? `<span class="cadence-pill">${escapeHtml(cadenceLabel(analysis.cadence, true))}</span>` : ''}
    </span>` : ''
  // Always the same three rows, so the header keeps its height from chord to chord
  const v = analysis?.voicingCard ?? null
  const cardRow = (label: string, value: string | null) =>
    `<span class="chord-card-label">${escapeHtml(label)}</span><span class="chord-card-value">${escapeHtml(value || '—')}</span>`
  const card = `
    <span class="chord-card">
      ${cardRow(t('head.position'), v?.position ?? null)}
      ${cardRow(t('head.layout'), v?.layout ?? null)}
      ${cardRow(t('head.degrees'), v?.degrees.join(' ') ?? null)}
    </span>`

  el.innerHTML = `
    <div class="chord-head chord-summary-row">
      <span class="chord-head-group chord-head-main">
        <span class="chord-name-badge">${escapeHtml(chordLabel(symbol))}</span>
        <span class="chord-notes">${notesOf(detection.notes)}</span>
      </span>
      ${card}
      ${degree}
      ${from}
      ${alts.length ? `<span class="chord-head-group chord-head-alts">
        <span class="chord-head-label">${escapeHtml(t('head.also'))}</span>
        ${alts.map((c, i) => `<button class="alt-chord-btn alt-chord-sum" data-idx="${i + 1}">${escapeHtml(chordLabel(c))}</button>`).join('')}
      </span>` : ''}
    </div>`

  el.querySelectorAll<HTMLElement>('.alt-chord-sum').forEach(btn => {
    btn.addEventListener('click', () => onAltSelect(parseInt(btn.dataset.idx!)))
  })
}

/**
 * The name never wider than its panel: its size follows the panel's height (CSS), which in a
 * tall narrow panel or full screen would carry a long name (C7#9b13) past the right edge.
 * Called after each chord and whenever the panel changes size.
 */
export function fitChordName() {
  const el = document.getElementById('chord-summary')
  const name = el?.querySelector<HTMLElement>('.chord-name-badge, .chord-head-name')
  if (!el || !name) return
  name.style.fontSize = ''
  const room = el.clientWidth
  const width = name.getBoundingClientRect().width
  if (room > 0 && width > room) name.style.fontSize = `${parseFloat(getComputedStyle(name).fontSize) * room / width * 0.97}px`
}

// ─── Analysis panel ───────────────────────────────────────────────────────────

export function renderZone1Analysis(
  detection: DetectionResult,
  analysis: HarmonicAnalysis | null,
  noteSet: NoteSetAnalysis | null,
  fieldsVisible: Record<AnalysisFieldKey, boolean>,
  scale: number,
  onAltSelect: (index: number) => void,
  head: ChordHeadContext = { from: null, fromRoman: null, fromFunction: null }
) {
  renderChordSummary(detection, analysis, head, onAltSelect)
  fitChordName()

  const el = document.getElementById('analysis-content')
  if (!el) return

  el.style.fontSize = scale + 'px'
  const visibleCount = ANALYSIS_FIELD_KEYS.filter(f => fieldsVisible[f]).length
  // A floor, so the panel does not jump between a note and a chord; long values (Fits) wrap and grow it
  el.style.minHeight = Math.ceil((visibleCount * 1.6 - 0.4) * scale) + 'px'
  const colEl = document.getElementById('col-analysis')
  if (colEl) { const w = Math.round(scale * 19) + 'px'; colEl.style.width = w; colEl.style.flex = `0 0 ${w}` }

  const row = (label: string, val: string) =>
    `<div class="analysis-row">
      <span class="analysis-label">${label}</span>
      <span class="analysis-value">${escapeHtml(val)}</span>
    </div>`
  const fieldRow = (f: AnalysisFieldKey, val: string | null) =>
    fieldsVisible[f] ? row(rowLabel(f), val ?? '—') : ''

  let roman = '—', func_ = '—', figuredBass = '—', diatonic = '—', scales = '—', cadence = '—'
  let secondary: string | null = null, subs: string | null = null
  let voicing: string | null = null, plr: string | null = null, upper: string | null = null, slash: string | null = null
  let voices: string | null = null, rules: string | null = null
  let extra = ''

  if (detection?.kind === 'note') {
    extra = row(t('analysis.note'), `${noteLabel(detection.noteName)} · MIDI ${detection.midiNumber}`)
  } else if (detection?.kind === 'interval') {
    extra = row(t('analysis.interval'), `${detection.intervalName} · ${t('analysis.semitones', { n: detection.semitones })}`) + row(t('analysis.inversion'), detection.inversionName)
  } else if (detection?.kind === 'chord' && analysis) {
    roman = analysis.roman
    func_ = t(`fn.${analysis.function}`)
    figuredBass = analysis.figuredBass || '—'
    diatonic = analysis.isDiatonic ? t('analysis.yes') : analysis.isBorrowed ? t('analysis.borrowed', { mode: analysis.borrowedFrom ?? '?' }) : t('analysis.chromatic')
    scales = analysis.suggestedScales.slice(0, 4).join(', ') || '—'
    cadence = analysis.cadence ? cadenceWithDegrees(analysis.cadence) : '—'
    // The Roman field already reads V7/x; this row names the tonicized degree.
    if (analysis.isSecondary) secondary = `→ ${analysis.secondaryTarget?.split('/')[1] ?? '?'}`
    if (analysis.substitutions?.length) subs = analysis.substitutions.join(', ')
    voicing = analysis.voicing
    plr = analysis.transformation
    voices = analysis.voiceLeading
    if (analysis.voiceRules) rules = analysis.voiceRules.length ? analysis.voiceRules.join('\n') : t('vl.none')
    if (analysis.upperStructures.length) upper = analysis.upperStructures.join(', ')
    if (analysis.slash) slash = slashText(analysis.slash)
  }
  const fits = noteSet?.fits.length
    ? (noteSet.fromMelody ? `(${noteSet.notes.map(noteLabel).join(' ')}) ` : '') + noteSet.fits.slice(0, 4).join(', ')
    : null

  el.innerHTML =
    fieldRow('roman', roman) +
    fieldRow('function', func_) +
    fieldRow('figbass', figuredBass) +
    fieldRow('voicing', voicing) +
    fieldRow('diatonic', diatonic) +
    fieldRow('scales', scales) +
    fieldRow('fits', fits) +
    fieldRow('cadence', cadence) +
    fieldRow('plr', plr) +
    fieldRow('voices', voices) +
    fieldRow('rules', rules) +
    fieldRow('secondary', secondary) +
    fieldRow('subs', subs) +
    fieldRow('upper', upper) +
    fieldRow('slash', slash) +
    fieldRow('movable', noteSet?.syllables?.length ? noteSet.syllables.join(' ') : null) +
    fieldRow('forte', noteSet?.forte ?? null) +
    extra
}
