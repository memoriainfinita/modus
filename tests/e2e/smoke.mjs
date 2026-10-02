// End-to-end smoke test: serves the repo, opens index.html in the installed Chrome with a
// fake Web MIDI input, and walks the main flows. Needs network (UMT, notae, abcjs and the
// soundfont come from CDNs). Run: pnpm test:e2e  (HEADED=1 to watch it)

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' }

const server = createServer(async (req, res) => {
  const path = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return }
  try {
    const file = path.endsWith('\\') || path.endsWith('/') ? join(path, 'index.html') : path
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body)
  } catch { res.writeHead(404).end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const URL_ = `http://127.0.0.1:${server.address().port}/`

// Fake Web MIDI: one input whose name needs escaping; window.__midi(bytes) plays into it.
const FAKE_MIDI = () => {
  const input = { id: 'fake-1', name: '<b>Fake</b> Keys', onmidimessage: null }
  const access = { inputs: new Map([['fake-1', input]]), outputs: new Map(), onstatechange: null }
  navigator.requestMIDIAccess = async () => access
  window.__midi = bytes => input.onmidimessage?.({ data: new Uint8Array(bytes) })
}

const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED })
const results = []
let page

async function check(name, fn) {
  try { await fn(); results.push(['ok', name]) } catch (err) { results.push(['FAIL', name, err.message.split('\n')[0]]) }
  // A failed check must not leave keys held for the next one.
  await page.evaluate(() => { for (let n = 0; n < 128; n++) window.__midi([0x80, n, 0]) }).catch(() => {})
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }

const text = sel => page.locator(sel).first().innerText()
const on = notes => page.evaluate(ns => ns.forEach(n => window.__midi([0x90, n, 100])), notes)
const off = notes => page.evaluate(ns => ns.forEach(n => window.__midi([0x80, n, 0])), notes)
async function play(notes, holdMs = 100) { await on(notes); await page.waitForTimeout(holdMs); }
async function setKey(key) { await page.selectOption('#key-select', key); await page.waitForTimeout(50) }

async function freshPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(FAKE_MIDI)
  await context.addInitScript(() => { try { if (!sessionStorage.getItem('e2e')) { localStorage.clear(); sessionStorage.setItem('e2e', '1') } } catch {} })
  page = await context.newPage()
  page.errors = []
  page.on('pageerror', e => page.errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && !/soundfont|gleitz|Failed to load resource/i.test(m.text())) page.errors.push(m.text()) })
  await page.goto(URL_)
  await page.waitForFunction(() => window.UMT && window.Notae && window.ABCJS)
  await page.waitForTimeout(300)
}

await freshPage()

await check('loads without errors', async () => {
  assert(page.errors.length === 0, page.errors.join(' | '))
})

await check('MIDI device name is escaped', async () => {
  const opt = await text('#midi-device option')
  assert(opt === '<b>Fake</b> Keys', `option text: ${opt}`)
})

await check('C E G detected as C, roman I in C Major', async () => {
  await setKey('C Major')
  await play([60, 64, 67])
  assert((await text('.chord-name-badge')) === 'C', 'chord badge')
  assert((await text('#analysis-content')).includes('I'), 'roman')
  await off([60, 64, 67])
})

await check('D7 in C Major reads V7/V, secondary → V', async () => {
  await play([62, 66, 69, 72])
  const a = await text('#analysis-content')
  assert(a.includes('V7/V'), `analysis: ${a}`)
  assert(a.includes('→ V'), 'secondary row')
  await off([62, 66, 69, 72])
})

await check('piano keys carry data-note', async () => {
  const n = await page.locator('#piano-container rect[data-note]').count()
  assert(n === 48, `data-note keys: ${n}`)
})

await check('fretboard dots show note names', async () => {
  await play([60, 64, 67])
  const t = await page.locator('#neck-container text').allTextContents()
  assert(t.includes('E') && t.includes('G'), `neck texts: ${t.join(',')}`)
  await off([60, 64, 67])
})

await check('history logs a chord after 800 ms', async () => {
  await page.click('#zone2 .history-clear-btn').catch(() => {})
  await play([57, 60, 64], 900)
  await off([57, 60, 64])
  const chips = await page.locator('.history-chip-symbol').allInnerTexts()
  assert(chips[0] === 'Am', `chips: ${chips.join(',')}`)
})

await check('removing the newest chip lets the same chord log again', async () => {
  await page.locator('.history-chip').first().click({ button: 'right' })
  await play([57, 60, 64], 900)
  await off([57, 60, 64])
  const chips = await page.locator('.history-chip-symbol').allInnerTexts()
  assert(chips[0] === 'Am', `chips: ${chips.join(',')}`)
})

await check('changing MIDI mode clears a held chord', async () => {
  await page.click('#btn-hold')
  await play([60, 64, 67])
  await off([60, 64, 67])
  assert((await text('.chord-name-badge')) === 'C', 'hold keeps chord')
  await page.click('#btn-normal')
  assert(await page.locator('.chord-name-badge').count() === 0, 'detector still shows a chord')
})

await check('no orphan chord input after reload', async () => {
  await page.getByRole('button', { name: '+ Verse' }).click()
  await page.locator('.chord-add-btn').first().click()
  await page.waitForTimeout(100)
  assert(await page.locator('.chord-input').count() === 1, 'input opened')
  await page.reload()
  await page.waitForFunction(() => window.UMT)
  await page.waitForTimeout(200)
  assert(await page.locator('.chord-input').count() === 0, 'orphan input after reload')
})

await check('staff renders a key signature for F# Major', async () => {
  await setKey('F# Major')
  await play([66, 70, 73])
  assert(await page.locator('#staff-container svg').count() === 1, 'staff svg')
  await off([66, 70, 73])
})

await check('no errors after the walk', async () => {
  assert(page.errors.length === 0, page.errors.join(' | '))
})

await browser.close()
server.close()

for (const [status, name, why] of results) console.log(`${status === 'ok' ? '  ok  ' : '  FAIL'} ${name}${why ? ` — ${why}` : ''}`)
const failed = results.filter(r => r[0] !== 'ok').length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
