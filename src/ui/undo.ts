// Destructive actions run at once and offer Undo for a few seconds instead of asking first.
// One toast at a time: a new action replaces the previous offer.

import { escapeHtml } from './html'
import { t } from '../i18n/i18n'

const UNDO_MS = 5000
let current: { el: HTMLElement; timer: number } | null = null

/** Withdraws the pending offer, e.g. when it no longer applies to what is on screen. */
export function dismiss() {
  if (!current) return
  clearTimeout(current.timer)
  current.el.remove()
  current = null
}

export function showUndo(message: string, undo: () => void) {
  dismiss()
  const el = document.createElement('div')
  el.className = 'undo-toast'
  el.innerHTML = `<span>${escapeHtml(message)}</span><button class="undo-btn">${escapeHtml(t('undo'))}</button>`
  el.querySelector('button')!.addEventListener('click', () => { dismiss(); undo() })
  document.body.appendChild(el)
  current = { el, timer: window.setTimeout(dismiss, UNDO_MS) }
}
