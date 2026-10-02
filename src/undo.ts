// Destructive actions run at once and offer Undo for a few seconds instead of asking first.
// One toast at a time: a new action replaces the previous offer.

import { escapeHtml } from './html'

const UNDO_MS = 5000
let current: { el: HTMLElement; timer: number } | null = null

function dismiss() {
  if (!current) return
  clearTimeout(current.timer)
  current.el.remove()
  current = null
}

export function showUndo(message: string, undo: () => void) {
  dismiss()
  const el = document.createElement('div')
  el.className = 'undo-toast'
  el.innerHTML = `<span>${escapeHtml(message)}</span><button class="undo-btn">Undo</button>`
  el.querySelector('button')!.addEventListener('click', () => { dismiss(); undo() })
  document.body.appendChild(el)
  current = { el, timer: window.setTimeout(dismiss, UNDO_MS) }
}
