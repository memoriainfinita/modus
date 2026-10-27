import './styles.css'
import { initMidi, setNoteChangeCallback, setSoundCallbacks, setMode, getMode, getDevices, chooseDevice, resolveDevice, pointerDown, pointerUp, releaseKeptNotes, getVelocity, getInputChannel, setInputChannel, setHeardNotes } from './input/midi'
import { wireComputerKeyboard, toggleComputerKeyboard, isComputerKeyboardOn, computerKeyboardStatus, setComputerKeyboardChange } from './input/computer-keyboard'
import { analyzeNotes, buildHarmonicAnalysis, analyzeNoteSet, getAutoKey, romanInKey, staffLabels } from './detector/analyzer'
import { initAudioOnGesture, GM_INSTRUMENT_GROUPS, unlockAudioOnAnyGesture, preloadAudio, setInstrument, setVolume, liveNoteOn, liveNoteOff, setSustain, playNoteNames, playChord, setAudioStatusCallback, setAudioMissedCallback, setPreviewListener } from './audio/audio'
import { outLiveOn, outLiveOff, outSustain, outPreview, getOutputs, getOutputSettings, chooseOutput, setOutputChannel, setThru, outputLoops } from './output/midi-out'
import { renderStaff, STAFF_CLEFS, STAFF_NAMES } from './diagrams/staff'
import { openPresentation, closePresentation, isPresenting } from './view/presentation'
import { renderPiano, containerOctaves } from './diagrams/piano'
import { renderIso, loadIsoOptions, wireIsoMenu } from './diagrams/iso'
import { renderVelocity } from './diagrams/velocity'
import type { NoteVelocity } from './diagrams/velocity'
import { noteNameToMidi } from './theory/notes'
import { renderGuitar, getStringsView, getGuitarVoicingIndex, setGuitarVoicingChange, setGuitarShowsName, setGuitarScaleContext } from './diagrams/guitar'
import { createViewPublisher, viewUrl, VIEW_WINDOW, VIEW_BACKGROUNDS, VIEW_NAMES } from './view/channel'
import type { ViewName, ViewBackground, ViewState } from './view/channel'
import { runViewerFromUrl } from './view/viewer'
import { createMirrorPublisher, subscribeMirror, layoutWindowParams, layoutWindowUrl, WINDOW_PANELS, type MirrorState, type WindowPanels } from './view/mirror'
import { exportDiagram } from './ui/export'
import type { ExportTarget } from './ui/export'
import { renderCircleOfFifths, cofAccidentalFor } from './diagrams/cof'
import { renderKeyExplorer } from './diagrams/key-explorer'
import { buildKeyMap } from './theory/key-map'
import { scaleInfo, scaleSymbol } from './theory/scales'
import { setHistoryChangeCallback, clearHistoryWithUndo, notifyChordDetected, notifyChordReleased, renderHistory, markActiveHistoryEntry, restoreCarriedHistory, restoreEntries, rhythmText } from './history/history'
import { addChord as songAddChord, addSection, insertChordAfter, updateChord } from './song/model'
import { loadActiveSong, saveSong, songTabs, openSong, newSong, deleteSong, restoreSong } from './song/library'
import { showUndo, dismiss as dismissUndo } from './ui/undo'
import { mountSong, markActiveChord, removeChordWithUndo, onPlayingChange, showPlaying } from './song/view'
import { isSongPlaying, stopSong, type SongStep } from './song/playback'
import type { AppState, DetectionResult, HistoryEntry, MidiMode, NoteSetAnalysis, Song, SongChord } from './types'
import { toggleHelp, wireKeyboard } from './input/shortcuts'
import { ANALYSIS_FIELD_KEYS, renderZone1Analysis, fitChordName } from './detector/analysis-panel'
import { explainDetection, renderExplanation } from './detector/explain'
import { suggestNext, renderNext, substitutesFor } from './detector/next'
import { renderProgressions } from './ui/progressions'
import { renderEar, resetEarScore, type EarQuestion } from './ui/ear'
import { wireSettings, openSettings, closeSettings, offerSettingsUndo, settingsCommands } from './ui/settings'
import { renderPlayer, setPlayerNotesCallback } from './ui/player'
import { renderMetronome } from './metronome/panel'
import { getPref, onPrefChange, type PrefName } from './settings/prefs'
import { renderTuner, updateTuner } from './ui/tuner'
import { maybeStartTour, startTour } from './ui/tour'
import { wirePopover, closePopover } from './ui/popover'
import { wirePrefMenus } from './ui/pref-menu'
import { wireCommandSearch, type Command } from './ui/commands'
import { instrumentLabel } from './i18n/instruments'
import { startMic, stopMic, isMicOn } from './input/mic'
import type { AnalysisFieldKey } from './detector/analysis-panel'
import { chordNoteNames, isKnownChord, readTypedChord, tryParseChord, tryUMT } from './theory/chord'
import { spellDetection, spellVoicing } from './theory/spelling'
import { loadBool, loadChoice, loadNumber, save, setStorageReadOnly } from './ui/storage'
import { escapeHtml } from './ui/html'
import { normalizeKey, keyPrefersSharps, keyMode, keyOnParent, KEY_MODES, type KeyMode } from './theory/keys'
import { loadPanels, renderLayout, applyPanelVisibility, wirePanelToggles, onLayoutChange, currentGrid, layoutCommands, panelMenuCommands, isModuleShown, useLayout, layoutChoices } from './ui/layout'
import { applyTheme, onThemeChange, followSystemTheme, color } from './ui/theme'
import { t, chordLabel, noteLabel, keyLabel, applyDocumentLang, getLang } from './i18n/i18n'
import { announce, silence, watchIconButtons } from './ui/a11y'

// ─── Size preferences ────────────────────────────────────────────────────────

// Diagrams are drawn at one size and scaled to their panel (ui/layout.ts)
const STAFF_WIDTH = 380
const COF_SIZE = 300
let staffClef = loadChoice('staff-clef', STAFF_CLEFS, 'grand')
let staffNames = loadChoice('staff-names', STAFF_NAMES, 'off')
let cofAccidental = loadChoice('cof-accidental', ['flat', 'sharp'] as const, 'flat')
let cofShowMinor   = loadBool('cof-show-minor', true)
let cofShowDegrees = loadBool('cof-show-degrees', false)
let cofShow7ths    = loadBool('cof-show-7ths', false)
// Staff and piano also show the chord before, to see each voice move
let showPrevChord  = loadBool('show-prev-chord', false)
let showPianoScale = loadBool('piano-scale', false)
const isoOptions = loadIsoOptions()

const analysisFieldsVisible = Object.fromEntries(
  // Every field shown at first but Movable do, for who sings: from the panel's menu
  ANALYSIS_FIELD_KEYS.map(f => [f, loadBool(`analysis-field-${f}`, f !== 'movable')])
) as Record<AnalysisFieldKey, boolean>
let analysisScale = loadNumber('analysis-scale', 13, 10, 24)

let keyScale = loadNumber('key-scale', 12, 10, 24)
let keySevenths = loadBool('key-sevenths', false)
let keyShowNegative = loadBool('key-show-negative', true)
let keyShowParallel = loadBool('key-show-parallel', true)
let keyUsualOnly = loadBool('key-usual-borrowings', true)
let keyShowColtrane = loadBool('key-show-coltrane', true)

// ─── State ───────────────────────────────────────────────────────────────────

const initialSong = loadActiveSong()

const state: AppState = {
  activeKey: normalizeKey(initialSong.key),   // each song keeps the key it is analysed in
  detection: null,
  analysis: null,
  history: [],
  song: initialSong,
  activeCursorId: null,
  historyActiveCursorId: null,
  captureTargetId: null,
  panels: loadPanels(),
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id)!

/** The static page's own messages, written in the interface language. */
function translatePage() {
  applyDocumentLang()
  const warning = $('browser-warning')
  // Over plain http on the network the browser hides MIDI and the microphone: say that, not that it lacks them
  warning.firstChild!.textContent = t(window.isSecureContext ? 'page.noMidi' : 'page.insecure') + ' '
  $('cdn-error-banner').textContent = t('page.cdnError')
}

function init() {
  // Offline and installable (sw.js); service workers run over http(s), not from a file
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {})
  publishMirror = createMirrorPublisher(mirrorState)
  onPlayingChange(step => { songPlaying = step && { chordId: step.chordId, sectionId: step.sectionId }; publishMirror() })
  translatePage()
  applyTheme()
  followSystemTheme()
  // The SVG diagrams carry their colours: drawn again in the new theme; the rest follows the CSS
  onThemeChange(() => {
    for (const k of Object.keys(lastRenderSig)) delete lastRenderSig[k]
    renderDetector()
  })
  if (!navigator.requestMIDIAccess) {
    $('browser-warning').style.display = 'block'
  }

  unlockAudioOnAnyGesture()
  preloadAudio()

  buildLayout()
  watchIconButtons($('app'))
  wireShortcuts()
  wireComputerKeyboard()
  setComputerKeyboardChange(updateComputerKeyboardButton)
  document.querySelectorAll('[data-act="keyboard"]').forEach(b => b.addEventListener('click', () => { initAudioOnGesture(); toggleComputerKeyboard() }))
  document.querySelectorAll('[data-act="mic"]').forEach(b => b.addEventListener('click', toggleMic))
  window.addEventListener('pointerup', onPianoRelease)
  window.addEventListener('pointercancel', onPianoRelease)
  wireBar()
  setModeBtn(getMode())
  renderDetector()
  drawEar()
  wireSettings({ resetEarScore: () => { resetEarScore(); drawEar() } })
  wirePrefMenus()
  // The ear-training panel's menu resets its score as Settings does
  document.querySelector('#menu-ear [data-ear-reset]')?.addEventListener('click', () => { resetEarScore(); drawEar() })
  $('btn-settings').addEventListener('click', () => openSettings())
  applyZoom()
  onPrefChange(applyPref)
  offerSettingsUndo()
  const player = document.getElementById('player-container')
  if (player) renderPlayer(player)
  // The chord at the Player's playhead reaches the detector as heard notes, as the microphone's do
  setPlayerNotesCallback(midis => setHeardNotes(midis, 80, 'player'))
  const metronome = document.getElementById('metronome-container')
  if (metronome) renderMetronome(metronome)
  drawTuner()
  maybeStartTour()

  initMidi().then(result => {
    if (result.denied) {
      showMidiBanner(t('midi.denied'))
    }
    if (!result.unsupported) {
      refreshDeviceDropdown()
      refreshOutputDropdown()
      // Sync mode buttons with restored mode from localStorage
      setModeBtn(getMode())
    }
  })

  setNoteChangeCallback(onNoteChange)
  // Every input sounds inside and, as MIDI out allows, on the external port
  setSoundCallbacks({
    noteOn: (n, v, src) => { liveNoteOn(n, v); outLiveOn(n, v, src) },
    noteOff: (n, src) => { liveNoteOff(n); outLiveOff(n, src) },
    sustain: (down, src) => { setSustain(down); outSustain(down, src) },
  })
  setPreviewListener(outPreview)
  wireMidiOut()
  setHistoryChangeCallback(onHistoryChange)
  restoreCarriedHistory()

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

    const known = ['idle', 'loading', 'suspended', 'ready', 'error'] as const
    el.textContent = (known as readonly string[]).includes(status) ? t(`audio.${status as typeof known[number]}`) : status

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
      fill.style.background = 'var(--warn)'
      fill.style.transition = 'width 0.3s ease-out'
      fill.style.width = '100%'
    } else if (status === 'ready') {
      fill.style.background = 'var(--ok-strong)'
      fill.style.transition = 'width 0.2s ease-out'
      fill.style.width = '100%'
    } else if (status === 'error') {
      fill.style.background = 'var(--danger)'
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
      if (symbol) showChord(symbol, notes, previousSongChord(id))
    },
    // The song playing: each chord in the detector, read from the one before it
    onPlayStep: (step: SongStep, previous: SongStep | null) => {
      if (step.symbol) showChord(step.symbol, step.notes, previous?.symbol ? { symbol: previous.symbol, notes: previous.notes } : null)
    },
    onChordCapture: (id: string) => {
      state.captureTargetId = id
      state.activeCursorId = id
      renderZone3()
    },
    activeCursorId: state.activeCursorId,
    captureTargetId: state.captureTargetId,
    activeKey: songKey(),
    keyIsAuto: !state.activeKey,
    onSongChange: (song: Song) => {
      state.song = song
      saveSong(song)
      renderZone3()
    },
    songs: songTabs(),
    onOpenSong: (id: string) => {
      const song = openSong(id)
      if (song) showSong(song)
    },
    onNewSong: () => showSong(newSong()),
    onDeleteSong: () => {
      const { deleted, open } = deleteSong(state.song.id)
      showSong(open)
      if (deleted) showUndo(t('song.deleted', { title: deleted.title }), () => { restoreSong(deleted); showSong(deleted) })
    },
  }
}

/** Puts another song on screen with its own key; cursor, capture and pending Undo reset. */
function showSong(song: Song) {
  dismissUndo()
  cancelCapture()
  state.song = song
  state.activeCursorId = null
  state.captureTargetId = null
  applyKey(normalizeKey(song.key))
}

// ─── Layout events ───────────────────────────────────────────────────────────

/** b / # light the spelling the circle uses; with a key they are off, the key decides. */
function syncCofAccidentalButtons() {
  const key = analysisKey()
  const used = cofAccidentalFor(key, cofAccidental)
  for (const [id, acc] of [['btn-cof-flat', 'flat'], ['btn-cof-sharp', 'sharp']] as const) {
    const btn = $(id) as HTMLButtonElement
    btn.classList.toggle('active', used === acc)
    btn.setAttribute('aria-pressed', String(used === acc))
    btn.disabled = !!key
    btn.title = key ? t('cof.spelledInKey', { key: keyLabel(key) })
      : acc === 'flat' ? t('cof.flat.title') : t('cof.sharp.title')
  }
}


/** An on/off option of a panel's menu: ticked when on, and says so (the Settings dialog reads it too). */
function pressed(id: string, on: boolean) {
  $(id).setAttribute('aria-pressed', String(on))
}

function wireLayoutEvents() {
  const updateCofButtons = () => {
    syncCofAccidentalButtons()
    pressed('btn-cof-minor', cofShowMinor)
    pressed('btn-cof-deg', cofShowDegrees)
    pressed('btn-cof-7', cofShow7ths)
  }
  updateCofButtons()

  const onCofControl = (id: string, apply: () => void) => {
    $(id).addEventListener('click', () => { apply(); updateCofButtons(); renderDiagrams() })
  }
  onCofControl('btn-cof-flat',  () => { cofAccidental = 'flat';  save('cof-accidental', cofAccidental) })
  onCofControl('btn-cof-sharp', () => { cofAccidental = 'sharp'; save('cof-accidental', cofAccidental) })
  onCofControl('btn-cof-minor', () => { cofShowMinor = !cofShowMinor;     save('cof-show-minor', cofShowMinor) })
  onCofControl('btn-cof-deg',   () => { cofShowDegrees = !cofShowDegrees; save('cof-show-degrees', cofShowDegrees) })
  onCofControl('btn-cof-7',     () => { cofShow7ths = !cofShow7ths;       save('cof-show-7ths', cofShow7ths) })

  $('btn-analysis-minus').addEventListener('click', () => {
    analysisScale = Math.max(10, analysisScale - 1)
    save('analysis-scale', analysisScale)
    renderAnalysisPanel()
  })
  $('btn-analysis-plus').addEventListener('click', () => {
    analysisScale = Math.min(24, analysisScale + 1)
    save('analysis-scale', analysisScale)
    renderAnalysisPanel()
  })

  // The staves: the three in view, the one chosen marked
  const clefChips = [...document.querySelectorAll<HTMLElement>('#menu-staff [data-clef]')]
  const showClef = () => clefChips.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.clef === staffClef)))
  showClef()
  clefChips.forEach(b => b.addEventListener('click', () => {
    staffClef = b.dataset.clef as typeof staffClef
    save('staff-clef', staffClef)
    showClef()
    renderZone1Diagrams(displayedNotes(), selectedSymbol())
  }))

  // The column beside the staff: off, names or degrees
  const nameChips = [...document.querySelectorAll<HTMLElement>('#menu-staff [data-staff-names]')]
  const showNames = () => nameChips.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.staffNames === staffNames)))
  showNames()
  nameChips.forEach(b => b.addEventListener('click', () => {
    staffNames = b.dataset.staffNames as typeof staffNames
    save('staff-names', staffNames)
    showNames()
    renderZone1Diagrams(displayedNotes(), selectedSymbol())
  }))

  const prevButtons = [$('btn-staff-prev'), $('btn-piano-prev')]
  const showPrev = () => prevButtons.forEach(b => { b.classList.toggle('active', showPrevChord); b.setAttribute('aria-pressed', String(showPrevChord)) })
  showPrev()
  prevButtons.forEach(b => b.addEventListener('click', () => {
    showPrevChord = !showPrevChord
    save('show-prev-chord', showPrevChord)
    showPrev()
    renderZone1Diagrams(displayedNotes(), selectedSymbol())
  }))

  const scaleButton = $('btn-piano-scale')
  const showScale = () => { scaleButton.classList.toggle('active', showPianoScale); scaleButton.setAttribute('aria-pressed', String(showPianoScale)) }
  showScale()
  scaleButton.addEventListener('click', () => {
    showPianoScale = !showPianoScale
    save('piano-scale', showPianoScale)
    showScale()
    renderZone1Diagrams(displayedNotes(), selectedSymbol())
  })

  wireIsoMenu(isoOptions, () => renderZone1Diagrams(displayedNotes(), selectedSymbol()))

  ANALYSIS_FIELD_KEYS.forEach(f => {
    $(`btn-field-${f}`).addEventListener('click', () => {
      analysisFieldsVisible[f] = !analysisFieldsVisible[f]
      save(`analysis-field-${f}`, analysisFieldsVisible[f])
      $(`btn-field-${f}`).classList.toggle('active', analysisFieldsVisible[f])
      $(`btn-field-${f}`).setAttribute('aria-pressed', String(analysisFieldsVisible[f]))
      renderAnalysisPanel()
    })
  })

  const updateKeyButtons = () => {
    pressed('btn-key-7', keySevenths)
    pressed('btn-key-neg', keyShowNegative)
    pressed('btn-key-par', keyShowParallel)
    pressed('btn-key-usual', keyUsualOnly)
    pressed('btn-key-colt', keyShowColtrane)
  }
  updateKeyButtons()
  const onKeyControl = (id: string, apply: () => void) => {
    $(id).addEventListener('click', () => { apply(); updateKeyButtons(); renderDiagrams() })
  }
  onKeyControl('btn-key-minus', () => { keyScale = Math.max(10, keyScale - 1);  save('key-scale', keyScale) })
  onKeyControl('btn-key-plus',  () => { keyScale = Math.min(24, keyScale + 1); save('key-scale', keyScale) })
  onKeyControl('btn-key-7',     () => { keySevenths = !keySevenths;         save('key-sevenths', keySevenths) })
  onKeyControl('btn-key-neg',   () => { keyShowNegative = !keyShowNegative; save('key-show-negative', keyShowNegative) })
  onKeyControl('btn-key-par',   () => { keyShowParallel = !keyShowParallel; save('key-show-parallel', keyShowParallel) })
  onKeyControl('btn-key-usual', () => { keyUsualOnly = !keyUsualOnly; save('key-usual-borrowings', keyUsualOnly) })
  onKeyControl('btn-key-colt',  () => { keyShowColtrane = !keyShowColtrane; save('key-show-coltrane', keyShowColtrane) })

  wirePanelToggles(state.panels)
  wireViewMenu()

  if (state.activeKey) {
    ($('key-select') as HTMLSelectElement).value = state.activeKey
  }

  document.querySelectorAll<HTMLButtonElement>('.mode-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => setModeBtn(btn.dataset.mode as MidiMode))
  })

  $('key-select').addEventListener('change', (e) => {
    setActiveKey((e.target as HTMLSelectElement).value || null)
    closePopover()
  })

  $('btn-help').addEventListener('click', toggleHelp)
  $('btn-play-chord').addEventListener('click', playCurrent)

  $('audio-instrument').addEventListener('change', (e) => {
    setInstrument((e.target as HTMLSelectElement).value)
    updateSoundStatus()
  })

  $('audio-volume').addEventListener('input', (e) => {
    setVolume(parseFloat((e.target as HTMLInputElement).value))
    updateSoundStatus()
  })
}

function buildLayout() {
  renderLayout(state.panels, analysisFieldsVisible)
  wireLayoutEvents()
  applyPanelVisibility(state.panels)
  // A panel shown again is drawn again: a hidden one has nothing to measure its drawing by
  // The piano has as many octaves as its panel holds: drawn again when that number changes
  const pianoEl = $('piano-container')
  let octaves = containerOctaves(pianoEl)
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
    const now = containerOctaves(pianoEl)
    if (now !== octaves) { octaves = now; renderDetector() }
  }).observe(pianoEl)
  // The isomorphic grid is laid out for its panel's size: drawn again at each new size
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => renderZone1Diagrams(displayedNotes(), selectedSymbol())).observe($('iso-container'))
  // The chord's name fitted to its panel's width again when the panel changes size (full screen, a resize)
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => fitChordName()).observe($('chord-summary'))
  let shown = currentGrid().map(c => c.id).sort().join()
  onLayoutChange(() => {
    const now = currentGrid().map(c => c.id).sort().join()
    if (now === shown) return
    shown = now
    for (const k of Object.keys(lastRenderSig)) delete lastRenderSig[k]
    renderDetector()
    renderZone2()   // → Song shows with the Song panel
  })
}

// ─── Detector ─────────────────────────────────────────────────────────────────
// Every source (MIDI, history, song, CoF) goes through showDetection. The analysis
// panel and the diagrams are always derived from state.detection, the analysis key
// and the chord the cadence is measured against — never patched per handler.

let autoKey: string | null = null       // Krumhansl-Schmuckler on history; recomputed when history changes
let cadencePrev: string | null = null   // chord the cadence field compares against, chosen by the source
let prevVoicing: string[] | null = null // its notes, when known: voice leading is read from them
let lastChordNotes: string[] = []       // last known chord shown — what Space plays after the keys are released

function analysisKey(): string | null {
  return state.activeKey ?? autoKey
}

/**
 * The key the song is read in: the one chosen; on Auto, the one its own chords give (three or
 * more), so its numerals show with an empty history; else the one the history gives.
 */
function songKey(): string | null {
  if (state.activeKey) return state.activeKey
  const chords = state.song.sections.flatMap(s => s.measures.flatMap(m => m.chords)).filter(c => c.valid && c.symbol)
  if (chords.length < 3) return autoKey
  const entries = chords.map(c => ({ id: c.id, symbol: c.symbol, notes: c.notes?.length ? c.notes : chordNoteNames(c.symbol) }))
  return getAutoKey(entries) ?? autoKey
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
let noteSet: NoteSetAnalysis | null = null

// A melody played note by note: the pitch classes of single notes (and two-note overlaps,
// as legato playing gives), so Fits can name the scales it comes from. A chord, Esc, or a
// pause longer than MELODY_GAP_MS starts it again.
let melody: string[] = []
let melodyAt = 0

let melodyHeld = new Set<number>()

/** Only notes struck count: releasing a chord passes through two notes and one, which are no melody. */
function trackMelody(notes: number[], detection: DetectionResult) {
  const struck = notes.filter(n => !melodyHeld.has(n))
  melodyHeld = new Set(notes)
  if (!detection || !struck.length) return
  if (detection.kind === 'chord') { melody = []; return }
  const now = Date.now()
  if (now - melodyAt > getPref('melody-gap-s') * 1000) melody = []
  melodyAt = now
  const names = detection.kind === 'note' ? [detection.noteName] : detection.notes
  const midis = detection.kind === 'note' ? [detection.midiNumber] : notes
  names.forEach((name, i) => {
    const pc = name.replace(/-?\d+$/, '')
    if (struck.includes(midis[i]) && !melody.includes(pc)) melody.push(pc)
  })
}

function refreshAnalysis() {
  const sym = selectedSymbol()
  const notes = displayedNotes()
  const sig = `${sym}|${analysisKey()}|${cadencePrev}|${prevVoicing?.join(' ')}|${notes.join(' ')}|${melody.join(' ')}`
  if (sig === lastAnalysisSig) return
  lastAnalysisSig = sig
  state.analysis = sym ? buildHarmonicAnalysis(sym, analysisKey(), cadencePrev, notes, prevVoicing) : null
  // Single notes and intervals are read with the melody they belong to
  const kind = state.detection?.kind
  const useMelody = (kind === 'note' || kind === 'interval') && melody.length >= 2
  noteSet = useMelody ? analyzeNoteSet(melody, analysisKey(), true)
    : notes.length >= 2 ? analyzeNoteSet(notes, analysisKey()) : null
}

function renderAnalysisPanel() {
  const from = selectedSymbol() ? cadencePrev : null
  const info = from ? romanInKey(from, analysisKey()) : null
  renderZone1Analysis(state.detection, state.analysis, noteSet, analysisFieldsVisible, analysisScale, onAltSelect,
    { from, fromRoman: info?.roman ?? null, fromFunction: info?.function ?? null })
}

function renderDiagrams() {
  renderZone1Diagrams(displayedNotes(), selectedSymbol())
}

function renderExplain() {
  const el = document.getElementById('explain-container')
  if (!el) return
  const items = explainDetection(state.detection, state.analysis, analysisKey(), cadencePrev)
  // The history's harmonic rhythm, when it has one: a term of the progression, not of the chord
  const rhythm = state.detection ? rhythmText() : null
  if (rhythm) items.push({ term: t('ex.term.rhythm'), text: `${rhythm}. ${t('ex.rhythm')}` })
  renderExplanation(el, items)
}

// Next keeps the last chord shown after its keys are released, so a suggestion can still be picked
let nextFrom: { symbol: string; notes: string[]; prev: string | null } | null = null
let liftingNotes = false   // set while MIDI notes of a chord are being released
let releaseNoted = false   // the release of the chord held has been told to the history

function renderNextPanel() {
  const el = document.getElementById('next-container')
  if (!el) return
  const sym = selectedSymbol()
  // Kept until another chord is played: the notes left while a chord is released do not count
  // (a layout window takes the main window's)
  if (sym && !liftingNotes && !layoutWindow) nextFrom = { symbol: sym, notes: displayedNotes(), prev: cadencePrev }
  const key = analysisKey()
  renderNext(el, nextFrom?.symbol ?? null, key, nextFrom ? suggestNext(nextFrom.symbol, key, nextFrom.prev) : [], onNextPick,
    nextFrom ? substitutesFor(nextFrom.symbol, key) : [])
}

/**
 * A suggested chord: played and shown after the chord it follows, so its cadence reads from it.
 * A substitute is shown in place of that chord instead, after the chord before it.
 */
function onNextPick(chord: string, instead: boolean) {
  const from = nextFrom
  playChord(chord)
  const prev = instead ? (from?.prev ? { symbol: from.prev, notes: chordNoteNames(from.prev) } : null)
    : from ? { symbol: from.symbol, notes: from.notes } : null
  showChord(chord, undefined, prev)
}

/** What a screen reader hears when the detector changes: the chord with its degree and function, a note, an interval. */
function announceDetection() {
  if (layoutWindow) return   // the main window says it
  const d = state.detection
  // The notes left while a chord is lifted are not played: nothing of them is said
  if (!d || liftingNotes) { silence(); return }
  if (d.kind === 'note') { announce(t('a11y.note', { note: noteLabel(d.noteName) }), undefined, `note:${d.noteName}`); return }
  if (d.kind === 'interval') { announce(d.intervalName, undefined, `interval:${d.notes.join(' ')}`); return }
  const sym = selectedSymbol()
  if (!sym) return
  const chord = tryParseChord(sym)
  const name = chord ? tryUMT('chord names', () => UMT.chordLongName(chord, getLang()), chordLabel(sym)) : chordLabel(sym)
  const a = state.analysis
  // Said once while it sounds: a key found or changed meanwhile does not say it again
  announce(a && a.roman !== '?' ? t('a11y.chord', { chord: name, roman: a.roman, fn: t(`fn.${a.function}`) }) : name, undefined, `chord:${sym}`)
}

function renderDetector() {
  announceDetection()
  renderAnalysisPanel()
  renderExplain()
  renderNextPanel()
  renderProgressionPanel()
  renderDiagrams()
  publishView()
  publishMirror()
}

// ─── View windows (OBS) ──────────────────────────────────────────────────────

const sendView = createViewPublisher()

/** What the view windows show: the detector as it is now. */
function publishView() {
  const view = viewState()
  sendView(view)
}

// ─── Layout windows (OBS) ────────────────────────────────────────────────────

// Set in a layout window (?window=…), which draws the main window's state instead of reading input
const layoutWindow = layoutWindowParams()
// Main window: sends its state to the layout windows; nothing in a layout window
let publishMirror: () => void = () => {}
// The song's step sounding, for the windows to mark it
let songPlaying: MirrorState['playing'] = null
// A layout window: the velocities the main window read, which has the MIDI
let mirroredVelocities: NoteVelocity[] | null = null

function mirrorState(): MirrorState {
  return {
    detection: state.detection, fromMidi: detectionFromMidi, velocities: noteVelocities(displayedNotes()),
    cadencePrev, prevNotes: prevVoicing, activeKey: state.activeKey, melody, nextFrom,
    history: state.history, historyActiveCursorId: state.historyActiveCursorId,
    song: state.song, activeCursorId: state.activeCursorId, playing: songPlaying,
  }
}

/** A layout window draws what the main window sends, with the same code the main window draws with. */
function applyMirror(s: MirrorState) {
  const songChanged = JSON.stringify([s.song, s.activeCursorId]) !== JSON.stringify([state.song, state.activeCursorId])
  const keyChanged = s.activeKey !== state.activeKey
  state.detection = s.detection
  detectionFromMidi = s.fromMidi
  mirroredVelocities = s.velocities
  cadencePrev = s.cadencePrev
  prevVoicing = s.prevNotes
  melody = s.melody
  nextFrom = s.nextFrom
  state.activeKey = s.activeKey
  state.song = s.song
  state.activeCursorId = s.activeCursorId
  state.historyActiveCursorId = s.historyActiveCursorId
  if (selectedSymbol()) lastChordNotes = displayedNotes()
  // The history in: the key it gives on Auto, the strip and the explanation's rhythm follow
  if (JSON.stringify(s.history) !== JSON.stringify(state.history)) restoreEntries(s.history)
  if (keyChanged) { updateAutoKeyLabel(); renderZone2() }
  refreshAnalysis()
  renderDetector()
  if (songChanged || keyChanged) renderZone3()
  showPlaying(s.playing)
}

/** A layout window: the layout asked for, without controls, on its background, following the main window. */
function initLayoutWindow(w: { layout: string; background: string; panels: WindowPanels }) {
  setStorageReadOnly()
  if (!useLayout(w.layout)) useLayout('standard')
  // A stable title, in English whatever the language: OBS window capture finds the window by it
  const label = layoutChoices().find(c => c.id === w.layout)?.label ?? w.layout
  document.title = `Modus window: ${label.replace(/^saved:/, '')}`
  translatePage()
  applyTheme()
  followSystemTheme()
  onThemeChange(() => {
    for (const k of Object.keys(lastRenderSig)) delete lastRenderSig[k]
    renderDetector()
  })
  buildLayout()
  document.body.classList.add('layout-window')
  document.body.classList.toggle('panels-clear', w.panels === 'clear')
  document.documentElement.style.setProperty('--window-bg', w.background)
  openPresentation(() => {})
  drawEar()
  drawTuner()
  const metronome = document.getElementById('metronome-container')
  if (metronome) renderMetronome(metronome)
  setHistoryChangeCallback(onHistoryChange)
  renderZone3()
  subscribeMirror(applyMirror)
  // Preferences changed in the main window (language, theme, a panel's options): drawn again
  // with them. Its songs, history and own layout come over the channel, not from storage.
  window.addEventListener('storage', e => {
    if (e.key && !/^(modus-song|layout$|midi-|storage-persist)/.test(e.key)) location.reload()
  })
}

function viewState(): ViewState {
  const d = state.detection
  return {
    key: analysisKey(),
    kind: d?.kind ?? null,
    // Written as the page writes it: the views take no language of their own
    label: !d ? '' : d.kind === 'note' ? noteLabel(d.pitchClass) : d.kind === 'interval' ? d.intervalName : chordLabel(selectedSymbol() ?? ''),
    symbol: selectedSymbol(),
    notes: displayedNotes(),
    roman: state.analysis?.roman ?? null,
    function: state.analysis?.function ?? null,
    guitarVoicing: getGuitarVoicingIndex(),
  }
}

// ─── Presentation mode ───────────────────────────────────────────────────────

function togglePresentation() {
  if (isPresenting()) { closePresentation(); return }
  closePopover()
  openPresentation(() => $('btn-present').classList.remove('active-mode'))
  $('btn-present').classList.add('active-mode')
}

let viewBackground = loadChoice('view-bg', Object.keys(VIEW_BACKGROUNDS) as ViewBackground[], 'magenta')
let windowPanels = loadChoice('window-panels', WINDOW_PANELS, 'solid')

function wireViewMenu() {
  const menu = $('view-menu')
  wirePopover(menu, [$('btn-views')])
  // The background, one for every window
  const bgChips = [...menu.querySelectorAll<HTMLButtonElement>('[data-view-bg]')]
  const showBg = () => bgChips.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.viewBg === viewBackground)))
  showBg()
  bgChips.forEach(b => b.addEventListener('click', e => {
    e.stopPropagation()
    viewBackground = b.dataset.viewBg as ViewBackground
    save('view-bg', viewBackground)
    showBg()
  }))
  // The layout windows' panels: with their ground, or clear for the chroma key to take them out too
  const panelChips = [...menu.querySelectorAll<HTMLButtonElement>('[data-window-panels]')]
  const showPanels = () => panelChips.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.windowPanels === windowPanels)))
  showPanels()
  panelChips.forEach(b => b.addEventListener('click', e => {
    e.stopPropagation()
    windowPanels = b.dataset.windowPanels as WindowPanels
    save('window-panels', windowPanels)
    showPanels()
  }))
  // A window per layout, the saved ones as they are when the menu opens
  const list = $('window-list')
  const fillWindows = () => {
    list.innerHTML = layoutChoices().map(c =>
      `<button class="choice-row" data-window="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`).join('')
  }
  fillWindows()
  $('btn-views').addEventListener('click', fillWindows)
  list.addEventListener('click', e => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-window]')?.dataset.window
    if (!id) return
    // One window per layout: opening it again brings the same window back
    window.open(layoutWindowUrl(id, viewBackground, windowPanels), `modus-window-${id}`, 'popup,width=1280,height=720')?.focus()
    closePopover()
  })
  menu.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view as ViewName
      const [w, h] = VIEW_WINDOW[view]
      // One window per view: opening it again brings the same window back.
      window.open(viewUrl(view, viewBackground), `modus-view-${view}`, `popup,width=${w},height=${h}`)?.focus()
      closePopover()
    })
  })
  // On a phone, More: presentation and the diagrams to a file
  wirePopover($('more-menu'), [$('tab-more')])
  $('more-present').addEventListener('click', e => { e.stopPropagation(); togglePresentation() })
  document.querySelectorAll<HTMLButtonElement>('[data-export]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await exportDiagram(btn.dataset.export as ExportTarget, btn.dataset.format as 'svg' | 'png', selectedSymbol() ?? analysisKey())
      if (!ok) btn.classList.add('invalid')
      else closePopover()
    })
  })
  setGuitarVoicingChange(() => publishView())
  $('btn-present').addEventListener('click', e => { e.stopPropagation(); togglePresentation() })
}

// MIDI input has no spelling of its own: it is written in the key, and rewritten when the
// key changes. A chord picked from history, song or CoF keeps the spelling it was given.
let detectionFromMidi = false
// The notes sounding at the last change, to tell a release from a chord played
let heldNotes: number[] = []

/** Rewrites a MIDI detection in the current key (after a key change). */
function respellMidiDetection() {
  if (detectionFromMidi) state.detection = spellDetection(state.detection, analysisKey())
}

/** The chord a detection is compared with (cadence, P/L/R, voice leading), with its notes when they are known. */
type PrevChord = { symbol: string; notes?: string[] } | null

function showDetection(detection: DetectionResult, prev: PrevChord) {
  state.detection = detection
  cadencePrev = prev?.symbol ?? null
  prevVoicing = prev?.notes?.length ? spellVoicing(prev.notes, prev.symbol, analysisKey()) : null
  if (selectedSymbol()) lastChordNotes = displayedNotes()
  refreshAnalysis()
  renderDetector()
}

/** Shows a chord picked from history, song or CoF. Without a stored voicing, UMT's spelling is shown and played. */
function showChord(symbol: string, notes: string[] | undefined, prev: PrevChord) {
  detectionFromMidi = false
  showDetection({
    kind: 'chord',
    notes: notes?.length ? spellVoicing(notes, symbol, analysisKey()) : chordNoteNames(symbol),
    candidates: [symbol],
    selectedIndex: 0,
  }, prev)
}

function onAltSelect(idx: number) {
  if (state.detection?.kind !== 'chord') return
  const symbol = state.detection.candidates[idx]
  state.detection = { ...state.detection, selectedIndex: idx,
    notes: spellVoicing(state.detection.notes, symbol === '?' ? null : symbol, analysisKey()) }
  refreshAnalysis()
  renderDetector()
}

/** The user picks a key: it is stored with the open song. */
function setActiveKey(key: string | null) {
  state.song = { ...state.song, key }
  saveSong(state.song)
  applyKey(key)
}

function applyKey(key: string | null) {
  state.activeKey = key
  ;($('key-select') as HTMLSelectElement).value = key ?? ''
  updateAutoKeyLabel()
  respellMidiDetection()
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
function previousHistoryChord(symbol: string): HistoryEntry | null {
  return state.history.find(e => e.symbol !== symbol) ?? null
}

function previousSongChord(chordId: string): SongChord | null {
  const chords = songChords(state.song).filter(c => c.symbol)
  const i = chords.findIndex(c => c.id === chordId)
  return i > 0 ? chords[i - 1] : null
}

// ─── MIDI callbacks ───────────────────────────────────────────────────────────

// MIDI capture-to-fill: notes of a chord arrive one by one, so the slot is filled only
// once the chord has been stable for CAPTURE_SETTLE_MS (otherwise a 4-note chord is
// captured as the triad formed by its first three notes).
let captureTimer: ReturnType<typeof setTimeout> | null = null
// After a fill, the keys must drop below a chord before the next one counts: releasing
// a chord one key at a time passes through its subsets, which must not fill the next slot.
let captureArmed = true

// The chord waiting to fill, and since when it has held
let pendingCapture: { symbol: string; notes: string[]; since: number } | null = null

function scheduleCapture(symbol: string, notes: string[]) {
  if (captureTimer) clearTimeout(captureTimer)
  pendingCapture = { symbol, notes, since: performance.now() }
  captureTimer = setTimeout(commitCapture, getPref('capture-ms'))
}

function commitCapture() {
  if (captureTimer) clearTimeout(captureTimer)
  captureTimer = null
  const pending = pendingCapture
  pendingCapture = null
  const targetId = state.captureTargetId
  if (!pending || !targetId) return
  state.song = updateChord(state.song, targetId, pending.symbol, pending.notes)
  saveSong(state.song)
  captureArmed = false
  // Fill keeps going: the next slot (across measures and sections) waits for the next chord.
  const next = findChordAfter(state.song, targetId)?.id ?? null
  state.activeCursorId = next
  state.captureTargetId = next
  renderZone3()
}

/** No fill: the song or the capture changed (Esc, another song). */
function cancelCapture() {
  if (captureTimer) { clearTimeout(captureTimer); captureTimer = null }
  pendingCapture = null
}

/**
 * The chord changed before its fill: dropped, unless it already held long enough. A busy
 * page can run the timer late, after the release that follows; that chord still counts.
 */
function chordChangedBeforeFill() {
  if (pendingCapture && performance.now() - pendingCapture.since >= getPref('capture-ms')) commitCapture()
  else cancelCapture()
}

function onNoteChange(notes: number[]) {
  detectionFromMidi = true
  const result = spellDetection(analyzeNotes(notes), analysisKey())
  trackMelody(notes, result)
  const top = result?.kind === 'chord' ? result.candidates[0] : null
  const known = top && top !== '?' ? top : null

  if (state.captureTargetId) {
    if (notes.length < 3) captureArmed = true
    if (captureArmed && known && result?.kind === 'chord') {
      // A different chord: the one held before it may already count
      if (pendingCapture && pendingCapture.symbol !== known) chordChangedBeforeFill()
      if (state.captureTargetId && captureArmed) scheduleCapture(known, result.notes)
    } else chordChangedBeforeFill()
  }

  // Releasing a chord lifts its notes one by one: the three left for a moment (F A C of a
  // Dm7) are not a chord played, and the chord before them still goes to the history and Next
  const releasing = notes.length < heldNotes.length && notes.every(n => heldNotes.includes(n))
  liftingNotes = releasing
  showDetection(result, known ? previousHistoryChord(known) : null)
  liftingNotes = false
  // The first note lifted ends the chord's time in the history (harmonic rhythm)
  if (releasing && !releaseNoted) { releaseNoted = true; notifyChordReleased() }
  else if (!releasing) releaseNoted = false
  heldNotes = notes
  if (known && result?.kind === 'chord' && !releasing) notifyChordDetected(known, result.notes)
}

function onHistoryChange(entries: HistoryEntry[]) {
  state.history = entries
  const nextAutoKey = getAutoKey(entries)
  const autoKeyChanged = nextAutoKey !== autoKey
  autoKey = nextAutoKey
  updateAutoKeyLabel()
  // On Auto, the detected key drives every view, not only the analysis panel.
  if (autoKeyChanged && !state.activeKey) {
    respellMidiDetection()
    refreshAnalysis()
    renderDetector()
    renderZone3()
  }
  renderZone2()
  renderExplain()   // its harmonic rhythm follows the history
  publishMirror()
}

function updateAutoKeyLabel() {
  $('auto-key-label').textContent = !state.activeKey && autoKey ? t('key.autoDetected', { key: keyLabel(autoKey) }) : ''
  updateKeyButton()
}

// ─── Rendering ────────────────────────────────────────────────────────────────

// Each diagram is rebuilt only when its own inputs change: a MIDI note that keeps the
// chord redraws staff and piano, but not the circle or the guitar voicing.
const lastRenderSig: Record<string, string> = {}
function renderIfChanged(name: string, sig: string, render: () => void) {
  if (lastRenderSig[name] === sig) return
  lastRenderSig[name] = sig
  render()
}

// On-screen piano: a press goes through the input path like a controller key. The key
// that was pressed is rebuilt when the detector lights it, so the release is watched on
// the window. Each finger holds its own key, so a chord can be pressed on a touch screen.
const pianoNotes = new Map<number, number>()   // pointer id → MIDI note it holds

function onPianoPress(midi: number, pointerId: number) {
  const held = pianoNotes.get(pointerId)
  if (held !== undefined) pointerUp(held)
  pianoNotes.set(pointerId, midi)
  pointerDown(midi, getPref('piano-velocity'))
}

function onPianoRelease(e: PointerEvent) {
  const held = pianoNotes.get(e.pointerId)
  if (held === undefined) return
  pianoNotes.delete(e.pointerId)
  pointerUp(held)
}

/** A chord typed in the detector field: shown and played like one picked from history. */
function submitTypedChord(input: HTMLInputElement) {
  const symbol = readTypedChord(input.value)
  if (!symbol) return
  const valid = isKnownChord(symbol)
  input.classList.toggle('invalid', !valid)
  if (!valid) return
  showChord(symbol, undefined, null)
  playChord(symbol)
}

function updateComputerKeyboardButton() {
  const on = isComputerKeyboardOn()
  document.querySelectorAll('[data-act="keyboard"]').forEach(b => b.classList.toggle('active-mode', on))
  document.querySelectorAll<HTMLElement>('[data-on="keyboard"]').forEach(i => { i.hidden = !on })
  $('keyboard-status').textContent = on ? computerKeyboardStatus() : ''
}

/** Velocities of the notes on screen when they were played; none for a chord picked from history, song or circle. */
function noteVelocities(noteNames: string[]): NoteVelocity[] {
  if (!detectionFromMidi) return []
  if (mirroredVelocities) return mirroredVelocities
  return noteNames.flatMap(name => {
    const midi = noteNameToMidi(name)
    const velocity = midi === null ? null : getVelocity(midi)
    return midi === null || velocity === null ? [] : [{ name, midi, velocity }]
  })
}

function renderZone1Diagrams(noteNames: string[], chordSymbol: string | null) {
  const key = analysisKey()
  const notes = noteNames.join(' ')
  syncCofAccidentalButtons()
  const cofOpts = { accidental: cofAccidentalFor(key, cofAccidental), showMinor: cofShowMinor, showDegrees: cofShowDegrees, show7ths: cofShow7ths,
    // Clear panels in a layout window: the minor ring's see-through ground would be keyed out with the chroma
    backdrop: layoutWindow?.panels === 'clear' ? color('bg') : undefined }
  const prev = showPrevChord && chordSymbol ? prevVoicing : null
  const labels = staffLabels(staffNames, noteNames, chordSymbol)
  renderIfChanged('staff', `${notes}|${key}|${staffClef}|${prev?.join(' ')}|${labels?.join(' ')}`, () =>
    renderStaff($('staff-container'), noteNames, STAFF_WIDTH, key, 1, staffClef, prev, labels))
  const fn = chordSymbol ? state.analysis?.function ?? null : null
  const pianoScale = showPianoScale && key ? scaleInfo(scaleSymbol(key, 'key')) : null
  renderIfChanged('piano', `${notes}|${fn}|${prev?.join(' ')}|${containerOctaves($('piano-container'))}|${pianoScale?.names.join(' ')}`, () =>
    renderPiano($('piano-container'), noteNames, fn, onPianoPress, prev, pianoScale))
  const isoEl = $('iso-container')
  renderIfChanged('iso', `${notes}|${fn}|${key}|${JSON.stringify(isoOptions)}|${isoEl.clientWidth}x${isoEl.clientHeight}`, () =>
    renderIso(isoEl, noteNames, fn, key, isoOptions, onPianoPress))
  // The drawings by name, for a screen reader: the notes they show. Their SVG is hidden from it:
  // Firefox gives NVDA a role="img"'s text too, every cell's name before the label
  const spoken = noteNames.map(noteLabel).join(' ') || t('a11y.nothing')
  for (const [id, key] of [['staff-container', 'a11y.staff'], ['piano-container', 'a11y.piano'], ['iso-container', 'a11y.iso']] as const) {
    const el = $(id)
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', t(key, { notes: spoken }))
    el.querySelectorAll('svg').forEach(svg => svg.setAttribute('aria-hidden', 'true'))
  }
  const vel = noteVelocities(noteNames)
  renderIfChanged('velocity', JSON.stringify(vel), () => renderVelocity($('velocity-container'), vel))
  // The shapes follow the chord; the neck view, every note; the scale view, the key and the notes sounding in it
  const view = getStringsView()
  const neck = view === 'neck' ? `${notes}|${keyPrefersSharps(key)}` : view === 'scale' ? `${notes}|${key}|${fn}` : ''
  setGuitarScaleContext(key, fn)
  // The chord's name over the shape only where no Chord panel names it
  const named = !isModuleShown('chord')
  setGuitarShowsName(named)
  renderIfChanged('guitar', `${chordSymbol}|${view}|${neck}|${named}`, () =>
    renderGuitar($('guitar-container'), chordSymbol, noteNames, undefined, !keyPrefersSharps(key)))
  renderIfChanged('cof', `${key}|${chordSymbol}|${JSON.stringify(cofOpts)}`, () =>
    renderCircleOfFifths($('cof-container'), key, chordSymbol, onCofClick, COF_SIZE, cofOpts))
  const keyOpts = { sevenths: keySevenths, showNegative: keyShowNegative, showParallel: keyShowParallel, showColtrane: keyShowColtrane, usualOnly: keyUsualOnly, fontScale: keyScale }
  const keyTitle = key ? (state.activeKey ? keyLabel(key) : t('keyPanel.auto', { key: keyLabel(key) })) : ''
  renderIfChanged('key', `${keyTitle}|${chordSymbol}|${JSON.stringify(keyOpts)}`, () =>
    renderKeyExplorer($('key-container'), key ? buildKeyMap(key, keySevenths) : null, keyTitle, chordSymbol, onKeyChordClick, keyOpts))
}

/** A chord picked in the key explorer: played and shown like a CoF segment; the key stays. */
function onKeyChordClick(chord: string) {
  playChord(chord)
  showChord(chord, undefined, previousHistoryChord(chord))
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
  showChord(chord, undefined, previousHistoryChord(chord))
}

// ─── Microphone ──────────────────────────────────────────────────────────────

function drawTuner(error?: string) {
  document.querySelectorAll('[data-act="mic"]').forEach(b => b.classList.toggle('active-mode', isMicOn()))
  // An open microphone always shows, in the input's status in the bar
  document.querySelectorAll<HTMLElement>('[data-on="mic"]').forEach(i => { i.hidden = !isMicOn() })
  const el = document.getElementById('tuner-container')
  if (el) renderTuner(el, { toggle: toggleMic }, error)
}

function toggleMic() {
  if (isMicOn()) { stopMic(); return }
  startMic({
    notes: (midis, velocity) => setHeardNotes(midis, velocity),
    frame: heard => { const el = document.getElementById('tuner-container'); if (el) updateTuner(el, heard) },
    state: (_on, error) => drawTuner(error),
  })
}

function drawEar() {
  const ear = document.getElementById('ear-container')
  if (ear) renderEar(ear, { show: showEarAnswer })
}

/**
 * The interface scaled as chosen in Settings (100 % is the browser's own size). The CSS
 * reads --zoom where a size comes from the window (vh, vw), which zoom does not shrink:
 * the dialogs and presentation divide by it to stay inside the window.
 */
function applyZoom() {
  const z = getPref('ui-zoom')
  document.body.style.zoom = z === 100 ? '' : String(z / 100)
  document.documentElement.style.setProperty('--zoom', String(z / 100))
}

/** A preference changed in Settings: what it touches is read again and drawn again. */
function applyPref(name: PrefName) {
  if (name === 'ui-zoom') { applyZoom(); return }
  if (name.startsWith('ear-')) { drawEar(); return }
  if (name === 'key-profile' || name === 'auto-modes') { autoKey = undefined as unknown as string | null; onHistoryChange(state.history) }
  // Chord names, readings and explanations: everything drawn from the analysis
  lastAnalysisSig = ''
  for (const k of Object.keys(lastRenderSig)) delete lastRenderSig[k]
  progressionsKey = undefined
  refreshAnalysis()
  renderDetector()
  renderZone2()
  renderZone3()
}

/** An ear-training answer, once given, in the detector: the notes, or the chord (with the one before it for a cadence, in its key). */
function showEarAnswer(q: EarQuestion) {
  // A degree is shown in the key its cadence set, so the analysis reads it as one
  if (!q.symbol && q.key && analysisKey() !== q.key) { progressionsKey = q.key; applyKey(q.key) }
  if (!q.symbol) {
    detectionFromMidi = false
    const notes = q.steps[q.steps.length - 1]
    showDetection(spellDetection(analyzeNotes(notes.map(noteNameToMidi).filter((m): m is number => m !== null)), analysisKey()), null)
    return
  }
  if (q.key && analysisKey() !== q.key) { progressionsKey = q.key; applyKey(q.key) }
  const last = q.steps[q.steps.length - 1]
  const before = q.steps.length > 1 ? q.steps[q.steps.length - 2] : null
  showChord(q.symbol, last, q.prev && before ? { symbol: q.prev, notes: before } : null)
}

// A progression is written in the analysis key; drawn again when the key changes
let progressionsKey: string | null | undefined
function renderProgressionPanel() {
  const el = document.getElementById('progressions-container')
  if (!el || progressionsKey === analysisKey()) return
  progressionsKey = analysisKey()
  renderProgressions(el, analysisKey(), {
    play: (symbol, prev, key) => {
      // Its chords are read in the key it is written in
      if (analysisKey() !== key) { progressionsKey = key; applyKey(key) }
      playChord(symbol)
      showChord(symbol, undefined, prev ? { symbol: prev, notes: chordNoteNames(prev) } : null)
    },
  })
}

function renderZone2() {
  renderHistory(
    $('zone2-content'),
    analysisKey(),
    (entry) => {
      state.historyActiveCursorId = entry.id
      const i = state.history.findIndex(e => e.id === entry.id)
      showChord(entry.symbol, entry.notes, state.history[i + 1] ?? null)
      markActiveHistoryEntry($('zone2-content'), entry.id)
    },
    state.historyActiveCursorId,
    isModuleShown('song') ? sendActiveToSong : undefined,
  )
}

/** The history chip marked, or the newest, into the song at its cursor (S, → Song). */
function sendActiveToSong() {
  const entry = state.historyActiveCursorId
    ? state.history.find(e => e.id === state.historyActiveCursorId)
    : state.history[0]
  if (entry) sendToSong(entry)
}

/** Esc: leaves presentation; otherwise lets go of a held chord, stops MIDI fill, clears the cursors. */
function escapeAll() {
  if (isPresenting()) { closePresentation(); return }
  if (isSongPlaying()) { stopSong(); return }
  melody = []
  releaseKeptNotes()
  cancelCapture()
  state.activeCursorId = null
  state.captureTargetId = null
  state.historyActiveCursorId = null
  markActiveHistoryEntry($('zone2-content'), null)
  renderZone3()
}

function renderZone3() {
  mountSong($('zone3-content'), state.song, makeSongHandlers())
  publishMirror()
}

function sendToSong(entry: HistoryEntry) {
  if (!state.song.sections.length) {
    state.song = addSection(state.song, t('section.verse'), 'verse')
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
    : `<option>${escapeHtml(t('midi.noDeviceOption'))}</option>`
  sel.onchange = () => { chooseDevice(sel.value); refreshDeviceDropdown() }
  // Back to the device the user picked when it reappears; a reconnected port gets its
  // message handler back.
  const target = resolveDevice()
  if (target) sel.value = target
  // Settings › Input and output holds the same choice: its options and value follow the bar's
  const mirror = document.getElementById('set-midi-device') as HTMLSelectElement | null
  if (mirror) {
    mirror.innerHTML = sel.innerHTML
    mirror.value = sel.value
    mirror.onchange = () => { chooseDevice(mirror.value); refreshDeviceDropdown(); refreshOutputDropdown() }
  }

  // The bar names the device in use; its dot is green when one is connected
  const current = devices.find(d => d.id === sel.value)
  setMidiStatus(current ? current.name : t('midi.noDevices'), current ? 'var(--ok)' : 'var(--text-dim)', devices.length ? t('midi.connected') : t('midi.noDevices'))

  if (!deviceListenersAttached) {
    deviceListenersAttached = true
    window.addEventListener('midi-devices-changed', () => { refreshDeviceDropdown(); refreshOutputDropdown() })
    window.addEventListener('midi-device-disconnected', () => {
      setMidiStatus(t('midi.disconnected'), 'var(--danger-soft)', t('midi.disconnected'))
    })
  }
}

// ─── MIDI out ────────────────────────────────────────────────────────────────

function refreshOutputDropdown() {
  const sel = $('midi-out') as HTMLSelectElement
  const { port } = getOutputSettings()
  const outputs = getOutputs()
  const present = port && outputs.find(o => o.name === port.name)
  sel.innerHTML = `<option value="">${t('midi.out.off')}</option>` +
    outputs.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(t('midi.out.port', { name: o.name }))}</option>`).join('') +
    // A chosen port that is unplugged stays chosen and comes back when it reappears
    (port && !present ? `<option value="__missing" disabled>${escapeHtml(t('midi.out.absent', { name: port.name }))}</option>` : '')
  sel.value = present ? present.id : port ? '__missing' : ''
  const loops = outputLoops()
  sel.classList.toggle('invalid', loops)
  sel.title = loops ? t('midi.out.loops') : t('midi.out.title')
}

function wireMidiOut() {
  const inCh = $('midi-in-ch') as HTMLSelectElement
  inCh.value = String(getInputChannel())
  inCh.addEventListener('change', () => setInputChannel(parseInt(inCh.value)))
  const sel = $('midi-out') as HTMLSelectElement
  const ch = $('midi-out-ch') as HTMLSelectElement
  const thruBtn = $('btn-thru')
  const { channel, thru } = getOutputSettings()
  ch.value = String(channel)
  thruBtn.setAttribute('aria-checked', String(thru))
  sel.addEventListener('change', () => { chooseOutput(sel.value || null); refreshOutputDropdown() })
  ch.addEventListener('change', () => setOutputChannel(parseInt(ch.value)))
  thruBtn.addEventListener('click', () => {
    const on = !getOutputSettings().thru
    setThru(on)
    thruBtn.setAttribute('aria-checked', String(on))
  })
  // The input device decides whether the output loops back
  $('midi-device').addEventListener('change', () => setTimeout(refreshOutputDropdown))   // after the input switches
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
    sendToSong: sendActiveToSong,
    clearHistory: clearHistoryWithUndo,
    step: stepCursor,
    deleteAtCursor: () => {
      if (!state.activeCursorId) return false
      deleteChordAtCursor()
      return true
    },
    toggleComputerKeyboard: () => { initAudioOnGesture(); toggleComputerKeyboard(true) },
    focusChordInput: () => ($('typed-chord') as HTMLInputElement).focus(),
    togglePresentation,
    openSettings: () => openSettings(),
    closeSettings,
    escape: escapeAll,
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
    showChord(next.symbol, next.notes, previousSongChord(next.id))
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
  showChord(entry.symbol, entry.notes, state.history[at + 1] ?? null)
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
  document.querySelectorAll<HTMLElement>('.mode-btn[data-mode]').forEach(b => {
    b.classList.toggle('active-mode', b.dataset.mode === mode)
  })
  $('mode-status').textContent = t(`mode.${mode}`)
  $('mode-hint').textContent = t(`mode.${mode}.title`)
}

// ─── Bar ─────────────────────────────────────────────────────────────────────

// Keys in the order of the circle of fifths, by pitch class: Gb Db Ab … B, and their relative minors
const FIFTHS_MAJOR = [6, 1, 8, 3, 10, 5, 0, 7, 2, 9, 4, 11]
// The mode the key menu lists tonics for: the active key's, or major
let keyMenuMode: KeyMode = 'Major'

function wireBar() {
  wirePopover($('input-menu'), [$('btn-input-status'), $('tab-input')])
  wirePopover($('sound-menu'), [$('btn-sound-status'), $('tab-sound')], () => {
    const filter = $('instrument-filter') as HTMLInputElement
    filter.value = ''
    renderChoices($('audio-instrument') as HTMLSelectElement, $('instrument-list'), '')
    $('instrument-list').querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'center' })
  })
  wirePopover($('key-menu'), [$('btn-key')], () => { keyMenuMode = keyMode(state.activeKey) ?? 'Major'; renderKeyGrid() })

  // The selects hold the values; a list of buttons stands for each
  mirrorChoices($('midi-device') as HTMLSelectElement, $('midi-device-list'))
  mirrorChoices($('audio-instrument') as HTMLSelectElement, $('instrument-list'))
  const filter = $('instrument-filter') as HTMLInputElement
  filter.addEventListener('input', () => renderChoices($('audio-instrument') as HTMLSelectElement, $('instrument-list'), filter.value))

  $('key-auto').addEventListener('click', () => pickKey(''))
  document.querySelectorAll<HTMLElement>('[data-keymode]').forEach(b => b.addEventListener('click', () => {
    keyMenuMode = KEY_MODES.find(m => m.toLowerCase() === b.dataset.keymode) ?? 'Major'
    renderKeyGrid()
  }))

  const input = $('typed-chord') as HTMLInputElement
  wireCommandSearch({
    input,
    list: $('cmd-results'),
    chordOf: text => { const symbol = readTypedChord(text); return symbol && isKnownChord(symbol) ? chordLabel(symbol) : null },
    submitChord: () => submitTypedChord(input),
    commands: barCommands,
    playLabel: chord => t('cmd.play', { chord }),
    noneLabel: q => t('cmd.none', { q }),
  })
  updateKeyButton()
  updateSoundStatus()
  setAudioStatusDot()
}

function pickKey(key: string) {
  const sel = $('key-select') as HTMLSelectElement
  sel.value = key
  sel.dispatchEvent(new Event('change'))
}

function renderKeyGrid() {
  document.querySelectorAll<HTMLElement>('[data-keymode]').forEach(b => b.classList.toggle('active-mode', b.dataset.keymode === keyMenuMode.toLowerCase()))
  $('key-auto').classList.toggle('active-mode', !state.activeKey)
  // In the order of their signatures, flats to sharps: each tonic on the major that shares its signature
  const keys = FIFTHS_MAJOR.map(pc => keyOnParent(pc, keyMenuMode))
  $('key-grid').innerHTML = keys.map(k =>
    `<button class="choice-chip${k === state.activeKey ? ' active-mode' : ''}" data-key="${k}" title="${escapeHtml(keyLabel(k))}">${escapeHtml(noteLabel(k.split(' ')[0]))}</button>`).join('')
  $('key-grid').querySelectorAll<HTMLElement>('[data-key]').forEach(b => b.addEventListener('click', () => pickKey(b.dataset.key!)))
}

/** The bar's key: the one fixed, or the one read from what is played, marked auto. */
function updateKeyButton() {
  const shown = state.activeKey ?? autoKey
  $('key-btn-name').textContent = shown ? keyLabel(shown) : t('key.none')
  $('key-btn-auto').textContent = state.activeKey ? '' : t('key.autoShort').toLowerCase()
}

function setMidiStatus(text: string, color: string, title: string) {
  const el = $('midi-status')
  el.textContent = text
  el.title = title
  el.style.setProperty('--dot', color)
}

function updateSoundStatus() {
  const name = instrumentLabel(($('audio-instrument') as HTMLSelectElement).value)
  $('sound-status').textContent = name
  const v = Math.round(parseFloat(($('audio-volume') as HTMLInputElement).value) * 100)
  $('volume-value').textContent = `${v} %`
}

/** The sound's dot in the bar follows the soundfont: waiting, loading, ready or failed. */
function setAudioStatusDot() {
  const status = $('audio-status')
  const dot = () => {
    const fill = $('audio-progress-fill').style.background || 'var(--text-dim)'
    $('sound-status').style.setProperty('--dot', fill)
  }
  new MutationObserver(dot).observe(status, { childList: true, characterData: true, subtree: true })
  dot()
}

/** Buttons for the options of a select, kept in step with it; a press sets the select. */
function mirrorChoices(sel: HTMLSelectElement, list: HTMLElement) {
  const draw = () => renderChoices(sel, list, '')
  new MutationObserver(draw).observe(sel, { childList: true, subtree: true })
  sel.addEventListener('change', draw)
  list.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-value]')
    if (!b || b.hasAttribute('disabled')) return
    sel.value = b.dataset.value!
    sel.dispatchEvent(new Event('change'))
  })
  draw()
}

function renderChoices(sel: HTMLSelectElement, list: HTMLElement, filter: string) {
  const q = filter.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const match = (text: string) => !q || text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q)
  const option = (o: HTMLOptionElement) =>
    `<button class="choice-row" data-value="${escapeHtml(o.value)}" aria-pressed="${o.value === sel.value}"${o.disabled || !o.value && !sel.options.length ? ' disabled' : ''}>${escapeHtml(o.text)}</button>`
  list.innerHTML = [...sel.children].map(child => {
    if (child instanceof HTMLOptGroupElement) {
      const opts = [...child.children].filter((o): o is HTMLOptionElement => o instanceof HTMLOptionElement && match(o.text))
      return opts.length ? `<div class="choice-group">${escapeHtml(child.label)}</div>${opts.map(option).join('')}` : ''
    }
    return child instanceof HTMLOptionElement && match(child.text) ? option(child) : ''
  }).join('')
}

/** Everything the bar's field can do by name. */
function barCommands(): Command[] {
  const input = t('a11y.group.input')
  const keyboardOn = isComputerKeyboardOn()
  return [
    ...(['normal', 'hold', 'arpeggio'] as const).map(m => ({ label: t('cmd.mode', { mode: t(`mode.${m}`) }), hint: input, run: () => setModeBtn(m) })),
    { label: t('input.keyboard'), hint: keyboardOn ? t('cmd.on') : input, run: () => { initAudioOnGesture(); toggleComputerKeyboard() } },
    { label: t('input.mic'), hint: isMicOn() ? t('cmd.on') : input, run: toggleMic },
    { label: t('cmd.keyAuto'), hint: t('a11y.key'), run: () => pickKey('') },
    ...FIFTHS_MAJOR.flatMap(pc => KEY_MODES.map(m => keyOnParent(pc, m)))
      .map(k => ({ label: t('cmd.key', { key: keyLabel(k) }), run: () => pickKey(k) })),
    ...layoutCommands(),
    { label: t('cmd.playCurrent'), hint: t('kbd.space'), run: playCurrent },
    { label: t('cmd.send'), hint: 'S', run: sendActiveToSong },
    { label: t('cmd.clearHistory'), hint: 'C', run: clearHistoryWithUndo },
    { label: t('cmd.escape'), hint: 'Esc', run: escapeAll },
    ...panelMenuCommands(),
    { label: t('cmd.present'), hint: 'P', run: togglePresentation },
    ...VIEW_NAMES.map(v => ({ label: t('cmd.view', { name: t(`view.${v}`) }), hint: 'OBS', run: () => (document.querySelector<HTMLElement>(`#view-menu [data-view="${v}"]`))?.click() })),
    { label: t('cmd.settings'), run: () => openSettings() },
    { label: t('cmd.help'), hint: '?', run: toggleHelp },
    { label: t('cmd.tour'), run: startTour },
    ...[...document.querySelectorAll<HTMLElement>('.module-menu [data-export]')].map(b => ({
      label: t('cmd.export', { name: t(`view.${b.dataset.export as ViewName}`), format: b.dataset.format!.toUpperCase() }), hint: t('views.save'), run: () => b.click(),
    })),
    ...settingsCommands(),
    ...GM_INSTRUMENT_GROUPS.flatMap(g => g.instruments.map(i => ({
      label: t('cmd.instrument', { name: instrumentLabel(i) }), hint: t(g.label),
      run: () => { const sel = $('audio-instrument') as HTMLSelectElement; sel.value = i; sel.dispatchEvent(new Event('change')) },
    }))),
  ]
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

// A view window (?view=…) shows one element and nothing else: no MIDI, no audio. A layout
// window (?window=…) shows a whole layout, drawn from the main window's state.
if (!runViewerFromUrl()) {
  if (layoutWindow) initLayoutWindow(layoutWindow)
  else init()
}
