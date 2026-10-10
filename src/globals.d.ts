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
    analyzeProgression: (chords: any[], key: string) => { analysis: any[]; modulations: any[]; harmonicRhythm: number }
    analyzeCadence: (c1: any, c2: any, key: string) => string
    getSuggestedScales: (chord: any) => { scale: string; hint?: string }[]
    getColtraneAxis: (key: string) => { root: string; majorThirds: [string, string, string] }
    getNegativeHarmony: (chord: any, key: string) => any
    getBorrowedChords: (key: string) => { chord: any; sourceMode: string; brightness: number; function: string; characteristic: boolean }[]
  }
  FiguredBass: {
    fromChord: (chord: any, bassNote: any) => string
  }
  KeyDetection: {
    detect: (notes: any[]) => { key: string; confidence: number }[]
  }
  getSubstitutions: (chord: any, key: string) => any[]
  spellPitchInKey: (stepsFromA4: number, key: string) => string
  spellChord: (chord: any, rootName?: string) => string[]
  spellChordInKey: (chord: any, key: string) => any
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
    options?: { soundfont?: string; destination?: AudioNode }
  ) => Promise<{
    play: (note: number | string, when?: number, options?: { duration?: number; gain?: number }) => any
    stop: () => void
  }>
}
