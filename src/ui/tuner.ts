// The Tuner panel: the microphone on or off, notes or chords, and the note heard now with
// how many cents it is off and its frequency. Drawn once; each frame only writes the values.

import { escapeHtml } from './html'
import { t, noteLabel } from '../i18n/i18n'
import { MIC_MODES, getMicMode, setMicMode, isMicOn, type Heard } from '../input/mic'
import { midiToNoteName } from '../theory/notes'

export interface TunerHandlers { toggle: () => void }

export function renderTuner(container: HTMLElement, handlers: TunerHandlers, error?: string) {
  const on = isMicOn()
  const mode = getMicMode()
  container.innerHTML = `
    <div class="tuner-head">
      <button id="tuner-mic" class="ctrl-btn${on ? ' active-mode' : ''}" title="${escapeHtml(t('mic.title'))}">🎤 ${escapeHtml(t(on ? 'mic.on' : 'mic.off'))}</button>
      ${MIC_MODES.map(m => `<button class="size-ctrl-btn tuner-mode${m === mode ? ' active' : ''}" data-mode="${m}" title="${escapeHtml(t(`mic.mode.${m}.title`))}">${escapeHtml(t(`mic.mode.${m}`))}</button>`).join('')}
    </div>
    <div class="tuner-note">—</div>
    <div class="tuner-meter"><span class="tuner-zero"></span><span class="tuner-needle"></span></div>
    <div class="tuner-detail">${escapeHtml(error ? t('mic.error', { error }) : on ? t('mic.listening') : t('mic.hint'))}</div>`
  container.querySelector('#tuner-mic')!.addEventListener('click', () => handlers.toggle())
  container.querySelectorAll<HTMLButtonElement>('.tuner-mode').forEach(b => b.addEventListener('click', () => {
    setMicMode(b.dataset.mode as typeof mode)
    renderTuner(container, handlers)
  }))
}

/** One frame of what the microphone hears. */
export function updateTuner(container: HTMLElement, heard: Heard | null) {
  const note = container.querySelector<HTMLElement>('.tuner-note')
  const needle = container.querySelector<HTMLElement>('.tuner-needle')
  const detail = container.querySelector<HTMLElement>('.tuner-detail')
  if (!note || !needle || !detail) return
  if (!heard) {
    note.textContent = '—'
    needle.style.left = '50%'
    needle.classList.remove('in-tune', 'off')
    if (isMicOn()) detail.textContent = t('mic.listening')
    return
  }
  const name = midiToNoteName(heard.midi)
  note.textContent = noteLabel(name)
  needle.style.left = `${50 + heard.cents}%`
  needle.classList.toggle('in-tune', Math.abs(heard.cents) <= 5)
  needle.classList.toggle('off', Math.abs(heard.cents) > 15)
  detail.textContent = `${heard.cents > 0 ? '+' : ''}${heard.cents} ¢ · ${heard.freq.toFixed(1)} Hz`
}
