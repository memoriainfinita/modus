import { noteNameToMidi } from '../theory/notes'
import { fretboardColors } from './fretboard-style'
import { color } from '../ui/theme'
import { localizeDrawnNoteNames } from '../i18n/i18n'

const OPEN_MIDI = [40, 45, 50, 55, 59, 64]  // E2 A2 D3 G3 B3 E4
const NECK_FRETS = 12

// Drawn at one spacing and scaled to its panel
const NECK_SPACING = 16

export function renderNeck(container: HTMLElement, noteNames: string[], preferFlats = true) {
  const midi = noteNames.map(noteNameToMidi).filter((n): n is number => n !== null)

  const frets = OPEN_MIDI.map(open => {
    const pos = midi.map(n => n - open).filter(f => f >= 0 && f <= NECK_FRETS)
    return pos.length ? pos : [null]
  })

  const sp = NECK_SPACING
  const style = {
    ...fretboardColors(),
    numFrets: NECK_FRETS,
    dotColor: color('neck-dot'),
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
    localizeDrawnNoteNames(container)
  } catch {
    container.innerHTML = ''
  }
}
