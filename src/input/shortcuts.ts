const SHORTCUTS: { key: string; action: string }[] = [
  { key: 'Space', action: 'Play current chord (or last if none active)' },
  { key: '← →',   action: 'Previous / next chord in the song (or history) — plays it' },
  { key: 'Del',   action: 'Remove the selected song chord (undo in the toast)' },
  { key: 'H',     action: 'Toggle Hold mode' },
  { key: 'A',     action: 'Toggle Arpeggio mode' },
  { key: 'S',     action: 'Send history chip → Song' },
  { key: 'C',     action: 'Clear history (undo in the toast)' },
  { key: 'Esc',   action: 'Drop a held chord, clear cursor, stop MIDI fill' },
  { key: 'M',     action: 'Play with the computer keyboard (M or Esc to stop)' },
  { key: '/',     action: 'Type a chord name' },
  { key: '1–9',   action: 'Select chord candidate' },
  { key: '?',     action: 'Show / hide this panel' },
]

// What the mouse does that no label says.
const GESTURES: string[] = [
  'Click a history chip, song chord or circle segment to play it and show it in the detector.',
  'Double-click a major or minor circle segment to make it the key.',
  'A chord is logged to history once held steady for 0.8 s, and not twice in a row.',
  'Drag a history chip onto a song measure to insert it; drag song chords and section headers to reorder.',
  '⊙ on a song chord arms MIDI fill: each chord you play fills a slot and arms the next, until the song ends or Esc.',
  'Right-click a history chip to remove it. Removals and Clear can be undone from the toast.',
  'Click the on-screen piano to play: in Hold each click adds or removes a note of the chord.',
]

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
      <span>Shortcuts and gestures</span>
      <button class="shortcut-help-close">×</button>
    </div>
    ${SHORTCUTS.map(s => `
      <div class="shortcut-row">
        <kbd class="shortcut-key">${s.key}</kbd>
        <span class="shortcut-action">${s.action}</span>
      </div>`).join('')}
    <div class="shortcut-section">Mouse</div>
    ${GESTURES.map(g => `<div class="gesture-row">${g}</div>`).join('')}`
  document.body.appendChild(popup)
  popup.querySelector('.shortcut-help-close')!.addEventListener('click', closeHelp)
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
