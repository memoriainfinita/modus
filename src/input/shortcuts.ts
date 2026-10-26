import { t } from '../i18n/i18n'
import type { StringKey } from '../i18n/en'
import { escapeHtml } from '../ui/html'
import { keyBelongsToControl } from '../ui/a11y'
import { ACTIONS, actionFor, keyName, keysOf } from './bindings'
import { openSettings, keyLabel } from '../ui/settings'
import { startTour } from '../ui/tour'
import { MODULE_IDS } from '../layout/presets'

// Keys that are always the same: Esc, the readings, Tab, the keys on a panel title and on the circle
const FIXED_KEYS: [string, StringKey][] = [
  ['kbd.esc', 'shortcut.escape'], ['1–9', 'shortcut.candidate'], ['Tab', 'shortcut.tab'], ['kbd.panelArrows', 'shortcut.panelArrows'],
  ['kbd.panelKeys', 'shortcut.panelKeys'], ['kbd.cofArrows', 'shortcut.cofArrows'],
]

// What the mouse does that no label says.
const GESTURES: StringKey[] = [
  'gesture.click', 'gesture.doubleClick', 'gesture.logged', 'gesture.drag', 'gesture.fill', 'gesture.remove', 'gesture.piano', 'gesture.layout',
]
// The same on a touch screen: no hover, no right click, no dragging of panels.
const TOUCH_GESTURES: StringKey[] = [
  'gesture.touch.tap', 'gesture.touch.doubleTap', 'gesture.logged', 'gesture.touch.song', 'gesture.fill', 'gesture.touch.remove', 'gesture.touch.piano', 'gesture.touch.layout',
]

// No API says whether a keyboard is attached: a fine pointer (mouse, trackpad) is taken to
// come with one; a finger alone (a phone, a tablet without its keyboard) is not.
const hasKeyboard = () => matchMedia('(any-pointer: fine)').matches
const hasTouch = () => matchMedia('(any-pointer: coarse)').matches

let helpVisible = false
let returnFocus: HTMLElement | null = null

export function closeHelp(): boolean {
  if (!helpVisible) return false
  helpVisible = false
  document.getElementById('shortcut-help')?.remove()
  returnFocus?.focus()
  returnFocus = null
  document.removeEventListener('mousedown', closeHelpOnOutsideClick)
  return true
}

export function toggleHelp() {
  if (helpVisible) { closeHelp(); return }
  helpVisible = true
  const popup = document.createElement('div')
  popup.id = 'shortcut-help'
  popup.className = 'shortcut-help-popup'
  popup.setAttribute('role', 'dialog')
  popup.setAttribute('aria-label', t('help.heading'))
  returnFocus = document.activeElement as HTMLElement | null
  const keyboard = hasKeyboard()
  // Touch first on a touch screen; the keys and the mouse only where there is a keyboard
  const touch = hasTouch() ? `
    <div class="shortcut-section">${t('help.touch')}</div>
    ${TOUCH_GESTURES.map(g => `<div class="gesture-row">${escapeHtml(t(g))}</div>`).join('')}` : ''
  popup.innerHTML = `
    <div class="shortcut-help-header">
      <span>${t('help.heading')}</span>
      <button class="shortcut-help-close" aria-label="${t('help.close')}">×</button>
    </div>
    ${keyboard ? '' : touch}
    ${keyboard ? `
    <div class="shortcut-section">${t('help.keys')}</div>
    ${ACTIONS.map(a => `
      <div class="shortcut-row">
        <kbd class="shortcut-key">${escapeHtml(keysOf(a).map(keyLabel).join(' ') || '—')}</kbd>
        <span class="shortcut-action">${escapeHtml(t(`action.${a}` as StringKey))}</span>
      </div>`).join('')}
    ${FIXED_KEYS.map(([k, action]) => `
      <div class="shortcut-row">
        <kbd class="shortcut-key">${escapeHtml(k.startsWith('kbd.') ? t(k as StringKey) : k)}</kbd>
        <span class="shortcut-action">${escapeHtml(t(action))}</span>
      </div>`).join('')}
    <div class="help-setting"><button id="help-keys" class="ctrl-btn">${escapeHtml(t('help.changeKeys'))}</button></div>
    <div class="shortcut-section">${t('help.mouse')}</div>
    ${GESTURES.map(g => `<div class="gesture-row">${escapeHtml(t(g))}</div>`).join('')}
    ${touch}` : ''}
    <div class="shortcut-section">${t('help.panels')}</div>
    ${MODULE_IDS.map(id => `<div class="gesture-row"><b>${escapeHtml(t(`module.${id}`))}</b> — ${escapeHtml(t(`help.panel.${id}`))}</div>`).join('')}
    <div class="help-setting"><button id="help-tour" class="ctrl-btn" title="${escapeHtml(t('tour.start.title'))}">${escapeHtml(t('tour.start'))}</button></div>`
  document.body.appendChild(popup)
  // A modal dialog: the focus goes into it and Tab stays in it until Esc or ×; the page behind
  // is not reached (a screen reader heard nothing of the help and tabbed on through the rail)
  popup.setAttribute('aria-modal', 'true')
  popup.tabIndex = -1
  popup.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return
    const stops = [...popup.querySelectorAll<HTMLElement>('button, [href], input, [tabindex="0"]')]
    if (!stops.length) return
    const first = stops[0], last = stops[stops.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === popup)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  })
  popup.focus()
  popup.querySelector('.shortcut-help-close')!.addEventListener('click', closeHelp)
  popup.querySelector('#help-tour')!.addEventListener('click', () => { closeHelp(); startTour() })
  popup.querySelector('#help-keys')?.addEventListener('click', () => { closeHelp(); openSettings('shortcuts') })
  document.addEventListener('mousedown', closeHelpOnOutsideClick)
}

function closeHelpOnOutsideClick(e: MouseEvent) {
  const target = e.target as Element
  // The ? button toggles on click; closing here too would reopen it immediately.
  if (target.closest?.('#btn-help')) return
  const popup = document.getElementById('shortcut-help')
  if (popup && !popup.contains(target)) closeHelp()
}

export interface KeyActions {
  toggleHold: () => void
  toggleArpeggio: () => void
  play: () => void
  sendToSong: () => void
  clearHistory: () => void
  step: (dir: 1 | -1) => void
  /** Returns false when nothing was selected, so the key keeps its default. */
  deleteAtCursor: () => boolean
  escape: () => void
  selectCandidate: (index: number) => void
  toggleComputerKeyboard: () => void
  togglePresentation: () => void
  focusChordInput: () => void
  openSettings: () => void
  /** Closes the Settings dialog; false when it was not open. */
  closeSettings: () => boolean
}

export function wireKeyboard(actions: KeyActions) {
  document.addEventListener('keydown', (e) => {
    // Leave browser/OS shortcuts (Ctrl+C, Cmd+S…) and form controls alone.
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
    if (t instanceof HTMLElement && t.isContentEditable) return
    if (keyBelongsToControl(e)) return

    // Fixed keys first: Esc closes or cancels, 1–9 pick a reading
    if (e.key === 'Escape') { if (!closeHelp() && !actions.closeSettings()) actions.escape(); return }
    if (e.key >= '1' && e.key <= '9') { actions.selectCandidate(parseInt(e.key) - 1); return }
    // The rest as the user has them (Settings › Shortcuts)
    switch (actionFor(keyName(e))) {
      case 'hold': actions.toggleHold(); break
      case 'arpeggio': actions.toggleArpeggio(); break
      case 'play': e.preventDefault(); actions.play(); break
      case 'send': actions.sendToSong(); break
      case 'clear': actions.clearHistory(); break
      case 'help': e.preventDefault(); toggleHelp(); break
      case 'settings': e.preventDefault(); actions.openSettings(); break
      case 'keyboard': actions.toggleComputerKeyboard(); break
      case 'present': actions.togglePresentation(); break
      case 'type': e.preventDefault(); actions.focusChordInput(); break
      case 'stepPrev': e.preventDefault(); actions.step(-1); break
      case 'stepNext': e.preventDefault(); actions.step(1); break
      case 'delete': if (actions.deleteAtCursor()) e.preventDefault(); break
    }
  })
}
