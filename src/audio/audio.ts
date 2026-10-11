import { noteNameToMidi } from '../theory/notes'
import { chordNoteNames } from '../theory/chord'
import { loadNumber, loadString, save } from '../ui/storage'
import type { StringKey } from '../i18n/en'

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let instrument: any = null
let loadingInstrument = false

let volume = loadNumber('audio-volume', 0.8, 0, 1)
let currentInstrumentName = loadString('audio-instrument', 'acoustic_grand_piano')

export type AudioStatus = 'idle' | 'loading' | 'suspended' | 'ready' | 'error'
let audioStatus: AudioStatus = 'idle'
let onStatusChange: ((s: AudioStatus) => void) | null = null

/** The callback gets the current status at once: loading starts before the UI exists. */
export function setAudioStatusCallback(cb: (s: AudioStatus) => void) { onStatusChange = cb; cb(audioStatus) }

let onMissed: () => void = () => {}
/** Called when notes are dropped because the instrument cannot sound yet. */
export function setAudioMissedCallback(cb: () => void) { onMissed = cb }

function setStatus(s: AudioStatus) { audioStatus = s; onStatusChange?.(s) }

// Group names are string keys (i18n/en.ts); instrument names are the soundfont's own
export const GM_INSTRUMENT_GROUPS: { label: StringKey; instruments: string[] }[] = [
  { label: 'gm.piano', instruments: ['acoustic_grand_piano','bright_acoustic_piano','electric_grand_piano','honkytonk_piano','electric_piano_1','electric_piano_2','harpsichord','clavinet'] },
  { label: 'gm.chromatic', instruments: ['celesta','glockenspiel','music_box','vibraphone','marimba','xylophone','tubular_bells','dulcimer'] },
  { label: 'gm.organ', instruments: ['drawbar_organ','percussive_organ','rock_organ','church_organ','reed_organ','accordion','harmonica','tango_accordion'] },
  { label: 'gm.guitar', instruments: ['acoustic_guitar_nylon','acoustic_guitar_steel','electric_guitar_jazz','electric_guitar_clean','electric_guitar_muted','overdriven_guitar','distortion_guitar','guitar_harmonics'] },
  { label: 'gm.bass', instruments: ['acoustic_bass','electric_bass_finger','electric_bass_pick','fretless_bass','slap_bass_1','slap_bass_2','synth_bass_1','synth_bass_2'] },
  { label: 'gm.strings', instruments: ['violin','viola','cello','contrabass','tremolo_strings','pizzicato_strings','orchestral_harp','timpani'] },
  { label: 'gm.ensemble', instruments: ['string_ensemble_1','string_ensemble_2','synth_strings_1','synth_strings_2','choir_aahs','voice_oohs','synth_voice','orchestra_hit'] },
  { label: 'gm.brass', instruments: ['trumpet','trombone','tuba','muted_trumpet','french_horn','brass_section','synth_brass_1','synth_brass_2'] },
  { label: 'gm.reed', instruments: ['soprano_sax','alto_sax','tenor_sax','baritone_sax','oboe','english_horn','bassoon','clarinet'] },
  { label: 'gm.pipe', instruments: ['piccolo','flute','recorder','pan_flute','blown_bottle','shakuhachi','whistle','ocarina'] },
  { label: 'gm.lead', instruments: ['lead_1_square','lead_2_sawtooth','lead_3_calliope','lead_4_chiff','lead_5_charang','lead_6_voice','lead_7_fifths','lead_8_bass_lead'] },
  { label: 'gm.pad', instruments: ['pad_1_new_age','pad_2_warm','pad_3_polysynth','pad_4_choir','pad_5_bowed','pad_6_metallic','pad_7_halo','pad_8_sweep'] },
  { label: 'gm.fx', instruments: ['fx_1_rain','fx_2_soundtrack','fx_3_crystal','fx_4_atmosphere','fx_5_brightness','fx_6_goblins','fx_7_echoes','fx_8_sci-fi'] },
  { label: 'gm.ethnic', instruments: ['sitar','banjo','shamisen','koto','kalimba','bag_pipe','fiddle','shanai'] },
  { label: 'gm.percussive', instruments: ['tinkle_bell','agogo','steel_drums','woodblock','taiko_drum','melodic_tom','synth_drum','reverse_cymbal'] },
  { label: 'gm.soundFx', instruments: ['guitar_fret_noise','breath_noise','seashore','bird_tweet','telephone_ring','helicopter','applause','gunshot'] },
]

// Every note goes through the master gain, so the volume slider also moves notes already sounding.
function ensureContext() {
  if (audioCtx) return
  audioCtx = new AudioContext()
  masterGain = audioCtx.createGain()
  masterGain.gain.value = volume
  masterGain.connect(audioCtx.destination)
}

// Each load gets a token; a load that finishes after a newer one started is discarded,
// so switching instrument mid-load never leaves the previous instrument active.
let loadToken = 0

// The samples shipped with the app (scripts/vendor.mjs); any other instrument comes from the
// soundfont's host on first use, and the service worker keeps it for offline use.
const BUNDLED_INSTRUMENTS = new Set(['acoustic_grand_piano'])
const SAMPLE_HOST = 'https://gleitz.github.io/midi-js-soundfonts'

/** Where an instrument's samples are: shipped with the app, or on the soundfont's host. */
export function instrumentUrl(name: string): string {
  return BUNDLED_INSTRUMENTS.has(name)
    ? `vendor/soundfonts/FluidR3_GM/${name}-mp3.js`
    : `${SAMPLE_HOST}/FluidR3_GM/${name}-mp3.js`
}

function loadCurrentInstrument() {
  if (!audioCtx) return
  // Without the soundfont-player script the app still runs, silent.
  if (typeof Soundfont === 'undefined') {
    if (audioStatus !== 'error') console.error('[audio] soundfont-player did not load')
    setStatus('error')
    return
  }
  const token = ++loadToken
  loadingInstrument = true
  instrument = null
  setStatus('loading')
  Soundfont.instrument(audioCtx, currentInstrumentName, { soundfont: 'FluidR3_GM', destination: masterGain!, nameToUrl: instrumentUrl })
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

/**
 * Starts loading the instrument at page load. The context starts suspended (browsers
 * need a gesture to let it sound) but the samples download meanwhile, so the first
 * click finds the instrument ready.
 */
export function preloadAudio() {
  ensureContext()
  if (!instrument && !loadingInstrument) loadCurrentInstrument()
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
  if (audioCtx && masterGain) masterGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.02)
}

export function getVolume() { return volume }

// ─── Playback ────────────────────────────────────────────────────────────────

// Notes requested before the instrument can sound are dropped, not queued (a late note
// would sound out of time); the missed callback lets the UI say so.
function playableInstrument(): any {
  initAudioOnGesture()
  const inst = instrument
  if (!inst) { onMissed(); return null }
  // A suspended context only resumes on a user gesture. Without one (a MIDI note before
  // the first click) the resume would wait and fire every queued note at the next click.
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation
  if (audioCtx!.state === 'suspended' && activation && !activation.isActive) { onMissed(); return null }
  return inst
}

/** Runs now on a running context, so a note-off that follows finds its node. */
function whenRunning(fn: () => void) {
  if (audioCtx!.state === 'running') fn()
  else audioCtx!.resume().then(fn)
}

// A node can get stop() after it already ended or was stopped; that is harmless here.
function stopNode(node: any) {
  try { node?.stop(audioCtx!.currentTime) } catch { /* already stopped */ }
}

// Chords and notes played from history, song, CoF, arrows and Space: a new one cuts the
// previous one, so walking a progression does not pile chords up.
let previewNodes: any[] = []

/** Hears every preview (notes, seconds, whether it cuts the previous one): MIDI out. */
let onPreview: (midis: number[], seconds: number, cut: boolean) => void = () => {}
export function setPreviewListener(cb: typeof onPreview) { onPreview = cb }

function playPreview(midis: number[], duration: number) {
  if (!midis.length) return
  onPreview(midis, duration, true)
  const inst = playableInstrument()
  if (!inst) return
  whenRunning(() => {
    previewNodes.forEach(stopNode)
    previewNodes = midis.map(midi => inst.play(midi, audioCtx!.currentTime, { duration, gain: 1 }))
  })
}

/** A clicked piano key: does not cut what is sounding. */
export function playNoteByName(noteName: string, duration = 1.5) {
  const midi = noteNameToMidi(noteName)
  if (midi === null) return
  onPreview([midi], duration, false)
  const inst = playableInstrument()
  if (!inst) return
  whenRunning(() => inst.play(midi, audioCtx!.currentTime, { duration, gain: 1 }))
}

export function playNoteNames(noteNames: string[], duration = 2) {
  playPreview(noteNames.map(noteNameToMidi).filter((m): m is number => m !== null), duration)
}

/** Plays the chord as UMT spells it (same notes the staff and piano show). */
export function playChord(chordSymbol: string) {
  playNoteNames(chordNoteNames(chordSymbol))
}

// ─── Controller ──────────────────────────────────────────────────────────────

// Controller notes sound while the key (or the sustain pedal) holds them, with their
// velocity. Previews never cut them.
const liveNodes = new Map<number, any>()
const sustainedNotes = new Set<number>()
let pedalDown = false

export function velocityGain(velocity: number): number {
  return Math.max(0, Math.min(127, velocity)) / 127
}

function stopLive(midi: number) {
  stopNode(liveNodes.get(midi))
  liveNodes.delete(midi)
}

export function liveNoteOn(midi: number, velocity: number) {
  const inst = playableInstrument()
  if (!inst) return
  whenRunning(() => {
    stopLive(midi)  // a repeated key retriggers instead of stacking
    sustainedNotes.delete(midi)
    liveNodes.set(midi, inst.play(midi, audioCtx!.currentTime, { gain: velocityGain(velocity) }))
  })
}

export function liveNoteOff(midi: number) {
  if (pedalDown) { if (liveNodes.has(midi)) sustainedNotes.add(midi); return }
  stopLive(midi)
}

export function setSustain(down: boolean) {
  pedalDown = down
  if (down) return
  sustainedNotes.forEach(stopLive)
  sustainedNotes.clear()
}
