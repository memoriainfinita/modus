// How hard each note was struck: one bar per note, highest on top as on a staff, with the
// MIDI velocity (1–127). For balance between voices and evenness; a chord picked from
// history, song or circle has no velocity and shows nothing.

import { escapeHtml } from '../ui/html'

export type NoteVelocity = { name: string; midi: number; velocity: number }

export function renderVelocity(container: HTMLElement, notes: NoteVelocity[]) {
  if (!notes.length) {
    container.innerHTML = '<div class="vel-empty">Play to see how hard each note is struck</div>'
    return
  }
  const sorted = [...notes].sort((a, b) => b.midi - a.midi)
  container.innerHTML = sorted.map(n => `
    <div class="vel-row" title="${escapeHtml(n.name)}: velocity ${n.velocity} of 127">
      <span class="vel-note">${escapeHtml(n.name)}</span>
      <span class="vel-bar"><span style="width:${(n.velocity / 127 * 100).toFixed(1)}%"></span></span>
      <span class="vel-num">${n.velocity}</span>
    </div>`).join('')
}
