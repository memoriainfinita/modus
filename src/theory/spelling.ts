// Note and chord spelling for display. UMT does the theory (spellPitchInKey, spellChord,
// spellChordInKey); this module applies it to detector results and chord symbols.
// Without a key, names stay as they come (MIDI input: flats).

import type { DetectionResult } from '../types'
import { noteNameToMidi, nameAtMidi, pitchClassOf } from './notes'
import { tryParseChord, tryUMT } from './chord'

const A4 = 69   // UMT counts steps from A4

/** A MIDI pitch named in the key ("G#4" in E major); flats without a key. */
function spellMidi(midi: number, key: string): string {
  return tryUMT('spelling', () => UMT.spellPitchInKey(midi - A4, key), '') || ''
}

function spellName(name: string, key: string): string {
  const midi = noteNameToMidi(name)
  return midi === null ? name : spellMidi(midi, key) || name
}

/** A pitch class written in the key ("Gb" in F# major → "F#"); unchanged when it is not a note name. */
export function spellPitchClassInKey(name: string, key: string): string {
  const pc = pitchClassOf(name)
  return pc === -1 ? name : (spellMidi(60 + pc, key).replace(/-?\d+$/, '') || name)
}

/** A chord symbol written in the key: Ab7 in A major → G#7. Unparseable or no key: unchanged. */
export function spellChordSymbol(symbol: string, key: string | null): string {
  if (!key || symbol === '?') return symbol
  const chord = tryParseChord(symbol)
  return chord ? tryUMT('chord spelling', () => UMT.spellChordInKey(chord, key).name, symbol) : symbol
}

/**
 * Notes of a voicing named as tones of `symbol` (by interval above its root); a note
 * that is not a chord tone is named in the key, or left as it is without one.
 */
export function spellVoicing(names: string[], symbol: string | null, key: string | null): string[] {
  const chord = symbol ? tryParseChord(symbol) : null
  const toneByPc = new Map<number, string>()
  if (chord) {
    for (const t of tryUMT<string[]>('chord tones', () => UMT.spellChord(chord), [])) {
      const base = t.replace(/-?\d+$/, '')
      toneByPc.set(pitchClassOf(base), base)
    }
  }
  return names.map(n => {
    const midi = noteNameToMidi(n)
    if (midi === null) return n
    const tone = toneByPc.get(midi % 12)
    return (tone && nameAtMidi(tone, midi)) ?? (key ? spellName(n, key) : n)
  })
}

/** A MIDI detection written in the key: chord names (root by the key), notes, single note, interval. */
export function spellDetection(d: DetectionResult, key: string | null): DetectionResult {
  if (!d || !key) return d
  if (d.kind === 'note') {
    const noteName = spellName(d.noteName, key)
    return { ...d, noteName, pitchClass: noteName.replace(/-?\d+$/, '') }
  }
  if (d.kind === 'interval') return { ...d, notes: d.notes.map(n => spellName(n, key)) }
  const candidates = d.candidates.map(c => spellChordSymbol(c, key))
  const selected = candidates[d.selectedIndex]
  return { ...d, candidates, notes: spellVoicing(d.notes, selected === '?' ? null : selected, key) }
}
