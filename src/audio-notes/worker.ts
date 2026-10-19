// The notes a recording holds, heard by Spotify's Basic Pitch (Apache-2.0) in a worker, so the
// page does not stop while the model runs. Built on its own (dist/notes-worker.js) and loaded
// only when the microphone reads chords or the Player opens a file. The model is in vendor/.
//
// In: { id, audio } (mono, 22050 Hz). Out: { id, progress } while it runs, then { id, notes }
// or { id, error }.

import './worker-env'
import { BasicPitch, outputToNotesPoly, noteFramesToTime } from '@spotify/basic-pitch'

// The DOM's typings know self as a window; here it is the worker's scope
const post = (message: unknown) => (self as unknown as Worker).postMessage(message)

const model = new BasicPitch(new URL('../vendor/basic-pitch/model.json', self.location.href).href)
// One recording at a time: Basic Pitch keeps no state between calls, but the model is one
let queue = Promise.resolve()

self.onmessage = (e: MessageEvent<{ id: number; audio: Float32Array }>) => {
  const { id, audio } = e.data
  queue = queue.then(async () => {
    try {
      const frames: number[][] = [], onsets: number[][] = []
      await model.evaluateModel(audio, (f, o) => { frames.push(...f); onsets.push(...o) },
        p => post({ id, progress: p }))
      // The package's defaults: onset 0.5, frame 0.3, a note at least 11 frames (~127 ms)
      const notes = noteFramesToTime(outputToNotesPoly(frames, onsets, 0.5, 0.3, 11))
        .map(n => ({ midi: n.pitchMidi, start: n.startTimeSeconds, end: n.startTimeSeconds + n.durationSeconds }))
      post({ id, notes })
    } catch (err) {
      post({ id, error: String(err) })
    }
  })
}
