import { initMidi, setNoteChangeCallback, setSoundCallbacks, setMode, getMode, getDevices, selectDevice, getSelectedDeviceId } from './midi'
import { analyzeNotes, buildHarmonicAnalysis, getAutoKey } from './analyzer'
import { initAudioOnGesture, preloadAudio, setInstrument, setVolume, liveNoteOn, liveNoteOff, setSustain, playNoteNames, playChord, setAudioStatusCallback, setAudioMissedCallback } from './audio'
import { renderStaff, renderPiano, renderGuitar, renderNeck, renderCircleOfFifths, adjustNeckSpacing } from './diagrams'
import { setHistoryChangeCallback, clearHistoryWithUndo, notifyChordDetected, renderHistory, markActiveHistoryEntry } from './history'
import { loadSong, saveSong, addChord as songAddChord, addSection, insertChordAfter, updateChord } from './song-model'
import { mountSong, markActiveChord, removeChordWithUndo } from './song-view'
import type { AppState, DetectionResult, HistoryEntry, MidiMode, Song, SongChord } from './types'
import { toggleHelp, wireKeyboard } from './shortcuts'
import { ANALYSIS_FIELD_KEYS, renderZone1Analysis } from './analysis-panel'
import type { AnalysisFieldKey } from './analysis-panel'
import { chordNoteNames } from './chord'
import { loadBool, loadChoice, loadNumber, loadString, save } from './storage'
import { escapeHtml } from './html'
import { normalizeKey, keyPrefersSharps } from './keys'
import { loadPanels, renderLayout, applyPanelVisibility, wirePanelToggles } from './layout'

// ─── Size preferences ────────────────────────────────────────────────────────

const staffWidth = 380
let staffScale = loadNumber('staff-scale', 2, 1, 3)
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
  panels: loadPanels(),
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
  wireShortcuts()
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
  setSoundCallbacks({ noteOn: liveNoteOn, noteOff: liveNoteOff, sustain: setSustain })
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
    activeKey: analysisKey(),
    onSongChange: (song: Song) => {
      state.song = song
      saveSong(song)
      renderZone3()
    }
  }
}

// ─── Layout events ───────────────────────────────────────────────────────────

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

  const resizeStaff = (delta: number) => {
    staffScale = Math.min(3, Math.max(1, staffScale + delta))
    save('staff-scale', staffScale)
    renderStaff($('staff-container'), displayedNotes(), staffWidth, analysisKey(), staffScale)
  }
  $('btn-staff-minus').addEventListener('click', () => resizeStaff(-0.25))
  $('btn-staff-plus').addEventListener('click', () => resizeStaff(0.25))

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

  wirePanelToggles(state.panels)

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
  renderLayout(state.panels, analysisFieldsVisible)
  wireLayoutEvents()
  applyPanelVisibility(state.panels)
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

// The full analysis runs dozens of UMT calls; a MIDI note that keeps the same chord reuses it.
let lastAnalysisSig = ''

function refreshAnalysis() {
  const sym = selectedSymbol()
  const sig = `${sym}|${analysisKey()}|${cadencePrev}`
  if (sig === lastAnalysisSig) return
  lastAnalysisSig = sig
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
  const chords = songChords(state.song).filter(c => c.symbol)
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
  // On Auto, the detected key drives every view, not only the analysis panel.
  if (autoKeyChanged && !state.activeKey) {
    refreshAnalysis()
    renderDetector()
    renderZone3()
  }
  renderZone2()
}

function updateAutoKeyLabel() {
  $('auto-key-label').textContent = !state.activeKey && autoKey ? `auto: ${autoKey}` : ''
}

// ─── Rendering ────────────────────────────────────────────────────────────────

// Each diagram is rebuilt only when its own inputs change: a MIDI note that keeps the
// chord redraws staff, piano and neck, but not the circle or the guitar voicing.
const lastRenderSig: Record<string, string> = {}
function renderIfChanged(name: string, sig: string, render: () => void) {
  if (lastRenderSig[name] === sig) return
  lastRenderSig[name] = sig
  render()
}

function renderZone1Diagrams(noteNames: string[], chordSymbol: string | null) {
  const key = analysisKey()
  const notes = noteNames.join(' ')
  const cofOpts = { accidental: cofAccidental, showMinor: cofShowMinor, showDegrees: cofShowDegrees, show7ths: cofShow7ths }
  renderIfChanged('staff', `${notes}|${key}|${staffScale}`, () =>
    renderStaff($('staff-container'), noteNames, staffWidth, key, staffScale))
  renderIfChanged('piano', `${notes}|${chordSymbol}`, () =>
    renderPiano($('piano-container'), noteNames, chordSymbol))
  renderIfChanged('neck', `${notes}|${keyPrefersSharps(key)}`, () =>
    renderNeck($('neck-container'), noteNames, !keyPrefersSharps(key)))
  renderIfChanged('guitar', `${chordSymbol}`, () =>
    renderGuitar($('guitar-container'), chordSymbol, noteNames))
  renderIfChanged('cof', `${key}|${chordSymbol}|${cofSize}|${JSON.stringify(cofOpts)}`, () =>
    renderCircleOfFifths($('cof-container'), key, chordSymbol, onCofClick, cofSize, cofOpts))
}

// A click plays and shows the segment's chord; a second click on the same segment within
// COF_DOUBLE_MS sets its key. Detected by hand: every click re-renders the circle, and a
// rebuilt element never receives the browser's dblclick.
const COF_DOUBLE_MS = 400
let lastCofClick: { key: string | null; at: number } = { key: null, at: 0 }

function onCofClick(chord: string, key: string | null) {
  const now = performance.now()
  if (key && lastCofClick.key === key && now - lastCofClick.at < COF_DOUBLE_MS) {
    lastCofClick = { key: null, at: 0 }
    setActiveKey(normalizeKey(key))
    return
  }
  lastCofClick = { key, at: now }
  playChord(chord)
  showChord(chord, undefined, previousHistorySymbol(chord))
}

function renderZone2() {
  renderHistory(
    $('zone2-content'),
    analysisKey(),
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


// ─── Keyboard actions ─────────────────────────────────────────────────────────

function wireShortcuts() {
  wireKeyboard({
    toggleHold: () => setModeBtn(getMode() === 'hold' ? 'normal' : 'hold'),
    toggleArpeggio: () => setModeBtn(getMode() === 'arpeggio' ? 'normal' : 'arpeggio'),
    play: playCurrent,
    sendToSong: () => {
      // Active history chip, or the most recent one if none is selected
      const entry = state.historyActiveCursorId
        ? state.history.find(e => e.id === state.historyActiveCursorId)
        : state.history[0]
      if (entry) sendToSong(entry)
    },
    clearHistory: clearHistoryWithUndo,
    step: stepCursor,
    deleteAtCursor: () => {
      if (!state.activeCursorId) return false
      deleteChordAtCursor()
      return true
    },
    escape: () => {
      cancelCapture()
      state.activeCursorId = null
      state.captureTargetId = null
      state.historyActiveCursorId = null
      markActiveHistoryEntry($('zone2-content'), null)
      renderZone3()
    },
    selectCandidate: idx => {
      if (state.detection?.kind === 'chord' && idx < state.detection.candidates.length) onAltSelect(idx)
    },
  })
}

/** ← →: moves through the song when a song chord is selected, otherwise through history. */
function stepCursor(dir: 1 | -1) {
  if (state.activeCursorId) {
    const chords = songChords(state.song).filter(c => c.symbol)
    const i = chords.findIndex(c => c.id === state.activeCursorId)
    const next = chords[i + dir]
    if (!next) return
    state.activeCursorId = next.id
    markActiveChord(next.id)
    showChord(next.symbol, next.notes, previousSongSymbol(next.id))
    playChordOrNotes(next.symbol, next.notes)
    return
  }
  if (!state.history.length) return
  const i = state.history.findIndex(e => e.id === state.historyActiveCursorId)
  const entry = i === -1 ? state.history[0] : state.history[i + dir]
  if (!entry) return
  const at = state.history.indexOf(entry)
  state.historyActiveCursorId = entry.id
  markActiveHistoryEntry($('zone2-content'), entry.id)
  showChord(entry.symbol, entry.notes, state.history[at + 1]?.symbol ?? null)
  playChordOrNotes(entry.symbol, entry.notes)
}

function playChordOrNotes(symbol: string, notes?: string[]) {
  if (notes?.length) playNoteNames(notes)
  else playChord(symbol)
}

/** Del: removes the selected song chord (with Undo) and selects its neighbour. */
function deleteChordAtCursor() {
  const id = state.activeCursorId!
  const chords = songChords(state.song)
  const i = chords.findIndex(c => c.id === id)
  if (i === -1) return
  state.activeCursorId = (chords[i + 1] ?? chords[i - 1])?.id ?? null
  if (state.captureTargetId === id) state.captureTargetId = null
  removeChordWithUndo(id)
}

function setModeBtn(mode: MidiMode) {
  setMode(mode)
  document.querySelectorAll<HTMLElement>('.mode-btn').forEach(b => {
    b.classList.toggle('active-mode', b.dataset.mode === mode)
  })
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

init()
