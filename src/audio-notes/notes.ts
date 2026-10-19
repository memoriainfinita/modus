// The page's side of the notes worker (worker.ts): audio in, the notes it holds out. Chords
// from audio go through here, from the microphone and from the Player. Bench: on FluidR3
// guitar samples Basic Pitch names the chord 97 % of the time, the old chromagram 16 %
// (scripts/bench, state.md).

/** A note heard: MIDI number, and when it starts and ends in seconds from the audio's start. */
export interface NoteEvent { midi: number; start: number; end: number }

export const MODEL_RATE = 22050

let worker: Worker | null = null
let nextId = 1
const waiting = new Map<number, { resolve: (n: NoteEvent[]) => void; reject: (e: Error) => void; progress?: (p: number) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker('dist/notes-worker.js')
  worker.onmessage = (e: MessageEvent<{ id: number; progress?: number; notes?: NoteEvent[]; error?: string }>) => {
    const w = waiting.get(e.data.id)
    if (!w) return
    if (e.data.progress !== undefined) { w.progress?.(e.data.progress); return }
    waiting.delete(e.data.id)
    if (e.data.notes) w.resolve(e.data.notes)
    else w.reject(new Error(e.data.error ?? 'notes worker'))
  }
  worker.onerror = e => {
    for (const w of waiting.values()) w.reject(new Error(e.message || 'notes worker failed'))
    waiting.clear()
    worker = null
  }
  return worker
}

/** The notes in a mono recording at 22050 Hz. `progress` from 0 to 1 while it runs. */
export function transcribe(audio: Float32Array, progress?: (p: number) => void): Promise<NoteEvent[]> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, progress })
    getWorker().postMessage({ id, audio }, [audio.buffer])
  })
}

/** Mono samples at any rate to the model's 22050 Hz, through the browser's own resampler. */
export async function toModelRate(samples: Float32Array, rate: number): Promise<Float32Array> {
  if (rate === MODEL_RATE) return samples.slice()
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(samples.length * MODEL_RATE / rate)), MODEL_RATE)
  const buf = ctx.createBuffer(1, samples.length, rate)
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
  // A copy: the worker takes its buffer, and an AudioBuffer's own may not be handed over
  return (await ctx.startRendering()).getChannelData(0).slice()
}

/**
 * The notes sounding at `time`, low to high, each once: those that started by then and end
 * no earlier than `slack` seconds before it (a note's end is read a little early by the model).
 */
export function soundingAt(notes: NoteEvent[], time: number, slack = 0.05): number[] {
  const on = notes.filter(n => n.start <= time && n.end >= time - slack).map(n => n.midi)
  return [...new Set(on)].sort((a, b) => a - b)
}
