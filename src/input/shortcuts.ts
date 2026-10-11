import { t, getLang, getNoteNaming, saveLang, saveNoteNaming, LANGS, LANG_NAMES, NOTE_NAMINGS } from '../i18n/i18n'
import type { Lang, NoteNaming } from '../i18n/i18n'
import type { StringKey } from '../i18n/en'
import { carryHistoryOverReload } from '../history/history'
import { escapeHtml } from '../ui/html'

// Keys as printed (a string key for named keys) and what they do
const SHORTCUTS: { key: string | StringKey; action: StringKey }[] = [
  { key: 'kbd.space', action: 'shortcut.play' },
  { key: '← →',       action: 'shortcut.step' },
  { key: 'kbd.del',   action: 'shortcut.delete' },
  { key: 'H',         action: 'shortcut.hold' },
  { key: 'A',         action: 'shortcut.arpeggio' },
  { key: 'S',         action: 'shortcut.send' },
  { key: 'C',         action: 'shortcut.clear' },
  { key: 'kbd.esc',   action: 'shortcut.escape' },
  { key: 'M',         action: 'shortcut.keyboard' },
  { key: 'P',         action: 'shortcut.present' },
  { key: '/',         action: 'shortcut.type' },
  { key: '1–9',       action: 'shortcut.candidate' },
  { key: '?',         action: 'shortcut.help' },
]

// What the mouse does that no label says.
const GESTURES: StringKey[] = [
  'gesture.click', 'gesture.doubleClick', 'gesture.logged', 'gesture.drag', 'gesture.fill', 'gesture.remove', 'gesture.piano',
]

const keyText = (k: string) => k.startsWith('kbd.') ? t(k as StringKey) : k

/** Saves the choice and loads the page again in it; the history comes along. */
function reloadWith(apply: () => void) {
  apply()
  carryHistoryOverReload()
  location.reload()
}

let helpVisible = false

export function closeHelp(): boolean {
  if (!helpVisible) return false
  helpVisible = false
  document.getElementById('shortcut-help')?.remove()
  document.removeEventListener('mousedown', closeHelpOnOutsideClick)
  return true
}

export function toggleHelp() {
  if (helpVisible) { closeHelp(); return }
  helpVisible = true
  const popup = document.createElement('div')
  popup.id = 'shortcut-help'
  popup.className = 'shortcut-help-popup'
  popup.innerHTML = `
    <div class="shortcut-help-header">
      <span>${t('help.heading')}</span>
      <button class="shortcut-help-close">×</button>
    </div>
    ${SHORTCUTS.map(s => `
      <div class="shortcut-row">
        <kbd class="shortcut-key">${escapeHtml(keyText(s.key))}</kbd>
        <span class="shortcut-action">${escapeHtml(t(s.action))}</span>
      </div>`).join('')}
    <div class="shortcut-section">${t('help.mouse')}</div>
    ${GESTURES.map(g => `<div class="gesture-row">${escapeHtml(t(g))}</div>`).join('')}
    <div class="shortcut-section">${t('help.settings')}</div>
    <div class="help-setting"><label for="help-lang">${t('help.language')}</label>
      <select id="help-lang" class="ctrl-select">
        ${LANGS.map(l => `<option value="${l}"${l === getLang() ? ' selected' : ''}>${LANG_NAMES[l]}</option>`).join('')}
      </select></div>
    <div class="help-setting"><label for="help-note-names">${t('help.noteNames')}</label>
      <select id="help-note-names" class="ctrl-select">
        ${NOTE_NAMINGS.map(n => `<option value="${n}"${n === getNoteNaming() ? ' selected' : ''}>${t(`help.noteNames.${n}`)}</option>`).join('')}
      </select></div>
    <div class="gesture-row">${escapeHtml(t('help.reloads'))}</div>`
  document.body.appendChild(popup)
  popup.querySelector('.shortcut-help-close')!.addEventListener('click', closeHelp)
  const langSel = popup.querySelector<HTMLSelectElement>('#help-lang')!
  // Note names follow the language until they are chosen on their own
  langSel.addEventListener('change', () => reloadWith(() => saveLang(langSel.value as Lang)))
  const namesSel = popup.querySelector<HTMLSelectElement>('#help-note-names')!
  namesSel.addEventListener('change', () => reloadWith(() => saveNoteNaming(namesSel.value as NoteNaming)))
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
}

export function wireKeyboard(actions: KeyActions) {
  document.addEventListener('keydown', (e) => {
    // Leave browser/OS shortcuts (Ctrl+C, Cmd+S…) and form controls alone.
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
    if (t instanceof HTMLElement && t.isContentEditable) return

    switch (e.key) {
      case 'h': case 'H': actions.toggleHold(); break
      case 'a': case 'A': actions.toggleArpeggio(); break
      case ' ': e.preventDefault(); actions.play(); break
      case 's': case 'S': actions.sendToSong(); break
      case 'c': case 'C': actions.clearHistory(); break
      case '?': e.preventDefault(); toggleHelp(); break
      case 'm': case 'M': actions.toggleComputerKeyboard(); break
      case 'p': case 'P': actions.togglePresentation(); break
      case '/': e.preventDefault(); actions.focusChordInput(); break
      case 'ArrowLeft': case 'ArrowRight':
        e.preventDefault()
        actions.step(e.key === 'ArrowRight' ? 1 : -1); break
      case 'Delete': case 'Backspace':
        if (actions.deleteAtCursor()) e.preventDefault()
        break
      case 'Escape':
        if (!closeHelp()) actions.escape()
        break
      default:
        if (e.key >= '1' && e.key <= '9') actions.selectCandidate(parseInt(e.key) - 1)
    }
  })
}
