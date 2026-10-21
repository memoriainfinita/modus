// Writes the guitar takes for testing by hand into tests/manual, with an answer file: the
// chord at each time. Needs the bench's samples in .bench/samples (see run.mjs). Run:
// node scripts/bench/takes.mjs

import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import { serve } from '../../tests/e2e/serve.mjs'
import { convertSamples } from './samples.mjs'

const strum = (beats, every) => Array.from({ length: Math.ceil(beats / every) }, (_, i) => i * every)
const bar = (name, beats = 4, every = 2) => ({ name, beats, strums: strum(beats, every) })

const TAKES = [
  { file: '1-acordes-lentos.wav', instrument: 'acoustic_guitar_steel', bpm: 60, what: 'acero, 60 bpm, un rasgueo cada 2 s',
    chords: ['C', 'G', 'Am', 'F', 'D7'].map(n => bar(n, 2, 2)) },
  { file: '2-cancion-100bpm.wav', instrument: 'acoustic_guitar_nylon', bpm: 100, what: 'nylon, 100 bpm, 4/4, un acorde por compás',
    chords: ['Am', 'F', 'C', 'G', 'Dm7', 'G7', 'Cmaj7', 'E7', 'Am'].map(n => bar(n)) },
  { file: '3-cambios-rapidos.wav', instrument: 'acoustic_guitar_steel', bpm: 120, what: 'acero, 120 bpm, 4/4, dos acordes por compás',
    chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm7', 'G7', 'C'].map(n => bar(n, 2, 1)) },
  { file: '4-vamp-dorico.wav', instrument: 'acoustic_guitar_steel', bpm: 90, what: 'acero, 90 bpm, 4/4: Dm7 G7, un vamp en Re dórico',
    chords: ['Dm7', 'G7', 'Dm7', 'G7', 'Dm7', 'G7', 'Dm7', 'G7'].map(n => bar(n)) },
]

await convertSamples('.bench/samples', ['acoustic_guitar_steel', 'acoustic_guitar_nylon'])
await build({ entryPoints: ['scripts/bench/takes.ts'], bundle: true, format: 'iife', outfile: '.bench/takes.js', logLevel: 'warning' })
await writeFile('.bench/takes.html', '<!doctype html><meta charset="utf-8"><script src="/.bench/takes.js"></script>')

const { server, url } = await serve()
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] })
const page = await browser.newPage()
await page.goto(url + '.bench/takes.html')
const takes = await page.evaluate(t => window.__takes(t), TAKES)
await browser.close()
server.close()

await mkdir('tests/manual', { recursive: true })
const lines = ['Grabaciones de prueba: guitarra FluidR3, posiciones reales de guitarra. Acorde y segundo en que empieza.', '']
for (const [i, t] of takes.entries()) {
  await writeFile(`tests/manual/${t.file}`, Buffer.from(t.wav, 'base64'))
  const take = TAKES[i]
  let at = 0.2
  const times = take.chords.map(c => { const s = `${at.toFixed(1)} s ${c.name}`; at += c.beats * 60 / take.bpm; return s })
  lines.push(`${take.file} (${take.what})`, `  ${times.join(' · ')}`, '')
}
await writeFile('tests/manual/respuestas.txt', lines.join('\n'))
console.log(takes.map(t => t.file).join('\n'))
