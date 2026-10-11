// End-to-end smoke test: serves the repo, opens index.html in the installed Chrome with a
// fake Web MIDI input, and walks the main flows. Needs network (UMT, notae, abcjs and the
// soundfont come from CDNs). Run: pnpm test:e2e  (HEADED=1 to watch it)

import { chromium } from 'playwright-core'
import { serve } from './serve.mjs'

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

const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED, args: ['--mute-audio'] })  // muted: the app plays every chord
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' })
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

await check('history marks the cadence between two chips: G7 → C is Authentic in C Major', async () => {
  await setKey('C Major')
  await play([55, 59, 62, 65], 900)
  await off([55, 59, 62, 65])
  await play([60, 64, 67], 900)
  await off([60, 64, 67])
  const strip = await page.locator('#zone2 .history-strip > *').allInnerTexts()
  assert(strip.slice(0, 3).join('|').replace(/\s+/g, ' ') === 'C I|Authentic|G7 V7', `strip: ${strip.slice(0, 3).join('|')}`)
})

await check('view window: the chord view follows the detector, alone on the chroma background', async () => {
  await page.click('#btn-views')
  const [view] = await Promise.all([page.context().waitForEvent('page'), page.click('#view-menu [data-view="chord"]')])
  await view.waitForFunction(() => window.UMT && window.Notae && document.getElementById('view-content'))
  assert(await view.title() === 'Modus view: chord', `title: ${await view.title()}`)
  assert(!(await view.locator('#app').isVisible()), 'the app shows in the view window')
  const bg = await view.evaluate(() => getComputedStyle(document.body).backgroundColor)
  assert(bg === 'rgb(0, 255, 0)', `background: ${bg}`)
  await play([57, 60, 64, 67], 200)
  const shown = await view.locator('.view-chord-name').innerText()
  await off([57, 60, 64, 67])
  await view.close()
  assert(shown === 'Am7', `view shows ${shown}`)
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
  await page.selectOption('#midi-out', 'synth-1')
  await page.selectOption('#midi-out-ch', '2')
  const sent = () => page.evaluate(() => window.__sent.splice(0))
  await sent()
  await page.locator('#cof-container [data-chord="F"]').click()
  const preview = await sent()
  assert(preview.some(b => b[0] === 0x91 && b[1] === 65), `preview: ${JSON.stringify(preview)}`)
  await play([60, 64, 67], 100)
  await off([60, 64, 67])
  const controller = (await sent()).filter(b => (b[0] & 0xF0) === 0x90)
  assert(controller.length === 0, `controller sent without Thru: ${JSON.stringify(controller)}`)
  await page.click('#btn-thru')
  await play([62], 100)
  await off([62])
  const thru = await sent()
  assert(thru.some(b => b[0] === 0x91 && b[1] === 62) && thru.some(b => b[0] === 0x81 && b[1] === 62), `thru: ${JSON.stringify(thru)}`)
  await page.click('#btn-thru')
  await page.selectOption('#midi-out', '')
  const off_ = await sent()
  assert(off_.some(b => b[0] === 0xB1 && b[1] === 123), `no All Notes Off when switching off: ${JSON.stringify(off_)}`)
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
  await page.locator('.section-header button', { hasText: '×' }).first().click()
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

await check('the clef button cycles grand, treble and bass staves', async () => {
  const h = () => page.locator('#staff-container svg').evaluate(s => s.getBoundingClientRect().height)
  assert(await text('#btn-staff-clef') === 'Grand', 'default grand')
  const grand = await h()
  await page.click('#btn-staff-clef')
  assert(await text('#btn-staff-clef') === 'Treble', 'treble')
  const treble = await h()
  await page.click('#btn-staff-clef')
  assert(await text('#btn-staff-clef') === 'Bass', 'bass')
  await page.click('#btn-staff-clef')
  assert(await text('#btn-staff-clef') === 'Grand' && grand > treble * 1.4, `heights ${grand} ${treble}`)
})

await check('P presents the detector large, follows what is played, Esc leaves', async () => {
  await page.keyboard.press('p')
  await page.waitForSelector('#presentation')
  const tiles = await page.locator('#presentation .pres-tile').evaluateAll(els => els.map(e => e.dataset.view))
  assert(tiles.join() === 'chord,staff,cof,guitar,piano', `tiles: ${tiles}`)
  await play([60, 64, 67])
  await page.waitForFunction(() => document.querySelector('#presentation .view-chord-name')?.textContent === 'C')
  const size = await page.locator('#presentation .view-chord-name').evaluate(e => parseFloat(getComputedStyle(e).fontSize))
  assert(size > 60, `chord name ${size}px`)
  assert(await page.locator('#presentation .view-staff svg').count() === 1, 'staff tile')
  await off([60, 64, 67])
  await page.keyboard.press('Escape')
  assert(await page.locator('#presentation').count() === 0, 'still presenting')
  assert(!(await page.locator('#btn-present').getAttribute('class')).includes('active-mode'), 'button lit')
})

await check('velocity: a bar per note, highest on top; none for a picked chord', async () => {
  await page.evaluate(() => [[48, 40], [55, 90], [64, 120]].forEach(([n, v]) => window.__midi([0x90, n, v])))
  await page.waitForTimeout(100)
  const nums = await page.locator('#velocity-container .vel-num').allInnerTexts()
  assert(nums.join() === '120,90,40', `velocities ${nums}`)
  await off([48, 55, 64])
  await page.locator('.history-chip').first().click()
  assert(await page.locator('#velocity-container .vel-row').count() === 0, 'picked chord shows velocities')
  await page.keyboard.press('Escape')
})

await check('input channel filter: other channels are not read', async () => {
  await page.selectOption('#midi-in-ch', '2')
  await page.evaluate(() => [60, 64, 67].forEach(n => window.__midi([0x90, n, 100])))   // channel 1
  await page.waitForTimeout(100)
  const ignored = await page.locator('#piano-container circle').count()
  await page.evaluate(() => [60, 64, 67].forEach(n => window.__midi([0x80, n, 0])))
  await page.evaluate(() => [62, 65, 69].forEach(n => window.__midi([0x91, n, 100])))   // channel 2
  await page.waitForTimeout(100)
  const read = await text('.chord-name-badge')
  await page.evaluate(() => [62, 65, 69].forEach(n => window.__midi([0x81, n, 0])))
  await page.selectOption('#midi-in-ch', '0')
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
  assert(/\nP\nPresentation/.test(help), 'P not listed as presentation')
  await page.keyboard.press('Escape')
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

await check('the piano lights every spelled note: C# E# G# in F# Major', async () => {
  await setKey('F# Major')
  await on([61, 65, 68])
  await page.waitForTimeout(100)
  assert((await text('.chord-name-badge')) === 'C#', `chord: ${await text('.chord-name-badge')}`)
  const lit = await page.locator('#piano-container circle').count()
  assert(lit === 3, `lit keys: ${lit}`)
  await off([61, 65, 68])
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
  await page.click('#btn-normal')
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
  await page.click('#btn-hold')
  for (const n of ['C4', 'E4', 'G4']) await pianoKey(n).click({ force: true })
  assert(await badgeOrNone() === 'C', `after C E G: ${await badgeOrNone()}`)
  await pianoKey('E4').click({ force: true })
  assert(await badgeOrNone() === null, `after removing E: ${await badgeOrNone()}`)
  await pianoKey('Eb4').click({ force: true }).catch(() => pianoKey('D#4').click({ force: true }))
  assert(await badgeOrNone() === 'Cm', `after adding Eb: ${await badgeOrNone()}`)
  await page.keyboard.press('Escape')
  assert(await badgeOrNone() === null, 'Esc did not drop the held chord')
  await page.click('#btn-normal')
})

await check('computer keyboard: M on, A D G is a C chord, H plays A instead of toggling Hold; M off', async () => {
  await page.keyboard.press('m')
  assert(await page.locator('#btn-keyboard.active-mode').count() === 1, 'keyboard mode not on')
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
  assert(await page.locator('#btn-keyboard.active-mode').count() === 0, 'keyboard mode still on')
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
const songOptions = () => page.locator('.song-select option').allInnerTexts()

await check('New keeps the previous song; opening it again restores its chords and key', async () => {
  await page.fill('.song-title-input', 'First song')
  await page.locator('.song-title-input').blur()
  await setKey('A Minor')
  const chips = await songChips()
  assert(chips.length > 0, 'first song has chords')
  await page.getByRole('button', { name: 'New', exact: true }).click()
  assert((await songChips()).length === 0, 'new song is empty')
  assert(await page.locator('#key-select').inputValue() === '', 'new song starts on Auto')
  assert((await songOptions()).includes('First song'), `list: ${(await songOptions()).join(', ')}`)
  const firstId = await page.locator('.song-select option', { hasText: 'First song' }).getAttribute('value')
  await page.selectOption('.song-select', firstId)
  assert((await songChips()).join(' ') === chips.join(' '), `chips: ${(await songChips()).join(' ')}`)
  assert(await page.locator('#key-select').inputValue() === 'A Minor', 'key restored')
})

await check('Delete removes the open song; Undo brings it back', async () => {
  const before = await songOptions()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
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

await check('no errors after the walk', async () => {
  assert(page.errors.length === 0, page.errors.join(' | '))
})

// One row of controls: no control starts a line below the others (a row is ~30 px)
const toolbarRows = () => page.evaluate(() => {
  const tops = [...document.getElementById('z1-toolbar').children].filter(el => el.offsetParent && el.offsetWidth)
    .map(el => el.getBoundingClientRect().top)
  return Math.max(...tops) - Math.min(...tops) < 24 ? 1 : 2
})

await check('toolbar fits on one row in English', async () => {
  assert(await toolbarRows() === 1, 'toolbar wraps')
})

await check('Spanish from the help panel: the page reloads in Spanish with Do Re Mi, history kept', async () => {
  await page.keyboard.press('Escape')
  await play([60, 64, 67], 900)
  await off([60, 64, 67])
  assert((await page.locator('.history-chip-symbol').allInnerTexts())[0] === 'C', 'no C chip before switching')
  await page.click('#btn-help')
  await Promise.all([page.waitForEvent('load'), page.selectOption('#help-lang', 'es')])
  await page.waitForFunction(() => window.UMT && window.Notae && window.ABCJS)
  await page.waitForTimeout(300)
  assert(await page.evaluate(() => document.documentElement.lang) === 'es', 'html lang')
  assert((await text('#key-select option')) === 'Tono: auto', `key select: ${await text('#key-select option')}`)
  assert((await text('#btn-hold')) === 'Mantener', 'Hold button')
  assert((await text('#zone2 .zone-title')) === 'Historial', 'history title')
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

await check('Spanish: letters again from the help panel', async () => {
  await page.click('#btn-help')
  await Promise.all([page.waitForEvent('load'), page.selectOption('#help-note-names', 'letters')])
  await page.waitForFunction(() => window.UMT && window.Notae && window.ABCJS)
  await page.waitForTimeout(300)
  assert((await page.locator('#key-select option:checked').innerText()) === 'A menor', 'key name with letters')
  assert((await text('#zone2 .zone-title')) === 'Historial', 'still in Spanish')
  await page.click('#btn-help')
  await Promise.all([page.waitForEvent('load'), page.selectOption('#help-lang', 'en')])
  await page.waitForFunction(() => window.UMT && window.Notae && window.ABCJS)
  await page.waitForTimeout(300)
  assert((await text('#zone2 .zone-title')) === 'History', 'back in English')
})

await check('no errors after switching languages', async () => {
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
    zone1: document.getElementById('zone1').innerHTML.length,
    status: document.getElementById('audio-status')?.textContent,
  }))
  await context.close()
  assert(r.zone1 > 0, 'zone 1 is empty')
  assert(r.status === '♪ error', `audio status: ${r.status}`)
})

await browser.close()
server.close()

for (const [status, name, why] of results) console.log(`${status === 'ok' ? '  ok  ' : '  FAIL'} ${name}${why ? ` — ${why}` : ''}`)
const failed = results.filter(r => r[0] !== 'ok').length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
