declare const UMT: {
  parseNote: (str: string, defaultOctave?: number) => any
  parseChordSymbol: (symbol: string, tuning?: any) => any
  parseScaleSymbol: (symbol: string, tuning?: any) => {
    getNotes: (octaves?: number) => { name: string }[]
    getDiatonicChords: (type?: 'triad' | 'seventh') => any[]
  }
  getFretboardVoicings: (chord: any, tuning: readonly number[]) => any[]
  GUITAR_STANDARD: readonly number[]
  GUITAR_DROPPED_D: readonly number[]
  GUITAR_OPEN_G: readonly number[]
  Harmony: {
    detectChords: (notes: any[]) => string[]
    analyzeSlash: (chordOrNotes: any) => { type: 'inversion' | 'upper-structure' | 'polychord' | 'hybrid'; upperStructure?: { name: string }; lowerRoot?: { name: string }; lowerChord?: { name: string }; resultingTensions?: string[] }
    detectChordsScored: (notes: any[]) => { name: string; root: string; bass: string; quality: string; score: number; rootInBass: boolean; omitted: string[]; tensions: string[] }[]
    analyzeProgression: (chords: any[], key: string, opts?: { spelling?: 'key' | 'written'; durations?: number[]; beatsPerBar?: number; style?: 'blues' }) => { analysis: any[]; modulations: any[]; harmonicRhythm: number; harmonicRhythmUnit?: 'per-bar' | 'per-chord' }
    analyzeCadence: (c1: any, c2: any, key: string) => string
    getSuggestedScales: (chord: any) => { scale: string; hint?: string }[]
    getColtraneAxis: (key: string) => { root: string; majorThirds: [string, string, string] }
    getNegativeHarmony: (chord: any, key: string) => any
    getBorrowedChords: (key: string, opts?: { type?: 'triad' | 'seventh' }) => { chord: any; sourceMode: string; brightness: number; function: string; characteristic: boolean; common?: boolean }[]
    checkVoiceLeading: (chordA: any[], chordB: any[], ruleset?: 'strict' | 'contemporary' | 'species', context?: { keySymbol?: string; chordA?: any; chordB?: any }) => { type: string; voices: number[]; message: string }[]
  }
  FiguredBass: {
    fromChord: (chord: any, bassNote: any) => string
  }
  KeyDetection: {
    detect: (notes: any[], durations?: readonly number[], options?: { profile?: string; modes?: boolean }) => { key: string; confidence: number }[]
  }
  getSubstitutions: (chord: any, key: string) => any[]
  PROGRESSIONS: Record<string, { name: string; romanNumerals: string[]; description: string; style: string; defaultKey?: string; mode?: 'major' | 'minor' }>
  getProgression: (id: string, key: string) => any[]
  parseRomanProgression: (numerals: string, key: string) => any[]
  analyzeVoicing: (notes: any[], chord?: any) => {
    chord: string; bass: string; bassDegree: string | null; inversion: number
    position: 'close' | 'open'; drop: string | null
    doubled: string[]; omitted: string[]; added: string[]
  }
  findScalesForNotes: (notes: any[], opts?: { tonic?: string; tonicOnly?: boolean; limit?: number }) => { name: string; root: string; type: string; notes: string[]; extra: string[]; tier: number }[]
  RHYTHMIC_CYCLES: Record<string, { name: string; tradition: 'hindustani' | 'carnatic' | 'flamenco' | 'aksak'; beats: number; groups: number[]; source: string }>
  cycleStrokes: (cycle: any) => ('sam' | 'tali' | 'khali' | 'accent' | 'beat')[]
  cycleCounts: (cycle: any) => number[]
  CLAVE_PATTERNS: Record<string, { name: string; steps: readonly boolean[]; description: string }>
  Polyrhythm: { euclidean: (pulses: number, steps: number) => boolean[] }
  getUpperStructures: (dominantChord: any) => { triad: { name: string; getNotes: () => { name: string }[] }; tensions: string[]; label: string }[]
  NeoRiemannian: { P: (chord: any) => any | null; L: (chord: any) => any | null; R: (chord: any) => any | null }
  SetTheory: {
    getPitchClasses: (notes: any[]) => number[]
    primeForm: (pcs: number[]) => number[]
    intervalVector: (pcs: number[]) => number[]
    getForteNumber: (pcs: number[]) => string
  }
  spellPitchInKey: (stepsFromA4: number, key: string) => string
  spellChord: (chord: any, rootName?: string) => string[]
  spellChordInKey: (chord: any, key: string) => any
  localizeNoteName: (name: string, language: 'en' | 'es', long?: boolean) => string
  Solfege: { movableDo: (note: any, key: string, options?: { syllables?: 'si' | 'ti' }) => string }
  formatChordSymbol: (chord: any, opts?: { style?: 'standard' | 'symbols' | 'short'; roots?: 'letters' | 'solfege' }) => string
  chordLongName: (chord: any, language?: 'en' | 'es') => string
  scaleName: (name: string, language?: 'en' | 'es', options?: { roots?: 'letters' | 'solfege' }) => string
  cadenceName: (cadence: string, language?: 'en' | 'es', options?: { short?: boolean }) => string
  substitutionTypeName: (type: string, language?: 'en' | 'es') => string
  translateSymbol: (input: string, aliases: Record<string, string>) => string
  SOLFEGE_ROOTS: Record<string, string>
  QUALITY_ALIASES_ES: Record<string, string>
}

declare const Notae: {
  renderPiano: (chord: { name: string; keys: string[]; colors?: string[]; root?: string; range?: { from: string; to: string } }, opts?: any) => string
  renderFretboard: (chord: any, opts?: any) => string
}

declare const ABCJS: {
  renderAbc: (target: string | HTMLElement, abc: string, options?: any) => any[]
}

declare const Soundfont: {
  instrument: (
    audioCtx: AudioContext,
    name: string,
    options?: { soundfont?: string; destination?: AudioNode; nameToUrl?: (name: string) => string }
  ) => Promise<{
    play: (note: number | string, when?: number, options?: { duration?: number; gain?: number }) => any
    stop: () => void
  }>
}
