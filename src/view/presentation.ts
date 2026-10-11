// Presentation mode, for teaching and recording: the current layout with no toolbar, panel
// headers or controls, its rows stretched to fill the window (full screen when the browser
// allows it). The Class preset is made for it. MIDI, audio and shortcuts keep working.

import { currentGrid, onLayoutChange } from '../ui/layout'
import { gridRows } from '../layout/grid'

let presenting = false
let onClose: () => void = () => {}

export function isPresenting(): boolean { return presenting }

/** The rows share the window's height, whatever the layout. */
function fitRows() {
  const gridEl = document.getElementById('grid')
  if (!gridEl) return
  if (!presenting) { gridEl.style.removeProperty('--row'); return }
  const cs = getComputedStyle(gridEl)
  const rows = Math.max(1, gridRows(currentGrid()))
  const gap = parseFloat(cs.rowGap) || 0
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
  gridEl.style.setProperty('--row', `${Math.max(4, (window.innerHeight - pad - gap * (rows - 1)) / rows)}px`)
}

onLayoutChange(fitRows)
window.addEventListener('resize', fitRows)

/** `close` is called however it ends: Esc, the ⛶ button, or leaving full screen. */
export function openPresentation(close: () => void) {
  if (presenting) return
  presenting = true
  onClose = close
  document.body.classList.add('presenting')
  fitRows()
  document.addEventListener('fullscreenchange', onFullscreenChange)
  // Full screen needs the click or key that opened it; refused, the page still fills the window.
  document.documentElement.requestFullscreen?.().then(fitRows, () => {})
}

export function closePresentation() {
  if (!presenting) return
  presenting = false
  document.body.classList.remove('presenting')
  fitRows()
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  onClose()
}

// The browser's own Esc leaves full screen without a keydown reaching the page.
function onFullscreenChange() {
  if (!document.fullscreenElement) closePresentation()
  else fitRows()
}
