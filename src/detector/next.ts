// The Next panel: chords that usually follow the one on screen, each with why. Read from
// UMT only, three ways: where the chord itself resolves (a secondary dominant to its
// target), which of the key's chords it makes a cadence with, and what follows it in UMT's
// named progressions. Nothing here decides theory: a reading of UMT is put into words.

import type { HarmonicAnalysis } from '../types'
import type { StringKey } from '../i18n/en'
import { romanInKey } from './analyzer'
import { explainCadence } from './explain'
import { buildKeyMap, sameChord } from '../theory/key-map'
import { tryParseChord, tryUMT } from '../theory/chord'
import { isMinorProgression, PROGRESSION_IDS, realizeProgression, progressionKey, type ProgressionId } from '../ui/progressions'
import { isMinorKey } from '../theory/keys'
import { t, chordLabel, cadenceLabel } from '../i18n/i18n'
import { escapeHtml } from '../ui/html'

export interface NextSuggestion {
  symbol: string
  roman: string | null
  function: HarmonicAnalysis['function']
  /** The chord on screen resolves here: "A7 is V7/ii: it resolves to Dm7". */
  resolution: string | null
  /** The cadence the two chords make (UMT's name), with what it does. */
  cadence: { name: string; about: string | null } | null
  /** Named progressions where this chord follows the one on screen; two-chord matches first. */
  progressions: ProgressionId[]
}

/** The key's chords, triads or sevenths as the chord on screen, with the harmonic-minor V and vii° in minor. */
function keyChords(key: string, sevenths: boolean): string[] {
  const map = buildKeyMap(key, sevenths)
  return map ? map.diatonic.flatMap(c => c.alternative ? [c.symbol, c.alternative.symbol] : [c.symbol]) : []
}

/** The chord a secondary resolves to: the key's chord on that degree ("ii" in C: Dm, or Dm7). */
function resolutionTarget(target: string, key: string, sevenths: boolean): string | null {
  const map = buildKeyMap(key, sevenths)
  const plain = (r: string) => r.replace(/[°ø+7]|maj/g, '').toLowerCase()
  return map?.diatonic.find(c => plain(c.roman) === plain(target))?.symbol ?? null
}

/**
 * What usually follows `current` in `key`, `previous` being the chord before it (a named
 * progression where both match ranks first). Resolutions first, then cadences, then
 * progressions; a chord reached more than one way is listed once with every reason.
 * Only the progressions written in the key's mode are read: major ones in a major key; in a church mode, those of its third.
 */
export function suggestNext(current: string, key: string | null, previous: string | null = null): NextSuggestion[] {
  const chord = tryParseChord(current)
  if (!chord || !key) return []
  const sevenths = (chord.intervalsInSteps?.length ?? 0) >= 4
  const out: NextSuggestion[] = []
  const entry = (symbol: string): NextSuggestion | null => {
    if (sameChord(symbol, current)) return null
    let s = out.find(o => sameChord(o.symbol, symbol))
    if (!s) {
      const info = romanInKey(symbol, key)
      out.push(s = { symbol, roman: info?.roman ?? null, function: info?.function ?? 'unknown', resolution: null, cadence: null, progressions: [] })
    }
    return s
  }

  // 1. The chord's own resolution: a secondary to the chord it treats as a tonic
  const info = romanInKey(current, key)
  if (info?.isSecondary && info.secondaryTarget) {
    const target = info.secondaryTarget.split('/')[1]
    const to = target ? resolutionTarget(target, key, sevenths) : null
    const s = to ? entry(to) : null
    if (s) s.resolution = t('next.resolves', { chord: chordLabel(current), roman: info.secondaryTarget, target: chordLabel(s.symbol) })
  }

  // 2. The key's chords it makes a cadence with
  for (const symbol of keyChords(key, sevenths)) {
    const next = tryParseChord(symbol)
    const cad = next ? tryUMT('cadence', () => UMT.Harmony.analyzeCadence(chord, next, key), null) : null
    if (!cad || cad === 'No standard cadence') continue
    const s = entry(symbol)
    if (s) s.cadence = { name: cadenceLabel(cad), about: explainCadence(cad) }
  }

  // 3. The named progressions it is part of: the next different chord after it there
  // A minor third over the tonic (minor, dorian, phrygian, locrian) takes the minor progressions
  const minorKey = isMinorKey(key)
  const matches: { id: ProgressionId; symbol: string; length: number }[] = []
  for (const id of PROGRESSION_IDS) {
    if (isMinorProgression(id) !== minorKey) continue
    const chords = realizeProgression(id, progressionKey(id, key)).map(c => c.symbol)
    let best: { symbol: string; length: number } | null = null
    chords.forEach((c, i) => {
      if (!sameChord(c, current)) return
      const next = chords.slice(i + 1).find(n => !sameChord(n, current))
      if (!next) return
      const before = chords.slice(0, i).reverse().find(p => !sameChord(p, current))
      const length = previous && before && sameChord(before, previous) ? 2 : 1
      if (!best || length > best.length) best = { symbol: next, length }
    })
    const b = best as { symbol: string; length: number } | null
    if (b) matches.push({ id, ...b })
  }
  matches.sort((a, b) => b.length - a.length).forEach(m => entry(m.symbol)?.progressions.push(m.id))

  return out
}

/** The panel: one row per chord, its button in the function's colour, its numeral and why. */
export function renderNext(container: HTMLElement, current: string | null, key: string | null,
  items: NextSuggestion[], onPick: (symbol: string) => void) {
  if (!current || !items.length) {
    container.innerHTML = `<p class="next-empty">${escapeHtml(t(current && !key ? 'next.noKey' : current ? 'next.none' : 'next.empty'))}</p>`
    return
  }
  const progression = (id: ProgressionId) =>
    `<span class="next-reason" title="${escapeHtml(t(`prog.${id}.about` as StringKey))}">${escapeHtml(t(`prog.${id}` as StringKey))}</span>`
  container.innerHTML = `<ul class="next-list">${items.map(s => `
    <li class="next-row">
      <button type="button" class="key-chord key-fnb-${s.function}" data-chord="${escapeHtml(s.symbol)}"
        title="${escapeHtml(t('next.play', { chord: chordLabel(s.symbol) }))}">${escapeHtml(chordLabel(s.symbol))}</button>
      <span class="key-roman">${escapeHtml(s.roman ?? '—')}</span>
      <span class="next-why">
        ${s.resolution ? `<span>${escapeHtml(s.resolution)}</span>` : ''}
        ${s.cadence ? `<span class="next-reason"${s.cadence.about ? ` title="${escapeHtml(s.cadence.about)}"` : ''}>${escapeHtml(s.cadence.name)}</span>` : ''}
        ${s.progressions.length ? `<span>${escapeHtml(t('next.inProgressions'))} ${s.progressions.map(progression).join(', ')}</span>` : ''}
      </span>
    </li>`).join('')}</ul>`
  container.querySelectorAll<HTMLElement>('.key-chord').forEach(btn =>
    btn.addEventListener('click', () => onPick(btn.dataset.chord!)))
}
