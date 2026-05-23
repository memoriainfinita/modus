let audioCtx: AudioContext | null = null
let instrument: any = null
let loadingInstrument = false
let pendingNotes: { midi: number; duration: number }[] = []

let volume = parseFloat(localStorage.getItem('audio-volume') ?? '0.8')
let currentInstrumentName = localStorage.getItem('audio-instrument') ?? 'acoustic_grand_piano'

export type AudioStatus = 'idle' | 'loading' | 'suspended' | 'ready' | 'error'
let audioStatus: AudioStatus = 'idle'
let onStatusChange: ((s: AudioStatus) => void) | null = null

export function setAudioStatusCallback(cb: (s: AudioStatus) => void) { onStatusChange = cb }
export function getAudioStatus(): AudioStatus { return audioStatus }

function setStatus(s: AudioStatus) { audioStatus = s; onStatusChange?.(s) }

export const GM_INSTRUMENT_GROUPS: { label: string; instruments: string[] }[] = [
  { label: 'Piano',          instruments: ['acoustic_grand_piano','bright_acoustic_piano','electric_grand_piano','honkytonk_piano','electric_piano_1','electric_piano_2','harpsichord','clavinet'] },
  { label: 'Chromatic Perc', instruments: ['celesta','glockenspiel','music_box','vibraphone','marimba','xylophone','tubular_bells','dulcimer'] },
  { label: 'Organ',          instruments: ['drawbar_organ','percussive_organ','rock_organ','church_organ','reed_organ','accordion','harmonica','tango_accordion'] },
  { label: 'Guitar',         instruments: ['acoustic_guitar_nylon','acoustic_guitar_steel','electric_guitar_jazz','electric_guitar_clean','electric_guitar_muted','overdriven_guitar','distortion_guitar','guitar_harmonics'] },
  { label: 'Bass',           instruments: ['acoustic_bass','electric_bass_finger','electric_bass_pick','fretless_bass','slap_bass_1','slap_bass_2','synth_bass_1','synth_bass_2'] },
  { label: 'Strings',        instruments: ['violin','viola','cello','contrabass','tremolo_strings','pizzicato_strings','orchestral_harp','timpani'] },
  { label: 'Ensemble',       instruments: ['string_ensemble_1','string_ensemble_2','synth_strings_1','synth_strings_2','choir_aahs','voice_oohs','synth_voice','orchestra_hit'] },
  { label: 'Brass',          instruments: ['trumpet','trombone','tuba','muted_trumpet','french_horn','brass_section','synth_brass_1','synth_brass_2'] },
  { label: 'Reed',           instruments: ['soprano_sax','alto_sax','tenor_sax','baritone_sax','oboe','english_horn','bassoon','clarinet'] },
  { label: 'Pipe',           instruments: ['piccolo','flute','recorder','pan_flute','blown_bottle','shakuhachi','whistle','ocarina'] },
  { label: 'Synth Lead',     instruments: ['lead_1_square','lead_2_sawtooth','lead_3_calliope','lead_4_chiff','lead_5_charang','lead_6_voice','lead_7_fifths','lead_8_bass_lead'] },
  { label: 'Synth Pad',      instruments: ['pad_1_new_age','pad_2_warm','pad_3_polysynth','pad_4_choir','pad_5_bowed','pad_6_metallic','pad_7_halo','pad_8_sweep'] },
  { label: 'Synth FX',       instruments: ['fx_1_rain','fx_2_soundtrack','fx_3_crystal','fx_4_atmosphere','fx_5_brightness','fx_6_goblins','fx_7_echoes','fx_8_sci-fi'] },
  { label: 'Ethnic',         instruments: ['sitar','banjo','shamisen','koto','kalimba','bag_pipe','fiddle','shanai'] },
  { label: 'Percussive',     instruments: ['tinkle_bell','agogo','steel_drums','woodblock','taiko_drum','melodic_tom','synth_drum','reverse_cymbal'] },
  { label: 'Sound FX',       instruments: ['guitar_fret_noise','breath_noise','seashore','bird_tweet','telephone_ring','helicopter','applause','gunshot'] },
]

function ensureContext() {
  if (!audioCtx) audioCtx = new AudioContext()
}

function loadCurrentInstrument() {
  if (loadingInstrument || !audioCtx) return
  loadingInstrument = true
  instrument = null
  setStatus('loading')
  Soundfont.instrument(audioCtx, currentInstrumentName, { soundfont: 'FluidR3_GM' })
    .then((inst: any) => {
      instrument = inst
      loadingInstrument = false
      pendingNotes = []
      setStatus(audioCtx!.state === 'suspended' ? 'suspended' : 'ready')
    })
    .catch((err: any) => { loadingInstrument = false; setStatus('error'); console.error('[audio] load failed:', err) })
}

export function initAudioOnGesture() {
  ensureContext()
  audioCtx!.resume().then(() => {
    if (instrument && audioStatus === 'suspended') setStatus('ready')
  })
  if (!instrument && !loadingInstrument) loadCurrentInstrument()
}

export function setInstrument(name: string) {
  currentInstrumentName = name
  localStorage.setItem('audio-instrument', name)
  instrument = null
  if (audioCtx) loadCurrentInstrument()
}

export function getCurrentInstrument() { return currentInstrumentName }

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v))
  localStorage.setItem('audio-volume', String(volume))
}

export function getVolume() { return volume }

export function playNote(midiNumber: number, duration = 1.5) {
  ensureContext()
  if (!loadingInstrument && !instrument) loadCurrentInstrument()
  if (!audioCtx) return
  if (!instrument) { pendingNotes = [{ midi: midiNumber, duration }]; return }
  audioCtx.resume().then(() => {
    instrument.play(midiNumber, audioCtx!.currentTime, { duration, gain: volume })
  })
}

export function playNoteByName(noteName: string, duration = 1.5) {
  const midi = noteNameToMidi(noteName)
  if (midi !== null) playNote(midi, duration)
}

export function playMidiNotes(midiNotes: number[], duration = 2) {
  if (!instrument || !audioCtx) return
  audioCtx.resume().then(() => {
    for (const midi of midiNotes) {
      instrument.play(midi, audioCtx!.currentTime, { duration, gain: volume })
    }
  })
}

export function playNoteNames(noteNames: string[], duration = 2) {
  if (!instrument || !audioCtx) return
  const midis = noteNames.map(noteNameToMidi).filter((m): m is number => m !== null)
  if (!midis.length) return
  audioCtx.resume().then(() => {
    for (const midi of midis) {
      instrument!.play(midi, audioCtx!.currentTime, { duration, gain: volume })
    }
  })
}

// Interval maps for common chord qualities (no UMT dependency)
const QUALITY_INTERVALS: Record<string, number[]> = {
  'major':           [0, 4, 7],
  'minor':           [0, 3, 7],
  'diminished':      [0, 3, 6],
  'augmented':       [0, 4, 8],
  'major seventh':           [0, 4, 7, 11],
  'minor seventh':           [0, 3, 7, 10],
  'dominant seventh':        [0, 4, 7, 10],
  'diminished seventh':      [0, 3, 6, 9],
  'half-diminished seventh': [0, 3, 6, 10],
  'sus2':                    [0, 2, 7],
  'sus4':                    [0, 5, 7],
  'major ninth':             [0, 4, 7, 11, 14],
  'minor ninth':             [0, 3, 7, 10, 14],
  'dominant ninth':          [0, 4, 7, 10, 14],
}

export function playChord(chordSymbol: string) {
  ensureContext()
  if (!loadingInstrument && !instrument) loadCurrentInstrument()
  if (!audioCtx) return
  try {
    const chord = UMT.parseChordSymbol(chordSymbol)
    const midiNotes: number[] = []

    // Use UMT's own note list (same source as staff/piano rendering)
    const umtNotes: any[] = chord.getNotes?.() ?? []
    for (const n of umtNotes) {
      const midi = noteNameToMidi(n.name)
      if (midi !== null) midiNotes.push(midi)
    }

    // Fallback: derive from root + quality intervals
    if (!midiNotes.length) {
      const rootName = chord.root?.name ?? (typeof chord.root === 'string' ? chord.root : null)
      if (!rootName) return
      const rootMidi = noteNameToMidi(rootName + '4')
      if (rootMidi === null) return
      const quality = chord.quality ?? 'major'
      const intervals = QUALITY_INTERVALS[quality] ?? [0, 4, 7]
      for (const interval of intervals) midiNotes.push(rootMidi + interval)
    }

    if (!midiNotes.length) return
    if (!instrument) {
      pendingNotes = midiNotes.map(midi => ({ midi, duration: 2 }))
      return
    }
    audioCtx.resume().then(() => {
      for (const midi of midiNotes) {
        instrument!.play(midi, audioCtx!.currentTime, { duration: 2, gain: volume })
      }
    })
  } catch { }
}

// ─── Note name → MIDI ────────────────────────────────────────────────────────

const PC_MAP: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
}

function noteNameToMidi(name: string): number | null {
  const m = name.match(/^([A-G][b#]?)(-?\d+)$/)
  if (!m) return null
  const pc = PC_MAP[m[1]]
  if (pc === undefined) return null
  return (parseInt(m[2]) + 1) * 12 + pc
}
