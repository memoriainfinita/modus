import { chordColor, neutralColor } from '../theory/chord'
import { color as themeColor } from '../ui/theme'
import { noteNameToMidi } from '../theory/notes'
import { localizeDrawnNoteNames } from '../i18n/i18n'

/** A phone: the piano shows two octaves, wide enough for a finger. */
export const isNarrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 720px)').matches

/**
 * The octaves drawn: C2–B5, or on a phone C3–B4 widened to every note shown, so a chord
 * played low or high is still on the keys.
 */
export function pianoRange(noteNames: string[], narrow: boolean): { from: string; to: string } {
  if (!narrow) return { from: 'C2', to: 'B5' }
  const octaves = noteNames.map(noteNameToMidi).filter((m): m is number => m !== null).map(m => Math.floor(m / 12) - 1)
  const low = Math.min(3, ...octaves), high = Math.max(4, ...octaves)
  return { from: `C${Math.max(0, low)}`, to: `B${Math.min(8, high)}` }
}

/**
 * Renders the piano. A press on a key calls `onPress` with its MIDI number and the pointer
 * pressing it; the caller plays it through the input path and watches for the release
 * itself, since a key the detector lights is rebuilt and never receives its own pointerup.
 */
export function renderPiano(container: HTMLElement, noteNames: string[], chordSymbol: string | null, onPress?: (midi: number, pointerId: number) => void, prevNotes: string[] | null = null) {
  const color = chordSymbol ? chordColor(chordSymbol) : neutralColor()
  // The chord before: its keys that are not held now, in the neutral colour
  const now = new Set(noteNames.map(noteNameToMidi))
  const before = (prevNotes ?? []).filter(n => !now.has(noteNameToMidi(n)))
  const keys = [...noteNames, ...before]
  const colors = [...noteNames.map(() => color), ...before.map(() => neutralColor())]

  container.innerHTML = Notae.renderPiano({
    name: '', keys, colors,
    range: pianoRange([...noteNames, ...before], isNarrow())
  }, {
    pianoWhiteKeyColor: themeColor('piano-white'),
    pianoWhiteKeyStrokeColor: themeColor('piano-white-stroke'),
    pianoBlackKeyColor: themeColor('piano-black'),
    pianoBlackKeyStrokeColor: themeColor('piano-black-stroke'),
    stringLabelColor: themeColor('piano-label'),
    pianoBlackKeyLabelColor: themeColor('piano-black-label'),
  })

  // The key labels, in Do Re Mi when the page names notes so
  localizeDrawnNoteNames(container)

  // notae tags every key with data-note (sharp spelling + octave).
  container.querySelectorAll<SVGRectElement>('rect[data-note]').forEach(el => {
    const midi = noteNameToMidi(el.dataset.note!)
    if (midi === null) return
    el.style.cursor = 'pointer'
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return
      e.preventDefault()   // no text selection or focus change while playing
      onPress?.(midi, e.pointerId)
    })
  })
}
