// Presentation mode, for teaching and recording: the detector alone, large, with no
// controls, over the whole window (and full screen when the browser allows it). It shows
// the elements the main page shows, drawn as the view windows draw them, and follows
// what is played: MIDI, audio and shortcuts keep working underneath.

import { renderView } from './viewer'
import type { ViewName, ViewState } from './channel'

let overlay: HTMLElement | null = null
let tiles: { view: ViewName; el: HTMLElement }[] = []
let last = ''
let onClose: () => void = () => {}

export function isPresenting(): boolean { return overlay !== null }

/**
 * Opens the presentation with the given elements (the chord name always comes first).
 * `close` is called however it ends: Esc, the × button, or leaving full screen.
 */
export function openPresentation(views: ViewName[], state: ViewState, close: () => void) {
  if (overlay) return
  onClose = close
  overlay = document.createElement('div')
  overlay.id = 'presentation'
  const diagrams = views.filter(v => v !== 'chord' && v !== 'piano')
  overlay.innerHTML = `
    <button class="presentation-close" title="Leave presentation (Esc)">×</button>
    <div class="pres-tile pres-chord view-chord" data-view="chord"></div>
    ${diagrams.length ? `<div class="pres-row">${diagrams.map(v => `<div class="pres-tile view-${v}" data-view="${v}"></div>`).join('')}</div>` : ''}
    ${views.includes('piano') ? '<div class="pres-tile pres-piano view-piano" data-view="piano"></div>' : ''}`
  document.body.appendChild(overlay)
  document.body.classList.add('presenting')
  tiles = Array.from(overlay.querySelectorAll<HTMLElement>('.pres-tile')).map(el => ({ view: el.dataset.view as ViewName, el }))
  overlay.querySelector('.presentation-close')!.addEventListener('click', closePresentation)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  // Full screen needs the click or key that opened it; refused, the overlay still fills the window.
  document.documentElement.requestFullscreen?.().catch(() => {})
  last = ''
  updatePresentation(state)
}

export function updatePresentation(state: ViewState) {
  if (!overlay) return
  const sig = JSON.stringify(state)
  if (sig === last) return
  last = sig
  for (const { view, el } of tiles) renderView(view, el, state)
}

export function closePresentation() {
  if (!overlay) return
  overlay.remove()
  overlay = null
  tiles = []
  document.body.classList.remove('presenting')
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  onClose()
}

// The browser's own Esc leaves full screen without a keydown reaching the page.
function onFullscreenChange() {
  if (!document.fullscreenElement) closePresentation()
}
