import { functionColor, neutralColor, type HarmonicFunction } from '../theory/chord'
import { color as themeColor } from '../ui/theme'
import { noteNameToMidi, midiToNoteName, nameAtMidi } from '../theory/notes'
import { localizeDrawnNoteNames } from '../i18n/i18n'

/** A phone: the piano shows two octaves, wide enough for a finger. */
export const isNarrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 720px)').matches

// notae's keyboard: 196 px a white-key octave, 20 px of edge, 223 px tall with its labels
const OCTAVE_W = 196, EDGE_W = 20, PIANO_H = 223
export const MIN_OCTAVES = 2, MAX_OCTAVES = 7

/**
 * How many octaves fill the panel at its height: a low wide panel gets more keys at a
 * readable size instead of a small keyboard in its middle. A phone keeps two, for a finger.
 */
export function pianoOctaves(width: number, height: number, narrow: boolean): number {
  if (narrow) return MIN_OCTAVES
  if (!width || !height) return 4
  const fit = Math.floor((width * PIANO_H / height - EDGE_W) / OCTAVE_W)
  return Math.max(MIN_OCTAVES, Math.min(MAX_OCTAVES, fit))
}

/**
 * The octaves drawn, centred on middle C (two: C3–B4, four: C2–B5, seven: C1–B7), widened to
 * every note shown, so a chord played low or high is still on the keys.
 */
export function pianoRange(noteNames: string[], octaves: number): { from: string; to: string } {
  const from = 4 - Math.floor(octaves / 2), to = from + octaves - 1
  const played = noteNames.map(noteNameToMidi).filter((m): m is number => m !== null).map(m => Math.floor(m / 12) - 1)
  const low = Math.min(from, ...played), high = Math.max(to, ...played)
  return { from: `C${Math.max(0, low)}`, to: `B${Math.min(8, high)}` }
}

/** A scale to mark on the keys: its degrees' names and pitch classes, the tonic first. */
export type PianoScale = { names: string[]; pitchClasses: number[] }

/** Every key in the range whose pitch class is in the scale, named as the scale spells it (C#4 in E Dorian, not Db4). */
function scaleKeysIn(range: { from: string; to: string }, scale: PianoScale): { midi: number; name: string }[] {
  const low = noteNameToMidi(range.from), high = noteNameToMidi(range.to)
  if (low === null || high === null) return []
  const keys: { midi: number; name: string }[] = []
  for (let m = low; m <= high; m++) {
    const i = scale.pitchClasses.indexOf(m % 12)
    if (i >= 0) keys.push({ midi: m, name: nameAtMidi(scale.names[i], m) ?? midiToNoteName(m) })
  }
  return keys
}

/** The octaves the piano panel has room for now. */
export const containerOctaves = (el: HTMLElement) => pianoOctaves(el.clientWidth, el.clientHeight, isNarrow())

/**
 * Renders the piano, its keys lit in the colour of the chord's function (`fn`). A press on a key calls `onPress` with its MIDI number and the pointer
 * pressing it; the caller plays it through the input path and watches for the release
 * itself, since a key the detector lights is rebuilt and never receives its own pointerup.
 */
export function renderPiano(container: HTMLElement, noteNames: string[], fn: HarmonicFunction | null, onPress?: (midi: number, pointerId: number) => void, prevNotes: string[] | null = null, scale: PianoScale | null = null) {
  const color = functionColor(fn)
  // The chord before: its keys that are not held now, in the neutral colour
  const now = new Set(noteNames.map(noteNameToMidi))
  const before = (prevNotes ?? []).filter(n => !now.has(noteNameToMidi(n)))
  const range = pianoRange([...noteNames, ...before], containerOctaves(container))
  // The scale on every octave drawn, quiet, under the keys played and the chord before
  const taken = new Set([...noteNames, ...before].map(noteNameToMidi))
  const scaleKeys = scale ? scaleKeysIn(range, scale).filter(k => !taken.has(k.midi)) : []
  const keys = [...noteNames, ...before, ...scaleKeys.map(k => k.name)]
  const colors = [...noteNames.map(() => color), ...before.map(() => neutralColor()),
    ...scaleKeys.map(k => themeColor(k.midi % 12 === scale!.pitchClasses[0] ? 'piano-scale-root' : 'piano-scale'))]

  container.innerHTML = Notae.renderPiano({
    name: '', keys, colors, range
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
