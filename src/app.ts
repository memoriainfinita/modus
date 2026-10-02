import { initMidi, setNoteChangeCallback, setNoteOnCallback, setMode, getMode, getDevices, selectDevice, getSelectedDeviceId } from './midi'
import { analyzeNotes, buildHarmonicAnalysis, getAutoKey } from './analyzer'
import { initAudioOnGesture, preloadAudio, setInstrument, getCurrentInstrument, setVolume, getVolume, playNote, playNoteNames, GM_INSTRUMENT_GROUPS, setAudioStatusCallback, setAudioMissedCallback } from './audio'
import { renderStaff, renderPiano, renderGuitar, renderNeck, renderCircleOfFifths, setGuitarControlsVisible, adjustNeckSpacing } from './diagrams'
import { setHistoryChangeCallback, clearHistoryWithUndo, notifyChordDetected, renderHistory, markActiveHistoryEntry } from './history'
import { loadSong, saveSong, addChord as songAddChord, addSection, insertChordAfter, updateChord } from './song-model'
import { mountSong, markActiveChord } from './song-view'
import type { AppState, DetectionResult, HistoryEntry, MidiMode, Song, SongChord } from './types'
import { toggleHelp, closeHelp } from './shortcuts'
import {
  ANALYSIS_FIELD_KEYS, ANALYSIS_FIELD_LABELS, ANALYSIS_FIELD_TOOLTIPS,
  renderZone1Analysis
} from './analysis-panel'
import type { AnalysisFieldKey } from './analysis-panel'
import { chordNoteNames } from './chord'
import { loadBool, loadChoice, loadNumber, loadString, save } from './storage'
import { escapeHtml } from './html'
import { ALL_KEYS, normalizeKey, keyPrefersSharps } from './keys'

// ─── Size preferences ────────────────────────────────────────────────────────

const staffWidth = 380
let cofSize = loadNumber('cof-size', 160, 100, 400)
let cofAccidental = loadChoice('cof-accidental', ['flat', 'sharp'] as const, 'flat')
let cofShowMinor   = loadBool('cof-show-minor', true)
let cofShowDegrees = loadBool('cof-show-degrees', false)
let cofShow7ths    = loadBool('cof-show-7ths', false)

const analysisFieldsVisible = Object.fromEntries(
  ANALYSIS_FIELD_KEYS.map(f => [f, loadBool(`analysis-field-${f}`, true)])
) as Record<AnalysisFieldKey, boolean>
let analysisScale = loadNumber('analysis-scale', 11, 8, 20)

// ─── State ───────────────────────────────────────────────────────────────────

const state: AppState = {
  activeKey: normalizeKey(loadString('active-key', '')),
  detection: null,
  analysis: null,
  history: [],
  song: loadSong(),
  activeCursorId: null,
  historyActiveCursorId: null,
  captureTargetId: null,
  panels: {
    notation: true,  // always open on load (not persisted)
    instruments:      loadBool('panel-instruments', true),
    colPiano:         loadBool('panel-colPiano', true),
    colNeck:          loadBool('panel-colNeck', true),
    history:          loadBool('panel-history', true),
    song:             loadBool('panel-song', true),
    cofControls:      loadBool('panel-cofControls', true),
    guitarControls:   loadBool('panel-guitarControls', true),
    analysisControls: loadBool('panel-analysisControls', true),
    colStaff:         loadBool('panel-colStaff', true),
    colAnalysis:      loadBool('panel-colAnalysis', true),
    colCoF:           loadBool('panel-colCoF', true),
    colGuitar:        loadBool('panel-colGuitar', true),
  }
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id)!

function init() {
  if (!navigator.requestMIDIAccess) {
    $('browser-warning').style.display = 'block'
  }

  document.addEventListener('click', initAudioOnGesture, { once: true })
  preloadAudio()

  buildLayout()
  wireKeyboard()
  setModeBtn(getMode())
  renderDetector()

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
  setNoteOnCallback(note => playNote(note, 1.5))
  setHistoryChangeCallback(onHistoryChange)

  setAudioMissedCallback(() => {
    const el = document.getElementById('audio-progress')
    if (!el) return
    el.classList.remove('missed')
    void el.offsetWidth  // restart the animation
    el.classList.add('missed')
  })

  let progressTimer: ReturnType<typeof setInterval> | null = null
  let progressValue = 0

  setAudioStatusCallback(status => {
    const el = document.getElementById('audio-status')
    const fill = document.getElementById('audio-progress-fill')
    if (!el || !fill) return

    const labels: Record<string, string> = { idle: '♪ idle', loading: '♪ loading…', suspended: '♪ click to activate', ready: '♪ ready', error: '♪ error' }
    el.textContent = labels[status] ?? status

    if (progressTimer) { clearInterval(progressTimer); progressTimer = null }

    if (status === 'loading') {
      progressValue = 0
      fill.style.background = ''
      fill.style.transition = 'none'
      fill.style.width = '0%'
      progressTimer = setInterval(() => {
        progressValue += (90 - progressValue) * 0.06
        fill.style.transition = 'width 0.1s linear'
        fill.style.width = progressValue.toFixed(1) + '%'
      }, 100)
    } else if (status === 'suspended') {
      fill.style.background = '#f59e0b'
      fill.style.transition = 'width 0.3s ease-out'
      fill.style.width = '100%'
    } else if (status === 'ready') {
      fill.style.background = '#22c55e'
      fill.style.transition = 'width 0.2s ease-out'
      fill.style.width = '100%'
    } else if (status === 'error') {
      fill.style.background = '#ef4444'
      fill.style.transition = 'width 0.2s ease-out'
      fill.style.width = '100%'
    } else {
      fill.style.background = ''
      fill.style.transition = 'none'
      fill.style.width = '0%'
    }
  })

  renderZone3()
}

// ─── Song handlers (always fresh — fixes stale activeCursorId/captureTargetId) ─

function makeSongHandlers() {
  return {
    onChordClick: (id: string, symbol: string, notes?: string[]) => {
      state.activeCursorId = id
      markActiveChord(id)
      if (symbol) showChord(symbol, notes, previousSongSymbol(id))
    },
    onChordCapture: (id: string) => {
      state.captureTargetId = id
      state.activeCursorId = id
      renderZone3()
    },
    activeCursorId: state.activeCursorId,
    captureTargetId: state.captureTargetId,
    activeKey: state.activeKey,
    onSongChange: (song: Song) => {
      state.song = song
      saveSong(song)
      renderZone3()
    }
  }
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function buildToolbar(): string {
  return `
    <div id="z1-toolbar" class="toolbar">
      <span id="midi-status" class="midi-status">MIDI: —</span>
      <select id="midi-device" class="ctrl-select"></select>
      <button id="btn-normal" class="mode-btn" data-mode="normal">Normal</button>
      <button id="btn-hold" class="mode-btn" data-mode="hold">Hold</button>
      <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio">Arpeggio</button>
      <select id="key-select" class="ctrl-select">
        <option value="">Key: Auto</option>
        ${ALL_KEYS.map(k => `<option value="${k}">${k}</option>`).join('')}
      </select>
      <span id="auto-key-label" class="auto-key-label"></span>
      <span class="toolbar-sep"></span>
      <div id="audio-progress" class="audio-progress" title="Soundfont status">
        <div id="audio-progress-fill" class="audio-progress-fill"></div>
        <span id="audio-status" class="audio-status">♪ idle</span>
      </div>
      <button id="btn-play-chord" class="ctrl-btn" title="Play current chord (P)">▶</button>
      <select id="audio-instrument" class="ctrl-select" title="Soundfont instrument">
        ${GM_INSTRUMENT_GROUPS.map(g =>
          `<optgroup label="${g.label}">${g.instruments.map(i =>
            `<option value="${i}"${i === getCurrentInstrument() ? ' selected' : ''}>${i.replace(/_/g,' ')}</option>`
          ).join('')}</optgroup>`
        ).join('')}
      </select>
      <input id="audio-volume" type="range" min="0" max="1" step="0.05" value="${getVolume()}" title="Volume" class="volume-slider">
      <button id="btn-help" class="help-btn" title="Keyboard shortcuts">?</button>
    </div>`
}

function buildNotationPanel(): string {
  return `
    <div id="notation-panel" class="zone-panel">
      <div class="panel-header">
        <span>Notation</span>
        <div class="col-vis-row">
          <button class="col-vis-btn${state.panels.colStaff ? ' active' : ''}" data-col="colStaff" title="Staff">St</button>
          <button class="col-vis-btn${state.panels.colAnalysis ? ' active' : ''}" data-col="colAnalysis" title="Analysis">An</button>
          <button class="col-vis-btn${state.panels.colCoF ? ' active' : ''}" data-col="colCoF" title="Circle of Fifths">CoF</button>
          <button class="col-vis-btn${state.panels.colGuitar ? ' active' : ''}" data-col="colGuitar" title="Guitar">Git</button>
        </div>
        <button class="toggle-btn" data-panel="notation">▼</button>
      </div>
      <div id="notation-content">
        <div class="col-auto" id="col-staff">
          <div class="col-label">Staff</div>
          <div id="chord-summary"></div>
          <div id="staff-container"></div>
        </div>
        <div class="col-analysis" id="col-analysis">
          <div class="col-header">
            <div class="col-label">Analysis</div>
            <button class="toggle-btn small" data-panel="analysisControls">▼</button>
          </div>
          <div id="analysis-content"></div>
          <div id="analysis-controls">
            <div class="ctrl-row">
              <button id="btn-analysis-minus" class="size-ctrl-btn" title="Smaller">−</button>
              <button id="btn-analysis-plus"  class="size-ctrl-btn" title="Larger">+</button>
            </div>
            <div class="ctrl-row" style="display:grid;grid-template-columns:repeat(5,1fr);gap:2px">
              ${ANALYSIS_FIELD_KEYS.map(f =>
                `<button id="btn-field-${f}" class="size-ctrl-btn${analysisFieldsVisible[f] ? ' active' : ''}"
                  title="${ANALYSIS_FIELD_TOOLTIPS[f]}">${ANALYSIS_FIELD_LABELS[f]}</button>`
              ).join('')}
            </div>
          </div>
        </div>
        <div class="col-auto" id="col-cof">
          <div class="col-header">
            <div class="col-label">CoF</div>
            <button class="toggle-btn small" data-panel="cofControls">▼</button>
          </div>
          <div id="cof-container"></div>
          <div id="cof-controls">
            <div class="ctrl-row">
              <button id="btn-cof-minus" class="size-ctrl-btn" title="Smaller">−</button>
              <button id="btn-cof-plus"  class="size-ctrl-btn" title="Larger">+</button>
            </div>
            <div class="ctrl-row">
              <button id="btn-cof-flat"   class="size-ctrl-btn" title="Show flat enharmonics (Gb, Db…)">b</button>
              <button id="btn-cof-sharp"  class="size-ctrl-btn" title="Show sharp enharmonics (F#, C#…)">#</button>
              <button id="btn-cof-minor"  class="size-ctrl-btn" title="Show/hide minor and diminished rings">m</button>
              <button id="btn-cof-deg"    class="size-ctrl-btn" title="Show scale degrees (I, IV, V…)">°</button>
              <button id="btn-cof-7"      class="size-ctrl-btn" title="Show 7th chords (maj7, m7, ø7)">7</button>
            </div>
          </div>
        </div>
        <div class="col-auto" id="col-guitar">
          <div class="col-header">
            <div class="col-label">Guitar</div>
            <button class="toggle-btn small" data-panel="guitarControls">▼</button>
          </div>
          <div id="guitar-container"></div>
        </div>
      </div>
    </div>`
}

function buildInstrumentsPanel(): string {
  return `
    <div id="instruments-panel" class="zone-panel">
      <div class="panel-header">
        <span>Instruments</span>
        <div class="col-vis-row">
          <button class="col-vis-btn${state.panels.colPiano ? ' active' : ''}" data-col="colPiano" title="Piano">Pi</button>
          <button class="col-vis-btn${state.panels.colNeck  ? ' active' : ''}" data-col="colNeck"  title="Fretboard">Fr</button>
        </div>
        <button class="toggle-btn" data-panel="instruments">▼</button>
      </div>
      <div id="instruments-content">
        <div id="col-piano"><div id="piano-container"></div></div>
        <div id="col-neck">
          <div id="neck-container"></div>
          <div class="ctrl-row" style="justify-content:center;margin-top:4px">
            <button id="btn-neck-minus" class="size-ctrl-btn" title="Smaller">−</button>
            <button id="btn-neck-plus"  class="size-ctrl-btn" title="Larger">+</button>
          </div>
        </div>
      </div>
    </div>`
}

function buildZoneHeaders() {
  $('zone2').innerHTML = `
    <div class="zone-header">
      <span class="zone-title">History</span>
      <button class="toggle-btn" data-panel="history">▼</button>
    </div>
    <div id="zone2-content"></div>`

  $('zone3').innerHTML = `
    <div class="zone-header">
      <span class="zone-title">Song Structure</span>
      <button class="toggle-btn" data-panel="song">▼</button>
    </div>
    <div id="zone3-content"></div>`
}

function wireLayoutEvents() {
  const updateCofButtons = () => {
    $('btn-cof-flat').classList.toggle('active', cofAccidental === 'flat')
    $('btn-cof-sharp').classList.toggle('active', cofAccidental === 'sharp')
    $('btn-cof-minor').style.opacity = cofShowMinor   ? '1' : '0.4'
    $('btn-cof-deg').style.opacity   = cofShowDegrees ? '1' : '0.4'
    $('btn-cof-7').style.opacity     = cofShow7ths    ? '1' : '0.4'
  }
  updateCofButtons()

  const onCofControl = (id: string, apply: () => void) => {
    $(id).addEventListener('click', () => { apply(); updateCofButtons(); renderDiagrams() })
  }
  onCofControl('btn-cof-minus', () => { cofSize = Math.max(100, cofSize - 20); save('cof-size', cofSize) })
  onCofControl('btn-cof-plus',  () => { cofSize = Math.min(400, cofSize + 20); save('cof-size', cofSize) })
  onCofControl('btn-cof-flat',  () => { cofAccidental = 'flat';  save('cof-accidental', cofAccidental) })
  onCofControl('btn-cof-sharp', () => { cofAccidental = 'sharp'; save('cof-accidental', cofAccidental) })
  onCofControl('btn-cof-minor', () => { cofShowMinor = !cofShowMinor;     save('cof-show-minor', cofShowMinor) })
  onCofControl('btn-cof-deg',   () => { cofShowDegrees = !cofShowDegrees; save('cof-show-degrees', cofShowDegrees) })
  onCofControl('btn-cof-7',     () => { cofShow7ths = !cofShow7ths;       save('cof-show-7ths', cofShow7ths) })

  $('btn-analysis-minus').addEventListener('click', () => {
    analysisScale = Math.max(8, analysisScale - 1)
    save('analysis-scale', analysisScale)
    renderAnalysisPanel()
  })
  $('btn-analysis-plus').addEventListener('click', () => {
    analysisScale = Math.min(20, analysisScale + 1)
    save('analysis-scale', analysisScale)
    renderAnalysisPanel()
  })

  const reRenderNeck = () => renderNeck($('neck-container'), displayedNotes(), !keyPrefersSharps(analysisKey()))
  $('btn-neck-minus').addEventListener('click', () => { adjustNeckSpacing(-2); reRenderNeck() })
  $('btn-neck-plus').addEventListener('click',  () => { adjustNeckSpacing(2);  reRenderNeck() })

  ANALYSIS_FIELD_KEYS.forEach(f => {
    $(`btn-field-${f}`).addEventListener('click', () => {
      analysisFieldsVisible[f] = !analysisFieldsVisible[f]
      save(`analysis-field-${f}`, analysisFieldsVisible[f])
      $(`btn-field-${f}`).classList.toggle('active', analysisFieldsVisible[f])
      renderAnalysisPanel()
    })
  })

  document.querySelectorAll<HTMLButtonElement>('.col-vis-btn, .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = (btn.dataset.col ?? btn.dataset.panel) as keyof typeof state.panels
      state.panels[panel] = !state.panels[panel]
      if (panel !== 'notation') save(`panel-${panel}`, state.panels[panel])
      applyPanelVisibility()
    })
  })

  if (state.activeKey) {
    ($('key-select') as HTMLSelectElement).value = state.activeKey
  }

  document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setModeBtn(btn.dataset.mode as MidiMode))
  })

  $('key-select').addEventListener('change', (e) => {
    setActiveKey((e.target as HTMLSelectElement).value || null)
  })

  $('btn-help').addEventListener('click', toggleHelp)
  $('btn-play-chord').addEventListener('click', playCurrent)

  $('audio-instrument').addEventListener('change', (e) => {
    setInstrument((e.target as HTMLSelectElement).value)
  })

  $('audio-volume').addEventListener('input', (e) => {
    setVolume(parseFloat((e.target as HTMLInputElement).value))
  })
}

function buildLayout() {
  $('zone1').innerHTML =
    buildToolbar() +
    buildNotationPanel() +
    buildInstrumentsPanel() +
    '<div id="midi-banner"></div>'

  buildZoneHeaders()
  wireLayoutEvents()
  applyPanelVisibility()
}

function applyPanelVisibility() {
  const nc = $('notation-content'); if (nc) nc.style.display = state.panels.notation ? 'flex' : 'none'
  const ic = $('instruments-content'); if (ic) ic.style.display = state.panels.instruments ? '' : 'none'
  const cp = $('col-piano'); if (cp) cp.style.display = state.panels.colPiano ? '' : 'none'
  const cn = $('col-neck');  if (cn) cn.style.display = state.panels.colNeck  ? '' : 'none'
  const z2 = $('zone2-content'); if (z2) z2.style.display = state.panels.history ? '' : 'none'
  const z3 = $('zone3-content'); if (z3) z3.style.display = state.panels.song ? '' : 'none'
  const cc = $('cof-controls'); if (cc) cc.style.display = state.panels.cofControls ? '' : 'none'
  setGuitarControlsVisible(state.panels.guitarControls)
  const gcw = document.getElementById('guitar-ctrl-wrap'); if (gcw) gcw.style.display = state.panels.guitarControls ? '' : 'none'
  const ac = $('analysis-controls'); if (ac) ac.style.display = state.panels.analysisControls ? '' : 'none'
  const cs = $('col-staff');    if (cs) cs.style.display = state.panels.colStaff ? '' : 'none'
  const ca = $('col-analysis'); if (ca) ca.style.display = state.panels.colAnalysis ? '' : 'none'
  const ccof = $('col-cof');    if (ccof) ccof.style.display = state.panels.colCoF ? '' : 'none'
  const cg = $('col-guitar');   if (cg) cg.style.display = state.panels.colGuitar ? '' : 'none'
  document.querySelectorAll<HTMLButtonElement>('.col-vis-btn').forEach(btn => {
    const col = btn.dataset.col as keyof typeof state.panels
    if (col) btn.classList.toggle('active', !!state.panels[col])
  })
  ;(['notation', 'instruments', 'history', 'song', 'cofControls', 'guitarControls', 'analysisControls'] as const).forEach(key => {
    const btn = document.querySelector<HTMLButtonElement>(`.toggle-btn[data-panel="${key}"]`)
    if (btn) btn.textContent = state.panels[key] ? '▲' : '▼'
  })
}

// ─── Detector ─────────────────────────────────────────────────────────────────
// Every source (MIDI, history, song, CoF) goes through showDetection. The analysis
// panel and the diagrams are always derived from state.detection, the analysis key
// and the chord the cadence is measured against — never patched per handler.

let autoKey: string | null = null       // Krumhansl-Schmuckler on history; recomputed when history changes
let cadencePrev: string | null = null   // chord the cadence field compares against, chosen by the source
let lastChordNotes: string[] = []       // last known chord shown — what Space plays after the keys are released

function analysisKey(): string | null {
  return state.activeKey ?? autoKey
}

function selectedSymbol(): string | null {
  const d = state.detection
  if (d?.kind !== 'chord') return null
  const sym = d.candidates[d.selectedIndex]
  return sym && sym !== '?' ? sym : null
}

function displayedNotes(): string[] {
  const d = state.detection
  if (!d) return []
  return d.kind === 'note' ? [d.noteName] : d.notes
}

function refreshAnalysis() {
  const sym = selectedSymbol()
  state.analysis = sym ? buildHarmonicAnalysis(sym, analysisKey(), cadencePrev) : null
}

function renderAnalysisPanel() {
  renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect)
}

function renderDiagrams() {
  renderZone1Diagrams(displayedNotes(), selectedSymbol())
}

function renderDetector() {
  renderAnalysisPanel()
  renderDiagrams()
}

function showDetection(detection: DetectionResult, prev: string | null) {
  state.detection = detection
  cadencePrev = prev
  if (selectedSymbol()) lastChordNotes = displayedNotes()
  refreshAnalysis()
  renderDetector()
}

/** Shows a chord picked from history, song or CoF. Without a stored voicing, UMT's spelling is shown and played. */
function showChord(symbol: string, notes: string[] | undefined, prev: string | null) {
  showDetection({
    kind: 'chord',
    notes: notes?.length ? notes : chordNoteNames(symbol),
    candidates: [symbol],
    selectedIndex: 0,
  }, prev)
}

function onAltSelect(idx: number) {
  if (state.detection?.kind !== 'chord') return
  state.detection.selectedIndex = idx
  refreshAnalysis()
  renderDetector()
}

function setActiveKey(key: string | null) {
  state.activeKey = key
  save('active-key', key ?? '')
  ;($('key-select') as HTMLSelectElement).value = key ?? ''
  updateAutoKeyLabel()
  refreshAnalysis()
  renderDetector()
  renderZone2()
  renderZone3()
}

function playCurrent() {
  const notes = selectedSymbol() ? displayedNotes() : lastChordNotes
  if (notes.length) playNoteNames(notes)
}

// Cadence references: live play compares with the last different chord logged;
// a history chip with the chip logged before it; a song chord with the one before it.
function previousHistorySymbol(symbol: string): string | null {
  return state.history.find(e => e.symbol !== symbol)?.symbol ?? null
}

function previousSongSymbol(chordId: string): string | null {
  const chords = state.song.sections.flatMap(s => s.measures.flatMap(m => m.chords)).filter(c => c.symbol)
  const i = chords.findIndex(c => c.id === chordId)
  return i > 0 ? chords[i - 1].symbol : null
}

// ─── MIDI callbacks ───────────────────────────────────────────────────────────

// MIDI capture-to-fill: notes of a chord arrive one by one, so the slot is filled only
// once the chord has been stable for CAPTURE_SETTLE_MS (otherwise a 4-note chord is
// captured as the triad formed by its first three notes).
const CAPTURE_SETTLE_MS = 250
let captureTimer: ReturnType<typeof setTimeout> | null = null

function scheduleCapture(symbol: string, notes: string[]) {
  if (captureTimer) clearTimeout(captureTimer)
  captureTimer = setTimeout(() => {
    captureTimer = null
    const targetId = state.captureTargetId
    if (!targetId) return
    state.song = updateChord(state.song, targetId, symbol, notes)
    saveSong(state.song)
    // Fill keeps going: the next slot (across measures and sections) waits for the next chord.
    const next = findChordAfter(state.song, targetId)?.id ?? null
    state.activeCursorId = next
    state.captureTargetId = next
    renderZone3()
  }, CAPTURE_SETTLE_MS)
}

function cancelCapture() {
  if (captureTimer) { clearTimeout(captureTimer); captureTimer = null }
}

function onNoteChange(notes: number[]) {
  const result = analyzeNotes(notes)
  const top = result?.kind === 'chord' ? result.candidates[0] : null
  const known = top && top !== '?' ? top : null

  if (state.captureTargetId) {
    if (known && result?.kind === 'chord') scheduleCapture(known, result.notes)
    else cancelCapture()
  }

  showDetection(result, known ? previousHistorySymbol(known) : null)
  if (known && result?.kind === 'chord') notifyChordDetected(known, result.notes)
}

function onHistoryChange(entries: HistoryEntry[]) {
  state.history = entries
  const nextAutoKey = getAutoKey(entries)
  const autoKeyChanged = nextAutoKey !== autoKey
  autoKey = nextAutoKey
  updateAutoKeyLabel()
  if (autoKeyChanged && !state.activeKey) {
    refreshAnalysis()
    renderAnalysisPanel()
  }
  renderZone2()
}

function updateAutoKeyLabel() {
  $('auto-key-label').textContent = !state.activeKey && autoKey ? `auto: ${autoKey}` : ''
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderZone1Diagrams(noteNames: string[], chordSymbol: string | null) {
  renderStaff($('staff-container'), noteNames, staffWidth, state.activeKey)
  renderPiano($('piano-container'), noteNames, chordSymbol)
  renderNeck($('neck-container'), noteNames, !keyPrefersSharps(analysisKey()))
  renderGuitar($('guitar-container'), chordSymbol, noteNames)
  renderCircleOfFifths($('cof-container'), state.activeKey, chordSymbol, onCofClick, cofSize,
    { accidental: cofAccidental, showMinor: cofShowMinor, showDegrees: cofShowDegrees, show7ths: cofShow7ths })
}

function onCofClick(key: string | null, chord?: string) {
  if (key && key !== state.activeKey) setActiveKey(key)
  if (chord) showChord(chord, undefined, previousHistorySymbol(chord))
}

function renderZone2() {
  renderHistory(
    $('zone2-content'),
    state.activeKey,
    (entry) => {
      state.historyActiveCursorId = entry.id
      const i = state.history.findIndex(e => e.id === entry.id)
      showChord(entry.symbol, entry.notes, state.history[i + 1]?.symbol ?? null)
      markActiveHistoryEntry($('zone2-content'), entry.id)
    },
    state.historyActiveCursorId
  )
}

function renderZone3() {
  mountSong($('zone3-content'), state.song, makeSongHandlers())
}

function sendToSong(entry: HistoryEntry) {
  if (!state.song.sections.length) {
    state.song = addSection(state.song, 'Verse', 'verse')
  }

  if (state.activeCursorId) {
    // Insert after active song slot cursor
    state.song = insertChordAfter(state.song, state.activeCursorId, entry.symbol, entry.notes)
    const next = findChordAfter(state.song, state.activeCursorId)
    state.activeCursorId = next?.id ?? state.activeCursorId
  } else {
    // Append to end of last measure of last section
    const lastSection = state.song.sections[state.song.sections.length - 1]
    const lastMeasure = lastSection.measures[lastSection.measures.length - 1]
    state.song = songAddChord(state.song, lastSection.id, lastMeasure.id, entry.symbol, entry.notes)
  }

  saveSong(state.song)
  renderZone3()
}

/** All song chords in playing order, across measures and sections. */
function songChords(song: Song): SongChord[] {
  return song.sections.flatMap(s => s.measures.flatMap(m => m.chords))
}

function findChordAfter(song: Song, afterId: string): SongChord | null {
  const chords = songChords(song)
  const i = chords.findIndex(c => c.id === afterId)
  return i !== -1 ? chords[i + 1] ?? null : null
}

// ─── Device dropdown ─────────────────────────────────────────────────────────

let deviceListenersAttached = false

function refreshDeviceDropdown() {
  const sel = $('midi-device') as HTMLSelectElement
  const devices = getDevices()
  sel.innerHTML = devices.length
    ? devices.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('')
    : '<option>No MIDI devices</option>'
  sel.onchange = () => selectDevice(sel.value)
  // Keep the chosen device (restored from localStorage in initMidi) across hot-plug events;
  // re-select it so a reconnected port gets its message handler back.
  const current = getSelectedDeviceId()
  const target = devices.find(d => d.id === current)?.id ?? devices[0]?.id
  if (target) { selectDevice(target); sel.value = target }

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
    // Leave browser/OS shortcuts (Ctrl+C, Cmd+S…) and form controls alone.
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
    if (t instanceof HTMLElement && t.isContentEditable) return

    switch (e.key) {
      case 'h': case 'H':
        setModeBtn(getMode() === 'hold' ? 'normal' : 'hold'); break
      case 'a': case 'A':
        setModeBtn(getMode() === 'arpeggio' ? 'normal' : 'arpeggio'); break
      case ' ':
        e.preventDefault()
        playCurrent()
        break
      case 's': case 'S': {
        // Send active history chip (or most recent if none selected)
        const activeEntry = state.historyActiveCursorId
          ? state.history.find(e => e.id === state.historyActiveCursorId)
          : state.history[0]
        if (activeEntry) sendToSong(activeEntry)
        break
      }
      case 'p': case 'P':
        playCurrent(); break
      case 'c': case 'C':
        clearHistoryWithUndo(); break
      case '?':
        e.preventDefault()
        toggleHelp(); break
      case 'Escape':
        if (closeHelp()) break
        cancelCapture()
        state.activeCursorId = null
        state.captureTargetId = null
        renderZone3(); break
      default:
        if (e.key >= '1' && e.key <= '9') {
          const idx = parseInt(e.key) - 1
          if (state.detection?.kind === 'chord' && idx < state.detection.candidates.length) onAltSelect(idx)
        }
    }
  })
}

function setModeBtn(mode: MidiMode) {
  setMode(mode)
  document.querySelectorAll<HTMLElement>('.mode-btn').forEach(b => {
    b.classList.toggle('active-mode', b.dataset.mode === mode)
  })
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

init()
