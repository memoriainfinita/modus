import { noteNameToMidi } from './midi'
import { chordNoteNames } from './chord'
import { loadNumber, loadString, save } from './storage'

let audioCtx: AudioContext | null = null
let instrument: any = null
let loadingInstrument = false

let volume = loadNumber('audio-volume', 0.8, 0, 1)
let currentInstrumentName = loadString('audio-instrument', 'acoustic_grand_piano')

export type AudioStatus = 'idle' | 'loading' | 'suspended' | 'ready' | 'error'
let audioStatus: AudioStatus = 'idle'
let onStatusChange: ((s: AudioStatus) => void) | null = null

export function setAudioStatusCallback(cb: (s: AudioStatus) => void) { onStatusChange = cb }

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

// Each load gets a token; a load that finishes after a newer one started is discarded,
// so switching instrument mid-load never leaves the previous instrument active.
let loadToken = 0

function loadCurrentInstrument() {
  if (!audioCtx) return
  const token = ++loadToken
  loadingInstrument = true
  instrument = null
  setStatus('loading')
  Soundfont.instrument(audioCtx, currentInstrumentName, { soundfont: 'FluidR3_GM' })
    .then((inst: any) => {
      if (token !== loadToken) return
      instrument = inst
      loadingInstrument = false
      setStatus(audioCtx!.state === 'suspended' ? 'suspended' : 'ready')
    })
    .catch((err: any) => {
      if (token !== loadToken) return
      loadingInstrument = false
      setStatus('error')
      console.error('[audio] load failed:', err)
    })
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
  save('audio-instrument', name)
  instrument = null
  if (audioCtx) loadCurrentInstrument()
}

export function getCurrentInstrument() { return currentInstrumentName }

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v))
  save('audio-volume', volume)
}

export function getVolume() { return volume }

// Single playback path: every play* call starts the context and the instrument load
// if needed. Notes requested before the instrument is ready are dropped, not queued.
function playMidi(midis: number[], duration: number) {
  initAudioOnGesture()
  const inst = instrument
  if (!inst || !midis.length) return
  audioCtx!.resume().then(() => {
    for (const midi of midis) inst.play(midi, audioCtx!.currentTime, { duration, gain: volume })
  })
}

export function playNote(midiNumber: number, duration = 1.5) {
  playMidi([midiNumber], duration)
}

export function playNoteByName(noteName: string, duration = 1.5) {
  const midi = noteNameToMidi(noteName)
  if (midi !== null) playMidi([midi], duration)
}

export function playNoteNames(noteNames: string[], duration = 2) {
  playMidi(noteNames.map(noteNameToMidi).filter((m): m is number => m !== null), duration)
}

/** Plays the chord as UMT spells it (same notes the staff and piano show). */
export function playChord(chordSymbol: string) {
  playNoteNames(chordNoteNames(chordSymbol))
}
