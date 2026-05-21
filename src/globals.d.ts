declare const UMT: {
  parseNote: (str: string, defaultOctave?: number) => any
  parseChordSymbol: (symbol: string, tuning?: any) => any
  parseScaleSymbol: (symbol: string, tuning?: any) => any
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
    getColtraneSubstitutions: (chord: any, key: string) => any[]
  }
  FiguredBass: {
    fromChord: (chord: any, bassNote: any) => string
  }
  KeyDetection: {
    detect: (notes: any[]) => { key: string; confidence: number }[]
  }
  getSubstitutions: (chord: any, key: string) => any[]
  CircleOfFifths: new () => any
}

declare const Notae: {
  renderPiano: (chord: { name: string; keys: string[]; colors?: string[]; root?: string; range?: { from: string; to: string } }, opts?: any) => string
  renderFretboard: (chord: any, opts?: any) => string
}

declare const ABCJS: {
  renderAbc: (target: string | HTMLElement, abc: string, options?: any) => any[]
}

declare class WebAudioFontPlayer {
  loader: { decodeAfterLoading: (ctx: AudioContext, varName: string) => void }
  queueWaveTable: (ctx: AudioContext, dest: AudioNode, instrument: any, when: number, pitch: number, duration: number, volume?: number) => void
  cancelQueue: (ctx: AudioContext) => void
}

declare const _tone_0000_GeneralUserGS_sf2_file: any
