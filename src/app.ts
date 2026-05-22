import { initMidi, setNoteChangeCallback, setNoteOnCallback, setMode, getMode, getDevices, selectDevice } from './midi'
import { analyzeNotes, buildHarmonicAnalysis, getAutoKey } from './analyzer'
import { initAudioOnGesture, setInstrument, getCurrentInstrument, setVolume, getVolume, playNote, playMidiNotes, playChord as audioPlayChord, GM_INSTRUMENT_GROUPS, setAudioStatusCallback } from './audio'
import { loadGuitarDB, renderStaff, renderPiano, renderGuitar, renderNeck, renderCircleOfFifths, setGuitarControlsVisible, adjustNeckSpacing } from './diagrams'
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

const ANALYSIS_FIELD_KEYS = ['roman', 'function', 'figbass', 'diatonic', 'scales', 'cadence', 'secondary', 'coltrane', 'negharm', 'subs'] as const
type AnalysisFieldKey = (typeof ANALYSIS_FIELD_KEYS)[number]
const ANALYSIS_FIELD_LABELS: Record<AnalysisFieldKey, string> = {
  roman: 'Roman', function: 'Func', figbass: 'Fig', diatonic: 'Diat', scales: 'Scl', cadence: 'Cad',
  secondary: 'Sec', coltrane: 'Colt', negharm: 'Neg', subs: 'Subs'
}
const ANALYSIS_FIELD_TOOLTIPS: Record<AnalysisFieldKey, string> = {
  roman: 'Roman numeral', function: 'Harmonic function', figbass: 'Figured bass',
  diatonic: 'Diatonic / borrowed', scales: 'Suggested scales', cadence: 'Cadence',
  secondary: 'Secondary dominant', coltrane: 'Coltrane axis', negharm: 'Negative harmony', subs: 'Substitutions'
}
let analysisFieldsVisible: Record<AnalysisFieldKey, boolean> = {
  roman:     JSON.parse(localStorage.getItem('analysis-field-roman')     ?? 'true'),
  function:  JSON.parse(localStorage.getItem('analysis-field-function')  ?? 'true'),
  figbass:   JSON.parse(localStorage.getItem('analysis-field-figbass')   ?? 'true'),
  diatonic:  JSON.parse(localStorage.getItem('analysis-field-diatonic')  ?? 'true'),
  scales:    JSON.parse(localStorage.getItem('analysis-field-scales')    ?? 'true'),
  cadence:   JSON.parse(localStorage.getItem('analysis-field-cadence')   ?? 'true'),
  secondary: JSON.parse(localStorage.getItem('analysis-field-secondary') ?? 'true'),
  coltrane:  JSON.parse(localStorage.getItem('analysis-field-coltrane')  ?? 'true'),
  negharm:   JSON.parse(localStorage.getItem('analysis-field-negharm')   ?? 'true'),
  subs:      JSON.parse(localStorage.getItem('analysis-field-subs')      ?? 'true'),
}
let analysisScale = parseInt(localStorage.getItem('analysis-scale') ?? '11')

// ─── Keyboard shortcuts registry ─────────────────────────────────────────────

const SHORTCUTS: { key: string; action: string }[] = [
  { key: 'Space', action: 'Capture chord → History' },
  { key: 'H',     action: 'Toggle Hold mode' },
  { key: 'A',     action: 'Toggle Arpeggio mode' },
  { key: 'S',     action: 'Send history chip → Song' },
  { key: 'C',     action: 'Clear history' },
  { key: 'Esc',   action: 'Clear cursor / capture' },
  { key: '1–9',   action: 'Select chord candidate' },
  { key: 'P',     action: 'Play current chord' },
  { key: '?',     action: 'Show / hide this panel' },
]

// ─── State ───────────────────────────────────────────────────────────────────

let lastChordSymbol: string | null = null
let lastChordMidi: number[] = []

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
    instruments: JSON.parse(localStorage.getItem('panel-instruments') ?? 'true'),
    colPiano: JSON.parse(localStorage.getItem('panel-colPiano') ?? 'true'),
    colNeck:  JSON.parse(localStorage.getItem('panel-colNeck')  ?? 'true'),
    history: JSON.parse(localStorage.getItem('panel-history') ?? 'true'),
    song: JSON.parse(localStorage.getItem('panel-song') ?? 'true'),
    cofControls: JSON.parse(localStorage.getItem('panel-cofControls') ?? 'true'),
    guitarControls: JSON.parse(localStorage.getItem('panel-guitarControls') ?? 'true'),
    analysisControls: JSON.parse(localStorage.getItem('panel-analysisControls') ?? 'true'),
    colStaff:    JSON.parse(localStorage.getItem('panel-colStaff')    ?? 'true'),
    colAnalysis: JSON.parse(localStorage.getItem('panel-colAnalysis') ?? 'true'),
    colCoF:      JSON.parse(localStorage.getItem('panel-colCoF')      ?? 'true'),
    colGuitar:   JSON.parse(localStorage.getItem('panel-colGuitar')   ?? 'true'),
  }
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function showModal(title: string, message: string, onConfirm: () => void, onCancel?: () => void) {
  const backdrop = document.createElement('div')
  backdrop.className = 'modal-backdrop'
  backdrop.innerHTML = `
    <div class="modal-popup">
      <div class="modal-title">${title}</div>
      <div class="modal-message">${message}</div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel">Cancel</button>
        <button class="modal-btn modal-btn-confirm">Confirm</button>
      </div>
    </div>`
  document.body.appendChild(backdrop)
  const close = () => backdrop.remove()
  backdrop.querySelector('.modal-btn-cancel')!.addEventListener('click', () => { close(); onCancel?.() })
  backdrop.querySelector('.modal-btn-confirm')!.addEventListener('click', () => { close(); onConfirm() })
  backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) { close(); onCancel?.() } })
}

// ─── Help popup ──────────────────────────────────────────────────────────────

let helpVisible = false

function closeHelp() {
  helpVisible = false
  document.getElementById('shortcut-help')?.remove()
  document.removeEventListener('mousedown', closeHelpOnOutsideClick)
}

function toggleHelp() {
  if (helpVisible) { closeHelp(); return }
  helpVisible = true
  const popup = document.createElement('div')
  popup.id = 'shortcut-help'
  popup.className = 'shortcut-help-popup'
  popup.innerHTML = `
    <div class="shortcut-help-header">
      <span>Keyboard shortcuts</span>
      <button class="shortcut-help-close">×</button>
    </div>
    ${SHORTCUTS.map(s => `
      <div class="shortcut-row">
        <kbd class="shortcut-key">${s.key}</kbd>
        <span class="shortcut-action">${s.action}</span>
      </div>`).join('')}`
  document.body.appendChild(popup)
  popup.querySelector('.shortcut-help-close')!.addEventListener('click', closeHelp)
  document.addEventListener('mousedown', closeHelpOnOutsideClick)
}

function closeHelpOnOutsideClick(e: MouseEvent) {
  const popup = document.getElementById('shortcut-help')
  if (popup && !popup.contains(e.target as Node)) closeHelp()
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
  setNoteOnCallback(note => { initAudioOnGesture(); playNote(note, 1.5) })
  setHistoryChangeCallback(onHistoryChange)

  let progressTimer: ReturnType<typeof setInterval> | null = null
  let progressValue = 0

  setAudioStatusCallback(status => {
    const el = document.getElementById('audio-status')
    const fill = document.getElementById('audio-progress-fill')
    if (!el || !fill) return

    const labels: Record<string, string> = { idle: '♪ idle', loading: '♪ loading…', ready: '♪ ready', error: '♪ error' }
    el.textContent = labels[status] ?? status

    if (progressTimer) { clearInterval(progressTimer); progressTimer = null }

    if (status === 'loading') {
      progressValue = 0
      fill.style.transition = 'none'
      fill.style.width = '0%'
      progressTimer = setInterval(() => {
        progressValue += (90 - progressValue) * 0.06
        fill.style.transition = 'width 0.1s linear'
        fill.style.width = progressValue.toFixed(1) + '%'
      }, 100)
    } else if (status === 'ready') {
      fill.style.background = '#22c55e'
      fill.style.transition = 'width 0.2s ease-out'
      fill.style.width = '100%'
    } else if (status === 'error') {
      fill.style.background = '#ef4444'
      fill.style.transition = 'width 0.2s ease-out'
      fill.style.width = '100%'
    } else {
      fill.style.transition = 'none'
      fill.style.width = '0%'
    }
  })

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
    <div id="z1-toolbar" class="toolbar">
      <span id="midi-status" class="midi-status">MIDI: —</span>
      <select id="midi-device" class="ctrl-select"></select>
      <button id="btn-normal" class="mode-btn" data-mode="normal">Normal</button>
      <button id="btn-hold" class="mode-btn" data-mode="hold">Hold</button>
      <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio">Arpeggio</button>
      <select id="key-select" class="ctrl-select">
        <option value="">Key: Auto</option>
        ${['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'].flatMap(r =>
          [`<option value="${r} Major">${r} Major</option>`, `<option value="${r} Minor">${r} Minor</option>`]
        ).join('')}
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
    </div>
    <!-- Row 1: notation — staff + CoF side by side, guitar stacked below CoF -->
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
        <!-- Column 1: Staff -->
        <div class="col-auto" id="col-staff">
          <div class="col-label">Staff</div>
          <div id="chord-summary"></div>
          <div id="staff-container"></div>
        </div>
        <!-- Column 2: Analysis -->
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
        <!-- Column 3: CoF -->
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
        <!-- Column 4: Guitar -->
        <div class="col-auto" id="col-guitar">
          <div class="col-header">
            <div class="col-label">Guitar</div>
            <button class="toggle-btn small" data-panel="guitarControls">▼</button>
          </div>
          <div id="guitar-container"></div>
        </div>
      </div>
    </div>
    <!-- Row 3: instruments (piano + fretboard) -->
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
    </div>
    <div id="midi-banner"></div>
  `

  $('zone2').innerHTML = `
    <div class="zone-header">
      <span class="zone-title">History</span>
      <button class="toggle-btn" data-panel="history">▼</button>
    </div>
    <div id="zone2-content"></div>
  `

  $('zone3').innerHTML = `
    <div class="zone-header">
      <span class="zone-title">Song Structure</span>
      <button class="toggle-btn" data-panel="song">▼</button>
    </div>
    <div id="zone3-content"></div>
  `

  // CoF controls
  const updateCofButtons = () => {
    ;($('btn-cof-flat')  as HTMLButtonElement).classList.toggle('active', cofAccidental === 'flat')
    ;($('btn-cof-sharp') as HTMLButtonElement).classList.toggle('active', cofAccidental === 'sharp')
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
  // Analysis controls
  const updateAnalysisFieldButtons = () => {
    ANALYSIS_FIELD_KEYS.forEach(f => {
      const btn = document.getElementById(`btn-field-${f}`) as HTMLButtonElement | null
      if (btn) btn.classList.toggle('active', analysisFieldsVisible[f])
    })
  }
  $('btn-analysis-minus').addEventListener('click', () => {
    analysisScale = Math.max(8, analysisScale - 1)
    localStorage.setItem('analysis-scale', String(analysisScale))
    renderZone1Analysis()
  })
  $('btn-analysis-plus').addEventListener('click', () => {
    analysisScale = Math.min(20, analysisScale + 1)
    localStorage.setItem('analysis-scale', String(analysisScale))
    renderZone1Analysis()
  })

  const reRenderNeck = () => {
    const notes = state.detection?.kind !== 'note' && (state.detection as any)?.notes
      ? (state.detection as any).notes.map((n: number) => {
          const FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
          return FLAT[n % 12] + (Math.floor(n / 12) - 1)
        })
      : []
    const sym = state.detection?.kind === 'chord'
      ? state.detection.candidates[state.detection.selectedIndex]
      : null
    const chordRoot = sym ? (sym.match(/^([A-G][b#]?)/) ?? [,''])[1] || null : null
    renderNeck($('neck-container'), notes, chordRoot)
  }
  $('btn-neck-minus').addEventListener('click', () => { adjustNeckSpacing(-2); reRenderNeck() })
  $('btn-neck-plus').addEventListener('click',  () => { adjustNeckSpacing(2);  reRenderNeck() })

  ANALYSIS_FIELD_KEYS.forEach(f => {
    $(`btn-field-${f}`).addEventListener('click', () => {
      analysisFieldsVisible[f] = !analysisFieldsVisible[f]
      localStorage.setItem(`analysis-field-${f}`, String(analysisFieldsVisible[f]))
      updateAnalysisFieldButtons()
      renderZone1Analysis()
    })
  })

  // Column visibility toggles
  document.querySelectorAll<HTMLButtonElement>('.col-vis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const col = btn.dataset.col as keyof typeof state.panels
      state.panels[col] = !state.panels[col]
      localStorage.setItem(`panel-${col}`, JSON.stringify(state.panels[col]))
      applyPanelVisibility()
    })
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
      if (panel === 'history' || panel === 'song' || panel === 'instruments' || panel === 'cofControls' || panel === 'guitarControls' || panel === 'analysisControls') {
        localStorage.setItem(`panel-${panel}`, JSON.stringify(state.panels[panel]))
      }
      applyPanelVisibility()
    })
  })

  $('btn-help').addEventListener('click', toggleHelp)

  $('btn-play-chord').addEventListener('click', () => {
    initAudioOnGesture()
    if (lastChordMidi.length > 0) {
      playMidiNotes(lastChordMidi)
    } else if (lastChordSymbol) {
      audioPlayChord(lastChordSymbol)
    }
  })

  $('audio-instrument').addEventListener('change', (e) => {
    setInstrument((e.target as HTMLSelectElement).value)
  })

  $('audio-volume').addEventListener('input', (e) => {
    setVolume(parseFloat((e.target as HTMLInputElement).value))
  })

  // Apply saved panel visibility on load
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
    if (sym && sym !== '?') { lastChordSymbol = sym; lastChordMidi = [...notes] }
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
  renderCircleOfFifths($('cof-container'), state.activeKey, chordSymbol ?? null, (key) => {
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
    <div class="chord-summary-row">
      <span class="chord-name-badge" style="background:${color}22;border-left:3px solid ${color}">${chordName}</span>
      <span class="chord-notes">${notes}</span>
      ${alts.map((c, i) =>
        `<button class="alt-chord-btn alt-chord-sum" data-idx="${i + 1}">${c}</button>`
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

  el.style.fontSize = analysisScale + 'px'
  const visibleCount = ANALYSIS_FIELD_KEYS.filter(f => analysisFieldsVisible[f]).length
  el.style.height = Math.ceil((visibleCount * 1.6 - 0.4) * analysisScale) + 'px'
  const colEl = document.getElementById('col-analysis')
  if (colEl) { const w = Math.round(analysisScale * 19) + 'px'; colEl.style.width = w; colEl.style.flex = `0 0 ${w}` }

  const row = (label: string, val: string) =>
    `<div class="analysis-row">
      <span class="analysis-label">${label}</span>
      <span class="analysis-value">${val}</span>
    </div>`
  const maybeRow = (f: AnalysisFieldKey, label: string, val: string) =>
    analysisFieldsVisible[f] ? row(label, val) : ''
  const conditionalRow = (f: AnalysisFieldKey, label: string, val: string | null) =>
    analysisFieldsVisible[f] ? row(label, val ?? '—') : ''

  let roman = '—', func_ = '—', figuredBass = '—', diatonic = '—', scales = '—', cadence = '—'
  let secondary: string | null = null, coltrane: string | null = null
  let negharm: string | null = null, subs: string | null = null
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
    if (a.isSecondary) secondary = `→ ${a.secondaryTarget}`
    if (a.coltraneAxis) coltrane = a.coltraneAxis.join(' · ')
    if (a.negativeHarmony) negharm = a.negativeHarmony
    if (a.substitutions?.length) subs = a.substitutions.join(', ')
  }

  el.innerHTML =
    maybeRow('roman', 'Roman', roman) +
    maybeRow('function', 'Function', func_) +
    maybeRow('figbass', 'Fig. bass', figuredBass) +
    maybeRow('diatonic', 'Diatonic', diatonic) +
    maybeRow('scales', 'Scales', scales) +
    maybeRow('cadence', 'Cadence', cadence) +
    conditionalRow('secondary', 'Secondary', secondary) +
    conditionalRow('coltrane', 'Coltrane', coltrane) +
    conditionalRow('negharm', 'Neg. harm.', negharm) +
    conditionalRow('subs', 'Subs.', subs) +
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
      case 'p': case 'P':
        if (lastChordMidi.length > 0) {
          playMidiNotes(lastChordMidi)
        } else if (lastChordSymbol) {
          audioPlayChord(lastChordSymbol)
        }
        break
      case 'c': case 'C':
        showModal('Clear history', 'Remove all history entries?', clearHistory); break
      case '?':
        e.preventDefault()
        toggleHelp(); break
      case 'Escape':
        if (helpVisible) { closeHelp(); break }
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
