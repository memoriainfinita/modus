// Turns the FluidR3 soundfont files in .bench/samples (midi-js format: a script that assigns
// note names to base64 MP3 data URLs) into JSON, read as text: the scripts are not run.

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function convertSamples(dir, names) {
  for (const name of names) {
    const text = await readFile(join(dir, `${name}-mp3.js`), 'utf8')
    const notes = {}
    for (const m of text.matchAll(/"([A-G]b?\d)"\s*:\s*"data:audio\/mp3;base64,([A-Za-z0-9+/=]+)"/g)) notes[m[1]] = m[2]
    if (Object.keys(notes).length < 40) throw new Error(`${name}: only ${Object.keys(notes).length} notes read`)
    await writeFile(join(dir, `${name}.json`), JSON.stringify(notes))
  }
}
