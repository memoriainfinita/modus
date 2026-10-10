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
  notes?: string[]   // exact note names captured from MIDI or history drag, e.g. ["C3","G3","E4"]
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
  schemaVersion: 2
  id: string
  title: string
  key: string | null     // the key the song is analysed in, e.g. "A Minor"; null = auto
  updatedAt: number      // ms since epoch, set on save; orders the song list
  sections: Section[]
}

// ─── App state ───────────────────────────────────────────────────────────────

export interface AppState {
  activeKey: string | null     // e.g. "C Major", null = auto
  detection: DetectionResult
  analysis: HarmonicAnalysis | null
  history: HistoryEntry[]
  song: Song
  activeCursorId: string | null        // id of active SongChord slot (Zone 3)
  historyActiveCursorId: string | null // id of active HistoryEntry chip (Zone 2)
  captureTargetId: string | null       // SongChord.id waiting for MIDI capture
  panels: {
    notation: boolean
    instruments: boolean
    colPiano: boolean
    colNeck: boolean
    history: boolean
    song: boolean
    cofControls: boolean
    guitarControls: boolean
    analysisControls: boolean
    colStaff: boolean
    colAnalysis: boolean
    colCoF: boolean
    colGuitar: boolean
  }
}
