// Copies the libraries and the default piano samples the page loads into vendor/, at the
// versions pinned here, so the app is served whole and works offline. Run after a bump:
// pnpm vendor. The files are tracked in git, as dist/ is.

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// UMT comes from the devDependency (same tag as package.json); the rest from their sources
export const PINS = {
  umt: 'v0.11.0',
  notae: '81b58dee532f4827ccce2146f02d9ae9cc05c471',
  abcjs: '6.7.1',
  soundfontPlayer: '0.12.0',
}

/** The instruments shipped with the app; any other is fetched on first use and kept by the service worker. */
export const BUNDLED_INSTRUMENTS = ['acoustic_grand_piano']

const FILES = [
  { to: 'vendor/umt.js', from: { local: 'node_modules/umt/dist/umt.js' } },
  // Basic Pitch's model, for the notes worker (chords from audio); its code is bundled in dist/notes-worker.js
  { to: 'vendor/basic-pitch/model.json', from: { local: 'node_modules/@spotify/basic-pitch/model/model.json' } },
  { to: 'vendor/basic-pitch/group1-shard1of1.bin', from: { local: 'node_modules/@spotify/basic-pitch/model/group1-shard1of1.bin' } },
  { to: 'vendor/notae.js', from: { url: `https://cdn.jsdelivr.net/gh/memoriainfinita/notae@${PINS.notae}/dist/notae.js` } },
  { to: 'vendor/abcjs-basic-min.js', from: { url: `https://cdn.jsdelivr.net/npm/abcjs@${PINS.abcjs}/dist/abcjs-basic-min.js` } },
  { to: 'vendor/soundfont-player.min.js', from: { url: `https://cdn.jsdelivr.net/npm/soundfont-player@${PINS.soundfontPlayer}/dist/soundfont-player.min.js` } },
  ...BUNDLED_INSTRUMENTS.map(name => ({
    to: `vendor/soundfonts/FluidR3_GM/${name}-mp3.js`,
    from: { url: `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${name}-mp3.js` },
  })),
]

for (const f of FILES) {
  const body = f.from.local
    ? await readFile(join(ROOT, f.from.local))
    : Buffer.from(await (async () => {
        const res = await fetch(f.from.url)
        if (!res.ok) throw new Error(`${f.from.url}: ${res.status}`)
        return res.arrayBuffer()
      })())
  await mkdir(dirname(join(ROOT, f.to)), { recursive: true })
  await writeFile(join(ROOT, f.to), body)
  console.log(`${f.to}  ${(body.length / 1024).toFixed(0)} kB`)
}
