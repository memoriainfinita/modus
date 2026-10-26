// A view window: one element of the detector, alone, filling the window, on a chroma or
// dark background, for an OBS window capture. It plays nothing and takes no input: the
// main window sends what is on screen (view/channel.ts).

import { subscribeView, VIEW_BACKGROUNDS, VIEW_NAMES } from './channel'
import type { ViewName, ViewBackground, ViewState } from './channel'
import { renderStaff, STAFF_CLEFS } from '../diagrams/staff'
import { renderPiano } from '../diagrams/piano'
import { renderGuitar, setGuitarScaleContext } from '../diagrams/guitar'
import { renderCircleOfFifths, cofAccidentalFor } from '../diagrams/cof'
import type { CofOptions } from '../diagrams/cof'
import { functionColor } from '../theory/chord'
import { scaleInfo, scaleSymbol } from '../theory/scales'
import { escapeHtml } from '../ui/html'
import { fitSvg } from '../ui/fit'
import { loadBool, loadChoice } from '../ui/storage'
import { t, applyDocumentLang } from '../i18n/i18n'
import { applyTheme, color } from '../ui/theme'

function cofOptions(key: string | null): CofOptions {
  return {
    accidental: cofAccidentalFor(key, loadChoice('cof-accidental', ['flat', 'sharp'] as const, 'flat')),
    showMinor: loadBool('cof-show-minor', true),
    showDegrees: loadBool('cof-show-degrees', false),
    show7ths: loadBool('cof-show-7ths', false),
  }
}

function renderChordView(el: HTMLElement, s: ViewState) {
  if (!s.label) { el.innerHTML = ''; return }
  const fill = s.symbol ? functionColor(s.function, 'text-strong') : color('text-strong')
  const detail = s.kind === 'chord' && s.roman && s.roman !== '?'
    ? [s.roman, s.function && s.function !== 'unknown' ? t(`fn.${s.function}`) : null].filter(Boolean).join(' · ')
    : ''
  el.innerHTML = `
    <div class="view-chord-name" style="color:${fill}">${escapeHtml(s.label)}</div>
    ${detail ? `<div class="view-chord-detail">${escapeHtml(detail)}</div>` : ''}`
}

/** Draws one element of the detector filling `el`: view windows and presentation mode. */
export function renderView(view: ViewName, el: HTMLElement, s: ViewState) {
  if (view === 'chord') return renderChordView(el, s)
  if (view === 'staff') {
    // A short staff (clef, signature, chord). abcjs fixes the height of the element it
    // draws into, so it draws into an inner one that is then stretched.
    el.innerHTML = '<div></div>'
    const inner = el.firstElementChild as HTMLElement
    renderStaff(inner, s.notes, 200, s.key, 1, loadChoice('staff-clef', STAFF_CLEFS, 'grand'))
    inner.style.height = '100%'
    inner.style.width = '100%'
  }
  else if (view === 'cof') renderCircleOfFifths(el, s.key, s.symbol, () => {}, 400, { ...cofOptions(s.key), backdrop: color('bg') })
  else if (view === 'piano') {
    const scale = loadBool('piano-scale', false) && s.key ? scaleInfo(scaleSymbol(s.key, 'key')) : null
    renderPiano(el, s.notes, s.symbol ? s.function : null, undefined, null, scale)
  }
  else if (view === 'guitar') {
    setGuitarScaleContext(s.key, s.symbol ? s.function : null)
    renderGuitar(el, s.symbol, s.notes, s.guitarVoicing)
  }
  fitSvg(el.querySelector('svg'))
}

/** Reads `?view=` and `?bg=`; false when the page is not a view window. */
export function runViewerFromUrl(): boolean {
  const params = new URLSearchParams(location.search)
  const view = params.get('view') as ViewName | null
  if (!view || !VIEW_NAMES.includes(view)) return false
  const bg = (params.get('bg') ?? 'magenta') as ViewBackground
  const background = VIEW_BACKGROUNDS[bg] ?? VIEW_BACKGROUNDS.magenta

  // A stable title, in English whatever the language: OBS window capture finds the window by it.
  document.title = `Modus view: ${view}`
  applyDocumentLang()
  // Dark whatever the page's theme: the light text and its dark glow read on chroma and on the dark background
  applyTheme('dark')
  document.body.classList.add('view-mode')
  document.body.style.background = background
  document.getElementById('app')!.style.display = 'none'
  const el = document.createElement('div')
  el.id = 'view-content'
  el.className = `view-${view}`
  document.body.appendChild(el)

  subscribeView(s => renderView(view, el, s))
  // Guitar tuning, CoF options, the staff clef, language and note names live in localStorage: when
  // the main window changes them, the view reloads with them (songs are saved there too, and are ignored).
  window.addEventListener('storage', e => {
    if (e.key && /^(guitar-|cof-|staff-clef|piano-scale$|lang$|note-names$)/.test(e.key)) location.reload()
  })
  return true
}
