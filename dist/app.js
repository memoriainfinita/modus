"use strict";
(() => {
  // src/ui/storage.ts
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function loadBool(key, fallback) {
    const v = loadJSON(key, fallback);
    return typeof v === "boolean" ? v : fallback;
  }
  function loadNumber(key, fallback, min = -Infinity, max = Infinity) {
    const raw = loadString(key, "");
    const v = Number(raw);
    return raw !== "" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  }
  function loadString(key, fallback) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function loadChoice(key, choices, fallback) {
    const v = loadString(key, fallback);
    return choices.includes(v) ? v : fallback;
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    } catch {
    }
  }

  // src/input/midi.ts
  function isNoteOff(status2, velocity2) {
    return (status2 & 240) === 128 || (status2 & 240) === 144 && velocity2 === 0;
  }
  var midiAccess = null;
  var selectedDeviceId = null;
  var mode = "normal";
  var activeNotes = /* @__PURE__ */ new Set();
  var velocities = /* @__PURE__ */ new Map();
  var physicallyHeldNotes = /* @__PURE__ */ new Set();
  var arpeggioNotes = [];
  var arpeggioTimer = null;
  var onNoteChange = () => {
  };
  var sound = { noteOn: () => {
  }, noteOff: () => {
  }, sustain: () => {
  } };
  function setNoteChangeCallback(cb) {
    onNoteChange = cb;
  }
  function setSoundCallbacks(cb) {
    sound = cb;
  }
  var SUSTAIN_CC = 64;
  function isSustain(status2, controller) {
    return (status2 & 240) === 176 && controller === SUSTAIN_CC;
  }
  async function initMidi() {
    if (!navigator.requestMIDIAccess) {
      return { ok: false, denied: false, unsupported: true };
    }
    try {
      useAccess(await navigator.requestMIDIAccess());
      const savedMode = localStorage.getItem("midi-mode");
      if (savedMode && ["normal", "hold", "arpeggio"].includes(savedMode)) mode = savedMode;
      resolveDevice();
      startRescan();
      return { ok: true, denied: false, unsupported: false };
    } catch {
      return { ok: false, denied: true, unsupported: false };
    }
  }
  function useAccess(access) {
    if (midiAccess) {
      midiAccess.onstatechange = null;
      for (const input of midiAccess.inputs.values()) input.onmidimessage = null;
    }
    midiAccess = access;
    midiAccess.onstatechange = () => refreshDeviceList();
  }
  function devicesOf(access) {
    if (!access) return [];
    return Array.from(access.inputs.values()).filter((i) => i.state !== "disconnected").map((i) => ({ id: i.id, name: i.name ?? i.id }));
  }
  function getDevices() {
    return devicesOf(midiAccess);
  }
  function getMidiAccess() {
    return midiAccess;
  }
  function getSelectedInputName() {
    return getDevices().find((d) => d.id === selectedDeviceId)?.name ?? null;
  }
  var PREFERRED_KEY = "midi-device";
  function loadPreferred() {
    try {
      const raw = localStorage.getItem(PREFERRED_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function savePreferred(device) {
    try {
      localStorage.setItem(PREFERRED_KEY, JSON.stringify(device));
    } catch {
    }
  }
  function chooseDevice(id) {
    const device = getDevices().find((d) => d.id === id);
    if (!device) return;
    savePreferred(device);
    attachToDevice(id);
  }
  function resolveDevice() {
    const devices = getDevices();
    const preferred2 = loadPreferred();
    const sameName = devices.filter((d) => d.name === preferred2.name);
    const target = sameName.find((d) => d.id === preferred2.id) ?? sameName[0] ?? devices.find((d) => d.id === selectedDeviceId) ?? devices[0];
    if (!target) return null;
    if (!preferred2.id && !preferred2.name) savePreferred(target);
    attachToDevice(target.id);
    return target.id;
  }
  function attachToDevice(id) {
    selectedDeviceId = id;
    if (!midiAccess) return;
    for (const input of midiAccess.inputs.values()) {
      input.onmidimessage = input.id === id ? handleMidiMessage : null;
    }
  }
  var RESCAN_MS = 2e3;
  var rescanning = false;
  function startRescan() {
    setInterval(() => {
      if (document.visibilityState === "visible") void rescan();
    }, RESCAN_MS);
    window.addEventListener("focus", () => void rescan());
  }
  var signature = (access) => [
    ...devicesOf(access).map((d) => "in:" + d.name),
    ...Array.from(access?.outputs.values() ?? []).filter((o) => o.state !== "disconnected").map((o) => "out:" + (o.name ?? o.id))
  ].sort().join("\n");
  async function rescan() {
    if (rescanning || !midiAccess) return;
    rescanning = true;
    try {
      const fresh = await navigator.requestMIDIAccess();
      if (signature(fresh) === signature(midiAccess)) return;
      useAccess(fresh);
      refreshDeviceList();
    } catch {
    } finally {
      rescanning = false;
    }
  }
  function refreshDeviceList() {
    window.dispatchEvent(new CustomEvent("midi-devices-changed"));
    if (selectedDeviceId && !getDevices().find((d) => d.id === selectedDeviceId)) {
      window.dispatchEvent(new CustomEvent("midi-device-disconnected"));
    }
  }
  var inputChannel = loadNumber("midi-in-channel", 0, 0, 16);
  var controllerHeld = /* @__PURE__ */ new Map();
  var controllerPedal = false;
  function getInputChannel() {
    return inputChannel;
  }
  function setInputChannel(ch) {
    inputChannel = Math.min(16, Math.max(0, Math.round(ch)));
    save("midi-in-channel", inputChannel);
    if (controllerPedal) {
      controllerPedal = false;
      sound.sustain(false, "controller");
    }
  }
  function handleMidiMessage(e) {
    if (!e.data || e.data.length < 3) return;
    const [status2, note, velocity2] = e.data;
    const channel2 = (status2 & 15) + 1;
    const passes = inputChannel === 0 || channel2 === inputChannel;
    if (isNoteOff(status2, velocity2)) {
      if (!passes && controllerHeld.get(note) !== channel2) return;
      controllerHeld.delete(note);
      keyUp(note, "controller");
    } else if ((status2 & 240) === 144) {
      if (!passes) return;
      controllerHeld.set(note, channel2);
      keyDown(note, velocity2, "controller");
    } else if (isSustain(status2, note)) {
      if (!passes) return;
      controllerPedal = velocity2 >= 64;
      sound.sustain(controllerPedal, "controller");
    }
  }
  function keyDown(note, velocity2, source = "virtual") {
    velocities.set(note, velocity2);
    sound.noteOn(note, velocity2, source);
    handleNoteOn(note);
  }
  function getVelocity(note) {
    return velocities.get(note) ?? null;
  }
  function keyUp(note, source = "virtual") {
    sound.noteOff(note, source);
    handleNoteOff(note);
  }
  function setPedal(down) {
    sound.sustain(down, "virtual");
  }
  function pointerDown(note, velocity2) {
    if (mode !== "hold") {
      keyDown(note, velocity2);
      return;
    }
    if (activeNotes.delete(note)) {
      onNoteChange(sortedNotes(activeNotes));
      return;
    }
    velocities.set(note, velocity2);
    sound.noteOn(note, velocity2, "virtual");
    activeNotes.add(note);
    onNoteChange(sortedNotes(activeNotes));
  }
  function pointerUp(note) {
    if (mode !== "hold") {
      keyUp(note);
      return;
    }
    sound.noteOff(note, "virtual");
  }
  function releaseKeptNotes() {
    if (mode === "normal") return;
    const had = activeNotes.size > 0 || arpeggioNotes.length > 0;
    activeNotes.clear();
    physicallyHeldNotes.clear();
    arpeggioNotes = [];
    if (arpeggioTimer) {
      clearTimeout(arpeggioTimer);
      arpeggioTimer = null;
    }
    if (had) onNoteChange([]);
  }
  function sortedNotes(s) {
    return Array.from(s).sort((a, b) => a - b);
  }
  function handleNoteOn(note) {
    if (mode === "normal") {
      activeNotes.add(note);
      onNoteChange(sortedNotes(activeNotes));
    } else if (mode === "hold") {
      if (physicallyHeldNotes.size === 0) activeNotes.clear();
      physicallyHeldNotes.add(note);
      activeNotes.add(note);
      onNoteChange(sortedNotes(activeNotes));
    } else if (mode === "arpeggio") {
      if (arpeggioTimer) clearTimeout(arpeggioTimer);
      arpeggioNotes.push(note);
      onNoteChange([...new Set(arpeggioNotes)].sort((a, b) => a - b));
      arpeggioTimer = setTimeout(() => {
        arpeggioNotes = [];
        arpeggioTimer = null;
        onNoteChange([]);
      }, 1200);
    }
  }
  function handleNoteOff(note) {
    if (mode === "normal") {
      activeNotes.delete(note);
      onNoteChange(sortedNotes(activeNotes));
    } else if (mode === "hold") {
      physicallyHeldNotes.delete(note);
    }
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    const hadNotes = activeNotes.size > 0 || arpeggioNotes.length > 0;
    activeNotes.clear();
    physicallyHeldNotes.clear();
    arpeggioNotes = [];
    if (arpeggioTimer) {
      clearTimeout(arpeggioTimer);
      arpeggioTimer = null;
    }
    localStorage.setItem("midi-mode", m);
    if (hadNotes) onNoteChange([]);
  }
  function getMode() {
    return mode;
  }

  // src/input/computer-keyboard.ts
  var NOTE_OFFSET = {
    KeyA: 0,
    KeyW: 1,
    KeyS: 2,
    KeyE: 3,
    KeyD: 4,
    KeyF: 5,
    KeyT: 6,
    KeyG: 7,
    KeyY: 8,
    KeyH: 9,
    KeyU: 10,
    KeyJ: 11,
    KeyK: 12,
    KeyO: 13,
    KeyL: 14,
    KeyP: 15,
    Semicolon: 16,
    Quote: 17
  };
  var MIN_C = 24;
  var MAX_C = 96;
  var VELOCITY_STEP = 20;
  var enabled = false;
  var baseC = 60;
  var velocity = 100;
  var sounding = /* @__PURE__ */ new Map();
  var onChange = () => {
  };
  function isComputerKeyboardOn() {
    return enabled;
  }
  function computerKeyboardStatus() {
    return `C${baseC / 12 - 1} \xB7 v${velocity}`;
  }
  function setComputerKeyboardChange(cb) {
    onChange = cb;
  }
  function releaseAll() {
    for (const note of sounding.values()) keyUp(note);
    sounding.clear();
    setPedal(false);
  }
  function toggleComputerKeyboard(on = !enabled) {
    if (on === enabled) return;
    enabled = on;
    if (!on) releaseAll();
    onChange();
  }
  function isTyping(t2) {
    return t2 instanceof HTMLInputElement || t2 instanceof HTMLTextAreaElement || t2 instanceof HTMLSelectElement || t2 instanceof HTMLElement && t2.isContentEditable;
  }
  function wireComputerKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (!enabled || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const offset = NOTE_OFFSET[e.code];
      const consume = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (offset !== void 0) {
        consume();
        if (e.repeat || sounding.has(e.code)) return;
        const note = baseC + offset;
        sounding.set(e.code, note);
        keyDown(note, velocity);
        return;
      }
      switch (e.code) {
        case "KeyZ":
          consume();
          baseC = Math.max(MIN_C, baseC - 12);
          onChange();
          break;
        case "KeyX":
          consume();
          baseC = Math.min(MAX_C, baseC + 12);
          onChange();
          break;
        case "KeyC":
          consume();
          velocity = Math.max(1, velocity - VELOCITY_STEP);
          onChange();
          break;
        case "KeyV":
          consume();
          velocity = Math.min(127, velocity + VELOCITY_STEP);
          onChange();
          break;
        case "Tab":
          consume();
          if (!e.repeat) setPedal(true);
          break;
        case "KeyM":
        case "Escape":
          consume();
          toggleComputerKeyboard(false);
          break;
      }
    }, true);
    document.addEventListener("keyup", (e) => {
      if (!enabled) return;
      const note = sounding.get(e.code);
      if (note !== void 0) {
        sounding.delete(e.code);
        keyUp(note);
        e.stopImmediatePropagation();
        return;
      }
      if (e.code === "Tab") setPedal(false);
    }, true);
    window.addEventListener("blur", () => {
      if (enabled) releaseAll();
    });
  }

  // src/theory/notes.ts
  var PITCH_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  var LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function accidentalSemitones(acc) {
    let n = 0;
    for (const ch of acc) n += ch === "#" ? 1 : ch === "b" ? -1 : 0;
    return n;
  }
  function pitchClassOf(name) {
    const m = name.match(/^([A-G])([#b]*)$/);
    if (!m) return -1;
    return ((LETTER_SEMITONE[m[1]] + accidentalSemitones(m[2])) % 12 + 12) % 12;
  }
  function midiToNoteName(midiNote) {
    const pc = midiNote % 12;
    const octave = Math.floor(midiNote / 12) - 1;
    return PITCH_NAMES_FLAT[pc] + octave;
  }
  function noteNameToMidi(name) {
    const m = name.match(/^([A-G])([#b]*)(-?\d+)$/);
    if (!m) return null;
    return (parseInt(m[3]) + 1) * 12 + LETTER_SEMITONE[m[1]] + accidentalSemitones(m[2]);
  }
  function nameAtMidi(base, midi) {
    const m = base.match(/^([A-G])([#b]*)$/);
    if (!m) return null;
    const offset = midi - LETTER_SEMITONE[m[1]] - accidentalSemitones(m[2]);
    return offset % 12 === 0 ? `${base}${offset / 12 - 1}` : null;
  }

  // src/ui/theme.ts
  var THEME_CHOICES = ["system", "dark", "light", "contrast", "paper"];
  var KEY = "theme";
  function getThemeChoice() {
    return loadChoice(KEY, THEME_CHOICES, "system");
  }
  function systemPrefersLight() {
    try {
      return matchMedia("(prefers-color-scheme: light)").matches;
    } catch {
      return false;
    }
  }
  function resolveTheme(choice = getThemeChoice()) {
    return choice === "system" ? systemPrefersLight() ? "light" : "dark" : choice;
  }
  var cache = /* @__PURE__ */ new Map();
  function color(token) {
    let v = cache.get(token);
    if (v === void 0) {
      v = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
      cache.set(token, v);
    }
    return v;
  }
  function applyTheme(theme = resolveTheme()) {
    document.documentElement.dataset.theme = theme;
    cache.clear();
  }
  var listeners = [];
  function onThemeChange(onChange3) {
    listeners.push(onChange3);
  }
  function changed() {
    applyTheme();
    listeners.forEach((f) => f());
  }
  function saveThemeChoice(choice) {
    save(KEY, choice);
    changed();
  }
  function followSystemTheme() {
    try {
      matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
        if (getThemeChoice() === "system") changed();
      });
    } catch {
    }
  }

  // src/theory/chord.ts
  var CHORD_FAMILY_TOKENS = {
    major: "chord-major",
    minor: "chord-minor",
    dominant: "chord-dominant",
    diminished: "chord-diminished",
    "half-diminished": "chord-diminished",
    augmented: "chord-augmented",
    sus: "chord-other"
  };
  var neutralColor = () => color("chord-other");
  function tryUMT(what, fn, fallback) {
    try {
      return fn();
    } catch (err) {
      console.debug(`[umt] ${what} unavailable:`, err);
      return fallback;
    }
  }
  function tryParseChord(symbol) {
    if (!symbol) return null;
    try {
      return UMT.parseChordSymbol(symbol);
    } catch {
      return null;
    }
  }
  function isKnownChord(symbol) {
    return tryParseChord(symbol) !== null;
  }
  function normalizeChordName(name) {
    return name.replace(/^([A-G][b#]*)M(?=\/|$)/, "$1");
  }
  function chordFamily(symbol) {
    const chord = tryParseChord(symbol);
    if (!chord) return null;
    const pcs = new Set((chord.intervalsInSteps ?? []).map((s) => (s % 12 + 12) % 12));
    if (pcs.has(4)) {
      if (pcs.has(8) && !pcs.has(7)) return "augmented";
      return pcs.has(10) ? "dominant" : "major";
    }
    if (pcs.has(3)) {
      if (pcs.has(6) && !pcs.has(7)) return pcs.has(10) ? "half-diminished" : "diminished";
      return "minor";
    }
    if (pcs.has(5) || pcs.has(2)) return "sus";
    return null;
  }
  function chordColor(symbol) {
    const family = chordFamily(symbol);
    return family ? color(CHORD_FAMILY_TOKENS[family]) : neutralColor();
  }
  function chordNoteNames(symbol) {
    const chord = tryParseChord(symbol);
    if (!chord) return [];
    return tryUMT("chord tones", () => UMT.spellChord(chord), []).filter(Boolean);
  }
  var typedAliases = null;
  var SOLFEGE_START = /^(Do|Re|Mi|Fa|Sol|La|Si)/;
  function readTypedChord(text) {
    const s = normalizeChordName(text.trim());
    if (SOLFEGE_START.test(s)) {
      typedAliases ??= tryUMT("typed chords", () => ({ ...UMT.SOLFEGE_ROOTS, ...UMT.QUALITY_ALIASES_ES }), {});
      const translated = normalizeChordName(tryUMT("typed chords", () => UMT.translateSymbol(s, typedAliases), s));
      if (translated !== s && isKnownChord(translated)) return translated;
    }
    return s;
  }

  // src/theory/keys.ts
  var MAJOR_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  var MINOR_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
  var ALL_KEYS = MAJOR_ROOTS.flatMap((root, pc) => [`${root} Major`, `${MINOR_ROOTS[pc]} Minor`]);
  function parseKey(key) {
    const [root, mode2] = key.split(" ");
    const pc = pitchClassOf(root ?? "");
    if (pc === -1) return null;
    return { pc, minor: mode2?.toLowerCase() === "minor" };
  }
  function keyName(pc, minor) {
    const p = (pc % 12 + 12) % 12;
    return minor ? `${MINOR_ROOTS[p]} Minor` : `${MAJOR_ROOTS[p]} Major`;
  }
  function normalizeKey(key) {
    const k = key ? parseKey(key) : null;
    return k ? keyName(k.pc, k.minor) : null;
  }
  function transposeKey(key, semitones) {
    const k = parseKey(key);
    return k ? keyName(k.pc + semitones, k.minor) : key;
  }
  function keySignature(key) {
    const name = normalizeKey(key);
    let degrees = [];
    try {
      degrees = name ? UMT.parseScaleSymbol(name).getNotes().slice(0, 7).map((n) => n.name) : [];
    } catch {
    }
    if (!name || degrees.length !== 7) return { abcKey: "none", accidentals: {} };
    const accidentals = {};
    for (const n of degrees) {
      const m = n.match(/^([A-G])([#b])/);
      if (m) accidentals[m[1]] = m[2];
    }
    const [root, mode2] = name.split(" ");
    return { abcKey: root + (mode2 === "Minor" ? "m" : ""), accidentals };
  }
  function keyPrefersSharps(key) {
    return Object.values(keySignature(key ?? null).accidentals).includes("#");
  }

  // src/i18n/en.ts
  var en = {
    // Page
    "page.noMidi": "This browser has no Web MIDI, so a controller cannot connect (Chrome, Edge and Firefox have it). Everything else \u2014 song builder, circle of fifths, history \u2014 still works.",
    "page.cdnError": "Failed to load a required resource. Check your internet connection.",
    // Toolbar: MIDI
    "midi.connected": "MIDI: connected",
    "midi.noDevices": "MIDI: no devices",
    "midi.disconnected": "MIDI: disconnected",
    "midi.noDeviceOption": "No MIDI devices",
    "midi.denied": "MIDI access denied. Grant permission in browser settings to use a controller.",
    "midi.inChannel.title": "Input channel: only notes on this channel are read (a keyboard split, or one track of a DAW)",
    "midi.inChannel.all": "in: all ch",
    "midi.inChannel.one": "in: ch {n}",
    "midi.out.title": "MIDI out: what sounds goes to this port",
    "midi.out.loops": "Same port as the input: nothing is sent, it would come back as input",
    "midi.out.off": "Out: off",
    "midi.out.port": "Out: {name}",
    "midi.out.absent": "Out: {name} (absent)",
    "midi.outChannel.title": "MIDI out channel",
    "midi.outChannel.one": "ch {n}",
    "midi.thru": "Thru",
    "midi.thru.title": "Thru: also send the controller's notes (off: the DAW usually hears the controller itself)",
    // Toolbar: modes and input
    "mode.normal": "Normal",
    "mode.hold": "Hold",
    "mode.arpeggio": "Arpeggio",
    "mode.normal.title": "Normal: the detector shows the keys held down",
    "mode.hold.title": "Hold: the chord stays after the keys are released; the next note after a full release starts a new one (H)",
    "mode.arpeggio.title": "Arpeggio: notes add up to one chord until 1.2 s pass without a new one (A)",
    "keyboard.title": "Play with the computer keyboard (M): A-\xD1 white keys, W E T Y U O P black, Z/X octave, C/V velocity, Tab sustain",
    "key.auto": "Key: Auto",
    "key.autoDetected": "auto: {key}",
    "key.major": "Major",
    "key.minor": "Minor",
    "typed.placeholder": "Chord\u2026 (/)",
    "typed.title": "Type a chord name and press Enter (letters or Do Re Mi: Am7, Lam7)",
    // Toolbar: audio
    "audio.title": "Soundfont status",
    "audio.idle": "\u266A idle",
    "audio.loading": "\u266A loading\u2026",
    "audio.suspended": "\u266A click to activate",
    "audio.ready": "\u266A ready",
    "audio.error": "\u266A error",
    "audio.play.title": "Play current chord (Space)",
    "audio.instrument.title": "Soundfont instrument",
    "audio.volume.title": "Volume",
    "gm.piano": "Piano",
    "gm.chromatic": "Chromatic Perc",
    "gm.organ": "Organ",
    "gm.guitar": "Guitar",
    "gm.bass": "Bass",
    "gm.strings": "Strings",
    "gm.ensemble": "Ensemble",
    "gm.brass": "Brass",
    "gm.reed": "Reed",
    "gm.pipe": "Pipe",
    "gm.lead": "Synth Lead",
    "gm.pad": "Synth Pad",
    "gm.fx": "Synth FX",
    "gm.ethnic": "Ethnic",
    "gm.percussive": "Percussive",
    "gm.soundFx": "Sound FX",
    // Toolbar: views, presentation, help
    "present.title": "Presentation: large, no controls, full screen (P; Esc to leave)",
    "present.close": "Leave presentation (Esc)",
    "views.title": "View windows for OBS, and diagram export (SVG, PNG)",
    "views.open": "Open a view window",
    "views.background": "Background",
    "views.bg.green": "green",
    "views.bg.magenta": "magenta",
    "views.bg.black": "black",
    "views.bg.dark": "dark",
    "views.hint": 'In OBS: Window Capture of "Modus view: \u2026", then a Chroma Key filter. The window follows this one live.',
    "views.save": "Save the diagram on screen (transparent)",
    "view.chord": "Chord",
    "view.staff": "Staff",
    "view.cof": "Circle of Fifths",
    "view.piano": "Piano",
    "view.guitar": "Guitar",
    "help.title": "Shortcuts, gestures and language (?)",
    // Shared controls
    "ctrl.smaller": "Smaller",
    "ctrl.larger": "Larger",
    // Notation panel
    "notation.title": "Notation",
    "col.staff": "St",
    "col.analysis": "An",
    "col.cof": "CoF",
    "col.guitar": "Git",
    "col.staff.title": "Staff",
    "col.analysis.title": "Analysis",
    "col.cof.title": "Circle of Fifths",
    "col.guitar.title": "Guitar",
    "staff.label": "Staff",
    "staff.clef.title": "Staves: grand (treble and bass, split at middle C), treble only, bass only",
    "staff.clef.grand": "Grand",
    "staff.clef.treble": "Treble",
    "staff.clef.bass": "Bass",
    "staff.smaller": "Smaller staff",
    "staff.larger": "Larger staff",
    "analysis.label": "Analysis",
    "cof.label": "CoF",
    "cof.flat.title": "Show flat enharmonics (Gb, Db\u2026)",
    "cof.sharp.title": "Show sharp enharmonics (F#, C#\u2026)",
    "cof.spelledInKey": "Spelled as in {key}; b / # apply without a key",
    "cof.minor.title": "Show/hide minor and diminished rings",
    "cof.degrees.title": "Show scale degrees (I, IV, V\u2026)",
    "cof.sevenths.title": "Show 7th chords (maj7, m7, \xF87)",
    "cof.segment.tip": "Click: play \xB7 double-click: set as key",
    "cof.segment.play": "Click: play",
    "guitar.label": "Guitar",
    // Analysis fields: button label, tooltip, row label
    "field.roman": "Roman",
    "field.roman.title": "Roman numeral",
    "field.roman.row": "Roman",
    "field.function": "Func",
    "field.function.title": "Harmonic function",
    "field.function.row": "Function",
    "field.figbass": "Fig",
    "field.figbass.title": "Figured bass",
    "field.figbass.row": "Fig. bass",
    "field.voicing": "Voic",
    "field.voicing.title": "Voicing: inversion, close / open, drop, doubled and missing notes",
    "field.voicing.row": "Voicing",
    "field.diatonic": "Diat",
    "field.diatonic.title": "Diatonic / borrowed",
    "field.diatonic.row": "Diatonic",
    "field.scales": "Scl",
    "field.scales.title": "Suggested scales for the chord",
    "field.scales.row": "Scales",
    "field.fits": "Fits",
    "field.fits.title": "Scales that contain every note on screen, or of the melody played note by note",
    "field.fits.row": "Fits",
    "field.cadence": "Cad",
    "field.cadence.title": "Cadence",
    "field.cadence.row": "Cadence",
    "field.plr": "PLR",
    "field.plr.title": "Neo-Riemannian moves (P, L, R) from the previous triad",
    "field.plr.row": "P/L/R",
    "field.secondary": "Sec",
    "field.secondary.title": "Secondary dominant",
    "field.secondary.row": "Secondary",
    "field.subs": "Subs",
    "field.subs.title": "Substitutions",
    "field.subs.row": "Subs.",
    "field.upper": "UST",
    "field.upper.title": "Upper-structure triads sounding over a dominant",
    "field.upper.row": "Upper str.",
    "field.forte": "Set",
    "field.forte.title": "Set class: Forte number, prime form, interval vector",
    "field.forte.row": "Set class",
    // Analysis values
    "analysis.note": "Note",
    "analysis.interval": "Interval",
    "analysis.inversion": "Inversion",
    "analysis.semitones": "{n} st",
    "analysis.yes": "Yes",
    "analysis.borrowed": "Borrowed ({mode})",
    "analysis.chromatic": "Chromatic",
    "fn.T": "Tonic",
    "fn.S": "Subdominant",
    "fn.D": "Dominant",
    "fn.unknown": "Unknown",
    "fn.unknownLong": "Unknown function",
    // Intervals
    "interval.0": "Unison",
    "interval.1": "Minor 2nd",
    "interval.2": "Major 2nd",
    "interval.3": "Minor 3rd",
    "interval.4": "Major 3rd",
    "interval.5": "Perfect 4th",
    "interval.6": "Tritone",
    "interval.7": "Perfect 5th",
    "interval.8": "Minor 6th",
    "interval.9": "Major 6th",
    "interval.10": "Minor 7th",
    "interval.11": "Major 7th",
    "interval.octave": "Octave",
    // Voicing
    "voicing.inversion0": "root position",
    "voicing.inversion1": "1st inversion",
    "voicing.inversion2": "2nd inversion",
    "voicing.inversion3": "3rd inversion",
    "voicing.inBass": "{degree} in the bass",
    "voicing.close": "close",
    "voicing.open": "open",
    "voicing.doubled": "doubled {notes}",
    "voicing.missing": "no {notes}",
    // Key panel
    "keyPanel.title": "Key",
    "keyPanel.sevenths.title": "Seventh chords instead of triads",
    "keyPanel.neg": "Neg",
    "keyPanel.neg.title": "Show/hide negative harmony",
    "keyPanel.par": "Par",
    "keyPanel.par.title": "Show/hide parallel modes",
    "keyPanel.colt": "Colt",
    "keyPanel.colt.title": "Show/hide Coltrane axis",
    "keyPanel.empty": "Pick a key, or play: on Auto the detected key shows here.",
    "keyPanel.auto": "{key} (auto)",
    "keyPanel.also": "also {roman}",
    "keyPanel.harmonicMinor": "harmonic minor, raised 7th",
    "keyPanel.negative": "Negative harmony",
    "keyPanel.negative.title": "Each diatonic chord mirrored around the axis between the minor and major 3rd of the tonic (Harmony.getNegativeHarmony)",
    "keyPanel.negativeOf": "Negative of {chord}",
    "keyPanel.coltrane": "Coltrane axis",
    "keyPanel.coltrane.title": "Tonics a major third apart (Harmony.getColtraneAxis)",
    "keyPanel.parallel": "Parallel modes",
    "keyPanel.parallel.title": "Chords of each mode on the same tonic that use a note outside the key (Harmony.getBorrowedChords). Bold: the ones with the note that sets the mode apart",
    "keyPanel.from": "from {mode}",
    "keyPanel.characteristic": "carries its characteristic note",
    // Instruments panel
    "instruments.title": "Instruments",
    "col.piano": "Pi",
    "col.neck": "Fr",
    "col.velocity": "Ve",
    "col.piano.title": "Piano",
    "col.neck.title": "Fretboard",
    "col.velocity.title": "Velocity of each note",
    "velocity.label": "Velocity",
    "velocity.empty": "Play to see how hard each note is struck",
    "velocity.bar": "{note}: velocity {v} of 127",
    // Guitar
    "guitar.none": "No voicings",
    "guitar.prev": "Previous voicing",
    "guitar.next": "Next voicing",
    "guitar.string": "String {n}",
    "guitar.smaller": "Smaller diagram",
    "guitar.larger": "Larger diagram",
    "guitar.labels.off": "Off",
    "guitar.labels.off.title": "Hide string labels",
    "guitar.labels.tuning.title": "Show open string notes (tuning)",
    "guitar.labels.notes.title": "Show fretted note names",
    "guitar.tuning.title": "Tuning preset",
    "guitar.tuning.standard": "Standard",
    "guitar.tuning.dropD": "Drop D",
    "guitar.tuning.openG": "Open G",
    "guitar.tuning.custom": "Custom",
    "guitar.tuner.title": "Edit string tuning",
    // History
    "history.title": "History",
    "history.clear": "Clear",
    "history.clear.title": "Clear history (C) \u2014 can be undone",
    "history.cleared": "History cleared ({n})",
    "history.removed": "Removed {chord}",
    "history.chip.inKey": "{roman} in {key}",
    "history.chip.actions": "click to play, drag to song, right-click to remove",
    "history.modulation": "Modulation to {key}: from here the numerals are read in it",
    // Song
    "song.title": "Song Structure",
    "song.untitled": "Untitled",
    "song.saved.title": "Saved songs",
    "song.new": "New",
    "song.new.title": "Start a new song; the current one stays in the list",
    "song.delete": "Delete",
    "song.delete.title": "Delete this song \u2014 can be undone",
    "song.deleted": 'Deleted "{title}"',
    "song.paste": "Paste",
    "song.paste.title": "Paste a chord progression as text",
    "song.paste.placeholder": "Am G | C F  (| separates measures; without bars, one chord per measure)",
    "song.paste.add": "Add chords",
    "song.addSection.title": "Add {name} section",
    "song.transpose": "\u21C4 Transpose",
    "song.transpose.title": "Transpose all chords up by semitones",
    "song.transpose.step": "+{n} st",
    "song.export": "\u2399 Export",
    "song.export.title": "Print / export song to PDF",
    "song.popupBlocked": "Pop-up blocked \u2014 allow pop-ups for this page to export.",
    "song.form": "Form: {form}",
    "song.key": "Key: {key}",
    "section.intro": "Intro",
    "section.verse": "Verse",
    "section.pre": "Pre",
    "section.prechorus": "Pre-Chorus",
    "section.chorus": "Chorus",
    "section.bridge": "Bridge",
    "section.outro": "Outro",
    "section.custom": "Custom",
    "section.default": "Section",
    "section.color.title": "Change section color",
    "section.repeat.title": "Repeat count \u2014 click to edit",
    "section.drag.title": "Drag to reorder section",
    "section.duplicate.title": "Duplicate section",
    "section.delete.title": "Delete section \u2014 can be undone",
    "section.deleted": "Deleted section {name}",
    "section.addBar": "+ Bar",
    "section.addBar.title": "Add a measure to this section",
    "measure.delete.title": "Delete measure \u2014 can be undone",
    "measure.deleted": "Deleted measure {n}",
    "chord.edit.title": "Edit chord symbol",
    "chord.duplicate.title": "Duplicate chord",
    "chord.remove.title": "Remove chord (Del) \u2014 can be undone",
    "chord.capture.title": "MIDI fill: next chord played on MIDI keyboard replaces this slot",
    "chord.clearVoicing.title": "Clear stored voicing",
    "chord.removed": "Removed {chord}",
    "chord.generic": "chord",
    "form.empty": "Empty",
    "form.verseChorus": "Verse-Chorus ({p})",
    "form.ternary": "Ternary ({p})",
    "form.single": "Single section (A)",
    "form.strophic": "Strophic ({p})",
    // Undo
    "undo": "Undo",
    // Help
    "help.heading": "Shortcuts and gestures",
    "help.mouse": "Mouse",
    "help.settings": "Language",
    "help.theme": "Theme",
    "help.theme.system": "As the system",
    "help.theme.dark": "Dark",
    "help.theme.light": "Light",
    "help.theme.contrast": "High contrast",
    "help.theme.paper": "Paper",
    "help.language": "Interface",
    "help.noteNames": "Note names",
    "help.noteNames.letters": "C D E",
    "help.noteNames.solfege": "Do Re Mi",
    "help.reloads": "Changing the interface or the note names reloads the page; history and songs stay.",
    "kbd.space": "Space",
    "kbd.del": "Del",
    "kbd.esc": "Esc",
    "shortcut.play": "Play current chord (or last if none active)",
    "shortcut.step": "Previous / next chord in the song (or history) \u2014 plays it",
    "shortcut.delete": "Remove the selected song chord (undo in the toast)",
    "shortcut.hold": "Toggle Hold mode",
    "shortcut.arpeggio": "Toggle Arpeggio mode",
    "shortcut.send": "Send history chip \u2192 Song",
    "shortcut.clear": "Clear history (undo in the toast)",
    "shortcut.escape": "Drop a held chord, clear cursor, stop MIDI fill",
    "shortcut.keyboard": "Play with the computer keyboard (M or Esc to stop)",
    "shortcut.present": "Presentation: large, no controls, full screen (P or Esc to leave)",
    "shortcut.type": "Type a chord name",
    "shortcut.candidate": "Select chord candidate",
    "shortcut.help": "Show / hide this panel",
    "gesture.click": "Click a history chip, song chord or circle segment to play it and show it in the detector.",
    "gesture.doubleClick": "Double-click a major or minor circle segment to make it the key.",
    "gesture.logged": "A chord is logged to history once held steady for 0.8 s, and not twice in a row.",
    "gesture.drag": "Drag a history chip onto a song measure to insert it; drag song chords and section headers to reorder.",
    "gesture.fill": "\u2299 on a song chord arms MIDI fill: each chord you play fills a slot and arms the next, until the song ends or Esc.",
    "gesture.remove": "Right-click a history chip to remove it. Removals and Clear can be undone from the toast.",
    "gesture.piano": "Click the on-screen piano to play: in Hold each click adds or removes a note of the chord."
  };

  // src/i18n/es.ts
  var es = {
    "page.noMidi": "Este navegador no tiene Web MIDI y no puede conectar un controlador (Chrome, Edge y Firefox s\xED). Todo lo dem\xE1s funciona: canciones, c\xEDrculo de quintas, historial.",
    "page.cdnError": "No se pudo cargar un recurso necesario. Comprueba la conexi\xF3n a internet.",
    "midi.connected": "MIDI: conectado",
    "midi.noDevices": "MIDI: ninguno",
    "midi.disconnected": "MIDI: desconectado",
    "midi.noDeviceOption": "Sin dispositivos MIDI",
    "midi.denied": "Acceso MIDI denegado. Da permiso en los ajustes del navegador para usar un controlador.",
    "midi.inChannel.title": "Canal de entrada: solo se leen las notas de este canal (un teclado dividido o una pista del DAW)",
    "midi.inChannel.all": "ent: todos",
    "midi.inChannel.one": "ent: c{n}",
    "midi.out.title": "Salida MIDI: lo que suena se env\xEDa a este puerto",
    "midi.out.loops": "Es el mismo puerto que la entrada: no se env\xEDa nada, volver\xEDa como entrada",
    "midi.out.off": "Sal: no",
    "midi.out.port": "Sal: {name}",
    "midi.out.absent": "Sal: {name} (ausente)",
    "midi.outChannel.title": "Canal de salida MIDI",
    "midi.outChannel.one": "c{n}",
    "midi.thru": "Thru",
    "midi.thru.title": "Thru: env\xEDa tambi\xE9n las notas del controlador (apagado: el DAW suele o\xEDr el controlador directamente)",
    "mode.normal": "Normal",
    "mode.hold": "Mantener",
    "mode.arpeggio": "Arpegio",
    "mode.normal.title": "Normal: el detector muestra las teclas pulsadas",
    "mode.hold.title": "Mantener: el acorde se queda al soltar las teclas; la siguiente nota tras soltarlas todas empieza otro (H)",
    "mode.arpeggio.title": "Arpegio: las notas se suman en un acorde hasta que pasan 1,2 s sin otra nueva (A)",
    "keyboard.title": "Tocar con el teclado del ordenador (M): A-\xD1 teclas blancas, W E T Y U O P negras, Z/X octava, C/V velocidad, Tab pedal",
    "key.auto": "Tono: auto",
    "key.autoDetected": "auto: {key}",
    "key.major": "mayor",
    "key.minor": "menor",
    "typed.placeholder": "Acorde\u2026 (/)",
    "typed.title": "Escribe un acorde y pulsa Intro (en letras o en Do Re Mi: Am7, Lam7)",
    "audio.title": "Estado del soundfont",
    "audio.idle": "\u266A en espera",
    "audio.loading": "\u266A cargando\u2026",
    "audio.suspended": "\u266A clic para activar",
    "audio.ready": "\u266A listo",
    "audio.error": "\u266A error",
    "audio.play.title": "Tocar el acorde actual (Espacio)",
    "audio.instrument.title": "Instrumento del soundfont",
    "audio.volume.title": "Volumen",
    "gm.piano": "Piano",
    "gm.chromatic": "Percusi\xF3n crom\xE1tica",
    "gm.organ": "\xD3rgano",
    "gm.guitar": "Guitarra",
    "gm.bass": "Bajo",
    "gm.strings": "Cuerdas",
    "gm.ensemble": "Conjunto",
    "gm.brass": "Metales",
    "gm.reed": "Leng\xFCeta",
    "gm.pipe": "Viento",
    "gm.lead": "Sinte solista",
    "gm.pad": "Sinte pad",
    "gm.fx": "Sinte efectos",
    "gm.ethnic": "\xC9tnicos",
    "gm.percussive": "Percusi\xF3n",
    "gm.soundFx": "Efectos de sonido",
    "present.title": "Presentaci\xF3n: grande, sin controles, a pantalla completa (P; Esc para salir)",
    "present.close": "Salir de la presentaci\xF3n (Esc)",
    "views.title": "Ventanas de vista para OBS y exportar diagramas (SVG, PNG)",
    "views.open": "Abrir una ventana de vista",
    "views.background": "Fondo",
    "views.bg.green": "verde",
    "views.bg.magenta": "magenta",
    "views.bg.black": "negro",
    "views.bg.dark": "oscuro",
    "views.hint": 'En OBS: Captura de ventana de "Modus view: \u2026" y despu\xE9s un filtro Chroma Key. La ventana sigue a esta en directo.',
    "views.save": "Guardar el diagrama en pantalla (fondo transparente)",
    "view.chord": "Acorde",
    "view.staff": "Pentagrama",
    "view.cof": "C\xEDrculo de quintas",
    "view.piano": "Piano",
    "view.guitar": "Guitarra",
    "help.title": "Atajos, gestos e idioma (?)",
    "ctrl.smaller": "M\xE1s peque\xF1o",
    "ctrl.larger": "M\xE1s grande",
    "notation.title": "Notaci\xF3n",
    "col.staff": "Pe",
    "col.analysis": "An",
    "col.cof": "C\xEDr",
    "col.guitar": "Gui",
    "col.staff.title": "Pentagrama",
    "col.analysis.title": "An\xE1lisis",
    "col.cof.title": "C\xEDrculo de quintas",
    "col.guitar.title": "Guitarra",
    "staff.label": "Pentagrama",
    "staff.clef.title": "Pentagramas: doble (clave de sol y de fa, separados en el Do central), solo clave de sol, solo clave de fa",
    "staff.clef.grand": "Doble",
    "staff.clef.treble": "Sol",
    "staff.clef.bass": "Fa",
    "staff.smaller": "Pentagrama m\xE1s peque\xF1o",
    "staff.larger": "Pentagrama m\xE1s grande",
    "analysis.label": "An\xE1lisis",
    "cof.label": "Quintas",
    "cof.flat.title": "Enarm\xF3nicos con bemoles (Solb, Reb\u2026)",
    "cof.sharp.title": "Enarm\xF3nicos con sostenidos (Fa#, Do#\u2026)",
    "cof.spelledInKey": "Escrito como en {key}; b / # sirven sin tonalidad",
    "cof.minor.title": "Mostrar u ocultar los anillos menor y disminuido",
    "cof.degrees.title": "Mostrar los grados (I, IV, V\u2026)",
    "cof.sevenths.title": "Mostrar cuatr\xEDadas (maj7, m7, \xF87)",
    "cof.segment.tip": "Clic: tocar \xB7 doble clic: usar como tonalidad",
    "cof.segment.play": "Clic: tocar",
    "guitar.label": "Guitarra",
    "field.roman": "Grado",
    "field.roman.title": "Grado en n\xFAmeros romanos",
    "field.roman.row": "Grado",
    "field.function": "Func",
    "field.function.title": "Funci\xF3n arm\xF3nica",
    "field.function.row": "Funci\xF3n",
    "field.figbass": "Cifr",
    "field.figbass.title": "Bajo cifrado",
    "field.figbass.row": "Bajo cifr.",
    "field.voicing": "Disp",
    "field.voicing.title": "Disposici\xF3n: inversi\xF3n, cerrada / abierta, drop, notas dobladas y que faltan",
    "field.voicing.row": "Disposici\xF3n",
    "field.diatonic": "Diat",
    "field.diatonic.title": "Diat\xF3nico / prestado",
    "field.diatonic.row": "Diat\xF3nico",
    "field.scales": "Esc",
    "field.scales.title": "Escalas sugeridas para el acorde",
    "field.scales.row": "Escalas",
    "field.fits": "Enc",
    "field.fits.title": "Escalas que contienen todas las notas en pantalla, o las de la melod\xEDa tocada nota a nota",
    "field.fits.row": "Encaja en",
    "field.cadence": "Cad",
    "field.cadence.title": "Cadencia",
    "field.cadence.row": "Cadencia",
    "field.plr": "PLR",
    "field.plr.title": "Movimientos neorriemannianos (P, L, R) desde la tr\xEDada anterior",
    "field.plr.row": "P/L/R",
    "field.secondary": "Sec",
    "field.secondary.title": "Dominante secundaria",
    "field.secondary.row": "Secundaria",
    "field.subs": "Sust",
    "field.subs.title": "Sustituciones",
    "field.subs.row": "Sustit.",
    "field.upper": "UST",
    "field.upper.title": "Tr\xEDadas de estructura superior que suenan sobre un dominante",
    "field.upper.row": "Estr. sup.",
    "field.forte": "Conj",
    "field.forte.title": "Clase de conjunto: n\xFAmero de Forte, forma prima, vector interv\xE1lico",
    "field.forte.row": "Conjunto",
    "analysis.note": "Nota",
    "analysis.interval": "Intervalo",
    "analysis.inversion": "Inversi\xF3n",
    "analysis.semitones": "{n} semit.",
    "analysis.yes": "S\xED",
    "analysis.borrowed": "Prestado ({mode})",
    "analysis.chromatic": "Crom\xE1tico",
    "fn.T": "T\xF3nica",
    "fn.S": "Subdominante",
    "fn.D": "Dominante",
    "fn.unknown": "Desconocida",
    "fn.unknownLong": "Funci\xF3n desconocida",
    "interval.0": "Un\xEDsono",
    "interval.1": "2\xAA menor",
    "interval.2": "2\xAA mayor",
    "interval.3": "3\xAA menor",
    "interval.4": "3\xAA mayor",
    "interval.5": "4\xAA justa",
    "interval.6": "Tritono",
    "interval.7": "5\xAA justa",
    "interval.8": "6\xAA menor",
    "interval.9": "6\xAA mayor",
    "interval.10": "7\xAA menor",
    "interval.11": "7\xAA mayor",
    "interval.octave": "Octava",
    "voicing.inversion0": "estado fundamental",
    "voicing.inversion1": "1.\xAA inversi\xF3n",
    "voicing.inversion2": "2.\xAA inversi\xF3n",
    "voicing.inversion3": "3.\xAA inversi\xF3n",
    "voicing.inBass": "{degree} en el bajo",
    "voicing.close": "cerrada",
    "voicing.open": "abierta",
    "voicing.doubled": "doblada {notes}",
    "voicing.missing": "sin {notes}",
    "keyPanel.title": "Tonalidad",
    "keyPanel.sevenths.title": "Cuatr\xEDadas en lugar de tr\xEDadas",
    "keyPanel.neg": "Neg",
    "keyPanel.neg.title": "Mostrar u ocultar la armon\xEDa negativa",
    "keyPanel.par": "Par",
    "keyPanel.par.title": "Mostrar u ocultar los modos paralelos",
    "keyPanel.colt": "Colt",
    "keyPanel.colt.title": "Mostrar u ocultar el eje de Coltrane",
    "keyPanel.empty": "Elige una tonalidad o toca: en auto aparece aqu\xED la tonalidad detectada.",
    "keyPanel.auto": "{key} (auto)",
    "keyPanel.also": "tambi\xE9n {roman}",
    "keyPanel.harmonicMinor": "menor arm\xF3nica, 7.\xBA elevado",
    "keyPanel.negative": "Armon\xEDa negativa",
    "keyPanel.negative.title": "Cada acorde diat\xF3nico reflejado sobre el eje entre la 3.\xAA menor y la 3.\xAA mayor de la t\xF3nica (Harmony.getNegativeHarmony)",
    "keyPanel.negativeOf": "Negativo de {chord}",
    "keyPanel.coltrane": "Eje de Coltrane",
    "keyPanel.coltrane.title": "T\xF3nicas a distancia de tercera mayor (Harmony.getColtraneAxis)",
    "keyPanel.parallel": "Modos paralelos",
    "keyPanel.parallel.title": "Acordes de cada modo sobre la misma t\xF3nica que usan una nota fuera de la tonalidad (Harmony.getBorrowedChords). En negrita, los que llevan la nota propia del modo",
    "keyPanel.from": "de {mode}",
    "keyPanel.characteristic": "lleva su nota caracter\xEDstica",
    "instruments.title": "Instrumentos",
    "col.piano": "Pi",
    "col.neck": "M\xE1",
    "col.velocity": "Ve",
    "col.piano.title": "Piano",
    "col.neck.title": "M\xE1stil",
    "col.velocity.title": "Velocidad de cada nota",
    "velocity.label": "Velocidad",
    "velocity.empty": "Toca para ver con qu\xE9 fuerza suena cada nota",
    "velocity.bar": "{note}: velocidad {v} de 127",
    "guitar.none": "Sin posiciones",
    "guitar.prev": "Posici\xF3n anterior",
    "guitar.next": "Posici\xF3n siguiente",
    "guitar.string": "Cuerda {n}",
    "guitar.smaller": "Diagrama m\xE1s peque\xF1o",
    "guitar.larger": "Diagrama m\xE1s grande",
    "guitar.labels.off": "No",
    "guitar.labels.off.title": "Ocultar los nombres de las cuerdas",
    "guitar.labels.tuning.title": "Mostrar las notas al aire (afinaci\xF3n)",
    "guitar.labels.notes.title": "Mostrar las notas pisadas",
    "guitar.tuning.title": "Afinaci\xF3n",
    "guitar.tuning.standard": "Est\xE1ndar",
    "guitar.tuning.dropD": "Drop D",
    "guitar.tuning.openG": "Open G",
    "guitar.tuning.custom": "Personal",
    "guitar.tuner.title": "Cambiar la afinaci\xF3n de cada cuerda",
    "history.title": "Historial",
    "history.clear": "Borrar",
    "history.clear.title": "Borrar el historial (C); se puede deshacer",
    "history.cleared": "Historial borrado ({n})",
    "history.removed": "Quitado {chord}",
    "history.chip.inKey": "{roman} en {key}",
    "history.chip.actions": "clic para tocar, arrastra a la canci\xF3n, clic derecho para quitar",
    "history.modulation": "Modulaci\xF3n a {key}: desde aqu\xED los grados se leen en ella",
    "song.title": "Estructura de la canci\xF3n",
    "song.untitled": "Sin t\xEDtulo",
    "song.saved.title": "Canciones guardadas",
    "song.new": "Nueva",
    "song.new.title": "Empezar una canci\xF3n nueva; la actual sigue en la lista",
    "song.delete": "Borrar",
    "song.delete.title": "Borrar esta canci\xF3n; se puede deshacer",
    "song.deleted": "Borrada \xAB{title}\xBB",
    "song.paste": "Pegar",
    "song.paste.title": "Pegar una progresi\xF3n de acordes como texto",
    "song.paste.placeholder": "Am G | C F  (| separa compases; sin barras, un acorde por comp\xE1s)",
    "song.paste.add": "A\xF1adir acordes",
    "song.addSection.title": "A\xF1adir secci\xF3n {name}",
    "song.transpose": "\u21C4 Transportar",
    "song.transpose.title": "Transportar todos los acordes hacia arriba, en semitonos",
    "song.transpose.step": "+{n} semit.",
    "song.export": "\u2399 Exportar",
    "song.export.title": "Imprimir o exportar la canci\xF3n a PDF",
    "song.popupBlocked": "Ventana emergente bloqueada: permite las ventanas emergentes de esta p\xE1gina para exportar.",
    "song.form": "Forma: {form}",
    "song.key": "Tonalidad: {key}",
    "section.intro": "Intro",
    "section.verse": "Estrofa",
    "section.pre": "Pre",
    "section.prechorus": "Preestribillo",
    "section.chorus": "Estribillo",
    "section.bridge": "Puente",
    "section.outro": "Final",
    "section.custom": "Otra",
    "section.default": "Secci\xF3n",
    "section.color.title": "Cambiar el color de la secci\xF3n",
    "section.repeat.title": "Repeticiones: clic para cambiar",
    "section.drag.title": "Arrastra para mover la secci\xF3n",
    "section.duplicate.title": "Duplicar la secci\xF3n",
    "section.delete.title": "Borrar la secci\xF3n; se puede deshacer",
    "section.deleted": "Borrada la secci\xF3n {name}",
    "section.addBar": "+ Comp.",
    "section.addBar.title": "A\xF1adir un comp\xE1s a esta secci\xF3n",
    "measure.delete.title": "Borrar el comp\xE1s; se puede deshacer",
    "measure.deleted": "Borrado el comp\xE1s {n}",
    "chord.edit.title": "Editar el acorde",
    "chord.duplicate.title": "Duplicar el acorde",
    "chord.remove.title": "Quitar el acorde (Supr); se puede deshacer",
    "chord.capture.title": "Relleno MIDI: el siguiente acorde que toques en el teclado MIDI ocupa este hueco",
    "chord.clearVoicing.title": "Quitar la disposici\xF3n guardada",
    "chord.removed": "Quitado {chord}",
    "chord.generic": "acorde",
    "form.empty": "Vac\xEDa",
    "form.verseChorus": "Estrofa-estribillo ({p})",
    "form.ternary": "Ternaria ({p})",
    "form.single": "Secci\xF3n \xFAnica (A)",
    "form.strophic": "Estr\xF3fica ({p})",
    "undo": "Deshacer",
    "help.heading": "Atajos y gestos",
    "help.mouse": "Rat\xF3n",
    "help.settings": "Idioma",
    "help.theme": "Tema",
    "help.theme.system": "Como el sistema",
    "help.theme.dark": "Oscuro",
    "help.theme.light": "Claro",
    "help.theme.contrast": "Alto contraste",
    "help.theme.paper": "Papel",
    "help.language": "Interfaz",
    "help.noteNames": "Nombres de nota",
    "help.noteNames.letters": "C D E",
    "help.noteNames.solfege": "Do Re Mi",
    "help.reloads": "Al cambiar la interfaz o los nombres de nota se recarga la p\xE1gina; el historial y las canciones se mantienen.",
    "kbd.space": "Espacio",
    "kbd.del": "Supr",
    "kbd.esc": "Esc",
    "shortcut.play": "Tocar el acorde actual (o el \xFAltimo si no hay ninguno)",
    "shortcut.step": "Acorde anterior / siguiente de la canci\xF3n (o del historial), y lo toca",
    "shortcut.delete": "Quitar el acorde seleccionado de la canci\xF3n (se deshace en el aviso)",
    "shortcut.hold": "Activar o desactivar Mantener",
    "shortcut.arpeggio": "Activar o desactivar Arpegio",
    "shortcut.send": "Enviar el acorde del historial a la canci\xF3n",
    "shortcut.clear": "Borrar el historial (se deshace en el aviso)",
    "shortcut.escape": "Soltar un acorde mantenido, quitar el cursor, parar el relleno MIDI",
    "shortcut.keyboard": "Tocar con el teclado del ordenador (M o Esc para parar)",
    "shortcut.present": "Presentaci\xF3n: grande, sin controles, a pantalla completa (P o Esc para salir)",
    "shortcut.type": "Escribir un acorde",
    "shortcut.candidate": "Elegir otra lectura del acorde",
    "shortcut.help": "Mostrar u ocultar este panel",
    "gesture.click": "Clic en un acorde del historial, de la canci\xF3n o del c\xEDrculo para tocarlo y verlo en el detector.",
    "gesture.doubleClick": "Doble clic en un sector mayor o menor del c\xEDrculo para usarlo como tonalidad.",
    "gesture.logged": "Un acorde pasa al historial cuando se mantiene 0,8 s, y nunca dos veces seguidas.",
    "gesture.drag": "Arrastra un acorde del historial a un comp\xE1s de la canci\xF3n para insertarlo; arrastra acordes y cabeceras de secci\xF3n para reordenarlos.",
    "gesture.fill": "\u2299 en un acorde de la canci\xF3n activa el relleno MIDI: cada acorde que tocas ocupa un hueco y pasa al siguiente, hasta el final o Esc.",
    "gesture.remove": "Clic derecho en un acorde del historial para quitarlo. Lo quitado y el borrado se deshacen desde el aviso.",
    "gesture.piano": "Clic en el piano de la pantalla para tocar: en Mantener cada clic a\xF1ade o quita una nota del acorde."
  };

  // src/i18n/i18n.ts
  var LANGS = ["en", "es"];
  var LANG_NAMES = { en: "English", es: "Espa\xF1ol" };
  var NOTE_NAMINGS = ["letters", "solfege"];
  var TABLES = { en, es };
  function browserLang() {
    const first = typeof navigator === "undefined" ? "" : navigator.languages?.[0] ?? navigator.language ?? "";
    return first.toLowerCase().startsWith("es") ? "es" : "en";
  }
  var lang = loadChoice("lang", LANGS, browserLang());
  var naming = loadChoice("note-names", NOTE_NAMINGS, lang === "es" ? "solfege" : "letters");
  function getLang() {
    return lang;
  }
  function getNoteNaming() {
    return naming;
  }
  function saveLang(l) {
    save("lang", l);
  }
  function saveNoteNaming(n) {
    save("note-names", n);
  }
  function t(key, vars) {
    const s = TABLES[lang][key] ?? en[key];
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m) : s;
  }
  var NOTE_RE = /^[A-G](?:#|b|x|##|bb)*-?\d*$/;
  function noteLabel(name) {
    if (naming === "letters" || !NOTE_RE.test(name)) return name;
    return tryUMT("note names", () => UMT.localizeNoteName(name, "es"), name);
  }
  function chordLabel(symbol) {
    if (naming === "letters" || !/^[A-G]/.test(symbol)) return symbol;
    return tryUMT("chord names", () => UMT.formatChordSymbol(symbol, { roots: "solfege" }), symbol);
  }
  function localizeDrawnNoteNames(container) {
    if (naming === "letters") return;
    container.querySelectorAll("text").forEach((el) => {
      const s = el.textContent?.trim() ?? "";
      if (NOTE_RE.test(s)) el.textContent = noteLabel(s);
    });
  }
  function keyLabel(key) {
    const [root, mode2] = key.split(" ");
    if (!mode2) return noteLabel(key);
    const m = mode2.toLowerCase();
    const modeName = m === "major" ? t("key.major") : m === "minor" ? t("key.minor") : mode2;
    return `${noteLabel(root)} ${modeName}`;
  }
  function scaleLabel(name) {
    return UMT.scaleName(name, lang, { roots: naming });
  }
  function cadenceLabel(cadence, short = false) {
    return UMT.cadenceName(cadence, lang, { short });
  }
  function substitutionTypeLabel(type) {
    return UMT.substitutionTypeName(type, lang);
  }
  function applyDocumentLang() {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }

  // src/detector/analyzer.ts
  var intervalName = (n) => t(`interval.${n}`);
  function semitonesToInterval(semitones) {
    const n = (semitones % 12 + 12) % 12;
    if (n === 0) return semitones === 0 ? { name: intervalName(0), inversionName: t("interval.octave") } : { name: t("interval.octave"), inversionName: intervalName(0) };
    return { name: intervalName(n), inversionName: intervalName(12 - n) };
  }
  function analyzeNotes(midiNotes) {
    if (midiNotes.length === 0) return null;
    const noteNames = midiNotes.map(midiToNoteName);
    if (midiNotes.length === 1) {
      const result2 = {
        kind: "note",
        noteName: noteNames[0],
        midiNumber: midiNotes[0],
        pitchClass: PITCH_NAMES_FLAT[midiNotes[0] % 12]
      };
      return result2;
    }
    if (midiNotes.length === 2) {
      const semitones = Math.abs(midiNotes[0] - midiNotes[1]);
      const { name, inversionName } = semitonesToInterval(semitones);
      const result2 = {
        kind: "interval",
        notes: noteNames,
        intervalName: name,
        semitones,
        inversionName
      };
      return result2;
    }
    let candidates = [];
    candidates = tryUMT("chord detection", () => (UMT.Harmony.detectChordsScored(noteNames.map((n) => UMT.parseNote(n))) ?? []).map((c) => normalizeChordName(c.name)).filter(isKnownChord), []);
    candidates = [...new Set(candidates)];
    const result = {
      kind: "chord",
      notes: noteNames,
      candidates: candidates.length ? candidates : ["?"],
      selectedIndex: 0
    };
    return result;
  }
  var romanCache = /* @__PURE__ */ new Map();
  function romanInKey(chordSymbol, key) {
    if (!key || !chordSymbol) return null;
    const cacheKey = `${chordSymbol}|${key}`;
    if (romanCache.has(cacheKey)) return romanCache.get(cacheKey);
    const chord = tryParseChord(chordSymbol);
    const a = chord ? tryUMT("progression", () => UMT.Harmony.analyzeProgression([chord], key, WRITTEN).analysis[0], null) : null;
    const info = a ? toRomanInfo(a) : null;
    romanCache.set(cacheKey, info);
    return info;
  }
  var WRITTEN = { spelling: "written" };
  function toRomanInfo(a) {
    return {
      roman: a.isSecondary && a.secondaryTarget ? a.secondaryTarget : a.roman ?? "?",
      degree: a.roman ?? "?",
      function: a.function ?? "unknown",
      isDiatonic: a.isDiatonic ?? false,
      isBorrowed: a.isBorrowed ?? false,
      borrowedFrom: a.borrowedFrom,
      isSecondary: a.isSecondary ?? false,
      secondaryTarget: a.secondaryTarget
    };
  }
  function analyzeChordProgression(chords, key) {
    const none = (k) => chords.map(() => ({ key: k, info: null, cadence: null }));
    if (!key) return none(null);
    const parsed = chords.map(tryParseChord);
    const readable = parsed.flatMap((c, i) => c ? [i] : []);
    if (!readable.length) return none(key);
    const analysis = tryUMT(
      "progression",
      () => UMT.Harmony.analyzeProgression(readable.map((i) => parsed[i]), key, WRITTEN).analysis,
      []
    );
    const steps = none(key);
    let local = key;
    readable.forEach((orig, j) => {
      const a = analysis[j];
      if (!a) return;
      local = normalizeKey(a.key) ?? local;
      const nextIsNeighbour = readable[j + 1] === orig + 1;
      steps[orig] = { key: local, info: toRomanInfo(a), cadence: nextIsNeighbour ? a.cadenceWithNext ?? null : null };
    });
    steps.forEach((s, i) => {
      if (!s.info && i > 0) s.key = steps[i - 1].key;
    });
    return steps;
  }
  var pcName = (n) => n.replace(/-?\d+$/, "");
  function describeVoicing(noteNames, chord) {
    if (noteNames.length < 3) return null;
    const v = tryUMT("voicing", () => UMT.analyzeVoicing(noteNames.map((n) => UMT.parseNote(n)), chord), null);
    if (!v) return null;
    const bass = v.inversion >= 0 && v.inversion <= 3 ? t(`voicing.inversion${v.inversion}`) : t("voicing.inBass", { degree: v.bassDegree ?? pcName(v.bass) });
    return [
      bass,
      t(`voicing.${v.position}`),
      v.drop,
      v.doubled.length ? t("voicing.doubled", { notes: v.doubled.join(" ") }) : null,
      v.omitted.length ? t("voicing.missing", { notes: v.omitted.join(" ") }) : null,
      v.added.length ? `+ ${v.added.map(pcName).join(" ")}` : null
    ].filter(Boolean).join(" \xB7 ");
  }
  var pcOf = (name) => pitchClassOf(pcName(name));
  function presentUpperStructures(noteNames, chord) {
    const sounding3 = new Set(noteNames.map(pcOf));
    const all = tryUMT("upper structures", () => UMT.getUpperStructures(chord), []);
    return all.flatMap((u) => {
      const triad = tryUMT("upper structures", () => u.triad.getNotes().map((n) => n.name), []);
      return triad.length && triad.every((n) => sounding3.has(pcOf(n))) ? [`${u.label} (${chordLabel(u.triad.name)}: ${u.tensions.join(" ")})`] : [];
    });
  }
  function neoRiemannianPath(from, to) {
    const id = (c) => c ? `${(c.rootStep % 12 + 12) % 12}:${c.intervalsInSteps.join(",")}` : "";
    const target = id(to);
    const isTriad = (c) => !!tryUMT("neo-Riemannian", () => UMT.NeoRiemannian.P(c), null);
    if (!target || !isTriad(from) || !isTriad(to)) return null;
    if (id(from) === target) return null;
    let frontier = [{ chord: from, path: "" }];
    for (let depth = 1; depth <= 3; depth++) {
      const next = [];
      for (const { chord, path } of frontier) for (const op of ["P", "L", "R"]) {
        const c = tryUMT("neo-Riemannian", () => UMT.NeoRiemannian[op](chord), null);
        if (!c) continue;
        if (id(c) === target) return path + op;
        next.push({ chord: c, path: path + op });
      }
      frontier = next;
    }
    return null;
  }
  function analyzeNoteSet(noteNames, key, fromMelody = false) {
    const names = [...new Set(noteNames.map(pcName))];
    if (!names.length) return null;
    const notes = names.map((n) => tryUMT("notes", () => UMT.parseNote(n + "4"), null)).filter(Boolean);
    const pcs = tryUMT("set theory", () => UMT.SetTheory.getPitchClasses(notes), []);
    let forte = null;
    if (pcs.length >= 3) {
      const number = tryUMT("set theory", () => UMT.SetTheory.getForteNumber(pcs), "");
      const prime = tryUMT("set theory", () => UMT.SetTheory.primeForm(pcs), []);
      const vector = tryUMT("set theory", () => UMT.SetTheory.intervalVector(pcs), []);
      const digits = prime.map((p) => p === 10 ? "t" : p === 11 ? "e" : String(p)).join("");
      forte = [number, prime.length ? `[${digits}]` : "", vector.length ? `<${vector.join("")}>` : ""].filter(Boolean).join(" \xB7 ") || null;
    }
    const tonic = key?.split(" ")[0];
    const fits = tryUMT("scales", () => UMT.findScalesForNotes(notes, { tonic, limit: 7 }).filter((s) => s.notes.length < 12).slice(0, 6).map((s) => scaleLabel(s.name)), []);
    return { notes: names, fromMelody, forte, fits };
  }
  function buildHarmonicAnalysis(chordSymbol, activeKey, prevChordSymbol, noteNames = []) {
    const chord = tryParseChord(chordSymbol);
    if (!chord) return emptyAnalysis(chordSymbol);
    const result = emptyAnalysis(chordSymbol);
    const bassNote = tryUMT("notes", () => chord.getNotes()[0] ?? null, null);
    if (bassNote) result.figuredBass = tryUMT("figured bass", () => UMT.FiguredBass.fromChord(chord, bassNote), "");
    result.suggestedScales = tryUMT("scales", () => UMT.Harmony.getSuggestedScales(chord).map((s) => scaleLabel(s.scale)), []);
    result.voicing = describeVoicing(noteNames, chord);
    result.upperStructures = presentUpperStructures(noteNames, chord);
    const prevChord = tryParseChord(prevChordSymbol);
    if (prevChord) result.transformation = neoRiemannianPath(prevChord, chord);
    if (!activeKey) return result;
    const a = romanInKey(chordSymbol, activeKey);
    if (a) Object.assign(result, a);
    if (prevChord) {
      const cad = tryUMT("cadence", () => UMT.Harmony.analyzeCadence(prevChord, chord, activeKey), null);
      if (cad && cad !== "No standard cadence") result.cadence = cad;
    }
    result.substitutions = tryUMT("substitutions", () => UMT.getSubstitutions(chord, activeKey).map((s) => {
      const name = chordLabel(s.chord?.name ?? s.name ?? String(s));
      return s.type ? `${name} (${substitutionTypeLabel(s.type)})` : name;
    }), []);
    return result;
  }
  function emptyAnalysis(chordName) {
    return {
      chordName,
      roman: "?",
      function: "unknown",
      isDiatonic: false,
      isBorrowed: false,
      isSecondary: false,
      figuredBass: "",
      suggestedScales: [],
      substitutions: [],
      cadence: null,
      voicing: null,
      upperStructures: [],
      transformation: null
    };
  }
  function getAutoKey(history) {
    const noteNames = history.flatMap((e) => e.notes);
    if (noteNames.length === 0) return null;
    return normalizeKey(tryUMT("key detection", () => UMT.KeyDetection.detect(noteNames.map((n) => UMT.parseNote(n)))[0]?.key ?? null, null));
  }

  // src/audio/audio.ts
  var audioCtx = null;
  var masterGain = null;
  var instrument = null;
  var loadingInstrument = false;
  var volume = loadNumber("audio-volume", 0.8, 0, 1);
  var currentInstrumentName = loadString("audio-instrument", "acoustic_grand_piano");
  var audioStatus = "idle";
  var onStatusChange = null;
  function setAudioStatusCallback(cb) {
    onStatusChange = cb;
    cb(audioStatus);
  }
  var onMissed = () => {
  };
  function setAudioMissedCallback(cb) {
    onMissed = cb;
  }
  function setStatus(s) {
    audioStatus = s;
    onStatusChange?.(s);
  }
  var GM_INSTRUMENT_GROUPS = [
    { label: "gm.piano", instruments: ["acoustic_grand_piano", "bright_acoustic_piano", "electric_grand_piano", "honkytonk_piano", "electric_piano_1", "electric_piano_2", "harpsichord", "clavinet"] },
    { label: "gm.chromatic", instruments: ["celesta", "glockenspiel", "music_box", "vibraphone", "marimba", "xylophone", "tubular_bells", "dulcimer"] },
    { label: "gm.organ", instruments: ["drawbar_organ", "percussive_organ", "rock_organ", "church_organ", "reed_organ", "accordion", "harmonica", "tango_accordion"] },
    { label: "gm.guitar", instruments: ["acoustic_guitar_nylon", "acoustic_guitar_steel", "electric_guitar_jazz", "electric_guitar_clean", "electric_guitar_muted", "overdriven_guitar", "distortion_guitar", "guitar_harmonics"] },
    { label: "gm.bass", instruments: ["acoustic_bass", "electric_bass_finger", "electric_bass_pick", "fretless_bass", "slap_bass_1", "slap_bass_2", "synth_bass_1", "synth_bass_2"] },
    { label: "gm.strings", instruments: ["violin", "viola", "cello", "contrabass", "tremolo_strings", "pizzicato_strings", "orchestral_harp", "timpani"] },
    { label: "gm.ensemble", instruments: ["string_ensemble_1", "string_ensemble_2", "synth_strings_1", "synth_strings_2", "choir_aahs", "voice_oohs", "synth_voice", "orchestra_hit"] },
    { label: "gm.brass", instruments: ["trumpet", "trombone", "tuba", "muted_trumpet", "french_horn", "brass_section", "synth_brass_1", "synth_brass_2"] },
    { label: "gm.reed", instruments: ["soprano_sax", "alto_sax", "tenor_sax", "baritone_sax", "oboe", "english_horn", "bassoon", "clarinet"] },
    { label: "gm.pipe", instruments: ["piccolo", "flute", "recorder", "pan_flute", "blown_bottle", "shakuhachi", "whistle", "ocarina"] },
    { label: "gm.lead", instruments: ["lead_1_square", "lead_2_sawtooth", "lead_3_calliope", "lead_4_chiff", "lead_5_charang", "lead_6_voice", "lead_7_fifths", "lead_8_bass_lead"] },
    { label: "gm.pad", instruments: ["pad_1_new_age", "pad_2_warm", "pad_3_polysynth", "pad_4_choir", "pad_5_bowed", "pad_6_metallic", "pad_7_halo", "pad_8_sweep"] },
    { label: "gm.fx", instruments: ["fx_1_rain", "fx_2_soundtrack", "fx_3_crystal", "fx_4_atmosphere", "fx_5_brightness", "fx_6_goblins", "fx_7_echoes", "fx_8_sci-fi"] },
    { label: "gm.ethnic", instruments: ["sitar", "banjo", "shamisen", "koto", "kalimba", "bag_pipe", "fiddle", "shanai"] },
    { label: "gm.percussive", instruments: ["tinkle_bell", "agogo", "steel_drums", "woodblock", "taiko_drum", "melodic_tom", "synth_drum", "reverse_cymbal"] },
    { label: "gm.soundFx", instruments: ["guitar_fret_noise", "breath_noise", "seashore", "bird_tweet", "telephone_ring", "helicopter", "applause", "gunshot"] }
  ];
  function ensureContext() {
    if (audioCtx) return;
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioCtx.destination);
  }
  var loadToken = 0;
  function loadCurrentInstrument() {
    if (!audioCtx) return;
    if (typeof Soundfont === "undefined") {
      if (audioStatus !== "error") console.error("[audio] soundfont-player did not load");
      setStatus("error");
      return;
    }
    const token = ++loadToken;
    loadingInstrument = true;
    instrument = null;
    setStatus("loading");
    Soundfont.instrument(audioCtx, currentInstrumentName, { soundfont: "FluidR3_GM", destination: masterGain }).then((inst) => {
      if (token !== loadToken) return;
      instrument = inst;
      loadingInstrument = false;
      setStatus(audioCtx.state === "suspended" ? "suspended" : "ready");
    }).catch((err) => {
      if (token !== loadToken) return;
      loadingInstrument = false;
      setStatus("error");
      console.error("[audio] load failed:", err);
    });
  }
  function preloadAudio() {
    ensureContext();
    if (!instrument && !loadingInstrument) loadCurrentInstrument();
  }
  function initAudioOnGesture() {
    ensureContext();
    audioCtx.resume().then(() => {
      if (instrument && audioStatus === "suspended") setStatus("ready");
    });
    if (!instrument && !loadingInstrument) loadCurrentInstrument();
  }
  function setInstrument(name) {
    currentInstrumentName = name;
    save("audio-instrument", name);
    instrument = null;
    if (audioCtx) loadCurrentInstrument();
  }
  function getCurrentInstrument() {
    return currentInstrumentName;
  }
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    save("audio-volume", volume);
    if (audioCtx && masterGain) masterGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.02);
  }
  function getVolume() {
    return volume;
  }
  function playableInstrument() {
    initAudioOnGesture();
    const inst = instrument;
    if (!inst) {
      onMissed();
      return null;
    }
    const activation = navigator.userActivation;
    if (audioCtx.state === "suspended" && activation && !activation.isActive) {
      onMissed();
      return null;
    }
    return inst;
  }
  function whenRunning(fn) {
    if (audioCtx.state === "running") fn();
    else audioCtx.resume().then(fn);
  }
  function stopNode(node) {
    try {
      node?.stop(audioCtx.currentTime);
    } catch {
    }
  }
  var previewNodes = [];
  var onPreview = () => {
  };
  function setPreviewListener(cb) {
    onPreview = cb;
  }
  function playPreview(midis, duration) {
    if (!midis.length) return;
    onPreview(midis, duration, true);
    const inst = playableInstrument();
    if (!inst) return;
    whenRunning(() => {
      previewNodes.forEach(stopNode);
      previewNodes = midis.map((midi) => inst.play(midi, audioCtx.currentTime, { duration, gain: 1 }));
    });
  }
  function playNoteNames(noteNames, duration = 2) {
    playPreview(noteNames.map(noteNameToMidi).filter((m) => m !== null), duration);
  }
  function playChord(chordSymbol) {
    playNoteNames(chordNoteNames(chordSymbol));
  }
  var liveNodes = /* @__PURE__ */ new Map();
  var sustainedNotes = /* @__PURE__ */ new Set();
  var pedalDown = false;
  function velocityGain(velocity2) {
    return Math.max(0, Math.min(127, velocity2)) / 127;
  }
  function stopLive(midi) {
    stopNode(liveNodes.get(midi));
    liveNodes.delete(midi);
  }
  function liveNoteOn(midi, velocity2) {
    const inst = playableInstrument();
    if (!inst) return;
    whenRunning(() => {
      stopLive(midi);
      sustainedNotes.delete(midi);
      liveNodes.set(midi, inst.play(midi, audioCtx.currentTime, { gain: velocityGain(velocity2) }));
    });
  }
  function liveNoteOff(midi) {
    if (pedalDown) {
      if (liveNodes.has(midi)) sustainedNotes.add(midi);
      return;
    }
    stopLive(midi);
  }
  function setSustain(down) {
    pedalDown = down;
    if (down) return;
    sustainedNotes.forEach(stopLive);
    sustainedNotes.clear();
  }

  // src/output/midi-out.ts
  var PREVIEW_VELOCITY = 90;
  var preferred = loadJSON("midi-out", null) ?? {};
  var channel = loadNumber("midi-out-channel", 1, 1, 16);
  var thru = loadBool("midi-out-thru", false);
  var sounding2 = /* @__PURE__ */ new Set();
  var previewNotes = [];
  var previewTimer = null;
  var pedalDown2 = false;
  function getOutputs() {
    const access = getMidiAccess();
    if (!access) return [];
    return Array.from(access.outputs.values()).filter((o) => o.state !== "disconnected").map((o) => ({ id: o.id, name: o.name ?? o.id }));
  }
  function currentOutput() {
    const access = getMidiAccess();
    if (!access || !preferred.name) return null;
    const outs = Array.from(access.outputs.values()).filter((o) => o.state !== "disconnected" && o.name === preferred.name);
    return outs.find((o) => o.id === preferred.id) ?? outs[0] ?? null;
  }
  function outputLoops() {
    const input = getSelectedInputName();
    return !!preferred.name && !!input && preferred.name === input;
  }
  function send(bytes) {
    if (outputLoops()) return;
    try {
      currentOutput()?.send(bytes);
    } catch {
    }
  }
  var status = (kind) => kind | channel - 1;
  function noteOn(note, velocity2) {
    send([status(144), note, Math.max(1, Math.min(127, velocity2))]);
    sounding2.add(note);
  }
  function noteOff(note) {
    send([status(128), note, 0]);
    sounding2.delete(note);
  }
  function allNotesOff() {
    if (previewTimer) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
    previewNotes = [];
    if (pedalDown2) {
      send([status(176), 64, 0]);
      pedalDown2 = false;
    }
    for (const n of [...sounding2]) noteOff(n);
    send([status(176), 123, 0]);
  }
  function outLiveOn(note, velocity2, source) {
    if (source === "controller" && !thru) return;
    if (previewNotes.includes(note)) previewNotes = previewNotes.filter((n) => n !== note);
    noteOn(note, velocity2);
  }
  function outLiveOff(note, source) {
    if (source === "controller" && !thru) return;
    if (sounding2.has(note)) noteOff(note);
  }
  function outSustain(down, source) {
    if (source === "controller" && !thru) return;
    pedalDown2 = down;
    send([status(176), 64, down ? 127 : 0]);
  }
  function outPreview(notes, seconds, cut) {
    if (!notes.length) return;
    if (cut) {
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
      for (const n of previewNotes) if (sounding2.has(n)) noteOff(n);
      previewNotes = [];
    }
    for (const n of notes) {
      if (sounding2.has(n)) noteOff(n);
      noteOn(n, PREVIEW_VELOCITY);
    }
    const these = notes;
    previewNotes = [.../* @__PURE__ */ new Set([...previewNotes, ...notes])];
    const end = () => {
      for (const n of these) if (previewNotes.includes(n) && sounding2.has(n)) noteOff(n);
      previewNotes = previewNotes.filter((n) => !these.includes(n));
    };
    if (cut) previewTimer = setTimeout(() => {
      previewTimer = null;
      end();
    }, seconds * 1e3);
    else setTimeout(end, seconds * 1e3);
  }
  function getOutputSettings() {
    return { port: preferred.name ? { id: preferred.id ?? "", name: preferred.name } : null, channel, thru };
  }
  function chooseOutput(id) {
    allNotesOff();
    const port = id ? getOutputs().find((o) => o.id === id) ?? null : null;
    preferred = port ?? {};
    save("midi-out", port);
  }
  function setOutputChannel(ch) {
    allNotesOff();
    channel = Math.min(16, Math.max(1, Math.round(ch)));
    save("midi-out-channel", channel);
  }
  function setThru(on) {
    if (!on) allNotesOff();
    thru = on;
    save("midi-out-thru", thru);
  }
  if (typeof window !== "undefined") window.addEventListener("pagehide", () => allNotesOff());

  // src/diagrams/staff.ts
  var STAFF_CLEFS = ["grand", "treble", "bass"];
  var LETTERS = "CDEFGAB";
  function parseNotes(noteNames, accidentals) {
    return noteNames.flatMap((n) => {
      const m = n.match(/^([A-G])(#{0,2}|b{0,2})(-?\d+)$/);
      if (!m) return [];
      const [, letter, acc, octStr] = m;
      const keyAcc = accidentals[letter] ?? "";
      const mark = acc === keyAcc ? "" : acc ? acc.replace(/#/g, "^").replace(/b/g, "_") : "=";
      const oct = parseInt(octStr);
      const pitch = oct >= 5 ? letter.toLowerCase() + "'".repeat(oct - 5) : oct === 4 ? letter : letter + ",".repeat(4 - oct);
      return [{ mark, pitch, step: oct * 7 + LETTERS.indexOf(letter) }];
    });
  }
  var chordOf = (notes) => `[${notes.map((n) => n.mark + n.pitch).join("")}]1`;
  var MIDDLE_C = 4 * 7;
  function buildStaffAbc(noteNames, keyStr, clef = "treble") {
    const { abcKey, accidentals } = keySignature(keyStr);
    const notes = parseNotes(noteNames, accidentals);
    if (clef !== "grand") {
      const header = `X:1
M:none
L:1
K:${abcKey}${clef === "bass" ? " clef=bass" : ""}
`;
      return header + (notes.length ? chordOf(notes) : "z");
    }
    const upper = notes.filter((n) => n.step >= MIDDLE_C);
    const lower = notes.filter((n) => n.step < MIDDLE_C);
    const empty = notes.length ? "x" : "z";
    return `X:1
M:none
L:1
%%staves {RH LH}
K:${abcKey}
V:RH clef=treble
${upper.length ? chordOf(upper) : empty}
V:LH clef=bass
${lower.length ? chordOf(lower) : empty}`;
  }
  function renderStaff(container, noteNames, width = 380, keyStr = null, scale = 2, clef = "treble") {
    ABCJS.renderAbc(container, buildStaffAbc(noteNames, keyStr, clef), { staffwidth: width - 20, scale });
  }

  // src/view/channel.ts
  var VIEW_NAMES = ["chord", "staff", "cof", "piano", "guitar"];
  var VIEW_BACKGROUNDS = { green: "#00ff00", magenta: "#ff00ff", black: "#000000", dark: "#1a1a2e" };
  var NAME = "modus-view";
  function open() {
    try {
      return new BroadcastChannel(NAME);
    } catch {
      return null;
    }
  }
  function createViewPublisher() {
    const channel2 = open();
    let current2 = null;
    let last2 = "";
    channel2?.addEventListener("message", (e) => {
      if (e.data?.type === "hello" && current2) channel2.postMessage({ type: "state", state: current2 });
    });
    return (state2) => {
      current2 = state2;
      const sig = JSON.stringify(state2);
      if (sig === last2) return;
      last2 = sig;
      channel2?.postMessage({ type: "state", state: state2 });
    };
  }
  function subscribeView(onState) {
    const channel2 = open();
    channel2?.addEventListener("message", (e) => {
      if (e.data?.type === "state") onState(e.data.state);
    });
    channel2?.postMessage({ type: "hello" });
  }
  function viewUrl(view, bg, base = location.href) {
    const url = new URL(base);
    url.search = new URLSearchParams({ view, bg }).toString();
    url.hash = "";
    return url.toString();
  }
  var VIEW_WINDOW = {
    chord: [640, 360],
    staff: [800, 420],
    cof: [520, 520],
    piano: [960, 300],
    guitar: [380, 460]
  };

  // src/diagrams/piano.ts
  function renderPiano(container, noteNames, chordSymbol, onPress) {
    const color2 = chordSymbol ? chordColor(chordSymbol) : neutralColor();
    const colors = noteNames.map(() => color2);
    container.innerHTML = Notae.renderPiano({
      name: "",
      keys: noteNames,
      colors,
      range: { from: "C2", to: "B5" }
    }, {
      pianoWhiteKeyColor: color("piano-white"),
      pianoWhiteKeyStrokeColor: color("piano-white-stroke"),
      pianoBlackKeyColor: color("piano-black"),
      pianoBlackKeyStrokeColor: color("piano-black-stroke"),
      stringLabelColor: color("piano-label"),
      pianoBlackKeyLabelColor: color("piano-black-label")
    });
    container.querySelectorAll("rect[data-note]").forEach((el) => {
      const midi = noteNameToMidi(el.dataset.note);
      if (midi === null) return;
      el.style.cursor = "pointer";
      el.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        onPress?.(midi);
      });
    });
  }

  // src/theory/voicings.ts
  var STANDARD_OPEN_MIDI = [40, 45, 50, 55, 59, 64];
  var MAX_SPAN = 3;
  var MIN_STRINGS = 4;
  var MAX_FRET_WITH_OPEN = 4;
  function tuningToMidi(names) {
    if (names.length !== STANDARD_OPEN_MIDI.length) return null;
    const midi = [];
    for (let i = 0; i < names.length; i++) {
      const pc = pitchClassOf(normalizeNoteName(names[i]) ?? "");
      if (pc === -1) return null;
      const ref = STANDARD_OPEN_MIDI[i];
      const below = ref - ((ref - pc) % 12 + 12) % 12;
      midi.push(ref - below <= 6 ? below : below + 12);
    }
    return midi;
  }
  function normalizeNoteName(name) {
    const m = name.trim().match(/^([a-gA-G])([#b]?)$/);
    return m ? m[1].toUpperCase() + m[2] : null;
  }
  function isPlayable(v, openMidi, bassPc) {
    const sounding3 = v.frets.map((f, i) => f >= 0 ? i : -1).filter((i) => i >= 0);
    if (sounding3.length < MIN_STRINGS) return false;
    if (sounding3[sounding3.length - 1] - sounding3[0] + 1 !== sounding3.length) return false;
    const lowest = openMidi[sounding3[0]] + v.frets[sounding3[0]];
    if (lowest % 12 !== bassPc) return false;
    const fretted = v.frets.filter((f) => f > 0);
    if (fretted.length === 0) return true;
    const lo = Math.min(...fretted), hi = Math.max(...fretted);
    if (hi - lo > MAX_SPAN) return false;
    if (v.frets.includes(0) && hi > MAX_FRET_WITH_OPEN) return false;
    if (fretted.length <= 4) return true;
    return fretted.filter((f) => f === lo).length >= 2 && fretted.filter((f) => f > lo).length <= 3;
  }
  function position(v) {
    const fretted = v.frets.filter((f) => f > 0);
    return fretted.length ? Math.min(...fretted) : 0;
  }
  function playableVoicings(voicings, openMidi, bassPc) {
    const seen = /* @__PURE__ */ new Set();
    const unique = voicings.filter((v) => {
      const k = v.frets.join(",");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const strings = (v) => v.frets.filter((f) => f >= 0).length;
    const byNeck = (a, b) => position(a) - position(b) || strings(b) - strings(a);
    const playable = unique.filter((v) => isPlayable(v, openMidi, bassPc));
    return (playable.length ? playable : unique).sort(byNeck);
  }

  // src/diagrams/fretboard-style.ts
  function fretboardColors() {
    return {
      chordNameColor: color("fret-text"),
      fretLabelColor: color("fret-label"),
      nutColor: color("fret-nut"),
      stringColor: color("fret-string"),
      fretColor: color("fret-wire"),
      dotColor: color("fret-dot"),
      barreColor: color("fret-dot"),
      dotTextColor: color("fret-dot-text"),
      indicatorColor: color("fret-label"),
      stringLabelColor: color("fret-label")
    };
  }

  // src/diagrams/guitar.ts
  var guitarControlsVisible = loadBool("panel-guitarControls", true);
  function setGuitarControlsVisible(v) {
    guitarControlsVisible = v;
  }
  var EMPTY_FRETBOARD = { name: "", frets: [null, null, null, null, null, null], tuning: ["E", "A", "D", "G", "B", "E"] };
  var guitarVoicingIdx = 0;
  var onVoicingChange = () => {
  };
  function getGuitarVoicingIndex() {
    return guitarVoicingIdx;
  }
  function setGuitarVoicingChange(cb) {
    onVoicingChange = cb;
  }
  var lastGuitarSymbol = null;
  var lastNoteNames = [];
  var guitarLabelMode = loadChoice("guitar-label-mode", ["none", "tuning", "notes"], "none");
  var guitarTuningKey = loadChoice("guitar-tuning", ["standard", "dropD", "openG", "custom"], "standard");
  var guitarTunerExpanded = false;
  var guitarSpacing = loadNumber("guitar-spacing", 19, 12, 32);
  var GUITAR_TUNINGS = {
    standard: { notae: ["E", "A", "D", "G", "B", "E"], label: "guitar.tuning.standard" },
    dropD: { notae: ["D", "A", "D", "G", "B", "E"], label: "guitar.tuning.dropD" },
    openG: { notae: ["D", "G", "D", "G", "B", "D"], label: "guitar.tuning.openG" }
  };
  function loadStringTuning() {
    const saved = loadJSON("guitar-string-tuning", null);
    if (Array.isArray(saved) && saved.length === 6 && saved.every((n) => typeof n === "string" && normalizeNoteName(n))) {
      return saved.map((n) => normalizeNoteName(n));
    }
    return [...GUITAR_TUNINGS[guitarTuningKey]?.notae ?? ["E", "A", "D", "G", "B", "E"]];
  }
  var guitarStringTuning = loadStringTuning();
  function detectPreset(notes) {
    const match = Object.entries(GUITAR_TUNINGS).find(([, t2]) => t2.notae.every((n, i) => n === notes[i]));
    return match ? match[0] : "custom";
  }
  function guitarStyle() {
    const sp = guitarSpacing;
    return {
      ...fretboardColors(),
      stringSpacing: sp,
      fretSpacing: Math.round(sp * 23 / 19),
      dotRadius: Math.max(5, Math.round(sp * 9 / 19)),
      fingerNumberSize: Math.max(6, Math.round(sp * 8 / 19)),
      showStringLabels: guitarLabelMode !== "none",
      ...guitarLabelMode !== "none" ? {
        stringLabelMode: guitarLabelMode,
        stringLabelPosition: "bottom"
      } : {}
    };
  }
  var FORK_ICON = `<svg width="11" height="13" viewBox="0 0 11 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="vertical-align:middle;display:inline-block">
  <path d="M3,7 L3,2 Q3,0.5 5.5,0.5 Q8,0.5 8,2 L8,7"/>
  <line x1="5.5" y1="7" x2="5.5" y2="12.5"/>
</svg>`;
  var NOTE_ICON = `<span class="note-icon">\u2669</span>`;
  function guitarControls(total, idx) {
    const btn = (action, label, active, tip) => `<button class="guitar-ctrl${active ? " active" : ""}" data-action="${action}" title="${tip}">${label}</button>`;
    const nav = total > 1 ? `
    <button class="guitar-nav" data-dir="-1" title="${t("guitar.prev")}">\u2039</button>
    <span class="guitar-voicing-count">${idx + 1}/${total}</span>
    <button class="guitar-nav" data-dir="1" title="${t("guitar.next")}">\u203A</button>` : "";
    const tunerRow = guitarTunerExpanded ? `
    <div class="tuner-row">
      ${guitarStringTuning.map(
      (note, i) => `<input class="guitar-string-input" data-string="${i}" value="${note}" title="${t("guitar.string", { n: 6 - i })}" maxlength="2">`
    ).join("")}
    </div>` : "";
    return `
    <div id="guitar-ctrl-wrap" style="display:${guitarControlsVisible ? "flex" : "none"}">
      <div class="guitar-ctrl-row">
        ${nav || '<span class="guitar-nav-placeholder">\u2014</span>'}
        <button class="guitar-size-btn guitar-ctrl" data-action="size-minus" title="${t("guitar.smaller")}">\u2212</button>
        <button class="guitar-size-btn guitar-ctrl" data-action="size-plus"  title="${t("guitar.larger")}">+</button>
      </div>
      <div class="guitar-ctrl-row-wrap">
        ${btn("label-none", t("guitar.labels.off"), guitarLabelMode === "none", t("guitar.labels.off.title"))}
        ${btn("label-tuning", FORK_ICON, guitarLabelMode === "tuning", t("guitar.labels.tuning.title"))}
        ${btn("label-notes", NOTE_ICON, guitarLabelMode === "notes", t("guitar.labels.notes.title"))}
        <select class="guitar-tuning-sel" title="${t("guitar.tuning.title")}">
          ${Object.entries(GUITAR_TUNINGS).map(
      ([k, tuning]) => `<option value="${k}" ${guitarTuningKey === k ? "selected" : ""}>${t(tuning.label)}</option>`
    ).join("")}
          <option value="custom" ${guitarTuningKey === "custom" ? "selected" : ""}>${t("guitar.tuning.custom")}</option>
        </select>
        ${btn("toggle-tuner", "\u270E", guitarTunerExpanded, t("guitar.tuner.title"))}
      </div>
      ${tunerRow}
    </div>`;
  }
  function wireGuitarControls(container) {
    container.querySelectorAll(".guitar-ctrl").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (action.startsWith("label-")) {
          guitarLabelMode = action.replace("label-", "");
          save("guitar-label-mode", guitarLabelMode);
        } else if (action === "toggle-tuner") {
          guitarTunerExpanded = !guitarTunerExpanded;
        } else if (action === "size-minus") {
          guitarSpacing = Math.max(12, guitarSpacing - 3);
          save("guitar-spacing", guitarSpacing);
        } else if (action === "size-plus") {
          guitarSpacing = Math.min(32, guitarSpacing + 3);
          save("guitar-spacing", guitarSpacing);
        }
        renderGuitar(container, lastGuitarSymbol, lastNoteNames);
      });
    });
    const sel = container.querySelector(".guitar-tuning-sel");
    if (sel) {
      sel.addEventListener("change", () => {
        const key = sel.value;
        guitarTuningKey = key;
        save("guitar-tuning", key);
        if (key !== "custom" && GUITAR_TUNINGS[key]) {
          guitarStringTuning = [...GUITAR_TUNINGS[key].notae];
          save("guitar-string-tuning", guitarStringTuning);
        }
        const sym = lastGuitarSymbol;
        guitarVoicingIdx = 0;
        lastGuitarSymbol = null;
        renderGuitar(container, sym, lastNoteNames);
      });
    }
    container.querySelectorAll(".guitar-string-input").forEach((input) => {
      input.addEventListener("change", () => {
        const i = parseInt(input.dataset.string);
        const val = normalizeNoteName(input.value);
        if (!val) {
          input.value = guitarStringTuning[i];
          input.classList.add("invalid");
          setTimeout(() => input.classList.remove("invalid"), 1200);
          return;
        }
        guitarStringTuning[i] = val;
        save("guitar-string-tuning", guitarStringTuning);
        guitarTuningKey = detectPreset(guitarStringTuning);
        save("guitar-tuning", guitarTuningKey);
        const sym = lastGuitarSymbol;
        const notes = [...lastNoteNames];
        guitarVoicingIdx = 0;
        lastGuitarSymbol = null;
        renderGuitar(container, sym, notes);
      });
    });
  }
  function renderGuitar(container, chordSymbol, noteNames = [], voicingIndex) {
    lastNoteNames = noteNames;
    if (!chordSymbol) {
      guitarVoicingIdx = 0;
      lastGuitarSymbol = null;
      try {
        const ph = { ...EMPTY_FRETBOARD, tuning: guitarStringTuning };
        container.innerHTML = `<div class="guitar-placeholder">${Notae.renderFretboard(ph, guitarStyle())}</div>` + guitarControls(0, 0);
      } catch {
        container.innerHTML = guitarControls(0, 0);
      }
      wireGuitarControls(container);
      return;
    }
    if (chordSymbol !== lastGuitarSymbol) {
      guitarVoicingIdx = 0;
      lastGuitarSymbol = chordSymbol;
    }
    if (voicingIndex !== void 0) guitarVoicingIdx = voicingIndex;
    const openMidi = tuningToMidi(guitarStringTuning) ?? tuningToMidi(GUITAR_TUNINGS.standard.notae);
    const umtTuning = openMidi.map((m) => m - 69);
    const chord = tryParseChord(chordSymbol);
    const bassPc = chord ? (((chord.bassStep ?? chord.rootStep) + 9) % 12 + 12) % 12 : 0;
    const voicings = chord ? playableVoicings(tryUMT("fretboard voicings", () => UMT.getFretboardVoicings(chord, umtTuning) ?? [], []), openMidi, bassPc) : [];
    if (!voicings.length) {
      container.innerHTML = `<div class="no-voicing">${t("guitar.none")}</div>` + guitarControls(0, 0);
      wireGuitarControls(container);
      return;
    }
    const total = voicings.length;
    const idx = Math.min(guitarVoicingIdx, total - 1);
    let svg = "";
    try {
      svg = Notae.renderFretboard(
        { name: chordLabel(chordSymbol), ...voicings[idx], tuning: guitarStringTuning },
        guitarStyle()
      );
    } catch {
    }
    container.innerHTML = `<div>${svg}</div>` + guitarControls(total, idx);
    localizeDrawnNoteNames(container.firstElementChild);
    container.querySelectorAll(".guitar-nav").forEach((btn) => {
      btn.addEventListener("click", () => {
        guitarVoicingIdx = (idx + parseInt(btn.dataset.dir) + total) % total;
        renderGuitar(container, lastGuitarSymbol, lastNoteNames);
        onVoicingChange(guitarVoicingIdx);
      });
    });
    wireGuitarControls(container);
  }

  // src/diagrams/cof.ts
  var CIRCLE_KEYS_FLAT = ["C", "G", "D", "A", "E", "B", "Gb", "Db", "Ab", "Eb", "Bb", "F"];
  var CIRCLE_KEYS_SHARP = ["C", "G", "D", "A", "E", "B", "F#", "C#", "Ab", "Eb", "Bb", "F"];
  var CIRCLE_KEYS_MINOR_FLAT = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm"];
  var CIRCLE_KEYS_MINOR_SHARP = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m", "Fm", "Cm", "Gm", "Dm"];
  var CIRCLE_DIM = ["B", "F#", "C#", "G#", "D#", "A#", "F", "C", "G", "D", "A", "E"];
  var pitchClass = pitchClassOf;
  var rootOf = (symbol) => symbol.match(/^([A-G][b#]*)/)?.[1] ?? "";
  function cofAccidentalFor(key, chosen) {
    return key ? keyPrefersSharps(key) ? "sharp" : "flat" : chosen;
  }
  function renderCircleOfFifths(container, activeKey, activeChord, onSegmentClick, size = 160, opts = { accidental: "flat", showMinor: true, showDegrees: false, show7ths: false }) {
    const keys = opts.accidental === "sharp" ? CIRCLE_KEYS_SHARP : CIRCLE_KEYS_FLAT;
    const minorKeys = opts.accidental === "sharp" ? CIRCLE_KEYS_MINOR_SHARP : CIRCLE_KEYS_MINOR_FLAT;
    const [keyRoot, keyMode] = activeKey?.split(" ") ?? [];
    const keyIsMinor = keyMode?.toLowerCase() === "minor";
    const tonicPc = keyRoot ? pitchClass(keyRoot) : -1;
    const activePos = tonicPc === -1 ? -1 : keyIsMinor ? minorKeys.findIndex((m) => pitchClass(rootOf(m)) === tonicPc) : keys.findIndex((k) => pitchClass(k) === tonicPc);
    const degreeOf = (chord) => (romanInKey(chord, activeKey)?.degree ?? "").replace(/^([b#]+)/, (acc) => acc.replace(/b/g, "\u266D").replace(/#/g, "\u266F"));
    const chordRootPc = activeChord ? pitchClass(rootOf(activeChord)) : -1;
    const isDimActiveChord = activeChord ? /^[A-G][b#]*(dim|°|m7b5|ø)/.test(activeChord) : false;
    const isMinorActiveChord = !isDimActiveChord && activeChord ? /^[A-G][b#]*m(?!aj)/.test(activeChord) : false;
    const cx = size / 2, cy = size / 2;
    const outerR = size * 0.425;
    const innerR = size * 0.275;
    const labelR = size * 0.356;
    const minorOutR = size * 0.265;
    const minorInR = size * 0.165;
    const minorR = size * 0.21;
    const dimOutR = size * 0.155;
    const dimInR = size * 0.065;
    const dimLabR = size * 0.11;
    const fs = opts.fontScale ?? 0.55;
    const majorFont = Math.max(4, Math.round(size * 0.0625 * fs));
    const minorFont = Math.max(3, Math.round(size * 0.05 * fs));
    const dimFont = Math.max(3, Math.round(size * 0.04 * fs));
    const ring = (rOut, rIn, a1, a2) => {
      const p = (r, a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      return `M${p(rIn, a1)} L${p(rOut, a1)} A${rOut},${rOut} 0 0,1 ${p(rOut, a2)} L${p(rIn, a2)} A${rIn},${rIn} 0 0,0 ${p(rIn, a1)}`;
    };
    const label = (x, y, font, fill, main, sub, subFill) => sub ? `<text x="${x}" y="${y - font * 0.5}" text-anchor="middle" dominant-baseline="middle" font-size="${font}" fill="${fill}" pointer-events="none">${main}</text><text x="${x}" y="${y + font * 0.72}" text-anchor="middle" dominant-baseline="middle" font-size="${font * 0.85}" fill="${subFill}" pointer-events="none">${sub}</text>` : `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${font}" fill="${fill}" pointer-events="none">${main}</text>`;
    const TIP = t("cof.segment.tip");
    const diatonicPos = activePos !== -1 ? /* @__PURE__ */ new Set([(activePos + 11) % 12, activePos, (activePos + 1) % 12]) : /* @__PURE__ */ new Set();
    const c = {
      tonic: color("cof-tonic"),
      chord: color("cof-chord"),
      diatonic: color("cof-diatonic"),
      diatonicStroke: color("cof-diatonic-stroke"),
      segment: color("cof-segment"),
      stroke: color("cof-stroke"),
      dimDiatonic: color("cof-dim-diatonic"),
      dimDiatonicStroke: color("cof-dim-diatonic-stroke"),
      dim: color("cof-dim"),
      dimStroke: color("cof-dim-stroke"),
      label: color("cof-label"),
      onMark: color("cof-label-on-mark"),
      minorLabel: color("cof-minor-label"),
      minorDiatonicLabel: color("cof-minor-diatonic-label"),
      dimLabel: color("cof-dim-label"),
      dimDiatonicLabel: color("cof-dim-diatonic-label"),
      degree: color("cof-degree"),
      degreeSmall: color("cof-degree-small")
    };
    let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">`;
    if (opts.backdrop) svg += `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.43}" fill="${opts.backdrop}"/>`;
    keys.forEach((key, i) => {
      const angle = (i * 30 - 90) * Math.PI / 180;
      const nextAngle = ((i + 1) * 30 - 90) * Math.PI / 180;
      const midAngle = (i * 30 + 15 - 90) * Math.PI / 180;
      const relPos = activePos !== -1 ? (i - activePos + 12) % 12 : -1;
      const isDiatonic = diatonicPos.has(i);
      const showDeg = opts.showDegrees && activePos !== -1;
      const isTonic = activePos === i && !keyIsMinor;
      const isChordRoot = !isMinorActiveChord && !isDimActiveChord && chordRootPc === pitchClass(key);
      const fill = isTonic ? c.tonic : isChordRoot ? c.chord : isDiatonic ? c.diatonic : c.segment;
      const stroke = isChordRoot ? c.chord : isDiatonic ? c.diatonicStroke : c.stroke;
      const suffix7 = opts.show7ths ? relPos === 1 ? "7" : "maj7" : "";
      svg += `<path d="${ring(outerR, innerR, angle, nextAngle)}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor:pointer"
      data-chord="${key + suffix7}" data-key="${key} Major"><title>${TIP}</title></path>`;
      svg += label(
        cx + labelR * Math.cos(midAngle),
        cy + labelR * Math.sin(midAngle),
        majorFont,
        isTonic || isChordRoot ? c.onMark : c.label,
        chordLabel(key + suffix7),
        showDeg ? degreeOf(key) : null,
        isTonic || isChordRoot ? c.onMark : c.degree
      );
      if (!opts.showMinor) return;
      const minorRoot = rootOf(minorKeys[i]);
      const isMinorTonic = activePos === i && keyIsMinor;
      const isMinorChordHere = isMinorActiveChord && chordRootPc === pitchClass(minorRoot);
      const minorChord = minorKeys[i] + (opts.show7ths ? "7" : "");
      const minorSegFill = isMinorTonic ? c.tonic : isMinorChordHere ? c.chord : isDiatonic ? c.diatonic : "transparent";
      const minorSegStroke = isMinorTonic ? c.tonic : isMinorChordHere ? c.chord : isDiatonic ? c.diatonicStroke : "transparent";
      svg += `<path d="${ring(minorOutR, minorInR, angle, nextAngle)}" fill="${minorSegFill}" stroke="${minorSegStroke}" stroke-width="1"
      pointer-events="all" style="cursor:pointer" data-chord="${minorChord}" data-key="${minorRoot} Minor"><title>${TIP}</title></path>`;
      const minorFill = isMinorTonic || isMinorChordHere ? c.onMark : isDiatonic ? c.minorDiatonicLabel : c.minorLabel;
      svg += label(
        cx + minorR * Math.cos(midAngle),
        cy + minorR * Math.sin(midAngle),
        minorFont,
        minorFill,
        chordLabel(minorChord),
        showDeg ? degreeOf(minorKeys[i]) : null,
        isMinorTonic || isMinorChordHere ? c.onMark : c.degreeSmall
      );
      const dimRoot = CIRCLE_DIM[i];
      const isDiatonicDim = i === activePos;
      const isDimChordHere = isDimActiveChord && chordRootPc === pitchClass(dimRoot);
      const dimChord = `${dimRoot}${opts.show7ths ? "m7b5" : "dim"}`;
      svg += `<path d="${ring(dimOutR, dimInR, angle, nextAngle)}"
      fill="${isDimChordHere ? c.chord : isDiatonicDim ? c.dimDiatonic : c.dim}" stroke="${isDiatonicDim ? c.dimDiatonicStroke : c.dimStroke}" stroke-width="${isDiatonicDim ? 1.5 : 1}"
      pointer-events="all" style="cursor:pointer" data-chord="${dimChord}"><title>${t("cof.segment.play")}</title></path>`;
      const dimText = `${noteLabel(dimRoot)}${opts.show7ths ? "\xF87" : "\xB0"}`;
      svg += label(
        cx + dimLabR * Math.cos(midAngle),
        cy + dimLabR * Math.sin(midAngle),
        dimFont,
        isDimChordHere ? c.onMark : isDiatonicDim ? c.dimDiatonicLabel : c.dimLabel,
        dimText,
        showDeg ? degreeOf(`${dimRoot}dim`) : null,
        isDimChordHere ? c.onMark : c.degreeSmall
      );
    });
    svg += "</svg>";
    container.innerHTML = svg;
    container.querySelectorAll("[data-chord]").forEach((el) => {
      el.addEventListener("click", () => onSegmentClick(el.dataset.chord, el.dataset.key ?? null));
    });
  }

  // src/ui/html.ts
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // src/view/viewer.ts
  function fitSvg(svg) {
    if (!svg) return;
    if (!svg.getAttribute("viewBox")) {
      const w = parseFloat(svg.getAttribute("width") ?? ""), h = parseFloat(svg.getAttribute("height") ?? "");
      if (w > 0 && h > 0) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width = "100%";
    svg.style.height = "100%";
  }
  function cofOptions(key) {
    return {
      accidental: cofAccidentalFor(key, loadChoice("cof-accidental", ["flat", "sharp"], "flat")),
      showMinor: loadBool("cof-show-minor", true),
      showDegrees: loadBool("cof-show-degrees", false),
      show7ths: loadBool("cof-show-7ths", false)
    };
  }
  function renderChordView(el, s) {
    if (!s.label) {
      el.innerHTML = "";
      return;
    }
    const fill = s.symbol ? chordColor(s.symbol) : neutralColor();
    const detail = s.kind === "chord" && s.roman && s.roman !== "?" ? [s.roman, s.function && s.function !== "unknown" ? t(`fn.${s.function}`) : null].filter(Boolean).join(" \xB7 ") : "";
    el.innerHTML = `
    <div class="view-chord-name" style="color:${fill}">${escapeHtml(s.label)}</div>
    ${detail ? `<div class="view-chord-detail">${escapeHtml(detail)}</div>` : ""}`;
  }
  function renderView(view, el, s) {
    if (view === "chord") return renderChordView(el, s);
    if (view === "staff") {
      el.innerHTML = "<div></div>";
      const inner = el.firstElementChild;
      renderStaff(inner, s.notes, 200, s.key, 1, loadChoice("staff-clef", STAFF_CLEFS, "grand"));
      inner.style.height = "100%";
      inner.style.width = "100%";
    } else if (view === "cof") renderCircleOfFifths(el, s.key, s.symbol, () => {
    }, 400, { ...cofOptions(s.key), backdrop: color("bg") });
    else if (view === "piano") renderPiano(el, s.notes, s.symbol);
    else if (view === "guitar") renderGuitar(el, s.symbol, s.notes, s.guitarVoicing);
    fitSvg(el.querySelector("svg"));
  }
  function runViewerFromUrl() {
    const params = new URLSearchParams(location.search);
    const view = params.get("view");
    if (!view || !VIEW_NAMES.includes(view)) return false;
    const bg = params.get("bg") ?? "green";
    const background = VIEW_BACKGROUNDS[bg] ?? VIEW_BACKGROUNDS.green;
    document.title = `Modus view: ${view}`;
    applyDocumentLang();
    applyTheme("dark");
    document.body.classList.add("view-mode");
    document.body.style.background = background;
    document.getElementById("app").style.display = "none";
    const el = document.createElement("div");
    el.id = "view-content";
    el.className = `view-${view}`;
    document.body.appendChild(el);
    subscribeView((s) => renderView(view, el, s));
    window.addEventListener("storage", (e) => {
      if (e.key && /^(guitar-|cof-|staff-clef|lang$|note-names$)/.test(e.key)) location.reload();
    });
    return true;
  }

  // src/view/presentation.ts
  var overlay = null;
  var tiles = [];
  var last = "";
  var onClose = () => {
  };
  function isPresenting() {
    return overlay !== null;
  }
  function openPresentation(views, state2, close) {
    if (overlay) return;
    onClose = close;
    overlay = document.createElement("div");
    overlay.id = "presentation";
    const diagrams = views.filter((v) => v !== "chord" && v !== "piano");
    overlay.innerHTML = `
    <button class="presentation-close" title="${t("present.close")}">\xD7</button>
    <div class="pres-tile pres-chord view-chord" data-view="chord"></div>
    ${diagrams.length ? `<div class="pres-row">${diagrams.map((v) => `<div class="pres-tile view-${v}" data-view="${v}"></div>`).join("")}</div>` : ""}
    ${views.includes("piano") ? '<div class="pres-tile pres-piano view-piano" data-view="piano"></div>' : ""}`;
    document.body.appendChild(overlay);
    document.body.classList.add("presenting");
    tiles = Array.from(overlay.querySelectorAll(".pres-tile")).map((el) => ({ view: el.dataset.view, el }));
    overlay.querySelector(".presentation-close").addEventListener("click", closePresentation);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.documentElement.requestFullscreen?.().catch(() => {
    });
    last = "";
    updatePresentation(state2);
  }
  function updatePresentation(state2) {
    if (!overlay) return;
    const sig = JSON.stringify(state2);
    if (sig === last) return;
    last = sig;
    for (const { view, el } of tiles) renderView(view, el, state2);
  }
  function closePresentation() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    tiles = [];
    document.body.classList.remove("presenting");
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {
    });
    onClose();
  }
  function onFullscreenChange() {
    if (!document.fullscreenElement) closePresentation();
  }

  // src/diagrams/velocity.ts
  function renderVelocity(container, notes) {
    if (!notes.length) {
      container.innerHTML = `<div class="vel-empty">${escapeHtml(t("velocity.empty"))}</div>`;
      return;
    }
    const sorted = [...notes].sort((a, b) => b.midi - a.midi);
    container.innerHTML = sorted.map((n) => `
    <div class="vel-row" title="${escapeHtml(t("velocity.bar", { note: noteLabel(n.name), v: n.velocity }))}">
      <span class="vel-note">${escapeHtml(noteLabel(n.name))}</span>
      <span class="vel-bar"><span style="width:${(n.velocity / 127 * 100).toFixed(1)}%"></span></span>
      <span class="vel-num">${n.velocity}</span>
    </div>`).join("");
  }

  // src/ui/export.ts
  var CONTAINERS = {
    staff: "#staff-container",
    cof: "#cof-container",
    guitar: "#guitar-container",
    piano: "#piano-container"
  };
  var PAD = 4;
  function diagramSvg(target) {
    const source = document.querySelector(`${CONTAINERS[target]} svg`);
    if (!source) return null;
    const bb = source.getBBox();
    if (!bb.width || !bb.height) return null;
    const rect = source.getBoundingClientRect();
    const vb = source.viewBox.baseVal;
    const units = vb && vb.width ? vb.width : parseFloat(source.getAttribute("width") ?? "") || rect.width;
    const screenScale = rect.width / units || 1;
    const x = bb.x - PAD, y = bb.y - PAD, w = bb.width + 2 * PAD, h = bb.height + 2 * PAD;
    const copy = source.cloneNode(true);
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.removeAttribute("style");
    if (target === "cof" && vb?.width) {
      const disc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      disc.setAttribute("cx", String(vb.width / 2));
      disc.setAttribute("cy", String(vb.height / 2));
      disc.setAttribute("r", String(vb.width * 0.43));
      disc.setAttribute("fill", getComputedStyle(document.body).backgroundColor);
      copy.insertBefore(disc, copy.firstChild);
    }
    copy.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    const width = Math.round(w * screenScale), height = Math.round(h * screenScale);
    copy.setAttribute("width", String(width));
    copy.setAttribute("height", String(height));
    copy.style.color = getComputedStyle(source).color;
    copy.style.fontFamily = getComputedStyle(source).fontFamily;
    return { svg: new XMLSerializer().serializeToString(copy), width, height };
  }
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  }
  var fileName = (target, label, ext) => `modus-${target}${label ? "-" + label.replace(/[^\w#-]+/g, "_") : ""}.${ext}`;
  async function exportDiagram(target, format, label, scale = 3) {
    const d = diagramSvg(target);
    if (!d) return false;
    const svgBlob = new Blob([d.svg], { type: "image/svg+xml" });
    if (format === "svg") {
      download(svgBlob, fileName(target, label, "svg"));
      return true;
    }
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = d.width * scale;
      canvas.height = d.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const png = await new Promise((r) => canvas.toBlob(r, "image/png"));
      if (!png) return false;
      download(png, fileName(target, label, "png"));
      return true;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // src/diagrams/neck.ts
  var OPEN_MIDI = [40, 45, 50, 55, 59, 64];
  var NECK_FRETS = 12;
  var neckSpacing = loadNumber("neck-spacing", 16, 10, 28);
  function adjustNeckSpacing(delta) {
    neckSpacing = Math.min(28, Math.max(10, neckSpacing + delta));
    save("neck-spacing", neckSpacing);
  }
  function renderNeck(container, noteNames, preferFlats = true) {
    const midi = noteNames.map(noteNameToMidi).filter((n) => n !== null);
    const frets = OPEN_MIDI.map((open2) => {
      const pos = midi.map((n) => n - open2).filter((f) => f >= 0 && f <= NECK_FRETS);
      return pos.length ? pos : [null];
    });
    const sp = neckSpacing;
    const style = {
      ...fretboardColors(),
      numFrets: NECK_FRETS,
      dotColor: color("neck-dot"),
      chordNameSize: 0,
      chordNameY: 4,
      chordNameGapH: 4,
      stringSpacing: sp,
      fretSpacing: Math.round(sp * 28 / 16),
      dotRadius: Math.max(4, Math.round(sp * 7 / 16)),
      fingerNumberSize: Math.max(5, Math.round(sp * 7 / 16)),
      showNoteNames: true,
      preferFlats
    };
    try {
      container.innerHTML = Notae.renderFretboard(
        { name: "", frets, tuning: ["E", "A", "D", "G", "B", "E"] },
        { ...style, orientation: "horizontal" }
      );
      localizeDrawnNoteNames(container);
    } catch {
      container.innerHTML = "";
    }
  }

  // src/theory/spelling.ts
  var A4 = 69;
  function spellMidi(midi, key) {
    return tryUMT("spelling", () => UMT.spellPitchInKey(midi - A4, key), "") || "";
  }
  function spellName(name, key) {
    const midi = noteNameToMidi(name);
    return midi === null ? name : spellMidi(midi, key) || name;
  }
  function spellPitchClassInKey(name, key) {
    const pc = pitchClassOf(name);
    return pc === -1 ? name : spellMidi(60 + pc, key).replace(/-?\d+$/, "") || name;
  }
  function spellChordSymbol(symbol, key) {
    if (!key || symbol === "?") return symbol;
    const chord = tryParseChord(symbol);
    return chord ? tryUMT("chord spelling", () => UMT.spellChordInKey(chord, key).name, symbol) : symbol;
  }
  function spellVoicing(names, symbol, key) {
    const chord = symbol ? tryParseChord(symbol) : null;
    const toneByPc = /* @__PURE__ */ new Map();
    if (chord) {
      for (const t2 of tryUMT("chord tones", () => UMT.spellChord(chord), [])) {
        const base = t2.replace(/-?\d+$/, "");
        toneByPc.set(pitchClassOf(base), base);
      }
    }
    return names.map((n) => {
      const midi = noteNameToMidi(n);
      if (midi === null) return n;
      const tone = toneByPc.get(midi % 12);
      return (tone && nameAtMidi(tone, midi)) ?? (key ? spellName(n, key) : n);
    });
  }
  function spellDetection(d, key) {
    if (!d || !key) return d;
    if (d.kind === "note") {
      const noteName = spellName(d.noteName, key);
      return { ...d, noteName, pitchClass: noteName.replace(/-?\d+$/, "") };
    }
    if (d.kind === "interval") return { ...d, notes: d.notes.map((n) => spellName(n, key)) };
    const candidates = d.candidates.map((c) => spellChordSymbol(c, key));
    const selected = candidates[d.selectedIndex];
    return { ...d, candidates, notes: spellVoicing(d.notes, selected === "?" ? null : selected, key) };
  }

  // src/theory/key-map.ts
  function keyChord(symbol, key) {
    const a = romanInKey(symbol, key);
    const secondary = a && a.roman !== a.degree ? a.roman : void 0;
    return { symbol, roman: a?.degree ?? "?", secondary, function: a?.function ?? "unknown" };
  }
  var cache2 = /* @__PURE__ */ new Map();
  function buildKeyMap(key, sevenths) {
    const cacheKey = `${key}|${sevenths}`;
    if (cache2.has(cacheKey)) return cache2.get(cacheKey);
    const chords = tryUMT("diatonic chords", () => UMT.parseScaleSymbol(key).getDiatonicChords(sevenths ? "seventh" : "triad"), []);
    if (!chords.length) {
      cache2.set(cacheKey, null);
      return null;
    }
    const diatonic = chords.map((c) => keyChord(c.name, key));
    if (/ minor$/i.test(key)) {
      const harmonic = tryUMT(
        "diatonic chords",
        () => UMT.parseScaleSymbol(key.replace(/ minor$/i, " Harmonic Minor")).getDiatonicChords(sevenths ? "seventh" : "triad"),
        []
      );
      harmonic.forEach((c, i) => {
        if (!diatonic[i] || c.name === diatonic[i].symbol) return;
        if (romanInKey(c.name, key)?.isDiatonic) diatonic[i].alternative = keyChord(c.name, key);
      });
    }
    const negative = chords.map((c) => tryUMT("negative harmony", () => {
      const name = UMT.Harmony.getNegativeHarmony(c, key)?.name;
      return name ? spellChordSymbol(name, key) : null;
    }, null));
    const byMode = /* @__PURE__ */ new Map();
    for (const b of tryUMT("borrowed chords", () => UMT.Harmony.getBorrowedChords(key, { type: sevenths ? "seventh" : "triad" }), [])) {
      const name = b.chord?.name;
      if (!name || !tryParseChord(name)) continue;
      let row = byMode.get(b.sourceMode);
      if (!row) byMode.set(b.sourceMode, row = { mode: b.sourceMode, brightness: b.brightness ?? 0, chords: [] });
      row.chords.push({ ...keyChord(name, key), characteristic: !!b.characteristic });
    }
    const parallel = [...byMode.values()].sort((a, b) => b.brightness - a.brightness);
    const axis = tryUMT("coltrane axis", () => UMT.Harmony.getColtraneAxis(key).majorThirds, null);
    const coltraneAxis = axis ? axis.map((n) => spellPitchClassInKey(n, key)) : null;
    const map = { key, diatonic, negative, parallel, coltraneAxis };
    cache2.set(cacheKey, map);
    return map;
  }
  function sameChord(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const ca = tryParseChord(a), cb = tryParseChord(b);
    if (!ca || !cb) return false;
    const pc = (s) => s === void 0 ? -1 : (s % 12 + 12) % 12;
    return pc(ca.rootStep) === pc(cb.rootStep) && (ca.intervalsInSteps ?? []).join() === (cb.intervalsInSteps ?? []).join() && pc(ca.bassStep) === pc(cb.bassStep);
  }

  // src/diagrams/key-explorer.ts
  var functionName = (fn) => fn === "unknown" ? t("fn.unknownLong") : t(`fn.${fn}`);
  var describe = (c) => [c.roman, c.secondary && t("keyPanel.also", { roman: c.secondary }), functionName(c.function)].filter(Boolean).join(" \xB7 ");
  function renderKeyExplorer(container, map, keyLabel2, activeChord, onChordClick, opts) {
    container.style.fontSize = opts.fontScale + "px";
    if (!map) {
      container.innerHTML = `<div class="key-empty">${escapeHtml(t("keyPanel.empty"))}</div>`;
      return;
    }
    const button = (symbol, cls, title) => `<button class="key-chord ${cls}${sameChord(symbol, activeChord) ? " active" : ""}" data-chord="${escapeHtml(symbol)}"
      title="${escapeHtml(title)}" style="border-left-color:${chordColor(symbol)}">${escapeHtml(chordLabel(symbol))}</button>`;
    const cell = (c) => `
    <div class="key-cell">
      <span class="key-roman">${escapeHtml(c.roman)}</span>
      ${button(c.symbol, "", describe(c))}
      ${c.alternative ? button(c.alternative.symbol, "key-alt", `${describe(c.alternative)} \xB7 ${t("keyPanel.harmonicMinor")}`) : ""}
      <span class="key-function key-fn-${c.function}" title="${functionName(c.function)}">${c.function === "unknown" ? "\xB7" : c.function}</span>
    </div>`;
    let html = `<div class="key-main"><div class="key-title">${escapeHtml(keyLabel2)}</div>`;
    html += `<div class="key-grid">${map.diatonic.map(cell).join("")}</div>`;
    if (opts.showNegative) {
      html += `<div class="key-section-label" title="${t("keyPanel.negative.title")}">${t("keyPanel.negative")}</div>
      <div class="key-grid">${map.negative.map(
        (n, i) => `<div class="key-cell">${n ? button(n, "", t("keyPanel.negativeOf", { chord: chordLabel(map.diatonic[i].symbol) })) : '<span class="key-roman">\u2014</span>'}</div>`
      ).join("")}</div>`;
    }
    if (opts.showColtrane && map.coltraneAxis) {
      html += `<div class="key-axis" title="${t("keyPanel.coltrane.title")}">
      <span class="key-section-label">${t("keyPanel.coltrane")}</span> ${map.coltraneAxis.map((n) => escapeHtml(noteLabel(n))).join(" \xB7 ")}</div>`;
    }
    html += "</div>";
    if (opts.showParallel && map.parallel.length) {
      html += `<div class="key-parallel"><div class="key-section-label" title="${t("keyPanel.parallel.title")}">${t("keyPanel.parallel")}</div><div class="key-mode-grid">`;
      html += map.parallel.map((row) => `
      <div class="key-mode-row">
        <span class="key-mode-name">${escapeHtml(row.mode)}</span>
        <div class="key-mode-chords">${row.chords.map((c) => `
          <span class="key-mode-chord">
            <span class="key-roman">${escapeHtml(c.roman)}</span>
            ${button(c.symbol, c.characteristic ? "key-characteristic" : "", [describe(c), t("keyPanel.from", { mode: row.mode }), c.characteristic ? t("keyPanel.characteristic") : ""].filter(Boolean).join(" \xB7 "))}
          </span>`).join("")}
        </div>
      </div>`).join("") + "</div></div>";
    }
    container.innerHTML = html;
    container.querySelectorAll(".key-chord").forEach((btn) => {
      btn.addEventListener("click", () => onChordClick(btn.dataset.chord));
    });
  }

  // src/ui/undo.ts
  var UNDO_MS = 5e3;
  var current = null;
  function dismiss() {
    if (!current) return;
    clearTimeout(current.timer);
    current.el.remove();
    current = null;
  }
  function showUndo(message, undo) {
    dismiss();
    const el = document.createElement("div");
    el.className = "undo-toast";
    el.innerHTML = `<span>${escapeHtml(message)}</span><button class="undo-btn">${escapeHtml(t("undo"))}</button>`;
    el.querySelector("button").addEventListener("click", () => {
      dismiss();
      undo();
    });
    document.body.appendChild(el);
    current = { el, timer: window.setTimeout(dismiss, UNDO_MS) };
  }

  // src/history/history.ts
  var MAX_ENTRIES = 200;
  var FUNCTION_COLORS = {
    "T": "var(--fn-t)",
    "S": "var(--fn-s)",
    "D": "var(--fn-d)",
    "unknown": "var(--text-dim)"
  };
  var entries = [];
  var debounceTimer = null;
  var lastAutoAppended = null;
  var onChange2 = () => {
  };
  function setHistoryChangeCallback(cb) {
    onChange2 = cb;
  }
  var CARRY_KEY = "modus-history-carry";
  function carryHistoryOverReload() {
    try {
      sessionStorage.setItem(CARRY_KEY, JSON.stringify(entries));
    } catch {
    }
  }
  function restoreCarriedHistory() {
    let carried = null;
    try {
      carried = JSON.parse(sessionStorage.getItem(CARRY_KEY) ?? "null");
      sessionStorage.removeItem(CARRY_KEY);
    } catch {
    }
    const list = Array.isArray(carried) ? carried : [];
    if (list.length && list.every((e) => e && typeof e.id === "string" && typeof e.symbol === "string" && Array.isArray(e.notes))) restoreEntries(list);
  }
  function addEntry(symbol, notes) {
    const entry = { id: crypto.randomUUID(), symbol, notes };
    entries = [entry, ...entries].slice(0, MAX_ENTRIES);
    onChange2(entries);
  }
  function removeEntry(id) {
    entries = entries.filter((e) => e.id !== id);
    lastAutoAppended = entries[0]?.symbol ?? null;
    onChange2(entries);
  }
  function restoreEntries(list) {
    entries = list.slice(0, MAX_ENTRIES);
    lastAutoAppended = entries[0]?.symbol ?? null;
    onChange2(entries);
  }
  function clearHistoryWithUndo() {
    if (!entries.length) return;
    const before = entries;
    clearHistory();
    showUndo(t("history.cleared", { n: before.length }), () => restoreEntries(before));
  }
  function clearHistory() {
    entries = [];
    lastAutoAppended = null;
    onChange2(entries);
  }
  function notifyChordDetected(symbol, notes) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (symbol !== lastAutoAppended && symbol !== "?") {
        addEntry(symbol, notes);
        lastAutoAppended = symbol;
      }
    }, 800);
  }
  function markActiveHistoryEntry(container, entryId) {
    container.querySelectorAll(".history-chip").forEach((el) => {
      el.classList.toggle("active-cursor", el.dataset.id === entryId);
    });
  }
  function renderHistory(container, activeKey, onChipClick, activeCursorEntryId) {
    const strip = document.createElement("div");
    strip.className = "history-strip";
    const shown = entries.map((e) => ({ ...e, symbol: spellChordSymbol(e.symbol, activeKey) }));
    const steps = analyzeChordProgression(shown.map((e) => e.symbol).reverse(), activeKey).reverse();
    shown.forEach((entry, i) => {
      const older = i + 1 < shown.length ? steps[i + 1] : null;
      const cadence = older?.cadence ?? null;
      const modulation = older && steps[i].key && steps[i].key !== older.key ? steps[i].key : null;
      const analysis = steps[i].info;
      const roman = analysis?.roman ?? "\u2014";
      const fn = analysis?.function ?? "unknown";
      const color2 = FUNCTION_COLORS[fn] ?? FUNCTION_COLORS.unknown;
      const chip = document.createElement("div");
      chip.className = "history-chip";
      chip.dataset.id = entry.id;
      chip.classList.toggle("active-cursor", activeCursorEntryId === entry.id);
      chip.style.borderLeft = `3px solid ${color2}`;
      chip.innerHTML = `
      <span class="history-chip-symbol">${escapeHtml(chordLabel(entry.symbol))}</span>
      <span class="history-chip-roman">${escapeHtml(roman)}</span>
    `;
      chip.addEventListener("click", () => {
        onChipClick(entry);
        if (entry.notes.length > 0) playNoteNames(entry.notes);
        else playChord(entry.symbol);
      });
      const inKey = steps[i].key ? ` (${t("history.chip.inKey", { roman, key: keyLabel(steps[i].key) })})` : "";
      chip.title = `${chordLabel(entry.symbol)}${inKey} \u2014 ${t("history.chip.actions")}`;
      chip.draggable = true;
      chip.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("application/x-history-chord", JSON.stringify({ id: entry.id, symbol: entry.symbol, notes: entry.notes }));
        e.dataTransfer.effectAllowed = "copy";
        chip.style.opacity = "0.5";
      });
      chip.addEventListener("dragend", () => {
        chip.style.opacity = "1";
      });
      chip.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const before = entries;
        removeEntry(entry.id);
        showUndo(t("history.removed", { chord: chordLabel(entry.symbol) }), () => restoreEntries(before));
      });
      strip.appendChild(chip);
      if (modulation) {
        const tag = document.createElement("span");
        tag.className = "history-modulation";
        tag.textContent = `\u2192 ${keyLabel(modulation)}`;
        tag.title = t("history.modulation", { key: keyLabel(modulation) });
        strip.appendChild(tag);
      }
      if (cadence) {
        const tag = document.createElement("span");
        tag.className = "history-cadence";
        tag.textContent = cadenceLabel(cadence, true);
        tag.title = `${cadenceLabel(cadence)}: ${chordLabel(shown[i + 1].symbol)} \u2192 ${chordLabel(entry.symbol)}`;
        strip.appendChild(tag);
      }
    });
    const clearBtn = document.createElement("button");
    clearBtn.textContent = t("history.clear");
    clearBtn.title = t("history.clear.title");
    clearBtn.className = "history-clear-btn";
    clearBtn.addEventListener("click", clearHistoryWithUndo);
    const wrap = document.createElement("div");
    wrap.className = "history-wrap";
    wrap.appendChild(strip);
    wrap.appendChild(clearBtn);
    container.innerHTML = "";
    container.appendChild(wrap);
  }

  // src/song/model.ts
  function createSong() {
    return { schemaVersion: 2, id: newId(), title: t("song.untitled"), key: null, updatedAt: Date.now(), sections: [] };
  }
  var UNTITLED = /* @__PURE__ */ new Set([en["song.untitled"], es["song.untitled"]]);
  function isBlankSong(song) {
    return !song.sections.length && UNTITLED.has(song.title);
  }
  function newId() {
    return crypto.randomUUID();
  }
  function newMeasure() {
    return { id: newId(), chords: [] };
  }
  function addSection(song, name, color2) {
    const section = {
      id: newId(),
      name,
      color: color2,
      measures: [newMeasure()],
      collapsed: false,
      repeatCount: 1
    };
    return { ...song, sections: [...song.sections, section] };
  }
  function removeSection(song, sectionId) {
    return { ...song, sections: song.sections.filter((s) => s.id !== sectionId) };
  }
  function updateSection(song, sectionId, patch) {
    return {
      ...song,
      sections: song.sections.map((s) => s.id === sectionId ? { ...s, ...patch } : s)
    };
  }
  function duplicateSection(song, sectionId) {
    const src = song.sections.find((s) => s.id === sectionId);
    if (!src) return song;
    const copy = {
      ...src,
      id: newId(),
      measures: src.measures.map((m) => ({
        id: newId(),
        chords: m.chords.map((c) => ({ ...c, id: newId() }))
      }))
    };
    const idx = song.sections.findIndex((s) => s.id === sectionId);
    const sections = [...song.sections];
    sections.splice(idx + 1, 0, copy);
    return { ...song, sections };
  }
  function addMeasure(song, sectionId) {
    return {
      ...song,
      sections: song.sections.map(
        (s) => s.id === sectionId ? { ...s, measures: [...s.measures, newMeasure()] } : s
      )
    };
  }
  function removeMeasure(song, sectionId, measureId) {
    return {
      ...song,
      sections: song.sections.map((s) => {
        if (s.id !== sectionId || s.measures.length <= 1) return s;
        return { ...s, measures: s.measures.filter((m) => m.id !== measureId) };
      })
    };
  }
  function addChord(song, sectionId, measureId, symbol, notes, beforeChordId) {
    const valid = isValidChordSymbol(symbol);
    const chord = { id: newId(), symbol, valid, ...notes?.length ? { notes } : {} };
    return {
      ...song,
      sections: song.sections.map((s) => s.id !== sectionId ? s : {
        ...s,
        measures: s.measures.map((m) => {
          if (m.id !== measureId) return m;
          const chords = [...m.chords];
          const at = beforeChordId ? chords.findIndex((c) => c.id === beforeChordId) : -1;
          chords.splice(at === -1 ? chords.length : at, 0, chord);
          return { ...m, chords };
        })
      })
    };
  }
  function insertChordAfter(song, afterChordId, symbol, notes) {
    const valid = isValidChordSymbol(symbol);
    const newChord = { id: newId(), symbol, valid, ...notes?.length ? { notes } : {} };
    return {
      ...song,
      sections: song.sections.map((s) => ({
        ...s,
        measures: s.measures.map((m) => {
          const idx = m.chords.findIndex((c) => c.id === afterChordId);
          if (idx === -1) return m;
          const chords = [...m.chords];
          chords.splice(idx + 1, 0, newChord);
          return { ...m, chords };
        })
      }))
    };
  }
  function updateChord(song, chordId, symbol, notes) {
    const valid = isValidChordSymbol(symbol);
    return {
      ...song,
      sections: song.sections.map((s) => ({
        ...s,
        measures: s.measures.map((m) => ({
          ...m,
          chords: m.chords.map((c) => c.id === chordId ? { ...c, symbol, valid, ...notes?.length ? { notes } : { notes: void 0 } } : c)
        }))
      }))
    };
  }
  function removeChord(song, chordId) {
    return {
      ...song,
      sections: song.sections.map((s) => ({
        ...s,
        measures: s.measures.map((m) => ({
          ...m,
          chords: m.chords.filter((c) => c.id !== chordId)
        }))
      }))
    };
  }
  function duplicateChord(song, chordId) {
    for (const s of song.sections)
      for (const m of s.measures) {
        const c = m.chords.find((ch) => ch.id === chordId);
        if (c) return insertChordAfter(song, chordId, c.symbol, c.notes);
      }
    return song;
  }
  function moveChordToPosition(song, chordId, targetSectionId, targetMeasureId, beforeChordId) {
    let movedChord;
    const without = {
      ...song,
      sections: song.sections.map((s) => ({
        ...s,
        measures: s.measures.map((m) => {
          const idx = m.chords.findIndex((c) => c.id === chordId);
          if (idx === -1) return m;
          movedChord = m.chords[idx];
          return { ...m, chords: m.chords.filter((c) => c.id !== chordId) };
        })
      }))
    };
    if (!movedChord) return song;
    return {
      ...without,
      sections: without.sections.map((s) => {
        if (s.id !== targetSectionId) return s;
        return {
          ...s,
          measures: s.measures.map((m) => {
            if (m.id !== targetMeasureId) return m;
            const chords = [...m.chords];
            const at = beforeChordId ? chords.findIndex((c) => c.id === beforeChordId) : -1;
            chords.splice(at === -1 ? chords.length : at, 0, movedChord);
            return { ...m, chords };
          })
        };
      })
    };
  }
  function reorderSections(song, draggedId, targetId, before) {
    const sections = [...song.sections];
    const fromIdx = sections.findIndex((s) => s.id === draggedId);
    if (fromIdx === -1) return song;
    const [moved] = sections.splice(fromIdx, 1);
    const toIdx = sections.findIndex((s) => s.id === targetId);
    if (toIdx === -1) return song;
    sections.splice(before ? toIdx : toIdx + 1, 0, moved);
    return { ...song, sections };
  }
  function computeMeasureNumbers(song) {
    const map = /* @__PURE__ */ new Map();
    let n = 1;
    for (const section of song.sections) {
      for (const measure of section.measures) {
        map.set(measure.id, n++);
      }
    }
    return map;
  }
  function parseProgressionText(text) {
    return text.split(/[\s,\n|]+/).map((t2) => t2.trim()).filter(Boolean);
  }
  function parseProgressionMeasures(text) {
    if (!text.includes("|")) return parseProgressionText(text).map((sym) => [sym]);
    return text.split("|").map(parseProgressionText).filter((m) => m.length > 0);
  }
  function appendProgression(song, sectionId, measures) {
    return {
      ...song,
      sections: song.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const kept = [...s.measures];
        const last2 = kept[kept.length - 1];
        const reuse = last2 && last2.chords.length === 0;
        if (reuse) kept.pop();
        const added = measures.map((syms, i) => ({
          id: i === 0 && reuse ? last2.id : newId(),
          chords: syms.map((symbol) => ({ id: newId(), symbol, valid: isValidChordSymbol(symbol) }))
        }));
        return { ...s, measures: [...kept, ...added] };
      })
    };
  }
  function computeDegree(chordSymbol, activeKey) {
    if (!activeKey || !chordSymbol) return "\u2014";
    return romanInKey(chordSymbol, activeKey)?.roman ?? "?";
  }
  function isBorrowedChord(chordSymbol, activeKey) {
    return romanInKey(chordSymbol, activeKey)?.isBorrowed ?? false;
  }
  var isValidChordSymbol = isKnownChord;
  var SEMITONE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function transposeRoot(root, semitones, preferSharps) {
    const names = preferSharps ? SEMITONE_NAMES_SHARP : PITCH_NAMES_FLAT;
    const all = [...SEMITONE_NAMES_SHARP, ...PITCH_NAMES_FLAT];
    const idx = all.indexOf(root);
    if (idx === -1) return root;
    return names[((idx % 12 + semitones) % 12 + 12) % 12];
  }
  function transposeSong(song, semitones, targetKey) {
    const preferSharps = keyPrefersSharps(targetKey);
    const names = preferSharps ? SEMITONE_NAMES_SHARP : PITCH_NAMES_FLAT;
    const transposePart = (part) => {
      const m = part.match(/^([A-G][b#]?)/);
      if (!m) return part;
      return transposeRoot(m[1], semitones, preferSharps) + part.slice(m[1].length);
    };
    const transposeSymbol = (symbol) => symbol.split("/").map(transposePart).join("/");
    const transposeNote = (note) => {
      const midi = noteNameToMidi(note);
      if (midi === null) return note;
      const t2 = midi + semitones;
      return names[(t2 % 12 + 12) % 12] + (Math.floor(t2 / 12) - 1);
    };
    return {
      ...song,
      sections: song.sections.map((s) => ({
        ...s,
        measures: s.measures.map((m) => ({
          ...m,
          chords: m.chords.map((c) => {
            const symbol = transposeSymbol(c.symbol);
            return {
              ...c,
              symbol,
              valid: isValidChordSymbol(symbol),
              ...c.notes ? { notes: c.notes.map(transposeNote) } : {}
            };
          })
        }))
      }))
    };
  }
  function withoutEmptyChords(song) {
    return {
      ...song,
      sections: song.sections.map((s) => ({
        ...s,
        measures: s.measures.map((m) => ({ ...m, chords: m.chords.filter((c) => c.symbol) }))
      }))
    };
  }
  function detectForm(sectionNames) {
    if (sectionNames.length === 0) return t("form.empty");
    const map = /* @__PURE__ */ new Map();
    let letter = 65;
    const letters = sectionNames.map((name) => {
      const key = name.trim().toLowerCase();
      if (!map.has(key)) map.set(key, String.fromCharCode(letter++));
      return map.get(key);
    });
    const pattern = letters.join("");
    if (/^(AB)+$/.test(pattern)) return t("form.verseChorus", { p: pattern });
    if (/^AABA/.test(pattern)) return `AABA (${pattern})`;
    if (/^(A+B+A+)$/.test(pattern)) return t("form.ternary", { p: pattern });
    if (pattern === "A") return t("form.single");
    if (/^A+$/.test(pattern)) return t("form.strophic", { p: pattern });
    return `${pattern}`;
  }

  // src/song/library.ts
  var INDEX_KEY = "modus-songs";
  var songKey = (id) => `modus-song:${id}`;
  var LEGACY_SONG_KEYS = ["modus-song", "harmony-companion-song"];
  var LEGACY_KEY_KEY = "active-key";
  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  var metaOf = (song) => ({ id: song.id, title: song.title, updatedAt: song.updatedAt });
  function readSong(id) {
    const s = readJSON(songKey(id));
    return s?.schemaVersion === 2 && s.id === id && Array.isArray(s.sections) ? withoutEmptyChords(s) : null;
  }
  function readIndex() {
    const i = readJSON(INDEX_KEY);
    return i && typeof i.activeId === "string" && Array.isArray(i.songs) ? i : null;
  }
  function migrateLegacySong() {
    const legacy = LEGACY_SONG_KEYS.map(readJSON).find((s) => s?.schemaVersion === 1 && Array.isArray(s.sections));
    if (!legacy) return createSong();
    let key = null;
    try {
      key = normalizeKey(localStorage.getItem(LEGACY_KEY_KEY));
    } catch {
    }
    return withoutEmptyChords({ ...createSong(), title: legacy.title ?? createSong().title, key, sections: legacy.sections });
  }
  function ensureIndex() {
    const index = readIndex();
    if (index) return index;
    const song = migrateLegacySong();
    write(songKey(song.id), song);
    const created = { activeId: song.id, songs: [metaOf(song)] };
    write(INDEX_KEY, created);
    return created;
  }
  function listSongs() {
    return ensureIndex().songs.map((meta, order) => ({ meta, order })).sort((a, b) => b.meta.updatedAt - a.meta.updatedAt || b.order - a.order).map((x) => x.meta);
  }
  function saveSong(song) {
    const stored = { ...withoutEmptyChords(song), updatedAt: Date.now() };
    write(songKey(stored.id), stored);
    const index = ensureIndex();
    write(INDEX_KEY, { ...index, songs: [...index.songs.filter((m) => m.id !== stored.id), metaOf(stored)] });
    if (!isBlankSong(stored)) requestPersistence();
  }
  var PERSIST_ASKED_KEY = "storage-persist-asked";
  function requestPersistence() {
    try {
      if (localStorage.getItem(PERSIST_ASKED_KEY) || !navigator.storage?.persist) return;
      localStorage.setItem(PERSIST_ASKED_KEY, "1");
    } catch {
      return;
    }
    navigator.storage.persisted().then((already) => already || navigator.storage.persist()).catch(() => {
    });
  }
  function setActive(id) {
    write(INDEX_KEY, { ...ensureIndex(), activeId: id });
  }
  function loadActiveSong() {
    const index = ensureIndex();
    const song = readSong(index.activeId) ?? listSongs().map((m) => readSong(m.id)).find((s) => s !== null);
    if (song) {
      if (song.id !== index.activeId) setActive(song.id);
      return song;
    }
    return newSong();
  }
  function openSong(id) {
    const song = readSong(id);
    if (song) setActive(id);
    return song;
  }
  function newSong() {
    const song = createSong();
    saveSong(song);
    setActive(song.id);
    return song;
  }
  function deleteSong(id) {
    const deleted = readSong(id);
    const index = ensureIndex();
    try {
      localStorage.removeItem(songKey(id));
    } catch {
    }
    write(INDEX_KEY, { ...index, songs: index.songs.filter((m) => m.id !== id) });
    return { deleted, open: loadActiveSong() };
  }
  function restoreSong(song) {
    saveSong(song);
    setActive(song.id);
  }

  // src/song/view.ts
  var SECTION_COLORS = {
    intro: "var(--section-intro)",
    verse: "var(--section-verse)",
    prechorus: "var(--section-prechorus)",
    chorus: "var(--section-chorus)",
    bridge: "var(--section-bridge)",
    outro: "var(--section-outro)",
    custom: "var(--section-custom)"
  };
  var NEUTRAL_BTN = "var(--btn-neutral)";
  var _song = createSong();
  var _handlers = null;
  var _container = null;
  var _draggedSectionId = null;
  var _draggedChordId = null;
  var _dropIndicator = null;
  var _insertBeforeChordId = null;
  function showNotice(msg, type = "info") {
    if (!_container) return;
    document.querySelectorAll(".song-notice").forEach((el) => el.remove());
    const div = document.createElement("div");
    div.className = `song-notice${type === "warn" ? " warn" : ""}`;
    const span = document.createElement("span");
    span.textContent = msg;
    const x = document.createElement("button");
    x.textContent = "\xD7";
    x.className = "song-notice-close";
    x.addEventListener("click", () => div.remove());
    div.append(span, x);
    _container.insertBefore(div, _container.firstChild);
    window.setTimeout(() => div.remove(), 5e3);
  }
  function applyWithUndo(next, message) {
    const before = _song;
    _song = next;
    saveSong(_song);
    _handlers?.onSongChange(_song);
    showUndo(message, () => {
      _song = before;
      saveSong(before);
      _handlers?.onSongChange(before);
    });
  }
  function removeChordWithUndo(chordId) {
    const chord = _song.sections.flatMap((s) => s.measures.flatMap((m) => m.chords)).find((c) => c.id === chordId);
    if (chord) applyWithUndo(removeChord(_song, chordId), t("chord.removed", { chord: chord.symbol ? chordLabel(chord.symbol) : t("chord.generic") }));
  }
  function mountSong(container, song, handlers) {
    _song = song;
    _handlers = handlers;
    _container = container;
    rerender();
  }
  function markActiveChord(chordId) {
    _container?.querySelectorAll(".chord-chip").forEach((el) => {
      el.classList.toggle("active-cursor", el.dataset.chordId === chordId);
    });
  }
  function rerender() {
    if (!_container || !_handlers) return;
    _container.innerHTML = "";
    _container.appendChild(buildSongDOM(_song, _handlers));
  }
  function buildSongDOM(song, h) {
    const root = document.createElement("div");
    root.className = "song-root";
    const header = document.createElement("div");
    header.className = "song-header";
    const titleInput = document.createElement("input");
    titleInput.value = song.title;
    titleInput.className = "song-title-input";
    titleInput.addEventListener("blur", () => {
      _song = { ..._song, title: titleInput.value };
      h.onSongChange(_song);
    });
    const songSelect = document.createElement("select");
    songSelect.className = "transpose-select song-select";
    songSelect.title = t("song.saved.title");
    const metas = h.songs.some((m) => m.id === song.id) ? h.songs : [{ id: song.id, title: song.title, updatedAt: song.updatedAt }, ...h.songs];
    songSelect.innerHTML = metas.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.id === song.id ? song.title : m.title) || escapeHtml(t("song.untitled"))}</option>`).join("");
    songSelect.value = song.id;
    songSelect.addEventListener("change", () => h.onOpenSong(songSelect.value));
    const newBtn = makeBtn(t("song.new"), NEUTRAL_BTN, () => {
      if (isBlankSong(_song)) return;
      h.onNewSong();
    });
    newBtn.title = t("song.new.title");
    const deleteBtn = makeBtn(t("song.delete"), NEUTRAL_BTN, () => h.onDeleteSong());
    deleteBtn.title = t("song.delete.title");
    const pasteArea = document.createElement("div");
    pasteArea.className = "paste-area";
    pasteArea.style.display = "none";
    const pasteTA = document.createElement("textarea");
    pasteTA.placeholder = t("song.paste.placeholder");
    pasteTA.rows = 2;
    pasteTA.className = "paste-textarea";
    const pasteSubmit = makeBtn(t("song.paste.add"), "var(--accent)", () => {
      const text = pasteTA.value.trim();
      if (!text) return;
      const measures = parseProgressionMeasures(text).map((m) => m.map(readTypedChord));
      if (!measures.length) return;
      if (!_song.sections.length) {
        _song = addSection(_song, t("section.default"), "verse");
      }
      const section = _song.sections[_song.sections.length - 1];
      _song = appendProgression(_song, section.id, measures);
      pasteTA.value = "";
      pasteArea.style.display = "none";
      saveSong(_song);
      h.onSongChange(_song);
    });
    pasteArea.append(pasteTA, pasteSubmit);
    const templates = [
      { label: "section.intro", name: "section.intro", color: "intro" },
      { label: "section.verse", name: "section.verse", color: "verse" },
      { label: "section.pre", name: "section.prechorus", color: "prechorus" },
      { label: "section.chorus", name: "section.chorus", color: "chorus" },
      { label: "section.bridge", name: "section.bridge", color: "bridge" },
      { label: "section.outro", name: "section.outro", color: "outro" }
    ];
    const templateWrap = document.createElement("div");
    templateWrap.className = "template-wrap";
    templates.forEach((tpl) => {
      const name = t(tpl.name);
      const btn = makeBtn(`+ ${t(tpl.label)}`, SECTION_COLORS[tpl.color], () => {
        _song = addSection(_song, name, tpl.color);
        saveSong(_song);
        h.onSongChange(_song);
      });
      btn.style.fontSize = "11px";
      btn.title = t("song.addSection.title", { name });
      templateWrap.appendChild(btn);
    });
    const transposeSelect = document.createElement("select");
    transposeSelect.title = t("song.transpose.title");
    transposeSelect.className = "transpose-select";
    transposeSelect.innerHTML = `<option value="">${t("song.transpose")}</option>` + Array.from({ length: 11 }, (_, i) => `<option value="${i + 1}">${t("song.transpose.step", { n: i + 1 })}</option>`).join("");
    transposeSelect.addEventListener("change", () => {
      const n = parseInt(transposeSelect.value);
      if (n) {
        const targetKey = h.activeKey ? transposeKey(h.activeKey, n) : void 0;
        _song = transposeSong(_song, n, targetKey);
        saveSong(_song);
        h.onSongChange(_song);
      }
      transposeSelect.value = "";
    });
    const exportBtn = makeBtn(t("song.export"), NEUTRAL_BTN, () => {
      const printWin = window.open("", "_blank");
      if (!printWin) {
        showNotice(t("song.popupBlocked"), "warn");
        return;
      }
      printWin.document.write(buildPrintHTML(_song, h.activeKey));
      printWin.document.close();
      printWin.print();
    });
    exportBtn.title = t("song.export.title");
    const pasteBtn = makeBtn(t("song.paste"), NEUTRAL_BTN, () => {
      const open2 = pasteArea.style.display === "none";
      pasteArea.style.display = open2 ? "block" : "none";
      if (open2) pasteTA.focus();
    });
    pasteBtn.title = t("song.paste.title");
    header.append(songSelect, titleInput, newBtn, deleteBtn, templateWrap, transposeSelect, exportBtn, pasteBtn);
    root.appendChild(header);
    root.appendChild(pasteArea);
    const formInfo = document.createElement("div");
    formInfo.className = "song-form-info";
    const form = detectForm(_song.sections.map((s) => s.name));
    const keyStr = h.activeKey ? ` \xB7 ${t("song.key", { key: keyLabel(h.activeKey) })}` : "";
    formInfo.textContent = _song.sections.length ? t("song.form", { form }) + keyStr : "";
    root.appendChild(formInfo);
    const measureNums = computeMeasureNumbers(song);
    song.sections.forEach((section) => {
      root.appendChild(buildSectionDOM(section, h, measureNums));
    });
    return root;
  }
  function buildSectionDOM(section, h, measureNums) {
    const color2 = SECTION_COLORS[section.color];
    const wrap = document.createElement("div");
    wrap.className = "section-wrap";
    wrap.style.borderLeft = `3px solid ${color2}`;
    const secHeader = document.createElement("div");
    secHeader.className = "section-header";
    const toggle = document.createElement("span");
    toggle.textContent = section.collapsed ? "\u25B6" : "\u25BC";
    toggle.className = "section-toggle";
    toggle.addEventListener("click", () => {
      _song = updateSection(_song, section.id, { collapsed: !section.collapsed });
      saveSong(_song);
      h.onSongChange(_song);
    });
    const nameInput = document.createElement("input");
    nameInput.value = section.name;
    nameInput.className = "section-name-input";
    nameInput.style.color = color2;
    nameInput.addEventListener("focus", () => nameInput.style.borderBottomColor = color2);
    nameInput.addEventListener("blur", () => {
      nameInput.style.borderBottomColor = "transparent";
      _song = updateSection(_song, section.id, { name: nameInput.value });
      saveSong(_song);
      h.onSongChange(_song);
    });
    const PRESET_COLORS = ["intro", "verse", "prechorus", "chorus", "bridge", "outro", "custom"];
    const swatchEl = document.createElement("button");
    swatchEl.className = "section-swatch";
    swatchEl.style.background = color2;
    swatchEl.title = t("section.color.title");
    swatchEl.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelector(".color-picker-popup")?.remove();
      const picker = document.createElement("div");
      picker.className = "color-picker-popup";
      PRESET_COLORS.forEach((c) => {
        const dot = document.createElement("button");
        dot.title = t(`section.${c}`);
        dot.className = "color-picker-dot";
        dot.style.background = SECTION_COLORS[c];
        dot.style.borderColor = c === section.color ? "var(--cursor)" : "transparent";
        dot.addEventListener("click", (ev) => {
          ev.stopPropagation();
          picker.remove();
          _song = updateSection(_song, section.id, { color: c });
          saveSong(_song);
          h.onSongChange(_song);
        });
        picker.appendChild(dot);
      });
      const rect = swatchEl.getBoundingClientRect();
      picker.style.top = `${rect.bottom + 4}px`;
      picker.style.left = `${rect.left}px`;
      document.body.appendChild(picker);
      setTimeout(() => {
        const close = (ev) => {
          if (!picker.contains(ev.target)) {
            picker.remove();
            document.removeEventListener("click", close);
          }
        };
        document.addEventListener("click", close);
      }, 0);
    });
    const repeatBadge = document.createElement("span");
    repeatBadge.textContent = `\xD7${section.repeatCount}`;
    repeatBadge.title = t("section.repeat.title");
    repeatBadge.className = "section-repeat-badge";
    repeatBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = "16";
      input.value = String(section.repeatCount);
      input.className = "section-repeat-input";
      repeatBadge.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        const n = parseInt(input.value);
        if (n >= 1 && n <= 16) {
          _song = updateSection(_song, section.id, { repeatCount: n });
          saveSong(_song);
        }
        h.onSongChange(_song);
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (ke) => {
        if (ke.key === "Enter") input.blur();
        if (ke.key === "Escape") {
          input.value = String(section.repeatCount);
          input.blur();
        }
      });
    });
    const dragHandle = document.createElement("span");
    dragHandle.textContent = "\u283F";
    dragHandle.title = t("section.drag.title");
    dragHandle.className = "section-drag-handle";
    const dupBtn = makeSmallBtn("\u29C9", () => {
      _song = duplicateSection(_song, section.id);
      saveSong(_song);
      h.onSongChange(_song);
    });
    dupBtn.title = t("section.duplicate.title");
    const delBtn = makeSmallBtn("\xD7", () => {
      applyWithUndo(removeSection(_song, section.id), t("section.deleted", { name: section.name }));
    });
    delBtn.style.color = "var(--danger-soft)";
    delBtn.title = t("section.delete.title");
    secHeader.append(dragHandle, toggle, nameInput, swatchEl, repeatBadge, dupBtn, delBtn);
    const addMeasureBtn = makeSmallBtn(t("section.addBar"), () => {
      _song = addMeasure(_song, section.id);
      saveSong(_song);
      h.onSongChange(_song);
    });
    addMeasureBtn.title = t("section.addBar.title");
    secHeader.appendChild(addMeasureBtn);
    wrap.appendChild(secHeader);
    secHeader.draggable = true;
    secHeader.style.cursor = "grab";
    secHeader.addEventListener("dragstart", (e) => {
      _draggedSectionId = section.id;
      _draggedChordId = null;
      e.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => {
        wrap.style.opacity = "0.5";
      });
    });
    secHeader.addEventListener("dragend", () => {
      _draggedSectionId = null;
      wrap.style.opacity = "1";
      wrap.style.borderTop = "";
      wrap.style.borderBottom = "";
    });
    wrap.addEventListener("dragover", (e) => {
      if (!_draggedSectionId || _draggedSectionId === section.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = wrap.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      wrap.style.borderTop = before ? "2px solid var(--accent)" : "";
      wrap.style.borderBottom = !before ? "2px solid var(--accent)" : "";
    });
    wrap.addEventListener("dragleave", (e) => {
      if (!wrap.contains(e.relatedTarget)) {
        wrap.style.borderTop = "";
        wrap.style.borderBottom = "";
      }
    });
    wrap.addEventListener("drop", (e) => {
      if (!_draggedSectionId || _draggedSectionId === section.id) return;
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      wrap.style.borderTop = "";
      wrap.style.borderBottom = "";
      _song = reorderSections(_song, _draggedSectionId, section.id, before);
      _draggedSectionId = null;
      saveSong(_song);
      h.onSongChange(_song);
    });
    if (!section.collapsed) {
      const measuresWrap = document.createElement("div");
      measuresWrap.className = "measures-wrap";
      section.measures.forEach((measure) => {
        measuresWrap.appendChild(buildMeasureDOM(measure, section, h, measureNums.get(measure.id) ?? 0));
      });
      wrap.appendChild(measuresWrap);
    }
    return wrap;
  }
  function buildMeasureDOM(measure, section, h, measureNum) {
    const wrap = document.createElement("div");
    wrap.className = "measure-row";
    const numLabel = document.createElement("span");
    numLabel.textContent = String(measureNum);
    numLabel.className = "measure-num";
    wrap.appendChild(numLabel);
    const chordsRow = document.createElement("div");
    chordsRow.className = "chords-row";
    measure.chords.forEach((chord) => {
      chordsRow.appendChild(buildChordChip(chord, section, measure, h));
    });
    const addBtn = document.createElement("button");
    addBtn.textContent = "+";
    addBtn.className = "chord-add-btn";
    addBtn.addEventListener("click", () => {
      _song = addChord(_song, section.id, measure.id, "");
      saveSong(_song);
      h.onSongChange(_song);
      setTimeout(() => {
        const inputs = _container?.querySelectorAll(".chord-input");
        inputs?.[inputs.length - 1]?.focus();
      }, 50);
    });
    chordsRow.appendChild(addBtn);
    chordsRow.addEventListener("dragover", (e) => {
      const hasHistory = e.dataTransfer.types.includes("application/x-history-chord");
      const hasChord = !!_draggedChordId;
      if (!hasHistory && !hasChord) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = hasHistory ? "copy" : "move";
      chordsRow.style.outline = "1px dashed var(--accent)";
    });
    chordsRow.addEventListener("dragleave", (e) => {
      if (!chordsRow.contains(e.relatedTarget)) {
        chordsRow.style.outline = "";
        _dropIndicator?.remove();
        _insertBeforeChordId = null;
      }
    });
    chordsRow.addEventListener("drop", (e) => {
      chordsRow.style.outline = "";
      _dropIndicator?.remove();
      const histData = e.dataTransfer.getData("application/x-history-chord");
      if (histData) {
        e.preventDefault();
        const { symbol, notes } = JSON.parse(histData);
        _song = addChord(_song, section.id, measure.id, symbol, notes, _insertBeforeChordId ?? void 0);
        _insertBeforeChordId = null;
        saveSong(_song);
        h.onSongChange(_song);
      } else if (_draggedChordId) {
        e.preventDefault();
        e.stopPropagation();
        _song = moveChordToPosition(_song, _draggedChordId, section.id, measure.id, _insertBeforeChordId ?? void 0);
        _draggedChordId = null;
        _insertBeforeChordId = null;
        saveSong(_song);
        h.onSongChange(_song);
      }
    });
    wrap.appendChild(chordsRow);
    const delMBtn = makeSmallBtn("\xD7", () => {
      applyWithUndo(removeMeasure(_song, section.id, measure.id), t("measure.deleted", { n: measureNum }));
    });
    delMBtn.title = t("measure.delete.title");
    delMBtn.style.color = "var(--danger-soft)";
    delMBtn.style.alignSelf = "center";
    const sectionObj = _song.sections.find((s) => s.id === section.id);
    if (!sectionObj || sectionObj.measures.length <= 1) delMBtn.style.display = "none";
    wrap.appendChild(delMBtn);
    return wrap;
  }
  function buildChordChip(chord, section, measure, h) {
    const isActive = h.activeCursorId === chord.id;
    const isCapture = h.captureTargetId === chord.id;
    const degree = chord.valid && chord.symbol ? computeDegree(chord.symbol, h.activeKey) : "\u2014";
    const borrowed = chord.valid && chord.symbol ? isBorrowedChord(chord.symbol, h.activeKey) : false;
    const wrap = document.createElement("div");
    wrap.className = "chord-chip";
    wrap.dataset.chordId = chord.id;
    wrap.classList.toggle("capture-target", isCapture);
    wrap.classList.toggle("active-cursor", isActive);
    wrap.classList.toggle("invalid", chord.valid === false);
    const isEditing = !chord.symbol;
    if (isEditing) {
      const input = document.createElement("input");
      input.className = "chord-input";
      input.placeholder = "Am7";
      const prevValue = chord.symbol;
      const confirmInput = () => {
        const val = readTypedChord(input.value);
        if (val) {
          _song = updateChord(_song, chord.id, val);
        } else {
          _song = removeChord(_song, chord.id);
        }
        saveSong(_song);
        h.onSongChange(_song);
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmInput();
        }
        if (e.key === "Escape") {
          if (!prevValue) _song = removeChord(_song, chord.id);
          saveSong(_song);
          h.onSongChange(_song);
        }
        if (e.key === "Backspace" && input.value === "") {
          _song = removeChord(_song, chord.id);
          saveSong(_song);
          h.onSongChange(_song);
        }
      });
      input.addEventListener("blur", confirmInput);
      wrap.appendChild(input);
      return wrap;
    }
    const symbolEl = document.createElement("div");
    symbolEl.textContent = chordLabel(chord.symbol);
    symbolEl.className = "chord-chip-symbol";
    if (!chord.valid) symbolEl.style.color = "var(--danger)";
    const degreeEl = document.createElement("div");
    degreeEl.textContent = degree;
    degreeEl.className = "chord-chip-degree";
    if (borrowed) degreeEl.style.color = "var(--warn)";
    wrap.appendChild(symbolEl);
    wrap.appendChild(degreeEl);
    const controls = document.createElement("div");
    controls.className = "chord-chip-controls";
    const editBtn = makeSmallBtn("\u270E", () => {
      let notesState = chord.notes ? [...chord.notes] : void 0;
      const prevVal = chord.symbol;
      const editWrap = document.createElement("div");
      editWrap.style.cssText = "display:flex;flex-direction:column;gap:2px;padding:2px";
      const input = document.createElement("input");
      input.className = "chord-input";
      input.value = chord.symbol;
      const commit = () => {
        const symbol = readTypedChord(input.value) || prevVal;
        _song = updateChord(_song, chord.id, symbol, symbol === prevVal ? notesState : void 0);
        saveSong(_song);
        h.onSongChange(_song);
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") h.onSongChange(_song);
      });
      input.addEventListener("blur", commit);
      editWrap.appendChild(input);
      if (notesState?.length) {
        const notesRow = document.createElement("div");
        notesRow.style.cssText = "display:flex;align-items:center;gap:3px;font-size:9px;color:var(--text-muted);white-space:nowrap;overflow:hidden";
        const notesText = document.createElement("span");
        notesText.textContent = "\u2669 " + notesState.join(" ");
        notesText.style.overflow = "hidden";
        notesText.style.textOverflow = "ellipsis";
        const clearBtn = document.createElement("button");
        clearBtn.textContent = "\xD7";
        clearBtn.title = t("chord.clearVoicing.title");
        clearBtn.style.cssText = "background:none;border:none;color:var(--text-dim);cursor:pointer;padding:0 2px;font-size:10px;flex-shrink:0";
        clearBtn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          notesState = void 0;
          notesRow.remove();
        });
        notesRow.append(notesText, clearBtn);
        editWrap.appendChild(notesRow);
      }
      wrap.innerHTML = "";
      wrap.appendChild(editWrap);
      input.focus();
    });
    editBtn.title = t("chord.edit.title");
    const dupBtn = makeSmallBtn("\u29C9", () => {
      _song = duplicateChord(_song, chord.id);
      saveSong(_song);
      h.onSongChange(_song);
    });
    dupBtn.title = t("chord.duplicate.title");
    const delBtn = makeSmallBtn("\xD7", () => removeChordWithUndo(chord.id));
    delBtn.title = t("chord.remove.title");
    const captureBtn = makeSmallBtn("\u2299", () => h.onChordCapture(chord.id));
    captureBtn.title = t("chord.capture.title");
    if (isCapture) {
      captureBtn.style.color = "var(--accent-text)";
      captureBtn.style.fontWeight = "700";
    }
    controls.append(editBtn, dupBtn, captureBtn, delBtn);
    wrap.appendChild(controls);
    wrap.addEventListener("mouseenter", () => controls.style.display = "flex");
    wrap.addEventListener("mouseleave", () => controls.style.display = "none");
    wrap.addEventListener("click", () => {
      h.onChordClick(chord.id, chord.symbol, chord.notes);
      if (chord.notes?.length) playNoteNames(chord.notes);
      else playChord(chord.symbol);
    });
    wrap.draggable = true;
    wrap.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      _draggedChordId = chord.id;
      _draggedSectionId = null;
      e.dataTransfer.effectAllowed = "move";
      controls.style.display = "none";
      requestAnimationFrame(() => {
        wrap.style.opacity = "0.2";
      });
    });
    wrap.addEventListener("dragend", () => {
      _draggedChordId = null;
      wrap.style.opacity = "1";
      controls.style.display = "none";
      _dropIndicator?.remove();
      _insertBeforeChordId = null;
    });
    wrap.addEventListener("dragover", (e) => {
      const isHistory = e.dataTransfer.types.includes("application/x-history-chord");
      if (!isHistory && (!_draggedChordId || _draggedChordId === chord.id)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = isHistory ? "copy" : "move";
      if (!_dropIndicator) {
        _dropIndicator = document.createElement("div");
        _dropIndicator.className = "chord-drop-indicator";
      }
      const rect = wrap.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      if (before) {
        _insertBeforeChordId = chord.id;
        wrap.parentNode.insertBefore(_dropIndicator, wrap);
      } else {
        const targetMeasure = _song.sections.find((s) => s.id === section.id)?.measures.find((m) => m.id === measure.id);
        const chordIdx = targetMeasure?.chords.findIndex((c) => c.id === chord.id) ?? -1;
        _insertBeforeChordId = targetMeasure?.chords[chordIdx + 1]?.id ?? null;
        wrap.parentNode.insertBefore(_dropIndicator, wrap.nextSibling);
      }
    });
    wrap.addEventListener("drop", (e) => {
      if (!_draggedChordId) return;
      e.preventDefault();
      e.stopPropagation();
      if (_draggedChordId === chord.id) return;
      _dropIndicator?.remove();
      _song = moveChordToPosition(_song, _draggedChordId, section.id, measure.id, _insertBeforeChordId ?? void 0);
      _draggedChordId = null;
      _insertBeforeChordId = null;
      saveSong(_song);
      h.onSongChange(_song);
    });
    return wrap;
  }
  function makeBtn(label, bg, onClick) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = "song-btn";
    btn.style.background = bg;
    btn.addEventListener("click", onClick);
    return btn;
  }
  function makeSmallBtn(label, onClick) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = "song-btn-small";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }
  function buildPrintHTML(song, activeKey) {
    const measureNums = computeMeasureNumbers(song);
    let html = `<html><head><style>
    body{font-family:sans-serif;padding:24px} h1{margin-bottom:4px} .key{color:#555;margin-bottom:16px}
    .section{margin-bottom:20px} .section-name{font-weight:700;font-size:14px;border-bottom:2px solid #333;margin-bottom:8px;padding-bottom:4px}
    .measures{display:flex;flex-wrap:wrap;gap:8px} .measure{border:1px solid #ccc;border-radius:4px;padding:6px 8px;min-width:80px}
    .bar-num{font-size:10px;color:#999;margin-bottom:4px} .chord{font-size:13px;font-weight:600} .degree{font-size:10px;color:#666}
  </style></head><body>
    <h1>${escapeHtml(song.title)}</h1>
    <div class="key">${activeKey ? escapeHtml(t("song.key", { key: keyLabel(activeKey) })) : ""}</div>`;
    for (const section of song.sections) {
      html += `<div class="section"><div class="section-name">${escapeHtml(section.name)}${section.repeatCount > 1 ? ` \xD7${section.repeatCount}` : ""}</div><div class="measures">`;
      for (const measure of section.measures) {
        const num = measureNums.get(measure.id) ?? "";
        html += `<div class="measure"><div class="bar-num">${num}</div>`;
        for (const chord of measure.chords) {
          const degree = activeKey ? computeDegree(chord.symbol, activeKey) : "\u2014";
          html += `<div class="chord">${escapeHtml(chordLabel(chord.symbol))}</div><div class="degree">${degree}</div>`;
        }
        html += "</div>";
      }
      html += "</div></div>";
    }
    html += "</body></html>";
    return html;
  }

  // src/input/shortcuts.ts
  var SHORTCUTS = [
    { key: "kbd.space", action: "shortcut.play" },
    { key: "\u2190 \u2192", action: "shortcut.step" },
    { key: "kbd.del", action: "shortcut.delete" },
    { key: "H", action: "shortcut.hold" },
    { key: "A", action: "shortcut.arpeggio" },
    { key: "S", action: "shortcut.send" },
    { key: "C", action: "shortcut.clear" },
    { key: "kbd.esc", action: "shortcut.escape" },
    { key: "M", action: "shortcut.keyboard" },
    { key: "P", action: "shortcut.present" },
    { key: "/", action: "shortcut.type" },
    { key: "1\u20139", action: "shortcut.candidate" },
    { key: "?", action: "shortcut.help" }
  ];
  var GESTURES = [
    "gesture.click",
    "gesture.doubleClick",
    "gesture.logged",
    "gesture.drag",
    "gesture.fill",
    "gesture.remove",
    "gesture.piano"
  ];
  var keyText = (k) => k.startsWith("kbd.") ? t(k) : k;
  function reloadWith(apply) {
    apply();
    carryHistoryOverReload();
    location.reload();
  }
  var helpVisible = false;
  function closeHelp() {
    if (!helpVisible) return false;
    helpVisible = false;
    document.getElementById("shortcut-help")?.remove();
    document.removeEventListener("mousedown", closeHelpOnOutsideClick);
    return true;
  }
  function toggleHelp() {
    if (helpVisible) {
      closeHelp();
      return;
    }
    helpVisible = true;
    const popup = document.createElement("div");
    popup.id = "shortcut-help";
    popup.className = "shortcut-help-popup";
    popup.innerHTML = `
    <div class="shortcut-help-header">
      <span>${t("help.heading")}</span>
      <button class="shortcut-help-close">\xD7</button>
    </div>
    ${SHORTCUTS.map((s) => `
      <div class="shortcut-row">
        <kbd class="shortcut-key">${escapeHtml(keyText(s.key))}</kbd>
        <span class="shortcut-action">${escapeHtml(t(s.action))}</span>
      </div>`).join("")}
    <div class="shortcut-section">${t("help.mouse")}</div>
    ${GESTURES.map((g) => `<div class="gesture-row">${escapeHtml(t(g))}</div>`).join("")}
    <div class="shortcut-section">${t("help.settings")}</div>
    <div class="help-setting"><label for="help-theme">${t("help.theme")}</label>
      <select id="help-theme" class="ctrl-select">
        ${THEME_CHOICES.map((c) => `<option value="${c}"${c === getThemeChoice() ? " selected" : ""}>${t(`help.theme.${c}`)}</option>`).join("")}
      </select></div>
    <div class="help-setting"><label for="help-lang">${t("help.language")}</label>
      <select id="help-lang" class="ctrl-select">
        ${LANGS.map((l) => `<option value="${l}"${l === getLang() ? " selected" : ""}>${LANG_NAMES[l]}</option>`).join("")}
      </select></div>
    <div class="help-setting"><label for="help-note-names">${t("help.noteNames")}</label>
      <select id="help-note-names" class="ctrl-select">
        ${NOTE_NAMINGS.map((n) => `<option value="${n}"${n === getNoteNaming() ? " selected" : ""}>${t(`help.noteNames.${n}`)}</option>`).join("")}
      </select></div>
    <div class="gesture-row">${escapeHtml(t("help.reloads"))}</div>`;
    document.body.appendChild(popup);
    popup.querySelector(".shortcut-help-close").addEventListener("click", closeHelp);
    const themeSel = popup.querySelector("#help-theme");
    themeSel.addEventListener("change", () => saveThemeChoice(themeSel.value));
    const langSel = popup.querySelector("#help-lang");
    langSel.addEventListener("change", () => reloadWith(() => saveLang(langSel.value)));
    const namesSel = popup.querySelector("#help-note-names");
    namesSel.addEventListener("change", () => reloadWith(() => saveNoteNaming(namesSel.value)));
    document.addEventListener("mousedown", closeHelpOnOutsideClick);
  }
  function closeHelpOnOutsideClick(e) {
    const target = e.target;
    if (target.closest?.("#btn-help")) return;
    const popup = document.getElementById("shortcut-help");
    if (popup && !popup.contains(target)) closeHelp();
  }
  function wireKeyboard(actions) {
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t2 = e.target;
      if (t2 instanceof HTMLInputElement || t2 instanceof HTMLTextAreaElement || t2 instanceof HTMLSelectElement) return;
      if (t2 instanceof HTMLElement && t2.isContentEditable) return;
      switch (e.key) {
        case "h":
        case "H":
          actions.toggleHold();
          break;
        case "a":
        case "A":
          actions.toggleArpeggio();
          break;
        case " ":
          e.preventDefault();
          actions.play();
          break;
        case "s":
        case "S":
          actions.sendToSong();
          break;
        case "c":
        case "C":
          actions.clearHistory();
          break;
        case "?":
          e.preventDefault();
          toggleHelp();
          break;
        case "m":
        case "M":
          actions.toggleComputerKeyboard();
          break;
        case "p":
        case "P":
          actions.togglePresentation();
          break;
        case "/":
          e.preventDefault();
          actions.focusChordInput();
          break;
        case "ArrowLeft":
        case "ArrowRight":
          e.preventDefault();
          actions.step(e.key === "ArrowRight" ? 1 : -1);
          break;
        case "Delete":
        case "Backspace":
          if (actions.deleteAtCursor()) e.preventDefault();
          break;
        case "Escape":
          if (!closeHelp()) actions.escape();
          break;
        default:
          if (e.key >= "1" && e.key <= "9") actions.selectCandidate(parseInt(e.key) - 1);
      }
    });
  }

  // src/detector/analysis-panel.ts
  var ANALYSIS_FIELD_KEYS = ["roman", "function", "figbass", "voicing", "diatonic", "scales", "fits", "cadence", "plr", "secondary", "subs", "upper", "forte"];
  var fieldLabel = (f) => t(`field.${f}`);
  var fieldTooltip = (f) => t(`field.${f}.title`);
  var rowLabel = (f) => t(`field.${f}.row`);
  function renderChordSummary(detection, onAltSelect2) {
    const el = document.getElementById("chord-summary");
    if (!el) return;
    if (!detection || detection.kind !== "chord") {
      el.innerHTML = "";
      return;
    }
    const symbol = detection.candidates[detection.selectedIndex];
    const chordName = escapeHtml(chordLabel(symbol));
    const color2 = chordColor(symbol);
    const notes = escapeHtml(detection.notes.map((n) => noteLabel(n.replace(/(-?\d+)$/, ""))).join(" \xB7 "));
    const alts = detection.candidates.slice(1, 7);
    el.innerHTML = `
    <div class="chord-summary-row">
      <span class="chord-name-badge" style="background:${color2}22;border-left:3px solid ${color2}">${chordName}</span>
      <span class="chord-notes">${notes}</span>
      ${alts.map(
      (c, i) => `<button class="alt-chord-btn alt-chord-sum" data-idx="${i + 1}">${escapeHtml(chordLabel(c))}</button>`
    ).join("")}
    </div>`;
    el.querySelectorAll(".alt-chord-sum").forEach((btn) => {
      btn.addEventListener("click", () => onAltSelect2(parseInt(btn.dataset.idx)));
    });
  }
  function renderZone1Analysis(detection, analysis, noteSet2, fieldsVisible, scale, onAltSelect2) {
    renderChordSummary(detection, onAltSelect2);
    const el = document.getElementById("analysis-content");
    if (!el) return;
    el.style.fontSize = scale + "px";
    const visibleCount = ANALYSIS_FIELD_KEYS.filter((f) => fieldsVisible[f]).length;
    el.style.minHeight = Math.ceil((visibleCount * 1.6 - 0.4) * scale) + "px";
    const colEl = document.getElementById("col-analysis");
    if (colEl) {
      const w = Math.round(scale * 19) + "px";
      colEl.style.width = w;
      colEl.style.flex = `0 0 ${w}`;
    }
    const row = (label, val) => `<div class="analysis-row">
      <span class="analysis-label">${label}</span>
      <span class="analysis-value">${escapeHtml(val)}</span>
    </div>`;
    const fieldRow = (f, val) => fieldsVisible[f] ? row(rowLabel(f), val ?? "\u2014") : "";
    let roman = "\u2014", func_ = "\u2014", figuredBass = "\u2014", diatonic = "\u2014", scales = "\u2014", cadence = "\u2014";
    let secondary = null, subs = null;
    let voicing = null, plr = null, upper = null;
    let extra = "";
    if (detection?.kind === "note") {
      extra = row(t("analysis.note"), `${noteLabel(detection.noteName)} \xB7 MIDI ${detection.midiNumber}`);
    } else if (detection?.kind === "interval") {
      extra = row(t("analysis.interval"), `${detection.intervalName} \xB7 ${t("analysis.semitones", { n: detection.semitones })}`) + row(t("analysis.inversion"), detection.inversionName);
    } else if (detection?.kind === "chord" && analysis) {
      roman = analysis.roman;
      func_ = t(`fn.${analysis.function}`);
      figuredBass = analysis.figuredBass || "\u2014";
      diatonic = analysis.isDiatonic ? t("analysis.yes") : analysis.isBorrowed ? t("analysis.borrowed", { mode: analysis.borrowedFrom ?? "?" }) : t("analysis.chromatic");
      scales = analysis.suggestedScales.slice(0, 4).join(", ") || "\u2014";
      cadence = analysis.cadence ? cadenceLabel(analysis.cadence) : "\u2014";
      if (analysis.isSecondary) secondary = `\u2192 ${analysis.secondaryTarget?.split("/")[1] ?? "?"}`;
      if (analysis.substitutions?.length) subs = analysis.substitutions.join(", ");
      voicing = analysis.voicing;
      plr = analysis.transformation;
      if (analysis.upperStructures.length) upper = analysis.upperStructures.join(", ");
    }
    const fits = noteSet2?.fits.length ? (noteSet2.fromMelody ? `(${noteSet2.notes.map(noteLabel).join(" ")}) ` : "") + noteSet2.fits.slice(0, 4).join(", ") : null;
    el.innerHTML = fieldRow("roman", roman) + fieldRow("function", func_) + fieldRow("figbass", figuredBass) + fieldRow("voicing", voicing) + fieldRow("diatonic", diatonic) + fieldRow("scales", scales) + fieldRow("fits", fits) + fieldRow("cadence", cadence) + fieldRow("plr", plr) + fieldRow("secondary", secondary) + fieldRow("subs", subs) + fieldRow("upper", upper) + fieldRow("forte", noteSet2?.forte ?? null) + extra;
  }

  // src/ui/layout.ts
  var viewLabel = (v) => t(`view.${v}`);
  var $ = (id) => document.getElementById(id);
  function loadPanels() {
    return {
      notation: true,
      // always open on load (not persisted)
      instruments: loadBool("panel-instruments", true),
      colPiano: loadBool("panel-colPiano", true),
      colNeck: loadBool("panel-colNeck", true),
      colVelocity: loadBool("panel-colVelocity", true),
      history: loadBool("panel-history", true),
      song: loadBool("panel-song", true),
      cofControls: loadBool("panel-cofControls", true),
      guitarControls: loadBool("panel-guitarControls", true),
      analysisControls: loadBool("panel-analysisControls", true),
      colStaff: loadBool("panel-colStaff", true),
      colAnalysis: loadBool("panel-colAnalysis", true),
      key: loadBool("panel-key", true),
      colCoF: loadBool("panel-colCoF", true),
      colGuitar: loadBool("panel-colGuitar", true)
    };
  }
  function renderLayout(panels, fieldsVisible) {
    $("zone1").innerHTML = buildToolbar() + buildNotationPanel(panels, fieldsVisible) + buildKeyPanel() + buildInstrumentsPanel(panels) + '<div id="midi-banner"></div>';
    buildZoneHeaders();
  }
  function wirePanelToggles(panels) {
    document.querySelectorAll(".col-vis-btn, .toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.dataset.col ?? btn.dataset.panel;
        panels[panel] = !panels[panel];
        if (panel !== "notation") save(`panel-${panel}`, panels[panel]);
        applyPanelVisibility(panels);
      });
    });
  }
  function buildToolbar() {
    return `
    <div id="z1-toolbar" class="toolbar">
      <span id="midi-status" class="midi-status">MIDI: \u2014</span>
      <select id="midi-device" class="ctrl-select"></select>
      <select id="midi-in-ch" class="ctrl-select" title="${t("midi.inChannel.title")}">
        <option value="0">${t("midi.inChannel.all")}</option>
        ${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">${t("midi.inChannel.one", { n: i + 1 })}</option>`).join("")}
      </select>
      <select id="midi-out" class="ctrl-select" title="${t("midi.out.title")}"><option value="">${t("midi.out.off")}</option></select>
      <select id="midi-out-ch" class="ctrl-select" title="${t("midi.outChannel.title")}">
        ${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">${t("midi.outChannel.one", { n: i + 1 })}</option>`).join("")}
      </select>
      <button id="btn-thru" class="mode-btn" title="${t("midi.thru.title")}">${t("midi.thru")}</button>
      <button id="btn-normal" class="mode-btn" data-mode="normal" title="${t("mode.normal.title")}">${t("mode.normal")}</button>
      <button id="btn-hold" class="mode-btn" data-mode="hold" title="${t("mode.hold.title")}">${t("mode.hold")}</button>
      <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio" title="${t("mode.arpeggio.title")}">${t("mode.arpeggio")}</button>
      <button id="btn-keyboard" class="mode-btn" title="${t("keyboard.title")}">\u2328</button>
      <span id="keyboard-status" class="auto-key-label"></span>
      <select id="key-select" class="ctrl-select">
        <option value="">${t("key.auto")}</option>
        ${ALL_KEYS.map((k) => `<option value="${k}">${keyLabel(k)}</option>`).join("")}
      </select>
      <span id="auto-key-label" class="auto-key-label"></span>
      <input id="typed-chord" class="ctrl-select typed-chord" placeholder="${t("typed.placeholder")}" title="${t("typed.title")}" autocomplete="off" spellcheck="false">
      <span class="toolbar-sep"></span>
      <div id="audio-progress" class="audio-progress" title="${t("audio.title")}">
        <div id="audio-progress-fill" class="audio-progress-fill"></div>
        <span id="audio-status" class="audio-status">${t("audio.idle")}</span>
      </div>
      <button id="btn-play-chord" class="ctrl-btn" title="${t("audio.play.title")}">\u25B6</button>
      <select id="audio-instrument" class="ctrl-select" title="${t("audio.instrument.title")}">
        ${GM_INSTRUMENT_GROUPS.map(
      (g) => `<optgroup label="${t(g.label)}">${g.instruments.map(
        (i) => `<option value="${i}"${i === getCurrentInstrument() ? " selected" : ""}>${i.replace(/_/g, " ")}</option>`
      ).join("")}</optgroup>`
    ).join("")}
      </select>
      <input id="audio-volume" type="range" min="0" max="1" step="0.05" value="${getVolume()}" title="${t("audio.volume.title")}" class="volume-slider">
      <div class="view-menu-wrap">
        <button id="btn-present" class="ctrl-btn" title="${t("present.title")}">\u26F6</button>
        <button id="btn-views" class="ctrl-btn" title="${t("views.title")}">\u29C9</button>
        <div id="view-menu" class="view-menu">
          <div class="view-menu-title">${t("views.open")}</div>
          ${VIEW_NAMES.map((v) => `<button class="ctrl-btn" data-view="${v}">${viewLabel(v)}</button>`).join("")}
          <label class="view-menu-bg">${t("views.background")}
            <select id="view-bg" class="ctrl-select">
              ${Object.keys(VIEW_BACKGROUNDS).map((b) => `<option value="${b}">${t(`views.bg.${b}`)}</option>`).join("")}
            </select>
          </label>
          <div class="view-menu-hint">${t("views.hint")}</div>
          <div class="view-menu-title">${t("views.save")}</div>
          ${["staff", "cof", "guitar", "piano"].map((v) => `
            <div class="view-menu-export"><span>${viewLabel(v)}</span>
              <button class="ctrl-btn" data-export="${v}" data-format="svg">SVG</button>
              <button class="ctrl-btn" data-export="${v}" data-format="png">PNG</button>
            </div>`).join("")}
        </div>
      </div>
      <button id="btn-help" class="help-btn" title="${t("help.title")}">?</button>
    </div>`;
  }
  function buildNotationPanel(panels, fieldsVisible) {
    return `
    <div id="notation-panel" class="zone-panel">
      <div class="panel-header">
        <span>${t("notation.title")}</span>
        <div class="col-vis-row">
          <button class="col-vis-btn${panels.colStaff ? " active" : ""}" data-col="colStaff" title="${t("col.staff.title")}">${t("col.staff")}</button>
          <button class="col-vis-btn${panels.colAnalysis ? " active" : ""}" data-col="colAnalysis" title="${t("col.analysis.title")}">${t("col.analysis")}</button>
          <button class="col-vis-btn${panels.colCoF ? " active" : ""}" data-col="colCoF" title="${t("col.cof.title")}">${t("col.cof")}</button>
          <button class="col-vis-btn${panels.colGuitar ? " active" : ""}" data-col="colGuitar" title="${t("col.guitar.title")}">${t("col.guitar")}</button>
        </div>
        <button class="toggle-btn" data-panel="notation">\u25BC</button>
      </div>
      <div id="notation-content">
        <div class="col-auto" id="col-staff">
          <div class="col-label">${t("staff.label")}</div>
          <div id="chord-summary"></div>
          <div id="staff-container"></div>
          <div class="ctrl-row" style="justify-content:center">
            <button id="btn-staff-clef" class="size-ctrl-btn" title="${t("staff.clef.title")}"></button>
            <button id="btn-staff-minus" class="size-ctrl-btn" title="${t("staff.smaller")}">\u2212</button>
            <button id="btn-staff-plus"  class="size-ctrl-btn" title="${t("staff.larger")}">+</button>
          </div>
        </div>
        <div class="col-analysis" id="col-analysis">
          <div class="col-header">
            <div class="col-label">${t("analysis.label")}</div>
            <button class="toggle-btn small" data-panel="analysisControls">\u25BC</button>
          </div>
          <div id="analysis-content"></div>
          <div id="analysis-controls">
            <div class="ctrl-row">
              <button id="btn-analysis-minus" class="size-ctrl-btn" title="${t("ctrl.smaller")}">\u2212</button>
              <button id="btn-analysis-plus"  class="size-ctrl-btn" title="${t("ctrl.larger")}">+</button>
            </div>
            <div class="ctrl-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px">
              ${ANALYSIS_FIELD_KEYS.map(
      (f) => `<button id="btn-field-${f}" class="size-ctrl-btn${fieldsVisible[f] ? " active" : ""}"
                  title="${fieldTooltip(f)}">${fieldLabel(f)}</button>`
    ).join("")}
            </div>
          </div>
        </div>
        <div class="col-auto" id="col-cof">
          <div class="col-header">
            <div class="col-label">${t("cof.label")}</div>
            <button class="toggle-btn small" data-panel="cofControls">\u25BC</button>
          </div>
          <div id="cof-container"></div>
          <div id="cof-controls">
            <div class="ctrl-row">
              <button id="btn-cof-minus" class="size-ctrl-btn" title="${t("ctrl.smaller")}">\u2212</button>
              <button id="btn-cof-plus"  class="size-ctrl-btn" title="${t("ctrl.larger")}">+</button>
            </div>
            <div class="ctrl-row">
              <button id="btn-cof-flat"   class="size-ctrl-btn" title="${t("cof.flat.title")}">b</button>
              <button id="btn-cof-sharp"  class="size-ctrl-btn" title="${t("cof.sharp.title")}">#</button>
              <button id="btn-cof-minor"  class="size-ctrl-btn" title="${t("cof.minor.title")}">m</button>
              <button id="btn-cof-deg"    class="size-ctrl-btn" title="${t("cof.degrees.title")}">\xB0</button>
              <button id="btn-cof-7"      class="size-ctrl-btn" title="${t("cof.sevenths.title")}">7</button>
            </div>
          </div>
        </div>
        <div class="col-auto" id="col-guitar">
          <div class="col-header">
            <div class="col-label">${t("guitar.label")}</div>
            <button class="toggle-btn small" data-panel="guitarControls">\u25BC</button>
          </div>
          <div id="guitar-container"></div>
        </div>
      </div>
    </div>`;
  }
  function buildKeyPanel() {
    return `
    <div id="key-panel" class="zone-panel">
      <div class="panel-header">
        <span>${t("keyPanel.title")}</span>
        <div class="ctrl-row">
          <button id="btn-key-minus" class="size-ctrl-btn" title="${t("ctrl.smaller")}">\u2212</button>
          <button id="btn-key-plus"  class="size-ctrl-btn" title="${t("ctrl.larger")}">+</button>
          <button id="btn-key-7"     class="size-ctrl-btn" title="${t("keyPanel.sevenths.title")}">7</button>
          <button id="btn-key-neg"   class="size-ctrl-btn" title="${t("keyPanel.neg.title")}">${t("keyPanel.neg")}</button>
          <button id="btn-key-par"   class="size-ctrl-btn" title="${t("keyPanel.par.title")}">${t("keyPanel.par")}</button>
          <button id="btn-key-colt"  class="size-ctrl-btn" title="${t("keyPanel.colt.title")}">${t("keyPanel.colt")}</button>
        </div>
        <button class="toggle-btn" data-panel="key">\u25BC</button>
      </div>
      <div id="key-container"></div>
    </div>`;
  }
  function buildInstrumentsPanel(panels) {
    return `
    <div id="instruments-panel" class="zone-panel">
      <div class="panel-header">
        <span>${t("instruments.title")}</span>
        <div class="col-vis-row">
          <button class="col-vis-btn${panels.colPiano ? " active" : ""}" data-col="colPiano" title="${t("col.piano.title")}">${t("col.piano")}</button>
          <button class="col-vis-btn${panels.colNeck ? " active" : ""}" data-col="colNeck"  title="${t("col.neck.title")}">${t("col.neck")}</button>
          <button class="col-vis-btn${panels.colVelocity ? " active" : ""}" data-col="colVelocity" title="${t("col.velocity.title")}">${t("col.velocity")}</button>
        </div>
        <button class="toggle-btn" data-panel="instruments">\u25BC</button>
      </div>
      <div id="instruments-content">
        <div id="col-piano"><div id="piano-container"></div></div>
        <div id="col-velocity"><div class="col-label">${t("velocity.label")}</div><div id="velocity-container"></div></div>
        <div id="col-neck">
          <div id="neck-container"></div>
          <div class="ctrl-row" style="justify-content:center;margin-top:4px">
            <button id="btn-neck-minus" class="size-ctrl-btn" title="${t("ctrl.smaller")}">\u2212</button>
            <button id="btn-neck-plus"  class="size-ctrl-btn" title="${t("ctrl.larger")}">+</button>
          </div>
        </div>
      </div>
    </div>`;
  }
  function buildZoneHeaders() {
    $("zone2").innerHTML = `
    <div class="zone-header">
      <span class="zone-title">${t("history.title")}</span>
      <button class="toggle-btn" data-panel="history">\u25BC</button>
    </div>
    <div id="zone2-content"></div>`;
    $("zone3").innerHTML = `
    <div class="zone-header">
      <span class="zone-title">${t("song.title")}</span>
      <button class="toggle-btn" data-panel="song">\u25BC</button>
    </div>
    <div id="zone3-content"></div>`;
  }
  function applyPanelVisibility(panels) {
    const nc = $("notation-content");
    if (nc) nc.style.display = panels.notation ? "flex" : "none";
    const ic = $("instruments-content");
    if (ic) ic.style.display = panels.instruments ? "" : "none";
    const cp = $("col-piano");
    if (cp) cp.style.display = panels.colPiano ? "" : "none";
    const cn = $("col-neck");
    if (cn) cn.style.display = panels.colNeck ? "" : "none";
    const cv = $("col-velocity");
    if (cv) cv.style.display = panels.colVelocity ? "" : "none";
    const z2 = $("zone2-content");
    if (z2) z2.style.display = panels.history ? "" : "none";
    const z3 = $("zone3-content");
    if (z3) z3.style.display = panels.song ? "" : "none";
    const cc = $("cof-controls");
    if (cc) cc.style.display = panels.cofControls ? "" : "none";
    setGuitarControlsVisible(panels.guitarControls);
    const gcw = document.getElementById("guitar-ctrl-wrap");
    if (gcw) gcw.style.display = panels.guitarControls ? "" : "none";
    const ac = $("analysis-controls");
    if (ac) ac.style.display = panels.analysisControls ? "" : "none";
    const kp = $("key-container");
    if (kp) kp.style.display = panels.key ? "" : "none";
    const cs = $("col-staff");
    if (cs) cs.style.display = panels.colStaff ? "" : "none";
    const ca = $("col-analysis");
    if (ca) ca.style.display = panels.colAnalysis ? "" : "none";
    const ccof = $("col-cof");
    if (ccof) ccof.style.display = panels.colCoF ? "" : "none";
    const cg = $("col-guitar");
    if (cg) cg.style.display = panels.colGuitar ? "" : "none";
    document.querySelectorAll(".col-vis-btn").forEach((btn) => {
      const col = btn.dataset.col;
      if (col) btn.classList.toggle("active", !!panels[col]);
    });
    ["notation", "instruments", "history", "song", "cofControls", "guitarControls", "analysisControls", "key"].forEach((key) => {
      const btn = document.querySelector(`.toggle-btn[data-panel="${key}"]`);
      if (btn) btn.textContent = panels[key] ? "\u25B2" : "\u25BC";
    });
  }

  // src/app.ts
  var staffWidth = 380;
  var staffScale = loadNumber("staff-scale", 2, 1, 3);
  var staffClef = loadChoice("staff-clef", STAFF_CLEFS, "grand");
  var cofSize = loadNumber("cof-size", 160, 100, 400);
  var cofAccidental = loadChoice("cof-accidental", ["flat", "sharp"], "flat");
  var cofShowMinor = loadBool("cof-show-minor", true);
  var cofShowDegrees = loadBool("cof-show-degrees", false);
  var cofShow7ths = loadBool("cof-show-7ths", false);
  var analysisFieldsVisible = Object.fromEntries(
    ANALYSIS_FIELD_KEYS.map((f) => [f, loadBool(`analysis-field-${f}`, true)])
  );
  var analysisScale = loadNumber("analysis-scale", 11, 8, 20);
  var keyScale = loadNumber("key-scale", 11, 8, 20);
  var keySevenths = loadBool("key-sevenths", false);
  var keyShowNegative = loadBool("key-show-negative", true);
  var keyShowParallel = loadBool("key-show-parallel", true);
  var keyShowColtrane = loadBool("key-show-coltrane", true);
  var initialSong = loadActiveSong();
  var state = {
    activeKey: normalizeKey(initialSong.key),
    // each song keeps the key it is analysed in
    detection: null,
    analysis: null,
    history: [],
    song: initialSong,
    activeCursorId: null,
    historyActiveCursorId: null,
    captureTargetId: null,
    panels: loadPanels()
  };
  var $2 = (id) => document.getElementById(id);
  function translatePage() {
    applyDocumentLang();
    const warning = $2("browser-warning");
    warning.firstChild.textContent = t("page.noMidi") + " ";
    $2("cdn-error-banner").textContent = t("page.cdnError");
  }
  function init() {
    translatePage();
    applyTheme();
    followSystemTheme();
    onThemeChange(() => {
      for (const k of Object.keys(lastRenderSig)) delete lastRenderSig[k];
      renderDetector();
    });
    if (!navigator.requestMIDIAccess) {
      $2("browser-warning").style.display = "block";
    }
    document.addEventListener("click", initAudioOnGesture, { once: true });
    preloadAudio();
    buildLayout();
    wireShortcuts();
    wireComputerKeyboard();
    setComputerKeyboardChange(updateComputerKeyboardButton);
    $2("btn-keyboard").addEventListener("click", () => {
      initAudioOnGesture();
      toggleComputerKeyboard();
    });
    window.addEventListener("pointerup", onPianoRelease);
    window.addEventListener("pointercancel", onPianoRelease);
    const chordInput = $2("typed-chord");
    chordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitTypedChord(chordInput);
      } else if (e.key === "Escape") chordInput.blur();
    });
    chordInput.addEventListener("input", () => chordInput.classList.remove("invalid"));
    setModeBtn(getMode());
    renderDetector();
    initMidi().then((result) => {
      if (result.denied) {
        showMidiBanner(t("midi.denied"));
      }
      if (!result.unsupported) {
        refreshDeviceDropdown();
        refreshOutputDropdown();
        setModeBtn(getMode());
      }
    });
    setNoteChangeCallback(onNoteChange2);
    setSoundCallbacks({
      noteOn: (n, v, src) => {
        liveNoteOn(n, v);
        outLiveOn(n, v, src);
      },
      noteOff: (n, src) => {
        liveNoteOff(n);
        outLiveOff(n, src);
      },
      sustain: (down, src) => {
        setSustain(down);
        outSustain(down, src);
      }
    });
    setPreviewListener(outPreview);
    wireMidiOut();
    setHistoryChangeCallback(onHistoryChange);
    restoreCarriedHistory();
    setAudioMissedCallback(() => {
      const el = document.getElementById("audio-progress");
      if (!el) return;
      el.classList.remove("missed");
      void el.offsetWidth;
      el.classList.add("missed");
    });
    let progressTimer = null;
    let progressValue = 0;
    setAudioStatusCallback((status2) => {
      const el = document.getElementById("audio-status");
      const fill = document.getElementById("audio-progress-fill");
      if (!el || !fill) return;
      const known = ["idle", "loading", "suspended", "ready", "error"];
      el.textContent = known.includes(status2) ? t(`audio.${status2}`) : status2;
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
      if (status2 === "loading") {
        progressValue = 0;
        fill.style.background = "";
        fill.style.transition = "none";
        fill.style.width = "0%";
        progressTimer = setInterval(() => {
          progressValue += (90 - progressValue) * 0.06;
          fill.style.transition = "width 0.1s linear";
          fill.style.width = progressValue.toFixed(1) + "%";
        }, 100);
      } else if (status2 === "suspended") {
        fill.style.background = "var(--warn)";
        fill.style.transition = "width 0.3s ease-out";
        fill.style.width = "100%";
      } else if (status2 === "ready") {
        fill.style.background = "var(--ok-strong)";
        fill.style.transition = "width 0.2s ease-out";
        fill.style.width = "100%";
      } else if (status2 === "error") {
        fill.style.background = "var(--danger)";
        fill.style.transition = "width 0.2s ease-out";
        fill.style.width = "100%";
      } else {
        fill.style.background = "";
        fill.style.transition = "none";
        fill.style.width = "0%";
      }
    });
    renderZone3();
  }
  function makeSongHandlers() {
    return {
      onChordClick: (id, symbol, notes) => {
        state.activeCursorId = id;
        markActiveChord(id);
        if (symbol) showChord(symbol, notes, previousSongSymbol(id));
      },
      onChordCapture: (id) => {
        state.captureTargetId = id;
        state.activeCursorId = id;
        renderZone3();
      },
      activeCursorId: state.activeCursorId,
      captureTargetId: state.captureTargetId,
      activeKey: analysisKey(),
      onSongChange: (song) => {
        state.song = song;
        saveSong(song);
        renderZone3();
      },
      songs: listSongs(),
      onOpenSong: (id) => {
        const song = openSong(id);
        if (song) showSong(song);
      },
      onNewSong: () => showSong(newSong()),
      onDeleteSong: () => {
        const { deleted, open: open2 } = deleteSong(state.song.id);
        showSong(open2);
        if (deleted) showUndo(t("song.deleted", { title: deleted.title }), () => {
          restoreSong(deleted);
          showSong(deleted);
        });
      }
    };
  }
  function showSong(song) {
    dismiss();
    cancelCapture();
    state.song = song;
    state.activeCursorId = null;
    state.captureTargetId = null;
    applyKey(normalizeKey(song.key));
  }
  function syncCofAccidentalButtons() {
    const key = analysisKey();
    const used = cofAccidentalFor(key, cofAccidental);
    for (const [id, acc] of [["btn-cof-flat", "flat"], ["btn-cof-sharp", "sharp"]]) {
      const btn = $2(id);
      btn.classList.toggle("active", used === acc);
      btn.disabled = !!key;
      btn.title = key ? t("cof.spelledInKey", { key: keyLabel(key) }) : acc === "flat" ? t("cof.flat.title") : t("cof.sharp.title");
    }
  }
  function wireLayoutEvents() {
    const updateCofButtons = () => {
      syncCofAccidentalButtons();
      $2("btn-cof-minor").style.opacity = cofShowMinor ? "1" : "0.4";
      $2("btn-cof-deg").style.opacity = cofShowDegrees ? "1" : "0.4";
      $2("btn-cof-7").style.opacity = cofShow7ths ? "1" : "0.4";
    };
    updateCofButtons();
    const onCofControl = (id, apply) => {
      $2(id).addEventListener("click", () => {
        apply();
        updateCofButtons();
        renderDiagrams();
      });
    };
    onCofControl("btn-cof-minus", () => {
      cofSize = Math.max(100, cofSize - 20);
      save("cof-size", cofSize);
    });
    onCofControl("btn-cof-plus", () => {
      cofSize = Math.min(400, cofSize + 20);
      save("cof-size", cofSize);
    });
    onCofControl("btn-cof-flat", () => {
      cofAccidental = "flat";
      save("cof-accidental", cofAccidental);
    });
    onCofControl("btn-cof-sharp", () => {
      cofAccidental = "sharp";
      save("cof-accidental", cofAccidental);
    });
    onCofControl("btn-cof-minor", () => {
      cofShowMinor = !cofShowMinor;
      save("cof-show-minor", cofShowMinor);
    });
    onCofControl("btn-cof-deg", () => {
      cofShowDegrees = !cofShowDegrees;
      save("cof-show-degrees", cofShowDegrees);
    });
    onCofControl("btn-cof-7", () => {
      cofShow7ths = !cofShow7ths;
      save("cof-show-7ths", cofShow7ths);
    });
    $2("btn-analysis-minus").addEventListener("click", () => {
      analysisScale = Math.max(8, analysisScale - 1);
      save("analysis-scale", analysisScale);
      renderAnalysisPanel();
    });
    $2("btn-analysis-plus").addEventListener("click", () => {
      analysisScale = Math.min(20, analysisScale + 1);
      save("analysis-scale", analysisScale);
      renderAnalysisPanel();
    });
    const resizeStaff = (delta) => {
      staffScale = Math.min(3, Math.max(1, staffScale + delta));
      save("staff-scale", staffScale);
      renderStaff($2("staff-container"), displayedNotes(), staffWidth, analysisKey(), staffScale, staffClef);
    };
    const clefBtn = $2("btn-staff-clef");
    const showClef = () => {
      clefBtn.textContent = t(`staff.clef.${staffClef}`);
    };
    showClef();
    clefBtn.addEventListener("click", () => {
      staffClef = STAFF_CLEFS[(STAFF_CLEFS.indexOf(staffClef) + 1) % STAFF_CLEFS.length];
      save("staff-clef", staffClef);
      showClef();
      renderZone1Diagrams(displayedNotes(), selectedSymbol());
    });
    $2("btn-staff-minus").addEventListener("click", () => resizeStaff(-0.25));
    $2("btn-staff-plus").addEventListener("click", () => resizeStaff(0.25));
    const reRenderNeck = () => renderNeck($2("neck-container"), displayedNotes(), !keyPrefersSharps(analysisKey()));
    $2("btn-neck-minus").addEventListener("click", () => {
      adjustNeckSpacing(-2);
      reRenderNeck();
    });
    $2("btn-neck-plus").addEventListener("click", () => {
      adjustNeckSpacing(2);
      reRenderNeck();
    });
    ANALYSIS_FIELD_KEYS.forEach((f) => {
      $2(`btn-field-${f}`).addEventListener("click", () => {
        analysisFieldsVisible[f] = !analysisFieldsVisible[f];
        save(`analysis-field-${f}`, analysisFieldsVisible[f]);
        $2(`btn-field-${f}`).classList.toggle("active", analysisFieldsVisible[f]);
        renderAnalysisPanel();
      });
    });
    const updateKeyButtons = () => {
      $2("btn-key-7").style.opacity = keySevenths ? "1" : "0.4";
      $2("btn-key-neg").style.opacity = keyShowNegative ? "1" : "0.4";
      $2("btn-key-par").style.opacity = keyShowParallel ? "1" : "0.4";
      $2("btn-key-colt").style.opacity = keyShowColtrane ? "1" : "0.4";
    };
    updateKeyButtons();
    const onKeyControl = (id, apply) => {
      $2(id).addEventListener("click", () => {
        apply();
        updateKeyButtons();
        renderDiagrams();
      });
    };
    onKeyControl("btn-key-minus", () => {
      keyScale = Math.max(8, keyScale - 1);
      save("key-scale", keyScale);
    });
    onKeyControl("btn-key-plus", () => {
      keyScale = Math.min(20, keyScale + 1);
      save("key-scale", keyScale);
    });
    onKeyControl("btn-key-7", () => {
      keySevenths = !keySevenths;
      save("key-sevenths", keySevenths);
    });
    onKeyControl("btn-key-neg", () => {
      keyShowNegative = !keyShowNegative;
      save("key-show-negative", keyShowNegative);
    });
    onKeyControl("btn-key-par", () => {
      keyShowParallel = !keyShowParallel;
      save("key-show-parallel", keyShowParallel);
    });
    onKeyControl("btn-key-colt", () => {
      keyShowColtrane = !keyShowColtrane;
      save("key-show-coltrane", keyShowColtrane);
    });
    wirePanelToggles(state.panels);
    wireViewMenu();
    if (state.activeKey) {
      $2("key-select").value = state.activeKey;
    }
    document.querySelectorAll(".mode-btn[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => setModeBtn(btn.dataset.mode));
    });
    $2("key-select").addEventListener("change", (e) => {
      setActiveKey(e.target.value || null);
    });
    $2("btn-help").addEventListener("click", toggleHelp);
    $2("btn-play-chord").addEventListener("click", playCurrent);
    $2("audio-instrument").addEventListener("change", (e) => {
      setInstrument(e.target.value);
    });
    $2("audio-volume").addEventListener("input", (e) => {
      setVolume(parseFloat(e.target.value));
    });
  }
  function buildLayout() {
    renderLayout(state.panels, analysisFieldsVisible);
    wireLayoutEvents();
    applyPanelVisibility(state.panels);
  }
  var autoKey = null;
  var cadencePrev = null;
  var lastChordNotes = [];
  function analysisKey() {
    return state.activeKey ?? autoKey;
  }
  function selectedSymbol() {
    const d = state.detection;
    if (d?.kind !== "chord") return null;
    const sym = d.candidates[d.selectedIndex];
    return sym && sym !== "?" ? sym : null;
  }
  function displayedNotes() {
    const d = state.detection;
    if (!d) return [];
    return d.kind === "note" ? [d.noteName] : d.notes;
  }
  var lastAnalysisSig = "";
  var noteSet = null;
  var MELODY_GAP_MS = 6e3;
  var melody = [];
  var melodyAt = 0;
  var melodyHeld = /* @__PURE__ */ new Set();
  function trackMelody(notes, detection) {
    const struck = notes.filter((n) => !melodyHeld.has(n));
    melodyHeld = new Set(notes);
    if (!detection || !struck.length) return;
    if (detection.kind === "chord") {
      melody = [];
      return;
    }
    const now = Date.now();
    if (now - melodyAt > MELODY_GAP_MS) melody = [];
    melodyAt = now;
    const names = detection.kind === "note" ? [detection.noteName] : detection.notes;
    const midis = detection.kind === "note" ? [detection.midiNumber] : notes;
    names.forEach((name, i) => {
      const pc = name.replace(/-?\d+$/, "");
      if (struck.includes(midis[i]) && !melody.includes(pc)) melody.push(pc);
    });
  }
  function refreshAnalysis() {
    const sym = selectedSymbol();
    const notes = displayedNotes();
    const sig = `${sym}|${analysisKey()}|${cadencePrev}|${notes.join(" ")}|${melody.join(" ")}`;
    if (sig === lastAnalysisSig) return;
    lastAnalysisSig = sig;
    state.analysis = sym ? buildHarmonicAnalysis(sym, analysisKey(), cadencePrev, notes) : null;
    const kind = state.detection?.kind;
    const useMelody = (kind === "note" || kind === "interval") && melody.length >= 2;
    noteSet = useMelody ? analyzeNoteSet(melody, analysisKey(), true) : notes.length >= 2 ? analyzeNoteSet(notes, analysisKey()) : null;
  }
  function renderAnalysisPanel() {
    renderZone1Analysis(state.detection, state.analysis, noteSet, analysisFieldsVisible, analysisScale, onAltSelect);
  }
  function renderDiagrams() {
    renderZone1Diagrams(displayedNotes(), selectedSymbol());
  }
  function renderDetector() {
    renderAnalysisPanel();
    renderDiagrams();
    publishView();
  }
  var sendView = createViewPublisher();
  function publishView() {
    const view = viewState();
    sendView(view);
    updatePresentation(view);
  }
  function viewState() {
    const d = state.detection;
    return {
      key: analysisKey(),
      kind: d?.kind ?? null,
      // Written as the page writes it: the views take no language of their own
      label: !d ? "" : d.kind === "note" ? noteLabel(d.pitchClass) : d.kind === "interval" ? d.intervalName : chordLabel(selectedSymbol() ?? ""),
      symbol: selectedSymbol(),
      notes: displayedNotes(),
      roman: state.analysis?.roman ?? null,
      function: state.analysis?.function ?? null,
      guitarVoicing: getGuitarVoicingIndex()
    };
  }
  function presentedViews() {
    const p = state.panels;
    const views = ["chord"];
    if (p.notation && p.colStaff) views.push("staff");
    if (p.notation && p.colCoF) views.push("cof");
    if (p.notation && p.colGuitar) views.push("guitar");
    if (p.instruments && p.colPiano) views.push("piano");
    return views;
  }
  function togglePresentation() {
    if (isPresenting()) {
      closePresentation();
      return;
    }
    $2("view-menu").classList.remove("open");
    openPresentation(presentedViews(), viewState(), () => $2("btn-present").classList.remove("active-mode"));
    $2("btn-present").classList.add("active-mode");
  }
  var viewBackground = loadChoice("view-bg", Object.keys(VIEW_BACKGROUNDS), "green");
  function wireViewMenu() {
    const menu = $2("view-menu");
    $2("btn-views").addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target)) menu.classList.remove("open");
    });
    const bgSel = $2("view-bg");
    bgSel.value = viewBackground;
    bgSel.addEventListener("change", () => {
      viewBackground = bgSel.value;
      save("view-bg", viewBackground);
    });
    menu.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        const [w, h] = VIEW_WINDOW[view];
        window.open(viewUrl(view, viewBackground), `modus-view-${view}`, `popup,width=${w},height=${h}`)?.focus();
        menu.classList.remove("open");
      });
    });
    menu.querySelectorAll("[data-export]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ok = await exportDiagram(btn.dataset.export, btn.dataset.format, selectedSymbol() ?? analysisKey());
        if (!ok) btn.classList.add("invalid");
        else menu.classList.remove("open");
      });
    });
    setGuitarVoicingChange(() => publishView());
    $2("btn-present").addEventListener("click", (e) => {
      e.stopPropagation();
      togglePresentation();
    });
  }
  var detectionFromMidi = false;
  function respellMidiDetection() {
    if (detectionFromMidi) state.detection = spellDetection(state.detection, analysisKey());
  }
  function showDetection(detection, prev) {
    state.detection = detection;
    cadencePrev = prev;
    if (selectedSymbol()) lastChordNotes = displayedNotes();
    refreshAnalysis();
    renderDetector();
  }
  function showChord(symbol, notes, prev) {
    detectionFromMidi = false;
    showDetection({
      kind: "chord",
      notes: notes?.length ? spellVoicing(notes, symbol, analysisKey()) : chordNoteNames(symbol),
      candidates: [symbol],
      selectedIndex: 0
    }, prev);
  }
  function onAltSelect(idx) {
    if (state.detection?.kind !== "chord") return;
    const symbol = state.detection.candidates[idx];
    state.detection = {
      ...state.detection,
      selectedIndex: idx,
      notes: spellVoicing(state.detection.notes, symbol === "?" ? null : symbol, analysisKey())
    };
    refreshAnalysis();
    renderDetector();
  }
  function setActiveKey(key) {
    state.song = { ...state.song, key };
    saveSong(state.song);
    applyKey(key);
  }
  function applyKey(key) {
    state.activeKey = key;
    $2("key-select").value = key ?? "";
    updateAutoKeyLabel();
    respellMidiDetection();
    refreshAnalysis();
    renderDetector();
    renderZone2();
    renderZone3();
  }
  function playCurrent() {
    const notes = selectedSymbol() ? displayedNotes() : lastChordNotes;
    if (notes.length) playNoteNames(notes);
  }
  function previousHistorySymbol(symbol) {
    return state.history.find((e) => e.symbol !== symbol)?.symbol ?? null;
  }
  function previousSongSymbol(chordId) {
    const chords = songChords(state.song).filter((c) => c.symbol);
    const i = chords.findIndex((c) => c.id === chordId);
    return i > 0 ? chords[i - 1].symbol : null;
  }
  var CAPTURE_SETTLE_MS = 250;
  var captureTimer = null;
  var captureArmed = true;
  function scheduleCapture(symbol, notes) {
    if (captureTimer) clearTimeout(captureTimer);
    captureTimer = setTimeout(() => {
      captureTimer = null;
      const targetId = state.captureTargetId;
      if (!targetId) return;
      state.song = updateChord(state.song, targetId, symbol, notes);
      saveSong(state.song);
      captureArmed = false;
      const next = findChordAfter(state.song, targetId)?.id ?? null;
      state.activeCursorId = next;
      state.captureTargetId = next;
      renderZone3();
    }, CAPTURE_SETTLE_MS);
  }
  function cancelCapture() {
    if (captureTimer) {
      clearTimeout(captureTimer);
      captureTimer = null;
    }
  }
  function onNoteChange2(notes) {
    detectionFromMidi = true;
    const result = spellDetection(analyzeNotes(notes), analysisKey());
    trackMelody(notes, result);
    const top = result?.kind === "chord" ? result.candidates[0] : null;
    const known = top && top !== "?" ? top : null;
    if (state.captureTargetId) {
      if (notes.length < 3) captureArmed = true;
      if (captureArmed && known && result?.kind === "chord") scheduleCapture(known, result.notes);
      else cancelCapture();
    }
    showDetection(result, known ? previousHistorySymbol(known) : null);
    if (known && result?.kind === "chord") notifyChordDetected(known, result.notes);
  }
  function onHistoryChange(entries2) {
    state.history = entries2;
    const nextAutoKey = getAutoKey(entries2);
    const autoKeyChanged = nextAutoKey !== autoKey;
    autoKey = nextAutoKey;
    updateAutoKeyLabel();
    if (autoKeyChanged && !state.activeKey) {
      respellMidiDetection();
      refreshAnalysis();
      renderDetector();
      renderZone3();
    }
    renderZone2();
  }
  function updateAutoKeyLabel() {
    $2("auto-key-label").textContent = !state.activeKey && autoKey ? t("key.autoDetected", { key: keyLabel(autoKey) }) : "";
  }
  var lastRenderSig = {};
  function renderIfChanged(name, sig, render) {
    if (lastRenderSig[name] === sig) return;
    lastRenderSig[name] = sig;
    render();
  }
  var PIANO_VELOCITY = 90;
  var pianoNote = null;
  function onPianoPress(midi) {
    if (pianoNote !== null) pointerUp(pianoNote);
    pianoNote = midi;
    pointerDown(midi, PIANO_VELOCITY);
  }
  function onPianoRelease() {
    if (pianoNote === null) return;
    pointerUp(pianoNote);
    pianoNote = null;
  }
  function submitTypedChord(input) {
    const symbol = readTypedChord(input.value);
    if (!symbol) return;
    const valid = isKnownChord(symbol);
    input.classList.toggle("invalid", !valid);
    if (!valid) return;
    showChord(symbol, void 0, null);
    playChord(symbol);
  }
  function updateComputerKeyboardButton() {
    const on = isComputerKeyboardOn();
    $2("btn-keyboard").classList.toggle("active-mode", on);
    $2("keyboard-status").textContent = on ? computerKeyboardStatus() : "";
  }
  function noteVelocities(noteNames) {
    if (!detectionFromMidi) return [];
    return noteNames.flatMap((name) => {
      const midi = noteNameToMidi(name);
      const velocity2 = midi === null ? null : getVelocity(midi);
      return midi === null || velocity2 === null ? [] : [{ name, midi, velocity: velocity2 }];
    });
  }
  function renderZone1Diagrams(noteNames, chordSymbol) {
    const key = analysisKey();
    const notes = noteNames.join(" ");
    syncCofAccidentalButtons();
    const cofOpts = { accidental: cofAccidentalFor(key, cofAccidental), showMinor: cofShowMinor, showDegrees: cofShowDegrees, show7ths: cofShow7ths };
    renderIfChanged("staff", `${notes}|${key}|${staffScale}|${staffClef}`, () => renderStaff($2("staff-container"), noteNames, staffWidth, key, staffScale, staffClef));
    renderIfChanged("piano", `${notes}|${chordSymbol}`, () => renderPiano($2("piano-container"), noteNames, chordSymbol, onPianoPress));
    const vel = noteVelocities(noteNames);
    renderIfChanged("velocity", JSON.stringify(vel), () => renderVelocity($2("velocity-container"), vel));
    renderIfChanged("neck", `${notes}|${keyPrefersSharps(key)}`, () => renderNeck($2("neck-container"), noteNames, !keyPrefersSharps(key)));
    renderIfChanged("guitar", `${chordSymbol}`, () => renderGuitar($2("guitar-container"), chordSymbol, noteNames));
    renderIfChanged("cof", `${key}|${chordSymbol}|${cofSize}|${JSON.stringify(cofOpts)}`, () => renderCircleOfFifths($2("cof-container"), key, chordSymbol, onCofClick, cofSize, cofOpts));
    const keyOpts = { sevenths: keySevenths, showNegative: keyShowNegative, showParallel: keyShowParallel, showColtrane: keyShowColtrane, fontScale: keyScale };
    const keyTitle = key ? state.activeKey ? keyLabel(key) : t("keyPanel.auto", { key: keyLabel(key) }) : "";
    renderIfChanged("key", `${keyTitle}|${chordSymbol}|${JSON.stringify(keyOpts)}`, () => renderKeyExplorer($2("key-container"), key ? buildKeyMap(key, keySevenths) : null, keyTitle, chordSymbol, onKeyChordClick, keyOpts));
  }
  function onKeyChordClick(chord) {
    playChord(chord);
    showChord(chord, void 0, previousHistorySymbol(chord));
  }
  var COF_DOUBLE_MS = 400;
  var lastCofClick = { key: null, at: 0 };
  function onCofClick(chord, key) {
    const now = performance.now();
    if (key && lastCofClick.key === key && now - lastCofClick.at < COF_DOUBLE_MS) {
      lastCofClick = { key: null, at: 0 };
      setActiveKey(normalizeKey(key));
      return;
    }
    lastCofClick = { key, at: now };
    playChord(chord);
    showChord(chord, void 0, previousHistorySymbol(chord));
  }
  function renderZone2() {
    renderHistory(
      $2("zone2-content"),
      analysisKey(),
      (entry) => {
        state.historyActiveCursorId = entry.id;
        const i = state.history.findIndex((e) => e.id === entry.id);
        showChord(entry.symbol, entry.notes, state.history[i + 1]?.symbol ?? null);
        markActiveHistoryEntry($2("zone2-content"), entry.id);
      },
      state.historyActiveCursorId
    );
  }
  function renderZone3() {
    mountSong($2("zone3-content"), state.song, makeSongHandlers());
  }
  function sendToSong(entry) {
    if (!state.song.sections.length) {
      state.song = addSection(state.song, t("section.verse"), "verse");
    }
    if (state.activeCursorId) {
      state.song = insertChordAfter(state.song, state.activeCursorId, entry.symbol, entry.notes);
      const next = findChordAfter(state.song, state.activeCursorId);
      state.activeCursorId = next?.id ?? state.activeCursorId;
    } else {
      const lastSection = state.song.sections[state.song.sections.length - 1];
      const lastMeasure = lastSection.measures[lastSection.measures.length - 1];
      state.song = addChord(state.song, lastSection.id, lastMeasure.id, entry.symbol, entry.notes);
    }
    saveSong(state.song);
    renderZone3();
  }
  function songChords(song) {
    return song.sections.flatMap((s) => s.measures.flatMap((m) => m.chords));
  }
  function findChordAfter(song, afterId) {
    const chords = songChords(song);
    const i = chords.findIndex((c) => c.id === afterId);
    return i !== -1 ? chords[i + 1] ?? null : null;
  }
  var deviceListenersAttached = false;
  function refreshDeviceDropdown() {
    const sel = $2("midi-device");
    const devices = getDevices();
    sel.innerHTML = devices.length ? devices.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join("") : `<option>${escapeHtml(t("midi.noDeviceOption"))}</option>`;
    sel.onchange = () => chooseDevice(sel.value);
    const target = resolveDevice();
    if (target) sel.value = target;
    $2("midi-status").textContent = devices.length ? "MIDI" : t("midi.noDevices");
    $2("midi-status").title = devices.length ? t("midi.connected") : t("midi.noDevices");
    $2("midi-status").style.color = devices.length ? "var(--ok)" : "var(--text-dim)";
    if (!deviceListenersAttached) {
      deviceListenersAttached = true;
      window.addEventListener("midi-devices-changed", () => {
        refreshDeviceDropdown();
        refreshOutputDropdown();
      });
      window.addEventListener("midi-device-disconnected", () => {
        $2("midi-status").textContent = t("midi.disconnected");
        $2("midi-status").title = t("midi.disconnected");
        $2("midi-status").style.color = "var(--danger-soft)";
      });
    }
  }
  function refreshOutputDropdown() {
    const sel = $2("midi-out");
    const { port } = getOutputSettings();
    const outputs = getOutputs();
    const present = port && outputs.find((o) => o.name === port.name);
    sel.innerHTML = `<option value="">${t("midi.out.off")}</option>` + outputs.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(t("midi.out.port", { name: o.name }))}</option>`).join("") + // A chosen port that is unplugged stays chosen and comes back when it reappears
    (port && !present ? `<option value="__missing" disabled>${escapeHtml(t("midi.out.absent", { name: port.name }))}</option>` : "");
    sel.value = present ? present.id : port ? "__missing" : "";
    const loops = outputLoops();
    sel.classList.toggle("invalid", loops);
    sel.title = loops ? t("midi.out.loops") : t("midi.out.title");
  }
  function wireMidiOut() {
    const inCh = $2("midi-in-ch");
    inCh.value = String(getInputChannel());
    inCh.addEventListener("change", () => setInputChannel(parseInt(inCh.value)));
    const sel = $2("midi-out");
    const ch = $2("midi-out-ch");
    const thruBtn = $2("btn-thru");
    const { channel: channel2, thru: thru2 } = getOutputSettings();
    ch.value = String(channel2);
    thruBtn.classList.toggle("active-mode", thru2);
    sel.addEventListener("change", () => {
      chooseOutput(sel.value || null);
      refreshOutputDropdown();
    });
    ch.addEventListener("change", () => setOutputChannel(parseInt(ch.value)));
    thruBtn.addEventListener("click", () => {
      const on = !getOutputSettings().thru;
      setThru(on);
      thruBtn.classList.toggle("active-mode", on);
    });
    $2("midi-device").addEventListener("change", () => setTimeout(refreshOutputDropdown));
  }
  function showMidiBanner(msg) {
    const el = $2("midi-banner");
    el.textContent = msg;
    el.style.display = "block";
  }
  function wireShortcuts() {
    wireKeyboard({
      toggleHold: () => setModeBtn(getMode() === "hold" ? "normal" : "hold"),
      toggleArpeggio: () => setModeBtn(getMode() === "arpeggio" ? "normal" : "arpeggio"),
      play: playCurrent,
      sendToSong: () => {
        const entry = state.historyActiveCursorId ? state.history.find((e) => e.id === state.historyActiveCursorId) : state.history[0];
        if (entry) sendToSong(entry);
      },
      clearHistory: clearHistoryWithUndo,
      step: stepCursor,
      deleteAtCursor: () => {
        if (!state.activeCursorId) return false;
        deleteChordAtCursor();
        return true;
      },
      toggleComputerKeyboard: () => {
        initAudioOnGesture();
        toggleComputerKeyboard(true);
      },
      focusChordInput: () => $2("typed-chord").focus(),
      togglePresentation,
      escape: () => {
        if (isPresenting()) {
          closePresentation();
          return;
        }
        melody = [];
        releaseKeptNotes();
        cancelCapture();
        state.activeCursorId = null;
        state.captureTargetId = null;
        state.historyActiveCursorId = null;
        markActiveHistoryEntry($2("zone2-content"), null);
        renderZone3();
      },
      selectCandidate: (idx) => {
        if (state.detection?.kind === "chord" && idx < state.detection.candidates.length) onAltSelect(idx);
      }
    });
  }
  function stepCursor(dir) {
    if (state.activeCursorId) {
      const chords = songChords(state.song).filter((c) => c.symbol);
      const i2 = chords.findIndex((c) => c.id === state.activeCursorId);
      const next = chords[i2 + dir];
      if (!next) return;
      state.activeCursorId = next.id;
      markActiveChord(next.id);
      showChord(next.symbol, next.notes, previousSongSymbol(next.id));
      playChordOrNotes(next.symbol, next.notes);
      return;
    }
    if (!state.history.length) return;
    const i = state.history.findIndex((e) => e.id === state.historyActiveCursorId);
    const entry = i === -1 ? state.history[0] : state.history[i + dir];
    if (!entry) return;
    const at = state.history.indexOf(entry);
    state.historyActiveCursorId = entry.id;
    markActiveHistoryEntry($2("zone2-content"), entry.id);
    showChord(entry.symbol, entry.notes, state.history[at + 1]?.symbol ?? null);
    playChordOrNotes(entry.symbol, entry.notes);
  }
  function playChordOrNotes(symbol, notes) {
    if (notes?.length) playNoteNames(notes);
    else playChord(symbol);
  }
  function deleteChordAtCursor() {
    const id = state.activeCursorId;
    const chords = songChords(state.song);
    const i = chords.findIndex((c) => c.id === id);
    if (i === -1) return;
    state.activeCursorId = (chords[i + 1] ?? chords[i - 1])?.id ?? null;
    if (state.captureTargetId === id) state.captureTargetId = null;
    removeChordWithUndo(id);
  }
  function setModeBtn(mode2) {
    setMode(mode2);
    document.querySelectorAll(".mode-btn[data-mode]").forEach((b) => {
      b.classList.toggle("active-mode", b.dataset.mode === mode2);
    });
  }
  if (!runViewerFromUrl()) init();
})();
//# sourceMappingURL=app.js.map
