import { chordColor, NEUTRAL_COLOR } from '../theory/chord'
import { noteNameToMidi } from '../theory/notes'

/**
 * Renders the piano. A press on a key calls `onPress` with its MIDI number; the caller
 * plays it through the input path and watches for the release itself, since a key the
 * detector lights is rebuilt and never receives its own pointerup.
 */
export function renderPiano(container: HTMLElement, noteNames: string[], chordSymbol: string | null, onPress?: (midi: number) => void) {
  const color = chordSymbol ? chordColor(chordSymbol) : NEUTRAL_COLOR
  const colors = noteNames.map(() => color)

  container.innerHTML = Notae.renderPiano({
    name: '', keys: noteNames, colors,
    range: { from: 'C2', to: 'B5' }
  })

  // notae tags every key with data-note (sharp spelling + octave).
  container.querySelectorAll<SVGRectElement>('rect[data-note]').forEach(el => {
    const midi = noteNameToMidi(el.dataset.note!)
    if (midi === null) return
    el.style.cursor = 'pointer'
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return
      e.preventDefault()   // no text selection or focus change while playing
      onPress?.(midi)
    })
  })
}
