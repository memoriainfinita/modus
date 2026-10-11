import { color } from '../ui/theme'

/** Colours shared by the guitar diagram and the full-neck fretboard, in the theme shown. */
export function fretboardColors() {
  return {
    chordNameColor: color('fret-text'),
    fretLabelColor: color('fret-label'),
    nutColor: color('fret-nut'),
    stringColor: color('fret-string'),
    fretColor: color('fret-wire'),
    dotColor: color('fret-dot'),
    barreColor: color('fret-dot'),
    dotTextColor: color('fret-dot-text'),
    indicatorColor: color('fret-label'),
    stringLabelColor: color('fret-label'),
  }
}
