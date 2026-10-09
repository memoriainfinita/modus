import { noteNameToMidi } from '../theory/notes'
import { loadNumber, save } from '../ui/storage'
import { DARK_FRETBOARD_STYLE } from './fretboard-style'

const OPEN_MIDI = [40, 45, 50, 55, 59, 64]  // E2 A2 D3 G3 B3 E4
const NECK_FRETS = 12

let neckSpacing = loadNumber('neck-spacing', 16, 10, 28)
export function adjustNeckSpacing(delta: number) {
  neckSpacing = Math.min(28, Math.max(10, neckSpacing + delta))
  save('neck-spacing', neckSpacing)
}

export function renderNeck(container: HTMLElement, noteNames: string[], preferFlats = true) {
  const midi = noteNames.map(noteNameToMidi).filter((n): n is number => n !== null)

  const frets = OPEN_MIDI.map(open => {
    const pos = midi.map(n => n - open).filter(f => f >= 0 && f <= NECK_FRETS)
    return pos.length ? pos : [null]
  })

  const sp = neckSpacing
  const style = {
    ...DARK_FRETBOARD_STYLE,
    numFrets: NECK_FRETS,
    dotColor: '#3b82f6',
    chordNameSize: 0,
    chordNameY: 4,
    chordNameGapH: 4,
    stringSpacing: sp,
    fretSpacing: Math.round(sp * 28 / 16),
    dotRadius: Math.max(4, Math.round(sp * 7 / 16)),
    fingerNumberSize: Math.max(5, Math.round(sp * 7 / 16)),
    showNoteNames: true,
    preferFlats,
  }

  try {
    container.innerHTML = Notae.renderFretboard(
      { name: '', frets, tuning: ['E','A','D','G','B','E'] } as any,
      { ...style, orientation: 'horizontal' }
    )
  } catch {
    container.innerHTML = ''
  }
}
