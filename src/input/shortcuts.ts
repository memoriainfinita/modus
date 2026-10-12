import { t } from '../i18n/i18n'
import type { StringKey } from '../i18n/en'
import { escapeHtml } from '../ui/html'
import { keyBelongsToControl } from '../ui/a11y'
import { ACTIONS, actionFor, keyName, keysOf } from './bindings'
import { openSettings, keyLabel } from '../ui/settings'
import { startTour } from '../ui/tour'
import { MODULE_IDS } from '../layout/presets'

// Keys that are always the same: Esc, the readings, Tab, the arrows on a panel title
const FIXED_KEYS: [string, StringKey][] = [
  ['kbd.esc', 'shortcut.escape'], ['1–9', 'shortcut.candidate'], ['Tab', 'shortcut.tab'], ['kbd.panelArrows', 'shortcut.panelArrows'],
]

// What the mouse does that no label says.
const GESTURES: StringKey[] = [
  'gesture.click', 'gesture.doubleClick', 'gesture.logged', 'gesture.drag', 'gesture.fill', 'gesture.remove', 'gesture.piano', 'gesture.layout',
]

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
  popup.innerHTML = `
    <div class="shortcut-help-header">
      <span>${t('help.heading')}</span>
      <button class="shortcut-help-close" aria-label="${t('help.close')}">×</button>
    </div>
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
    <div class="shortcut-section">${t('help.panels')}</div>
    ${MODULE_IDS.map(id => `<div class="gesture-row"><b>${escapeHtml(t(`module.${id}`))}</b> — ${escapeHtml(t(`help.panel.${id}`))}</div>`).join('')}
    <div class="help-setting"><button id="help-tour" class="ctrl-btn" title="${escapeHtml(t('tour.start.title'))}">${escapeHtml(t('tour.start'))}</button></div>`
  document.body.appendChild(popup)
  popup.querySelector('.shortcut-help-close')!.addEventListener('click', closeHelp)
  popup.querySelector('#help-tour')!.addEventListener('click', () => { closeHelp(); startTour() })
  popup.querySelector('#help-keys')!.addEventListener('click', () => { closeHelp(); openSettings('shortcuts') })
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
