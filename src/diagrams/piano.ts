import { playNoteByName } from '../audio/audio'
import { chordColor, NEUTRAL_COLOR } from '../theory/chord'

export function renderPiano(container: HTMLElement, noteNames: string[], chordSymbol: string | null) {
  const color = chordSymbol ? chordColor(chordSymbol) : NEUTRAL_COLOR
  const colors = noteNames.map(() => color)

  container.innerHTML = Notae.renderPiano({
    name: '', keys: noteNames, colors,
    range: { from: 'C2', to: 'B5' }
  })

  // notae tags every key with data-note (sharp spelling + octave).
  container.querySelectorAll<SVGRectElement>('rect[data-note]').forEach(el => {
    const note = el.dataset.note!
    el.style.cursor = 'pointer'
    el.addEventListener('click', () => playNoteByName(note))
  })
}
