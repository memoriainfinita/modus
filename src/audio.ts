let audioCtx: AudioContext | null = null
let player: WebAudioFontPlayer | null = null
let ready = false

function ensureContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext()
    player = new WebAudioFontPlayer()
    player.loader.decodeAfterLoading(audioCtx, '_tone_0000_GeneralUserGS_sf2_file')
  }
}

export function initAudioOnGesture() {
  if (ready) return
  ensureContext()
  audioCtx!.resume().then(() => { ready = true })
}

export function playNote(midiNumber: number, duration = 1.5) {
  if (!audioCtx || !player) return
  audioCtx.resume()
  player.queueWaveTable(
    audioCtx,
    audioCtx.destination,
    _tone_0000_GeneralUserGS_sf2_file,
    0,
    midiNumber,
    duration,
    0.8
  )
}

export function playNoteByName(noteName: string, duration = 1.5) {
  const midi = noteNameToMidi(noteName)
  if (midi !== null) playNote(midi, duration)
}

export function playChord(chordSymbol: string) {
  try {
    const chord = UMT.parseChordSymbol(chordSymbol)
    const notes = chord.getNotes ? chord.getNotes() : []
    for (const note of notes) {
      const name = note.name ?? note._name
      if (name) playNoteByName(name)
    }
  } catch { /* invalid symbol */ }
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
