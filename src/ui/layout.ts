// Static page structure: toolbar, notation and instrument panels, zone headers, and which
// panels and columns are shown. Behaviour is wired in app.ts.

import type { AppState } from '../types'
import { ALL_KEYS } from '../theory/keys'
import { GM_INSTRUMENT_GROUPS, getCurrentInstrument, getVolume } from '../audio/audio'
import { setGuitarControlsVisible } from '../diagrams/guitar'
import { ANALYSIS_FIELD_KEYS, ANALYSIS_FIELD_LABELS, ANALYSIS_FIELD_TOOLTIPS } from '../detector/analysis-panel'
import type { AnalysisFieldKey } from '../detector/analysis-panel'
import { loadBool, save } from './storage'
import { VIEW_NAMES, VIEW_BACKGROUNDS } from '../view/channel'

export type Panels = AppState['panels']

const VIEW_LABELS: Record<string, string> = { chord: 'Chord', staff: 'Staff', cof: 'Circle of Fifths', piano: 'Piano', guitar: 'Guitar' }

const $ = (id: string) => document.getElementById(id)!

/** Panel visibility as last left (Notation always opens). */
export function loadPanels(): Panels {
  return {
    notation: true,  // always open on load (not persisted)
    instruments:      loadBool('panel-instruments', true),
    colPiano:         loadBool('panel-colPiano', true),
    colNeck:          loadBool('panel-colNeck', true),
    colVelocity:      loadBool('panel-colVelocity', true),
    history:          loadBool('panel-history', true),
    song:             loadBool('panel-song', true),
    cofControls:      loadBool('panel-cofControls', true),
    guitarControls:   loadBool('panel-guitarControls', true),
    analysisControls: loadBool('panel-analysisControls', true),
    colStaff:         loadBool('panel-colStaff', true),
    colAnalysis:      loadBool('panel-colAnalysis', true),
    key:              loadBool('panel-key', true),
    colCoF:           loadBool('panel-colCoF', true),
    colGuitar:        loadBool('panel-colGuitar', true),
  }
}

export function renderLayout(panels: Panels, fieldsVisible: Record<AnalysisFieldKey, boolean>) {
  $('zone1').innerHTML =
    buildToolbar() +
    buildNotationPanel(panels, fieldsVisible) +
    buildKeyPanel() +
    buildInstrumentsPanel(panels) +
    '<div id="midi-banner"></div>'
  buildZoneHeaders()
}

/** Panel ▲▼ and column buttons flip their flag, persist it and re-apply visibility. */
export function wirePanelToggles(panels: Panels) {
  document.querySelectorAll<HTMLButtonElement>('.col-vis-btn, .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = (btn.dataset.col ?? btn.dataset.panel) as keyof Panels
      panels[panel] = !panels[panel]
      if (panel !== 'notation') save(`panel-${panel}`, panels[panel])
      applyPanelVisibility(panels)
    })
  })
}

function buildToolbar(): string {
  return `
    <div id="z1-toolbar" class="toolbar">
      <span id="midi-status" class="midi-status">MIDI: —</span>
      <select id="midi-device" class="ctrl-select"></select>
      <select id="midi-in-ch" class="ctrl-select" title="Input channel: only notes on this channel are read (a keyboard split, or one track of a DAW)">
        <option value="0">in: all ch</option>
        ${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">in: ch ${i + 1}</option>`).join('')}
      </select>
      <select id="midi-out" class="ctrl-select" title="MIDI out: what sounds goes to this port"><option value="">Out: off</option></select>
      <select id="midi-out-ch" class="ctrl-select" title="MIDI out channel">
        ${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">ch ${i + 1}</option>`).join('')}
      </select>
      <button id="btn-thru" class="mode-btn" title="Thru: also send the controller's notes (off: the DAW usually hears the controller itself)">Thru</button>
      <button id="btn-normal" class="mode-btn" data-mode="normal">Normal</button>
      <button id="btn-hold" class="mode-btn" data-mode="hold">Hold</button>
      <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio">Arpeggio</button>
      <button id="btn-keyboard" class="mode-btn" title="Play with the computer keyboard (M): A-Ñ white keys, W E T Y U O P black, Z/X octave, C/V velocity, Tab sustain">⌨</button>
      <span id="keyboard-status" class="auto-key-label"></span>
      <select id="key-select" class="ctrl-select">
        <option value="">Key: Auto</option>
        ${ALL_KEYS.map(k => `<option value="${k}">${k}</option>`).join('')}
      </select>
      <span id="auto-key-label" class="auto-key-label"></span>
      <input id="typed-chord" class="ctrl-select typed-chord" placeholder="Chord… (/)" title="Type a chord name and press Enter" autocomplete="off" spellcheck="false">
      <span class="toolbar-sep"></span>
      <div id="audio-progress" class="audio-progress" title="Soundfont status">
        <div id="audio-progress-fill" class="audio-progress-fill"></div>
        <span id="audio-status" class="audio-status">♪ idle</span>
      </div>
      <button id="btn-play-chord" class="ctrl-btn" title="Play current chord (Space)">▶</button>
      <select id="audio-instrument" class="ctrl-select" title="Soundfont instrument">
        ${GM_INSTRUMENT_GROUPS.map(g =>
          `<optgroup label="${g.label}">${g.instruments.map(i =>
            `<option value="${i}"${i === getCurrentInstrument() ? ' selected' : ''}>${i.replace(/_/g,' ')}</option>`
          ).join('')}</optgroup>`
        ).join('')}
      </select>
      <input id="audio-volume" type="range" min="0" max="1" step="0.05" value="${getVolume()}" title="Volume" class="volume-slider">
      <div class="view-menu-wrap">
        <button id="btn-present" class="ctrl-btn" title="Presentation: large, no controls, full screen (P; Esc to leave)">⛶</button>
        <button id="btn-views" class="ctrl-btn" title="View windows for OBS, and diagram export (SVG, PNG)">⧉</button>
        <div id="view-menu" class="view-menu">
          <div class="view-menu-title">Open a view window</div>
          ${VIEW_NAMES.map(v => `<button class="ctrl-btn" data-view="${v}">${VIEW_LABELS[v]}</button>`).join('')}
          <label class="view-menu-bg">Background
            <select id="view-bg" class="ctrl-select">
              ${Object.keys(VIEW_BACKGROUNDS).map(b => `<option value="${b}">${b}</option>`).join('')}
            </select>
          </label>
          <div class="view-menu-hint">In OBS: Window Capture of "Modus view: …", then a Chroma Key filter. The window follows this one live.</div>
          <div class="view-menu-title">Save the diagram on screen (transparent)</div>
          ${(['staff', 'cof', 'guitar', 'piano'] as const).map(t => `
            <div class="view-menu-export"><span>${VIEW_LABELS[t]}</span>
              <button class="ctrl-btn" data-export="${t}" data-format="svg">SVG</button>
              <button class="ctrl-btn" data-export="${t}" data-format="png">PNG</button>
            </div>`).join('')}
        </div>
      </div>
      <button id="btn-help" class="help-btn" title="Keyboard shortcuts">?</button>
    </div>`
}

function buildNotationPanel(panels: Panels, fieldsVisible: Record<AnalysisFieldKey, boolean>): string {
  return `
    <div id="notation-panel" class="zone-panel">
      <div class="panel-header">
        <span>Notation</span>
        <div class="col-vis-row">
          <button class="col-vis-btn${panels.colStaff ? ' active' : ''}" data-col="colStaff" title="Staff">St</button>
          <button class="col-vis-btn${panels.colAnalysis ? ' active' : ''}" data-col="colAnalysis" title="Analysis">An</button>
          <button class="col-vis-btn${panels.colCoF ? ' active' : ''}" data-col="colCoF" title="Circle of Fifths">CoF</button>
          <button class="col-vis-btn${panels.colGuitar ? ' active' : ''}" data-col="colGuitar" title="Guitar">Git</button>
        </div>
        <button class="toggle-btn" data-panel="notation">▼</button>
      </div>
      <div id="notation-content">
        <div class="col-auto" id="col-staff">
          <div class="col-label">Staff</div>
          <div id="chord-summary"></div>
          <div id="staff-container"></div>
          <div class="ctrl-row" style="justify-content:center">
            <button id="btn-staff-clef" class="size-ctrl-btn" title="Staves: grand (treble and bass, split at middle C), treble only, bass only">Grand</button>
            <button id="btn-staff-minus" class="size-ctrl-btn" title="Smaller staff">−</button>
            <button id="btn-staff-plus"  class="size-ctrl-btn" title="Larger staff">+</button>
          </div>
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
            <div class="ctrl-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px">
              ${ANALYSIS_FIELD_KEYS.map(f =>
                `<button id="btn-field-${f}" class="size-ctrl-btn${fieldsVisible[f] ? ' active' : ''}"
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

function buildKeyPanel(): string {
  return `
    <div id="key-panel" class="zone-panel">
      <div class="panel-header">
        <span>Key</span>
        <div class="ctrl-row">
          <button id="btn-key-minus" class="size-ctrl-btn" title="Smaller">−</button>
          <button id="btn-key-plus"  class="size-ctrl-btn" title="Larger">+</button>
          <button id="btn-key-7"     class="size-ctrl-btn" title="Seventh chords instead of triads">7</button>
          <button id="btn-key-neg"   class="size-ctrl-btn" title="Show/hide negative harmony">Neg</button>
          <button id="btn-key-par"   class="size-ctrl-btn" title="Show/hide parallel modes">Par</button>
          <button id="btn-key-colt"  class="size-ctrl-btn" title="Show/hide Coltrane axis">Colt</button>
        </div>
        <button class="toggle-btn" data-panel="key">▼</button>
      </div>
      <div id="key-container"></div>
    </div>`
}

function buildInstrumentsPanel(panels: Panels): string {
  return `
    <div id="instruments-panel" class="zone-panel">
      <div class="panel-header">
        <span>Instruments</span>
        <div class="col-vis-row">
          <button class="col-vis-btn${panels.colPiano ? ' active' : ''}" data-col="colPiano" title="Piano">Pi</button>
          <button class="col-vis-btn${panels.colNeck  ? ' active' : ''}" data-col="colNeck"  title="Fretboard">Fr</button>
          <button class="col-vis-btn${panels.colVelocity ? ' active' : ''}" data-col="colVelocity" title="Velocity of each note">Ve</button>
        </div>
        <button class="toggle-btn" data-panel="instruments">▼</button>
      </div>
      <div id="instruments-content">
        <div id="col-piano"><div id="piano-container"></div></div>
        <div id="col-velocity"><div class="col-label">Velocity</div><div id="velocity-container"></div></div>
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

export function applyPanelVisibility(panels: Panels) {
  const nc = $('notation-content'); if (nc) nc.style.display = panels.notation ? 'flex' : 'none'
  const ic = $('instruments-content'); if (ic) ic.style.display = panels.instruments ? '' : 'none'
  const cp = $('col-piano'); if (cp) cp.style.display = panels.colPiano ? '' : 'none'
  const cn = $('col-neck');  if (cn) cn.style.display = panels.colNeck  ? '' : 'none'
  const cv = $('col-velocity'); if (cv) cv.style.display = panels.colVelocity ? '' : 'none'
  const z2 = $('zone2-content'); if (z2) z2.style.display = panels.history ? '' : 'none'
  const z3 = $('zone3-content'); if (z3) z3.style.display = panels.song ? '' : 'none'
  const cc = $('cof-controls'); if (cc) cc.style.display = panels.cofControls ? '' : 'none'
  setGuitarControlsVisible(panels.guitarControls)
  const gcw = document.getElementById('guitar-ctrl-wrap'); if (gcw) gcw.style.display = panels.guitarControls ? '' : 'none'
  const ac = $('analysis-controls'); if (ac) ac.style.display = panels.analysisControls ? '' : 'none'
  const kp = $('key-container'); if (kp) kp.style.display = panels.key ? '' : 'none'
  const cs = $('col-staff');    if (cs) cs.style.display = panels.colStaff ? '' : 'none'
  const ca = $('col-analysis'); if (ca) ca.style.display = panels.colAnalysis ? '' : 'none'
  const ccof = $('col-cof');    if (ccof) ccof.style.display = panels.colCoF ? '' : 'none'
  const cg = $('col-guitar');   if (cg) cg.style.display = panels.colGuitar ? '' : 'none'
  document.querySelectorAll<HTMLButtonElement>('.col-vis-btn').forEach(btn => {
    const col = btn.dataset.col as keyof Panels
    if (col) btn.classList.toggle('active', !!panels[col])
  })
  ;(['notation', 'instruments', 'history', 'song', 'cofControls', 'guitarControls', 'analysisControls', 'key'] as const).forEach(key => {
    const btn = document.querySelector<HTMLButtonElement>(`.toggle-btn[data-panel="${key}"]`)
    if (btn) btn.textContent = panels[key] ? '▲' : '▼'
  })
}
