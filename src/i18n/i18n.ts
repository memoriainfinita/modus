// Interface language and how notes are named. Both are read once when the page loads:
// changing either saves it and reloads (the history is carried over). Strings live in one
// table per language (en.ts, es.ts); Spanish must have every key English has.
//
// Note and chord names come from UMT (`localizeNoteName`, `formatChordSymbol`): letters
// (C D E) or fixed-do solfège (Do Re Mi), whatever the language. Theory names UMT writes
// in English (scales, modes, cadences) stay English until UMT names them in Spanish.

import { en, type StringKey } from './en'
import { es } from './es'
import { loadChoice, save } from '../ui/storage'
import { tryUMT } from '../theory/chord'

export type Lang = 'en' | 'es'
export const LANGS: readonly Lang[] = ['en', 'es']
export const LANG_NAMES: Record<Lang, string> = { en: 'English', es: 'Español' }

export type NoteNaming = 'letters' | 'solfege'
export const NOTE_NAMINGS: readonly NoteNaming[] = ['letters', 'solfege']

const TABLES: Record<Lang, Record<StringKey, string>> = { en, es }

/** The browser's first language, when it is one Modus speaks. */
function browserLang(): Lang {
  const first = typeof navigator === 'undefined' ? '' : (navigator.languages?.[0] ?? navigator.language ?? '')
  return first.toLowerCase().startsWith('es') ? 'es' : 'en'
}

let lang: Lang = loadChoice('lang', LANGS, browserLang())
// Spanish reads Do Re Mi unless the user picks letters
let naming: NoteNaming = loadChoice('note-names', NOTE_NAMINGS, lang === 'es' ? 'solfege' : 'letters')

export function getLang(): Lang { return lang }
export function getNoteNaming(): NoteNaming { return naming }

/** Stores the choice; the caller reloads the page so every string is written again. */
export function saveLang(l: Lang) { save('lang', l) }
export function saveNoteNaming(n: NoteNaming) { save('note-names', n) }

/** For tests: switches language and note names in memory, without storage. */
export function useLang(l: Lang, n: NoteNaming = l === 'es' ? 'solfege' : 'letters') { lang = l; naming = n }

/** The string in the current language, with `{name}` filled from `vars`. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const s = TABLES[lang][key] ?? en[key]
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m) : s
}

// ─── Note, chord and key names ───────────────────────────────────────────────

const NOTE_RE = /^[A-G](?:#|b|x|##|bb)*-?\d*$/

/** "F#4" → "Fa#4" with solfège names; anything that is not a note name passes unchanged. */
export function noteLabel(name: string): string {
  if (naming === 'letters' || !NOTE_RE.test(name)) return name
  return tryUMT('note names', () => UMT.localizeNoteName(name, 'es'), name)
}

/** "Bbm7/D" → "Sibm7/Re" with solfège names; '?' and unknown symbols pass unchanged. */
export function chordLabel(symbol: string): string {
  if (naming === 'letters' || !/^[A-G]/.test(symbol)) return symbol
  return tryUMT('chord names', () => UMT.formatChordSymbol(symbol, { roots: 'solfege' }), symbol)
}

/** Rewrites the note names a diagram library drew in letters (notae's fretboard dots and string labels). */
export function localizeDrawnNoteNames(container: Element) {
  if (naming === 'letters') return
  container.querySelectorAll('text').forEach(el => {
    const s = el.textContent?.trim() ?? ''
    if (NOTE_RE.test(s)) el.textContent = noteLabel(s)
  })
}

/** "C Major" → "C Major" / "Do mayor" / "C mayor". */
export function keyLabel(key: string): string {
  const [root, mode] = key.split(' ')
  if (!mode) return noteLabel(key)
  const m = mode.toLowerCase()
  const modeName = m === 'major' ? t('key.major') : m === 'minor' ? t('key.minor') : mode
  return `${noteLabel(root)} ${modeName}`
}

/** A scale or mode as UMT names it ("D dorian"), in the language and with the root as notes are named: "Re dórico". */
export function scaleLabel(name: string): string {
  return UMT.scaleName(name, lang, { roots: naming })
}

/** A cadence as UMT names it ("Authentic Cadence (V -> I)"); `short` for a tag: "Authentic", "Auténtica". */
export function cadenceLabel(cadence: string, short = false): string {
  return UMT.cadenceName(cadence, lang, { short })
}

/** A substitution type from UMT ('tritone', 'chromatic-mediant'): "tritone", "tritonal". */
export function substitutionTypeLabel(type: string): string {
  return UMT.substitutionTypeName(type, lang)
}

/** The page's own language attribute, for screen readers and hyphenation. */
export function applyDocumentLang() {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

