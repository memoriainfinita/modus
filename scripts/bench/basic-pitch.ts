// Spotify's Basic Pitch (Apache-2.0) on a buffer at 22050 Hz: the notes it hears, with
// their start and end in seconds. The model is the one the package ships.

import { BasicPitch, outputToNotesPoly, noteFramesToTime } from '@spotify/basic-pitch'

export const loadBasicPitch = async () => new BasicPitch('/node_modules/@spotify/basic-pitch/model/model.json')

export async function basicPitchNotes(bp: BasicPitch, audio22050: Float32Array): Promise<{ midi: number; start: number; end: number }[]> {
  const frames: number[][] = [], onsets: number[][] = []
  await bp.evaluateModel(audio22050, (f, o) => { frames.push(...f); onsets.push(...o) }, () => {})
  // The package's own defaults (onset 0.5, frame 0.3, minimum note 11 frames ≈ 127 ms)
  return noteFramesToTime(outputToNotesPoly(frames, onsets, 0.5, 0.3, 11))
    .map(n => ({ midi: n.pitchMidi, start: n.startTimeSeconds, end: n.startTimeSeconds + n.durationSeconds }))
}
