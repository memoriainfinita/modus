// The Progressions panel: UMT's named progressions (ii-V-I, the blues, rhythm changes…)
// written in the key, bar by bar, with their numerals and cadences, and a sentence on what
// each one is. A chord plays and shows on a click; ▶ walks the whole progression.

import { analyzeChordProgression } from '../detector/analyzer'
import { normalizeKey } from '../theory/keys'
import { tryUMT } from '../theory/chord'
import { loadChoice, save } from './storage'
import { escapeHtml } from './html'
import { t, chordLabel, keyLabel, cadenceLabel } from '../i18n/i18n'
import { explainCadence } from '../detector/explain'
import { getPref } from '../settings/prefs'
import type { StringKey } from '../i18n/en'

export const PROGRESSION_IDS = [
  'ii-V-I', 'ii-V-i', 'turnaround-jazz', 'backdoor-ii-V', 'rhythm-changes', 'coltrane-changes', 'giant-steps-cycle',
  'blues-12', 'blues-minor', 'blues-jazz', 'bird-blues',
  'I-V-vi-IV', 'I-vi-IV-V', 'I-IV-V', 'pachelbel', 'andalusian',
] as const
export type ProgressionId = typeof PROGRESSION_IDS[number]

/** The progressions by kind, as the panel offers them: a kind, then its progressions. */
const GROUPS = {
  jazz: ['ii-V-I', 'ii-V-i', 'turnaround-jazz', 'backdoor-ii-V', 'rhythm-changes', 'coltrane-changes', 'giant-steps-cycle'],
  blues: ['blues-12', 'blues-minor', 'blues-jazz', 'bird-blues'],
  pop: ['I-V-vi-IV', 'I-vi-IV-V', 'I-IV-V', 'pachelbel', 'andalusian'],
} as const satisfies Record<string, readonly ProgressionId[]>
type Group = keyof typeof GROUPS
const groupOf = (id: ProgressionId) => (Object.keys(GROUPS) as Group[]).find(g => (GROUPS[g] as readonly string[]).includes(id))!

/** Progressions written in a minor key: in a major key they are played in its parallel minor. */
export const MINOR_PROGRESSIONS: readonly ProgressionId[] = ['ii-V-i', 'blues-minor', 'andalusian']

/** A bar of 4/4 at the tempo chosen in Settings (100 bpm: 2.4 s). */
const barMs = () => 4 * 60000 / getPref('progression-bpm')

/** Blues forms: their I7, IV7 and V7 are the key's own, not secondary dominants (UMT's blues style). */
const BLUES: readonly ProgressionId[] = ['blues-12', 'blues-jazz', 'bird-blues']

/** One chord of the progression as the panel lays it out. */
export interface ProgressionChord { symbol: string; bar: number; roman: string; fn: string; cadence: string | null; modulation: string | null }

/** The key a progression is written in: the one given, in the progression's mode; its own key; or C major / A minor. */
export function progressionKey(id: ProgressionId, key: string | null): string {
  const minor = MINOR_PROGRESSIONS.includes(id)
  if (key) {
    const root = key.split(' ')[0]
    return normalizeKey(`${root} ${minor ? 'Minor' : 'Major'}`) ?? key
  }
  const own = (UMT.PROGRESSIONS[id] as { defaultKey?: string } | undefined)?.defaultKey
  return normalizeKey(own) ?? (minor ? 'A Minor' : 'C Major')
}

/** The progression in a key, bar by bar, read as the history reads it (numerals, cadences, modulations). */
export function realizeProgression(id: ProgressionId, key: string): ProgressionChord[] {
  const entry = UMT.PROGRESSIONS[id]
  if (!entry) return []
  // A bar may hold two chords ("ii7 V7"); getProgression gives them in order
  const bars = entry.romanNumerals.flatMap((tokens, bar) => tokens.trim().split(/\s+/).map(() => bar))
  const chords = tryUMT('progressions', () => UMT.getProgression(id, key).map(c => c.name as string), [] as string[])
  if (chords.length !== bars.length) return []
  const steps = analyzeChordProgression(chords, key, BLUES.includes(id) ? 'blues' : undefined)
  return chords.map((symbol, i) => ({
    symbol, bar: bars[i],
    roman: steps[i].info?.roman ?? '—',
    fn: steps[i].info?.function ?? 'unknown',
    cadence: i > 0 ? steps[i - 1].cadence : null,
    modulation: i > 0 && steps[i].key && steps[i].key !== steps[i - 1].key ? steps[i].key : null,
  }))
}

const FUNCTION_COLORS: Record<string, string> = {
  T: 'var(--fn-t)', S: 'var(--fn-s)', D: 'var(--fn-d)', unknown: 'var(--text-dim)',
}

export interface ProgressionHandlers {
  /** Shows and plays a chord; the one before it, for the cadence and voice leading. */
  play: (symbol: string, prev: string | null, key: string) => void
}

let current = loadChoice<ProgressionId>('progression', PROGRESSION_IDS, 'ii-V-I')
let timer: ReturnType<typeof setTimeout> | null = null
let playing = -1

export function stopProgression() {
  if (timer) clearTimeout(timer)
  timer = null
  playing = -1
  document.querySelectorAll('.prog-chip.playing').forEach(c => c.classList.remove('playing'))
  const btn = document.getElementById('prog-play')
  if (btn) { btn.textContent = '▶'; btn.title = t('prog.play.title') }
}

export function renderProgressions(container: HTMLElement, analysisKey: string | null, handlers: ProgressionHandlers) {
  stopProgression()
  const key = progressionKey(current, analysisKey)
  const chords = realizeProgression(current, key)
  const group = groupOf(current)
  const groups = (Object.keys(GROUPS) as Group[]).map(g =>
    `<button type="button" class="mode-btn${g === group ? ' active-mode' : ''}" data-group="${g}">${escapeHtml(t(`prog.group.${g}`))}</button>`).join('')
  const picks = (GROUPS[group] as readonly ProgressionId[]).map(id =>
    `<button type="button" class="menu-chip" data-prog="${id}" aria-pressed="${id === current}">${escapeHtml(t(`prog.${id}` as StringKey))}</button>`).join('')

  let strip = ''
  chords.forEach((c, i) => {
    if (i > 0 && c.bar !== chords[i - 1].bar) strip += '<span class="prog-bar">|</span>'
    if (c.modulation) strip += `<span class="prog-modulation history-modulation" title="${escapeHtml(t('history.modulation', { key: keyLabel(c.modulation) }))}">→ ${escapeHtml(keyLabel(c.modulation))}</span>`
    if (c.cadence) {
      const title = `${cadenceLabel(c.cadence)}${explainCadence(c.cadence) ? `\n${explainCadence(c.cadence)}` : ''}`
      strip += `<span class="prog-cadence history-cadence" title="${escapeHtml(title)}">${escapeHtml(cadenceLabel(c.cadence, true))}</span>`
    }
    strip += `<button class="prog-chip" data-i="${i}" style="border-left:3px solid ${FUNCTION_COLORS[c.fn] ?? FUNCTION_COLORS.unknown}">
      <span class="prog-chip-symbol">${escapeHtml(chordLabel(c.symbol))}</span>
      <span class="prog-chip-roman">${escapeHtml(c.roman)}</span></button>`
  })

  container.innerHTML = `
    <div class="prog-head">
      <div class="seg" role="group" aria-label="${escapeHtml(t('prog.select.title'))}">${groups}</div>
      <div class="prog-picks" role="group" aria-label="${escapeHtml(t('prog.select.title'))}">${picks}</div>
      <button id="prog-play" class="ctrl-btn" title="${escapeHtml(t('prog.play.title'))}">▶</button>
      <span class="prog-key">${escapeHtml(keyLabel(key))}</span>
    </div>
    <p class="prog-about">${escapeHtml(t(`prog.${current}.about` as StringKey))}</p>
    <div class="prog-strip">${strip}</div>`

  // A kind shows its progressions and picks its first; a progression is picked by its chip
  const pick = (id: ProgressionId) => {
    current = id
    save('progression', current)
    renderProgressions(container, analysisKey, handlers)
  }
  container.querySelectorAll<HTMLElement>('[data-group]').forEach(b => b.addEventListener('click', () => {
    const g = b.dataset.group as Group
    if (g !== group) pick(GROUPS[g][0])
  }))
  container.querySelectorAll<HTMLElement>('[data-prog]').forEach(b => b.addEventListener('click', () => pick(b.dataset.prog as ProgressionId)))

  const chips = [...container.querySelectorAll<HTMLElement>('.prog-chip')]
  const mark = (i: number) => chips.forEach((c, j) => c.classList.toggle('playing', i === j))
  const show = (i: number) => { mark(i); handlers.play(chords[i].symbol, i > 0 ? chords[i - 1].symbol : null, key) }
  chips.forEach((chip, i) => chip.addEventListener('click', () => { stopProgression(); show(i) }))

  const playBtn = container.querySelector<HTMLButtonElement>('#prog-play')!
  playBtn.addEventListener('click', () => {
    if (playing >= 0) { stopProgression(); return }
    playBtn.textContent = '■'
    playBtn.title = t('prog.stop.title')
    const step = (i: number) => {
      if (i >= chords.length) { stopProgression(); return }
      playing = i
      show(i)
      // Two chords in a bar share it
      const inBar = chords.filter(c => c.bar === chords[i].bar).length
      timer = setTimeout(() => step(i + 1), barMs() / inBar)
    }
    step(0)
  })
}
