// End-to-end test through real Web MIDI: Node writes to the "loopMIDI Port" virtual port
// and the installed Chrome and Playwright's Firefox read it as a device. Covers what the
// fake in smoke.mjs cannot: the browser's own MIDI stack and permission.
// Needs loopMIDI running with a port named "loopMIDI Port" (the MIDI out check also needs
// another input, such as a controller, and is skipped without one), and Playwright's Firefox
// (pnpm exec playwright-core install firefox). Run: pnpm test:e2e:midi
//
// Firefox only grants Web MIDI through a site-permission add-on, so a fresh profile gets
// the permission rows the add-on would write (permissions.sqlite) before the test.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { chromium, firefox } from 'playwright-core'
import JZZ from 'jzz'
import { serve } from './serve.mjs'

const PORT_NAME = 'loopMIDI Port'
const RESCAN_WAIT_MS = 2500   // longer than the device rescan interval in input/midi.ts

const midi = await JZZ()
if (!midi.info().outputs.some(o => o.name === PORT_NAME)) {
  console.error(`"${PORT_NAME}" not found: start loopMIDI with a port of that name.`)
  process.exit(1)
}
const out = await midi.openMidiOut(PORT_NAME)
// What Modus's MIDI out sends to the loopMIDI port comes back here
const received = []
const loopIn = await midi.openMidiIn(PORT_NAME)
loopIn.connect(msg => received.push([...msg]))
const { server, url } = await serve()
const origin = url.replace(/\/$/, '')
const results = []

async function firefoxContext() {
  const profile = await mkdtemp(join(tmpdir(), 'modus-ff-'))
  // First launch creates the profile and its permission database
  await (await firefox.launchPersistentContext(profile, { headless: true })).close()
  const db = new DatabaseSync(join(profile, 'permissions.sqlite'))
  const insert = db.prepare('INSERT INTO moz_perms (origin, type, permission, expireType, expireTime, modificationTime) VALUES (?, ?, 1, 0, 0, ?)')
  for (const type of ['midi', 'midi-sysex']) insert.run(origin, type, Date.now())
  db.close()
  const context = await firefox.launchPersistentContext(profile, { headless: true, firefoxUserPrefs: { 'media.volume_scale': '0.0', 'intl.accept_languages': 'en-US' } })  // silent: the app plays every chord
  return { context, dispose: async () => { await context.close(); await rm(profile, { recursive: true, force: true }) } }
}

async function chromeContext() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] })
  // The checks read English names; without a locale Chrome takes the system's, and Modus follows it
  const context = await browser.newContext({ locale: 'en-US' })
  await context.grantPermissions(['midi', 'midi-sysex'], { origin })
  return { context, dispose: () => browser.close() }
}

async function run(browserName, makeContext) {
  const { context, dispose } = await makeContext()
  const page = context.pages()[0] ?? await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const sleep = ms => page.waitForTimeout(ms)
  const badge = async () => (await page.locator('.chord-name-badge').count()) ? page.locator('.chord-name-badge').first().innerText() : null
  const play = async (notes, ms = 300) => { for (const n of notes) out.noteOn(0, n, 100); await sleep(ms) }
  const release = async (notes, ms = 200) => { for (const n of notes) out.noteOff(0, n); await sleep(ms) }

  async function check(name, fn) {
    try { await fn(); results.push(['ok', `${browserName}: ${name}`]) }
    catch (err) { results.push(['FAIL', `${browserName}: ${name}`, err.message.split('\n')[0]]) }
    for (let n = 0; n < 128; n++) out.noteOff(0, n)
  }
  const assert = (cond, msg) => { if (!cond) throw new Error(msg) }

  await page.goto(url)
  await page.waitForFunction(() => window.UMT && window.Notae)
  await sleep(1000)

  const inputMenu = async (f) => {
    await page.click('#btn-input-status')
    await f()
    await page.click('#btn-input-status')
  }
  const pickDevice = id => inputMenu(() => page.click(`#midi-device-list [data-value="${id}"]`))
  const mode = m => inputMenu(() => page.click(`#btn-${m}`))

  await check('the loopMIDI port is listed and selectable', async () => {
    const option = page.locator('#midi-device option', { hasText: PORT_NAME })
    assert(await option.count() === 1, `devices: ${(await page.locator('#midi-device option').allInnerTexts()).join(' | ')}`)
    await pickDevice(await option.getAttribute('value'))
  })

  await check('a chord is detected while held and cleared on release', async () => {
    await play([60, 64, 67])
    assert(await badge() === 'C', `held: ${await badge()}`)
    await release([60, 64, 67])
    assert(await badge() === null, `after release: ${await badge()}`)
  })

  await check('hold mode keeps the chord after real note-offs', async () => {
    await mode('hold')
    await play([62, 65, 69])
    await release([62, 65, 69])
    assert(await badge() === 'Dm', `held in hold mode: ${await badge()}`)
    await mode('normal')
  })

  await check('still receiving after the device rescan runs', async () => {
    await sleep(RESCAN_WAIT_MS)
    await play([64, 67, 71])
    assert(await badge() === 'Em', `after rescan: ${await badge()}`)
    await release([64, 67, 71])
  })

  // MIDI out to loopMIDI needs the input on another port, or Modus refuses the loop. Any
  // other input does (nothing is played on it); without one the check is skipped.
  const otherInput = await page.locator('#midi-device option').evaluateAll((opts, name) =>
    opts.find(o => o.textContent !== name)?.value ?? null, PORT_NAME)
  if (otherInput) {
    await check('MIDI out: a circle click arrives at the loopMIDI port on the chosen channel', async () => {
      await pickDevice(otherInput)
      await page.click('#btn-settings')
      await page.click('.set-nav-item[data-section="io"]')
      await page.click('[data-pick="midi-out"]')
      await page.locator('.set-pick-list .set-pick-option', { hasText: PORT_NAME }).click()
      await page.click('[data-pick="midi-out-ch"]')
      await page.click('.set-pick-list [data-pick-value="5"]')
      await page.keyboard.press('Escape')
      received.length = 0
      await page.locator('#cof-container [data-chord="F"]').click()
      await sleep(300)
      assert(received.some(m => m[0] === 0x94 && m[1] === 65 && m[2] > 0), `received: ${JSON.stringify(received)}`)
      await page.click('#btn-settings')
      await page.click('[data-pick="midi-out"]')
      await page.click('.set-pick-list [data-pick-value=""]')
      await page.keyboard.press('Escape')
      await sleep(200)
      assert(received.some(m => m[0] === 0xB4 && m[1] === 123), 'no All Notes Off when switching off')
    })
  } else results.push(['skip', `${browserName}: MIDI out (no input besides ${PORT_NAME})`])

  await check('no page errors', async () => assert(errors.length === 0, errors.join(' | ')))
  await dispose()
}

await run('chrome', chromeContext)
await run('firefox', firefoxContext)

out.close()
loopIn.close()
midi.close()
server.close()

for (const [status, name, msg] of results) console.log(`  ${status.padEnd(4)} ${name}${msg ? ` — ${msg}` : ''}`)
const failed = results.filter(r => r[0] === 'FAIL').length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
