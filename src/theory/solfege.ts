// Movable do, as UMT names it (`Solfege.movableDo`): the tonic is do; minor keys la-based,
// modes from their major's do. Modus asks for the "ti" syllables in every language: the
// seventh is ti and the notes outside the scale have their own syllables (di ri fi si li
// raised, ra me se le te lowered), which the Latin "si" system does not name.

import { tryUMT } from './chord'

const SYLLABLES = { syllables: 'ti' } as const

/** The syllable of a note ("F#", "Bb4") in a key ("G Major"); null when there is none. */
export function movableSyllable(note: string, key: string): string | null {
  const name = /\d$/.test(note) ? note : note + '4'
  const s = tryUMT('solfege', () => UMT.Solfege.movableDo(UMT.parseNote(name), key, SYLLABLES), '?')
  return s && s !== '?' ? s : null
}
