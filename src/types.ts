// ─── MIDI ────────────────────────────────────────────────────────────────────

export type MidiMode = 'normal' | 'hold' | 'arpeggio'

// ─── Detection results ───────────────────────────────────────────────────────

export interface SingleNoteResult {
  kind: 'note'
  noteName: string   // e.g. "C4"
  midiNumber: number
  pitchClass: string // e.g. "C"
}

export interface IntervalResult {
  kind: 'interval'
  notes: string[]
  intervalName: string    // e.g. "Major 3rd"
  semitones: number
  inversionName: string   // e.g. "Minor 6th"
}

export interface ChordResult {
  kind: 'chord'
  notes: string[]
  candidates: string[]    // ranked chord names from Harmony.detectChords
  selectedIndex: number   // which candidate is active (0 = top)
}

export type DetectionResult = SingleNoteResult | IntervalResult | ChordResult | null

// ─── Full analysis (Zone 1 panel) ────────────────────────────────────────────

export interface HarmonicAnalysis {
  chordName: string
  roman: string             // e.g. "ii7", "bVII"
  function: 'T' | 'S' | 'D' | 'unknown'
  isDiatonic: boolean
  isBorrowed: boolean
  borrowedFrom?: string
  isSecondary: boolean
  secondaryTarget?: string
  figuredBass: string
  suggestedScales: string[]
  substitutions: string[]       // e.g. ["Db7 (tritone sub)", "Fmaj7 (diatonic)"]
  cadence: string | null    // null = no standard cadence vs prev chord
  coltraneAxis: [string, string, string] | null
  negativeHarmony: string | null
  detectedKey: string | null  // from running K-S pool
}

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string
  symbol: string    // top candidate at capture time, e.g. "Cmaj7"
  notes: string[]   // note names, e.g. ["C4","E4","G4","B4"]
}

// ─── Song structure ──────────────────────────────────────────────────────────

export type SectionColor = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'outro' | 'custom'

export interface SongChord {
  id: string
  symbol: string
  valid: boolean
}

export interface Measure {
  id: string
  chords: SongChord[]
}

export interface Section {
  id: string
  name: string
  color: SectionColor
  measures: Measure[]
  collapsed: boolean
  repeatCount: number   // 1 = no badge; ≥2 = "×N"
}

export interface Song {
  schemaVersion: 1
  title: string
  sections: Section[]
}

// ─── App state ───────────────────────────────────────────────────────────────

export interface AppState {
  midi: {
    deviceId: string | null
    mode: MidiMode
    activeNotes: Set<number>   // MIDI note numbers currently held
    lastArpeggioNotes: number[]
    arpeggioTimer: ReturnType<typeof setTimeout> | null
  }
  activeKey: string | null     // e.g. "C Major", null = auto
  detectedKey: string | null   // from K-S on history
  detection: DetectionResult
  analysis: HarmonicAnalysis | null
  history: HistoryEntry[]
  song: Song
  activeCursorId: string | null        // id of active SongChord slot (Zone 3)
  historyActiveCursorId: string | null // id of active HistoryEntry chip (Zone 2)
  captureTargetId: string | null       // SongChord.id waiting for MIDI capture
  panels: {
    notation: boolean
    analysis: boolean
    piano: boolean
    neck: boolean
    history: boolean
    song: boolean
  }
}
