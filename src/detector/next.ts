// The Next panel: chords that usually follow the one on screen, each with why. Read from
// UMT only, three ways: where the chord itself resolves (a secondary dominant to its
// target), which of the key's chords it makes a cadence with, and what follows it in UMT's
// named progressions. Each suggestion also offers the key's usual borrowings UMT gives as
// its modal substitutes, and under the list come the substitutes of the chord on screen.
// Nothing here decides theory: a reading of UMT is put into words.

import type { HarmonicAnalysis } from '../types'
import type { StringKey } from '../i18n/en'
import { romanInKey } from './analyzer'
import { explainCadence, SUBSTITUTION_TYPES } from './explain'
import { buildKeyMap, sameChord } from '../theory/key-map'
import { tryParseChord, tryUMT } from '../theory/chord'
import { isMinorProgression, PROGRESSION_IDS, realizeProgression, progressionKey, type ProgressionId } from '../ui/progressions'
import { isMinorKey } from '../theory/keys'
import { t, chordLabel, cadenceLabel, scaleLabel, substitutionTypeLabel } from '../i18n/i18n'
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
  /** The key's usual borrowings that may stand for this chord (UMT's modal substitutes), with their mode. */
  borrowings: { symbol: string; mode: string; function: HarmonicAnalysis['function'] }[]
}

/** A chord that may stand for the one on screen, with UMT's type ('tritone', 'modal'…). */
export interface Substitute {
  symbol: string
  type: string | null
}

/** UMT's substitutes for a chord in a key, each once, never the chord itself. */
function substitutions(symbol: string, key: string): Substitute[] {
  const chord = tryParseChord(symbol)
  if (!chord) return []
  const out: Substitute[] = []
  for (const s of tryUMT<any[]>('substitutions', () => UMT.getSubstitutions(chord, key), [])) {
    const name: string | undefined = s.chord?.name ?? s.name
    if (!name || sameChord(name, symbol) || out.some(o => sameChord(o.symbol, name))) continue
    out.push({ symbol: name, type: s.type ?? null })
  }
  return out
}

/** What may be played in place of `current` in `key`: UMT's substitutes, in its order. */
export function substitutesFor(current: string, key: string | null): Substitute[] {
  return key ? substitutions(current, key) : []
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
      out.push(s = { symbol, roman: info?.roman ?? null, function: info?.function ?? 'unknown', resolution: null, cadence: null, progressions: [], borrowings: [] })
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

  // 4. The key's usual borrowings (UMT `common`) UMT gives as modal substitutes of each one
  const usual = (buildKeyMap(key, sevenths)?.parallel ?? [])
    .flatMap(row => row.chords.filter(c => c.common).map(c => ({ symbol: c.symbol, mode: row.mode, function: c.function })))
  for (const s of out) {
    for (const sub of substitutions(s.symbol, key)) {
      if (sub.type !== 'modal' || sameChord(sub.symbol, current)) continue
      const b = usual.find(u => sameChord(u.symbol, sub.symbol))
      if (b && !s.borrowings.some(o => sameChord(o.symbol, b.symbol))) s.borrowings.push(b)
    }
  }

  return out
}

/** The panel: one row per chord, its button in the function's colour, its numeral and why; then what may stand for the chord on screen. */
export function renderNext(container: HTMLElement, current: string | null, key: string | null,
  items: NextSuggestion[], onPick: (symbol: string, instead: boolean) => void, substitutes: Substitute[] = []) {
  if (!current || (!items.length && !substitutes.length)) {
    container.innerHTML = `<p class="next-empty">${escapeHtml(t(current && !key ? 'next.noKey' : current ? 'next.none' : 'next.empty'))}</p>`
    return
  }
  const progression = (id: ProgressionId) =>
    `<span class="next-reason" title="${escapeHtml(t(`prog.${id}.about` as StringKey))}">${escapeHtml(t(`prog.${id}` as StringKey))}</span>`
  // `instead`: played in place of the chord on screen, not after it
  const button = (symbol: string, fn: HarmonicAnalysis['function'], { alt = false, instead = false } = {}) =>
    `<button type="button" class="key-chord key-fnb-${fn}${alt ? ' next-alt' : ''}" data-chord="${escapeHtml(symbol)}"${instead ? ' data-instead="1"' : ''}
      title="${escapeHtml(t(instead ? 'next.playInstead' : 'next.play', { chord: chordLabel(symbol) }))}">${escapeHtml(chordLabel(symbol))}</button>`
  // "or Fm · Bb7 from aeolian": borrowings grouped by the mode they come from
  const borrowings = (s: NextSuggestion) => {
    const modes = [...new Set(s.borrowings.map(b => b.mode))]
    return modes.map(mode => `<span class="next-alts">${escapeHtml(t('next.or'))} ${s.borrowings.filter(b => b.mode === mode)
      .map(b => button(b.symbol, b.function, { alt: true })).join(' ')} ${escapeHtml(t('keyPanel.from', { mode: scaleLabel(mode) }))}</span>`).join('')
  }
  const list = items.length ? `<ul class="next-list">${items.map(s => `
    <li class="next-row">
      ${button(s.symbol, s.function)}
      <span class="key-roman">${escapeHtml(s.roman ?? '—')}</span>
      <span class="next-why">
        ${s.resolution ? `<span>${escapeHtml(s.resolution)}</span>` : ''}
        ${s.cadence ? `<span class="next-reason"${s.cadence.about ? ` title="${escapeHtml(s.cadence.about)}"` : ''}>${escapeHtml(s.cadence.name)}</span>` : ''}
        ${s.progressions.length ? `<span>${escapeHtml(t('next.inProgressions'))} ${s.progressions.map(progression).join(', ')}</span>` : ''}
        ${borrowings(s)}
      </span>
    </li>`).join('')}</ul>` : ''
  // What may be played in place of the chord on screen, each with its kind and what that means
  const subs = substitutes.length && key ? `
    <h3 class="next-heading">${escapeHtml(t('next.instead', { chord: chordLabel(current) }))}</h3>
    <ul class="next-list next-subs">${substitutes.map(s => {
      const info = romanInKey(s.symbol, key)
      const about = s.type && SUBSTITUTION_TYPES.includes(s.type) ? t(`ex.sub.${s.type}` as StringKey) : null
      return `
      <li class="next-row">
        ${button(s.symbol, info?.function ?? 'unknown', { instead: true })}
        <span class="key-roman">${escapeHtml(info?.roman ?? '—')}</span>
        <span class="next-why">${s.type ? `<span class="next-reason"${about ? ` title="${escapeHtml(about)}"` : ''}>${escapeHtml(substitutionTypeLabel(s.type))}</span>` : ''}</span>
      </li>`
    }).join('')}</ul>` : ''
  container.innerHTML = list + subs
  container.querySelectorAll<HTMLElement>('.key-chord').forEach(btn =>
    btn.addEventListener('click', () => onPick(btn.dataset.chord!, !!btn.dataset.instead)))
}
