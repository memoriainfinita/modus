import type { DetectionResult, HarmonicAnalysis, NoteSetAnalysis } from '../types'
import { chordColor } from '../theory/chord'
import { escapeHtml } from '../ui/html'
import { t, noteLabel, chordLabel, cadenceLabel } from '../i18n/i18n'

// ─── Field config ─────────────────────────────────────────────────────────────

export const ANALYSIS_FIELD_KEYS = ['roman','function','figbass','voicing','diatonic','scales','fits','cadence','plr','voices','rules','secondary','subs','upper','forte'] as const
export type AnalysisFieldKey = (typeof ANALYSIS_FIELD_KEYS)[number]

/** The field's toggle button, its tooltip and its row label in the panel. */
export const fieldLabel = (f: AnalysisFieldKey) => t(`field.${f}`)
export const fieldTooltip = (f: AnalysisFieldKey) => t(`field.${f}.title`)
const rowLabel = (f: AnalysisFieldKey) => t(`field.${f}.row`)

// ─── Chord summary (private — called only by renderZone1Analysis) ─────────────

function renderChordSummary(
  detection: DetectionResult,
  onAltSelect: (index: number) => void
) {
  const el = document.getElementById('chord-summary')
  if (!el) return
  if (!detection || detection.kind !== 'chord') { el.innerHTML = ''; return }

  const symbol = detection.candidates[detection.selectedIndex]
  const chordName = escapeHtml(chordLabel(symbol))
  const color = chordColor(symbol)
  const notes = escapeHtml(detection.notes.map(n => noteLabel(n.replace(/(-?\d+)$/, ''))).join(' · '))
  const alts = detection.candidates.slice(1, 7)

  el.innerHTML = `
    <div class="chord-summary-row">
      <span class="chord-name-badge" style="background:${color}22;border-left:3px solid ${color}">${chordName}</span>
      <span class="chord-notes">${notes}</span>
      ${alts.map((c, i) =>
        `<button class="alt-chord-btn alt-chord-sum" data-idx="${i + 1}">${escapeHtml(chordLabel(c))}</button>`
      ).join('')}
    </div>`

  el.querySelectorAll<HTMLElement>('.alt-chord-sum').forEach(btn => {
    btn.addEventListener('click', () => onAltSelect(parseInt(btn.dataset.idx!)))
  })
}

// ─── Analysis panel ───────────────────────────────────────────────────────────

export function renderZone1Analysis(
  detection: DetectionResult,
  analysis: HarmonicAnalysis | null,
  noteSet: NoteSetAnalysis | null,
  fieldsVisible: Record<AnalysisFieldKey, boolean>,
  scale: number,
  onAltSelect: (index: number) => void
) {
  renderChordSummary(detection, onAltSelect)

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
  let voicing: string | null = null, plr: string | null = null, upper: string | null = null
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
    cadence = analysis.cadence ? cadenceLabel(analysis.cadence) : '—'
    // The Roman field already reads V7/x; this row names the tonicized degree.
    if (analysis.isSecondary) secondary = `→ ${analysis.secondaryTarget?.split('/')[1] ?? '?'}`
    if (analysis.substitutions?.length) subs = analysis.substitutions.join(', ')
    voicing = analysis.voicing
    plr = analysis.transformation
    voices = analysis.voiceLeading
    if (analysis.voiceRules) rules = analysis.voiceRules.length ? analysis.voiceRules.join(', ') : t('vl.none')
    if (analysis.upperStructures.length) upper = analysis.upperStructures.join(', ')
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
    fieldRow('forte', noteSet?.forte ?? null) +
    extra
}
