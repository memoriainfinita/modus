const SHORTCUTS: { key: string; action: string }[] = [
  { key: 'Space', action: 'Play current chord (or last if none active)' },
  { key: 'H',     action: 'Toggle Hold mode' },
  { key: 'A',     action: 'Toggle Arpeggio mode' },
  { key: 'S',     action: 'Send history chip → Song' },
  { key: 'C',     action: 'Clear history' },
  { key: 'Esc',   action: 'Clear cursor / capture' },
  { key: '1–9',   action: 'Select chord candidate' },
  { key: 'P',     action: 'Play current chord' },
  { key: '?',     action: 'Show / hide this panel' },
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
      <span>Keyboard shortcuts</span>
      <button class="shortcut-help-close">×</button>
    </div>
    ${SHORTCUTS.map(s => `
      <div class="shortcut-row">
        <kbd class="shortcut-key">${s.key}</kbd>
        <span class="shortcut-action">${s.action}</span>
      </div>`).join('')}`
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
