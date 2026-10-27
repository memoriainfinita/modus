// Presentation mode, for teaching and recording: the current layout with no toolbar, panel
// headers or controls, its rows stretched to fill the window (full screen when the browser
// allows it). The Class preset is made for it. MIDI, audio and shortcuts keep working.

import { currentGrid, onLayoutChange, refreshLayout } from '../ui/layout'
import { gridRows } from '../layout/grid'

let presenting = false
let onClose: () => void = () => {}

export function isPresenting(): boolean { return presenting }

/** Below this a row is too short to read: the layout is shown at its own sizes and scrolls.
 *  Class at 1280×720 gets 15 px rows and reads well; Standard at 1920×1080, 7 px. */
const MIN_ROW = 12

/**
 * The rows share the window's height when each still gets MIN_ROW. A taller layout (Standard
 * has some 64 rows, whose gaps alone take 630 px) keeps its own sizes and scrolls instead of
 * being squeezed past what the window shows.
 */
function fitRows() {
  const gridEl = document.getElementById('grid')
  if (!gridEl) return
  const scrolls = (on: boolean) => document.body.classList.toggle('presenting-scroll', on)
  if (!presenting) { gridEl.style.removeProperty('--row'); scrolls(false); return }
  const cs = getComputedStyle(gridEl)
  const rows = Math.max(1, gridRows(currentGrid()))
  const gap = parseFloat(cs.rowGap) || 0
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
  const row = (window.innerHeight - pad - gap * (rows - 1)) / rows
  scrolls(row < MIN_ROW)
  if (row < MIN_ROW) gridEl.style.removeProperty('--row')
  else gridEl.style.setProperty('--row', `${row}px`)
}

onLayoutChange(fitRows)
window.addEventListener('resize', fitRows)

/** `close` is called however it ends: Esc, the ⛶ button, or leaving full screen. */
export function openPresentation(close: () => void) {
  if (presenting) return
  presenting = true
  onClose = close
  document.body.classList.add('presenting')
  refreshLayout()   // the layout at its own sizes, not fitted to content
  fitRows()
  document.addEventListener('fullscreenchange', onFullscreenChange)
  // Full screen needs the click or key that opened it; refused, the page still fills the window.
  document.documentElement.requestFullscreen?.().then(fitRows, () => {})
}

export function closePresentation() {
  if (!presenting) return
  presenting = false
  document.body.classList.remove('presenting')
  refreshLayout()
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
