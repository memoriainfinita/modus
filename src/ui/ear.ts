// The Ear training panel: the app plays an interval, a chord or a cadence without showing
// it, the user names it, and the answer goes to the detector to be seen. Questions are
// drawn at random over every root; a score is kept per kind of question.

import { playNoteNames } from '../audio/audio'
import { chordNoteNames, tryUMT } from '../theory/chord'
import { noteNameToMidi, midiToNoteName } from '../theory/notes'
import { ALL_KEYS } from '../theory/keys'
import { loadChoice, loadJSON, save } from './storage'
import { escapeHtml } from './html'
import { getPref } from '../settings/prefs'
import { t, keyLabel, cadenceLabel } from '../i18n/i18n'
import type { StringKey } from '../i18n/en'

export const EAR_MODES = ['interval', 'chord', 'cadence'] as const
export type EarMode = typeof EAR_MODES[number]

/** What each mode asks: interval semitones, chord suffixes, cadences (the numerals that end the phrase). */
const INTERVALS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
const CHORDS = ['', 'm', 'dim', 'aug', 'sus4', '7', 'maj7', 'm7', 'm7b5', 'dim7']
const CADENCES: Record<string, { numerals: string; umt: string }> = {
  authentic: { numerals: 'V7 I', umt: 'Authentic Cadence (V -> I)' },
  plagal:    { numerals: 'IV I', umt: 'Plagal Cadence (IV -> I)' },
  deceptive: { numerals: 'V7 vi', umt: 'Deceptive Cadence (V -> vi)' },
  half:      { numerals: 'IV V', umt: 'Half Cadence (-> V)' },
}

export const EAR_ANSWERS: Record<EarMode, string[]> = {
  interval: INTERVALS, chord: CHORDS, cadence: Object.keys(CADENCES),
}

/** The answers asked: the chord kinds and cadences chosen in Settings (all, if none is). */
export function earAnswers(mode: EarMode): string[] {
  const chosen = mode === 'chord' ? getPref('ear-chords') : mode === 'cadence' ? getPref('ear-cadences') : null
  const list = chosen ? EAR_ANSWERS[mode].filter(a => chosen.includes(a)) : EAR_ANSWERS[mode]
  return list.length ? list : EAR_ANSWERS[mode]
}

/** One question: what is played (each step a set of notes sounding together), and what to show after. */
export interface EarQuestion {
  mode: EarMode
  answer: string
  steps: string[][]
  /** The chord to show once answered (cadences: the last, with the one before it); null for an interval. */
  symbol: string | null
  prev: string | null
  key: string | null
}

type Rng = () => number
const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length) % list.length]

const toMidi = (names: string[]) => names.map(noteNameToMidi).filter((m): m is number => m !== null)

/** A chord kept near middle C, its root doubled below: a cadence moves within one hand. */
function voiceNear(names: string[], rootPc: number): string[] {
  let midis = toMidi(names)
  if (!midis.length) return []
  while (Math.min(...midis) >= 67) midis = midis.map(m => m - 12)
  while (Math.min(...midis) < 55) midis = midis.map(m => m + 12)
  const bass = 36 + ((rootPc % 12) + 12) % 12
  return [bass, ...midis].map(midiToNoteName)
}

/** A random question of the kind asked; `rng` for tests. */
export function makeQuestion(mode: EarMode, rng: Rng = Math.random): EarQuestion {
  if (mode === 'interval') {
    const n = parseInt(pick(INTERVALS, rng))
    const low = 55 + Math.floor(rng() * 12)
    const [a, b] = [midiToNoteName(low), midiToNoteName(low + n)]
    // Up one note at a time, then both together
    const play = getPref('ear-interval-play')
    const steps = play === 'harmonic' ? [[a, b]] : play === 'down' ? [[b], [a], [a, b]] : [[a], [b], [a, b]]
    return { mode, answer: String(n), steps, symbol: null, prev: null, key: null }
  }
  if (mode === 'chord') {
    const suffix = pick(earAnswers('chord'), rng)
    const root = pick(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'], rng)
    const symbol = root + suffix
    return { mode, answer: suffix, steps: [chordNoteNames(symbol)], symbol, prev: null, key: null }
  }
  const answer = pick(earAnswers('cadence'), rng)
  const key = pick(ALL_KEYS.filter(k => k.endsWith('Major')), rng)
  // The tonic first, so the key is heard, then the two chords of the cadence
  const chords = tryUMT('roman numerals', () => UMT.parseRomanProgression(`I ${CADENCES[answer].numerals}`, key), [] as any[])
  const steps = chords.map(c => voiceNear(chordNoteNames(c.name), c.rootStep + 9))
  const symbols = chords.map(c => c.name as string)
  return { mode, answer, steps, symbol: symbols[2] ?? null, prev: symbols[1] ?? null, key }
}

/** An answer as the buttons write it. */
export function answerLabel(mode: EarMode, answer: string): string {
  if (mode === 'interval') return answer === '12' ? t('interval.octave') : t(`interval.${answer}` as StringKey)
  if (mode === 'chord') return t(`ear.chord.${answer || 'maj'}` as StringKey)
  return cadenceLabel(CADENCES[answer].umt, true)
}

const STEP_MS = { interval: 700, chord: 0, cadence: 1100 }

let timers: ReturnType<typeof setTimeout>[] = []
function playQuestion(q: EarQuestion) {
  timers.forEach(clearTimeout)
  timers = q.steps.map((notes, i) => setTimeout(() => playNoteNames(notes, q.mode === 'interval' && q.steps.length > 1 && i < 2 ? 0.8 : 1.6), i * STEP_MS[q.mode]))
}

type Score = Record<EarMode, { right: number; total: number }>
const emptyScore = (): Score => ({ interval: { right: 0, total: 0 }, chord: { right: 0, total: 0 }, cadence: { right: 0, total: 0 } })

export interface EarHandlers {
  /** Shows the answer in the detector: notes, and the chord (with the one before it for a cadence). */
  show: (q: EarQuestion) => void
}

let mode = loadChoice<EarMode>('ear-mode', EAR_MODES, 'chord')
let score: Score = { ...emptyScore(), ...loadJSON<Partial<Score>>('ear-score', {}) }
let question: EarQuestion | null = null

/** Every kind of question back to 0 / 0 (Settings › Practice). */
export function resetEarScore() {
  score = emptyScore()
  save('ear-score', score)
}
let answered = false

export function renderEar(container: HTMLElement, handlers: EarHandlers) {
  const tally = score[mode]
  container.innerHTML = `
    <div class="ear-head">
      <span class="strings-tabs" role="group" aria-label="${escapeHtml(t('ear.kind'))}">${EAR_MODES.map(m =>
        `<button type="button" class="strings-tab ear-mode" data-mode="${m}" aria-pressed="${m === mode}">${escapeHtml(t(`ear.mode.${m}`))}</button>`).join('')}</span>
      <span class="ear-score" title="${escapeHtml(t('ear.score.title'))}">${escapeHtml(t('ear.score', { right: tally.right, total: tally.total }))}</span>
    </div>
    <div class="ear-actions">
      <button id="ear-new" class="ear-new" title="${escapeHtml(t('ear.new.title'))}">${escapeHtml(t('ear.new'))}</button>
      <button id="ear-again" class="ctrl-btn ghost" title="${escapeHtml(t('ear.again.title'))}" aria-label="${escapeHtml(t('ear.again.title'))}"${question ? '' : ' disabled'}>↺</button>
    </div>
    <p class="ear-prompt">${escapeHtml(question ? t(`ear.ask.${mode}`) : t('ear.start'))}</p>
    <div class="ear-answers">
      ${earAnswers(mode).map(a => `<button class="ear-answer" data-answer="${escapeHtml(a)}"${question && !answered ? '' : ' disabled'}>${escapeHtml(answerLabel(mode, a))}</button>`).join('')}
    </div>
    <p class="ear-feedback" aria-live="polite"></p>`

  container.querySelectorAll<HTMLButtonElement>('.ear-mode').forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.mode as EarMode
    save('ear-mode', mode)
    question = null
    renderEar(container, handlers)
  }))
  container.querySelector('#ear-new')!.addEventListener('click', () => {
    question = makeQuestion(mode)
    answered = false
    renderEar(container, handlers)
    playQuestion(question)
  })
  container.querySelector('#ear-again')!.addEventListener('click', () => { if (question) playQuestion(question) })
  container.querySelectorAll<HTMLButtonElement>('.ear-answer').forEach(b => b.addEventListener('click', () => {
    if (!question || answered) return
    answered = true
    const given = b.dataset.answer!
    const right = given === question.answer
    score[mode].total++
    if (right) score[mode].right++
    save('ear-score', score)
    const q = question
    renderEar(container, handlers)
    const correct = answerLabel(q.mode, q.answer)
    const feedback = container.querySelector('.ear-feedback')!
    feedback.className = `ear-feedback ${right ? 'ear-right' : 'ear-wrong'}`
    const where = q.key ? ` · ${keyLabel(q.key)}` : ''
    feedback.textContent = (right ? t('ear.right', { answer: correct }) : t('ear.wrong', { answer: correct })) + where
    // The buttons were drawn again: found by their answer
    const button = (a: string) => container.querySelector(`.ear-answer[data-answer="${CSS.escape(a)}"]`)
    button(q.answer)?.classList.add('ear-correct')
    if (!right) button(given)?.classList.add('ear-missed')
    handlers.show(q)
  }))
}
