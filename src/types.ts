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
  degree?: string           // the plain degree (II7 where roman reads V7/V)
  degreeNumber?: number     // 1–7, the scale degree the root stands on
  substitutionCandidate?: string // UMT's reading of a chromatic chord: "tritone sub of V"
  function: 'T' | 'S' | 'D' | 'unknown'
  isDiatonic: boolean
  isBorrowed: boolean
  borrowedFrom?: string
  isSecondary: boolean
  secondaryTarget?: string
  figuredBass: string
  suggestedScales: string[]
  substitutions: string[]       // e.g. ["Db7 (tritone sub)", "Fmaj7 (diatonic)"]
  substitutionTypes: string[]   // UMT's types, each once: "tritone", "diatonic"…
  cadence: string | null    // null = no standard cadence vs prev chord
  voicing: string | null        // e.g. "1st inversion · open · drop 2 · doubled R · no 5"
  upperStructures: string[]     // upper-structure triads present over a dominant: "II UST (D: 9 #11 13)"
  slash: SlashReading | null    // a chord over a bass foreign to it (UMT analyzeSlash); null for an inversion
  transformation: string | null // neo-Riemannian P / L / R from the previous triad, e.g. "R", "PL"
  voiceLeading: string | null   // each voice from the chord before: "C→B ↓1  E =  G =  — outer voices oblique · …"
  voiceRules: string[] | null   // four-part rules broken from the chord before; null when it cannot be read
  voiceRuleKeys: string[]       // the same rules by key ("parallel5"), each once
}

/** A chord over a foreign bass, as UMT reads it: D over C, an upper structure, 9 #11 13. */
export interface SlashReading {
  type: 'upper-structure' | 'polychord' | 'hybrid'
  upper: string | null      // the chord above the bass; none for a hybrid
  bass: string              // pitch class: "C"
  tensions: string[]        // the notes above, as intervals over the bass: "9", "#11", "13"
}

/** What any set of notes on screen is, chord or not: set class and the scales that hold it. */
export interface NoteSetAnalysis {
  notes: string[]           // pitch classes the reading is about (a melody's, when single notes are played)
  fromMelody: boolean
  forte: string | null      // "3-11 · [037] · <001110>"
  fits: string[]            // scales containing every note, e.g. "C major"
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
  // Control rows shown under a panel; which panels show is the layout's (ui/layout.ts)
  panels: {
    guitarControls: boolean
  }
}
