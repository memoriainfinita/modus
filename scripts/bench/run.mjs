// Chord-from-audio bench: pnpm bench:audio. Needs the guitar samples in .bench/samples
// (acoustic_guitar_steel-mp3.js and acoustic_guitar_nylon-mp3.js from FluidR3_GM, the
// soundfont the app already uses). Builds bench.ts, serves the repo, runs it in the
// installed Chrome, muted and headless, and prints each method's scores.

import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { writeFile } from 'node:fs/promises'
import { serve } from '../../tests/e2e/serve.mjs'
import { convertSamples } from './samples.mjs'

const INSTRUMENTS = ['acoustic_guitar_steel', 'acoustic_guitar_nylon']
await convertSamples('.bench/samples', INSTRUMENTS)
await build({ entryPoints: ['scripts/bench/bench.ts'], bundle: true, format: 'iife', outfile: '.bench/bench.js', logLevel: 'warning' })
await writeFile('.bench/bench.html', '<!doctype html><meta charset="utf-8"><script src="/vendor/umt.js"></script><script src="/.bench/bench.js"></script>')

const { server, url } = await serve()
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] })
const page = await browser.newPage()
page.on('pageerror', e => console.error('page error:', e.message))
await page.goto(url + '.bench/bench.html')
const result = await page.evaluate(() => window.__bench, null)
await browser.close()
server.close()
if (result.error) { console.error(result.error); process.exit(1) }
await writeFile('.bench/results.json', JSON.stringify(result.rows, null, 1))

// Per method: share of right pitch classes, bass and name, by frame time and with noise
const rows = result.rows
const pct = (xs, k) => (100 * xs.filter(r => r[k]).length / xs.length).toFixed(0).padStart(4) + ' %'
const groups = [...new Set(rows.map(r => r.method))]
console.log('method            frame   noise    notes   bass   name   ms/read')
for (const m of groups) for (const at of [...new Set(rows.map(r => r.at))]) for (const noise of ['clean', '-30 dB']) {
  const xs = rows.filter(r => r.method === m && r.at === at && r.noise === noise)
  const ms = (xs.reduce((s, r) => s + r.ms, 0) / xs.length).toFixed(1)
  console.log(`${m.padEnd(17)} ${String(at).padEnd(6)}  ${noise.padEnd(7)} ${pct(xs, 'pcs')} ${pct(xs, 'bass')} ${pct(xs, 'name')}   ${ms}`)
}
