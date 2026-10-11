// The fretted instruments the strings panel draws, and their tunings: open strings as MIDI
// notes in the order the strings are drawn (the thickest first, as a player names them).
// A reentrant tuning (ukulele, banjo) has a string higher than the one after it.

export const INSTRUMENT_IDS = ['guitar', 'guitar7', 'bass', 'bass5', 'ukulele', 'baritone', 'mandolin', 'banjo'] as const
export type InstrumentId = typeof INSTRUMENT_IDS[number]

/** Each instrument's tunings, its usual one first. Names are string-table keys (`tuning.*`). */
export const INSTRUMENT_TUNINGS: Record<InstrumentId, Record<string, number[]>> = {
  guitar: {
    standard: [40, 45, 50, 55, 59, 64],   // E2 A2 D3 G3 B3 E4
    dropD:    [38, 45, 50, 55, 59, 64],
    openG:    [38, 43, 50, 55, 59, 62],
    openD:    [38, 45, 50, 54, 57, 62],
    dadgad:   [38, 45, 50, 55, 57, 62],
  },
  guitar7:  { standard: [35, 40, 45, 50, 55, 59, 64] },        // B1 E2 A2 D3 G3 B3 E4
  bass:     { standard: [28, 33, 38, 43], dropD: [26, 33, 38, 43] },   // E1 A1 D2 G2
  bass5:    { standard: [23, 28, 33, 38, 43] },                 // B0 E1 A1 D2 G2
  ukulele:  { standard: [67, 60, 64, 69], lowG: [55, 60, 64, 69] },   // G4 C4 E4 A4, reentrant
  baritone: { standard: [50, 55, 59, 64] },                     // D3 G3 B3 E4
  mandolin: { standard: [55, 62, 69, 76] },                     // G3 D4 A4 E5
  banjo:    { openG: [67, 50, 55, 59, 62] },                    // g4 D3 G3 B3 D4, the short fifth string first
}

export const defaultTuning = (id: InstrumentId): string => Object.keys(INSTRUMENT_TUNINGS[id])[0]

/** The open strings of an instrument's usual tuning: what a custom tuning takes its octaves from. */
export const referenceStrings = (id: InstrumentId): number[] => INSTRUMENT_TUNINGS[id][defaultTuning(id)]

/** A string higher than the next one: the lowest string is not the lowest note. */
export const isReentrant = (open: number[]): boolean => open.some((m, i) => i > 0 && m < open[i - 1])
