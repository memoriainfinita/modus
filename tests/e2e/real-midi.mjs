// End-to-end test through real Web MIDI: Node writes to the "loopMIDI Port" virtual port
// and the installed Chrome and Playwright's Firefox read it as a device. Covers what the
// fake in smoke.mjs cannot: the browser's own MIDI stack and permission.
// Needs loopMIDI running with a port named "loopMIDI Port", and Playwright's Firefox
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
  const context = await firefox.launchPersistentContext(profile, { headless: true, firefoxUserPrefs: { 'media.volume_scale': '0.0' } })  // silent: the app plays every chord
  return { context, dispose: async () => { await context.close(); await rm(profile, { recursive: true, force: true }) } }
}

async function chromeContext() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] })
  const context = await browser.newContext()
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

  await check('the loopMIDI port is listed and selectable', async () => {
    const option = page.locator('#midi-device option', { hasText: PORT_NAME })
    assert(await option.count() === 1, `devices: ${(await page.locator('#midi-device option').allInnerTexts()).join(' | ')}`)
    await page.selectOption('#midi-device', await option.getAttribute('value'))
  })

  await check('a chord is detected while held and cleared on release', async () => {
    await play([60, 64, 67])
    assert(await badge() === 'C', `held: ${await badge()}`)
    await release([60, 64, 67])
    assert(await badge() === null, `after release: ${await badge()}`)
  })

  await check('hold mode keeps the chord after real note-offs', async () => {
    await page.click('#btn-hold')
    await play([62, 65, 69])
    await release([62, 65, 69])
    assert(await badge() === 'Dm', `held in hold mode: ${await badge()}`)
    await page.click('#btn-normal')
  })

  await check('still receiving after the device rescan runs', async () => {
    await sleep(RESCAN_WAIT_MS)
    await play([64, 67, 71])
    assert(await badge() === 'Em', `after rescan: ${await badge()}`)
    await release([64, 67, 71])
  })

  await check('no page errors', async () => assert(errors.length === 0, errors.join(' | ')))
  await dispose()
}

await run('chrome', chromeContext)
await run('firefox', firefoxContext)

out.close()
midi.close()
server.close()

for (const [status, name, msg] of results) console.log(`  ${status.padEnd(4)} ${name}${msg ? ` — ${msg}` : ''}`)
const failed = results.filter(r => r[0] === 'FAIL').length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
