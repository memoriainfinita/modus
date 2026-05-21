import { initMidi, setNoteChangeCallback, setMode, getMode, getDevices, selectDevice } from './midi'
import { analyzeNotes, buildHarmonicAnalysis, getAutoKey } from './analyzer'
import { initAudioOnGesture } from './audio'
import { loadGuitarDB, renderStaff, renderPiano, renderGuitar, renderNeck, renderCircleOfFifths } from './diagrams'
import { setHistoryChangeCallback, getEntries, addEntry, clearHistory, notifyChordDetected, renderHistory } from './history'
import { loadSong, saveSong, mountSong, addChord as songAddChord, addSection, insertChordAfter, updateChord } from './song'
import type { AppState, HistoryEntry, SongChord } from './types'

// ─── Size preferences ────────────────────────────────────────────────────────

let staffWidth = 380
let cofSize = parseInt(localStorage.getItem('cof-size') ?? '160')
let cofAccidental = (localStorage.getItem('cof-accidental') ?? 'flat') as 'sharp' | 'flat'
let cofShowMinor   = JSON.parse(localStorage.getItem('cof-show-minor')   ?? 'true')
let cofShowDegrees = JSON.parse(localStorage.getItem('cof-show-degrees') ?? 'false')
let cofShow7ths    = JSON.parse(localStorage.getItem('cof-show-7ths')    ?? 'false')

// ─── State ───────────────────────────────────────────────────────────────────

const state: AppState = {
  midi: { deviceId: null, mode: 'normal', activeNotes: new Set(), lastArpeggioNotes: [], arpeggioTimer: null },
  activeKey: localStorage.getItem('active-key') || null,
  detectedKey: null,
  detection: null,
  analysis: null,
  history: [],
  song: loadSong(),
  activeCursorId: null,
  historyActiveCursorId: null,
  captureTargetId: null,
  panels: {
    notation: true,
    piano: JSON.parse(localStorage.getItem('panel-piano') ?? 'true'),
    neck: JSON.parse(localStorage.getItem('panel-neck') ?? 'true'),
    history: JSON.parse(localStorage.getItem('panel-history') ?? 'true'),
    song: JSON.parse(localStorage.getItem('panel-song') ?? 'true'),
  }
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id)!

function init() {
  if (!navigator.requestMIDIAccess) {
    $('browser-warning').style.display = 'block'
  }

  document.addEventListener('click', initAudioOnGesture, { once: true })

  loadGuitarDB()
  buildLayout()
  wireKeyboard()
  renderZone1Diagrams([], null)
  renderZone1Analysis()

  initMidi().then(result => {
    if (result.denied) {
      showMidiBanner('MIDI access denied. Grant permission in browser settings to use a controller.')
    }
    if (!result.unsupported) {
      refreshDeviceDropdown()
      // Sync mode buttons with restored mode from localStorage
      setModeBtn(getMode())
    }
  })

  setNoteChangeCallback(onNoteChange)
  setHistoryChangeCallback(onHistoryChange)

  window.addEventListener('history-capture-requested', () => {
    if (state.detection?.kind === 'chord') {
      addEntry(state.detection.candidates[0], state.detection.notes)
    }
  })

  renderZone3()
}

// ─── Song handlers (always fresh — fixes stale activeCursorId/captureTargetId) ─

function makeSongHandlers() {
  return {
    onChordClick: (id: string, symbol: string) => {
      state.activeCursorId = id
      if (symbol) triggerChordAnalysis(symbol)
    },
    onChordCapture: (id: string) => {
      state.captureTargetId = id
      state.activeCursorId = id
      renderZone3()
    },
    activeCursorId: state.activeCursorId,
    captureTargetId: state.captureTargetId,
    activeKey: state.activeKey,
    onSongChange: (song: typeof state.song) => {
      state.song = song
      saveSong(song)
      renderZone3()
    }
  }
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function buildLayout() {
  $('zone1').innerHTML = `
    <div id="z1-toolbar" style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:#111128;border-bottom:1px solid #2d2d44;flex-wrap:wrap">
      <span id="midi-status" style="font-size:12px;color:#6b7280">MIDI: —</span>
      <select id="midi-device" style="background:#252540;color:#e0e0e0;border:1px solid #4a4a6a;border-radius:4px;padding:3px;font-size:12px"></select>
      <button id="btn-normal" class="mode-btn" data-mode="normal">Normal</button>
      <button id="btn-hold" class="mode-btn" data-mode="hold">Hold</button>
      <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio">Arpeggio</button>
      <select id="key-select" style="background:#252540;color:#e0e0e0;border:1px solid #4a4a6a;border-radius:4px;padding:3px;font-size:12px">
        <option value="">Key: Auto</option>
        ${['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'].flatMap(r =>
          [`<option value="${r} Major">${r} Major</option>`, `<option value="${r} Minor">${r} Minor</option>`]
        ).join('')}
      </select>
      <span id="auto-key-label" style="font-size:11px;color:#6b7280"></span>
    </div>
    <!-- Row 1: notation — staff + CoF side by side, guitar stacked below CoF -->
    <div id="notation-panel" style="padding:8px 12px;border-bottom:1px solid #2d2d44">
      <div class="panel-header"><span>Notation</span><button class="toggle-btn" data-panel="notation">▼</button></div>
      <div id="notation-content" style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;justify-content:center">
        <!-- Column 1: Staff -->
        <div style="flex:0 0 auto">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Staff</div>
          <div id="chord-summary" style="min-height:32px;margin-bottom:4px"></div>
          <div id="staff-container"></div>
        </div>
        <!-- Column 2: Analysis -->
        <div style="flex:0 0 auto;min-width:140px">
          <div style="font-size:10px;color:#6b7280;margin-bottom:6px">Analysis</div>
          <div id="analysis-content" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
        <!-- Column 3: CoF -->
        <div style="flex:0 0 auto">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">CoF</div>
          <div id="cof-container"></div>
          <div style="display:flex;flex-direction:column;gap:3px;align-items:center;margin-top:4px">
            <div style="display:flex;gap:3px">
              <button id="btn-cof-minus" class="size-ctrl-btn" title="Smaller">−</button>
              <button id="btn-cof-plus"  class="size-ctrl-btn" title="Larger">+</button>
            </div>
            <div style="display:flex;gap:3px">
              <button id="btn-cof-flat"   class="size-ctrl-btn" title="Show flat enharmonics (Gb, Db…)">b</button>
              <button id="btn-cof-sharp"  class="size-ctrl-btn" title="Show sharp enharmonics (F#, C#…)">#</button>
              <button id="btn-cof-minor"  class="size-ctrl-btn" title="Show/hide minor and diminished rings">m</button>
              <button id="btn-cof-deg"    class="size-ctrl-btn" title="Show scale degrees (I, IV, V…)">°</button>
              <button id="btn-cof-7"      class="size-ctrl-btn" title="Show 7th chords (maj7, m7, ø7)">7</button>
            </div>
          </div>
        </div>
        <!-- Column 4: Guitar -->
        <div style="flex:0 0 auto">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Guitar</div>
          <div id="guitar-container" style="min-height:220px"></div>
        </div>
      </div>
    </div>
    <!-- Row 3: piano -->
    <div id="piano-panel" style="padding:8px 12px;border-bottom:1px solid #2d2d44">
      <div class="panel-header"><span>Piano</span><button class="toggle-btn" data-panel="piano">▼</button></div>
      <div id="piano-content" style="overflow-x:auto">
        <div style="display:flex;justify-content:center">
          <div id="piano-container"></div>
        </div>
      </div>
    </div>
    <!-- Row 4: neck -->
    <div id="neck-panel" style="padding:8px 12px;border-bottom:1px solid #2d2d44">
      <div class="panel-header"><span>Fretboard</span><button class="toggle-btn" data-panel="neck">▼</button></div>
      <div id="neck-content" style="overflow-x:auto">
        <div style="display:flex;justify-content:center">
          <div id="neck-container"></div>
        </div>
      </div>
    </div>
    <div id="midi-banner" style="display:none;background:#7f1d1d;padding:6px 12px;font-size:12px"></div>
  `

  $('zone2').innerHTML = `
    <div class="zone-header">
      <span style="font-size:12px;font-weight:600">History</span>
      <button class="toggle-btn" data-panel="history">▼</button>
    </div>
    <div id="zone2-content"></div>
  `

  $('zone3').innerHTML = `
    <div class="zone-header">
      <span style="font-size:12px;font-weight:600">Song Structure</span>
      <button class="toggle-btn" data-panel="song">▼</button>
    </div>
    <div id="zone3-content"></div>
  `

  // CoF controls
  const updateCofButtons = () => {
    const act = 'background:#4f46e5;color:#fff;border:1px solid #4a4a6a;border-radius:3px;cursor:pointer;font-size:11px;padding:1px 7px'
    const def = 'background:#252540;color:#9ca3af;border:1px solid #4a4a6a;border-radius:3px;cursor:pointer;font-size:11px;padding:1px 7px'
    ;($('btn-cof-flat')  as HTMLButtonElement).style.cssText = cofAccidental === 'flat'  ? act : def
    ;($('btn-cof-sharp') as HTMLButtonElement).style.cssText = cofAccidental === 'sharp' ? act : def
    ;($('btn-cof-minor') as HTMLButtonElement).style.opacity = cofShowMinor   ? '1' : '0.4'
    ;($('btn-cof-deg')   as HTMLButtonElement).style.opacity = cofShowDegrees ? '1' : '0.4'
    ;($('btn-cof-7')     as HTMLButtonElement).style.opacity = cofShow7ths    ? '1' : '0.4'
  }
  updateCofButtons()

  $('btn-cof-minus').addEventListener('click', () => {
    cofSize = Math.max(100, cofSize - 20)
    localStorage.setItem('cof-size', String(cofSize))
    reRenderDiagrams()
  })
  $('btn-cof-plus').addEventListener('click', () => {
    cofSize = Math.min(400, cofSize + 20)
    localStorage.setItem('cof-size', String(cofSize))
    reRenderDiagrams()
  })
  $('btn-cof-flat').addEventListener('click', () => {
    cofAccidental = 'flat'
    localStorage.setItem('cof-accidental', cofAccidental)
    updateCofButtons(); reRenderDiagrams()
  })
  $('btn-cof-sharp').addEventListener('click', () => {
    cofAccidental = 'sharp'
    localStorage.setItem('cof-accidental', cofAccidental)
    updateCofButtons(); reRenderDiagrams()
  })
  $('btn-cof-minor').addEventListener('click', () => {
    cofShowMinor = !cofShowMinor
    localStorage.setItem('cof-show-minor', String(cofShowMinor))
    updateCofButtons(); reRenderDiagrams()
  })
  $('btn-cof-deg').addEventListener('click', () => {
    cofShowDegrees = !cofShowDegrees
    localStorage.setItem('cof-show-degrees', String(cofShowDegrees))
    updateCofButtons(); reRenderDiagrams()
  })
  $('btn-cof-7').addEventListener('click', () => {
    cofShow7ths = !cofShow7ths
    localStorage.setItem('cof-show-7ths', String(cofShow7ths))
    updateCofButtons(); reRenderDiagrams()
  })
  // Restore key selector value
  if (state.activeKey) {
    ($('key-select') as HTMLSelectElement).value = state.activeKey
  }

  document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode as any
      if (getMode() === m) return
      setMode(m)
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active-mode'))
      btn.classList.add('active-mode')
    })
  })

  $('key-select').addEventListener('change', (e) => {
    state.activeKey = (e.target as HTMLSelectElement).value || null
    localStorage.setItem('active-key', state.activeKey ?? '')
    refreshAll()
  })

  document.querySelectorAll<HTMLButtonElement>('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel as keyof typeof state.panels
      state.panels[panel] = !state.panels[panel]
      if (panel === 'history' || panel === 'song' || panel === 'piano' || panel === 'neck') {
        localStorage.setItem(`panel-${panel}`, JSON.stringify(state.panels[panel]))
      }
      applyPanelVisibility()
    })
  })

  // Apply saved panel visibility on load
  applyPanelVisibility()
}

function applyPanelVisibility() {
  const nc = $('notation-content'); if (nc) nc.style.display = state.panels.notation ? 'flex' : 'none'
  const pc = $('piano-content'); if (pc) pc.style.display = state.panels.piano ? '' : 'none'
  const nk = $('neck-content'); if (nk) nk.style.display = state.panels.neck ? '' : 'none'
  const z2 = $('zone2-content'); if (z2) z2.style.display = state.panels.history ? '' : 'none'
  const z3 = $('zone3-content'); if (z3) z3.style.display = state.panels.song ? '' : 'none'
  ;(['notation', 'piano', 'neck', 'history', 'song'] as const).forEach(key => {
    const btn = document.querySelector<HTMLButtonElement>(`.toggle-btn[data-panel="${key}"]`)
    if (btn) btn.textContent = state.panels[key] ? '▲' : '▼'
  })
}

// ─── MIDI callbacks ───────────────────────────────────────────────────────────

function onNoteChange(notes: number[]) {
  // MIDI capture-to-fill flow
  if (state.captureTargetId && notes.length >= 1) {
    const result = analyzeNotes(notes, state.activeKey, getLastHistorySymbol())
    if (result?.kind === 'chord') {
      const sym = result.candidates[0]
      state.song = updateChord(state.song, state.captureTargetId, sym)
      saveSong(state.song)
      const next = findChordAfter(state.song, state.captureTargetId)
      state.activeCursorId = next?.id ?? null
      state.captureTargetId = null
      renderZone3()
      return
    }
  }

  const result = analyzeNotes(notes, state.activeKey, getLastHistorySymbol())
  state.detection = result

  if (result?.kind === 'chord') {
    const sym = result.candidates[result.selectedIndex]
    const isKnown = sym !== '?'
    state.analysis = null
    if (isKnown) {
      try { state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol()) } catch { }
      notifyChordDetected(sym, result.notes)
    }
    renderZone1Diagrams(result.notes, isKnown ? sym : null)
  } else if (result?.kind === 'note') {
    state.analysis = null
    renderZone1Diagrams([result.noteName], null)
  } else if (result?.kind === 'interval') {
    state.analysis = null
    renderZone1Diagrams(result.notes, null)
  } else {
    state.analysis = null
    renderZone1Diagrams([], null)
  }

  renderZone1Analysis()
  refreshAutoKey()
}

function getLastHistorySymbol(): string | null {
  return state.history[0]?.symbol ?? null
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderZone1Diagrams(noteNames: string[], chordSymbol: string | null) {
  renderStaff($('staff-container'), noteNames, staffWidth, state.activeKey)
  const quality = chordSymbol ? getChordQuality(chordSymbol) : ''
  renderPiano($('piano-container'), noteNames, quality)
  const chordRoot = chordSymbol ? (chordSymbol.match(/^([A-G][b#]?)/) ?? [, ''])[1] || null : null
  renderNeck($('neck-container'), noteNames, chordRoot)
  renderGuitar($('guitar-container'), chordSymbol, noteNames)
  renderCircleOfFifths($('cof-container'), state.activeKey, chordSymbol ? chordSymbol[0] : null, (key) => {
    state.activeKey = key
    localStorage.setItem('active-key', key)
    ;($('key-select') as HTMLSelectElement).value = key
    refreshAll()
  }, cofSize, { accidental: cofAccidental, showMinor: cofShowMinor, showDegrees: cofShowDegrees, show7ths: cofShow7ths })
}

function reRenderDiagrams() {
  const d = state.detection
  if (!d) { renderZone1Diagrams([], null); return }
  if (d.kind === 'chord') renderZone1Diagrams(d.notes, d.candidates[d.selectedIndex])
  else if (d.kind === 'note') renderZone1Diagrams([d.noteName], null)
  else renderZone1Diagrams((d as any).notes ?? [], null)
}

function getChordQuality(chordSymbol: string): string {
  try { return UMT.parseChordSymbol(chordSymbol).quality?.toLowerCase() ?? '' } catch { return '' }
}

const CHORD_QUALITY_COLORS: Record<string, string> = {
  major: '#f59e0b', minor: '#3b82f6', 'dominant seventh': '#ef4444',
  'major seventh': '#f59e0b', 'minor seventh': '#3b82f6',
  diminished: '#7c3aed', 'diminished seventh': '#7c3aed',
  'half-diminished seventh': '#7c3aed', augmented: '#0d9488',
  sus: '#6b7280',
}

function renderChordSummary() {
  const el = $('chord-summary')
  if (!el) return
  const d = state.detection
  if (!d || d.kind !== 'chord') { el.innerHTML = ''; return }

  const chordName = d.candidates[d.selectedIndex]
  const color = CHORD_QUALITY_COLORS[getChordQuality(chordName)] ?? '#6b7280'
  const notes = d.notes.map(n => n.replace(/(-?\d+)$/, '')).join(' · ')
  const alts = d.candidates.slice(1, 7)

  el.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:baseline;gap:8px;flex-wrap:wrap">
      <span style="font-size:20px;font-weight:700;padding:1px 8px;border-radius:4px;background:${color}22;border-left:3px solid ${color}">${chordName}</span>
      <span style="font-size:11px;color:#6b7280">${notes}</span>
      ${alts.map((c, i) =>
        `<button class="alt-chord-sum" data-idx="${i + 1}" style="padding:2px 7px;border-radius:3px;background:#1e1e35;color:#9ca3af;border:1px solid #3a3a5c;cursor:pointer;font-size:11px">${c}</button>`
      ).join('')}
    </div>`

  el.querySelectorAll<HTMLElement>('.alt-chord-sum').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.detection?.kind === 'chord') {
        state.detection.selectedIndex = parseInt(btn.dataset.idx!)
        const sym = state.detection.candidates[state.detection.selectedIndex]
        state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol())
        renderZone1Analysis()
        renderZone1Diagrams(state.detection.notes, sym)
      }
    })
  })
}

function renderZone1Analysis() {
  renderChordSummary()
  const el = $('analysis-content')
  if (!el) return

  const d = state.detection
  const a = state.analysis

  const row = (label: string, val: string) =>
    `<div style="display:flex;gap:6px;align-items:baseline">
      <span style="font-size:10px;color:#6b7280;min-width:58px;flex-shrink:0">${label}</span>
      <span style="font-size:11px">${val}</span>
    </div>`

  let roman = '—', func_ = '—', figuredBass = '—', diatonic = '—', scales = '—', cadence = '—'
  let extra = ''

  if (d?.kind === 'note') {
    extra = row('Note', `${d.noteName} · MIDI ${d.midiNumber}`)
  } else if (d?.kind === 'interval') {
    extra = row('Interval', `${d.intervalName} · ${d.semitones} st`) + row('Inversion', d.inversionName)
  } else if (d?.kind === 'chord' && a) {
    roman = a.roman
    func_ = ({T:'Tonic',S:'Subdominant',D:'Dominant',unknown:'Unknown'} as Record<string,string>)[a.function]
    figuredBass = a.figuredBass || '—'
    diatonic = a.isDiatonic ? 'Yes' : a.isBorrowed ? `Borrowed (${a.borrowedFrom ?? '?'})` : 'Chromatic'
    scales = a.suggestedScales.slice(0, 4).join(', ') || '—'
    cadence = a.cadence || '—'
    if (a.isSecondary) extra += row('Secondary', `→ ${a.secondaryTarget}`)
    if (a.coltraneAxis) extra += row('Coltrane', a.coltraneAxis.join(' · '))
    if (a.negativeHarmony) extra += row('Neg. harm.', a.negativeHarmony)
    if (a.substitutions?.length) extra += row('Subs.', a.substitutions.join(', '))
  }

  el.innerHTML =
    row('Roman', roman) +
    row('Function', func_) +
    row('Fig. bass', figuredBass) +
    row('Diatonic', diatonic) +
    row('Scales', scales) +
    row('Cadence', cadence) +
    extra
}

function renderZone2() {
  renderHistory(
    $('zone2-content'),
    state.activeKey,
    (entry) => {
      state.historyActiveCursorId = entry.id
      triggerChordAnalysis(entry.symbol)
      renderZone2()
    },
    state.historyActiveCursorId
  )
}

function renderZone3() {
  mountSong($('zone3-content'), state.song, makeSongHandlers())
}

function refreshAll() {
  reRenderDiagrams()  // key may have changed — re-render staff with new key sig
  renderZone1Analysis()
  renderZone2()
  renderZone3()
}

function triggerChordAnalysis(symbol: string) {
  state.analysis = buildHarmonicAnalysis(symbol, state.activeKey, getLastHistorySymbol())
  state.detection = { kind: 'chord', notes: [], candidates: [symbol], selectedIndex: 0 }
  renderZone1Analysis()
  const dummyNotes: string[] = []
  try {
    const chord = UMT.parseChordSymbol(symbol)
    chord.getNotes?.().forEach((n: any) => { if (n.name) dummyNotes.push(n.name) })
  } catch {}
  renderZone1Diagrams(dummyNotes, symbol)
}

function sendToSong(entry: HistoryEntry) {
  if (!state.song.sections.length) {
    state.song = addSection(state.song, 'Verse', 'verse')
  }

  if (state.activeCursorId) {
    // Insert after active song slot cursor
    state.song = insertChordAfter(state.song, state.activeCursorId, entry.symbol)
    const next = findChordAfter(state.song, state.activeCursorId)
    state.activeCursorId = next?.id ?? state.activeCursorId
  } else {
    // Append to end of last measure of last section
    const lastSection = state.song.sections[state.song.sections.length - 1]
    const lastMeasure = lastSection.measures[lastSection.measures.length - 1]
    state.song = songAddChord(state.song, lastSection.id, lastMeasure.id, entry.symbol)
  }

  saveSong(state.song)
  renderZone3()
}

function findChordAfter(song: typeof state.song, afterId: string): SongChord | null {
  for (const section of song.sections) {
    for (const measure of section.measures) {
      const idx = measure.chords.findIndex(c => c.id === afterId)
      if (idx !== -1 && idx + 1 < measure.chords.length) {
        return measure.chords[idx + 1]
      }
    }
  }
  return null
}

function onHistoryChange(entries: HistoryEntry[]) {
  state.history = entries
  renderZone2()
  refreshAutoKey()
}

function refreshAutoKey() {
  const auto = getAutoKey(state.history)
  state.detectedKey = auto
  const label = $('auto-key-label')
  if (label) label.textContent = state.activeKey ? '' : (auto ? `auto: ${auto}` : '')
  if (!state.activeKey && auto && state.analysis) {
    const sym = state.detection?.kind === 'chord' ? state.detection.candidates[0] : null
    if (sym) {
      state.analysis = buildHarmonicAnalysis(sym, auto, getLastHistorySymbol())
      renderZone1Analysis()
    }
  }
}

// ─── Device dropdown ─────────────────────────────────────────────────────────

let deviceListenersAttached = false

function refreshDeviceDropdown() {
  const sel = $('midi-device') as HTMLSelectElement
  const devices = getDevices()
  sel.innerHTML = devices.length
    ? devices.map(d => `<option value="${d.id}">${d.name}</option>`).join('')
    : '<option>No MIDI devices</option>'
  sel.onchange = () => selectDevice(sel.value)
  if (devices[0]) selectDevice(devices[0].id)

  $('midi-status').textContent = devices.length ? 'MIDI: connected' : 'MIDI: no devices'
  $('midi-status').style.color = devices.length ? '#4ade80' : '#6b7280'

  if (!deviceListenersAttached) {
    deviceListenersAttached = true
    window.addEventListener('midi-devices-changed', () => refreshDeviceDropdown())
    window.addEventListener('midi-device-disconnected', () => {
      $('midi-status').textContent = 'MIDI: disconnected'
      $('midi-status').style.color = '#f87171'
    })
  }
}

function showMidiBanner(msg: string) {
  const el = $('midi-banner')
  el.textContent = msg
  el.style.display = 'block'
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    switch (e.key) {
      case 'h': case 'H':
        setModeBtn(getMode() === 'hold' ? 'normal' : 'hold'); break
      case 'a': case 'A':
        setModeBtn(getMode() === 'arpeggio' ? 'normal' : 'arpeggio'); break
      case ' ':
        e.preventDefault()
        if (state.detection?.kind === 'chord') {
          addEntry(state.detection.candidates[0], state.detection.notes)
        }
        break
      case 's': case 'S': {
        // Send active history chip (or most recent if none selected)
        const activeEntry = state.historyActiveCursorId
          ? state.history.find(e => e.id === state.historyActiveCursorId)
          : state.history[0]
        if (activeEntry) sendToSong(activeEntry)
        break
      }
      case 'c': case 'C':
        if (confirm('Clear history?')) clearHistory(); break
      case 'Escape':
        state.activeCursorId = null
        state.captureTargetId = null
        renderZone3(); break
      default:
        if (e.key >= '1' && e.key <= '9') {
          const idx = parseInt(e.key) - 1
          if (state.detection?.kind === 'chord' && idx < state.detection.candidates.length) {
            state.detection.selectedIndex = idx
            const sym = state.detection.candidates[idx]
            state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol())
            renderZone1Analysis()
          }
        }
    }
  })
}

function setModeBtn(mode: string) {
  setMode(mode as any)
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active-mode', (b as HTMLElement).dataset.mode === mode)
  })
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

init()
