import type { DetectionResult, HarmonicAnalysis, NoteSetAnalysis } from '../types'
import { chordColor } from '../theory/chord'
import { escapeHtml } from '../ui/html'

// ─── Field config ─────────────────────────────────────────────────────────────

export const ANALYSIS_FIELD_KEYS = ['roman','function','figbass','voicing','diatonic','scales','fits','cadence','plr','secondary','subs','upper','forte'] as const
export type AnalysisFieldKey = (typeof ANALYSIS_FIELD_KEYS)[number]

export const ANALYSIS_FIELD_LABELS: Record<AnalysisFieldKey, string> = {
  roman: 'Roman', function: 'Func', figbass: 'Fig', voicing: 'Voic', diatonic: 'Diat', scales: 'Scl', fits: 'Fits',
  cadence: 'Cad', plr: 'PLR', secondary: 'Sec', subs: 'Subs', upper: 'UST', forte: 'Set'
}

export const ANALYSIS_FIELD_TOOLTIPS: Record<AnalysisFieldKey, string> = {
  roman: 'Roman numeral', function: 'Harmonic function', figbass: 'Figured bass',
  voicing: 'Voicing: inversion, close / open, drop, doubled and missing notes',
  diatonic: 'Diatonic / borrowed', scales: 'Suggested scales for the chord',
  fits: 'Scales that contain every note on screen, or of the melody played note by note',
  cadence: 'Cadence', plr: 'Neo-Riemannian moves (P, L, R) from the previous triad',
  secondary: 'Secondary dominant', subs: 'Substitutions',
  upper: 'Upper-structure triads sounding over a dominant',
  forte: 'Set class: Forte number, prime form, interval vector'
}

// ─── Chord summary (private — called only by renderZone1Analysis) ─────────────

function renderChordSummary(
  detection: DetectionResult,
  onAltSelect: (index: number) => void
) {
  const el = document.getElementById('chord-summary')
  if (!el) return
  if (!detection || detection.kind !== 'chord') { el.innerHTML = ''; return }

  const chordName = escapeHtml(detection.candidates[detection.selectedIndex])
  const color = chordColor(chordName)
  const notes = detection.notes.map(n => n.replace(/(-?\d+)$/, '')).join(' · ')
  const alts = detection.candidates.slice(1, 7)

  el.innerHTML = `
    <div class="chord-summary-row">
      <span class="chord-name-badge" style="background:${color}22;border-left:3px solid ${color}">${chordName}</span>
      <span class="chord-notes">${notes}</span>
      ${alts.map((c, i) =>
        `<button class="alt-chord-btn alt-chord-sum" data-idx="${i + 1}">${escapeHtml(c)}</button>`
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
  const maybeRow = (f: AnalysisFieldKey, label: string, val: string) =>
    fieldsVisible[f] ? row(label, val) : ''
  const conditionalRow = (f: AnalysisFieldKey, label: string, val: string | null) =>
    fieldsVisible[f] ? row(label, val ?? '—') : ''

  let roman = '—', func_ = '—', figuredBass = '—', diatonic = '—', scales = '—', cadence = '—'
  let secondary: string | null = null, subs: string | null = null
  let voicing: string | null = null, plr: string | null = null, upper: string | null = null
  let extra = ''

  if (detection?.kind === 'note') {
    extra = row('Note', `${detection.noteName} · MIDI ${detection.midiNumber}`)
  } else if (detection?.kind === 'interval') {
    extra = row('Interval', `${detection.intervalName} · ${detection.semitones} st`) + row('Inversion', detection.inversionName)
  } else if (detection?.kind === 'chord' && analysis) {
    roman = analysis.roman
    func_ = ({ T: 'Tonic', S: 'Subdominant', D: 'Dominant', unknown: 'Unknown' } as Record<string, string>)[analysis.function]
    figuredBass = analysis.figuredBass || '—'
    diatonic = analysis.isDiatonic ? 'Yes' : analysis.isBorrowed ? `Borrowed (${analysis.borrowedFrom ?? '?'})` : 'Chromatic'
    scales = analysis.suggestedScales.slice(0, 4).join(', ') || '—'
    cadence = analysis.cadence || '—'
    // The Roman field already reads V7/x; this row names the tonicized degree.
    if (analysis.isSecondary) secondary = `→ ${analysis.secondaryTarget?.split('/')[1] ?? '?'}`
    if (analysis.substitutions?.length) subs = analysis.substitutions.join(', ')
    voicing = analysis.voicing
    plr = analysis.transformation
    if (analysis.upperStructures.length) upper = analysis.upperStructures.join(', ')
  }
  const fits = noteSet?.fits.length
    ? (noteSet.fromMelody ? `(${noteSet.notes.join(' ')}) ` : '') + noteSet.fits.slice(0, 4).join(', ')
    : null

  el.innerHTML =
    maybeRow('roman', 'Roman', roman) +
    maybeRow('function', 'Function', func_) +
    maybeRow('figbass', 'Fig. bass', figuredBass) +
    conditionalRow('voicing', 'Voicing', voicing) +
    maybeRow('diatonic', 'Diatonic', diatonic) +
    maybeRow('scales', 'Scales', scales) +
    conditionalRow('fits', 'Fits', fits) +
    maybeRow('cadence', 'Cadence', cadence) +
    conditionalRow('plr', 'P/L/R', plr) +
    conditionalRow('secondary', 'Secondary', secondary) +
    conditionalRow('subs', 'Subs.', subs) +
    conditionalRow('upper', 'Upper str.', upper) +
    conditionalRow('forte', 'Set class', noteSet?.forte ?? null) +
    extra
}
