// End-to-end smoke test: serves the repo, opens index.html in the installed Chrome with a
// fake Web MIDI input, and walks the main flows. Needs network (UMT, notae, abcjs and the
// soundfont come from CDNs). Run: pnpm test:e2e  (HEADED=1 to watch it; E2E_ONLY="next" for the
// checks whose name holds "next")

import { chromium } from 'playwright-core'
import { serve } from './serve.mjs'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { server, url: URL_ } = await serve()

// Fake Web MIDI: one input whose name needs escaping; window.__midi(bytes, id) plays into it.
// window.__plug(id, name | null) plugs or unplugs a port. Chrome style (default): every
// access keeps the port, changes its state and fires statechange. Firefox style
// (__hotplug(false)): nothing fires and old accesses never change; only a new
// requestMIDIAccess sees the current ports.
const FAKE_MIDI = () => {
  const plugged = new Map([['fake-1', '<b>Fake</b> Keys']])
  const accesses = []
  let hotplug = true
  const port = (id, name) => ({ id, name, state: 'connected', onmidimessage: null })
  navigator.requestMIDIAccess = async () => {
    const synth = { id: 'synth-1', name: 'Fake Synth', state: 'connected', send: bytes => window.__sent.push([...bytes]) }
    const access = { inputs: new Map([...plugged].map(([id, name]) => [id, port(id, name)])), outputs: new Map([['synth-1', synth]]), onstatechange: null }
    accesses.push(access)
    return access
  }
  window.__midi = (bytes, id = 'fake-1') => {
    if (!plugged.has(id)) return
    for (const a of accesses) a.inputs.get(id)?.onmidimessage?.({ data: new Uint8Array(bytes) })
  }
  window.__hotplug = on => { hotplug = on }
  window.__sent = []   // what MIDI out sends to the fake synth
  window.__plug = (id, name) => {
    if (name) plugged.set(id, name); else plugged.delete(id)
    if (!hotplug) return
    for (const a of accesses) {
      const p = a.inputs.get(id) ?? port(id, name)
      p.state = name ? 'connected' : 'disconnected'
      if (name) p.name = name
      a.inputs.set(id, p)
      a.onstatechange?.({ port: p })
    }
  }
}

// The microphone is a WAV of A3 (220 Hz), looped by Chrome's fake capture device
const MIC_WAV = join(tmpdir(), 'modus-e2e-mic.wav')
writeFileSync(MIC_WAV, testWav(10))
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED, args: [
  '--mute-audio',   // muted: the app plays every chord
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${MIC_WAV}`,
] })
const results = []
let page

// E2E_ONLY="text|other" runs only the checks whose name holds one of them (case ignored),
// plus the first load: the checks of what a change touched, without the whole walk
const ONLY = process.env.E2E_ONLY?.toLowerCase().split('|').filter(Boolean)

async function check(name, fn) {
  if (ONLY?.length && results.length && !ONLY.some(o => name.toLowerCase().includes(o))) return
  try { await fn(); results.push(['ok', name]) } catch (err) {
    // A timeout says what it waited for and, last, why it could not act
    const lines = err.message.split('\n').map(l => l.trim()).filter(Boolean)
    const plain = lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, ''))   // without the terminal's colours
    const detail = /Timeout/.test(lines[0]) ? [plain.find(l => /locator\(|getBy/.test(l)), plain.at(-1)].filter(Boolean).join(' | ') : ''
    results.push(['FAIL', name, lines[0] + (detail ? ` (${detail})` : '')])
  }
  // A failed check must not leave keys held for the next one.
  await page.evaluate(() => { for (let n = 0; n < 128; n++) window.__midi([0x80, n, 0]) }).catch(() => {})
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }

const text = sel => page.locator(sel).first().innerText()
// A panel option lives in the panel's ⋯ menu: opened, the option clicked, closed with Esc
const option = async (panel, sel) => {
  await page.click(`#mod-${panel} .module-more`)
  await page.click(sel)
  await page.keyboard.press('Escape')
}
// A panel the Standard layout leaves out (Velocity), shown or hidden from the ▦ menu
const showPanel = async (id, shown = true) => {
  await page.click('#btn-layout')
  await page.setChecked(`#layout-menu input[data-module="${id}"]`, shown)
  await page.mouse.click(5, 990)
}
const on = notes => page.evaluate(ns => ns.forEach(n => window.__midi([0x90, n, 100])), notes)
const off = notes => page.evaluate(ns => ns.forEach(n => window.__midi([0x80, n, 0])), notes)
async function play(notes, holdMs = 100) { await on(notes); await page.waitForTimeout(holdMs); }
// Opens Settings at a section; Esc closes it
async function openSettings(section) {
  await page.click('#btn-settings')
  await page.click(`.set-nav-item[data-section="${section}"]`)
}
// A choice in Settings: its row opens the list, the option is picked
async function pickSetting(id, value) {
  await page.click(`[data-pick="${id}"]`)
  await page.click(`.set-pick-list [data-pick-value="${value}"]`)
}
// The key from the bar's key menu: Auto, or Major/Minor and the tonic
async function setKey(key) {
  await page.click('#btn-key')
  if (!key) await page.click('#key-auto')
  else {
    await page.click(`#key-menu [data-keymode="${key.endsWith('Minor') ? 'minor' : 'major'}"]`)
    await page.click(`#key-grid [data-key="${key}"]`)
  }
  await page.waitForTimeout(50)
}
// The MIDI mode from the input menu (the bar's status opens it), left closed
async function mode(m) {
  if (await page.getAttribute('#btn-input-status', 'aria-expanded') !== 'true') await page.click('#btn-input-status')
  await page.click(`#btn-${m}`)
  await page.click('#btn-input-status')
}

async function freshPage() {
  // Dark system theme, the page's look before themes; the light one is checked on its own
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', colorScheme: 'dark' })
  await context.addInitScript(FAKE_MIDI)
  await context.addInitScript(() => { try { if (!sessionStorage.getItem('e2e')) { localStorage.clear(); sessionStorage.setItem('e2e', '1') } } catch {} })
  page = await context.newPage()
  // A click on something that is not there fails in 10 s, not Playwright's 30: one broken
  // check costs seconds, not minutes, before the next one runs
  page.setDefaultTimeout(10000)
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

await check('a page loads at its top, not scrolled down to the song (desktop and phone)', async () => {
  const at = []
  for (const opts of [{ viewport: { width: 1280, height: 720 } }, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
    const context = await browser.newContext({ ...opts, locale: 'en-US' })
    const p = await context.newPage()
    await p.goto(URL_)
    await p.waitForFunction(() => window.UMT && window.Notae)
    await p.waitForTimeout(800)
    at.push(await p.evaluate(() => window.scrollY))
    await context.close()
  }
  assert(at.every(y => y === 0), `scrolled to: ${at}`)
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

await check('D7 in C Major reads V7/V, secondary → V; the explanation says what that means', async () => {
  await play([62, 66, 69, 72])
  const a = await text('#analysis-content')
  assert(a.includes('V7/V'), `analysis: ${a}`)
  assert(a.includes('→ V'), 'secondary row')
  const ex = await text('#explain-container')
  assert(ex.includes('a secondary dominant, the dominant of G (V)'), `explanation: ${ex}`)
  await off([62, 66, 69, 72])
})

await check('C3 D4 F#4 A4 reads D over C, an upper structure, in Analysis and Explanation', async () => {
  await play([48, 62, 66, 69])
  const a = await text('#analysis-content')
  assert(a.includes('D over C · upper structure · 9 #11 13'), `analysis: ${a}`)
  assert((await text('#explain-container')).includes('heard as one chord on C'), 'explanation')
  await off([48, 62, 66, 69])
})

await check('harmonic rhythm: two chords of 1.5 s each, a change every 1.5 s under the history', async () => {
  await page.click('.history-clear-btn').catch(() => {})
  for (const chord of [[60, 64, 67], [65, 69, 72]]) {
    await on(chord)
    await page.waitForTimeout(1500)
    await off(chord)
    await page.waitForTimeout(300)
  }
  const line = await text('.history-rhythm')
  const s = parseFloat(line.match(/every ([\d.]+) s/)?.[1] ?? 'NaN')
  assert(Math.abs(s - 1.5) < 0.3, `rhythm: ${line}`)
})

await check('Next (Study layout): A7 in C Major resolves to Dm7; a click plays it and shows it after A7', async () => {
  await page.click('#btn-layout'); await page.click('#layout-menu [data-preset="study"]'); await page.mouse.click(5, 990)
  await play([57, 61, 64, 67])
  const next = await text('#next-container')
  assert(next.includes('V7/ii') && next.includes('Dm7'), `next: ${next}`)
  await off([57, 61, 64, 67])
  // Released, Next keeps A7: not the chord its last notes made on the way up
  await page.click('#next-container .key-chord[data-chord="Dm7"]')
  assert((await text('.chord-name-badge')) === 'Dm7', 'picked chord on screen')
  assert((await text('#next-container')).includes('G7'), 'Dm7 leads to G7')
  // Under the list, what may stand for Dm7; a substitute takes its place, after the chord before it
  const subs = await text('#next-container .next-subs')
  assert((await text('#next-container .next-heading')).includes('Dm7') && subs.includes('Fm7'), `substitutes: ${subs}`)
  await page.click('#next-container .next-subs .key-chord[data-chord="Fm7"]')
  assert((await text('.chord-name-badge')) === 'Fm7', 'substitute on screen')
  // A suggestion offers the usual borrowings that may stand for it, from their mode
  await page.click('#next-container .next-subs .key-chord[data-chord="Fmaj7"]')
  const alts = await page.locator('#next-container .next-list:not(.next-subs) .next-alt').allTextContents()
  assert(alts.length > 0, 'borrowings offered after Fmaj7')
  await page.click('#btn-layout'); await page.click('#layout-menu [data-preset="standard"]'); await page.mouse.click(5, 990)
})

await check('piano keys carry data-note', async () => {
  const n = await page.locator('#piano-container rect[data-note]').count()
  assert(n >= 24 && n <= 84 && n % 12 === 0, `data-note keys: ${n}`)   // whole octaves, as many as the panel holds
})

await check('strings panel, neck view: every note sounding on the neck, named; shapes again', async () => {
  await page.click('.strings-tab[data-view="neck"]')
  await play([60, 64, 67])
  const t = await page.locator('#guitar-container text').allTextContents()
  assert(t.includes('E') && t.includes('G'), `neck texts: ${t.join(',')}`)
  await off([60, 64, 67])
  await page.click('.strings-tab[data-view="shapes"]')
  assert(await page.locator('#guitar-container .guitar-nav').count() === 0, 'no chord, no voicing list')
})

await check('strings panel, scale view: A minor on the whole neck, by CAGED shapes, the chord sounding coloured; the pentatonic; the piano marks the scale', async () => {
  const shot = async name => { if (process.env.E2E_SHOTS) await page.locator(`#mod-${name}`).screenshot({ path: join(process.env.E2E_SHOTS, `${name}-${Date.now()}.png`) }) }
  const caption = () => text('#guitar-container .strings-caption')
  const token = name => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(`--${n}`).trim(), name)
  const fills = sel => page.locator(sel).evaluateAll(cs => cs.map(c => c.getAttribute('fill')))
  await setKey('A Minor')
  await page.click('.strings-tab[data-view="scale"]')
  await page.click('.strings-system[data-system="neck"]')
  const t = await page.locator('#guitar-container .strings-drawing text').allTextContents()
  assert(t.includes('♭3') && t.includes('♭7') && !t.includes('3'), `degrees: ${t.join(',')}`)
  assert(await page.locator('#guitar-container .strings-drawing circle[fill="none"]').count() === 6, 'every open string is in A minor')
  await shot('guitar')
  await page.click('.strings-system[data-system="caged"]')
  assert((await caption()).startsWith('A Minor · Em shape · frets 5–8'), `caption: ${await caption()}`)
  await page.click('#guitar-container .guitar-nav[data-dir="1"]')
  assert((await caption()).includes('Dm shape'), `next shape: ${await caption()}`)
  await page.click('#guitar-container .guitar-nav[data-dir="-1"]')
  // E major sounding: its E and B in the dominant's colour; its G# is not in the scale
  await on([52, 56, 59])
  await page.waitForTimeout(100)
  const dominant = await fills('#guitar-container .strings-drawing circle')
  const d = await token('fn-d')
  assert(dominant.filter(f => f === d).length >= 4, `dominant dots: ${dominant.join(',')}`)
  await shot('guitar')
  await off([52, 56, 59])
  await option('guitar', '#strings-menu [data-scale="pentatonic"]')
  assert(/pentatonic/i.test(await caption()), `pentatonic: ${await caption()}`)
  assert(await page.locator('.strings-system[data-system="3nps"]').count() === 0, 'no three notes per string on a pentatonic')
  await option('guitar', '#strings-menu [data-scale="key"]')
  await page.click('.strings-tab[data-view="shapes"]')
  await option('piano', '#btn-piano-scale')
  const marks = await fills('#piano-container circle')
  const quiet = await token('piano-scale'), tonic = await token('piano-scale-root')
  assert(marks.filter(f => f === quiet).length >= 12 && marks.filter(f => f === tonic).length >= 2, `piano marks: ${marks.join(',')}`)
  await shot('piano')
  await option('piano', '#btn-piano-scale')
  assert(await page.locator(`#piano-container circle[fill="${quiet}"]`).count() === 0, 'scale off')
})

await check('history logs a chord after 800 ms', async () => {
  await page.click('#mod-history .history-clear-btn').catch(() => {})
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

await check('history marks the cadence between two chips: G7 → C is Authentic in C Major', async () => {
  await setKey('C Major')
  await play([55, 59, 62, 65], 900)
  await off([55, 59, 62, 65])
  await play([60, 64, 67], 900)
  await off([60, 64, 67])
  const strip = await page.locator('#mod-history .history-strip > *').allInnerTexts()
  assert(strip.slice(0, 3).join('|').replace(/\s+/g, ' ') === 'C I|Authentic|G7 V7', `strip: ${strip.slice(0, 3).join('|')}`)
})

await check('voice leading: each voice from the chord before; staff and piano can show it', async () => {
  // G7 (G3 B3 D4 F4) is the chip before C: play C as C3 C4 E4 G4
  await play([48, 60, 64, 67])
  const rows = await page.locator('#analysis-content .analysis-row').evaluateAll(rs => rs.map(r => [r.children[0].textContent, r.children[1].textContent]))
  const voices = rows.find(([l]) => l === 'Voices')?.[1] ?? ''
  assert(voices.startsWith('G→C ↓7  B→C ↑1  D→E ↑2  F→G ↑2'), `voices: ${voices}`)
  assert(await page.locator('.staff-prev').count() === 0, 'faded before the toggle')
  await option('staff', '#btn-staff-prev')
  assert(await page.locator('#btn-piano-prev').getAttribute('class').then(c => c.includes('active')), 'piano button not lit')
  assert(await page.locator('#staff-container .staff-prev').count() >= 2, 'chord before not on the staff')
  const lit = await page.locator('#piano-container rect[data-note]').evaluateAll(rs => rs.filter(r => r.getAttribute('fill') && !/^(#fff|#ffffff|white)$/i.test(r.getAttribute('fill'))).length)
  assert(lit >= 6, `piano keys lit: ${lit}`)
  await option('piano', '#btn-piano-prev')
  assert(await page.locator('#staff-container .staff-prev').count() === 0, 'still faded')
  await off([48, 60, 64, 67])
})

const pickProgression = id => page.click(`#progressions-container [data-prog="${id}"]`)
// The player's speed, stepped with − and + until it reads the percent asked for
async function setSpeed(pct) {
  for (let i = 0; i < 10; i++) {
    const now = parseInt(await text('.player-speed-value'))
    if (now === pct) return
    await page.click(`#player-container [data-speed="${now > pct ? -1 : 1}"]`)
  }
}

await check('progressions: a ii-V-I in the key; a click shows the chord, ▶ walks it', async () => {
  await setKey('F Major')
  await pickProgression('ii-V-I')
  const chips = await page.locator('.prog-chip-symbol').allInnerTexts()
  assert(chips.join(' ') === 'Gm7 C7 Fmaj7', `chips: ${chips}`)
  assert((await text('#progressions-container .history-cadence')).length > 0, 'no cadence tag')
  await page.locator('.prog-chip').nth(1).click()
  assert(await text('.chord-name-badge') === 'C7', `badge: ${await text('.chord-name-badge')}`)
  await page.click('#prog-play')
  await page.waitForFunction(() => document.querySelector('.chord-name-badge')?.textContent === 'Gm7')
  await page.waitForFunction(() => document.querySelector('.chord-name-badge')?.textContent === 'C7', null, { timeout: 4000 })
  await page.click('#prog-play')
  assert(await page.locator('.prog-chip.playing').count() === 0, 'still playing')
  await pickProgression('ii-V-i')
  assert(await text('#progressions-container .prog-key') === 'F Minor', `minor key: ${await text('#progressions-container .prog-key')}`)
  await page.click('#progressions-container [data-group="blues"]')
  assert((await page.locator('#progressions-container [data-prog="blues-12"]').getAttribute('aria-pressed')) === 'true', 'a kind does not pick its first')
  await page.click('#progressions-container [data-group="jazz"]')
  await pickProgression('ii-V-I')
  await setKey('')
})

await check('ear training: a chord plays unseen; once named, the score counts and the detector shows it', async () => {
  await page.click('.ear-mode[data-mode="chord"]')
  assert(await page.locator('.ear-answer:not([disabled])').count() === 0, 'answers open before a question')
  const before = await page.evaluate(() => document.querySelector('.chord-name-badge')?.textContent ?? '')
  await page.click('#ear-new')
  await page.waitForTimeout(100)
  assert(await page.evaluate(() => document.querySelector('.chord-name-badge')?.textContent ?? '') === before, 'the question was shown')
  await page.locator('.ear-answer').first().click()
  const feedback = await text('.ear-feedback')
  assert(/^(Right|It was)/.test(feedback), `feedback: ${feedback}`)
  assert(/^right [01] of 1$/.test(await text('.ear-score')), `score: ${await text('.ear-score')}`)
  assert(await page.locator('.ear-answer.ear-correct').count() === 1, 'right answer not marked')
  assert((await text('.chord-name-badge')).length > 0, 'answer not shown in the detector')
  await page.click('.ear-mode[data-mode="cadence"]')
  await page.click('#ear-new')
  await page.locator('.ear-answer').first().click()
  assert((await text('.ear-feedback')).includes('Major'), `cadence feedback: ${await text('.ear-feedback')}`)
  // Degrees: answered in movable do; the note shown in the key its cadence set, read as a degree
  await page.click('.ear-mode[data-mode="degree"]')
  const syllables = await page.locator('.ear-answer').allInnerTexts()
  assert(syllables.join(' ') === 'do re mi fa sol la ti', `degree answers: ${syllables.join(' ')}`)
  await page.click('#ear-new')
  await page.locator('.ear-answer').first().click()
  assert((await text('.ear-feedback')).includes('Major'), `degree feedback: ${await text('.ear-feedback')}`)
  assert(/Major/.test(await page.locator('#btn-key').innerText()), 'the key of the cadence not set')
  await setKey('')
})

// A WAV file of `seconds` of a quiet 220 Hz tone, mono 8 kHz 16-bit: something the player can open
function testWav(seconds) {
  const rate = 8000, n = rate * seconds, buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * i / rate) * 3000), 44 + i * 2)
  return buf
}

await check('player: a recording opens with its length and waveform; speed, A–B loop, back 5 s', async () => {
  assert(await page.locator('#player-container [data-act="play"]').isDisabled(), 'play before a file')
  await page.setInputFiles('#player-container input[type=file]', { name: 'take.wav', mimeType: 'audio/wav', buffer: testWav(3) })
  await page.waitForFunction(() => document.querySelector('.player-time')?.textContent?.endsWith('/ 0:03'))
  assert(await text('.player-name') === 'take.wav', 'file name')
  await page.waitForFunction(() => {
    const c = document.querySelector('.player-wave')
    const g = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let lit = 0
    for (let i = 3; i < g.length; i += 4) if (g[i]) lit++
    return lit > c.width * 4
  }, null, { timeout: 5000 })
  await setSpeed(50)
  await page.click('#player-container [data-act="play"]')
  await page.waitForTimeout(600)
  await page.click('#player-container [data-act="a"]')
  await page.waitForTimeout(400)
  await page.click('#player-container [data-act="b"]')
  const a = await text('#player-container [data-act="a"]'), b = await text('#player-container [data-act="b"]')
  const secs = s => { const [m, rest] = s.slice(2).split(':'); return Number(m) * 60 + Number(rest) }
  assert(a.startsWith('A ') && b.startsWith('B ') && secs(b) > secs(a), `loop: ${a} ${b}`)
  await page.waitForTimeout(900)
  const t = await text('.player-time')
  assert(secs('x ' + t.split(' / ')[0]) <= secs(b) + 0.3, `the loop did not hold it: ${t} (B ${b})`)
  await page.click('#player-container [data-act="play"]')
  await page.click('#player-container [data-act="clear"]')
  await setSpeed(100)
})

// A chord as a string instrument sounds: each note with harmonics that fade, struck together
function chordWav(midis, seconds) {
  const rate = 22050, n = rate * seconds, buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const t = i / rate
    let v = 0
    for (const m of midis) {
      const f = 440 * 2 ** ((m - 69) / 12)
      for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * h * t) * Math.exp(-t * (0.8 + h * 0.4)) / h
    }
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 2500))), 44 + i * 2)
  }
  return buf
}

await check('player chords: a recorded C chord is read, and the playhead shows it in the detector; off lets it go', async () => {
  await page.setInputFiles('#player-container input[type=file]', { name: 'chord.wav', mimeType: 'audio/wav', buffer: chordWav([48, 52, 55, 60, 64], 3) })
  // The model loads and reads the 3 s in the worker
  await page.waitForFunction(() => document.querySelector('.player-name')?.textContent === 'chord.wav')
  // The reading line is empty before the reading starts too: first it starts (a % shows), then it ends
  await page.waitForFunction(() => /%/.test(document.querySelector('.player-reading')?.textContent ?? ''), null, { timeout: 10000 })
  await page.waitForFunction(() => document.querySelector('.player-reading')?.textContent === '', null, { timeout: 30000 })
    .catch(async () => { throw new Error(`reading: "${await text('.player-reading')}" errors: ${page.errors.join(' | ')}`) })
  // On the waveform itself (scrolled into view), a third of the way: 1 s into the chord
  const wave = page.locator('.player-wave')
  const size = await wave.evaluate(c => ({ w: c.clientWidth, h: c.clientHeight }))
  await wave.click({ position: { x: size.w / 3, y: size.h / 2 } })
  await page.waitForFunction(() => document.querySelector('.chord-name-badge')?.textContent === 'C', null, { timeout: 3000 })
    .catch(async () => { throw new Error(`chord: ${await text('#chord-summary')}`) })
  await page.click('#player-container [data-act="chords"]')
  assert(await page.getAttribute('#player-container [data-act="chords"]', 'aria-pressed') === 'false', 'chords still on')
  await page.waitForFunction(() => document.querySelector('.chord-name-badge')?.textContent !== 'C', null, { timeout: 3000 })
    .catch(async () => { throw new Error(`still held: ${await text('#chord-summary')}`) })
})

await check('microphone: a sung A3 shows on the tuner and in the detector as a note; off lets it go', async () => {
  await page.click('#btn-input-status')
  await page.click('#menu-mic')
  await page.click('#btn-input-status')
  await page.waitForFunction(() => document.querySelector('.tuner-note')?.textContent === 'A3', null, { timeout: 5000 })
  assert((await text('.tuner-detail')).includes('Hz'), `detail: ${await text('.tuner-detail')}`)
  await page.waitForFunction(() => document.querySelector('#analysis-content')?.textContent?.includes('A3'), null, { timeout: 3000 })
  assert(await page.locator('#menu-mic.active-mode').count() === 1, 'input menu row not lit')
  assert(await page.locator('#btn-input-status [data-on="mic"]').isVisible(), 'the bar does not show the open microphone')
  await page.click('#tuner-mic')
  assert(await page.locator('#btn-input-status [data-on="mic"]').isHidden(), 'the bar still shows the microphone')
  assert(await text('.tuner-note') === '—', 'tuner still shows a note')
  assert(!(await text('#analysis-content')).includes('MIDI 57'), 'the note is still held')
})

await check('screen reader: a chord is said once while held, even when the auto key comes; nothing of its release; again when played again', async () => {
  await setKey('')
  await page.click('#mod-history .history-clear-btn').catch(() => {})
  await page.waitForTimeout(600)   // what the checks before left to say is said before listening
  await page.evaluate(() => {
    window.__said = []
    let last = document.getElementById('sr-live')?.textContent ?? ''   // said before: not counted
    new MutationObserver(() => {
      const now = document.getElementById('sr-live')?.textContent ?? ''
      if (now && now !== last) window.__said.push(now)
      last = now
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
  })
  await play([60, 64, 67], 1500)   // logged after 800 ms: the auto key comes while it is held
  await off([60, 64, 67])
  await page.waitForTimeout(600)
  await play([60, 64, 67], 600)
  await off([60, 64, 67])
  await page.waitForTimeout(600)
  const said = await page.evaluate(() => window.__said)
  assert(said.length === 2 && said.every(s => s.startsWith('C major')), `said: ${JSON.stringify(said)}`)
})

await check('keyboard and screen reader: circle, buttons, panels and chips work from the keyboard; the chord is announced', async () => {
  await setKey('C Major')
  await page.focus('#cof-container [data-chord="G"]')
  await page.keyboard.press('Enter')
  assert(await text('.chord-name-badge') === 'G', `Enter on the circle: ${await text('.chord-name-badge')}`)
  await page.waitForFunction(() => document.getElementById('sr-live')?.textContent?.startsWith('G major, V, Dominant'), null, { timeout: 2000 })
  // Space on a focused button presses it, and does not play the chord
  await page.click('#btn-input-status')
  await page.focus('#btn-hold')
  await page.keyboard.press(' ')
  assert((await page.getAttribute('#btn-hold', 'class')).includes('active'), 'Space did not press Hold')
  await mode('normal')
  // Panels: arrows move, Shift + arrows resize
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('layout') ?? 'null')?.find(c => c.id === 'staff') ?? null)
  await page.focus('#mod-staff .module-header')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('layout')).find(c => c.id === 'staff'))
  assert(after.x === (before?.x ?? 0) + 1 && after.h === (before?.h ?? 11) + 1, `moved: ${JSON.stringify(before)} → ${JSON.stringify(after)}`)
  await page.waitForFunction(() => document.getElementById('sr-live')?.textContent?.startsWith('Staff: column'), null, { timeout: 2000 })
    .catch(async () => { throw new Error(`announced: ${await page.textContent('#sr-live')}`) })
  await page.click('#btn-layout'); await page.click('#layout-menu [data-preset="standard"]'); await page.mouse.click(5, 990)
  // History chips: Enter shows the chord
  await page.focus('#mod-history .history-chip')
  await page.keyboard.press('Enter')
  assert((await text('.chord-name-badge')).length > 0, 'Enter on a chip')
  // Icon buttons have a name; diagrams are named images
  assert((await page.getAttribute('#btn-play-chord', 'aria-label'))?.length > 3, 'play button has no name')
  assert((await page.getAttribute('#staff-container', 'aria-label'))?.startsWith('Staff:'), 'staff has no name')
  assert(await page.getAttribute('#btn-layout', 'aria-expanded') === 'false', 'menu state')
  await setKey('')
})

await check('help: the panels are described; the guided tour starts from it, moves with the arrows, Esc ends it', async () => {
  assert(await page.locator('#tour').count() === 0, 'the tour started by itself under test')
  await page.click('#btn-help')
  assert((await text('#shortcut-help')).includes('Each term of the analysis, in words'), 'panels not described')
  await page.click('#help-tour')
  assert(await page.locator('#shortcut-help').count() === 0, 'help left open')
  assert(await text('.tour-count') === '1 / 10', `step: ${await text('.tour-count')}`)
  await page.keyboard.press('ArrowRight')
  assert(await text('.tour-title') === 'Play', `step 2: ${await text('.tour-title')}`)
  assert(await page.locator('.tour-spot').count() === 1, 'no spotlight on the device select')
  await page.click('[data-tour="next"]')
  await page.click('[data-tour="back"]')
  assert(await text('.tour-count') === '2 / 10', 'back')
  await page.keyboard.press('Escape')
  assert(await page.locator('#tour').count() === 0, 'Esc did not end it')
  assert(await page.evaluate(() => localStorage.getItem('tour-done')) === 'true', 'not remembered')
})

await check('settings: sections, search, a preference applied at once, reset of a section', async () => {
  await openSettings('theory')
  assert(await page.locator('.set-section[data-section="theory"]:not([hidden])').count() === 1, 'theory not shown')
  await pickSetting('pref-chord-style', 'symbols')
  assert(await text('[data-shows="pref-chord-style"]') === 'CΔ7', 'the row does not show the choice')
  await page.keyboard.press('Escape')
  await page.locator('#cof-container [data-chord="C"]').click()
  await page.waitForTimeout(450)
  await page.fill('#typed-chord', 'Cmaj7')
  await page.keyboard.press('Enter')
  assert(await text('.chord-name-badge') === 'CΔ7', `style not applied: ${await text('.chord-name-badge')}`)
  await page.click('#btn-settings')
  await page.fill('#set-search', 'micro')
  const shown = await page.locator('.set-section:not([hidden])').evaluateAll(es => es.map(e => e.dataset.section))
  assert(shown.includes('mic'), `search: ${shown}`)
  await page.fill('#set-search', '')
  await page.click('.set-nav-item[data-section="theory"]')
  await page.click('.set-section[data-section="theory"] .set-more')
  await page.click('.set-section[data-section="theory"] [data-reset-section]')
  assert(await page.inputValue('#pref-chord-style') === 'standard', 'not reset')
  assert(await text('[data-shows="pref-chord-style"]') === 'Cmaj7', 'the row does not show the reset')
  await page.click('.set-section[data-section="theory"] .set-row .set-info')
  assert(await page.locator('.set-section[data-section="theory"] .set-row .set-hint').first().isVisible(), 'ⓘ shows no explanation')
  await page.keyboard.press('Escape')
  assert(await page.locator('#settings').isHidden(), 'Esc did not close')
  await page.fill('#typed-chord', '')
})

await check('shortcuts: a key changed in Settings runs its action; a taken key asks; reset brings it back', async () => {
  await openSettings('shortcuts')
  await page.click('[data-key-change="hold"]')
  await page.keyboard.press('j')
  assert((await text('#set-shortcuts')).includes('J'), 'J not shown')
  await page.click('[data-key-add="hold"]')
  await page.keyboard.press('p')
  assert(await page.locator('.set-conflict').count() === 1, 'no conflict asked for P')
  await page.click('[data-conflict-other]')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.keyboard.press('j')
  assert((await page.getAttribute('#btn-hold', 'class')).includes('active'), 'J did not toggle Hold')
  await page.keyboard.press('h')
  assert((await page.getAttribute('#btn-hold', 'class')).includes('active'), 'H still toggles Hold')
  await mode('normal')
  await openSettings('shortcuts')
  await page.click('[data-key-reset="hold"]')
  await page.keyboard.press('Escape')
  await page.keyboard.press('h')
  assert((await page.getAttribute('#btn-hold', 'class')).includes('active'), 'H not back')
  await mode('normal')
  await page.keyboard.press(',')
  assert(await page.locator('#settings').isVisible(), ', did not open Settings')
  await page.keyboard.press('Escape')
})

await check('settings data: export and import round trip; reset offers Undo', async () => {
  await openSettings('data')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-export-settings]')])
  const body = await (await dl.createReadStream()).toArray().then(c => Buffer.concat(c).toString())
  const file = JSON.parse(body)
  assert(file.app === 'modus' && file.kind === 'settings' && !Object.keys(file.data).some(k => k.startsWith('modus-song')), 'export content')
  await page.setInputFiles('[data-import-settings]', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"x":1}') })
  assert((await text('.set-error')).length > 0, 'a bad file was not refused')
  await page.keyboard.press('Escape')
})

await check('view window: the chord view follows the detector, alone on the chroma background', async () => {
  await page.click('#btn-views')
  const [view] = await Promise.all([page.context().waitForEvent('page'), page.click('#view-menu [data-view="chord"]')])
  await view.waitForFunction(() => window.UMT && window.Notae && document.getElementById('view-content'))
  assert(await view.title() === 'Modus view: chord', `title: ${await view.title()}`)
  assert(!(await view.locator('#app').isVisible()), 'the app shows in the view window')
  const bg = await view.evaluate(() => getComputedStyle(document.body).backgroundColor)
  assert(bg === 'rgb(255, 0, 255)', `background: ${bg}`)   // magenta: the tonic's green would be keyed out of green
  await play([57, 60, 64, 67], 200)
  const shown = await view.locator('.view-chord-name').innerText()
  await off([57, 60, 64, 67])
  await view.close()
  assert(shown === 'Am7', `view shows ${shown}`)
})

await check('view window: the strings view shows the drawing, without the panel\'s tabs', async () => {
  await page.click('#btn-views')
  const [view] = await Promise.all([page.context().waitForEvent('page'), page.click('#view-menu [data-view="guitar"]')])
  await view.waitForFunction(() => window.UMT && window.Notae && document.getElementById('view-content'))
  await play([60, 64, 67], 300)
  const drawn = await view.evaluate(() => {
    const r = document.querySelector('#view-content .strings-drawing svg')?.getBoundingClientRect()
    return { w: Math.round(r?.width ?? 0), h: Math.round(r?.height ?? 0), tabs: !!document.querySelector('#view-content .strings-tabs')?.offsetParent }
  })
  await off([60, 64, 67])
  await view.close()
  assert(drawn.w > 100 && drawn.h > 100 && !drawn.tabs, `drawn: ${JSON.stringify(drawn)}`)
})

await check('export: the staff as SVG and the circle as PNG', async () => {
  const save = async (target, format) => {
    await page.click('#btn-views')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`#view-menu [data-export="${target}"][data-format="${format}"]`)])
    const chunks = []
    for await (const c of await dl.createReadStream()) chunks.push(c)
    return { name: dl.suggestedFilename(), data: Buffer.concat(chunks) }
  }
  const svg = await save('staff', 'svg')
  assert(svg.name.startsWith('modus-staff') && svg.name.endsWith('.svg'), `name: ${svg.name}`)
  assert(svg.data.toString().startsWith('<svg') && svg.data.toString().includes('xmlns="http://www.w3.org/2000/svg"'), 'not a standalone SVG')
  const png = await save('cof', 'png')
  assert(png.name.endsWith('.png') && png.data.subarray(1, 4).toString() === 'PNG' && png.data.length > 5000, `png: ${png.name} ${png.data.length} bytes`)
})

await check('MIDI out: previews and the computer keyboard go out; controller notes only with Thru', async () => {
  await openSettings('io')
  await pickSetting('midi-out', 'synth-1')
  await pickSetting('midi-out-ch', '2')
  await page.keyboard.press('Escape')
  const sent = () => page.evaluate(() => window.__sent.splice(0))
  await sent()
  await page.locator('#cof-container [data-chord="F"]').click()
  const preview = await sent()
  assert(preview.some(b => b[0] === 0x91 && b[1] === 65), `preview: ${JSON.stringify(preview)}`)
  await play([60, 64, 67], 100)
  await off([60, 64, 67])
  const controller = (await sent()).filter(b => (b[0] & 0xF0) === 0x90)
  assert(controller.length === 0, `controller sent without Thru: ${JSON.stringify(controller)}`)
  await openSettings('io')
  await page.click('#btn-thru')
  await page.keyboard.press('Escape')
  await play([62], 100)
  await off([62])
  const thru = await sent()
  assert(thru.some(b => b[0] === 0x91 && b[1] === 62) && thru.some(b => b[0] === 0x81 && b[1] === 62), `thru: ${JSON.stringify(thru)}`)
  await openSettings('io')
  await page.click('#btn-thru')
  await pickSetting('midi-out', '')
  await page.keyboard.press('Escape')
  const off_ = await sent()
  assert(off_.some(b => b[0] === 0xB1 && b[1] === 123), `no All Notes Off when switching off: ${JSON.stringify(off_)}`)
})

await check('changing MIDI mode clears a held chord', async () => {
  await mode('hold')
  await play([60, 64, 67])
  await off([60, 64, 67])
  assert((await text('.chord-name-badge')) === 'C', 'hold keeps chord')
  await mode('normal')
  assert(await page.locator('.chord-name-badge').count() === 0, 'detector still shows a chord')
})

await check('no orphan chord input after reload', async () => {
  await page.locator('#mod-song .song-header .pop-anchor.pop-end > .song-btn', { hasText: '+ Section' }).click()
  await page.locator('#mod-song .song-header .song-menu .choice-row', { hasText: 'Verse' }).first().click()
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

await check('releasing a captured chord key by key does not fill the next slot', async () => {
  await page.locator('.chord-chip').first().hover()
  await page.locator('.chord-chip').first().locator('button', { hasText: '⊙' }).click()
  await play([62, 65, 69, 72], 400)             // Dm7 again into the Dm7 slot
  await off([62])                               // the bass lifts first; F A C (F) stays held
  await page.waitForTimeout(400)
  await off([65, 69, 72])
  const chips = await page.locator('.chord-chip-symbol').allInnerTexts()
  assert(chips.join(' ') === 'Dm7 Dm Em', `chips: ${chips.join(' ')}`)
  await page.keyboard.press('Escape')
})

await check('deleting a section can be undone', async () => {
  await page.locator('.section-header .song-danger').first().click()
  assert(await page.locator('.chord-chip').count() === 0, 'section still there')
  await page.locator('.undo-btn').click()
  assert(await page.locator('.chord-chip').count() === 3, 'undo did not restore')
})

await check('history Clear can be undone', async () => {
  // The last chord played logs 0.8 s after it settles; wait for it so Clear has something to clear.
  await page.waitForSelector('.history-chip', { timeout: 3000 })
  await page.waitForTimeout(900)
  const before = await page.locator('.history-chip').count()
  await page.locator('.history-clear-btn').click()
  assert(await page.locator('.history-chip').count() === 0, 'not cleared')
  await page.locator('.undo-btn').click()
  const after = await page.locator('.history-chip').count()
  assert(after === before, `undo did not restore: ${before} -> ${after}`)
})

await check('clicking a history chip loads it in the detector', async () => {
  const first = await text('.history-chip-symbol')
  await page.locator('.history-chip').first().click()
  const shown = await text('.chord-name-badge')
  assert(shown === first, `detector shows ${shown}, chip ${first}`)
})

await check('a short chord released key by key logs that chord, not what is left of it', async () => {
  await page.locator('.history-clear-btn').click()
  await play([62, 65, 69, 72], 400)             // Dm7, shorter than the history hold
  for (const n of [62, 65, 69, 72]) { await off([n]); await page.waitForTimeout(40) }   // F A C sounds for a moment
  await page.waitForTimeout(1000)
  const chips = await page.locator('.history-chip-symbol').allInnerTexts()
  assert(chips.join(' ') === 'Dm7', `history: ${chips.join(' ')}`)
})

await check('CoF click plays without changing the key; double click sets it', async () => {
  await setKey('C Major')
  const g = page.locator('#cof-container [data-key="G Major"]')
  await g.click()
  assert(await page.inputValue('#key-select') === 'C Major', 'single click changed the key')
  assert((await text('.chord-name-badge')) === 'G', 'chord not shown')
  await page.waitForTimeout(500)
  await g.dblclick()   // two clicks within 400 ms; two click() calls can be slower than that under load
  assert(await page.inputValue('#key-select') === 'G Major', `key: ${await page.inputValue('#key-select')}`)
})

await check('CoF minor segment double click sets the minor key', async () => {
  const em = page.locator('#cof-container [data-key="E Minor"]')
  await em.dblclick()
  assert(await page.inputValue('#key-select') === 'E Minor', `key: ${await page.inputValue('#key-select')}`)
})

await check('key explorer follows the key; a click shows the chord and keeps the key', async () => {
  await setKey('E Minor')
  assert((await text('#key-container .key-title')) === 'E Minor', `title: ${await text('#key-container .key-title')}`)
  const diatonic = await page.locator('#key-container .key-grid').first().locator('.key-chord:not(.key-alt)').allInnerTexts()
  const alternatives = await page.locator('#key-container .key-grid').first().locator('.key-alt').allInnerTexts()
  assert(diatonic.join(' ') === 'Em F#dim G Am Bm C D' && alternatives.join(' ') === 'B D#dim', `diatonic: ${diatonic.join(' ')} | ${alternatives.join(' ')}`)
  await page.locator('#key-container .key-grid').first().locator('[data-chord="C"]').click()
  assert((await text('.chord-name-badge')) === 'C', 'chord not shown')
  assert((await text('#analysis-content')).includes('VI'), 'analysis not in E minor')
  assert(await page.inputValue('#key-select') === 'E Minor', 'the click changed the key')
  assert(await page.locator('#key-container .key-chord.active').count() > 0, 'chord on screen not outlined')
})

await check('on Auto, history chips show romans in the detected key', async () => {
  await setKey('')
  const label = await text('#auto-key-label')
  assert(label.startsWith('auto:'), `auto label: ${label}`)
  const romans = await page.locator('.history-chip-roman').allInnerTexts()
  assert(romans.length > 0 && romans.every(r => r !== '—'), `romans: ${romans.join(',')}`)
  const title = await text('#key-container .key-title')
  assert(title === `${label.slice(6)} (auto)`, `explorer title: ${title}, ${label}`)
})

await check('guitar shows a short list of playable voicings, open shape first', async () => {
  await page.locator('#cof-container [data-chord="C"]').click()
  const count = await page.getAttribute('#guitar-container .strings-dots', 'data-count')
  const total = Number(count.split('/')[1])
  assert(count.startsWith('1/') && total > 3 && total < 30, `count: ${count}`)
  assert((await text('.strings-caption')).startsWith('Open'), `caption: ${await text('.strings-caption')}`)
  await page.click('#guitar-container .guitar-nav[data-dir="1"]')
  assert((await page.getAttribute('#guitar-container .strings-dots', 'data-count')).startsWith('2/'), 'the arrow did not move to the next shape')
  await page.click('#guitar-container .guitar-nav[data-dir="-1"]')
})

// The Strings panel's ⋯ menu: instrument, tuning, strings and labels
const stringsMenu = async () => { if (!(await page.locator('#menu-guitar').isVisible())) await page.click('#guitar-container .strings-caption') }

await check('custom tuning rejects a non-note and keeps the string', async () => {
  await stringsMenu()
  const first = page.locator('.guitar-string-input').first()
  await first.fill('H')
  await first.press('Enter')
  assert(await page.locator('.guitar-string-input').first().inputValue() === 'E', 'invalid value kept')
  await page.locator('.guitar-string-input').first().fill('d')
  await page.locator('.guitar-string-input').first().press('Enter')
  assert(await page.locator('.guitar-string-input').first().inputValue() === 'D', 'not normalized')
  assert(await page.getAttribute('#strings-menu [data-tuning="dropD"]', 'aria-pressed') === 'true', 'preset not detected')
  await page.click('#strings-menu [data-tuning="standard"]')
  assert(await page.locator('#menu-guitar').isVisible(), 'the menu closed on a choice')
  await page.keyboard.press('Escape')
})

await check('strings panel: a ukulele has four strings and plays C as 0003', async () => {
  await stringsMenu()
  await page.click('#strings-menu [data-instrument="ukulele"]')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(450)   // a second click on C within 400 ms would set the key
  await page.locator('#cof-container [data-chord="C"]').click()
  assert(await page.locator('.guitar-string-input').count() === 4, 'tuning row not four strings')
  const values = await page.locator('.guitar-string-input').evaluateAll(es => es.map(e => e.value))
  assert(values.join('') === 'GCEA', `ukulele tuning: ${values}`)
  const dots = await page.locator('#guitar-container .strings-drawing circle').count()
  assert(dots >= 1, `dots: ${dots}`)
  await stringsMenu()
  await page.click('#strings-menu [data-instrument="guitar"]')
  assert(await page.getAttribute('#strings-menu [data-tuning="standard"]', 'aria-pressed') === 'true', 'guitar tuning')
  await page.keyboard.press('Escape')
})

// Where a panel sits: its grid column and row, as the page applies them
const cell = id => page.evaluate(id => {
  const el = document.getElementById(`mod-${id}`)
  if (el.classList.contains('module-hidden')) return null
  return { col: el.style.gridColumn, row: el.style.gridRow }
}, id)
const box = sel => page.locator(sel).evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })

await check('layout: a panel dragged by its title snaps to the grid; the others make room', async () => {
  const before = await cell('staff')
  const header = await box('#mod-staff .module-header')
  const target = await box('#mod-analysis')
  await page.mouse.move(header.x + 30, header.y + header.h / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + 30, header.y + header.h / 2, { steps: 8 })
  await page.mouse.up()
  const after = await cell('staff')
  assert(after.col !== before.col, `did not move: ${JSON.stringify(after)}`)
  const g = await page.evaluate(() => JSON.parse(localStorage.getItem('layout')))
  const hit = (a, b) => a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  assert(!g.some(a => g.some(b => hit(a, b))), 'two panels in the same cells')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('layout')).find(c => c.id === 'staff'))
  assert(`${stored.x + 1} / span ${stored.w}` === after.col, `not stored: ${JSON.stringify(stored)}`)
})

await check('layout: the corner resizes a panel, and the diagram fills it', async () => {
  const width = () => page.locator('#cof-container svg').evaluate(s => s.getBoundingClientRect().width)
  const w0 = await width()
  const corner = await box('#mod-cof .module-resize')
  await page.mouse.move(corner.x + 6, corner.y + 6)
  await page.mouse.down()
  await page.mouse.move(corner.x + 200, corner.y + 200, { steps: 8 })
  await page.mouse.up()
  assert((await width()) > w0 + 40, `circle ${w0} → ${await width()}`)
})

await check('layout: × hides a panel, the ▦ menu shows it again; a preset puts every panel back', async () => {
  await showPanel('velocity')
  await page.click('#mod-velocity .module-close')
  assert(await cell('velocity') === null, 'still shown')
  await page.click('#btn-layout')
  assert(!(await page.locator('#layout-menu input[data-module="velocity"]').isChecked()), 'box checked')
  await page.check('#layout-menu input[data-module="velocity"]')
  assert(await cell('velocity') !== null, 'not shown again')
  await page.click('#layout-menu [data-preset="class"]')
  assert(await cell('key') === null && await cell('chord') !== null, 'class preset')
  await page.fill('#layout-name', 'Mine')
  await page.click('#layout-save')
  await page.click('#layout-menu [data-preset="standard"]')
  assert(await cell('key') !== null, 'standard preset')
  await page.click('#layout-menu [data-saved="Mine"]')
  assert(await cell('key') === null, 'saved layout')
  await page.click('#layout-menu [data-preset="standard"]')
  await page.mouse.click(5, 990)
  assert(!(await page.locator('#layout-menu').getAttribute('class')).includes('open'), 'menu open')
})

await check('the staves: grand, treble or bass, each in view in the menu, the one chosen marked', async () => {
  // The staff fills its panel: a grand staff is the taller drawing
  const h = () => page.locator('#staff-container svg').evaluate(s => s.viewBox.baseVal.height / s.viewBox.baseVal.width)
  const chosen = () => page.locator('#menu-staff [data-clef][aria-pressed="true"]').evaluateAll(es => es.map(e => e.dataset.clef))
  assert((await chosen()).join() === 'grand', `default: ${await chosen()}`)
  const labels = await page.locator('#menu-staff [data-clef]').evaluateAll(es => es.map(e => e.textContent))
  assert(labels.join(' ') === 'Grand Treble Bass', `labels: ${labels}`)
  const grand = await h()
  await option('staff', '#menu-staff [data-clef="treble"]')
  assert((await chosen()).join() === 'treble', `treble: ${await chosen()}`)
  const treble = await h()
  await option('staff', '#menu-staff [data-clef="bass"]')
  await option('staff', '#menu-staff [data-clef="grand"]')
  assert((await chosen()).join() === 'grand' && grand > treble * 1.4, `heights ${grand} ${treble}`)
})

await check('names beside the staff: off by default, then notes or degrees at each note\'s height, across both staves', async () => {
  const names = () => page.locator('#staff-container .staff-names text').evaluateAll(es =>
    es.map(e => ({ text: e.textContent, y: +e.getAttribute('y') })))
  const pressed = () => page.locator('#menu-staff [data-staff-names][aria-pressed="true"]').evaluateAll(es => es.map(e => e.dataset.staffNames))
  const chord = [48, 64, 67, 70]   // C3 E4 G4 Bb4: C7 with its root on the bass staff
  await on(chord)
  assert((await names()).length === 0 && (await pressed()).join() === 'off', 'a column by default')
  await option('staff', '#menu-staff [data-staff-names="degrees"]')
  const deg = await names()
  assert(deg.map(n => n.text).join(' ') === 'R 3 5 ♭7', `degrees: ${deg.map(n => n.text)}`)
  assert(deg.every((n, i) => i === 0 || n.y < deg[i - 1].y), 'from the bass up')
  assert(deg[0].y - deg[1].y > 40, `the root on the bass staff: ${deg.map(n => n.y)}`)
  // The staff ends a little after the chord: the column stands beside the notes
  const gap = await page.locator('#staff-container svg').evaluate(svg => {
    const head = Math.max(...[...svg.querySelectorAll('.abcjs-notehead')].map(h => { const b = h.getBBox(); return b.x + b.width }))
    const text = Math.min(...[...svg.querySelectorAll('.staff-names text')].map(t => +t.getAttribute('x')))
    const spacing = svg.querySelector('.staff-names text').getAttribute('font-size')
    return (text - head) / spacing
  })
  assert(gap > 1 && gap < 4, `column ${gap.toFixed(1)} lines from the chord`)
  await option('staff', '#menu-staff [data-staff-names="notes"]')
  assert((await names()).map(n => n.text).join(' ') === 'C E G Bb', `notes: ${(await names()).map(n => n.text)}`)
  await off(chord)
  await option('staff', '#menu-staff [data-staff-names="off"]')
  assert((await names()).length === 0, 'off again')
})

await check('a panel\'s preferences in its menu are the ones in Settings', async () => {
  await option('progressions', '#menu-progressions [data-pref-step="progression-bpm"][data-dir="1"]')
  await openSettings('practice')
  const inSettings = await page.inputValue('#pref-progression-bpm')
  await page.keyboard.press('Escape')
  assert(inSettings === '105', `Settings shows ${inSettings}`)
  await option('progressions', '#menu-progressions [data-pref-step="progression-bpm"][data-dir="-1"]')
  assert((await text('#menu-progressions [data-pref-value="progression-bpm"]')) === '100 bpm', 'not back to 100')
})

await check('P presents the layout without controls, filling the window; Esc leaves', async () => {
  await page.click('#btn-layout')
  await page.click('#layout-menu [data-preset="class"]')
  await page.mouse.click(5, 990)
  await page.keyboard.press('p')
  assert(await page.evaluate(() => document.body.classList.contains('presenting')), 'not presenting')
  assert(!(await page.locator('#z1-toolbar').isVisible()), 'toolbar shown')
  assert(!(await page.locator('#mod-chord .module-header').isVisible()), 'panel header shown')
  await play([60, 64, 67])
  await page.waitForFunction(() => document.querySelector('#mod-chord .chord-name-badge')?.textContent === 'C')
  const size = await page.locator('#mod-chord .chord-name-badge').evaluate(e => parseFloat(getComputedStyle(e).fontSize))
  assert(size > 40, `chord name ${size}px`)
  const bottom = await page.locator('.module:not(.module-hidden)').evaluateAll(els => Math.max(...els.map(e => e.getBoundingClientRect().bottom)))
  const vh = await page.evaluate(() => window.innerHeight)
  assert(Math.abs(bottom - vh) < 30, `layout does not fill the window: ${bottom} of ${vh}`)
  await off([60, 64, 67])
  await page.keyboard.press('Escape')
  assert(!(await page.evaluate(() => document.body.classList.contains('presenting'))), 'still presenting')
  assert(!(await page.locator('#btn-present').getAttribute('class')).includes('active-mode'), 'button lit')
  await page.click('#btn-layout')
  await page.click('#layout-menu [data-preset="standard"]')
  await page.mouse.click(5, 990)
})

await check('a phone stacks the panels in one column, in layout order', async () => {
  await page.setViewportSize({ width: 400, height: 800 })
  const xs = await page.locator('.module:not(.module-hidden)').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().x)))
  assert(new Set(xs).size === 1, `columns: ${[...new Set(xs)]}`)
  const order = await page.locator('.module:not(.module-hidden)').evaluateAll(els =>
    els.map(e => [e.dataset.module, e.getBoundingClientRect().y]).sort((a, b) => a[1] - b[1]).map(a => a[0]))
  assert(order[0] === 'chord' && order.at(-1) === 'song', `order: ${order}`)
  await page.setViewportSize({ width: 1440, height: 1000 })
})

await check('velocity: a bar per note, highest on top; none for a picked chord', async () => {
  await showPanel('velocity')
  await page.evaluate(() => [[48, 40], [55, 90], [64, 120]].forEach(([n, v]) => window.__midi([0x90, n, v])))
  await page.waitForTimeout(100)
  const nums = await page.locator('#velocity-container .vel-num').allInnerTexts()
  assert(nums.join() === '120,90,40', `velocities ${nums}`)
  await off([48, 55, 64])
  await page.locator('.history-chip').first().click()
  assert(await page.locator('#velocity-container .vel-row').count() === 0, 'picked chord shows velocities')
  await page.keyboard.press('Escape')
  await showPanel('velocity', false)
})

await check('input channel filter: other channels are not read', async () => {
  await openSettings('io')
  await pickSetting('midi-in-ch', '2')
  await page.keyboard.press('Escape')
  await page.evaluate(() => [60, 64, 67].forEach(n => window.__midi([0x90, n, 100])))   // channel 1
  await page.waitForTimeout(100)
  const ignored = await page.locator('#piano-container circle').count()
  await page.evaluate(() => [60, 64, 67].forEach(n => window.__midi([0x80, n, 0])))
  await page.evaluate(() => [62, 65, 69].forEach(n => window.__midi([0x91, n, 100])))   // channel 2
  await page.waitForTimeout(100)
  const read = await text('.chord-name-badge')
  await page.evaluate(() => [62, 65, 69].forEach(n => window.__midi([0x81, n, 0])))
  await openSettings('io')
  await pickSetting('midi-in-ch', '0')
  await page.keyboard.press('Escape')
  assert(ignored === 0 && read === 'Dm', `ignored ${ignored}, read ${read}`)
})

await check('circle b / # work only without a key; with one, the key spells it', async () => {
  await setKey('E Major')
  assert(await page.locator('#btn-cof-flat').isDisabled(), 'b enabled with a key')
  assert(await page.locator('#cof-container text', { hasText: /^F#$/ }).count() === 1, 'E major not in sharps')
  await setKey('Bb Major')
  assert(await page.locator('#cof-container text', { hasText: /^Gb$/ }).count() === 1, 'Bb major not in flats')
  await setKey('')
})

await check('analysis: a shell is named, its voicing read; single notes give the scales of the melody', async () => {
  await setKey('C Major')
  const field = async label => {
    const rows = await page.locator('#analysis-content .analysis-row').evaluateAll(rs => rs.map(r => [r.children[0].textContent, r.children[1].textContent]))
    return rows.find(([l]) => l === label)?.[1]
  }
  await play([43, 59, 65])   // G2 B3 F4: G7 without its fifth
  assert(await text('.chord-name-badge') === 'G7', `shell: ${await text('.chord-name-badge')}`)
  const voicing = await field('Voicing')
  assert(voicing.includes('no 5'), `voicing: ${voicing}`)
  const card = await page.locator('#chord-summary .chord-card-value').allTextContents()
  assert(card.join(' | ') === 'root position | close | R 3 ♭7', `header card: ${card.join(' | ')}`)
  await off([43, 59, 65])
  for (const n of [60, 62, 64, 65]) { await play([n], 60); await off([n]); await page.waitForTimeout(40) }
  await play([67], 60)
  const fits = await field('Fits')
  assert(fits.startsWith('(C D E F G)') && fits.includes('C major'), `fits: ${fits}`)
  await off([67])
  await setKey('')
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

await check('help panel lists the mouse gestures; P is presentation, not play', async () => {
  await page.click('#btn-help')
  const help = await text('#shortcut-help')
  assert(help.includes('Double-click a major or minor circle segment'), 'gestures missing')
  assert(/P\s*\n\s*Presentation/.test(help), `P not listed as presentation: ${help.slice(0, 300)}`)
  await page.keyboard.press('Escape')
})

await check('keyboard: Help takes the focus and keeps Tab inside until Esc; a panel\'s ⋯ menu opens on its first option', async () => {
  const inside = sel => page.evaluate(s => !!document.activeElement?.closest(s), sel)
  await page.focus('#btn-help')
  await page.keyboard.press('Enter')
  const helpFocused = await inside('#shortcut-help')
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
  const stillInside = await inside('#shortcut-help')
  await page.keyboard.press('Escape')
  const backOnHelp = await page.evaluate(() => document.activeElement?.id)
  await page.focus('#mod-guitar .module-header')
  await page.keyboard.press('Enter')
  const menuFocused = await inside('#menu-guitar')
  await page.keyboard.press('Escape')
  const backOnHeader = await inside('#mod-guitar .module-header')
  assert(helpFocused && stillInside && backOnHelp === 'btn-help', `help: in ${helpFocused}, after Tabs ${stillInside}, Esc → ${backOnHelp}`)
  assert(menuFocused && backOnHeader, `⋯ menu: first option ${menuFocused}, Esc back on the header ${backOnHeader}`)
})

await check('keyboard: a panel is one tab stop; Delete on its header hides it, the focus goes on', async () => {
  const stops = await page.evaluate(() => [...document.querySelectorAll('#mod-key header *, #mod-key header')].filter(e => e.tabIndex >= 0).length)
  assert(stops === 1, `tab stops in the Key panel's header: ${stops}`)
  await page.focus('#mod-tuner .module-header')
  await page.keyboard.press('Delete')
  const hidden = await page.locator('#mod-tuner').evaluate(e => e.classList.contains('module-hidden'))
  const focused = await page.evaluate(() => document.activeElement?.classList.contains('module-header') && document.activeElement.closest('.module').id)
  await showPanel('tuner')
  assert(hidden && focused && focused !== 'mod-tuner', `hidden ${hidden}, focus on ${focused}`)
})

await check('keyboard: the circle\'s segments describe the keys, not the mouse; Enter keeps the focus on the segment', async () => {
  const d = await page.evaluate(() => [...document.querySelectorAll('#cof-container [data-chord]')].map(e => [!!e.dataset.key, e.getAttribute('aria-description')]))
  assert(d.length && d.every(([key, text]) => text === (key ? 'Enter: play · Enter twice: set as key' : 'Enter: play')), `descriptions: ${JSON.stringify(d.slice(0, 3))}`)
  // Chrome's accessibility tree: a header's description is not its mouse tooltip
  const cdp = await page.context().newCDPSession(page)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  const header = nodes.find(n => n.name?.value?.startsWith('Staff panel:'))
  assert(header && !header.description?.value, `header description: ${header?.description?.value}`)
  await page.focus('#cof-container [data-chord="D"]')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => document.activeElement?.dataset?.chord)
  assert(after === 'D', `focus after Enter: ${after}`)
})

await check('keyboard: the circle is one tab stop; arrows go round a ring and across the rings, and do not step the song', async () => {
  const stops = await page.evaluate(() => [...document.querySelectorAll('#cof-container [data-chord]')].filter(e => e.tabIndex >= 0).length)
  const head = () => page.locator('#chord-summary').innerText()
  const before = await head()
  await page.focus('#cof-container [data-chord="F"]')
  const at = () => page.evaluate(() => document.activeElement?.dataset?.chord)
  const seen = []
  for (const k of ['ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'Home']) { await page.keyboard.press(k); seen.push(await at()) }
  assert(stops === 1, `tab stops in the circle: ${stops}`)
  assert(seen.join(' ') === 'C Am Bdim Bdim Am Dm C', `walk: ${seen.join(' ')}`)
  assert(await head() === before, 'the arrows stepped the song or history')
})

await check('a note that keeps the chord does not rebuild the circle or guitar', async () => {
  await play([60, 64, 67])
  await page.evaluate(() => {
    document.querySelector('#cof-container svg').dataset.mark = '1'
    document.querySelector('#guitar-container svg').dataset.mark = '1'
  })
  await play([72])                                  // doubled C: still a C chord
  const kept = await page.evaluate(() => ['#cof-container svg', '#guitar-container svg']
    .map(s => document.querySelector(s)?.dataset.mark === '1'))
  assert(kept.every(Boolean), `kept: ${kept}`)
  await play([69])                                  // A added: chord changes
  const rebuilt = await page.evaluate(() => document.querySelector('#cof-container svg')?.dataset.mark !== '1')
  assert(rebuilt, 'circle not rebuilt on chord change')
})

await check('MIDI input is written in the key: G#m in E Major, rewritten on a key change', async () => {
  await setKey('E Major')
  await on([68, 71, 75])
  await page.waitForTimeout(100)
  assert((await text('.chord-name-badge')) === 'G#m', `E Major: ${await text('.chord-name-badge')}`)
  await setKey('C Minor')
  assert((await text('.chord-name-badge')) === 'Abm', `C Minor: ${await text('.chord-name-badge')}`)
  await off([68, 71, 75])
})

await check('a chord logged on Auto redraws the song but leaves the open key menu open', async () => {
  await setKey('')
  await page.click('#mod-history .history-clear-btn').catch(() => {})
  await page.click('#btn-key')
  await play([64, 68, 71], 1000)   // logged: the auto key becomes E Major
  await off([64, 68, 71])
  const open = await page.evaluate(() => document.getElementById('key-menu').classList.contains('open'))
  const key = await text('#key-btn-name')
  await page.keyboard.press('Escape')
  assert(key === 'E Major', `auto key: ${key}`)
  assert(open, 'the key menu closed')
})

await check('the piano lights every spelled note: C# E# G# in F# Major', async () => {
  await setKey('F# Major')
  await on([61, 65, 68])
  await page.waitForTimeout(100)
  assert((await text('.chord-name-badge')) === 'C#', `chord: ${await text('.chord-name-badge')}`)
  const lit = await page.locator('#piano-container circle').count()
  assert(lit === 3, `lit keys: ${lit}`)
  await off([61, 65, 68])
})

await check('the neck view names the notes as spelled: F# in D on Auto, E# in F# Major', async () => {
  const neckNames = async () => (await page.locator('#guitar-container .strings-drawing text').allTextContents()).filter(t => /^[A-G]/.test(t))
  await page.click('.strings-tab[data-view="neck"]')
  await setKey('')
  await on([50, 57, 62, 66])
  await page.waitForTimeout(100)
  const d = await neckNames()
  await off([50, 57, 62, 66])
  await setKey('F# Major')
  await on([61, 65, 68])
  await page.waitForTimeout(100)
  const cs = await neckNames()
  await off([61, 65, 68])
  await page.click('.strings-tab[data-view="shapes"]')
  await setKey('')
  assert(d.includes('F#') && !d.includes('Gb'), `D: ${d.join(',')}`)
  assert(cs.includes('E#') && !cs.includes('F'), `C#: ${cs.join(',')}`)
})

await check('staff renders a key signature for F# Major', async () => {
  await setKey('F# Major')
  await play([66, 70, 73])
  assert(await page.locator('#staff-container svg').count() === 1, 'staff svg')
  await off([66, 70, 73])
})

const KEYS = '<b>Fake</b> Keys'
const device = () => page.locator('#midi-device').inputValue()

await check('an unplugged port left in the list is not a device; replugged, it plays', async () => {
  await page.evaluate(() => window.__plug('fake-1', null))
  assert((await text('#midi-status')).includes('disconnected'), `status: ${await text('#midi-status')}`)
  assert(!(await page.locator('#midi-device').innerText()).includes('Fake'), 'unplugged device still listed')
  await page.evaluate(k => window.__plug('fake-1', k), KEYS)
  await play([60, 64, 67])
  assert((await text('.chord-name-badge')) === 'C', 'no chord after replug')
  await off([60, 64, 67])
})

await check('with another port present, the controller is used again when it comes back', async () => {
  await page.evaluate(() => window.__plug('loop', 'Loop Port'))
  await page.evaluate(() => window.__plug('fake-1', null))
  assert(await device() === 'loop', `fallback: ${await device()}`)
  await page.evaluate(k => window.__plug('fake-1', k), KEYS)
  assert(await device() === 'fake-1', `after replug: ${await device()}`)
  await play([62, 65, 69])
  assert((await text('.chord-name-badge')) === 'Dm', 'controller silent after replug')
  await off([62, 65, 69])
})

await check('the controller is found by name when another port takes its id (Chrome numbers by position)', async () => {
  await page.evaluate(() => { window.__plug('fake-1', null); window.__plug('fake-1', 'Other Port'); window.__plug('fake-2', '<b>Fake</b> Keys') })
  assert(await device() === 'fake-2', `selected: ${await device()}`)
  await page.evaluate(k => { window.__plug('fake-2', null); window.__plug('fake-1', null); window.__plug('fake-1', k) }, KEYS)
  assert(await device() === 'fake-1', `restored: ${await device()}`)
})

await check('Firefox style (no statechange): unplug and replug are found by rescanning', async () => {
  await page.evaluate(() => window.__hotplug(false))
  await page.evaluate(() => window.__plug('fake-1', null))
  await page.waitForTimeout(2500)
  assert(!(await page.locator('#midi-device').innerText()).includes('Fake'), 'unplugged device still listed')
  assert(await device() === 'loop', `fallback: ${await device()}`)
  await page.evaluate(k => window.__plug('fake-1', k), KEYS)
  await page.waitForTimeout(2500)
  assert(await device() === 'fake-1', `after replug: ${await device()}`)
  await play([64, 67, 71])
  assert((await text('.chord-name-badge')) === 'Em', 'controller silent after replug')
  await off([64, 67, 71])
  await page.evaluate(() => window.__hotplug(true))
})

const pianoKey = note => page.locator(`#piano-container rect[data-note="${note}"]`)
const badgeOrNone = async () => (await page.locator('.chord-name-badge').count()) ? text('.chord-name-badge') : null

await check('on-screen piano, Normal: a key sounds in the detector while pressed', async () => {
  await mode('normal')
  await setKey('')
  // The grand staff makes the page taller: the piano may start below the fold
  await pianoKey('C4').scrollIntoViewIfNeeded()
  const box = await pianoKey('C4').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 5)
  await page.mouse.down()
  await page.waitForTimeout(80)
  assert((await page.locator('#zone1-analysis, #analysis-container, body').first().innerText()).includes('MIDI 60'), 'note not shown while pressed')
  await page.mouse.up()
  await page.waitForTimeout(80)
  assert(!(await page.locator('body').innerText()).includes('MIDI 60'), 'note still shown after release')
})

await check('on-screen piano, Hold: each click adds a note, a second click removes it; Esc drops the chord', async () => {
  await mode('hold')
  for (const n of ['C4', 'E4', 'G4']) await pianoKey(n).click({ force: true })
  assert(await badgeOrNone() === 'C', `after C E G: ${await badgeOrNone()}`)
  await pianoKey('E4').click({ force: true })
  assert(await badgeOrNone() === null, `after removing E: ${await badgeOrNone()}`)
  await pianoKey('Eb4').click({ force: true }).catch(() => pianoKey('D#4').click({ force: true }))
  assert(await badgeOrNone() === 'Cm', `after adding Eb: ${await badgeOrNone()}`)
  await page.keyboard.press('Escape')
  assert(await badgeOrNone() === null, 'Esc did not drop the held chord')
  await mode('normal')
})

await check('computer keyboard: M on, A D G is a C chord, H plays A instead of toggling Hold; M off', async () => {
  await page.keyboard.press('m')
  assert(await page.locator('#menu-keyboard.active-mode').count() === 1 && await page.locator('#btn-input-status [data-on="keyboard"]').isVisible(), 'keyboard mode not on')
  for (const k of ['a', 'd', 'g']) await page.keyboard.down(k)
  await page.waitForTimeout(80)
  assert(await badgeOrNone() === 'C', `A D G: ${await badgeOrNone()}`)
  await page.keyboard.down('h')
  await page.waitForTimeout(80)
  assert(await page.locator('#btn-hold.active-mode').count() === 0, 'H toggled Hold in keyboard mode')
  assert(await badgeOrNone() === 'C6', `A D G H: ${await badgeOrNone()}`)
  for (const k of ['a', 'd', 'g', 'h']) await page.keyboard.up(k)
  await page.waitForTimeout(80)
  assert(await badgeOrNone() === null, 'notes hang after key up')
  await page.keyboard.press('z')
  assert((await text('#keyboard-status')).startsWith('C3'), `octave: ${await text('#keyboard-status')}`)
  await page.keyboard.press('x')
  await page.keyboard.press('m')
  assert(await page.locator('#menu-keyboard.active-mode').count() === 0 && await page.locator('#btn-input-status [data-on="keyboard"]').isHidden(), 'keyboard mode still on')
})

await check('typed chord: / focuses the field, Enter shows it; an unknown name is marked', async () => {
  await page.keyboard.press('/')
  await page.keyboard.type('F#m7b5')
  await page.keyboard.press('Enter')
  assert(await badgeOrNone() === 'F#m7b5', `typed: ${await badgeOrNone()}`)
  await page.fill('#typed-chord', 'Xyz')
  await page.keyboard.press('Enter')
  assert(await page.locator('#typed-chord.invalid').count() === 1, 'unknown name not marked')
  await page.fill('#typed-chord', '')
  await page.locator('#typed-chord').blur()
})

const songChips = () => page.locator('.chord-chip-symbol').allInnerTexts()
// The song's list and its ⋯ menu, opened from the song's head
const songOptions = () => page.locator('#mod-song .song-tab[data-song-id]').evaluateAll(es => es.map(e => e.textContent))
const songMore = async label => {
  await page.click('#mod-song .song-more-btn')
  await page.locator('#mod-song .pop-anchor:has(.song-more-btn) .choice-row', { hasText: label }).click()
}
// + Section: its menu of section kinds
const addSectionKind = async name => {
  await page.locator('#mod-song .song-header .pop-anchor.pop-end > .song-btn', { hasText: '+ Section' }).click()
  await page.locator('#mod-song .song-header .song-menu .choice-row', { hasText: name }).first().click()
}

await check('New keeps the previous song; opening it again restores its chords and key', async () => {
  await page.fill('.song-title-input', 'First song')
  await page.locator('.song-title-input').blur()
  await setKey('A Minor')
  const chips = await songChips()
  assert(chips.length > 0, 'first song has chords')
  await songMore('New song')
  assert((await songChips()).length === 0, 'new song is empty')
  assert(await page.locator('#key-select').inputValue() === '', 'new song starts on Auto')
  assert((await songOptions()).includes('First song'), `list: ${(await songOptions()).join(', ')}`)
  await page.locator('#mod-song .song-tab', { hasText: 'First song' }).click()
  assert((await songChips()).join(' ') === chips.join(' '), `chips: ${(await songChips()).join(' ')}`)
  assert(await page.locator('#key-select').inputValue() === 'A Minor', 'key restored')
})

await check('Delete removes the open song; Undo brings it back', async () => {
  const before = await songOptions()
  await songMore('Delete the song')
  assert(!(await songOptions()).includes('First song'), `after delete: ${(await songOptions()).join(', ')}`)
  await page.locator('.undo-btn').click()
  assert((await songOptions()).length === before.length, `after undo: ${(await songOptions()).join(', ')}`)
  assert(await page.locator('.song-title-input').inputValue() === 'First song', 'restored song is open')
})

await check('the open song and the list survive a reload', async () => {
  const options = await songOptions()
  await page.reload()
  await page.waitForFunction(() => window.UMT && window.Notae)
  await page.waitForTimeout(200)
  assert(await page.locator('.song-title-input').inputValue() === 'First song', 'open song after reload')
  assert((await songOptions()).length === options.length, `list after reload: ${(await songOptions()).join(', ')}`)
  assert(await page.locator('#key-select').inputValue() === 'A Minor', 'key after reload')
})

await check('song: the form strip, a section as text, the key read from the song on Auto', async () => {
  await songMore('New song')
  await setKey('')
  await addSectionKind('Verse')
  assert(await page.locator('#mod-song .song-strip').count() === 0, 'a strip for one section')
  await page.getByRole('button', { name: 'Paste chords' }).click()
  await page.fill('.paste-textarea', 'Am F | C G | Am F | E7')
  await page.getByRole('button', { name: 'Add chords' }).click()
  const degrees = await page.locator('#mod-song .chord-chip-degree').allInnerTexts()
  assert(degrees[0] === 'i' && degrees.at(-1) === 'V7', `degrees from the song's own key: ${degrees.join(' ')}`)
  await addSectionKind('Chorus')
  const blocks = await page.locator('#mod-song .strip-block').allInnerTexts()
  assert(blocks.length === 2 && blocks[0].startsWith('Verse'), `strip: ${blocks.join(' | ')}`)
  // The chorus as text
  await page.locator('.section-wrap').nth(1).locator('.section-write-btn', { hasText: 'Text' }).click()
  await page.fill('.section-text-input', 'F G | E Am')
  assert((await text('.section-text-status')).includes('2 bars, 4 chords'), `status: ${await text('.section-text-status')}`)
  await page.keyboard.press('Enter')
  await page.locator('.section-wrap').nth(1).locator('.section-write-btn', { hasText: 'Chips' }).click()
  const chorus = await page.locator('.section-wrap').nth(1).locator('.chord-chip-symbol').allInnerTexts()
  assert(chorus.join(' ') === 'F G E Am', `chorus: ${chorus.join(' ')}`)
  assert((await page.locator('#mod-song .strip-block').nth(1).innerText()).includes('2'), 'the strip does not follow the bars')
})

await check('song playback: ▶ plays the song at its tempo, the chart and the detector follow, ■ and the end stop it', async () => {
  await songMore('New song')
  await setKey('C Major')
  await addSectionKind('Verse')
  await page.getByRole('button', { name: 'Paste chords' }).click()
  await page.fill('.paste-textarea', 'C | F G')
  await page.getByRole('button', { name: 'Add chords' }).click()
  // 240 bpm: a bar of 4/4 in a second
  await page.click('#mod-song .song-tempo')
  await page.fill('#mod-song .song-tempo-input[data-field="tempo"]', '240')
  await page.keyboard.press('Enter')
  await page.locator('#mod-song .song-tempo-input[data-field="tempo"]').evaluate(i => i.dispatchEvent(new Event('change')))
  await page.keyboard.press('Escape')
  assert((await text('#mod-song .song-tempo')).startsWith('♩ 240'), `tempo: ${await text('#mod-song .song-tempo')}`)
  await page.click('#mod-song .song-play')
  assert(await text('#mod-song .song-play') === '■', 'not playing')
  await page.waitForFunction(() => document.querySelector('.chord-name-badge')?.textContent === 'F', null, { timeout: 3000 })
  assert(await text('#mod-song .chord-chip.playing .chord-chip-symbol') === 'F', 'F not marked in the chart')
  await page.waitForFunction(() => document.querySelector('.chord-name-badge')?.textContent === 'G', null, { timeout: 3000 })
  // The song ends by itself: the button is ▶ again, nothing marked
  await page.waitForFunction(() => document.querySelector('#mod-song .song-play')?.textContent === '▶', null, { timeout: 3000 })
  assert(await page.locator('#mod-song .chord-chip.playing').count() === 0, 'a chip still marked')
  // ■ stops it
  await page.click('#mod-song .song-play')
  await page.click('#mod-song .song-play')
  assert(await text('#mod-song .song-play') === '▶', 'did not stop')
})

await check('metronome: 4/4 at 240 runs round the necklace with its count in the middle; bulerías counts from 12; 2+2+3/8 typed; the pulses view; the mode menu', async () => {
  const m = '#metronome-container'
  await page.fill(`${m} .metro-num[data-field="tempo"]`, '240')
  await page.locator(`${m} .metro-num[data-field="tempo"]`).evaluate(i => i.dispatchEvent(new Event('change')))
  await page.click(`${m} .metro-play`)
  // Four pulses a second: the lit dot moves round
  const seen = new Set()
  for (let i = 0; i < 12; i++) {
    const p = await page.locator(`${m} .metro-dot.lit`).getAttribute('data-p').catch(() => null)
    if (p !== null) seen.add(p)
    await page.waitForTimeout(90)
  }
  assert(seen.size >= 3, `pulses lit: ${[...seen].join(',')}`)
  const big = await page.locator(`${m} .metro-big`).textContent()
  assert(['1', '2', '3', '4'].includes(big), `count in the middle: ${big}`)
  assert(await text(`${m} .metro-play`) === '■', 'not running')
  // What it counts is in the menu the mode's button opens, over the drawing; a kind keeps it open, a choice closes it
  await page.click(`${m} .metro-mode`)
  await page.click(`${m} [data-kind="cycle"]`)
  assert(await page.locator(`${m} .metro-pop.open`).count() === 1, 'menu closed on a kind')
  await page.click(`${m} [data-cycle="bulerias"]`)
  assert(await page.locator(`${m} .metro-pop.open`).count() === 0, 'menu still open')
  const counts = await page.locator(`${m} .metro-count`).allTextContents()
  assert(counts.length === 12 && counts[0] === '12' && counts[1] === '1', `counts: ${counts.join(' ')}`)
  await page.click(`${m} .metro-mode`)
  await page.click(`${m} [data-kind="meter"]`)
  await page.fill(`${m} .metro-meter`, '2+2+3/8')
  await page.locator(`${m} .metro-meter`).evaluate(i => i.dispatchEvent(new Event('change')))
  assert(await page.locator(`${m} .metro-arc`).count() === 3, 'three groups')
  await page.click(`${m} .strings-tab[data-view="pulses"]`)
  assert(await page.locator(`${m} .metro-group`).count() === 3 && await page.locator(`${m} .metro-block`).count() === 7, 'pulses view: 3 groups, 7 blocks')
  await page.waitForFunction(() => document.querySelector('#metronome-container .metro-block.lit') !== null, null, { timeout: 2000 })
  await page.click(`${m} .strings-tab[data-view="necklace"]`)
  // Euclidean: the draft by − and +, applied by Use; bulerías among the recent modes
  await page.click(`${m} .metro-mode`)
  assert((await page.locator(`${m} .metro-recent`).innerText()).includes('Bulerías'), 'recent modes')
  await page.click(`${m} [data-kind="euclid"]`)
  await page.click(`${m} [data-step="pulses"][data-dir="1"]`)
  await page.click(`${m} [data-use="euclid"]`)
  assert((await text(`${m} .metro-mode`)).includes('E(4, 8)'), `euclid: ${await text(`${m} .metro-mode`)}`)
  // The large count, off and on from the ⋯ menu
  await option('metronome', '#btn-metro-count')
  assert(await page.locator(`${m} .metro-big`).count() === 0, 'large count still shown')
  await option('metronome', '#btn-metro-count')
  assert(await page.locator(`${m} .metro-big`).count() === 1, 'large count not back')
  // The subdivision from its own button
  await page.click(`${m} .metro-sub`)
  await page.click(`${m} .metro-sub-pop [data-sub="2"]`)
  assert((await text(`${m} .metro-sub`)).includes('2'), 'subdivision')
  await page.click(`${m} .metro-play`)
  assert(await text(`${m} .metro-play`) === '▶', 'did not stop')
})

await check('modal keys: D Dorian from the key menu reads G7 as IV7; Auto finds a Dm7 G7 vamp dorian', async () => {
  await page.click('#btn-key')
  await page.click('#key-menu [data-keymode="dorian"]')
  await page.click('#key-grid [data-key="D Dorian"]')
  await page.keyboard.press('Escape')
  assert(/dorian/i.test(await page.locator('#btn-key').innerText()), `key: ${await page.locator('#btn-key').innerText()}`)
  await play([55, 59, 62, 65])
  const a = await text('#analysis-content')
  assert(a.includes('IV7'), `analysis: ${a}`)
  await off([55, 59, 62, 65])
  // Auto, an empty history, then the vamp held long enough to be logged
  await setKey('')
  await page.click('.history-clear-btn').catch(() => {})
  for (let i = 0; i < 4; i++) {
    const chord = i % 2 ? [55, 59, 62, 65] : [50, 53, 57, 60]
    await on(chord)
    await page.waitForTimeout(1000)
    await off(chord)
  }
  await page.waitForFunction(() => /dorian/i.test(document.getElementById('btn-key')?.innerText ?? ''), null, { timeout: 3000 })
    .catch(async () => { throw new Error(`auto key: ${await page.locator('#btn-key').innerText()}`) })
})

await check('no errors after the walk', async () => {
  assert(page.errors.length === 0, page.errors.join(' | '))
})

// One row of controls: no control starts a line below the others (a row is ~30 px)
const toolbarRows = () => page.evaluate(() => {
  const tops = [...document.getElementById('z1-toolbar').children].filter(el => el.offsetParent && el.offsetWidth)
    .map(el => el.getBoundingClientRect().top)
  return Math.max(...tops) - Math.min(...tops) < 24 ? 1 : 2
})

await check('the bar\'s field: a chord plays, an order runs by its name', async () => {
  await page.click('#typed-chord')
  await page.keyboard.type('arp')
  const items = await page.locator('#cmd-results .cmd-item').allInnerTexts()
  assert(items[0]?.startsWith('Mode: Arpeggio'), `results: ${items.join(' | ')}`)
  await page.keyboard.press('Enter')
  assert(await page.locator('#btn-arpeggio.active-mode').count() === 1, 'Arpeggio not on')
  assert(await page.inputValue('#typed-chord') === '', 'field not cleared after an order')
  await page.click('#typed-chord')
  await page.keyboard.type('hold')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  assert(await page.locator('#btn-hold.active-mode').count() === 1, 'Hold not on')
  await mode('normal')
  await page.click('#typed-chord')
  await page.keyboard.type('G7')
  assert((await text('#cmd-results .cmd-item')).startsWith('Play G7'), 'no Play item first')
  await page.keyboard.press('Enter')
  assert((await text('.chord-name-badge')) === 'G7', `typed: ${await text('.chord-name-badge')}`)
  await page.fill('#typed-chord', '')
  await page.keyboard.press('Escape')
})

await check('key menu: Auto, or a key from the circle\'s order; the bar names it', async () => {
  await setKey('D Major')
  assert(await page.inputValue('#key-select') === 'D Major', 'key not set')
  assert((await text('#key-btn-name')) === 'D Major', `bar: ${await text('#key-btn-name')}`)
  assert(await page.getAttribute('#btn-key', 'aria-expanded') === 'false', 'menu left open')
  await page.click('#btn-key')
  const tonics = await page.locator('#key-grid [data-key]').evaluateAll(b => b.map(x => x.dataset.key.split(' ')[0]))
  assert(tonics.join(' ') === 'F# Db Ab Eb Bb F C G D A E B', `order: ${tonics.join(' ')}`)
  await page.click('#key-auto')
  assert(await page.inputValue('#key-select') === '', 'not back on Auto')
  assert((await text('#key-btn-auto')) === 'auto', 'auto not marked')
})

await check('the bar holds each control once: its menus open under their buttons; the sound menu filters', async () => {
  // A menu once opened stays in its button's anchor: its buttons are not the bar's
  const ids = await page.evaluate(() => [...document.querySelectorAll('#z1-toolbar button[id]')].filter(b => !b.closest('.pop-menu')).map(b => b.id))
  assert(ids.join(' ') === 'btn-key btn-input-status btn-sound-status btn-layout btn-present btn-views btn-settings btn-help', `bar: ${ids.join(' ')}`)
  for (const [btn, menu] of [['#btn-layout', '#layout-menu'], ['#btn-views', '#view-menu']]) {
    await page.click(btn)
    const [b, m] = await Promise.all([page.locator(btn).boundingBox(), page.locator(menu).boundingBox()])
    assert(m && m.y >= b.y + b.height && Math.abs(m.x + m.width - (b.x + b.width)) < 2, `${menu} not under ${btn}: ${JSON.stringify([b, m])}`)
    await page.click(btn)
  }
  await page.click('#btn-sound-status')
  assert(await page.locator('#sound-menu').isVisible(), 'sound menu not open from the bar')
  await page.fill('#instrument-filter', 'violin')
  const found = await page.locator('#instrument-list .choice-row').allInnerTexts()
  assert(found.length === 1 && found[0].startsWith('Violin'), `filtered: ${found.join(' | ')}`)
  await page.click('#btn-sound-status')
})

await check('the field reaches the panels\' ⋯ options and each row of Settings', async () => {
  await page.click('#typed-chord')
  await page.keyboard.type('circle seventh')
  assert((await text('#cmd-results .cmd-item')).startsWith('Circle of fifths: '), `results: ${await text('#cmd-results')}`)
  await page.keyboard.press('Escape')
  await page.fill('#typed-chord', 'settings theme')
  await page.keyboard.press('Enter')
  assert(await page.locator('#settings').isVisible(), 'Settings not open')
  assert(await page.inputValue('#set-search') !== '', 'Settings not on the row')
  await page.keyboard.press('Escape')
})

await check('→ Song puts the newest history chord in the song', async () => {
  await showPanel('song', true)
  await play([62, 65, 69], 1000)
  await off([62, 65, 69])
  const before = await page.locator('.chord-chip').count()
  await page.click('.history-send-btn')
  assert(await page.locator('.chord-chip').count() === before + 1, 'no chord added to the song')
})

await check('toolbar fits on one row in English', async () => {
  assert(await toolbarRows() === 1, 'toolbar wraps')
})

await check('Spanish from Settings: the page reloads in Spanish with Do Re Mi, history kept', async () => {
  await page.keyboard.press('Escape')
  await play([60, 64, 67], 900)
  await off([60, 64, 67])
  assert((await page.locator('.history-chip-symbol').allInnerTexts())[0] === 'C', 'no C chip before switching')
  await openSettings('general')
  await Promise.all([page.waitForEvent('load'), pickSetting('help-lang', 'es')])
  await page.waitForFunction(() => window.UMT && window.Notae && window.ABCJS)
  await page.waitForTimeout(300)
  assert(await page.evaluate(() => document.documentElement.lang) === 'es', 'html lang')
  assert((await text('#key-select option')) === 'Tono: auto', `key select: ${await text('#key-select option')}`)
  assert((await text('#btn-hold')) === 'Mantener', 'Hold button')
  assert((await text('#mod-history .module-title')) === 'Historial', 'history title')
  assert((await page.locator('.history-chip-symbol').allInnerTexts())[0] === 'Do', `chips: ${(await page.locator('.history-chip-symbol').allInnerTexts()).join(',')}`)
  assert(await toolbarRows() === 1, 'toolbar wraps in Spanish')
})

await check('Spanish: detector, analysis and typed chords in Do Re Mi', async () => {
  await setKey('A Minor')
  assert((await page.locator('#key-select option:checked').innerText()) === 'La menor', 'key name')
  await play([57, 60, 64])
  assert((await text('.chord-name-badge')) === 'Lam', `badge: ${await text('.chord-name-badge')}`)
  const a = await text('#analysis-content')
  assert(a.includes('Grado') && a.includes('Tónica') && a.includes('estado fundamental'), `analysis: ${a}`)
  await off([57, 60, 64])
  await page.fill('#typed-chord', 'Rem7')
  await page.keyboard.press('Enter')
  assert((await text('.chord-name-badge')) === 'Rem7', `typed: ${await text('.chord-name-badge')}`)
  await page.fill('#typed-chord', '')
  await page.locator('#typed-chord').blur()
})

await check('Spanish: letters again from Settings', async () => {
  await openSettings('general')
  await Promise.all([page.waitForEvent('load'), pickSetting('help-note-names', 'letters')])
  await page.waitForFunction(() => window.UMT && window.Notae && window.ABCJS)
  await page.waitForTimeout(300)
  assert((await page.locator('#key-select option:checked').innerText()) === 'A menor', 'key name with letters')
  assert((await text('#mod-history .module-title')) === 'Historial', 'still in Spanish')
  await openSettings('general')
  await Promise.all([page.waitForEvent('load'), pickSetting('help-lang', 'en')])
  await page.waitForFunction(() => window.UMT && window.Notae && window.ABCJS)
  await page.waitForTimeout(300)
  assert((await text('#mod-history .module-title')) === 'History', 'back in English')
})

await check('theme: follows the system, light from Settings without a reload, diagrams redrawn', async () => {
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme)
  assert(await theme() === 'dark' && await bg() === 'rgb(20, 20, 20)', `dark: ${await theme()} ${await bg()}`)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForTimeout(100)
  assert(await theme() === 'light', 'does not follow the system')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(100)
  await setKey('C Major')
  await openSettings('general')
  await page.evaluate(() => { window.__noReload = true })
  await pickSetting('help-theme', 'light')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  assert(await page.evaluate(() => window.__noReload) === true, 'the page reloaded')
  assert(await theme() === 'light' && await bg() === 'rgb(239, 238, 235)', `light: ${await theme()} ${await bg()}`)
  const seg = await page.getAttribute('#cof-container [data-chord="E"]', 'fill')
  assert(seg === '#f5f4f1', `circle not redrawn: ${seg}`)
  // The choice wins over the system and survives a reload
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload()
  await page.waitForFunction(() => window.UMT && window.Notae && window.ABCJS)
  assert(await theme() === 'light', 'light lost on reload')
  await openSettings('general')
  await pickSetting('help-theme', 'system')
  await page.keyboard.press('Escape')
  assert(await theme() === 'dark', 'system again')
})

await check('no errors after switching languages and themes', async () => {
  assert(page.errors.length === 0, page.errors.join(' | '))
})

await check('without the soundfont-player script the app still renders, audio in error', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' })
  await context.addInitScript(FAKE_MIDI)
  await context.route('**/soundfont-player*', r => r.abort())
  const p = await context.newPage()
  await p.goto(URL_)
  await p.waitForFunction(() => window.UMT && window.Notae && window.ABCJS)
  await p.waitForTimeout(300)
  const r = await p.evaluate(() => ({
    zone1: document.getElementById('grid').innerHTML.length,
    status: document.getElementById('audio-status')?.textContent,
  }))
  await context.close()
  assert(r.zone1 > 0, 'zone 1 is empty')
  assert(r.status === '♪ error', `audio status: ${r.status}`)
})

await check('touch: two fingers press a chord on a phone piano of two octaves; a long press removes a chip', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US' })
  await context.addInitScript(FAKE_MIDI)
  const p = await context.newPage()
  await p.goto(URL_)
  await p.waitForFunction(() => window.UMT && window.Notae)
  await p.waitForTimeout(300)
  const keys = await p.locator('#piano-container rect[data-note]').count()
  assert(keys === 24, `phone piano keys: ${keys}`)
  // Two fingers down, as a touch screen sends them: one pointer each
  const press = (note, id, type) => p.evaluate(([note, id, type]) => {
    const key = document.querySelector(`#piano-container rect[data-note="${note}"]`)
    const target = type === 'pointerdown' ? key : window
    target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', bubbles: true, button: 0 }))
  }, [note, id, type])
  await press('C4', 11, 'pointerdown')
  await press('E4', 12, 'pointerdown')
  await press('G4', 13, 'pointerdown')
  await p.waitForFunction(() => document.querySelector('.chord-name-badge')?.textContent === 'C')
  for (const id of [11, 12, 13]) await press('', id, 'pointerup')
  await p.waitForTimeout(900)
  // The chord was logged; a long press on its chip removes it
  const chip = p.locator('#mod-history .history-chip').first()
  await chip.scrollIntoViewIfNeeded()
  const before = await p.locator('#mod-history .history-chip').count()
  await chip.dispatchEvent('pointerdown', { pointerId: 21, pointerType: 'touch', button: 0 })
  await p.waitForTimeout(750)
  await chip.dispatchEvent('pointerup', { pointerId: 21, pointerType: 'touch', button: 0 }).catch(() => {})
  const after = await p.locator('#mod-history .history-chip').count()
  await context.close()
  assert(before >= 1 && after === before - 1, `chips ${before} → ${after}`)
})

await check('settings on a phone: full screen, the sections with their values, a page with ← and its own list to pick from', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US' })
  await context.addInitScript(FAKE_MIDI)
  const p = await context.newPage()
  await p.goto(URL_)
  await p.waitForFunction(() => window.UMT && window.Notae)
  await p.click('#btn-settings')
  const box = await p.locator('.set-dialog').boundingBox()
  assert(box.width === 390 && box.height === 844, `not full screen: ${box.width}×${box.height}`)
  assert(await p.locator('.set-content').isHidden(), 'a page shows before a section is picked')
  const summary = await p.locator('[data-summary="general"]').innerText()
  assert(summary.includes('English') && summary.includes('C D E'), `general's summary: ${summary}`)
  await p.click('.set-nav-item[data-section="theory"]')
  assert(await p.locator('.set-nav').isHidden() && await p.locator('.set-section[data-section="theory"] .set-back').isVisible(), 'no page with ←')
  await p.click('[data-pick="pref-key-profile"]')
  await p.click('.set-pick-list [data-pick-value="temperley"]')
  const shown = await p.locator('[data-shows="pref-key-profile"]').innerText()
  await p.keyboard.press('Escape')
  const listAgain = await p.locator('.set-nav').isVisible()
  const themeSummary = await p.locator('[data-summary="theory"]').innerText()
  await p.keyboard.press('Escape')
  const closed = await p.locator('#settings').isHidden()
  await context.close()
  assert(shown.startsWith('Temperley'), `the row shows ${shown}`)
  assert(listAgain && closed, `Esc: list ${listAgain}, closed ${closed}`)
  assert(themeSummary.includes('Temperley'), `theory's summary: ${themeSummary}`)
})

await check('a phone: the bar at the bottom opens its menus as sheets; Help is full screen, with gestures and no keys', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US' })
  await context.addInitScript(FAKE_MIDI)
  const p = await context.newPage()
  await p.goto(URL_)
  await p.waitForFunction(() => window.UMT && window.Notae)
  assert(await p.locator('#tabbar').isVisible() && await p.locator('#btn-layout').isHidden() && await p.locator('#btn-views').isHidden(), 'no bottom bar in place of the page\'s buttons')
  const sheet = () => p.evaluate(() => { const m = document.querySelector('.pop-menu.open'); if (!m) return null; const r = m.getBoundingClientRect(); return { id: m.id, sheet: m.classList.contains('pop-sheet'), left: r.left, width: r.width, bottom: Math.round(r.bottom) } })
  const opened = []
  for (const tab of ['tab-input', 'tab-sound', 'tab-layout', 'tab-more']) {
    await p.tap('#' + tab)
    opened.push(await sheet())
    await p.touchscreen.tap(195, 30)   // over the dimmed page: closes it
  }
  const closed = await p.locator('.pop-menu.open').count()
  await p.tap('#btn-input-status')
  const fromTop = await sheet()
  await p.touchscreen.tap(195, 30)
  const keyboardRow = await p.locator('#tab-input').tap().then(() => p.locator('#menu-keyboard').isVisible())
  await p.touchscreen.tap(195, 30)
  await p.tap('#tab-layout')
  await p.tap('.pop-sheet input[data-module="staff"]')
  const staffHidden = await p.locator('#mod-staff').evaluate(e => e.classList.contains('module-hidden'))
  await p.tap('.pop-sheet input[data-module="staff"]')
  await p.touchscreen.tap(195, 30)
  await p.tap('#btn-help')
  const help = await p.evaluate(() => { const h = document.getElementById('shortcut-help'); const r = h.getBoundingClientRect(); return { w: r.width, h: r.height, sections: [...h.querySelectorAll('.shortcut-section')].map(s => s.textContent), keys: h.querySelectorAll('.shortcut-row').length } })
  await context.close()
  const bad = opened.filter(o => !o?.sheet || o.left !== 0 || o.width !== 390 || o.bottom !== 844 - 60)
  assert(bad.length === 0, `not sheets above the bar: ${JSON.stringify(opened)}`)
  assert(closed === 0, 'a tap outside did not close the sheet')
  assert(fromTop?.id === 'input-menu' && fromTop.sheet, `the bar's input status: ${JSON.stringify(fromTop)}`)
  assert(!keyboardRow, 'the computer keyboard is offered on a phone')
  assert(staffHidden, 'Panels did not hide the staff')
  assert(help.w === 390 && help.h === 844, `help not full screen: ${help.w}×${help.h}`)
  assert(help.keys === 0 && help.sections[0] === 'Gestures' && !help.sections.includes('Mouse'), `help: ${JSON.stringify(help)}`)
})

await check('a phone: the scale\'s whole neck and the Neck view go four frets at a time, with ‹ ›', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US' })
  await context.addInitScript(FAKE_MIDI)
  const p = await context.newPage()
  await p.goto(URL_)
  await p.waitForFunction(() => window.UMT && window.Notae)
  await p.keyboard.press('Escape')
  await p.tap('#btn-key')
  await p.tap('#key-menu [data-keymode="minor"]')
  await p.tap('#key-grid [data-key="A Minor"]')
  await p.locator('#mod-guitar').scrollIntoViewIfNeeded()
  await p.tap('.strings-tab[data-view="scale"]')
  await p.tap('.strings-system[data-system="neck"]')
  const caption = () => p.locator('#guitar-container .strings-caption').innerText()
  const first = await caption()
  await p.tap('#guitar-container .guitar-nav[data-dir="1"]')
  const second = await caption()
  const dots = await p.locator('#guitar-container .strings-dot').count()
  // Neck: the window stays while the chord changes
  await p.tap('.strings-tab[data-view="neck"]')
  await p.tap('#guitar-container .guitar-nav[data-dir="1"]')
  await p.evaluate(() => [50, 57, 62, 66].forEach(n => window.__midi([0x90, n, 100])))
  await p.waitForTimeout(100)
  const neck = await caption()
  const neckNotes = await p.locator('#guitar-container .strings-drawing text').allTextContents()
  await context.close()
  assert(first.includes('frets 0–4') && second.includes('frets 5–8'), `captions: ${first} | ${second}`)
  assert(dots === 3, `windows: ${dots}`)
  assert(neck.includes('frets 5–8') && neckNotes.includes('D'), `neck: ${neck}, ${neckNotes.join(',')}`)
})

await check('offline: once opened, the app loads and plays without a network', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' })
  await context.addInitScript(FAKE_MIDI)
  const p = await context.newPage()
  await p.goto(URL_)
  await p.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 10000 })
  await p.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await p.reload()
  await p.waitForFunction(() => window.UMT && window.Notae && window.ABCJS && window.Soundfont, null, { timeout: 10000 })
  await p.waitForFunction(() => !/loading/.test(document.getElementById('audio-status')?.textContent ?? ''), null, { timeout: 10000 })
  const r = await p.evaluate(() => ({
    panels: document.querySelectorAll('.module').length,
    banner: document.getElementById('cdn-error-banner').classList.contains('visible'),
    status: document.getElementById('audio-status')?.textContent,
  }))
  await context.close()
  assert(r.panels > 5 && !r.banner, `offline page: ${JSON.stringify(r)}`)
  assert(r.status !== '♪ error', `the bundled piano did not load offline: ${r.status}`)
})

await browser.close()
server.close()

for (const [status, name, why] of results) console.log(`${status === 'ok' ? '  ok  ' : '  FAIL'} ${name}${why ? ` — ${why}` : ''}`)
const failed = results.filter(r => r[0] !== 'ok').length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
