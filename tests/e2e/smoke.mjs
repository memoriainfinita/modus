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

await check('paste splits measures at bar lines', async () => {
  await page.getByRole('button', { name: 'Paste' }).click()
  await page.fill('.paste-textarea', 'Dm7 G7 | Cmaj7')
  await page.getByRole('button', { name: 'Add chords' }).click()
  const rows = await page.locator('.measure-row').evaluateAll(rs => rs.map(r =>
    [...r.querySelectorAll('.chord-chip-symbol')].map(e => e.textContent).join(' ')))
  assert(rows.includes('Dm7 G7') && rows.includes('Cmaj7'), `measures: ${JSON.stringify(rows)}`)
})

await check('MIDI fill continues into the next measure', async () => {
  await page.locator('.chord-chip', { hasText: 'G7' }).hover()
  await page.locator('.chord-chip', { hasText: 'G7' }).locator('button', { hasText: '⊙' }).click()
  await play([62, 65, 69], 400)                 // Dm replaces G7
  await off([62, 65, 69])
  await play([64, 67, 71], 400)                 // Em replaces Cmaj7, in the next measure
  await off([64, 67, 71])
  const chips = await page.locator('.chord-chip-symbol').allInnerTexts()
  assert(chips.join(' ') === 'Dm7 Dm Em', `chips: ${chips.join(' ')}`)
  await page.keyboard.press('Escape')
})

await check('deleting a section can be undone', async () => {
  await page.locator('.section-header button', { hasText: '×' }).first().click()
  assert(await page.locator('.chord-chip').count() === 0, 'section still there')
  await page.locator('.undo-btn').click()
  assert(await page.locator('.chord-chip').count() === 3, 'undo did not restore')
})

await check('history Clear can be undone', async () => {
  const before = await page.locator('.history-chip').count()
  await page.locator('.history-clear-btn').click()
  assert(await page.locator('.history-chip').count() === 0, 'not cleared')
  await page.locator('.undo-btn').click()
  assert(await page.locator('.history-chip').count() === before, 'undo did not restore')
})

await check('clicking a history chip loads it in the detector', async () => {
  const first = await text('.history-chip-symbol')
  await page.locator('.history-chip').first().click()
  const shown = await text('.chord-name-badge')
  assert(shown === first, `detector shows ${shown}, chip ${first}`)
})

await check('CoF click plays without changing the key; double click sets it', async () => {
  await setKey('C Major')
  const g = page.locator('#cof-container [data-key="G Major"]')
  await g.click()
  assert(await page.inputValue('#key-select') === 'C Major', 'single click changed the key')
  assert((await text('.chord-name-badge')) === 'G', 'chord not shown')
  await page.waitForTimeout(500)
  await g.click()
  await g.click()
  assert(await page.inputValue('#key-select') === 'G Major', `key: ${await page.inputValue('#key-select')}`)
})

await check('CoF minor segment double click sets the minor key', async () => {
  const em = page.locator('#cof-container [data-key="E Minor"]')
  await em.click()
  await em.click()
  assert(await page.inputValue('#key-select') === 'E Minor', `key: ${await page.inputValue('#key-select')}`)
})

await check('on Auto, history chips show romans in the detected key', async () => {
  await setKey('')
  const label = await text('#auto-key-label')
  assert(label.startsWith('auto:'), `auto label: ${label}`)
  const romans = await page.locator('.history-chip-roman').allInnerTexts()
  assert(romans.length > 0 && romans.every(r => r !== '—'), `romans: ${romans.join(',')}`)
})

await check('guitar shows a short list of playable voicings, open shape first', async () => {
  await page.locator('#cof-container [data-chord="C"]').click()
  const count = await text('.guitar-voicing-count')
  const total = Number(count.split('/')[1])
  assert(count.startsWith('1/') && total > 3 && total < 30, `count: ${count}`)
})

await check('custom tuning rejects a non-note and keeps the string', async () => {
  await page.locator('.guitar-ctrl[data-action="toggle-tuner"]').click()
  const first = page.locator('.guitar-string-input').first()
  await first.fill('H')
  await first.press('Enter')
  assert(await page.locator('.guitar-string-input').first().inputValue() === 'E', 'invalid value kept')
  await page.locator('.guitar-string-input').first().fill('d')
  await page.locator('.guitar-string-input').first().press('Enter')
  assert(await page.locator('.guitar-string-input').first().inputValue() === 'D', 'not normalized')
  assert(await page.inputValue('.guitar-tuning-sel') === 'dropD', 'preset not detected')
  await page.selectOption('.guitar-tuning-sel', 'standard')
})

await check('staff +/- changes its size', async () => {
  const w = () => page.locator('#staff-container svg').evaluate(s => s.getBoundingClientRect().width)
  const before = await w()
  await page.click('#btn-staff-minus')
  const smaller = await w()
  await page.click('#btn-staff-plus')
  assert(smaller < before && Math.abs(await w() - before) < 1, `widths ${before} ${smaller}`)
})

await check('arrow keys walk the song and play each chord', async () => {
  await page.locator('.chord-chip', { hasText: 'Dm7' }).click()
  await page.keyboard.press('ArrowRight')
  assert((await text('.chord-name-badge')) === 'Dm', 'right arrow')
  await page.keyboard.press('ArrowRight')
  assert((await text('.chord-name-badge')) === 'Em', 'crosses into the next measure')
  await page.keyboard.press('ArrowLeft')
  assert((await text('.chord-name-badge')) === 'Dm', 'left arrow')
})

await check('Del removes the selected song chord, Undo restores it', async () => {
  await page.keyboard.press('Delete')
  let chips = await page.locator('.chord-chip-symbol').allInnerTexts()
  assert(chips.join(' ') === 'Dm7 Em', `after Del: ${chips.join(' ')}`)
  await page.locator('.undo-btn').click()
  chips = await page.locator('.chord-chip-symbol').allInnerTexts()
  assert(chips.join(' ') === 'Dm7 Dm Em', `after undo: ${chips.join(' ')}`)
  await page.keyboard.press('Escape')
})

await check('help panel lists the mouse gestures, no P shortcut', async () => {
  await page.click('#btn-help')
  const help = await text('#shortcut-help')
  assert(help.includes('Double-click a major or minor circle segment'), 'gestures missing')
  assert(!/\nP\n/.test(help), 'P still listed')
  await page.keyboard.press('Escape')
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
