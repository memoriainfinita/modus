import { chordColor, neutralColor } from '../theory/chord'
import { color as themeColor } from '../ui/theme'
import { noteNameToMidi } from '../theory/notes'

/**
 * Renders the piano. A press on a key calls `onPress` with its MIDI number; the caller
 * plays it through the input path and watches for the release itself, since a key the
 * detector lights is rebuilt and never receives its own pointerup.
 */
export function renderPiano(container: HTMLElement, noteNames: string[], chordSymbol: string | null, onPress?: (midi: number) => void, prevNotes: string[] | null = null) {
  const color = chordSymbol ? chordColor(chordSymbol) : neutralColor()
  // The chord before: its keys that are not held now, in the neutral colour
  const now = new Set(noteNames.map(noteNameToMidi))
  const before = (prevNotes ?? []).filter(n => !now.has(noteNameToMidi(n)))
  const keys = [...noteNames, ...before]
  const colors = [...noteNames.map(() => color), ...before.map(() => neutralColor())]

  container.innerHTML = Notae.renderPiano({
    name: '', keys, colors,
    range: { from: 'C2', to: 'B5' }
  }, {
    pianoWhiteKeyColor: themeColor('piano-white'),
    pianoWhiteKeyStrokeColor: themeColor('piano-white-stroke'),
    pianoBlackKeyColor: themeColor('piano-black'),
    pianoBlackKeyStrokeColor: themeColor('piano-black-stroke'),
    stringLabelColor: themeColor('piano-label'),
    pianoBlackKeyLabelColor: themeColor('piano-black-label'),
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
