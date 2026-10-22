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

  // src/settings/prefs.ts
  var choice = (options2, d) => ({ kind: "choice", options: options2, default: d });
  var num = (min, max, step2, d, unit = "") => ({ kind: "number", min, max, step: step2, default: d, unit });
  var EAR_CHORD_TYPES = ["", "m", "dim", "aug", "sus4", "7", "maj7", "m7", "m7b5", "dim7"];
  var EAR_CADENCE_TYPES = ["authentic", "plagal", "deceptive", "half"];
  var PREFS = {
    // Theory
    "chord-style": choice(["standard", "symbols", "short"], "standard"),
    // Cmaj7 / CΔ7 / CM7
    "key-profile": choice(["krumhansl", "temperley", "aarden", "bellman", "simple"], "krumhansl"),
    "voice-rules": choice(["strict", "contemporary", "species"], "strict"),
    "movable-do": { kind: "bool", default: false },
    "auto-modes": { kind: "bool", default: true },
    // Auto reads church modes too (UMT 0.10)
    // Detector and history
    "history-hold-ms": num(300, 2e3, 100, 800, "ms"),
    "history-max": num(20, 1e3, 10, 200),
    "history-bpm": num(0, 240, 1, 0, "bpm"),
    // 0: no tempo, the harmonic rhythm in seconds
    "history-beats": num(2, 12, 1, 4),
    "arpeggio-ms": num(500, 3e3, 100, 1200, "ms"),
    "melody-gap-s": num(2, 15, 1, 6, "s"),
    "capture-ms": num(100, 800, 50, 250, "ms"),
    // Sound
    "preview-s": num(0.5, 4, 0.5, 2, "s"),
    "piano-velocity": num(20, 127, 1, 90),
    // Practice
    "progression-bpm": num(60, 160, 5, 100, "bpm"),
    "ear-interval-play": choice(["up", "down", "harmonic"], "up"),
    "ear-chords": { kind: "set", options: EAR_CHORD_TYPES, default: EAR_CHORD_TYPES },
    "ear-cadences": { kind: "set", options: EAR_CADENCE_TYPES, default: EAR_CADENCE_TYPES },
    // Microphone and tuner
    "a4-hz": num(415, 466, 1, 440, "Hz"),
    "mic-sensitivity": choice(["low", "normal", "high"], "normal"),
    "mic-response": choice(["fast", "normal", "steady"], "normal"),
    // Interface
    "ui-zoom": num(80, 150, 10, 100, "%")
  };
  var storageKey = (name) => `pref-${name}`;
  function valid(def, v) {
    switch (def.kind) {
      case "choice":
        return typeof v === "string" && def.options.includes(v);
      case "bool":
        return typeof v === "boolean";
      case "number":
        return typeof v === "number" && Number.isFinite(v) && v >= def.min && v <= def.max;
      case "set":
        return Array.isArray(v) && v.every((x) => def.options.includes(x));
    }
  }
  var cache = /* @__PURE__ */ new Map();
  function getPref(name) {
    if (cache.has(name)) return cache.get(name);
    const def = PREFS[name];
    const stored = loadJSON(storageKey(name), void 0);
    const v = valid(def, stored) ? stored : Array.isArray(def.default) ? [...def.default] : def.default;
    cache.set(name, v);
    return v;
  }
  var listeners = /* @__PURE__ */ new Set();
  function onPrefChange(cb) {
    listeners.add(cb);
  }
  function setPref(name, value) {
    if (!valid(PREFS[name], value)) return;
    cache.set(name, value);
    save(storageKey(name), value);
    listeners.forEach((f) => f(name));
  }
  function resetPref(name) {
    const def = PREFS[name];
    setPref(name, Array.isArray(def.default) ? [...def.default] : def.default);
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
  var heardBySource = /* @__PURE__ */ new Map();
  var heardNotes = /* @__PURE__ */ new Set();
  function setHeardNotes(notes2, velocity2, source = "mic") {
    heardBySource.set(source, new Set(notes2));
    const next = new Set([...heardBySource.values()].flatMap((s) => [...s]));
    for (const n of heardNotes) if (!next.has(n)) handleNoteOff(n);
    for (const n of next) if (!heardNotes.has(n)) {
      velocities.set(n, velocity2);
      handleNoteOn(n);
    }
    heardNotes = next;
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
      }, getPref("arpeggio-ms"));
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
    const pc3 = midiNote % 12;
    const octave = Math.floor(midiNote / 12) - 1;
    return PITCH_NAMES_FLAT[pc3] + octave;
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
  function resolveTheme(choice2 = getThemeChoice()) {
    return choice2 === "system" ? systemPrefersLight() ? "light" : "dark" : choice2;
  }
  var cache2 = /* @__PURE__ */ new Map();
  function color(token) {
    let v = cache2.get(token);
    if (v === void 0) {
      v = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
      cache2.set(token, v);
    }
    return v;
  }
  function applyTheme(theme = resolveTheme()) {
    document.documentElement.dataset.theme = theme;
    cache2.clear();
  }
  var listeners2 = [];
  function onThemeChange(onChange4) {
    listeners2.push(onChange4);
  }
  function changed() {
    applyTheme();
    listeners2.forEach((f) => f());
  }
  function saveThemeChoice(choice2) {
    save(KEY, choice2);
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
  var neutralColor = () => color("chord-other");
  function functionColor(fn, none = "chord-none") {
    return color(fn === "T" ? "fn-t" : fn === "S" ? "fn-s" : fn === "D" ? "fn-d" : none);
  }
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
  var KEY_MODES = ["Major", "Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Locrian"];
  var CHURCH_MODES = ["Dorian", "Phrygian", "Lydian", "Mixolydian", "Locrian"];
  var MAJOR_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  var MINOR_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
  var DEGREE_OF = {
    Major: { semitones: 0, degree: 0 },
    Minor: { semitones: 9, degree: 5 },
    Dorian: { semitones: 2, degree: 1 },
    Phrygian: { semitones: 4, degree: 2 },
    Lydian: { semitones: 5, degree: 3 },
    Mixolydian: { semitones: 7, degree: 4 },
    Locrian: { semitones: 11, degree: 6 }
  };
  var ALL_KEYS = MAJOR_ROOTS.flatMap((_, pc3) => KEY_MODES.map((m) => keyName(pc3, m)));
  function parseKey(key) {
    const [root2, raw] = key.split(" ");
    const pc3 = pitchClassOf(root2 ?? "");
    const mode4 = KEY_MODES.find((m) => m.toLowerCase() === (raw ?? "major").toLowerCase());
    if (pc3 === -1 || !mode4) return null;
    return { pc: pc3, mode: mode4 };
  }
  function keyName(pc3, mode4) {
    const p = (pc3 % 12 + 12) % 12;
    if (mode4 === "Major") return `${MAJOR_ROOTS[p]} Major`;
    if (mode4 === "Minor") return `${MINOR_ROOTS[p]} Minor`;
    const { semitones, degree } = DEGREE_OF[mode4];
    const parent = MAJOR_ROOTS[(p - semitones + 12) % 12];
    let root2 = MAJOR_ROOTS[p];
    try {
      root2 = UMT.parseScaleSymbol(`${parent} Major`).getNotes()[degree].name.replace(/-?\d+$/, "");
    } catch {
    }
    return `${root2} ${mode4}`;
  }
  function keyOnParent(parentPc, mode4) {
    return keyName(parentPc + DEGREE_OF[mode4].semitones, mode4);
  }
  function parentMajorPc(key) {
    const k = key ? parseKey(key) : null;
    return k ? (k.pc - DEGREE_OF[k.mode].semitones + 12) % 12 : -1;
  }
  function keyMode(key) {
    return key ? parseKey(key)?.mode ?? null : null;
  }
  function isMinorKey(key) {
    const m = keyMode(key);
    return m === "Minor" || m === "Dorian" || m === "Phrygian" || m === "Locrian";
  }
  function hasLeadingTone(key) {
    const m = keyMode(key);
    return m === "Major" || m === "Lydian";
  }
  function normalizeKey(key) {
    const k = key ? parseKey(key) : null;
    return k ? keyName(k.pc, k.mode) : null;
  }
  function transposeKey(key, semitones) {
    const k = parseKey(key);
    return k ? keyName(k.pc + semitones, k.mode) : key;
  }
  var ABC_MODE = { Major: "", Minor: "m", Dorian: "dor", Phrygian: "phr", Lydian: "lyd", Mixolydian: "mix", Locrian: "loc" };
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
    const [root2] = name.split(" ");
    return { abcKey: root2 + ABC_MODE[keyMode(name)], accidentals };
  }
  function keyPrefersSharps(key) {
    return Object.values(keySignature(key ?? null).accidentals).includes("#");
  }

  // src/i18n/en.ts
  var en = {
    // Page
    "page.noMidi": "This browser has no Web MIDI, so a controller cannot connect (Chrome, Edge and Firefox have it). Everything else \u2014 song builder, circle of fifths, history \u2014 still works.",
    "page.insecure": "Opened over plain http on the network, the browser hides MIDI and the microphone: open Modus from this computer (localhost) or over https to use them. Everything else works.",
    "page.cdnError": "A file of the app did not load. Reload the page; if it keeps failing, the copy you have is incomplete.",
    // Toolbar: MIDI
    "midi.connected": "MIDI: connected",
    "midi.noDevices": "MIDI: no devices",
    "midi.disconnected": "MIDI: disconnected",
    "midi.noDeviceOption": "No MIDI devices",
    "midi.denied": "MIDI access denied. Grant permission in browser settings to use a controller.",
    "midi.inChannel.title": "Input channel: only notes on this channel are read (a keyboard split, or one track of a DAW)",
    "midi.inChannel.all": "All channels",
    "midi.inChannel.one": "Channel {n}",
    "midi.out.title": "MIDI out: what sounds goes to this port",
    "midi.out.loops": "Same port as the input: nothing is sent, it would come back as input",
    "midi.out.off": "None",
    "midi.out.port": "{name}",
    "midi.out.absent": "{name} (absent)",
    "midi.outChannel.title": "MIDI out channel",
    "midi.outChannel.one": "Channel {n}",
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
    "typed.placeholder": "Type a chord or an order",
    "typed.title": "A chord to play it (letters or Do Re Mi: Am7, Lam7), or the name of an option: mode, key, layout, panel, instrument\u2026 (/)",
    "cmd.results": "Chords and orders",
    "cmd.play": "Play {chord}",
    "cmd.mode": "Mode: {mode}",
    "cmd.key": "Key: {key}",
    "cmd.keyAuto": "Key: auto",
    "cmd.layout": "Layout: {name}",
    "cmd.show": "Show panel: {name}",
    "cmd.hide": "Hide panel: {name}",
    "cmd.instrument": "Instrument: {name}",
    "cmd.view": "View window: {name}",
    "cmd.present": "Presentation",
    "cmd.settings": "Settings",
    "cmd.help": "Help",
    "cmd.rail": "Show or hide the rail",
    "cmd.on": "on",
    "cmd.menu": "\u22EF menu",
    "cmd.setting": "Settings: {name}",
    "cmd.playCurrent": "Play the chord",
    "cmd.send": "Send the chord to the song",
    "cmd.clearHistory": "Clear the history",
    "cmd.escape": "Let go of the held chord, stop MIDI fill",
    "cmd.tour": "Guided tour",
    "cmd.export": "Save {name} as {format}",
    "cmd.none": "No chord or order matches \u201C{q}\u201D",
    "cmd.hint": "A chord (G7, F#m7b5\u2026) plays it; the name of an option does it.",
    "rail.title": "Show or hide the rail (input, sound, layout, presentation, view windows)",
    "input.playWith": "Play with",
    "input.keyboard": "Computer keyboard",
    "input.mic": "Microphone (sing or play)",
    "sound.filter": "Find an instrument",
    "key.menu.title": "Key: auto follows what you play, or fix one",
    "key.menu.hint": "In the order of the circle of fifths. Auto follows what you play.",
    "key.auto.title": "Auto: the key is read from what you play",
    "key.autoShort": "Auto",
    "key.majorCap": "Major",
    "key.minorCap": "Minor",
    "key.modes": "Modes",
    "key.mode.title": "A {mode} key: its tonic and its chords read as the mode's own",
    "key.mode.dorian": "Dorian",
    "key.mode.phrygian": "Phrygian",
    "key.mode.lydian": "Lydian",
    "key.mode.mixolydian": "Mixolydian",
    "key.mode.locrian": "Locrian",
    "key.none": "Key",
    // Toolbar: audio
    "audio.title": "Soundfont status",
    "audio.idle": "\u266A idle",
    "audio.loading": "\u266A loading\u2026",
    "audio.suspended": "\u266A press a key or click",
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
    "present.title": "Presentation: this layout without controls, full screen (P; Esc to leave)",
    "layout.title": "Layout: ready-made and saved layouts, which panels show",
    "layout.presets": "Layouts",
    "layout.preset.standard": "Standard",
    "layout.preset.standard.title": "Every panel, as the page was",
    "layout.preset.study": "Study",
    "layout.preset.study.title": "Key and analysis large, what is played beside them",
    "layout.preset.class": "Class",
    "layout.preset.class.title": "The chord and where it came from, few panels, large: for a projector, with P",
    "layout.preset.transcription": "Transcription",
    "layout.preset.transcription.title": "History and song next to the piano and fretboard",
    "layout.preset.recording": "Recording",
    "layout.preset.recording.title": "Chord, staff, guitar and piano for a camera or screen capture",
    "layout.saved": "Saved",
    "layout.delete": "Delete this layout",
    "layout.name": "Name",
    "layout.save": "Save this one",
    "layout.panels": "Panels",
    "layout.hint": "Drag a panel by its title, resize it from its corner: it snaps to the grid.",
    "module.chord": "Chord",
    "module.staff": "Staff",
    "module.analysis": "Analysis",
    "module.cof": "Circle of fifths",
    "module.guitar": "Strings",
    "module.explain": "Explanation",
    "module.next": "Next",
    "module.metronome": "Metronome",
    "module.progressions": "Progressions",
    "module.ear": "Ear training",
    "module.player": "Player",
    "module.tuner": "Tuner",
    "module.key": "Key",
    "module.piano": "Piano",
    "module.velocity": "Velocity",
    "module.history": "History",
    "module.song": "Song",
    "module.drag": "Drag to move",
    "module.hide": "Hide this panel (the \u25A6 menu shows it again)",
    "module.resize": "Drag to resize",
    "menu.options": "Panel options",
    "menu.optionsOf": "Options of {name}",
    "menu.size": "Text size",
    "menu.clef": "Staves",
    "menu.prev": "Chord before",
    "menu.fields": "Fields",
    "menu.flat": "Flats",
    "menu.sharp": "Sharps",
    "menu.minor": "Minor and diminished rings",
    "menu.degrees": "Degrees",
    "menu.sevenths": "Seventh chords",
    "menu.negative": "Negative harmony",
    "menu.parallel": "Parallel modes",
    "menu.usualBorrowings": "Usual borrowings only",
    "menu.coltrane": "Coltrane axis",
    "menu.controls": "Controls",
    "a11y.group.input": "Input",
    "a11y.group.mode": "Playing mode",
    "a11y.group.key": "Key",
    "a11y.group.sound": "Sound",
    "a11y.group.page": "Page",
    "head.from": "from",
    "head.also": "Also",
    "head.empty": "Play, or type a chord",
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
    "view.guitar": "Strings",
    "help.title": "Help: keys, gestures, panels (?)",
    // Shared controls
    "ctrl.smaller": "Smaller",
    "ctrl.larger": "Larger",
    // Notation panel
    "staff.clef.title": "Staves: grand (treble and bass, split at middle C), treble only, bass only",
    "staff.clef.grand": "Grand",
    "staff.clef.treble": "Treble",
    "staff.clef.bass": "Bass",
    "staff.prev.title": "Write the chord before next to this one, to see each voice move",
    "piano.prev.title": "Mark the keys of the chord before, to see each voice move",
    "cof.flat.title": "Show flat enharmonics (Gb, Db\u2026)",
    "cof.sharp.title": "Show sharp enharmonics (F#, C#\u2026)",
    "cof.spelledInKey": "Spelled as in {key}; flats or sharps apply without a key",
    "cof.minor.title": "Show/hide minor and diminished rings",
    "cof.degrees.title": "Show scale degrees (I, IV, V\u2026)",
    "cof.sevenths.title": "Show 7th chords (maj7, m7, \xF87)",
    "cof.segment.tip": "Click: play \xB7 double-click: set as key",
    "cof.segment.play": "Click: play",
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
    "field.slash": "Slash",
    "field.slash.title": "A chord over a bass foreign to it: upper structure, polychord or hybrid",
    "field.slash.row": "Slash",
    "field.movable": "Mov. do",
    "field.movable.title": "The notes in movable do in the key: do is the tonic, ti the seventh, the notes outside the scale with their own syllables (fi, te\u2026)",
    "field.movable.row": "Mov. do",
    "slash.over": "{upper} over {bass}",
    "slash.overBass": "over {bass}",
    "slash.type.upper-structure": "upper structure",
    "slash.type.polychord": "polychord",
    "slash.type.hybrid": "hybrid",
    "field.forte": "Set",
    "field.forte.title": "Set class: Forte number, prime form, interval vector",
    "field.forte.row": "Set class",
    "field.voices": "Voic\u2192",
    "field.voices.title": "Voice leading: how each voice moves from the chord before, bass first",
    "field.voices.row": "Voices",
    "field.rules": "Rules",
    "field.rules.title": "Rules of four-part writing broken from the chord before: parallels, crossing, leading tone, seventh",
    "field.rules.row": "Rules",
    // Analysis values
    "analysis.note": "Note",
    "analysis.interval": "Interval",
    "analysis.inversion": "Inversion",
    "analysis.semitones": "{n} st",
    "analysis.yes": "Yes",
    "ex.term.diatonic": "Diatonic",
    "ex.term.figbass": "Figured bass {fig}",
    "ex.term.voicing": "Position: {v}",
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
    "vl.bass": "bass",
    "vl.top": "top",
    "vl.voice": "voice {n}",
    "vl.and": " and ",
    "vl.outer.parallel": "outer voices parallel",
    "vl.outer.similar": "outer voices similar",
    "vl.outer.contrary": "outer voices contrary",
    "vl.outer.oblique": "outer voices oblique",
    "vl.outer.static": "outer voices held",
    "vl.total": "{n} semitones in all",
    "vl.common": "{n} held",
    "vl.none": "none broken",
    "vl.issue.parallel5": "parallel fifths ({voices})",
    "vl.issue.parallel8": "parallel octaves ({voices})",
    "vl.issue.hidden5": "hidden fifth in the outer voices",
    "vl.issue.hidden8": "hidden octave in the outer voices",
    "vl.issue.crossing": "voices cross ({voices})",
    "vl.issue.overlap": "voices overlap ({voices})",
    "vl.issue.leap": "leap too wide ({voices})",
    "vl.issue.leadingTone": "leading tone does not rise to the tonic ({voices})",
    "vl.issue.doubledLeadingTone": "leading tone doubled ({voices})",
    "vl.issue.seventh": "seventh does not fall by step ({voices})",
    "ex.empty": "Play or pick a chord: each term the analysis shows is explained here, in its key.",
    "next.empty": "Play or pick a chord: the chords that usually follow it are suggested here, each with why.",
    "next.noKey": "Pick a key, or play a few chords for it to be read: what follows a chord depends on the key.",
    "next.none": "Nothing in this key usually follows this chord: no resolution, cadence or named progression leads from it.",
    "next.resolves": "{chord} is {roman}: it resolves to {target}",
    "next.inProgressions": "In",
    "next.play": "Play {chord} and show it after this chord",
    "ex.nth.1": "1st",
    "ex.nth.2": "2nd",
    "ex.nth.3": "3rd",
    "ex.nth.4": "4th",
    "ex.nth.5": "5th",
    "ex.nth.6": "6th",
    "ex.nth.7": "7th",
    "ex.deg.1": "tonic",
    "ex.deg.2": "supertonic",
    "ex.deg.3": "mediant",
    "ex.deg.4": "subdominant",
    "ex.deg.5": "dominant",
    "ex.deg.6": "submediant",
    "ex.deg.7": "leading tone",
    "ex.deg.subtonic": "subtonic",
    "ex.lowered": "lowered",
    "ex.raised": "raised",
    "ex.roman": "{chord} is {roman} in {key}: the chord on the {nth} degree, the {name}.",
    "ex.romanAltered": "{chord} is {roman} in {key}: the chord on the {dir} {nth} degree ({acc}{n}), a note outside the scale.",
    "ex.case.term": "I \xB7 ii \xB7 vii\xB0 \xB7 \xF8 \xB7 +",
    "ex.case": "Upper-case numerals are major chords, lower-case minor; \xB0 diminished, \xF8 half-diminished, + augmented; a 7 adds the seventh.",
    "ex.fn.T": "Tonic function: the chord of rest, where a phrase arrives. The tonic has it, and the chords that share two of its notes.",
    "ex.fn.S": "Subdominant function: moves away from rest and prepares the dominant. The usual chords are on the 4th and 2nd degrees.",
    "ex.fn.D": "Dominant function: tension that asks to resolve to the tonic, above all through the leading tone, a semitone below it. The chords on the 5th and 7th degrees have it.",
    "ex.diatonic": "Diatonic: every note of {chord} is in the scale of {key}.",
    "ex.secondaryV": "{chord} is {roman}: a secondary dominant, the dominant of {target} ({targetRoman}). For a moment it treats {target} as a tonic, with a note from outside the key, and it usually resolves to it.",
    "ex.secondaryVii": "{chord} is {roman}: a secondary leading-tone chord, the vii\xB0 of {target} ({targetRoman}). Its root is a semitone below {target}, which it treats for a moment as a tonic, and it usually resolves to it.",
    "ex.borrowed": "{chord} is borrowed from {mode} (modal interchange): it is not in {key}, but it is in the mode on the same tonic. Its notes from outside the key ({notes}) give it its colour.",
    "ex.tritoneSub": "{chord} is a tritone substitute for the dominant: its root is a tritone from the dominant's, both share the same tritone (third and seventh, swapped), and its root falls a semitone to the tonic.",
    "ex.chromatic": "{chord} is chromatic in {key}: it has notes from outside the key ({notes}) and is neither a secondary dominant nor a chord from a mode on the same tonic.",
    "ex.cad.authentic": "From the dominant to the tonic, the strongest close: the leading tone rises to the tonic. With both chords in root position and the tonic on top it is a perfect authentic cadence.",
    "ex.cad.plagal": "From the subdominant to the tonic, the \xABamen\xBB of hymns: softer than the authentic.",
    "ex.cad.minorPlagal": "From iv, the subdominant of the minor, to the tonic: the 6th degree falls a semitone to the 5th.",
    "ex.cad.deceptive": "The dominant goes to the 6th degree instead of the tonic: the close it promised is avoided and the phrase goes on.",
    "ex.cad.half": "The phrase stops on the dominant, open, like a question waiting for its answer.",
    "ex.cad.phrygianHalf": "iv in first inversion to V, in a minor key: the bass falls a semitone, from the 6th degree to the 5th.",
    "ex.cad.phrygian": "\u266DII to the tonic: the root falls a semitone, the colour of the phrygian mode.",
    "ex.cad.backdoor": "\u266DVII7 to the tonic: a dominant a whole step below it that rises to it, instead of falling a fifth.",
    "ex.cad.picardy": "A passage in minor closes on the major tonic.",
    "ex.sub.tritone": "A dominant a tritone away shares the same tritone and resolves to the same chord, its root a semitone above it.",
    "ex.sub.diatonic": "A chord of the key that shares two notes and the function: vi or iii for I, ii for IV, vii\xB0 for V.",
    "ex.sub.deceptive": "The dominant goes to vi, which shares two notes with the tonic, instead of to I.",
    "ex.sub.chromatic-mediant": "A chord a third away and of the same kind, with one note in common at most: a bright, unexpected change.",
    "ex.sub.sus4": "The dominant with the fourth instead of the third: it keeps the tension without the leading tone.",
    "ex.sub.modal": "The same degree from the mode on the same tonic, such as iv for IV from the minor.",
    "ex.plr": "{chord} comes from {prev} by {path}: neo-Riemannian moves between triads, each keeping two notes and moving the other one by step.",
    "ex.plr.P": "P (parallel): the same root, major \u2194 minor; the third moves a semitone ({a} \u2194 {b}).",
    "ex.plr.R": "R (relative): a major chord \u2194 its relative minor; one note moves a whole step ({a} \u2194 {b}).",
    "ex.plr.L": "L (leading-tone exchange): one note moves a semitone; a major chord \u2194 the minor a third above ({a} \u2194 {b}).",
    "ex.fig.intro": "Figured bass: the intervals over the bass, as continuo players read them.",
    "ex.fig.root": "Root position: the root in the bass (5/3, written as nothing).",
    "ex.fig.6": "First inversion: the third in the bass (6/3, written 6).",
    "ex.fig.64": "Second inversion: the fifth in the bass.",
    "ex.fig.7": "A seventh chord in root position.",
    "ex.fig.65": "A seventh chord in first inversion: the third in the bass.",
    "ex.fig.43": "A seventh chord in second inversion: the fifth in the bass.",
    "ex.fig.42": "A seventh chord in third inversion: the seventh in the bass.",
    "ex.voicing.close": "Close position: the upper voices fit within an octave.",
    "ex.voicing.open": "Open position: the upper voices span more than an octave.",
    "ex.voicing.drop": "Drop voicing: from a close chord, the 2nd voice from the top (drop 2), the 3rd (drop 3) or both 2nd and 4th (drop 2+4) go down an octave.",
    "ex.upper": "Upper structure: a triad on top of a dominant's shell (its third and seventh); its notes are the dominant's tensions.",
    "ex.slash.upper-structure": "{upper} over {bass}: a chord on top of a bass that is not one of its notes, heard as one chord on {bass}; the notes above are its tensions ({tensions}).",
    "ex.slash.polychord": "{upper} over {bass}: a polychord, a chord over a bass foreign to it, heard as two layers more than as one chord; over {bass} its notes are {tensions}.",
    "ex.slash.hybrid": "Over {bass}, the notes above form no chord of their own: a hybrid, read as intervals over the bass ({tensions}).",
    "ex.vl.parallel5": "Two voices a fifth apart move to another fifth: they blend into one and the part loses a voice. Avoided in four-part writing; common in rock and in parallel harmony.",
    "ex.vl.parallel8": "Two voices an octave apart move to another octave: they double each other and the part loses a voice.",
    "ex.vl.hidden5": "The outer voices reach a fifth moving the same way, with a leap on top: it sounds almost like parallel fifths.",
    "ex.vl.hidden8": "The outer voices reach an octave moving the same way, with a leap on top: it sounds almost like parallel octaves.",
    "ex.vl.crossing": "A lower voice goes above a higher one: the lines become hard to follow.",
    "ex.vl.overlap": "A voice moves past where the voice next to it just was: the ear may follow the wrong line.",
    "ex.vl.leap": "A leap wider than an octave, or an augmented fourth, is hard to sing and is avoided.",
    "ex.vl.leadingTone": "The leading tone of the dominant asks to rise a semitone to the tonic.",
    "ex.vl.doubledLeadingTone": "The leading tone is not doubled: both would want to rise to the tonic, giving octaves.",
    "ex.vl.seventh": "The seventh of a dominant seventh asks to fall by step.",
    "ex.interval": "{n} semitones. Its inversion, with the lower note an octave up, is a {inv}: together they make an octave.",
    "ex.cadence.title": "{cadence}: {text}",
    "prog.group.jazz": "Jazz",
    "prog.group.blues": "Blues",
    "prog.group.pop": "Pop and classical",
    "prog.group.cadence": "Cadences",
    "prog.group.mixture": "Modal mixture",
    "prog.select.title": "A named progression, written in the key",
    "prog.play.title": "Play the progression, a bar every 2.4 s",
    "prog.stop.title": "Stop",
    "ear.mode.interval": "Intervals",
    "ear.mode.chord": "Chords",
    "ear.mode.cadence": "Cadences",
    "ear.mode.degree": "Degrees",
    "ear.new": "New question",
    "ear.new.title": "Play a new question",
    "ear.again.title": "Play it again",
    "ear.kind": "What to ask",
    "ear.score": "right {right} of {total}",
    "ear.score.title": "Right answers out of all, for this kind of question",
    "ear.start": "Press New question: the app plays without showing, and you name what you heard.",
    "ear.ask.interval": "Which interval? Two notes one after the other, then together.",
    "ear.ask.chord": "Which kind of chord?",
    "ear.ask.cadence": "Which cadence? The tonic, then the two chords that close the phrase.",
    "ear.ask.degree": "Which degree is the last note? The cadence sets the key; answer in movable do.",
    "ear.right": "Right: {answer}",
    "ear.wrong": "It was {answer}",
    "ear.chord.maj": "major",
    "ear.chord.m": "minor",
    "ear.chord.dim": "diminished",
    "ear.chord.aug": "augmented",
    "ear.chord.sus4": "sus4",
    "ear.chord.7": "dominant 7th",
    "ear.chord.maj7": "major 7th",
    "ear.chord.m7": "minor 7th",
    "ear.chord.m7b5": "half-diminished",
    "ear.chord.dim7": "diminished 7th",
    "player.open": "Open\u2026",
    "player.open.title": "Open a recording (or drop it on the panel). It stays on this computer and is not kept: open it again after a reload",
    "player.none": "No recording: open one to transcribe it",
    "player.wave.title": "Click to go to that point",
    "player.back.title": "Back 5 seconds (not before A)",
    "player.play.title": "Play / pause",
    "player.speed.title": "Speed, without changing the pitch",
    "player.a.title": "Loop start: here",
    "player.b.title": "Loop end: here; from B it goes back to A",
    "player.clear.title": "No loop",
    "player.chords": "Chords",
    "player.chords.title": "The chord at the playhead in the detector, as it plays and where you jump to: read from the recording when it is opened",
    "player.reading": "reading chords {p} %",
    "player.readFailed": "the chords could not be read",
    "mic.title": "Microphone: what is sung or played goes to the detector as notes held (never sounded)",
    "mic.on": "On",
    "mic.off": "Off",
    "mic.mode.notes": "Notes",
    "mic.mode.notes.title": "One note at a time: voice, wind, a melody on any instrument. Feeds the scales of the melody",
    "mic.mode.chords": "Chords",
    "mic.mode.chords.title": "The notes of a chord, heard by a model (Basic Pitch) a few times a second: under a second behind what is played",
    "mic.hint": "Turn the microphone on and sing or play.",
    "mic.listening": "Listening\u2026",
    "mic.error": "No microphone ({error}): allow it in the browser and try again.",
    "mic.insecure": "No microphone over plain http on the network: the browser offers it only on this computer (localhost) or over https.",
    "help.close": "Close",
    "help.keys": "Keys",
    "help.changeKeys": "Change the shortcuts\u2026",
    "ex.movableDo": "In movable do: {syllable}.",
    "set.title": "Settings",
    "set.title.button": "Settings (,)",
    "set.search": "Search",
    "set.search.placeholder": "key, shortcut, microphone\u2026",
    "set.sections": "Sections",
    "set.nothing": "No setting matches.",
    "set.footnote": "Esc closes \xB7 changes are kept as you make them",
    "set.resetSection": "Reset this section",
    "set.back": "Back to the sections",
    "set.pick.done": "Done",
    "set.summary.on": "{n} of {total} on",
    "set.summary.keys.default": "As they came",
    "set.summary.keys.changed": "{n} changed",
    "set.summary.data": "Export, import, reset",
    "set.reloads": "Changing it reloads the page; history and songs stay",
    "set.noteNames.hint": "Everywhere: detector, staff, piano, circle, history. Reloads the page",
    "set.section.general": "General",
    "set.section.general.hint": "Language, note names, look",
    "set.section.io": "Input and output",
    "set.section.io.hint": "MIDI channels and the port Modus sends to. The input device and mode stay in the toolbar",
    "set.section.sound": "Sound",
    "set.section.sound.hint": "How previews sound. Instrument and volume stay in the toolbar",
    "set.section.theory": "Theory",
    "set.section.theory.hint": "How chords are written and read",
    "set.section.detector": "Detector and history",
    "set.section.detector.hint": "How long things wait before they count",
    "set.section.panels": "Panels",
    "set.section.panels.hint": "The options each panel carries on its own buttons, here too",
    "set.section.practice": "Practice",
    "set.section.practice.hint": "Progressions and ear training",
    "set.section.mic": "Microphone and tuner",
    "set.section.mic.hint": "How the microphone listens and what A is",
    "set.section.shortcuts": "Shortcuts",
    "set.section.shortcuts.hint": "The keys of each action",
    "set.section.data": "Data",
    "set.section.data.hint": "Settings and layouts to a file, from a file, or back to how they came. Songs and history are not touched",
    "set.io.inChannel": "Input channel",
    "set.io.out": "MIDI out",
    "set.io.outChannel": "Output channel",
    "set.io.thru": "Thru",
    "set.panels.intro": "Each box is the same option as in the panel's \u22EF menu: both stay the same.",
    "set.panels.prev": "Staff and piano: show the chord before",
    "set.panels.cofMinor": "Circle: minor and diminished rings",
    "set.panels.cofDegrees": "Circle: degrees",
    "set.panels.cofSevenths": "Circle: seventh chords",
    "set.panels.keySevenths": "Key: seventh chords",
    "set.panels.keyNegative": "Key: negative harmony",
    "set.panels.keyParallel": "Key: parallel modes",
    "set.panels.keyColtrane": "Key: Coltrane axis",
    "set.ear.reset": "Reset the ear-training score",
    "set.ear.reset.button": "Reset",
    "set.ear.reset.hint": "Every kind back to 0 / 0",
    "set.mic.mode": "What the microphone hears",
    "set.mic.mode.hint": "One note at a time, or chords",
    "set.keys.intro": "Change: press the new key; Esc keeps the one there was. Each action takes two keys.",
    "set.keys.press": "Press a key\u2026",
    "set.keys.change": "Change",
    "set.keys.add.title": "Add a second key",
    "set.keys.cancel": "Cancel",
    "set.keys.reset": "Back to the factory key",
    "set.keys.remove": "Remove {key}",
    "set.keys.none": "no key",
    "set.keys.conflict": "{key} is already {other}. Give it to \xAB{action}\xBB and leave {other} without it?",
    "set.keys.take": "Give it",
    "set.keys.other": "Pick another",
    "set.keys.fixed": "Always the same",
    "set.keys.fixed.hint": "Esc closes and cancels, 1\u20139 pick a reading of the chord, Tab moves through the page",
    "set.data.export": "Export",
    "set.data.export.hint": "Settings, shortcuts and layouts to a file, to take to another computer",
    "set.data.export.button": "Save the file\u2026",
    "set.data.import": "Import",
    "set.data.import.hint": "Settings from a file exported before; they replace these, with Undo",
    "set.data.import.button": "Open a file\u2026",
    "set.data.import.bad": "That file is not a Modus settings file.",
    "set.data.reset": "Reset all settings",
    "set.data.reset.hint": "As they came: settings, shortcuts, layouts and panel options. Songs, history and the ear-training score stay; Undo brings them back",
    "set.data.reset.button": "Reset",
    "set.data.imported": "Settings imported",
    "set.data.wasReset": "Settings reset",
    "action.play": "Play the chord on screen",
    "action.stepPrev": "Previous chord (song or history)",
    "action.stepNext": "Next chord (song or history)",
    "action.delete": "Remove the selected song chord",
    "action.hold": "Hold mode",
    "action.arpeggio": "Arpeggio mode",
    "action.send": "Send the chip to the song",
    "action.clear": "Clear the history",
    "action.keyboard": "Computer keyboard as a piano",
    "action.present": "Presentation",
    "action.type": "Type a chord",
    "action.help": "Help",
    "action.settings": "Settings",
    "pref.ui-zoom": "Interface size",
    "pref.ui-zoom.hint": "Everything larger or smaller, for a far screen or a small one",
    "pref.preview-s": "Length of previews",
    "pref.preview-s.hint": "A chord played from history, circle, key panel or song",
    "pref.piano-velocity": "Velocity of the on-screen piano and previews",
    "pref.piano-velocity.hint": "The MIDI velocity (1\u2013127) of the notes that do not come from your controller, as they sound and as MIDI out sends them",
    "pref.chord-style": "Chord symbols",
    "pref.chord-style.hint": "How a major seventh chord is written",
    "pref.chord-style.standard": "Cmaj7",
    "pref.chord-style.symbols": "C\u03947",
    "pref.chord-style.short": "CM7",
    "pref.key-profile": "Key detection (Auto)",
    "pref.key-profile.hint": "The profile what you play is compared with, for each key",
    "pref.key-profile.krumhansl": "Krumhansl-Kessler",
    "pref.key-profile.temperley": "Temperley-Kostka-Payne",
    "pref.key-profile.aarden": "Aarden-Essen",
    "pref.key-profile.bellman": "Bellman-Budge",
    "pref.key-profile.simple": "Simple",
    "pref.voice-rules": "Voice-leading rules",
    "pref.voice-rules.hint": "Strict: four-part chorale. Contemporary: no parallels or leaps; crossing, leading tone and seventh. Species: counterpoint, leaps up to a fifth",
    "pref.voice-rules.strict": "Strict",
    "pref.voice-rules.contemporary": "Contemporary",
    "pref.voice-rules.species": "Species",
    "pref.movable-do": "Movable do in the explanations",
    "pref.movable-do.hint": "The tonic is do: in G major, G is called do",
    "pref.auto-modes": "Auto finds modes",
    "pref.auto-modes.hint": "Auto may read a dorian, lydian\u2026 key, not only major and minor. With little music or no clear tonic it can miss",
    "pref.history-hold-ms": "Hold a chord to log it",
    "pref.history-hold-ms.hint": "How long a chord holds before it goes to the history",
    "pref.history-max": "Chips the history keeps",
    "pref.history-max.hint": "The oldest go first",
    "pref.history-bpm": "Tempo of what you play",
    "pref.history-bpm.hint": "For the harmonic rhythm per bar. 0: no tempo, the time between changes in seconds",
    "pref.history-beats": "Beats per bar",
    "pref.history-beats.hint": "The bar the harmonic rhythm is counted in: 4 for 4/4, 3 for 3/4",
    "pref.arpeggio-ms": "Arpeggio mode window",
    "pref.arpeggio-ms.hint": "Notes played within it make one chord",
    "pref.melody-gap-s": "Pause that starts a new melody",
    "pref.melody-gap-s.hint": "For the scales that fit what is played note by note",
    "pref.capture-ms": "Settle time when filling the song",
    "pref.capture-ms.hint": "How long a chord holds before it fills the slot",
    "pref.progression-bpm": "Progression tempo",
    "pref.progression-bpm.hint": "A bar of 4/4 at this tempo",
    "pref.ear-interval-play": "Intervals are played",
    "pref.ear-interval-play.hint": "One note after the other (then together), or both at once",
    "pref.ear-interval-play.up": "Rising",
    "pref.ear-interval-play.down": "Falling",
    "pref.ear-interval-play.harmonic": "Together",
    "pref.ear-chords": "Chords asked",
    "pref.ear-chords.hint": "None ticked asks them all",
    "pref.ear-cadences": "Cadences asked",
    "pref.ear-cadences.hint": "None ticked asks them all",
    "pref.a4-hz": "Tuner: A4",
    "pref.a4-hz.hint": "440 Hz as usual; 442 for many orchestras, 415 for baroque",
    "pref.mic-sensitivity": "Microphone sensitivity",
    "pref.mic-sensitivity.hint": "Higher hears soft playing, and more of the room",
    "pref.mic-sensitivity.low": "Low",
    "pref.mic-sensitivity.normal": "Normal",
    "pref.mic-sensitivity.high": "High",
    "pref.mic-response": "Microphone response",
    "pref.mic-response.hint": "Fast follows quick melodies; steady ignores a passing note",
    "pref.mic-response.fast": "Fast",
    "pref.mic-response.normal": "Normal",
    "pref.mic-response.steady": "Steady",
    "a11y.toolbar": "Controls",
    "a11y.rail": "Rail",
    "a11y.panels": "Panels",
    "a11y.panelKeys": "{name} panel: arrows move it, Shift + arrows resize it",
    "a11y.moved": "{name}: column {x}, row {y}, {w} columns wide, {h} rows tall",
    "a11y.midiDevice": "MIDI input device",
    "a11y.key": "Key",
    "a11y.chord": "{chord}, {roman}, {fn}",
    "a11y.chordNoKey": "{chord}",
    "a11y.note": "Note {note}",
    "a11y.staff": "Staff: {notes}",
    "a11y.piano": "Piano: {notes}",
    "a11y.strings": "Strings: {chord}",
    "a11y.cof": "Circle of fifths: Enter plays a chord, Enter twice sets its key",
    "a11y.nothing": "nothing played",
    "a11y.chip": "{chord}, {roman}: Enter shows and plays it, Delete removes it",
    "shortcut.tab": "Reach any control, chip or circle segment; Enter or Space presses it",
    "kbd.panelArrows": "Arrows on a panel title",
    "shortcut.panelArrows": "Move the panel; with Shift, resize it",
    "tour.next": "Next",
    "tour.back": "Back",
    "tour.skip": "Skip the tour",
    "tour.close": "Close",
    "tour.done": "Start playing",
    "tour.start": "Guided tour",
    "tour.start.title": "The tour of the page, again",
    "tour.welcome.title": "Welcome to Modus",
    "tour.welcome": "Play a chord and Modus names it and explains its harmony as you play: its degree in the key, its function, the cadence it makes, how its voices move. This tour shows where everything is; it takes a minute. Arrows or the buttons move through it, Esc closes it.",
    "tour.input.title": "Play",
    "tour.input": "Connect a MIDI keyboard and pick it here, with the way it plays (Normal, Hold, Arpeggio). Without one: press M to play on the computer keyboard, click or touch the piano, turn on the microphone and sing or play, or type a chord in the field at the top (/); the field also finds any option by its name.",
    "tour.key.title": "The key",
    "tour.key": "Pick the key you play in, or leave it on Auto: Modus finds it from what you play. Every degree, function and cadence is read in it.",
    "tour.analysis.title": "What it is",
    "tour.analysis": "The Chord panel names what you play; Analysis reads it: numeral, function, figured bass, voicing, scales that fit, cadence, voice leading from the chord before. Its \u22EF menu chooses which rows show.",
    "tour.explain.title": "What it means",
    "tour.explain": "Explanation puts each term in words for the chord on screen: why D7 is V7/V, which mode a borrowed chord comes from, what a cadence does.",
    "tour.cof.title": "The circle of fifths",
    "tour.cof": "Click a chord to hear and analyse it; click twice to make it the key. The Key panel shows the key's chords, its negative harmony and the chords of its parallel modes.",
    "tour.history.title": "History",
    "tour.history": "Every chord you hold is logged here with its numeral, and the cadences and modulations between them. Click a chip to see it again, drag it to the song, right-click or long-press to remove it.",
    "tour.layout.title": "Your layout",
    "tour.layout.touch": "Every element is a panel: hide it with \xD7; its options are in its \u22EF menu. Here, in Panels: ready-made layouts for study, class, transcription or recording, and which panels show. More presents the layout full screen.",
    "tour.layout": "Every element is a panel: drag it by its title, resize it from its corner, hide it with \xD7; its options are in its \u22EF menu. Here, in the rail (hide it with the button by the logo): ready-made layouts for study, class, transcription or recording, and your own. P presents the layout full screen.",
    "tour.practice.title": "Practice",
    "tour.practice": "Progressions plays the classic progressions in your key; Ear training plays without showing and you name what you heard; the Player loops and slows down a recording to transcribe it.",
    "tour.help.title": "Help",
    "tour.help": "Shortcuts, gestures and what each panel is for are here; language, note names and theme are in Settings (\u2699). This tour starts again from here.",
    "help.panels": "Panels",
    "help.panel.chord": "The chord played, its notes, degree and function, the cadence from the chord before, and the other readings of the same notes",
    "help.panel.staff": "The notes on the staff, in the key's signature; its \u22EF menu shows the chord before",
    "help.panel.analysis": "Numeral, function, figured bass, voicing, scales, cadence, voice leading\u2026",
    "help.panel.explain": "Each term of the analysis, in words",
    "help.panel.next": "Chords that usually follow, and why",
    "help.panel.metronome": "Any meter, talas, flamenco comp\xE1s, aksak, claves, Euclidean rhythms and polyrhythms, drawn as a necklace",
    "metro.start": "Start the metronome",
    "metro.stop": "Stop the metronome",
    "metro.tempo": "Tempo",
    "metro.tap": "Tap",
    "metro.tap.title": "Tap the beat: the tempo is the mean of the last taps",
    "metro.kind": "What it counts",
    "metro.tab.meter": "Meter",
    "metro.tab.cycle": "Cycle",
    "metro.tab.clave": "Clave",
    "metro.tab.euclid": "Euclidean",
    "metro.tab.poly": "Polyrhythm",
    "metro.meter": "Meter",
    "metro.meter.title": "A meter: 4/4, 6/8, or additive as 2+2+3/8; the first pulse of each group is accented",
    "metro.trad.hindustani": "Hindustani",
    "metro.trad.carnatic": "Carnatic",
    "metro.trad.flamenco": "Flamenco",
    "metro.trad.aksak": "Aksak",
    "metro.euclid.k": "onsets",
    "metro.euclid.in": "in",
    "metro.euclid.n": "steps",
    "metro.use": "Use",
    "metro.recent": "Recent",
    "metro.poly.a": "Beats of the first voice",
    "metro.poly.b": "Beats of the second voice",
    "metro.sub": "Subdivision",
    "metro.sub.title": "{n} clicks a pulse",
    "metro.necklace": "The cycle as a necklace: a dot a pulse, the one sounding lit",
    "metro.view": "View",
    "metro.view.necklace": "Necklace",
    "metro.view.pulses": "Pulses",
    "metro.pulsesView": "The cycle as a row of pulses: accented ones taller, the one sounding lit",
    "metro.flash": "Flash on the accents",
    "metro.flash.title": "The drawing lights up on the first pulse, and softer on each accent: to follow it from the corner of the eye",
    "metro.count": "Large count",
    "metro.count.title": "The count sounding, large, in the middle of the drawing",
    "metro.trainer": "Tempo trainer",
    "metro.trainer.title": "Raises the tempo by steps while it plays, up to a limit",
    "metro.trainer.step": "Raise by",
    "metro.trainer.every": "Every",
    "metro.trainer.cycles": "cycles",
    "metro.trainer.max": "Up to",
    "metro.trainer.on": "trainer up to {max}",
    "help.panel.cof": "A click plays a chord, two clicks set its key",
    "help.panel.guitar": "Chord shapes or the whole neck, for guitar, bass, ukulele and more",
    "help.panel.key": "The key's chords, negative harmony, parallel modes, Coltrane axis",
    "help.panel.piano": "What sounds; click or touch a key to play",
    "help.panel.velocity": "How hard each note was struck",
    "help.panel.progressions": "Classic progressions in the key, to hear and analyse",
    "help.panel.ear": "Name by ear an interval, a chord or a cadence",
    "help.panel.player": "A recording to transcribe: loop and slow it down",
    "help.panel.tuner": "The note sung or played, and how far off it is",
    "help.panel.history": "The chords played, with numerals and cadences",
    "help.panel.song": "A song in sections and measures",
    "prog.ii-V-I": "ii-V-I",
    "prog.ii-V-I.about": "The cornerstone of jazz harmony: subdominant (ii7), dominant (V7), tonic (Imaj7). The root falls a fifth each time, and the seventh of each chord falls a step to the third of the next.",
    "prog.ii-V-i": "ii-V-i (minor)",
    "prog.ii-V-i.about": "The ii-V-I of a minor key: a half-diminished ii, a dominant V7 with the leading tone raised as in harmonic minor, and a minor tonic.",
    "prog.turnaround-jazz": "Jazz turnaround (I-vi-ii-V)",
    "prog.turnaround-jazz.about": "The turnaround that takes the last bars of a tune back to its start: from vi the roots fall by fifths to the dominant.",
    "prog.backdoor-ii-V": "Backdoor ii-V",
    "prog.backdoor-ii-V.about": "iv7, \u266DVII7 and I, the first two borrowed from the minor: \u266DVII7 reaches the tonic from a whole step below instead of from the dominant.",
    "prog.rhythm-changes": "Rhythm changes",
    "prog.rhythm-changes.about": "The A section of Gershwin's I Got Rhythm: I-vi-ii-V turnarounds, then I7 towards IV and iv on the way back. After the blues, the form jazz plays most.",
    "prog.coltrane-changes": "Coltrane changes",
    "prog.coltrane-changes.about": "A ii-V-I that passes through three tonics a major third apart (I, \u266DVI, III), each reached by its own dominant, as in Coltrane's Countdown.",
    "prog.giant-steps-cycle": "Giant Steps (bars 1\u20133)",
    "prog.giant-steps-cycle.about": "The opening of Giant Steps: three tonics a major third apart, each reached by its dominant. They split the octave into three equal parts.",
    "prog.blues-12": "12-bar blues",
    "prog.blues-12.about": "Twelve bars on I, IV and V, all dominant sevenths: four bars of I, two of IV, two of I, then V, IV, I and V to turn back to the top.",
    "prog.blues-minor": "Minor blues",
    "prog.blues-minor.about": "The twelve-bar blues in a minor key: i7 and iv7 minor, the dominant V7 in bars 9 and 12.",
    "prog.blues-jazz": "Jazz blues",
    "prog.blues-jazz.about": "The blues as jazz plays it: a ii-V into IV in bar 4, \u266Fiv\xB07 in bar 6 rising to I, and VI7 leading to the ii-V of the turnaround.",
    "prog.bird-blues": "Bird blues",
    "prog.bird-blues.about": "Charlie Parker's blues (Blues for Alice): chains of ii-V falling by step from bar 2 to bar 8.",
    "prog.I-V-vi-IV": "I-V-vi-IV",
    "prog.I-V-vi-IV.about": "The pop progression of countless songs: four chords in a loop, from the tonic through the dominant to the relative minor and the subdominant.",
    "prog.I-vi-IV-V": "I-vi-IV-V (fifties)",
    "prog.I-vi-IV-V.about": "The fifties progression, of doo-wop and early rock and roll.",
    "prog.I-IV-V": "I-IV-V",
    "prog.I-IV-V.about": "Three chords, tonic, subdominant and dominant: the ground of the blues, country and folk.",
    "prog.pachelbel": "Pachelbel's Canon",
    "prog.pachelbel.about": "The bass of Pachelbel's Canon, falling a fourth and rising a step in its first six chords; much used again in pop.",
    "prog.andalusian": "Andalusian cadence",
    "prog.andalusian.about": "i VII VI V in a minor key: a bass falling by step from the tonic to the dominant, the sound of flamenco. Heard on its last chord as the tonic, it is phrygian.",
    "prog.authentic-cadence": "Authentic cadence",
    "prog.authentic-cadence.about": "V7 to I: the dominant, its leading tone a semitone under the tonic, resolves to it. The cadence that closes a piece.",
    "prog.plagal-cadence": "Plagal cadence",
    "prog.plagal-cadence.about": 'IV to I, the "Amen" sung at the end of hymns: the tonic reached from the subdominant, without a leading tone.',
    "prog.deceptive-cadence": "Deceptive cadence",
    "prog.deceptive-cadence.about": "V7 to vi instead of I: the leading tone rises to the tonic as expected, but the bass rises a step to the relative minor under it.",
    "prog.half-cadence": "Half cadence",
    "prog.half-cadence.about": "The phrase stops on V, open, waiting for the tonic that follows.",
    "prog.phrygian-half-cadence": "Phrygian half cadence",
    "prog.phrygian-half-cadence.about": "In a minor key, iv in first inversion to V: the bass falls a semitone, from the sixth degree to the fifth.",
    "prog.minor-plagal-cadence": "Minor plagal cadence",
    "prog.minor-plagal-cadence.about": "IV turns minor, iv borrowed from the parallel minor, before the major tonic: its \u266D6 falls a semitone to the fifth of I.",
    "prog.bVI-bVII-I": "\u266DVI-\u266DVII-I",
    "prog.bVI-bVII-I.about": "\u266DVI and \u266DVII, borrowed from the parallel minor, rise by whole steps to the major tonic.",
    "prog.picardy-third": "Picardy third",
    "prog.picardy-third.about": "A piece in a minor key ends on the major tonic: the third of i raised a semitone in the last chord.",
    // Key panel
    "keyPanel.sevenths.title": "Seventh chords instead of triads",
    "keyPanel.neg": "Neg",
    "keyPanel.neg.title": "Show/hide negative harmony",
    "keyPanel.par": "Par",
    "keyPanel.par.title": "Show/hide parallel modes",
    "keyPanel.usual.title": "Of the parallel modes, only the usual borrowings: in major, the parallel minor's chords; in minor, the Picardy third and the dorian IV. A church mode has no such list: all are shown",
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
    "velocity.empty": "Play to see how hard each note is struck",
    "velocity.bar": "{note}: velocity {v} of 127",
    // Guitar
    "guitar.none": "No voicings",
    "guitar.prev": "Previous voicing",
    "guitar.next": "Next voicing",
    "guitar.string": "String {n}",
    "tuning.standard": "Standard",
    "tuning.dropD": "Drop D",
    "tuning.openG": "Open G",
    "tuning.openD": "Open D",
    "tuning.dadgad": "DADGAD",
    "tuning.lowG": "Low G",
    "instrument.guitar": "Guitar",
    "instrument.guitar7": "7-string guitar",
    "instrument.bass": "Bass",
    "instrument.bass5": "5-string bass",
    "instrument.ukulele": "Ukulele",
    "instrument.baritone": "Baritone ukulele",
    "instrument.mandolin": "Mandolin",
    "instrument.banjo": "Banjo (5-string)",
    "strings.view": "View",
    "strings.open": "Open",
    "strings.openFrom": "Open strings, from fret {n}",
    "strings.barre": "Barre at fret {n}",
    "strings.fromFret": "From fret {n}",
    "strings.position": "Shape {i} of {n}",
    "strings.setup.title": "Instrument, tuning and labels: in the \u22EF menu",
    "strings.instrument": "Instrument",
    "strings.tuning": "Tuning",
    "strings.strings": "Strings, lowest first: type a note for a tuning of your own",
    "strings.labels": "Under the strings",
    "strings.labels.none": "Nothing",
    "strings.labels.tuning": "Tuning",
    "strings.labels.notes": "Notes",
    "strings.view.shapes": "Shapes",
    "strings.view.shapes.title": "The chord's playable shapes, one at a time",
    "strings.view.neck": "Neck",
    "strings.view.neck.title": "Every place the notes sounding are on the neck, frets 0\u201312",
    "guitar.tuning.custom": "Custom",
    // History
    "history.clear": "Clear",
    "history.send": "\u2192 Song",
    "history.send.title": "Put the chord marked (or the newest) in the song, after its cursor (S)",
    "history.clear.title": "Clear history (C) \u2014 can be undone",
    "history.cleared": "History cleared ({n})",
    "history.removed": "Removed {chord}",
    "history.chip.inKey": "{roman} in {key}",
    "history.chip.actions": "click to play, drag to song, right-click to remove",
    "history.chip.duration": "sounded {s} s",
    "history.rhythm.perBar": "Harmonic rhythm: {n} changes per bar (\u2669 = {bpm}, {beats}/4)",
    "history.rhythm.seconds": "Harmonic rhythm: a change every {s} s on average",
    "history.rhythm.title": "How often the chords change, over the chords played since the last ones without a time. Set a tempo in the \u22EF menu to read it per bar.",
    "ex.term.rhythm": "Harmonic rhythm",
    "ex.rhythm": "How often the chords change, whatever the melody does: one chord per bar is a slow harmonic rhythm, two or more a fast one. It quickens towards a cadence and holds still on a pedal.",
    "history.modulation": "Modulation to {key}: from here the numerals are read in it",
    // Song
    "song.untitled": "Untitled",
    "song.list": "Your songs",
    "chord.add.title": "Add a chord to this bar",
    "song.newSong": "New song",
    "song.addSection": "+ Section",
    "song.more": "More: new song, transpose, export, delete",
    "song.play": "Play the song",
    "song.play.title": "Play the song from the chord selected, or from the top: each chord as long as its share of the bar, the sections as many times as their \xD7N (Esc stops)",
    "song.stop": "Stop the song",
    "song.stop.title": "Stop (Esc)",
    "song.tempo": "Tempo",
    "song.beats": "Beats per bar",
    "song.tempo.title": "The tempo and the bar the song plays at",
    "song.transposeBy": "Transpose up",
    "song.bars": "{n} bars",
    "song.auto": "auto",
    "song.strip": "The song's form: a click goes to the section, drag a block to reorder",
    "song.strip.add": "Add a section",
    "song.empty": "An empty song: add a section, paste chords, or play and press S to send them here.",
    "section.write": "How the section is written",
    "section.chips": "Chips",
    "section.text": "Text",
    "section.text.hint": "| separates bars \xB7 letters or Do Re Mi \xB7 Enter keeps it, Esc leaves it as it was",
    "section.text.ok": "\u2713 {bars} bars, {chords} chords",
    "section.text.bad": "Not understood: {names}",
    "section.collapse.title": "Fold or unfold the section",
    "song.saved.title": "Saved songs",
    "song.new": "New",
    "song.new.title": "Start a new song; the current one stays in the list",
    "song.delete": "Delete the song",
    "song.delete.title": "Delete this song \u2014 can be undone",
    "song.deleted": 'Deleted "{title}"',
    "song.paste": "Paste chords",
    "song.paste.title": "Paste a chord progression as text",
    "song.paste.placeholder": "Am G | C F  (| separates measures; without bars, one chord per measure)",
    "song.paste.add": "Add chords",
    "song.addSection.title": "Add {name} section",
    "song.transpose": "\u21C4 Transpose",
    "song.transpose.title": "Transpose all chords up by semitones",
    "song.transpose.step": "+{n}",
    "song.export": "Export or print",
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
    "help.heading": "Help",
    "help.mouse": "Mouse",
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
    "kbd.space": "Space",
    "kbd.del": "Del",
    "kbd.esc": "Esc",
    "shortcut.escape": "Drop a held chord, clear cursor, stop MIDI fill",
    "shortcut.candidate": "Select chord candidate",
    "gesture.click": "Click a history chip, song chord or circle segment to play it and show it in the detector.",
    "gesture.doubleClick": "Double-click a major or minor circle segment to make it the key.",
    "gesture.logged": "A chord is logged to history once held steady for 0.8 s, and not twice in a row.",
    "gesture.drag": "Drag a history chip onto a song measure to insert it; drag song chords and section headers to reorder.",
    "gesture.fill": "\u2299 on a song chord arms MIDI fill: each chord you play fills a slot and arms the next, until the song ends or Esc.",
    "gesture.remove": "Right-click a history chip to remove it. Removals and Clear can be undone from the toast.",
    "gesture.piano": "Click the on-screen piano to play: in Hold each click adds or removes a note of the chord.",
    "gesture.layout": "Drag a panel by its title to move it, by its corner to resize it; \xD7 hides it, the \u25A6 menu shows it again.",
    "help.touch": "Gestures",
    "a11y.tabbar": "Input, sound, panels",
    "tab.input": "Input",
    "tab.sound": "Sound",
    "tab.mic": "Mic",
    "tab.panels": "Panels",
    "tab.more": "More",
    "tab.present": "Presentation",
    "gesture.touch.tap": "Tap a chord in the history, the song or the circle to hear it and see it in the detector.",
    "gesture.touch.doubleTap": "Double-tap a major or minor sector of the circle to make it the key.",
    "gesture.touch.song": "Tap a chord of the song to show its buttons: edit, duplicate, MIDI fill, remove.",
    "gesture.touch.remove": "Press and hold a chord in the history to remove it. What is removed or cleared comes back from the notice.",
    "gesture.touch.piano": "Touch the on-screen piano with several fingers at once to make a chord; in Hold each tap adds or removes a note.",
    "gesture.touch.layout": "\xD7 hides a panel; Panels, in the bar at the bottom, shows it again."
  };

  // src/i18n/es.ts
  var es = {
    "page.noMidi": "Este navegador no tiene Web MIDI y no puede conectar un controlador (Chrome, Edge y Firefox s\xED). Todo lo dem\xE1s funciona: canciones, c\xEDrculo de quintas, historial.",
    "page.insecure": "Abierto por http en la red local, el navegador oculta el MIDI y el micr\xF3fono: abre Modus desde este equipo (localhost) o por https para usarlos. Todo lo dem\xE1s funciona.",
    "page.cdnError": "Un archivo de la app no se carg\xF3. Recarga la p\xE1gina; si sigue fallando, la copia que tienes est\xE1 incompleta.",
    "midi.connected": "MIDI: conectado",
    "midi.noDevices": "MIDI: ninguno",
    "midi.disconnected": "MIDI: desconectado",
    "midi.noDeviceOption": "Sin dispositivos MIDI",
    "midi.denied": "Acceso MIDI denegado. Da permiso en los ajustes del navegador para usar un controlador.",
    "midi.inChannel.title": "Canal de entrada: solo se leen las notas de este canal (un teclado dividido o una pista del DAW)",
    "midi.inChannel.all": "Todos los canales",
    "midi.inChannel.one": "Canal {n}",
    "midi.out.title": "Salida MIDI: lo que suena se env\xEDa a este puerto",
    "midi.out.loops": "Es el mismo puerto que la entrada: no se env\xEDa nada, volver\xEDa como entrada",
    "midi.out.off": "Ninguna",
    "midi.out.port": "{name}",
    "midi.out.absent": "{name} (ausente)",
    "midi.outChannel.title": "Canal de salida MIDI",
    "midi.outChannel.one": "Canal {n}",
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
    "typed.placeholder": "Escribe un acorde o una orden",
    "typed.title": "Un acorde para tocarlo (en letras o en Do Re Mi: Am7, Lam7), o el nombre de una opci\xF3n: modo, tonalidad, disposici\xF3n, panel, instrumento\u2026 (/)",
    "cmd.results": "Acordes y \xF3rdenes",
    "cmd.play": "Tocar {chord}",
    "cmd.mode": "Modo: {mode}",
    "cmd.key": "Tonalidad: {key}",
    "cmd.keyAuto": "Tonalidad: autom\xE1tica",
    "cmd.layout": "Disposici\xF3n: {name}",
    "cmd.show": "Mostrar panel: {name}",
    "cmd.hide": "Ocultar panel: {name}",
    "cmd.instrument": "Instrumento: {name}",
    "cmd.view": "Ventana de vista: {name}",
    "cmd.present": "Presentaci\xF3n",
    "cmd.settings": "Ajustes",
    "cmd.help": "Ayuda",
    "cmd.rail": "Mostrar u ocultar el riel",
    "cmd.on": "activo",
    "cmd.menu": "men\xFA \u22EF",
    "cmd.setting": "Ajustes: {name}",
    "cmd.playCurrent": "Tocar el acorde",
    "cmd.send": "Mandar el acorde a la canci\xF3n",
    "cmd.clearHistory": "Borrar el historial",
    "cmd.escape": "Soltar el acorde mantenido, parar el relleno MIDI",
    "cmd.tour": "Visita guiada",
    "cmd.export": "Guardar {name} como {format}",
    "cmd.none": "Ni acorde ni orden con \xAB{q}\xBB",
    "cmd.hint": "Un acorde (Sol7, Fa#m7b5\u2026) lo toca; el nombre de una opci\xF3n la hace.",
    "rail.title": "Mostrar u ocultar el riel (entrada, sonido, disposici\xF3n, presentaci\xF3n, ventanas)",
    "input.playWith": "Tocar con",
    "input.keyboard": "Teclado del ordenador",
    "input.mic": "Micr\xF3fono (cantar o tocar)",
    "sound.filter": "Buscar instrumento",
    "key.menu.title": "Tonalidad: autom\xE1tica seg\xFAn lo que tocas, o una fija",
    "key.menu.hint": "En el orden del c\xEDrculo de quintas. Auto sigue lo que tocas.",
    "key.auto.title": "Auto: la tonalidad se lee de lo que tocas",
    "key.autoShort": "Auto",
    "key.majorCap": "Mayor",
    "key.minorCap": "Menor",
    "key.modes": "Modos",
    "key.mode.title": "Una tonalidad en {mode}: su t\xF3nica y sus acordes le\xEDdos como propios del modo",
    "key.mode.dorian": "D\xF3rico",
    "key.mode.phrygian": "Frigio",
    "key.mode.lydian": "Lidio",
    "key.mode.mixolydian": "Mixolidio",
    "key.mode.locrian": "Locrio",
    "key.none": "Tonalidad",
    "audio.title": "Estado del soundfont",
    "audio.idle": "\u266A en espera",
    "audio.loading": "\u266A cargando\u2026",
    "audio.suspended": "\u266A pulsa una tecla o haz clic",
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
    "present.title": "Presentaci\xF3n: esta disposici\xF3n sin controles, a pantalla completa (P; Esc para salir)",
    "layout.title": "Disposici\xF3n: predefinidas y guardadas, qu\xE9 paneles se ven",
    "layout.presets": "Disposiciones",
    "layout.preset.standard": "Est\xE1ndar",
    "layout.preset.standard.title": "Todos los paneles, como era la p\xE1gina",
    "layout.preset.study": "Estudio",
    "layout.preset.study.title": "Tonalidad y an\xE1lisis grandes, lo que se toca al lado",
    "layout.preset.class": "Clase",
    "layout.preset.class.title": "El acorde y de d\xF3nde viene, pocos paneles, grandes: para un proyector, con P",
    "layout.preset.transcription": "Transcripci\xF3n",
    "layout.preset.transcription.title": "Historial y canci\xF3n junto al piano y el m\xE1stil",
    "layout.preset.recording": "Grabaci\xF3n",
    "layout.preset.recording.title": "Acorde, pentagrama, guitarra y piano para una c\xE1mara o captura de pantalla",
    "layout.saved": "Guardadas",
    "layout.delete": "Borrar esta disposici\xF3n",
    "layout.name": "Nombre",
    "layout.save": "Guardar esta",
    "layout.panels": "Paneles",
    "layout.hint": "Arrastra un panel por su t\xEDtulo y cambia su tama\xF1o desde la esquina: se ajusta a la rejilla.",
    "module.chord": "Acorde",
    "module.staff": "Pentagrama",
    "module.analysis": "An\xE1lisis",
    "module.cof": "C\xEDrculo de quintas",
    "module.guitar": "Cuerdas",
    "module.explain": "Explicaci\xF3n",
    "module.next": "Siguiente",
    "module.metronome": "Metr\xF3nomo",
    "module.progressions": "Progresiones",
    "module.ear": "Entrenamiento auditivo",
    "module.player": "Reproductor",
    "module.tuner": "Afinador",
    "module.key": "Tonalidad",
    "module.piano": "Piano",
    "module.velocity": "Velocidad",
    "module.history": "Historial",
    "module.song": "Canci\xF3n",
    "module.drag": "Arrastra para mover",
    "module.hide": "Ocultar este panel (el men\xFA \u25A6 lo vuelve a mostrar)",
    "module.resize": "Arrastra para cambiar el tama\xF1o",
    "menu.options": "Opciones del panel",
    "menu.optionsOf": "Opciones de {name}",
    "menu.size": "Tama\xF1o del texto",
    "menu.clef": "Pentagramas",
    "menu.prev": "Acorde anterior",
    "menu.fields": "Campos",
    "menu.flat": "Bemoles",
    "menu.sharp": "Sostenidos",
    "menu.minor": "Anillos menor y disminuido",
    "menu.degrees": "Grados",
    "menu.sevenths": "Cuatr\xEDadas",
    "menu.negative": "Armon\xEDa negativa",
    "menu.parallel": "Modos paralelos",
    "menu.usualBorrowings": "Solo pr\xE9stamos habituales",
    "menu.coltrane": "Eje de Coltrane",
    "menu.controls": "Controles",
    "a11y.group.input": "Entrada",
    "a11y.group.mode": "Modo de tocar",
    "a11y.group.key": "Tonalidad",
    "a11y.group.sound": "Sonido",
    "a11y.group.page": "P\xE1gina",
    "head.from": "desde",
    "head.also": "Tambi\xE9n",
    "head.empty": "Toca, o escribe un acorde",
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
    "view.guitar": "Cuerdas",
    "help.title": "Ayuda: teclas, gestos, paneles (?)",
    "ctrl.smaller": "M\xE1s peque\xF1o",
    "ctrl.larger": "M\xE1s grande",
    "staff.clef.title": "Pentagramas: doble (clave de sol y de fa, separados en el Do central), solo clave de sol, solo clave de fa",
    "staff.clef.grand": "Doble",
    "staff.clef.treble": "Sol",
    "staff.clef.bass": "Fa",
    "staff.prev.title": "Escribir el acorde anterior junto a este, para ver moverse cada voz",
    "piano.prev.title": "Marcar las teclas del acorde anterior, para ver moverse cada voz",
    "cof.flat.title": "Enarm\xF3nicos con bemoles (Solb, Reb\u2026)",
    "cof.sharp.title": "Enarm\xF3nicos con sostenidos (Fa#, Do#\u2026)",
    "cof.spelledInKey": "Escrito como en {key}; bemoles o sostenidos sirven sin tonalidad",
    "cof.minor.title": "Mostrar u ocultar los anillos menor y disminuido",
    "cof.degrees.title": "Mostrar los grados (I, IV, V\u2026)",
    "cof.sevenths.title": "Mostrar cuatr\xEDadas (maj7, m7, \xF87)",
    "cof.segment.tip": "Clic: tocar \xB7 doble clic: usar como tonalidad",
    "cof.segment.play": "Clic: tocar",
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
    "field.slash": "Barra",
    "field.slash.title": "Un acorde sobre un bajo ajeno a \xE9l: estructura superior, policordio o h\xEDbrido",
    "field.slash.row": "Barra",
    "field.movable": "Do m\xF3vil",
    "field.movable.title": "Las notas en do m\xF3vil en la tonalidad: do es la t\xF3nica, ti la s\xE9ptima, las notas fuera de la escala con su propia s\xEDlaba (fi, te\u2026)",
    "field.movable.row": "Do m\xF3vil",
    "slash.over": "{upper} sobre {bass}",
    "slash.overBass": "sobre {bass}",
    "slash.type.upper-structure": "estructura superior",
    "slash.type.polychord": "policordio",
    "slash.type.hybrid": "h\xEDbrido",
    "field.forte": "Conj",
    "field.forte.title": "Clase de conjunto: n\xFAmero de Forte, forma prima, vector interv\xE1lico",
    "field.forte.row": "Conjunto",
    "field.voices": "Voces",
    "field.voices.title": "Conducci\xF3n de voces: c\xF3mo se mueve cada voz desde el acorde anterior, desde el bajo",
    "field.voices.row": "Voces",
    "field.rules": "Reglas",
    "field.rules.title": "Reglas de la escritura a cuatro voces que se rompen desde el acorde anterior: paralelas, cruces, sensible, s\xE9ptima",
    "field.rules.row": "Reglas",
    "analysis.note": "Nota",
    "analysis.interval": "Intervalo",
    "analysis.inversion": "Inversi\xF3n",
    "analysis.semitones": "{n} semit.",
    "analysis.yes": "S\xED",
    "ex.term.diatonic": "Diat\xF3nico",
    "ex.term.figbass": "Bajo cifrado {fig}",
    "ex.term.voicing": "Posici\xF3n {v}",
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
    "vl.bass": "bajo",
    "vl.top": "voz superior",
    "vl.voice": "voz {n}",
    "vl.and": " y ",
    "vl.outer.parallel": "extremas paralelas",
    "vl.outer.similar": "extremas directas",
    "vl.outer.contrary": "extremas contrarias",
    "vl.outer.oblique": "extremas oblicuas",
    "vl.outer.static": "extremas quietas",
    "vl.total": "{n} semitonos en total",
    "vl.common": "{n} comunes",
    "vl.none": "ninguna rota",
    "vl.issue.parallel5": "quintas paralelas ({voices})",
    "vl.issue.parallel8": "octavas paralelas ({voices})",
    "vl.issue.hidden5": "quinta directa en las extremas",
    "vl.issue.hidden8": "octava directa en las extremas",
    "vl.issue.crossing": "voces cruzadas ({voices})",
    "vl.issue.overlap": "voces superpuestas ({voices})",
    "vl.issue.leap": "salto demasiado amplio ({voices})",
    "vl.issue.leadingTone": "la sensible no sube a la t\xF3nica ({voices})",
    "vl.issue.doubledLeadingTone": "sensible doblada ({voices})",
    "vl.issue.seventh": "la s\xE9ptima no baja por grado conjunto ({voices})",
    "ex.empty": "Toca o elige un acorde: aqu\xED se explica cada t\xE9rmino del an\xE1lisis, en su tonalidad.",
    "next.empty": "Toca o elige un acorde: aqu\xED se proponen los acordes que suelen seguirle, cada uno con su porqu\xE9.",
    "next.noKey": "Elige una tonalidad, o toca unos acordes para que se lea: lo que sigue a un acorde depende de la tonalidad.",
    "next.none": "En esta tonalidad nada suele seguir a este acorde: ninguna resoluci\xF3n, cadencia ni progresi\xF3n con nombre parte de \xE9l.",
    "next.resolves": "{chord} es {roman}: resuelve en {target}",
    "next.inProgressions": "En",
    "next.play": "Tocar {chord} y mostrarlo tras este acorde",
    "ex.nth.1": "1.\xBA",
    "ex.nth.2": "2.\xBA",
    "ex.nth.3": "3.\xBA",
    "ex.nth.4": "4.\xBA",
    "ex.nth.5": "5.\xBA",
    "ex.nth.6": "6.\xBA",
    "ex.nth.7": "7.\xBA",
    "ex.deg.1": "t\xF3nica",
    "ex.deg.2": "supert\xF3nica",
    "ex.deg.3": "mediante",
    "ex.deg.4": "subdominante",
    "ex.deg.5": "dominante",
    "ex.deg.6": "superdominante",
    "ex.deg.7": "sensible",
    "ex.deg.subtonic": "subt\xF3nica",
    "ex.lowered": "rebajado",
    "ex.raised": "elevado",
    "ex.roman": "{chord} es {roman} en {key}: el acorde sobre el {nth} grado, la {name}.",
    "ex.romanAltered": "{chord} es {roman} en {key}: el acorde sobre el {nth} grado {dir} ({acc}{n}), una nota de fuera de la escala.",
    "ex.case.term": "I \xB7 ii \xB7 vii\xB0 \xB7 \xF8 \xB7 +",
    "ex.case": "Los n\xFAmeros romanos en may\xFAscula son acordes mayores, en min\xFAscula menores; \xB0 disminuido, \xF8 semidisminuido, + aumentado; un 7 a\xF1ade la s\xE9ptima.",
    "ex.fn.T": "Funci\xF3n de t\xF3nica: el acorde de reposo, donde llega la frase. La tiene la t\xF3nica, y los acordes que comparten dos de sus notas.",
    "ex.fn.S": "Funci\xF3n de subdominante: se aleja del reposo y prepara la dominante. Los acordes habituales est\xE1n sobre el 4.\xBA y el 2.\xBA grado.",
    "ex.fn.D": "Funci\xF3n de dominante: tensi\xF3n que pide resolver en la t\xF3nica, sobre todo por la sensible, un semitono por debajo. La tienen los acordes sobre el 5.\xBA y el 7.\xBA grado.",
    "ex.diatonic": "Diat\xF3nico: todas las notas de {chord} est\xE1n en la escala de {key}.",
    "ex.secondaryV": "{chord} es {roman}: dominante secundaria, la dominante de {target} ({targetRoman}). Trata por un momento a {target} como t\xF3nica, con una nota de fuera de la tonalidad, y suele resolver en \xE9l.",
    "ex.secondaryVii": "{chord} es {roman}: acorde de sensible secundario, el vii\xB0 de {target} ({targetRoman}). Su ra\xEDz est\xE1 un semitono por debajo de {target}, al que trata por un momento como t\xF3nica, y suele resolver en \xE9l.",
    "ex.borrowed": "{chord} es un pr\xE9stamo de {mode} (intercambio modal): no est\xE1 en {key}, pero s\xED en el modo sobre la misma t\xF3nica. Sus notas de fuera de la tonalidad ({notes}) le dan su color.",
    "ex.tritoneSub": "{chord} es un sustituto tritonal de la dominante: su ra\xEDz est\xE1 a un tritono de la de la dominante, los dos comparten el mismo tritono (tercera y s\xE9ptima, intercambiadas) y su ra\xEDz baja un semitono a la t\xF3nica.",
    "ex.chromatic": "{chord} es crom\xE1tico en {key}: tiene notas de fuera de la tonalidad ({notes}) y no es dominante secundaria ni acorde de un modo sobre la misma t\xF3nica.",
    "ex.cad.authentic": "De la dominante a la t\xF3nica, el cierre m\xE1s fuerte: la sensible sube a la t\xF3nica. Con los dos acordes en estado fundamental y la t\xF3nica arriba es perfecta.",
    "ex.cad.plagal": "De la subdominante a la t\xF3nica, el \xABam\xE9n\xBB de los himnos: m\xE1s suave que la aut\xE9ntica.",
    "ex.cad.minorPlagal": "Del iv, la subdominante de la menor, a la t\xF3nica: el 6.\xBA grado baja un semitono al 5.\xBA.",
    "ex.cad.deceptive": "La dominante va al 6.\xBA grado en vez de a la t\xF3nica: evita el cierre que promet\xEDa y la frase sigue.",
    "ex.cad.half": "La frase se detiene en la dominante, abierta, como una pregunta que espera respuesta.",
    "ex.cad.phrygianHalf": "iv en primera inversi\xF3n a V, en tonalidad menor: el bajo baja un semitono, del 6.\xBA grado al 5.\xBA.",
    "ex.cad.phrygian": "\u266DII a la t\xF3nica: la ra\xEDz baja un semitono, el color del modo frigio.",
    "ex.cad.backdoor": "\u266DVII7 a la t\xF3nica: un dominante un tono por debajo que sube a ella, en vez de bajar una quinta.",
    "ex.cad.picardy": "Un pasaje en menor cierra en la t\xF3nica mayor.",
    "ex.sub.tritone": "Un dominante a un tritono comparte el mismo tritono y resuelve en el mismo acorde, con la ra\xEDz un semitono por encima.",
    "ex.sub.diatonic": "Un acorde de la tonalidad que comparte dos notas y la funci\xF3n: vi o iii por I, ii por IV, vii\xB0 por V.",
    "ex.sub.deceptive": "La dominante va a vi, que comparte dos notas con la t\xF3nica, en vez de a I.",
    "ex.sub.chromatic-mediant": "Un acorde a distancia de tercera y de la misma especie, con una nota com\xFAn como mucho: un cambio brillante e inesperado.",
    "ex.sub.sus4": "La dominante con la cuarta en vez de la tercera: mantiene la tensi\xF3n sin la sensible.",
    "ex.sub.modal": "El mismo grado tomado del modo sobre la misma t\xF3nica, como iv por IV desde la menor.",
    "ex.plr": "{chord} llega desde {prev} por {path}: movimientos neorriemannianos entre tr\xEDadas, cada uno mantiene dos notas y mueve la otra por grado conjunto.",
    "ex.plr.P": "P (paralelo): la misma ra\xEDz, mayor \u2194 menor; la tercera se mueve un semitono ({a} \u2194 {b}).",
    "ex.plr.R": "R (relativo): un acorde mayor \u2194 su relativo menor; una nota se mueve un tono ({a} \u2194 {b}).",
    "ex.plr.L": "L (intercambio de sensible): una nota se mueve un semitono; un acorde mayor \u2194 el menor una tercera por encima ({a} \u2194 {b}).",
    "ex.fig.intro": "Bajo cifrado: los intervalos sobre el bajo, como los le\xEDa el continuo.",
    "ex.fig.root": "Estado fundamental: la ra\xEDz en el bajo (5/3, que no se escribe).",
    "ex.fig.6": "Primera inversi\xF3n: la tercera en el bajo (6/3, se escribe 6).",
    "ex.fig.64": "Segunda inversi\xF3n: la quinta en el bajo.",
    "ex.fig.7": "Acorde de s\xE9ptima en estado fundamental.",
    "ex.fig.65": "Acorde de s\xE9ptima en primera inversi\xF3n: la tercera en el bajo.",
    "ex.fig.43": "Acorde de s\xE9ptima en segunda inversi\xF3n: la quinta en el bajo.",
    "ex.fig.42": "Acorde de s\xE9ptima en tercera inversi\xF3n: la s\xE9ptima en el bajo.",
    "ex.voicing.close": "Posici\xF3n cerrada: las voces superiores caben en una octava.",
    "ex.voicing.open": "Posici\xF3n abierta: las voces superiores abarcan m\xE1s de una octava.",
    "ex.voicing.drop": "Voicing drop: desde un acorde cerrado, la 2.\xAA voz desde arriba (drop 2), la 3.\xAA (drop 3) o la 2.\xAA y la 4.\xAA (drop 2+4) bajan una octava.",
    "ex.upper": "Estructura superior: una tr\xEDada sobre el esqueleto de un dominante (su tercera y su s\xE9ptima); sus notas son las tensiones del dominante.",
    "ex.slash.upper-structure": "{upper} sobre {bass}: un acorde encima de un bajo que no es nota suya, que se oye como un solo acorde sobre {bass}; las notas de arriba son sus tensiones ({tensions}).",
    "ex.slash.polychord": "{upper} sobre {bass}: un policordio, un acorde sobre un bajo ajeno a \xE9l, que se oye m\xE1s como dos capas que como un acorde; sobre {bass} sus notas son {tensions}.",
    "ex.slash.hybrid": "Sobre {bass}, las notas de arriba no forman un acorde propio: un h\xEDbrido, le\xEDdo como intervalos sobre el bajo ({tensions}).",
    "ex.vl.parallel5": "Dos voces a distancia de quinta pasan a otra quinta: se funden en una y la escritura pierde una voz. Se evita a cuatro voces; es habitual en el rock y en la armon\xEDa paralela.",
    "ex.vl.parallel8": "Dos voces a distancia de octava pasan a otra octava: se doblan y la escritura pierde una voz.",
    "ex.vl.hidden5": "Las voces extremas llegan a una quinta en el mismo sentido, con salto arriba: suena casi como quintas paralelas.",
    "ex.vl.hidden8": "Las voces extremas llegan a una octava en el mismo sentido, con salto arriba: suena casi como octavas paralelas.",
    "ex.vl.crossing": "Una voz grave pasa por encima de una aguda: las l\xEDneas cuestan de seguir.",
    "ex.vl.overlap": "Una voz pasa m\xE1s all\xE1 de donde estaba la voz de al lado: el o\xEDdo puede seguir la l\xEDnea equivocada.",
    "ex.vl.leap": "Un salto mayor de una octava, o de cuarta aumentada, cuesta de cantar y se evita.",
    "ex.vl.leadingTone": "La sensible de la dominante pide subir un semitono a la t\xF3nica.",
    "ex.vl.doubledLeadingTone": "La sensible no se dobla: las dos querr\xEDan subir a la t\xF3nica y dar\xEDan octavas.",
    "ex.vl.seventh": "La s\xE9ptima de una s\xE9ptima de dominante pide bajar por grado conjunto.",
    "ex.interval": "{n} semitonos. Su inversi\xF3n, con la nota grave una octava arriba, es {inv}: juntas suman una octava.",
    "ex.cadence.title": "{cadence}: {text}",
    "prog.group.jazz": "Jazz",
    "prog.group.blues": "Blues",
    "prog.group.pop": "Pop y cl\xE1sicas",
    "prog.group.cadence": "Cadencias",
    "prog.group.mixture": "Pr\xE9stamos",
    "prog.select.title": "Una progresi\xF3n con nombre, escrita en la tonalidad",
    "prog.play.title": "Tocar la progresi\xF3n, un comp\xE1s cada 2,4 s",
    "prog.stop.title": "Parar",
    "ear.mode.interval": "Intervalos",
    "ear.mode.chord": "Acordes",
    "ear.mode.cadence": "Cadencias",
    "ear.mode.degree": "Grados",
    "ear.new": "Pregunta nueva",
    "ear.new.title": "Tocar una pregunta nueva",
    "ear.again.title": "Tocarla otra vez",
    "ear.kind": "Qu\xE9 preguntar",
    "ear.score": "aciertos {right} de {total}",
    "ear.score.title": "Aciertos sobre el total, en este tipo de pregunta",
    "ear.start": "Pulsa Pregunta nueva: la app toca sin ense\xF1ar, y t\xFA dices lo que has o\xEDdo.",
    "ear.ask.interval": "\xBFQu\xE9 intervalo? Dos notas una tras otra y luego juntas.",
    "ear.ask.chord": "\xBFQu\xE9 tipo de acorde?",
    "ear.ask.cadence": "\xBFQu\xE9 cadencia? La t\xF3nica y despu\xE9s los dos acordes que cierran la frase.",
    "ear.ask.degree": "\xBFQu\xE9 grado es la \xFAltima nota? La cadencia fija la tonalidad; contesta en do m\xF3vil.",
    "ear.right": "Correcto: {answer}",
    "ear.wrong": "Era {answer}",
    "ear.chord.maj": "mayor",
    "ear.chord.m": "menor",
    "ear.chord.dim": "disminuido",
    "ear.chord.aug": "aumentado",
    "ear.chord.sus4": "sus4",
    "ear.chord.7": "s\xE9ptima de dominante",
    "ear.chord.maj7": "s\xE9ptima mayor",
    "ear.chord.m7": "menor s\xE9ptima",
    "ear.chord.m7b5": "semidisminuido",
    "ear.chord.dim7": "s\xE9ptima disminuida",
    "player.open": "Abrir\u2026",
    "player.open.title": "Abrir una grabaci\xF3n (o soltarla en el panel). Se queda en este ordenador y no se guarda: \xE1brela de nuevo tras recargar",
    "player.none": "Sin grabaci\xF3n: abre una para transcribirla",
    "player.wave.title": "Clic para ir a ese punto",
    "player.back.title": "Atr\xE1s 5 segundos (no antes de A)",
    "player.play.title": "Reproducir / pausa",
    "player.speed.title": "Velocidad, sin cambiar la altura",
    "player.a.title": "Inicio del bucle: aqu\xED",
    "player.b.title": "Fin del bucle: aqu\xED; desde B vuelve a A",
    "player.clear.title": "Sin bucle",
    "player.chords": "Acordes",
    "player.chords.title": "El acorde del cabezal en el detector, al reproducir y donde saltes: le\xEDdo de la grabaci\xF3n al abrirla",
    "player.reading": "leyendo acordes {p} %",
    "player.readFailed": "no se pudieron leer los acordes",
    "mic.title": "Micr\xF3fono: lo que se canta o se toca entra al detector como notas pulsadas (nunca suena)",
    "mic.on": "Activo",
    "mic.off": "Apagado",
    "mic.mode.notes": "Notas",
    "mic.mode.notes.title": "Una nota cada vez: voz, viento, una melod\xEDa en cualquier instrumento. Alimenta las escalas de la melod\xEDa",
    "mic.mode.chords": "Acordes",
    "mic.mode.chords.title": "Las notas de un acorde, o\xEDdas por un modelo (Basic Pitch) varias veces por segundo: menos de un segundo por detr\xE1s de lo que se toca",
    "mic.hint": "Activa el micr\xF3fono y canta o toca.",
    "mic.listening": "Escuchando\u2026",
    "mic.error": "Sin micr\xF3fono ({error}): perm\xEDtelo en el navegador y vuelve a probar.",
    "mic.insecure": "Sin micr\xF3fono por http en la red local: el navegador solo lo ofrece en este equipo (localhost) o por https.",
    "help.close": "Cerrar",
    "help.keys": "Teclas",
    "help.changeKeys": "Cambiar los atajos\u2026",
    "ex.movableDo": "En solfeo m\xF3vil: {syllable}.",
    "set.title": "Ajustes",
    "set.title.button": "Ajustes (,)",
    "set.search": "Buscar",
    "set.search.placeholder": "tonalidad, atajo, micr\xF3fono\u2026",
    "set.sections": "Secciones",
    "set.nothing": "Ning\xFAn ajuste coincide.",
    "set.footnote": "Esc cierra \xB7 los cambios se guardan solos",
    "set.resetSection": "Restablecer esta secci\xF3n",
    "set.back": "Volver a las secciones",
    "set.pick.done": "Hecho",
    "set.summary.on": "{n} de {total} activadas",
    "set.summary.keys.default": "Como ven\xEDan",
    "set.summary.keys.changed": "{n} cambiadas",
    "set.summary.data": "Exportar, importar, restablecer",
    "set.reloads": "Cambiarlo recarga la p\xE1gina; el historial y las canciones se quedan",
    "set.noteNames.hint": "En todo: detector, pentagrama, piano, c\xEDrculo, historial. Recarga la p\xE1gina",
    "set.section.general": "General",
    "set.section.general.hint": "Idioma, nombres de las notas, aspecto",
    "set.section.io": "Entrada y salida",
    "set.section.io.hint": "Canales MIDI y el puerto al que env\xEDa Modus. El dispositivo de entrada y el modo siguen en la barra",
    "set.section.sound": "Sonido",
    "set.section.sound.hint": "C\xF3mo suenan las vistas previas. Instrumento y volumen siguen en la barra",
    "set.section.theory": "Teor\xEDa",
    "set.section.theory.hint": "C\xF3mo se escriben y se leen los acordes",
    "set.section.detector": "Detector e historial",
    "set.section.detector.hint": "Cu\xE1nto esperan las cosas antes de contar",
    "set.section.panels": "Paneles",
    "set.section.panels.hint": "Las opciones que cada panel lleva en sus botones, tambi\xE9n aqu\xED",
    "set.section.practice": "Pr\xE1ctica",
    "set.section.practice.hint": "Progresiones y entrenamiento auditivo",
    "set.section.mic": "Micr\xF3fono y afinador",
    "set.section.mic.hint": "C\xF3mo escucha el micr\xF3fono y cu\xE1nto vale el La",
    "set.section.shortcuts": "Atajos",
    "set.section.shortcuts.hint": "Las teclas de cada acci\xF3n",
    "set.section.data": "Datos",
    "set.section.data.hint": "Ajustes y disposiciones a un archivo, desde un archivo, o como ven\xEDan. Las canciones y el historial no se tocan",
    "set.io.inChannel": "Canal de entrada",
    "set.io.out": "Salida MIDI",
    "set.io.outChannel": "Canal de salida",
    "set.io.thru": "Thru",
    "set.panels.intro": "Cada casilla es la misma opci\xF3n que en el men\xFA \u22EF del panel: las dos van a la par.",
    "set.panels.prev": "Pentagrama y piano: mostrar el acorde anterior",
    "set.panels.cofMinor": "C\xEDrculo: anillos menor y disminuido",
    "set.panels.cofDegrees": "C\xEDrculo: grados",
    "set.panels.cofSevenths": "C\xEDrculo: acordes de s\xE9ptima",
    "set.panels.keySevenths": "Tonalidad: acordes de s\xE9ptima",
    "set.panels.keyNegative": "Tonalidad: armon\xEDa negativa",
    "set.panels.keyParallel": "Tonalidad: modos paralelos",
    "set.panels.keyColtrane": "Tonalidad: eje de Coltrane",
    "set.ear.reset": "Poner a cero el marcador del entrenamiento",
    "set.ear.reset.button": "A cero",
    "set.ear.reset.hint": "Cada tipo vuelve a 0 / 0",
    "set.mic.mode": "Qu\xE9 escucha el micr\xF3fono",
    "set.mic.mode.hint": "Una nota cada vez, o acordes",
    "set.keys.intro": "Cambiar: pulsa la tecla nueva; Esc deja la que hab\xEDa. Cada acci\xF3n admite dos teclas.",
    "set.keys.press": "Pulsa una tecla\u2026",
    "set.keys.change": "Cambiar",
    "set.keys.add.title": "A\xF1adir una segunda tecla",
    "set.keys.cancel": "Cancelar",
    "set.keys.reset": "Volver a la tecla de f\xE1brica",
    "set.keys.remove": "Quitar {key}",
    "set.keys.none": "sin tecla",
    "set.keys.conflict": "{key} ya es {other}. \xBFPasarla a \xAB{action}\xBB y dejar {other} sin ella?",
    "set.keys.take": "Pasarla",
    "set.keys.other": "Elegir otra",
    "set.keys.fixed": "Siempre iguales",
    "set.keys.fixed.hint": "Esc cierra y cancela, 1\u20139 eligen una lectura del acorde, Tab recorre la p\xE1gina",
    "set.data.export": "Exportar",
    "set.data.export.hint": "Ajustes, atajos y disposiciones a un archivo, para llevarlos a otro ordenador",
    "set.data.export.button": "Guardar el archivo\u2026",
    "set.data.import": "Importar",
    "set.data.import.hint": "Ajustes de un archivo exportado antes; sustituyen a estos, con Deshacer",
    "set.data.import.button": "Abrir un archivo\u2026",
    "set.data.import.bad": "Ese archivo no es de ajustes de Modus.",
    "set.data.reset": "Restablecer todos los ajustes",
    "set.data.reset.hint": "Como ven\xEDan: ajustes, atajos, disposiciones y opciones de los paneles. Canciones, historial y marcador se quedan; Deshacer los recupera",
    "set.data.reset.button": "Restablecer",
    "set.data.imported": "Ajustes importados",
    "set.data.wasReset": "Ajustes restablecidos",
    "action.play": "Tocar el acorde en pantalla",
    "action.stepPrev": "Acorde anterior (canci\xF3n o historial)",
    "action.stepNext": "Acorde siguiente (canci\xF3n o historial)",
    "action.delete": "Quitar el acorde seleccionado de la canci\xF3n",
    "action.hold": "Modo Mantener",
    "action.arpeggio": "Modo Arpegio",
    "action.send": "Enviar la ficha a la canci\xF3n",
    "action.clear": "Vaciar el historial",
    "action.keyboard": "Teclado del ordenador como piano",
    "action.present": "Presentaci\xF3n",
    "action.type": "Escribir un acorde",
    "action.help": "Ayuda",
    "action.settings": "Ajustes",
    "pref.ui-zoom": "Tama\xF1o de la interfaz",
    "pref.ui-zoom.hint": "Todo m\xE1s grande o m\xE1s peque\xF1o, para una pantalla lejana o peque\xF1a",
    "pref.preview-s": "Duraci\xF3n de las vistas previas",
    "pref.preview-s.hint": "Un acorde tocado desde el historial, el c\xEDrculo, la tonalidad o la canci\xF3n",
    "pref.piano-velocity": "Velocidad del piano en pantalla y las vistas previas",
    "pref.piano-velocity.hint": "La velocidad MIDI (1\u2013127) con la que suenan y se env\xEDan por la salida MIDI las notas que no vienen de tu controlador",
    "pref.chord-style": "Cifrado",
    "pref.chord-style.hint": "C\xF3mo se escribe un acorde de s\xE9ptima mayor",
    "pref.chord-style.standard": "Cmaj7",
    "pref.chord-style.symbols": "C\u03947",
    "pref.chord-style.short": "CM7",
    "pref.key-profile": "Detecci\xF3n de tonalidad (Auto)",
    "pref.key-profile.hint": "El perfil con el que se compara lo tocado, para cada tonalidad",
    "pref.key-profile.krumhansl": "Krumhansl-Kessler",
    "pref.key-profile.temperley": "Temperley-Kostka-Payne",
    "pref.key-profile.aarden": "Aarden-Essen",
    "pref.key-profile.bellman": "Bellman-Budge",
    "pref.key-profile.simple": "Simple",
    "pref.voice-rules": "Reglas de conducci\xF3n de voces",
    "pref.voice-rules.hint": "Estricta: coral a cuatro voces. Contempor\xE1nea: sin paralelas ni saltos; cruces, sensible y s\xE9ptima. Especies: contrapunto, saltos hasta la quinta",
    "pref.voice-rules.strict": "Estricta",
    "pref.voice-rules.contemporary": "Contempor\xE1nea",
    "pref.voice-rules.species": "Especies",
    "pref.movable-do": "Solfeo m\xF3vil en las explicaciones",
    "pref.movable-do.hint": "La t\xF3nica es do: en Sol mayor, Sol se llama do",
    "pref.auto-modes": "Auto detecta modos",
    "pref.auto-modes.hint": "Auto puede leer una tonalidad d\xF3rica, lidia\u2026, no solo mayor y menor. Con poca m\xFAsica o sin t\xF3nica clara puede fallar",
    "pref.history-hold-ms": "Mantener un acorde para registrarlo",
    "pref.history-hold-ms.hint": "Cu\xE1nto se mantiene un acorde antes de pasar al historial",
    "pref.history-max": "Fichas que guarda el historial",
    "pref.history-max.hint": "Las m\xE1s antiguas se van primero",
    "pref.history-bpm": "Tempo de lo que tocas",
    "pref.history-bpm.hint": "Para el ritmo arm\xF3nico por comp\xE1s. 0: sin tempo, el tiempo entre cambios en segundos",
    "pref.history-beats": "Pulsos por comp\xE1s",
    "pref.history-beats.hint": "El comp\xE1s en que se cuenta el ritmo arm\xF3nico: 4 para 4/4, 3 para 3/4",
    "pref.arpeggio-ms": "Ventana del modo Arpegio",
    "pref.arpeggio-ms.hint": "Las notas tocadas dentro forman un acorde",
    "pref.melody-gap-s": "Pausa que empieza otra melod\xEDa",
    "pref.melody-gap-s.hint": "Para las escalas que encajan con lo tocado nota a nota",
    "pref.capture-ms": "Asentamiento al rellenar la canci\xF3n",
    "pref.capture-ms.hint": "Cu\xE1nto se mantiene un acorde antes de rellenar el hueco",
    "pref.progression-bpm": "Tempo de las progresiones",
    "pref.progression-bpm.hint": "Un comp\xE1s de 4/4 a este tempo",
    "pref.ear-interval-play": "Los intervalos se tocan",
    "pref.ear-interval-play.hint": "Una nota tras otra (y luego juntas), o las dos a la vez",
    "pref.ear-interval-play.up": "Ascendentes",
    "pref.ear-interval-play.down": "Descendentes",
    "pref.ear-interval-play.harmonic": "Juntas",
    "pref.ear-chords": "Acordes que se preguntan",
    "pref.ear-chords.hint": "Sin ninguno marcado, se preguntan todos",
    "pref.ear-cadences": "Cadencias que se preguntan",
    "pref.ear-cadences.hint": "Sin ninguna marcada, se preguntan todas",
    "pref.a4-hz": "Afinador: La4",
    "pref.a4-hz.hint": "440 Hz lo normal; 442 en muchas orquestas, 415 en barroco",
    "pref.mic-sensitivity": "Sensibilidad del micr\xF3fono",
    "pref.mic-sensitivity.hint": "M\xE1s alta oye lo que se toca suave, y m\xE1s ruido de la sala",
    "pref.mic-sensitivity.low": "Baja",
    "pref.mic-sensitivity.normal": "Normal",
    "pref.mic-sensitivity.high": "Alta",
    "pref.mic-response": "Respuesta del micr\xF3fono",
    "pref.mic-response.hint": "R\xE1pida sigue melod\xEDas \xE1giles; estable ignora una nota de paso",
    "pref.mic-response.fast": "R\xE1pida",
    "pref.mic-response.normal": "Normal",
    "pref.mic-response.steady": "Estable",
    "a11y.toolbar": "Controles",
    "a11y.rail": "Riel",
    "a11y.panels": "Paneles",
    "a11y.panelKeys": "Panel {name}: las flechas lo mueven, May\xFAs + flechas cambian su tama\xF1o",
    "a11y.moved": "{name}: columna {x}, fila {y}, {w} columnas de ancho, {h} filas de alto",
    "a11y.midiDevice": "Dispositivo de entrada MIDI",
    "a11y.key": "Tonalidad",
    "a11y.chord": "{chord}, {roman}, {fn}",
    "a11y.chordNoKey": "{chord}",
    "a11y.note": "Nota {note}",
    "a11y.staff": "Pentagrama: {notes}",
    "a11y.piano": "Piano: {notes}",
    "a11y.strings": "Cuerdas: {chord}",
    "a11y.cof": "C\xEDrculo de quintas: Intro toca un acorde, Intro dos veces fija su tonalidad",
    "a11y.nothing": "nada tocado",
    "a11y.chip": "{chord}, {roman}: Intro lo muestra y lo toca, Supr lo quita",
    "shortcut.tab": "Llegar a cualquier control, ficha o segmento del c\xEDrculo; Intro o Espacio lo pulsa",
    "kbd.panelArrows": "Flechas en el t\xEDtulo de un panel",
    "shortcut.panelArrows": "Mover el panel; con May\xFAs, cambiar su tama\xF1o",
    "tour.next": "Siguiente",
    "tour.back": "Atr\xE1s",
    "tour.skip": "Saltar la visita",
    "tour.close": "Cerrar",
    "tour.done": "A tocar",
    "tour.start": "Visita guiada",
    "tour.start.title": "La visita por la p\xE1gina, otra vez",
    "tour.welcome.title": "Te damos la bienvenida a Modus",
    "tour.welcome": "Toca un acorde y Modus lo nombra y explica su armon\xEDa mientras tocas: su grado en la tonalidad, su funci\xF3n, la cadencia que forma, c\xF3mo se mueven sus voces. Esta visita ense\xF1a d\xF3nde est\xE1 cada cosa; dura un minuto. Las flechas o los botones la recorren, Esc la cierra.",
    "tour.input.title": "Toca",
    "tour.input": "Conecta un teclado MIDI y el\xEDgelo aqu\xED, con la forma de tocar (Normal, Mantener, Arpegio). Sin \xE9l: pulsa M para tocar con el teclado del ordenador, haz clic o toca el piano, activa el micr\xF3fono y canta o toca, o escribe un acorde en el campo de arriba (/); el campo tambi\xE9n encuentra cualquier opci\xF3n por su nombre.",
    "tour.key.title": "La tonalidad",
    "tour.key": "Elige la tonalidad en la que tocas, o d\xE9jala en Auto: Modus la deduce de lo que tocas. Cada grado, funci\xF3n y cadencia se lee en ella.",
    "tour.analysis.title": "Qu\xE9 es",
    "tour.analysis": "El panel Acorde nombra lo que tocas; An\xE1lisis lo lee: grado, funci\xF3n, bajo cifrado, disposici\xF3n, escalas que encajan, cadencia, conducci\xF3n de voces desde el acorde anterior. Su men\xFA \u22EF elige qu\xE9 filas se ven.",
    "tour.explain.title": "Qu\xE9 significa",
    "tour.explain": "Explicaci\xF3n pone en palabras cada t\xE9rmino para el acorde en pantalla: por qu\xE9 Re7 es V7/V, de qu\xE9 modo viene un pr\xE9stamo, qu\xE9 hace una cadencia.",
    "tour.cof.title": "El c\xEDrculo de quintas",
    "tour.cof": "Haz clic en un acorde para o\xEDrlo y analizarlo; dos clics lo hacen tonalidad. El panel Tonalidad muestra sus acordes, su armon\xEDa negativa y los acordes de sus modos paralelos.",
    "tour.history.title": "Historial",
    "tour.history": "Cada acorde que mantienes queda aqu\xED con su grado, y las cadencias y modulaciones entre ellos. Haz clic en una ficha para volver a verla, arr\xE1strala a la canci\xF3n, clic derecho o pulsaci\xF3n larga para quitarla.",
    "tour.layout.title": "Tu disposici\xF3n",
    "tour.layout.touch": "Cada elemento es un panel: oc\xFAltalo con \xD7; sus opciones est\xE1n en su men\xFA \u22EF. Aqu\xED, en Paneles: disposiciones para estudiar, dar clase, transcribir o grabar, y qu\xE9 paneles se ven. M\xE1s presenta la disposici\xF3n a pantalla completa.",
    "tour.layout": "Cada elemento es un panel: arr\xE1stralo por el t\xEDtulo, cambia su tama\xF1o desde la esquina, oc\xFAltalo con \xD7; sus opciones est\xE1n en su men\xFA \u22EF. Aqu\xED, en el riel (se oculta con el bot\xF3n junto al logo): disposiciones para estudiar, dar clase, transcribir o grabar, y las tuyas. P presenta la disposici\xF3n a pantalla completa.",
    "tour.practice.title": "Practica",
    "tour.practice": "Progresiones toca las progresiones cl\xE1sicas en tu tonalidad; Entrenamiento auditivo toca sin ense\xF1ar y t\xFA dices lo que has o\xEDdo; el Reproductor repite y ralentiza una grabaci\xF3n para transcribirla.",
    "tour.help.title": "Ayuda",
    "tour.help": "Aqu\xED est\xE1n los atajos, los gestos y para qu\xE9 sirve cada panel; el idioma, los nombres de las notas y el tema est\xE1n en Ajustes (\u2699). Esta visita vuelve a empezar desde aqu\xED.",
    "help.panels": "Paneles",
    "help.panel.chord": "El acorde tocado, sus notas, grado y funci\xF3n, la cadencia desde el acorde anterior y las otras lecturas de las mismas notas",
    "help.panel.staff": "Las notas en el pentagrama, con la armadura de la tonalidad; su men\xFA \u22EF muestra el acorde anterior",
    "help.panel.analysis": "Grado, funci\xF3n, bajo cifrado, disposici\xF3n, escalas, cadencia, conducci\xF3n de voces\u2026",
    "help.panel.explain": "Cada t\xE9rmino del an\xE1lisis, en palabras",
    "help.panel.next": "Los acordes que suelen seguir, y por qu\xE9",
    "help.panel.metronome": "Cualquier comp\xE1s, talas, comp\xE1s flamenco, aksak, claves, ritmos eucl\xEDdeos y polirritmos, dibujados como un collar",
    "metro.start": "Arrancar el metr\xF3nomo",
    "metro.stop": "Parar el metr\xF3nomo",
    "metro.tempo": "Tempo",
    "metro.tap": "Tap",
    "metro.tap.title": "Marca el pulso con toques: el tempo es la media de los \xFAltimos",
    "metro.kind": "Qu\xE9 cuenta",
    "metro.tab.meter": "Comp\xE1s",
    "metro.tab.cycle": "Ciclo",
    "metro.tab.clave": "Clave",
    "metro.tab.euclid": "Eucl\xEDdeo",
    "metro.tab.poly": "Polirritmo",
    "metro.meter": "Comp\xE1s",
    "metro.meter.title": "Un comp\xE1s: 4/4, 6/8, o aditivo como 2+2+3/8; se acent\xFAa el primer pulso de cada grupo",
    "metro.trad.hindustani": "Indost\xE1nica",
    "metro.trad.carnatic": "Carn\xE1tica",
    "metro.trad.flamenco": "Flamenco",
    "metro.trad.aksak": "Aksak",
    "metro.euclid.k": "golpes",
    "metro.euclid.in": "en",
    "metro.euclid.n": "pasos",
    "metro.use": "Usar",
    "metro.recent": "Recientes",
    "metro.poly.a": "Pulsos de la primera voz",
    "metro.poly.b": "Pulsos de la segunda voz",
    "metro.sub": "Subdivisi\xF3n",
    "metro.sub.title": "{n} clics por pulso",
    "metro.necklace": "El ciclo como un collar: un punto por pulso, encendido el que suena",
    "metro.view": "Vista",
    "metro.view.necklace": "Collar",
    "metro.view.pulses": "Pulsos",
    "metro.pulsesView": "El ciclo como una fila de pulsos: los acentuados m\xE1s altos, encendido el que suena",
    "metro.flash": "Destello en los acentos",
    "metro.flash.title": "El dibujo se ilumina en el primer pulso, y m\xE1s suave en cada acento: para seguirlo de reojo",
    "metro.count": "N\xFAmero grande",
    "metro.count.title": "La cuenta que suena, en grande, en el centro del dibujo",
    "metro.trainer": "Entrenador de tempo",
    "metro.trainer.title": "Sube el tempo a pasos mientras suena, hasta un l\xEDmite",
    "metro.trainer.step": "Subir",
    "metro.trainer.every": "Cada",
    "metro.trainer.cycles": "ciclos",
    "metro.trainer.max": "Hasta",
    "metro.trainer.on": "entrenador hasta {max}",
    "help.panel.cof": "Un clic toca un acorde, dos clics fijan su tonalidad",
    "help.panel.guitar": "Posiciones del acorde o el m\xE1stil entero, para guitarra, bajo, ukelele y m\xE1s",
    "help.panel.key": "Los acordes de la tonalidad, armon\xEDa negativa, modos paralelos, eje de Coltrane",
    "help.panel.piano": "Lo que suena; haz clic o toca una tecla para tocar",
    "help.panel.velocity": "Con qu\xE9 fuerza se toc\xF3 cada nota",
    "help.panel.progressions": "Progresiones cl\xE1sicas en la tonalidad, para o\xEDrlas y analizarlas",
    "help.panel.ear": "Reconocer de o\xEDdo un intervalo, un acorde o una cadencia",
    "help.panel.player": "Una grabaci\xF3n para transcribir: repetirla y ralentizarla",
    "help.panel.tuner": "La nota cantada o tocada, y cu\xE1nto se desv\xEDa",
    "help.panel.history": "Los acordes tocados, con grados y cadencias",
    "help.panel.song": "Una canci\xF3n en secciones y compases",
    "prog.ii-V-I": "ii-V-I",
    "prog.ii-V-I.about": "La base de la armon\xEDa del jazz: subdominante (ii7), dominante (V7), t\xF3nica (Imaj7). La ra\xEDz baja una quinta cada vez, y la s\xE9ptima de cada acorde baja un grado a la tercera del siguiente.",
    "prog.ii-V-i": "ii-V-i (menor)",
    "prog.ii-V-i.about": "El ii-V-I de una tonalidad menor: un ii semidisminuido, un V7 dominante con la sensible elevada como en la menor arm\xF3nica, y una t\xF3nica menor.",
    "prog.turnaround-jazz": "Turnaround de jazz (I-vi-ii-V)",
    "prog.turnaround-jazz.about": "El turnaround que lleva los \xFAltimos compases de un tema de vuelta al principio: desde vi las ra\xEDces bajan por quintas hasta la dominante.",
    "prog.backdoor-ii-V": "ii-V por la puerta trasera (backdoor)",
    "prog.backdoor-ii-V.about": "iv7, \u266DVII7 y I, los dos primeros prestados de la menor: \u266DVII7 llega a la t\xF3nica desde un tono por debajo en vez de desde la dominante.",
    "prog.rhythm-changes": "Rhythm changes",
    "prog.rhythm-changes.about": "La secci\xF3n A de I Got Rhythm de Gershwin: turnarounds I-vi-ii-V y despu\xE9s I7 hacia IV e iv de vuelta. Despu\xE9s del blues, la forma que m\xE1s toca el jazz.",
    "prog.coltrane-changes": "Cambios de Coltrane",
    "prog.coltrane-changes.about": "Un ii-V-I que pasa por tres t\xF3nicas a distancia de tercera mayor (I, \u266DVI, III), cada una precedida de su dominante, como en Countdown de Coltrane.",
    "prog.giant-steps-cycle": "Giant Steps (compases 1\u20133)",
    "prog.giant-steps-cycle.about": "El comienzo de Giant Steps: tres t\xF3nicas a distancia de tercera mayor, cada una precedida de su dominante. Dividen la octava en tres partes iguales.",
    "prog.blues-12": "Blues de 12 compases",
    "prog.blues-12.about": "Doce compases sobre I, IV y V, todos con s\xE9ptima de dominante: cuatro compases de I, dos de IV, dos de I, y despu\xE9s V, IV, I y V para volver al principio.",
    "prog.blues-minor": "Blues menor",
    "prog.blues-minor.about": "El blues de doce compases en tonalidad menor: i7 e iv7 menores, el V7 dominante en los compases 9 y 12.",
    "prog.blues-jazz": "Blues de jazz",
    "prog.blues-jazz.about": "El blues tal como lo toca el jazz: un ii-V hacia IV en el comp\xE1s 4, \u266Fiv\xB07 en el 6 que sube a I, y VI7 hacia el ii-V del turnaround.",
    "prog.bird-blues": "Bird blues",
    "prog.bird-blues.about": "El blues de Charlie Parker (Blues for Alice): cadenas de ii-V que bajan por grados del comp\xE1s 2 al 8.",
    "prog.I-V-vi-IV": "I-V-vi-IV",
    "prog.I-V-vi-IV.about": "La progresi\xF3n pop de infinidad de canciones: cuatro acordes en bucle, de la t\xF3nica por la dominante al relativo menor y la subdominante.",
    "prog.I-vi-IV-V": "I-vi-IV-V (a\xF1os cincuenta)",
    "prog.I-vi-IV-V.about": "La progresi\xF3n de los a\xF1os cincuenta, del doo-wop y el primer rock and roll.",
    "prog.I-IV-V": "I-IV-V",
    "prog.I-IV-V.about": "Tres acordes, t\xF3nica, subdominante y dominante: la base del blues, el country y el folk.",
    "prog.pachelbel": "Canon de Pachelbel",
    "prog.pachelbel.about": "El bajo del Canon de Pachelbel, que baja una cuarta y sube un grado en sus seis primeros acordes; muy usado de nuevo en el pop.",
    "prog.andalusian": "Cadencia andaluza",
    "prog.andalusian.about": "i VII VI V en tonalidad menor: un bajo que baja por grados de la t\xF3nica a la dominante, el sonido del flamenco. O\xEDda con su \xFAltimo acorde como t\xF3nica, es frigia.",
    "prog.authentic-cadence": "Cadencia aut\xE9ntica",
    "prog.authentic-cadence.about": "V7 a I: la dominante, con la sensible un semitono por debajo de la t\xF3nica, resuelve en ella. La cadencia que cierra una obra.",
    "prog.plagal-cadence": "Cadencia plagal",
    "prog.plagal-cadence.about": 'IV a I, el "Am\xE9n" que se canta al final de los himnos: la t\xF3nica desde la subdominante, sin sensible.',
    "prog.deceptive-cadence": "Cadencia rota",
    "prog.deceptive-cadence.about": "V7 a vi en lugar de I: la sensible sube a la t\xF3nica como se espera, pero debajo el bajo sube un grado al relativo menor.",
    "prog.half-cadence": "Semicadencia",
    "prog.half-cadence.about": "La frase se detiene en V, abierta, a la espera de la t\xF3nica que sigue.",
    "prog.phrygian-half-cadence": "Semicadencia frigia",
    "prog.phrygian-half-cadence.about": "En tonalidad menor, iv en primera inversi\xF3n a V: el bajo baja un semitono, del sexto grado al quinto.",
    "prog.minor-plagal-cadence": "Cadencia plagal menor",
    "prog.minor-plagal-cadence.about": "El IV se vuelve menor, iv prestado del menor paralelo, antes de la t\xF3nica mayor: su \u266D6 baja un semitono a la quinta de I.",
    "prog.bVI-bVII-I": "\u266DVI-\u266DVII-I",
    "prog.bVI-bVII-I.about": "\u266DVI y \u266DVII, prestados del menor paralelo, suben por tonos hasta la t\xF3nica mayor.",
    "prog.picardy-third": "Tercera de picard\xEDa",
    "prog.picardy-third.about": "Una obra en tonalidad menor acaba en la t\xF3nica mayor: la tercera de i sube un semitono en el \xFAltimo acorde.",
    "keyPanel.sevenths.title": "Cuatr\xEDadas en lugar de tr\xEDadas",
    "keyPanel.neg": "Neg",
    "keyPanel.neg.title": "Mostrar u ocultar la armon\xEDa negativa",
    "keyPanel.par": "Par",
    "keyPanel.par.title": "Mostrar u ocultar los modos paralelos",
    "keyPanel.usual.title": "De los modos paralelos, solo los pr\xE9stamos habituales: en mayor, los acordes del menor paralelo; en menor, la picarda y el IV d\xF3rico. Un modo no tiene esa lista: se muestran todos",
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
    "velocity.empty": "Toca para ver con qu\xE9 fuerza suena cada nota",
    "velocity.bar": "{note}: velocidad {v} de 127",
    "guitar.none": "Sin posiciones",
    "guitar.prev": "Posici\xF3n anterior",
    "guitar.next": "Posici\xF3n siguiente",
    "guitar.string": "Cuerda {n}",
    "tuning.standard": "Est\xE1ndar",
    "tuning.dropD": "Drop D",
    "tuning.openG": "Sol abierto",
    "tuning.openD": "Re abierto",
    "tuning.dadgad": "DADGAD",
    "tuning.lowG": "Sol grave",
    "instrument.guitar": "Guitarra",
    "instrument.guitar7": "Guitarra de 7 cuerdas",
    "instrument.bass": "Bajo",
    "instrument.bass5": "Bajo de 5 cuerdas",
    "instrument.ukulele": "Ukelele",
    "instrument.baritone": "Ukelele bar\xEDtono",
    "instrument.mandolin": "Mandolina",
    "instrument.banjo": "Banjo (5 cuerdas)",
    "strings.view": "Vista",
    "strings.open": "Al aire",
    "strings.openFrom": "Al aire, desde el traste {n}",
    "strings.barre": "Cejilla en el {n}",
    "strings.fromFret": "Desde el traste {n}",
    "strings.position": "Posici\xF3n {i} de {n}",
    "strings.setup.title": "Instrumento, afinaci\xF3n y etiquetas: en el men\xFA \u22EF",
    "strings.instrument": "Instrumento",
    "strings.tuning": "Afinaci\xF3n",
    "strings.strings": "Cuerdas, de la m\xE1s grave a la m\xE1s aguda: escribe una nota para una afinaci\xF3n propia",
    "strings.labels": "Bajo las cuerdas",
    "strings.labels.none": "Nada",
    "strings.labels.tuning": "Afinaci\xF3n",
    "strings.labels.notes": "Notas",
    "strings.view.shapes": "Posiciones",
    "strings.view.shapes.title": "Las posiciones tocables del acorde, una a una",
    "strings.view.neck": "M\xE1stil",
    "strings.view.neck.title": "Todos los sitios del m\xE1stil donde est\xE1n las notas que suenan, trastes 0\u201312",
    "guitar.tuning.custom": "Personal",
    "history.clear": "Borrar",
    "history.send": "\u2192 Canci\xF3n",
    "history.send.title": "Pon el acorde marcado (o el \xFAltimo) en la canci\xF3n, tras su cursor (S)",
    "history.clear.title": "Borrar el historial (C); se puede deshacer",
    "history.cleared": "Historial borrado ({n})",
    "history.removed": "Quitado {chord}",
    "history.chip.inKey": "{roman} en {key}",
    "history.chip.actions": "clic para tocar, arrastra a la canci\xF3n, clic derecho para quitar",
    "history.chip.duration": "son\xF3 {s} s",
    "history.rhythm.perBar": "Ritmo arm\xF3nico: {n} cambios por comp\xE1s (\u2669 = {bpm}, {beats}/4)",
    "history.rhythm.seconds": "Ritmo arm\xF3nico: un cambio cada {s} s de media",
    "history.rhythm.title": "Cada cu\xE1nto cambian los acordes, sobre los tocados desde los \xFAltimos sin tiempo. Pon un tempo en el men\xFA \u22EF para leerlo por comp\xE1s.",
    "ex.term.rhythm": "Ritmo arm\xF3nico",
    "ex.rhythm": "Cada cu\xE1nto cambian los acordes, haga lo que haga la melod\xEDa: un acorde por comp\xE1s es un ritmo arm\xF3nico lento, dos o m\xE1s uno r\xE1pido. Se acelera hacia una cadencia y se detiene sobre un pedal.",
    "history.modulation": "Modulaci\xF3n a {key}: desde aqu\xED los grados se leen en ella",
    "song.untitled": "Sin t\xEDtulo",
    "song.list": "Tus canciones",
    "chord.add.title": "A\xF1adir un acorde a este comp\xE1s",
    "song.newSong": "Nueva canci\xF3n",
    "song.addSection": "+ Secci\xF3n",
    "song.more": "M\xE1s: nueva canci\xF3n, transportar, exportar, borrar",
    "song.play": "Reproducir la canci\xF3n",
    "song.play.title": "Reproduce la canci\xF3n desde el acorde seleccionado, o desde el principio: cada acorde lo que le toca del comp\xE1s, las secciones tantas veces como su \xD7N (Esc la para)",
    "song.stop": "Parar la canci\xF3n",
    "song.stop.title": "Parar (Esc)",
    "song.tempo": "Tempo",
    "song.beats": "Pulsos por comp\xE1s",
    "song.tempo.title": "El tempo y el comp\xE1s a los que suena la canci\xF3n",
    "song.transposeBy": "Transportar hacia arriba",
    "song.bars": "{n} compases",
    "song.auto": "auto",
    "song.strip": "La forma de la canci\xF3n: un clic va a la secci\xF3n, arrastra un bloque para cambiar el orden",
    "song.strip.add": "A\xF1adir una secci\xF3n",
    "song.empty": "Una canci\xF3n vac\xEDa: a\xF1ade una secci\xF3n, pega acordes, o toca y pulsa S para mandarlos aqu\xED.",
    "section.write": "C\xF3mo se escribe la secci\xF3n",
    "section.chips": "Fichas",
    "section.text": "Texto",
    "section.text.hint": "| separa compases \xB7 en letras o en Do Re Mi \xB7 Intro guarda, Esc deja como estaba",
    "section.text.ok": "\u2713 {bars} compases, {chords} acordes",
    "section.text.bad": "No se entiende: {names}",
    "section.collapse.title": "Plegar o desplegar la secci\xF3n",
    "song.saved.title": "Canciones guardadas",
    "song.new": "Nueva",
    "song.new.title": "Empezar una canci\xF3n nueva; la actual sigue en la lista",
    "song.delete": "Borrar la canci\xF3n",
    "song.delete.title": "Borrar esta canci\xF3n; se puede deshacer",
    "song.deleted": "Borrada \xAB{title}\xBB",
    "song.paste": "Pegar acordes",
    "song.paste.title": "Pegar una progresi\xF3n de acordes como texto",
    "song.paste.placeholder": "Am G | C F  (| separa compases; sin barras, un acorde por comp\xE1s)",
    "song.paste.add": "A\xF1adir acordes",
    "song.addSection.title": "A\xF1adir secci\xF3n {name}",
    "song.transpose": "\u21C4 Transportar",
    "song.transpose.title": "Transportar todos los acordes hacia arriba, en semitonos",
    "song.transpose.step": "+{n}",
    "song.export": "Exportar o imprimir",
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
    "help.heading": "Ayuda",
    "help.mouse": "Rat\xF3n",
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
    "kbd.space": "Espacio",
    "kbd.del": "Supr",
    "kbd.esc": "Esc",
    "shortcut.escape": "Soltar un acorde mantenido, quitar el cursor, parar el relleno MIDI",
    "shortcut.candidate": "Elegir otra lectura del acorde",
    "gesture.click": "Clic en un acorde del historial, de la canci\xF3n o del c\xEDrculo para tocarlo y verlo en el detector.",
    "gesture.doubleClick": "Doble clic en un sector mayor o menor del c\xEDrculo para usarlo como tonalidad.",
    "gesture.logged": "Un acorde pasa al historial cuando se mantiene 0,8 s, y nunca dos veces seguidas.",
    "gesture.drag": "Arrastra un acorde del historial a un comp\xE1s de la canci\xF3n para insertarlo; arrastra acordes y cabeceras de secci\xF3n para reordenarlos.",
    "gesture.fill": "\u2299 en un acorde de la canci\xF3n activa el relleno MIDI: cada acorde que tocas ocupa un hueco y pasa al siguiente, hasta el final o Esc.",
    "gesture.remove": "Clic derecho en un acorde del historial para quitarlo. Lo quitado y el borrado se deshacen desde el aviso.",
    "gesture.piano": "Clic en el piano de la pantalla para tocar: en Mantener cada clic a\xF1ade o quita una nota del acorde.",
    "gesture.layout": "Arrastra un panel por su t\xEDtulo para moverlo y por la esquina para cambiar su tama\xF1o; \xD7 lo oculta y el men\xFA \u25A6 lo vuelve a mostrar.",
    "help.touch": "Gestos",
    "a11y.tabbar": "Entrada, sonido, paneles",
    "tab.input": "Entrada",
    "tab.sound": "Sonido",
    "tab.mic": "Micr\xF3fono",
    "tab.panels": "Paneles",
    "tab.more": "M\xE1s",
    "tab.present": "Presentaci\xF3n",
    "gesture.touch.tap": "Toca un acorde del historial, de la canci\xF3n o del c\xEDrculo para o\xEDrlo y verlo en el detector.",
    "gesture.touch.doubleTap": "Toca dos veces un sector mayor o menor del c\xEDrculo para usarlo como tonalidad.",
    "gesture.touch.song": "Toca un acorde de la canci\xF3n para ver sus botones: editar, duplicar, relleno MIDI, quitar.",
    "gesture.touch.remove": "Mant\xE9n pulsado un acorde del historial para quitarlo. Lo quitado y el borrado se deshacen desde el aviso.",
    "gesture.touch.piano": "Toca el piano de la pantalla con varios dedos a la vez para formar un acorde; en Mantener cada toque a\xF1ade o quita una nota.",
    "gesture.touch.layout": "\xD7 oculta un panel; Paneles, en la barra de abajo, lo vuelve a mostrar."
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
    const style = getPref("chord-style");
    if (naming === "letters" && style === "standard" || !/^[A-G]/.test(symbol)) return symbol;
    return tryUMT("chord names", () => UMT.formatChordSymbol(symbol, { style, roots: naming }), symbol);
  }
  function localizeDrawnNoteNames(container2) {
    if (naming === "letters") return;
    container2.querySelectorAll("text").forEach((el2) => {
      const s = el2.textContent?.trim() ?? "";
      if (NOTE_RE.test(s)) el2.textContent = noteLabel(s);
    });
  }
  function keyLabel(key) {
    const [root2, mode4] = key.split(" ");
    if (!mode4) return noteLabel(key);
    const m = mode4.toLowerCase();
    if (m === "major") return `${noteLabel(root2)} ${t("key.major")}`;
    if (m === "minor") return `${noteLabel(root2)} ${t("key.minor")}`;
    return scaleLabel(`${root2} ${m}`);
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

  // src/detector/voice-leading.ts
  var voices = (names) => names.flatMap((name) => {
    const midi = noteNameToMidi(name);
    return midi === null ? [] : [{ name, midi }];
  }).sort((a, b) => a.midi - b.midi);
  function matchInner(short, long) {
    const n = short.length, m = long.length;
    const cost = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
    for (let j = 0; j <= m; j++) cost[0][j] = 0;
    for (let i = 1; i <= n; i++) for (let j = i; j <= m; j++)
      cost[i][j] = Math.min(cost[i][j - 1], cost[i - 1][j - 1] + Math.abs(short[i - 1].midi - long[j - 1].midi));
    const pick2 = [];
    for (let i = n, j = m; i > 0; j--) {
      if (cost[i][j] === cost[i][j - 1] && j > i) continue;
      pick2.unshift(j - 1);
      i--;
    }
    return pick2;
  }
  function pairVoices(fromNames, toNames) {
    const a = voices(fromNames), b = voices(toNames);
    const move = (x, y) => ({ from: x?.name ?? null, to: y?.name ?? null, semitones: x && y ? y.midi - x.midi : null });
    if (!a.length || !b.length) return [];
    if (a.length === b.length) return a.map((x, i) => move(x, b[i]));
    if (a.length === 1 || b.length === 1) return [move(a[0], b[0])];
    const shortIsFrom = a.length < b.length;
    const [short, long] = shortIsFrom ? [a, b] : [b, a];
    const pick2 = matchInner(short.slice(1, -1), long.slice(1, -1)).map((j) => j + 1);
    const paired = /* @__PURE__ */ new Map([[0, 0], [long.length - 1, short.length - 1]]);
    pick2.forEach((j, i) => paired.set(j, i + 1));
    return long.map((voice, j) => {
      const other = paired.has(j) ? short[paired.get(j)] : null;
      return shortIsFrom ? move(other, voice) : move(voice, other);
    });
  }
  function outerMotion(moves) {
    const ends = moves.filter((m) => m.semitones !== null);
    if (ends.length < 2) return null;
    const bass = ends[0].semitones, top = ends[ends.length - 1].semitones;
    if (!bass && !top) return "static";
    if (!bass || !top) return "oblique";
    if (Math.sign(bass) !== Math.sign(top)) return "contrary";
    return bass === top ? "parallel" : "similar";
  }
  var ISSUE_KEYS = {
    "Parallel 5th": "parallel5",
    "Parallel Octave": "parallel8",
    "Hidden Fifth": "hidden5",
    "Direct Fifth": "hidden5",
    "Hidden Octave": "hidden8",
    "Direct Octave": "hidden8",
    "Voice Crossing": "crossing",
    "Voice Overlap": "overlap",
    "Forbidden Leap": "leap",
    "Leading Tone Unresolved": "leadingTone",
    "Doubled Leading Tone": "doubledLeadingTone",
    "7th Unresolved": "seventh"
  };
  function voiceName(index2, count) {
    if (index2 === 0) return t("vl.bass");
    if (index2 === count - 1) return t("vl.top");
    return t("vl.voice", { n: index2 + 1 });
  }
  function ruleIssues(fromNames, toNames, key, fromSymbol, toSymbol) {
    const a = voices(fromNames), b = voices(toNames);
    if (a.length !== b.length || a.length < 2) return [];
    const parse = (v) => v.map((x) => UMT.parseNote(x.name));
    const context = { keySymbol: key ?? void 0, chordA: tryParseChord(fromSymbol) ?? void 0, chordB: tryParseChord(toSymbol) ?? void 0 };
    const found = tryUMT("voice leading", () => UMT.Harmony.checkVoiceLeading(parse(a), parse(b), getPref("voice-rules"), context) ?? [], []);
    const seen = /* @__PURE__ */ new Set();
    return found.flatMap((issue) => {
      const k = ISSUE_KEYS[issue.type];
      if (!k) return [];
      const text = t(`vl.issue.${k}`, { voices: issue.voices.map((v) => voiceName(v, a.length)).join(t("vl.and")) });
      if (seen.has(text)) return [];
      seen.add(text);
      return [{ text, key: k }];
    });
  }
  function analyzeVoiceLeading(fromNames, toNames, key, fromSymbol = null, toSymbol = null) {
    if (!fromNames?.length || toNames.length < 2) return null;
    const moves = pairVoices(fromNames, toNames);
    if (!moves.length) return null;
    const paired = moves.filter((m) => m.semitones !== null);
    const issues = ruleIssues(fromNames, toNames, key, fromSymbol, toSymbol);
    return {
      moves,
      total: paired.reduce((s, m) => s + Math.abs(m.semitones), 0),
      common: paired.filter((m) => m.semitones === 0).length,
      outer: outerMotion(moves),
      issues: issues.map((i) => i.text),
      issueKeys: [...new Set(issues.map((i) => i.key))]
    };
  }
  var pc = (name) => noteLabel(name.replace(/-?\d+$/, ""));
  function moveText(m) {
    if (!m.from) return `+ ${pc(m.to)}`;
    if (!m.to) return `\u2212 ${pc(m.from)}`;
    if (m.semitones === 0) return `${pc(m.to)} =`;
    return `${pc(m.from)}\u2192${pc(m.to)} ${m.semitones > 0 ? "\u2191" : "\u2193"}${Math.abs(m.semitones)}`;
  }
  function describeVoiceLeading(vl) {
    const summary = [
      vl.outer ? t(`vl.outer.${vl.outer}`) : null,
      t("vl.total", { n: vl.total }),
      vl.common ? t("vl.common", { n: vl.common }) : null
    ].filter(Boolean).join(" \xB7 ");
    return `${vl.moves.map(moveText).join("  ")} \u2014 ${summary}`;
  }

  // src/theory/solfege.ts
  var SYLLABLES = { syllables: "ti" };
  function movableSyllable(note, key) {
    const name = /\d$/.test(note) ? note : note + "4";
    const s = tryUMT("solfege", () => UMT.Solfege.movableDo(UMT.parseNote(name), key, SYLLABLES), "?");
    return s && s !== "?" ? s : null;
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
    const info2 = a ? toRomanInfo(a) : null;
    romanCache.set(cacheKey, info2);
    return info2;
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
      secondaryTarget: a.secondaryTarget,
      degreeNumber: a.degree,
      substitutionCandidate: a.substitutionCandidate
    };
  }
  function analyzeChordProgression(chords, key, style) {
    const none = (k) => chords.map(() => ({ key: k, info: null, cadence: null }));
    if (!key) return none(null);
    const parsed = chords.map(tryParseChord);
    const readable = parsed.flatMap((c, i) => c ? [i] : []);
    if (!readable.length) return none(key);
    const analysis = tryUMT(
      "progression",
      () => UMT.Harmony.analyzeProgression(readable.map((i) => parsed[i]), key, { ...WRITTEN, style }).analysis,
      []
    );
    const steps2 = none(key);
    let local = key;
    readable.forEach((orig, j) => {
      const a = analysis[j];
      if (!a) return;
      local = normalizeKey(a.key) ?? local;
      const nextIsNeighbour = readable[j + 1] === orig + 1;
      steps2[orig] = { key: local, info: toRomanInfo(a), cadence: nextIsNeighbour ? a.cadenceWithNext ?? null : null };
    });
    steps2.forEach((s, i) => {
      if (!s.info && i > 0) s.key = steps2[i - 1].key;
    });
    return steps2;
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
  function readSlash(noteNames, chord) {
    const s = tryUMT("slash chord", () => UMT.Harmony.analyzeSlash(noteNames.length >= 3 ? noteNames.map((n) => UMT.parseNote(n)) : chord), null);
    if (!s || s.type === "inversion" || !s.lowerRoot) return null;
    const tensions = s.resultingTensions ?? [];
    if (s.type === "hybrid" && !tensions.length) return null;
    return { type: s.type, upper: s.upperStructure?.name ?? null, bass: pcName(s.lowerRoot.name), tensions };
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
    const notes2 = names.map((n) => tryUMT("notes", () => UMT.parseNote(n + "4"), null)).filter(Boolean);
    const pcs = tryUMT("set theory", () => UMT.SetTheory.getPitchClasses(notes2), []);
    let forte = null;
    if (pcs.length >= 3) {
      const number = tryUMT("set theory", () => UMT.SetTheory.getForteNumber(pcs), "");
      const prime = tryUMT("set theory", () => UMT.SetTheory.primeForm(pcs), []);
      const vector = tryUMT("set theory", () => UMT.SetTheory.intervalVector(pcs), []);
      const digits = prime.map((p) => p === 10 ? "t" : p === 11 ? "e" : String(p)).join("");
      forte = [number, prime.length ? `[${digits}]` : "", vector.length ? `<${vector.join("")}>` : ""].filter(Boolean).join(" \xB7 ") || null;
    }
    const tonic = key?.split(" ")[0];
    const fits = tryUMT("scales", () => UMT.findScalesForNotes(notes2, { tonic, limit: 7 }).filter((s) => s.notes.length < 12).slice(0, 6).map((s) => scaleLabel(s.name)), []);
    const syllables = key ? names.map((n) => movableSyllable(n, key) ?? "?") : null;
    return { notes: names, fromMelody, forte, fits, syllables };
  }
  function buildHarmonicAnalysis(chordSymbol, activeKey, prevChordSymbol, noteNames = [], prevNotes = null) {
    const chord = tryParseChord(chordSymbol);
    if (!chord) return emptyAnalysis(chordSymbol);
    const result = emptyAnalysis(chordSymbol);
    const bassNote = tryUMT("notes", () => chord.getNotes()[0] ?? null, null);
    if (bassNote) result.figuredBass = tryUMT("figured bass", () => UMT.FiguredBass.fromChord(chord, bassNote), "");
    result.suggestedScales = tryUMT("scales", () => UMT.Harmony.getSuggestedScales(chord).map((s) => scaleLabel(s.scale)), []);
    result.voicing = describeVoicing(noteNames, chord);
    result.upperStructures = presentUpperStructures(noteNames, chord);
    result.slash = readSlash(noteNames, chord);
    const prevChord = tryParseChord(prevChordSymbol);
    if (prevChord) result.transformation = neoRiemannianPath(prevChord, chord);
    const vl = analyzeVoiceLeading(prevNotes, noteNames, activeKey, prevChordSymbol, chordSymbol);
    if (vl) {
      result.voiceLeading = describeVoiceLeading(vl);
      result.voiceRules = vl.issues;
      result.voiceRuleKeys = vl.issueKeys;
    }
    if (!activeKey) return result;
    const a = romanInKey(chordSymbol, activeKey);
    if (a) Object.assign(result, a);
    if (prevChord) {
      const cad = tryUMT("cadence", () => UMT.Harmony.analyzeCadence(prevChord, chord, activeKey), null);
      if (cad && cad !== "No standard cadence") result.cadence = cad;
    }
    const subs = tryUMT("substitutions", () => UMT.getSubstitutions(chord, activeKey), []);
    result.substitutions = subs.map((s) => {
      const name = chordLabel(s.chord?.name ?? s.name ?? String(s));
      return s.type ? `${name} (${substitutionTypeLabel(s.type)})` : name;
    });
    result.substitutionTypes = [...new Set(subs.flatMap((s) => s.type ? [s.type] : []))];
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
      slash: null,
      transformation: null,
      substitutionTypes: [],
      voiceLeading: null,
      voiceRules: null,
      voiceRuleKeys: []
    };
  }
  function getAutoKey(history) {
    const noteNames = history.flatMap((e) => e.notes);
    if (noteNames.length === 0) return null;
    return normalizeKey(tryUMT("key detection", () => UMT.KeyDetection.detect(noteNames.map((n) => UMT.parseNote(n)), void 0, { profile: getPref("key-profile"), modes: getPref("auto-modes") })[0]?.key ?? null, null));
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
  var BUNDLED_INSTRUMENTS = /* @__PURE__ */ new Set(["acoustic_grand_piano"]);
  var SAMPLE_HOST = "https://gleitz.github.io/midi-js-soundfonts";
  function instrumentUrl(name) {
    return BUNDLED_INSTRUMENTS.has(name) ? `vendor/soundfonts/FluidR3_GM/${name}-mp3.js` : `${SAMPLE_HOST}/FluidR3_GM/${name}-mp3.js`;
  }
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
    Soundfont.instrument(audioCtx, currentInstrumentName, { soundfont: "FluidR3_GM", destination: masterGain, nameToUrl: instrumentUrl }).then((inst) => {
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
  var GESTURE_EVENTS = ["pointerdown", "pointerup", "keydown", "touchend"];
  function unlockAudioOnAnyGesture() {
    const onGesture = () => {
      initAudioOnGesture();
      if (audioCtx.state === "running") stop();
      else audioCtx.resume().then(() => {
        if (audioCtx.state === "running") stop();
      });
    };
    const stop = () => {
      for (const e of GESTURE_EVENTS) document.removeEventListener(e, onGesture, true);
    };
    for (const e of GESTURE_EVENTS) document.addEventListener(e, onGesture, true);
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
  function audioOutput() {
    ensureContext();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {
    });
    return { ctx: audioCtx, out: masterGain };
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
      previewNodes = midis.map((midi) => inst.play(midi, audioCtx.currentTime, { duration, gain: velocityGain(getPref("piano-velocity")) }));
    });
  }
  function playNoteNames(noteNames, duration = getPref("preview-s")) {
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
  var status = (kind2) => kind2 | channel - 1;
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
  function outPreview(notes2, seconds, cut) {
    if (!notes2.length) return;
    if (cut) {
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
      for (const n of previewNotes) if (sounding2.has(n)) noteOff(n);
      previewNotes = [];
    }
    for (const n of notes2) {
      if (sounding2.has(n)) noteOff(n);
      noteOn(n, getPref("piano-velocity"));
    }
    const these = notes2;
    previewNotes = [.../* @__PURE__ */ new Set([...previewNotes, ...notes2])];
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
  var chordOf = (notes2) => `[${notes2.map((n) => n.mark + n.pitch).join("")}]1`;
  var MIDDLE_C = 4 * 7;
  function buildStaffAbc(noteNames, keyStr, clef = "treble", prevNotes = null) {
    const { abcKey, accidentals } = keySignature(keyStr);
    const notes2 = parseNotes(noteNames, accidentals);
    const prev = prevNotes?.length ? parseNotes(prevNotes, accidentals) : null;
    const bar = (before, now, empty2) => {
      const chord = (ns) => ns.length ? chordOf(ns) : empty2;
      return before ? `${chord(before)} | ${chord(now)}` : chord(now);
    };
    if (clef !== "grand") {
      const header = `X:1
M:none
L:1
K:${abcKey}${clef === "bass" ? " clef=bass" : ""}
`;
      return header + bar(prev, notes2, notes2.length || prev ? "x" : "z");
    }
    const upper = (ns) => ns.filter((n) => n.step >= MIDDLE_C);
    const lower = (ns) => ns.filter((n) => n.step < MIDDLE_C);
    const empty = notes2.length || prev ? "x" : "z";
    return `X:1
M:none
L:1
%%staves {RH LH}
K:${abcKey}
V:RH clef=treble
${bar(prev && upper(prev), upper(notes2), empty)}
V:LH clef=bass
${bar(prev && lower(prev), lower(notes2), empty)}`;
  }
  function renderStaff(container2, noteNames, width = 380, keyStr = null, scale = 2, clef = "treble", prevNotes = null) {
    ABCJS.renderAbc(container2, buildStaffAbc(noteNames, keyStr, clef, prevNotes), { staffwidth: width - 20, scale, add_classes: !!prevNotes?.length });
    if (prevNotes?.length) container2.querySelectorAll(".abcjs-note.abcjs-m0").forEach((el2) => el2.classList.add("staff-prev"));
  }

  // src/theory/instruments.ts
  var INSTRUMENT_IDS = ["guitar", "guitar7", "bass", "bass5", "ukulele", "baritone", "mandolin", "banjo"];
  var INSTRUMENT_TUNINGS = {
    guitar: {
      standard: [40, 45, 50, 55, 59, 64],
      // E2 A2 D3 G3 B3 E4
      dropD: [38, 45, 50, 55, 59, 64],
      openG: [38, 43, 50, 55, 59, 62],
      openD: [38, 45, 50, 54, 57, 62],
      dadgad: [38, 45, 50, 55, 57, 62]
    },
    guitar7: { standard: [35, 40, 45, 50, 55, 59, 64] },
    // B1 E2 A2 D3 G3 B3 E4
    bass: { standard: [28, 33, 38, 43], dropD: [26, 33, 38, 43] },
    // E1 A1 D2 G2
    bass5: { standard: [23, 28, 33, 38, 43] },
    // B0 E1 A1 D2 G2
    ukulele: { standard: [67, 60, 64, 69], lowG: [55, 60, 64, 69] },
    // G4 C4 E4 A4, reentrant
    baritone: { standard: [50, 55, 59, 64] },
    // D3 G3 B3 E4
    mandolin: { standard: [55, 62, 69, 76] },
    // G3 D4 A4 E5
    banjo: { openG: [67, 50, 55, 59, 62] }
    // g4 D3 G3 B3 D4, the short fifth string first
  };
  var defaultTuning = (id) => Object.keys(INSTRUMENT_TUNINGS[id])[0];
  var referenceStrings = (id) => INSTRUMENT_TUNINGS[id][defaultTuning(id)];
  var isReentrant = (open2) => open2.some((m, i) => i > 0 && m < open2[i - 1]);

  // src/theory/voicings.ts
  var STANDARD_OPEN_MIDI = [40, 45, 50, 55, 59, 64];
  var MAX_SPAN = 3;
  var MIN_STRINGS = 4;
  var MAX_FRET_WITH_OPEN = 4;
  function tuningToMidi(names, reference = STANDARD_OPEN_MIDI) {
    if (names.length !== reference.length) return null;
    const midi = [];
    for (let i = 0; i < names.length; i++) {
      const pc3 = pitchClassOf(normalizeNoteName(names[i]) ?? "");
      if (pc3 === -1) return null;
      const ref = reference[i];
      const below = ref - ((ref - pc3) % 12 + 12) % 12;
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
    if (sounding3.length < Math.min(MIN_STRINGS, openMidi.length - 1)) return false;
    if (sounding3[sounding3.length - 1] - sounding3[0] + 1 !== sounding3.length) return false;
    if (!isReentrant(openMidi)) {
      const lowest = Math.min(...sounding3.map((i) => openMidi[i] + v.frets[i]));
      if (lowest % 12 !== bassPc) return false;
    }
    const fretted = v.frets.filter((f) => f > 0);
    if (fretted.length === 0) return true;
    const lo = Math.min(...fretted), hi = Math.max(...fretted);
    if (hi - lo > MAX_SPAN) return false;
    if (v.frets.includes(0) && hi > MAX_FRET_WITH_OPEN) return false;
    if (fretted.length <= 4) return true;
    return fretted.filter((f) => f === lo).length >= 2 && fretted.filter((f) => f > lo).length <= 3;
  }
  function lowestFret(v) {
    const fretted = v.frets.filter((f) => f > 0);
    return fretted.length ? Math.min(...fretted) : 0;
  }
  var position = (v) => v.frets.includes(0) ? 0 : lowestFret(v);
  function playableVoicings(voicings, openMidi, bassPc) {
    const seen = /* @__PURE__ */ new Set();
    const unique = voicings.filter((v) => {
      const k = v.frets.join(",");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const strings = (v) => v.frets.filter((f) => f >= 0).length;
    const byNeck = (a, b) => position(a) - position(b) || strings(b) - strings(a) || lowestFret(a) - lowestFret(b);
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

  // src/ui/html.ts
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // src/diagrams/guitar.ts
  var guitarControlsVisible = loadBool("panel-guitarControls", true);
  function setGuitarControlsVisible(v) {
    guitarControlsVisible = v;
  }
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
  var lastPreferFlats = true;
  var guitarLabelMode = loadChoice("guitar-label-mode", ["none", "tuning", "notes"], "none");
  var instrument2 = loadChoice("guitar-instrument", INSTRUMENT_IDS, "guitar");
  var tuningKeys = () => [...Object.keys(INSTRUMENT_TUNINGS[instrument2]), "custom"];
  var guitarTuningKey = loadChoice("guitar-tuning", tuningKeys(), defaultTuning(instrument2));
  var stringsView = loadChoice("guitar-view", ["shapes", "neck"], "shapes");
  function getStringsView() {
    return stringsView;
  }
  var NECK_FRETS = 12;
  var SHAPE_SPACING = 19;
  var NECK_SPACING = 16;
  var NECK_SPACING_VERTICAL = 28;
  var nameOf = (midi) => PITCH_NAMES_FLAT[(midi % 12 + 12) % 12];
  function namesOf(open2) {
    return open2.map(nameOf);
  }
  function loadStringTuning() {
    const saved = loadJSON("guitar-string-tuning", null);
    const count = referenceStrings(instrument2).length;
    if (guitarTuningKey === "custom" && Array.isArray(saved) && saved.length === count && saved.every((n) => typeof n === "string" && normalizeNoteName(n))) {
      return saved.map((n) => normalizeNoteName(n));
    }
    return namesOf(INSTRUMENT_TUNINGS[instrument2][guitarTuningKey] ?? referenceStrings(instrument2));
  }
  var guitarStringTuning = loadStringTuning();
  function openStrings() {
    const preset = INSTRUMENT_TUNINGS[instrument2][guitarTuningKey];
    return preset ?? tuningToMidi(guitarStringTuning, referenceStrings(instrument2)) ?? referenceStrings(instrument2);
  }
  function detectPreset(names) {
    const match = Object.entries(INSTRUMENT_TUNINGS[instrument2]).find(([, open2]) => namesOf(open2).every((n, i) => n === names[i]));
    return match ? match[0] : "custom";
  }
  function shapeStyle() {
    const sp = SHAPE_SPACING;
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
  function neckStyle(preferFlats, vertical) {
    const sp = vertical ? NECK_SPACING_VERTICAL : NECK_SPACING;
    return {
      ...fretboardColors(),
      numFrets: NECK_FRETS,
      dotColor: color("neck-dot"),
      chordNameSize: 0,
      chordNameY: 4,
      chordNameGapH: 4,
      stringSpacing: sp,
      fretSpacing: vertical ? Math.round(sp * 0.85) : Math.round(sp * 28 / 16),
      dotRadius: vertical ? Math.round(sp * 0.36) : Math.max(4, Math.round(sp * 7 / 16)),
      fingerNumberSize: Math.max(5, Math.round(sp * 7 / 16)),
      showNoteNames: true,
      preferFlats,
      orientation: vertical ? "vertical" : "horizontal"
    };
  }
  var showChordName = true;
  function setGuitarShowsName(v) {
    showChordName = v;
  }
  var SOLFEGE = { do: "C", re: "D", mi: "E", fa: "F", sol: "G", la: "A", si: "B" };
  function readStringNote(text) {
    const m = text.trim().toLowerCase().match(/^(do|re|mi|fa|sol|la|si)([#b]?)$/);
    return m ? SOLFEGE[m[1]] + m[2] : normalizeNoteName(text);
  }
  function whereLabel(frets) {
    const fretted = frets.filter((f) => f > 0);
    if (!fretted.length) return t("strings.open");
    const low = Math.min(...fretted);
    if (frets.includes(0)) return low <= 1 ? t("strings.open") : t("strings.openFrom", { n: low });
    return fretted.filter((f) => f === low).length >= 3 ? t("strings.barre", { n: low }) : t("strings.fromFret", { n: low });
  }
  function setupLabel() {
    const tuning = guitarTuningKey === "custom" ? guitarStringTuning.map(noteLabel).join(" ") : t(`tuning.${guitarTuningKey}`);
    return `${t(`instrument.${instrument2}`)}, ${tuning.toLowerCase()}`;
  }
  function tabs() {
    const tab = (v, label, tip) => `<button type="button" class="strings-tab" data-view="${v}" aria-pressed="${stringsView === v}" title="${escapeHtml(tip)}">${escapeHtml(label)}</button>`;
    return `<div class="strings-tabs guitar-chrome" role="group" aria-label="${escapeHtml(t("strings.view"))}">
    ${tab("shapes", t("strings.view.shapes"), t("strings.view.shapes.title"))}${tab("neck", t("strings.view.neck"), t("strings.view.neck.title"))}</div>`;
  }
  function stage(drawing, label, total) {
    const nav = (dir, tip) => total > 1 ? `<button type="button" class="guitar-nav guitar-chrome" data-dir="${dir}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${dir < 0 ? "\u2039" : "\u203A"}</button>` : "";
    return `<div class="strings-stage">${nav(-1, t("guitar.prev"))}<div class="strings-drawing" role="img" aria-label="${escapeHtml(label)}">${drawing}</div>${nav(1, t("guitar.next"))}</div>`;
  }
  var MAX_DOTS = 16;
  function foot(where, total, idx) {
    const count = `${idx + 1}/${total}`;
    const shapes = total > 1 ? `<div class="strings-dots" data-count="${count}" role="img" aria-label="${escapeHtml(t("strings.position", { i: idx + 1, n: total }))}">${total <= MAX_DOTS ? Array.from({ length: total }, (_, i) => `<span class="strings-dot${i === idx ? " on" : ""}"></span>`).join("") : `<span class="strings-count">${idx + 1} / ${total}</span>`}</div>` : "";
    return `<div class="strings-foot guitar-chrome">${shapes}
    <button type="button" class="strings-caption" title="${escapeHtml(t("strings.setup.title"))}">${escapeHtml([where, setupLabel()].filter(Boolean).join(" \xB7 "))}</button></div>`;
  }
  function renderMenu() {
    const menu = document.getElementById("strings-menu");
    if (!menu) return;
    const chip2 = (attr, value, label, on) => `<button type="button" class="menu-chip" ${attr}="${value}" data-label="${escapeHtml(label)}" aria-pressed="${on}">${escapeHtml(label)}</button>`;
    const tunings = Object.keys(INSTRUMENT_TUNINGS[instrument2]);
    const count = guitarStringTuning.length;
    menu.innerHTML = `
    <div class="menu-heading">${t("strings.instrument")}</div>
    <div class="menu-chips">${INSTRUMENT_IDS.map((id) => chip2("data-instrument", id, t(`instrument.${id}`), id === instrument2)).join("")}</div>
    <div class="menu-heading">${t("strings.tuning")}</div>
    <div class="menu-chips">${tunings.map((k) => chip2("data-tuning", k, t(`tuning.${k}`), k === guitarTuningKey)).join("")}${guitarTuningKey === "custom" ? chip2("data-tuning", "custom", t("guitar.tuning.custom"), true) : ""}</div>
    <div class="menu-heading">${t("strings.strings")}</div>
    <div class="strings-inputs" style="grid-template-columns: repeat(${count}, minmax(0, 1fr))">${guitarStringTuning.map((note, i) => `<input class="guitar-string-input" data-string="${i}" value="${escapeHtml(noteLabel(note))}" aria-label="${escapeHtml(t("guitar.string", { n: count - i }))}" maxlength="4" autocomplete="off" spellcheck="false">`).join("")}</div>
    <div class="menu-heading">${t("strings.labels")}</div>
    <div class="menu-chips">${["none", "tuning", "notes"].map((m) => chip2("data-labels", m, t(`strings.labels.${m}`), guitarLabelMode === m)).join("")}</div>`;
    if (menu.dataset.wired) return;
    menu.dataset.wired = "1";
    const redraw = () => {
      const c = document.getElementById("guitar-container");
      if (c) redrawFresh(c);
    };
    menu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-instrument], [data-tuning], [data-labels]");
      if (!b) return;
      if (b.dataset.instrument) {
        instrument2 = b.dataset.instrument;
        save("guitar-instrument", instrument2);
        guitarTuningKey = defaultTuning(instrument2);
        save("guitar-tuning", guitarTuningKey);
        guitarStringTuning = namesOf(referenceStrings(instrument2));
      } else if (b.dataset.tuning) {
        const preset = INSTRUMENT_TUNINGS[instrument2][b.dataset.tuning];
        if (!preset) return;
        guitarTuningKey = b.dataset.tuning;
        save("guitar-tuning", guitarTuningKey);
        guitarStringTuning = namesOf(preset);
        save("guitar-string-tuning", guitarStringTuning);
      } else if (b.dataset.labels) {
        guitarLabelMode = b.dataset.labels;
        save("guitar-label-mode", guitarLabelMode);
      }
      redraw();
    });
    menu.addEventListener("change", (e) => {
      const input = e.target.closest(".guitar-string-input");
      if (!input) return;
      const i = parseInt(input.dataset.string);
      const val = readStringNote(input.value);
      if (!val) {
        input.value = noteLabel(guitarStringTuning[i]);
        input.classList.add("invalid");
        setTimeout(() => input.classList.remove("invalid"), 1200);
        return;
      }
      guitarStringTuning[i] = val;
      save("guitar-string-tuning", guitarStringTuning);
      guitarTuningKey = detectPreset(guitarStringTuning);
      save("guitar-tuning", guitarTuningKey);
      redraw();
    });
  }
  function redrawFresh(container2) {
    const sym = lastGuitarSymbol;
    guitarVoicingIdx = 0;
    lastGuitarSymbol = null;
    renderGuitar(container2, sym, [...lastNoteNames], void 0, lastPreferFlats);
  }
  function wireChrome(container2) {
    container2.querySelectorAll(".strings-tab").forEach((b) => b.addEventListener("click", () => {
      stringsView = b.dataset.view;
      save("guitar-view", stringsView);
      renderGuitar(container2, lastGuitarSymbol, lastNoteNames, void 0, lastPreferFlats);
    }));
    container2.querySelector(".strings-caption")?.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelector("#mod-guitar .module-more")?.click();
    });
  }
  var neckVertical = (container2) => container2.clientHeight > container2.clientWidth * 1.15;
  var neckDrawnVertical = null;
  var watched = /* @__PURE__ */ new WeakSet();
  function watchShape(container2) {
    if (watched.has(container2) || typeof ResizeObserver === "undefined") return;
    watched.add(container2);
    new ResizeObserver(() => {
      if (stringsView === "neck" && neckDrawnVertical !== null && neckVertical(container2) !== neckDrawnVertical) {
        renderGuitar(container2, lastGuitarSymbol, lastNoteNames, void 0, lastPreferFlats);
      }
    }).observe(container2);
  }
  function neckSvg(noteNames, open2, preferFlats, vertical) {
    const midi = noteNames.map(noteNameToMidi).filter((n) => n !== null);
    const frets = open2.map((o) => {
      const pos = midi.map((n) => n - o).filter((f) => f >= 0 && f <= NECK_FRETS);
      return pos.length ? pos : [null];
    });
    return tryUMT("neck", () => Notae.renderFretboard({ name: "", frets, tuning: guitarStringTuning }, neckStyle(preferFlats, vertical)), "");
  }
  function renderGuitar(container2, chordSymbol, noteNames = [], voicingIndex, preferFlats = true) {
    lastNoteNames = noteNames;
    lastPreferFlats = preferFlats;
    const open2 = openStrings();
    container2.classList.toggle("strings-bare", !guitarControlsVisible);
    watchShape(container2);
    renderMenu();
    if (chordSymbol !== lastGuitarSymbol) {
      guitarVoicingIdx = 0;
      lastGuitarSymbol = chordSymbol;
    }
    if (voicingIndex !== void 0) guitarVoicingIdx = voicingIndex;
    const named = chordSymbol ? chordLabel(chordSymbol) : t("a11y.nothing");
    if (stringsView === "neck") {
      neckDrawnVertical = neckVertical(container2);
      container2.innerHTML = tabs() + stage(neckSvg(noteNames, open2, preferFlats, neckDrawnVertical), t("a11y.strings", { chord: named }), 0) + foot("", 0, 0);
      localizeDrawnNoteNames(container2.querySelector(".strings-drawing"));
      wireChrome(container2);
      return;
    }
    neckDrawnVertical = null;
    if (!chordSymbol) {
      const empty = { name: "", frets: open2.map(() => null), tuning: guitarStringTuning };
      const svg2 = tryUMT("fretboard", () => Notae.renderFretboard(empty, shapeStyle()), "");
      container2.innerHTML = tabs() + stage(`<div class="guitar-placeholder">${svg2}</div>`, t("a11y.strings", { chord: named }), 0) + foot("", 0, 0);
      wireChrome(container2);
      return;
    }
    const chord = tryParseChord(chordSymbol);
    const bassPc = chord ? (((chord.bassStep ?? chord.rootStep) + 9) % 12 + 12) % 12 : 0;
    const voicings = chord ? playableVoicings(tryUMT("fretboard voicings", () => UMT.getFretboardVoicings(chord, open2.map((m) => m - 69)) ?? [], []), open2, bassPc) : [];
    if (!voicings.length) {
      container2.innerHTML = tabs() + `<div class="no-voicing">${t("guitar.none")}</div>` + foot("", 0, 0);
      wireChrome(container2);
      return;
    }
    const total = voicings.length;
    const idx = Math.min(guitarVoicingIdx, total - 1);
    const voicing = voicings[idx];
    const svg = tryUMT("fretboard", () => Notae.renderFretboard(
      { name: showChordName ? chordLabel(chordSymbol) : "", ...voicing, tuning: guitarStringTuning },
      showChordName ? shapeStyle() : { ...shapeStyle(), chordNameSize: 0, chordNameY: 4, chordNameGapH: 4 }
    ), "");
    const label = t("a11y.strings", { chord: `${chordLabel(chordSymbol)} ${voicing.frets.map((f) => f < 0 ? "x" : f).join(" ")}` });
    container2.innerHTML = tabs() + stage(svg, label, total) + foot(whereLabel(voicing.frets), total, idx);
    localizeDrawnNoteNames(container2.querySelector(".strings-drawing"));
    container2.querySelectorAll(".guitar-nav").forEach((btn) => {
      btn.addEventListener("click", () => {
        guitarVoicingIdx = (idx + parseInt(btn.dataset.dir) + total) % total;
        renderGuitar(container2, lastGuitarSymbol, lastNoteNames, void 0, lastPreferFlats);
        onVoicingChange(guitarVoicingIdx);
      });
    });
    wireChrome(container2);
  }

  // src/detector/analysis-panel.ts
  var ANALYSIS_FIELD_KEYS = ["roman", "function", "figbass", "voicing", "diatonic", "scales", "fits", "cadence", "plr", "voices", "rules", "secondary", "subs", "upper", "slash", "movable", "forte"];
  var fieldLabel = (f) => t(`field.${f}`);
  var fieldTooltip = (f) => t(`field.${f}.title`);
  var rowLabel = (f) => t(`field.${f}.row`);
  function slashText(s) {
    const over = s.upper ? t("slash.over", { upper: chordLabel(s.upper), bass: noteLabel(s.bass) }) : t("slash.overBass", { bass: noteLabel(s.bass) });
    return [over, t(`slash.type.${s.type}`), s.tensions.join(" ")].filter(Boolean).join(" \xB7 ");
  }
  function cadenceWithDegrees(cadence) {
    const degrees = cadence.match(/\(([^)]*)\)/)?.[1];
    return degrees ? `${cadenceLabel(cadence, true)} (${degrees.replace(/->/g, "\u2192")})` : cadenceLabel(cadence, true);
  }
  var fnClass = (fn) => fn === "T" || fn === "S" || fn === "D" ? ` fn-${fn}` : "";
  function renderChordSummary(detection, analysis, head, onAltSelect2) {
    const el2 = document.getElementById("chord-summary");
    if (!el2) return;
    const notesOf = (names) => escapeHtml(names.map((n) => noteLabel(n.replace(/(-?\d+)$/, ""))).join(" \xB7 "));
    if (!detection) {
      el2.innerHTML = `<div class="chord-head chord-head-empty">${escapeHtml(t("head.empty"))}</div>`;
      return;
    }
    if (detection.kind === "note") {
      el2.innerHTML = `<div class="chord-head"><span class="chord-head-name">${escapeHtml(noteLabel(detection.pitchClass))}</span><span class="chord-notes">${escapeHtml(noteLabel(detection.noteName))} \xB7 MIDI ${detection.midiNumber}</span></div>`;
      return;
    }
    if (detection.kind === "interval") {
      el2.innerHTML = `<div class="chord-head"><span class="chord-head-name">${escapeHtml(detection.intervalName)}</span><span class="chord-notes">${notesOf(detection.notes)}</span></div>`;
      return;
    }
    const symbol = detection.candidates[detection.selectedIndex];
    const alts = detection.candidates.slice(1, 7);
    const a = analysis && analysis.roman !== "?" ? analysis : null;
    const degree = a ? `
    <span class="chord-head-group">
      <span class="chord-roman${fnClass(a.function)}">${escapeHtml(a.roman)}</span>
      ${a.function !== "unknown" ? `<span class="fn-pill${fnClass(a.function)}">${escapeHtml(t(`fn.${a.function}`))}</span>` : ""}
    </span>` : "";
    const from = head.from && analysis ? `
    <span class="chord-head-group chord-head-from">
      <span class="chord-head-label">${escapeHtml(t("head.from"))}</span>
      <span class="chord-head-prev">${escapeHtml(chordLabel(head.from))}</span>
      ${head.fromRoman && head.fromRoman !== "?" ? `<span class="chord-head-prev-roman${fnClass(head.fromFunction)}">${escapeHtml(head.fromRoman)}</span>` : ""}
      ${analysis.cadence ? `<span class="cadence-pill">${escapeHtml(cadenceLabel(analysis.cadence, true))}</span>` : ""}
    </span>` : "";
    el2.innerHTML = `
    <div class="chord-head chord-summary-row">
      <span class="chord-head-group chord-head-main">
        <span class="chord-name-badge">${escapeHtml(chordLabel(symbol))}</span>
        <span class="chord-notes">${notesOf(detection.notes)}</span>
      </span>
      ${degree}
      ${from}
      ${alts.length ? `<span class="chord-head-group chord-head-alts">
        <span class="chord-head-label">${escapeHtml(t("head.also"))}</span>
        ${alts.map((c, i) => `<button class="alt-chord-btn alt-chord-sum" data-idx="${i + 1}">${escapeHtml(chordLabel(c))}</button>`).join("")}
      </span>` : ""}
    </div>`;
    el2.querySelectorAll(".alt-chord-sum").forEach((btn) => {
      btn.addEventListener("click", () => onAltSelect2(parseInt(btn.dataset.idx)));
    });
  }
  function renderZone1Analysis(detection, analysis, noteSet2, fieldsVisible, scale, onAltSelect2, head = { from: null, fromRoman: null, fromFunction: null }) {
    renderChordSummary(detection, analysis, head, onAltSelect2);
    const el2 = document.getElementById("analysis-content");
    if (!el2) return;
    el2.style.fontSize = scale + "px";
    const visibleCount = ANALYSIS_FIELD_KEYS.filter((f) => fieldsVisible[f]).length;
    el2.style.minHeight = Math.ceil((visibleCount * 1.6 - 0.4) * scale) + "px";
    const colEl = document.getElementById("col-analysis");
    if (colEl) {
      const w = Math.round(scale * 19) + "px";
      colEl.style.width = w;
      colEl.style.flex = `0 0 ${w}`;
    }
    const row3 = (label, val) => `<div class="analysis-row">
      <span class="analysis-label">${label}</span>
      <span class="analysis-value">${escapeHtml(val)}</span>
    </div>`;
    const fieldRow = (f, val) => fieldsVisible[f] ? row3(rowLabel(f), val ?? "\u2014") : "";
    let roman = "\u2014", func_ = "\u2014", figuredBass = "\u2014", diatonic = "\u2014", scales = "\u2014", cadence = "\u2014";
    let secondary = null, subs = null;
    let voicing = null, plr = null, upper = null, slash = null;
    let voices2 = null, rules = null;
    let extra = "";
    if (detection?.kind === "note") {
      extra = row3(t("analysis.note"), `${noteLabel(detection.noteName)} \xB7 MIDI ${detection.midiNumber}`);
    } else if (detection?.kind === "interval") {
      extra = row3(t("analysis.interval"), `${detection.intervalName} \xB7 ${t("analysis.semitones", { n: detection.semitones })}`) + row3(t("analysis.inversion"), detection.inversionName);
    } else if (detection?.kind === "chord" && analysis) {
      roman = analysis.roman;
      func_ = t(`fn.${analysis.function}`);
      figuredBass = analysis.figuredBass || "\u2014";
      diatonic = analysis.isDiatonic ? t("analysis.yes") : analysis.isBorrowed ? t("analysis.borrowed", { mode: analysis.borrowedFrom ?? "?" }) : t("analysis.chromatic");
      scales = analysis.suggestedScales.slice(0, 4).join(", ") || "\u2014";
      cadence = analysis.cadence ? cadenceWithDegrees(analysis.cadence) : "\u2014";
      if (analysis.isSecondary) secondary = `\u2192 ${analysis.secondaryTarget?.split("/")[1] ?? "?"}`;
      if (analysis.substitutions?.length) subs = analysis.substitutions.join(", ");
      voicing = analysis.voicing;
      plr = analysis.transformation;
      voices2 = analysis.voiceLeading;
      if (analysis.voiceRules) rules = analysis.voiceRules.length ? analysis.voiceRules.join("\n") : t("vl.none");
      if (analysis.upperStructures.length) upper = analysis.upperStructures.join(", ");
      if (analysis.slash) slash = slashText(analysis.slash);
    }
    const fits = noteSet2?.fits.length ? (noteSet2.fromMelody ? `(${noteSet2.notes.map(noteLabel).join(" ")}) ` : "") + noteSet2.fits.slice(0, 4).join(", ") : null;
    el2.innerHTML = fieldRow("roman", roman) + fieldRow("function", func_) + fieldRow("figbass", figuredBass) + fieldRow("voicing", voicing) + fieldRow("diatonic", diatonic) + fieldRow("scales", scales) + fieldRow("fits", fits) + fieldRow("cadence", cadence) + fieldRow("plr", plr) + fieldRow("voices", voices2) + fieldRow("rules", rules) + fieldRow("secondary", secondary) + fieldRow("subs", subs) + fieldRow("upper", upper) + fieldRow("slash", slash) + fieldRow("movable", noteSet2?.syllables?.length ? noteSet2.syllables.join(" ") : null) + fieldRow("forte", noteSet2?.forte ?? null) + extra;
  }

  // src/ui/fit.ts
  function fitSvg(svg, crop = false) {
    if (!svg) return;
    if (!svg.getAttribute("viewBox")) {
      const w = parseFloat(svg.getAttribute("width") ?? ""), h = parseFloat(svg.getAttribute("height") ?? "");
      if (w > 0 && h > 0) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    if (crop) {
      const bb = svg.getBBox?.();
      const pad = 4;
      if (bb && bb.width && bb.height) svg.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${bb.width + 2 * pad} ${bb.height + 2 * pad}`);
    }
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width = "100%";
    svg.style.height = "100%";
  }

  // src/ui/a11y.ts
  var live = null;
  var pending = null;
  var lastSaid = "";
  function announce(text, delay = 350) {
    if (typeof document === "undefined") return;
    if (!live) {
      live = document.createElement("div");
      live.id = "sr-live";
      live.className = "sr-only";
      live.setAttribute("aria-live", "polite");
      live.setAttribute("aria-atomic", "true");
      document.body.appendChild(live);
    }
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      if (text === lastSaid) return;
      lastSaid = text;
      live.textContent = text;
    }, delay);
  }
  var HAS_WORD = /\p{L}{2,}/u;
  function labelIconButtons(root2) {
    root2.querySelectorAll('button[title]:not([aria-label]), [role="button"][title]:not([aria-label])').forEach((b) => {
      if (!HAS_WORD.test(b.textContent ?? "")) b.setAttribute("aria-label", b.title);
    });
  }
  function watchIconButtons(root2) {
    labelIconButtons(root2);
    new MutationObserver(() => labelIconButtons(root2)).observe(root2, { childList: true, subtree: true });
  }
  function makeActivatable(el2, label) {
    el2.setAttribute("role", "button");
    el2.setAttribute("tabindex", "0");
    if (label) el2.setAttribute("aria-label", label);
    el2.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k !== "Enter" && k !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      el2.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }
  var LONG_PRESS_MS = 600;
  function onLongPress(el2, fn) {
    let timer5 = null;
    let fired = false;
    const cancel = () => {
      if (timer5) clearTimeout(timer5);
      timer5 = null;
    };
    el2.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      fired = false;
      cancel();
      timer5 = setTimeout(() => {
        timer5 = null;
        fired = true;
        fn();
      }, LONG_PRESS_MS);
    });
    el2.addEventListener("pointerup", cancel);
    el2.addEventListener("pointercancel", cancel);
    el2.addEventListener("pointermove", (e) => {
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancel();
    });
    el2.addEventListener("contextmenu", (e) => {
      if (fired) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
    el2.addEventListener("click", (e) => {
      if (fired) {
        e.preventDefault();
        e.stopImmediatePropagation();
        fired = false;
      }
    }, true);
  }
  function keyBelongsToControl(e) {
    const t2 = e.target;
    if (!(t2 instanceof Element)) return false;
    if ((e.key === " " || e.key === "Enter") && t2.closest('button, a[href], [role="button"], summary')) return true;
    if (e.key.startsWith("Arrow") && t2.classList.contains("module-header")) return true;
    return false;
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
    const el2 = document.createElement("div");
    el2.className = "undo-toast";
    el2.innerHTML = `<span>${escapeHtml(message)}</span><button class="undo-btn">${escapeHtml(t("undo"))}</button>`;
    el2.querySelector("button").addEventListener("click", () => {
      dismiss();
      undo();
    });
    document.body.appendChild(el2);
    current = { el: el2, timer: window.setTimeout(dismiss, UNDO_MS) };
  }

  // src/input/bindings.ts
  var ACTIONS = [
    "play",
    "stepPrev",
    "stepNext",
    "delete",
    "hold",
    "arpeggio",
    "send",
    "clear",
    "keyboard",
    "present",
    "type",
    "help",
    "settings"
  ];
  var DEFAULT_KEYS = {
    play: ["Space"],
    stepPrev: ["ArrowLeft"],
    stepNext: ["ArrowRight"],
    delete: ["Delete", "Backspace"],
    hold: ["H"],
    arpeggio: ["A"],
    send: ["S"],
    clear: ["C"],
    keyboard: ["M"],
    present: ["P"],
    type: ["/"],
    help: ["?"],
    settings: [","]
  };
  var RESERVED = /* @__PURE__ */ new Set(["Escape", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Tab", "Enter", "Shift", "Control", "Alt", "Meta", "CapsLock"]);
  var MAX_KEYS = 2;
  function keyName2(e) {
    if (e.key === " ") return "Space";
    return e.key.length === 1 ? e.key.toUpperCase() : e.key;
  }
  var custom = loadCustom();
  function loadCustom() {
    const raw = loadJSON("shortcuts", {});
    const out = {};
    for (const a of ACTIONS) {
      const v = raw?.[a];
      if (Array.isArray(v) && v.length <= MAX_KEYS && v.every((k) => typeof k === "string" && !RESERVED.has(k))) out[a] = v;
    }
    return out;
  }
  function keysOf(action) {
    return custom[action] ?? DEFAULT_KEYS[action];
  }
  function isDefaultBinding(action) {
    return !custom[action];
  }
  function actionFor(key) {
    return ACTIONS.find((a) => keysOf(a).includes(key)) ?? null;
  }
  function conflictFor(key, except) {
    return ACTIONS.find((a) => a !== except && keysOf(a).includes(key)) ?? null;
  }
  function store() {
    save("shortcuts", custom);
  }
  function setKeys(action, keys) {
    const clean = [...new Set(keys)].filter((k) => !RESERVED.has(k)).slice(0, MAX_KEYS);
    if (JSON.stringify(clean) === JSON.stringify(DEFAULT_KEYS[action])) delete custom[action];
    else custom[action] = clean;
    store();
  }
  function assignKey(action, key, slot) {
    const other = conflictFor(key, action);
    if (other) setKeys(other, keysOf(other).filter((k) => k !== key));
    const keys = [...keysOf(action)];
    if (slot < keys.length) keys[slot] = key;
    else keys.push(key);
    setKeys(action, keys);
  }
  function removeKey(action, key) {
    setKeys(action, keysOf(action).filter((k) => k !== key));
  }
  function resetKeys(action) {
    delete custom[action];
    store();
  }
  function resetAllKeys() {
    custom = {};
    store();
  }

  // src/input/pitch.ts
  function frequencyToNote(freq, a4 = 440) {
    const exact = 69 + 12 * Math.log2(freq / a4);
    const midi = Math.round(exact);
    return { midi, cents: Math.round((exact - midi) * 100) };
  }
  function rms(buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }
  function detectPitch(buf, sampleRate, threshold = 0.12) {
    const minTau = Math.floor(sampleRate / 1600);
    const maxTau = Math.min(Math.floor(sampleRate / 50), Math.floor(buf.length / 2));
    if (maxTau <= minTau + 2) return null;
    const n = buf.length - maxTau;
    const d = new Float32Array(maxTau + 1);
    for (let tau2 = 1; tau2 <= maxTau; tau2++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const x = buf[i] - buf[i + tau2];
        sum += x * x;
      }
      d[tau2] = sum;
    }
    const cmnd = new Float32Array(maxTau + 1);
    cmnd[0] = 1;
    let running2 = 0;
    for (let tau2 = 1; tau2 <= maxTau; tau2++) {
      running2 += d[tau2];
      cmnd[tau2] = running2 > 0 ? d[tau2] * tau2 / running2 : 1;
    }
    let tau = -1;
    for (let t2 = minTau; t2 <= maxTau; t2++) {
      if (cmnd[t2] < threshold) {
        while (t2 + 1 <= maxTau && cmnd[t2 + 1] < cmnd[t2]) t2++;
        tau = t2;
        break;
      }
    }
    if (tau < 0) return null;
    const a = cmnd[tau - 1] ?? cmnd[tau], b = cmnd[tau], c = cmnd[tau + 1] ?? cmnd[tau];
    const shift = a - 2 * b + c !== 0 ? (a - c) / (2 * (a - 2 * b + c)) : 0;
    return { freq: sampleRate / (tau + shift), clarity: 1 - b };
  }

  // src/audio-notes/notes.ts
  var MODEL_RATE = 22050;
  var worker = null;
  var nextId = 1;
  var waiting = /* @__PURE__ */ new Map();
  function getWorker() {
    if (worker) return worker;
    worker = new Worker("dist/notes-worker.js");
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      if (e.data.progress !== void 0) {
        w.progress?.(e.data.progress);
        return;
      }
      waiting.delete(e.data.id);
      if (e.data.notes) w.resolve(e.data.notes);
      else w.reject(new Error(e.data.error ?? "notes worker"));
    };
    worker.onerror = (e) => {
      for (const w of waiting.values()) w.reject(new Error(e.message || "notes worker failed"));
      waiting.clear();
      worker = null;
    };
    return worker;
  }
  function transcribe(audio2, progress) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject, progress });
      getWorker().postMessage({ id, audio: audio2 }, [audio2.buffer]);
    });
  }
  async function toModelRate(samples2, rate) {
    if (rate === MODEL_RATE) return samples2.slice();
    const ctx2 = new OfflineAudioContext(1, Math.max(1, Math.ceil(samples2.length * MODEL_RATE / rate)), MODEL_RATE);
    const buf = ctx2.createBuffer(1, samples2.length, rate);
    buf.copyToChannel(samples2, 0);
    const src = ctx2.createBufferSource();
    src.buffer = buf;
    src.connect(ctx2.destination);
    src.start();
    return (await ctx2.startRendering()).getChannelData(0).slice();
  }
  function soundingAt(notes2, time, slack = 0.05) {
    const on = notes2.filter((n) => n.start <= time && n.end >= time - slack).map((n) => n.midi);
    return [...new Set(on)].sort((a, b) => a - b);
  }

  // src/input/mic.ts
  var MIC_MODES = ["notes", "chords"];
  var FRAME_MS = 40;
  var RELEASE_FRAMES = 5;
  var GATES = { low: 0.02, normal: 0.01, high: 4e-3 };
  var HOLDS = { fast: 2, normal: 3, steady: 5 };
  var CHORD_EVERY_MS = 300;
  var CHORD_READ_BEFORE_END_S = 0.1;
  var mode2 = loadChoice("mic-mode", MIC_MODES, "notes");
  function getMicMode() {
    return mode2;
  }
  function setMicMode(m) {
    mode2 = m;
    save("mic-mode", m);
  }
  var ctx = null;
  var stream = null;
  var timer = null;
  var callbacks = null;
  function isMicOn() {
    return !!timer;
  }
  var held = [];
  var candidate = "";
  var candidateFrames = 0;
  var missFrames = 0;
  var reading = false;
  var lastReadAt = 0;
  var soundLevel = 0;
  function commit(notes2, level) {
    if (notes2.join() === held.join()) return;
    held = notes2;
    callbacks?.notes(notes2, Math.max(1, Math.min(127, Math.round(level * 600))));
  }
  async function readChord(time, rate) {
    reading = true;
    try {
      const audio2 = await toModelRate(time, rate);
      const notes2 = await transcribe(audio2);
      const at = time.length / rate - CHORD_READ_BEFORE_END_S;
      const midis = soundingAt(notes2, at);
      if (timer && missFrames < RELEASE_FRAMES && midis.length >= 2) commit(midis, soundLevel);
    } catch {
    }
    reading = false;
  }
  function hear(analyser, time, rate) {
    analyser.getFloatTimeDomainData(time);
    const recent2 = time.subarray(time.length - 2048);
    const level = rms(recent2);
    const sounding3 = level >= GATES[getPref("mic-sensitivity")];
    let heard = null;
    const p = sounding3 ? detectPitch(recent2, rate) : null;
    if (p) heard = { ...frequencyToNote(p.freq, getPref("a4-hz")), freq: p.freq, level };
    callbacks?.frame(heard);
    if (mode2 === "chords") {
      if (!sounding3) {
        if (++missFrames >= RELEASE_FRAMES) commit([], 0);
        return;
      }
      missFrames = 0;
      soundLevel = level;
      const now = performance.now();
      if (!reading && now - lastReadAt >= CHORD_EVERY_MS) {
        lastReadAt = now;
        readChord(time.slice(), rate);
      }
      return;
    }
    const notes2 = heard ? [heard.midi] : [];
    const key = notes2.join();
    if (notes2.length) {
      missFrames = 0;
      if (key === candidate) candidateFrames++;
      else {
        candidate = key;
        candidateFrames = 1;
      }
      if (candidateFrames >= HOLDS[getPref("mic-response")]) commit(notes2, level);
    } else if (++missFrames >= RELEASE_FRAMES) {
      candidate = "";
      commit([], 0);
    }
  }
  async function startMic(cb) {
    if (timer) return;
    callbacks = cb;
    if (!navigator.mediaDevices?.getUserMedia) {
      cb.state(false, window.isSecureContext ? "NotSupportedError" : "InsecureContext");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      cb.state(false, e.name);
      return;
    }
    ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 32768;
    source.connect(analyser);
    const time = new Float32Array(analyser.fftSize);
    const rate = ctx.sampleRate;
    timer = setInterval(() => hear(analyser, time, rate), FRAME_MS);
    cb.state(true);
  }
  function stopMic() {
    if (timer) clearInterval(timer);
    timer = null;
    stream?.getTracks().forEach((t2) => t2.stop());
    stream = null;
    ctx?.close().catch(() => {
    });
    ctx = null;
    commit([], 0);
    callbacks?.frame(null);
    callbacks?.state(false);
  }

  // src/ui/tour.ts
  var STEPS = [
    { id: "welcome", target: null },
    { id: "input", target: "#btn-input-status" },
    { id: "key", target: "#btn-key" },
    { id: "analysis", target: "#mod-analysis" },
    { id: "explain", target: "#mod-explain" },
    { id: "cof", target: "#mod-cof" },
    { id: "history", target: "#mod-history" },
    { id: "layout", target: "#btn-layout, #tab-layout" },
    // the rail's, or the bottom bar's on a phone
    { id: "practice", target: "#mod-progressions" },
    { id: "help", target: "#btn-help" }
  ];
  var step = -1;
  var returnFocus = null;
  function maybeStartTour() {
    if (loadBool("tour-done", false) || navigator.webdriver) return;
    startTour();
  }
  function startTour() {
    returnFocus = document.activeElement;
    step = 0;
    draw();
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", draw);
  }
  function endTour() {
    if (step < 0) return;
    step = -1;
    save("tour-done", true);
    document.getElementById("tour")?.remove();
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", draw);
    returnFocus?.focus();
  }
  function go(to) {
    if (to < 0) return;
    if (to >= STEPS.length) {
      endTour();
      return;
    }
    step = to;
    draw();
  }
  function onKey(e) {
    if (step < 0) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      endTour();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      go(step + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      go(step - 1);
    }
  }
  function visibleTarget(selector) {
    if (!selector) return null;
    return [...document.querySelectorAll(selector)].find((el2) => {
      if (el2.closest(".module-hidden")) return false;
      const r = el2.getBoundingClientRect();
      return r.width && r.height;
    }) ?? null;
  }
  function draw() {
    if (step < 0) return;
    const s = STEPS[step];
    let root2 = document.getElementById("tour");
    if (!root2) {
      root2 = document.createElement("div");
      root2.id = "tour";
      document.body.appendChild(root2);
    }
    const target = visibleTarget(s.target);
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = target?.getBoundingClientRect();
    const pad = 6;
    const spot = r ? `<div class="tour-spot" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>` : '<div class="tour-dim"></div>';
    const last = step === STEPS.length - 1;
    root2.innerHTML = `${spot}
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabindex="-1">
      <div class="tour-count">${step + 1} / ${STEPS.length}</div>
      <h2 id="tour-title" class="tour-title">${escapeHtml(t(`tour.${s.id}.title`))}</h2>
      <p class="tour-text">${escapeHtml(t(target?.closest("#tabbar") ? `tour.${s.id}.touch` : `tour.${s.id}`))}</p>
      <div class="tour-buttons">
        <button class="ctrl-btn" data-tour="skip">${escapeHtml(t(last ? "tour.close" : "tour.skip"))}</button>
        <span class="tour-gap"></span>
        <button class="ctrl-btn" data-tour="back"${step === 0 ? " disabled" : ""}>${escapeHtml(t("tour.back"))}</button>
        <button class="ctrl-btn tour-next" data-tour="next">${escapeHtml(t(last ? "tour.done" : "tour.next"))}</button>
      </div>
    </div>`;
    const card = root2.querySelector(".tour-card");
    const cw = Math.min(360, window.innerWidth - 24);
    card.style.width = `${cw}px`;
    if (r) {
      const below = r.bottom + 12, above = r.top - 12;
      const left = Math.max(12, Math.min(window.innerWidth - cw - 12, r.left));
      card.style.left = `${left}px`;
      const h = card.offsetHeight;
      card.style.top = below + h < window.innerHeight ? `${below}px` : above - h > 0 ? `${above - h}px` : `${Math.max(12, (window.innerHeight - h) / 2)}px`;
    } else {
      card.style.left = `${(window.innerWidth - cw) / 2}px`;
      card.style.top = `${Math.max(12, (window.innerHeight - card.offsetHeight) / 2)}px`;
    }
    root2.querySelector('[data-tour="next"]').addEventListener("click", () => go(step + 1));
    root2.querySelector('[data-tour="back"]').addEventListener("click", () => go(step - 1));
    root2.querySelector('[data-tour="skip"]').addEventListener("click", endTour);
    root2.querySelector(".tour-next").focus();
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
    const pc3 = pitchClassOf(name);
    return pc3 === -1 ? name : spellMidi(60 + pc3, key).replace(/-?\d+$/, "") || name;
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

  // src/history/rhythm.ts
  function entrySeconds(entries2, i) {
    const e = entries2[i];
    if (e?.at === void 0) return null;
    const next = i > 0 ? entries2[i - 1].at : void 0;
    const end = e.until !== void 0 && next !== void 0 ? Math.min(e.until, next) : e.until ?? next;
    return end !== void 0 && end > e.at ? (end - e.at) / 1e3 : null;
  }
  function timedRun(entries2) {
    const symbols = [], seconds = [];
    for (let i = 0; i < entries2.length && entries2[i].at !== void 0; i++) {
      const s = entrySeconds(entries2, i);
      if (s === null || !tryParseChord(entries2[i].symbol)) continue;
      symbols.unshift(entries2[i].symbol);
      seconds.unshift(s);
    }
    return { symbols, seconds };
  }
  function harmonicRhythm(entries2, bpm, beatsPerBar) {
    const { symbols, seconds } = timedRun(entries2);
    if (symbols.length < 2) return null;
    if (bpm <= 0) return { kind: "seconds", secondsPerChange: seconds.reduce((a, b) => a + b, 0) / seconds.length };
    const chords = symbols.map(tryParseChord);
    const durations = seconds.map((s) => s * bpm / 60);
    const r = tryUMT("harmonic rhythm", () => UMT.Harmony.analyzeProgression(chords, "C Major", { durations, beatsPerBar }), null);
    return r && r.harmonicRhythmUnit === "per-bar" ? { kind: "per-bar", changes: r.harmonicRhythm, bpm, beatsPerBar } : null;
  }

  // src/metronome/pattern.ts
  function parseMeter(text) {
    const m = text.replace(/\s/g, "").match(/^(\d+(?:\+\d+)*)\/(\d+)$/);
    if (!m) return null;
    const numerators = m[1].split("+").map(Number);
    const denominator = Number(m[2]);
    if (numerators.some((n) => n < 1 || n > 32) || ![1, 2, 4, 8, 16, 32].includes(denominator)) return null;
    return { numerators, denominator };
  }
  var range = (n) => Array.from({ length: n }, (_, i) => i);
  function subdivide(kinds, sub) {
    return kinds.flatMap((kind2, pulse) => range(sub).map((s) => ({ at: pulse + s / sub, kind: s === 0 ? kind2 : "sub", voice: 0, pulse })));
  }
  function buildPattern(mode4, sub = 1) {
    if (mode4.kind === "meter") {
      const total = mode4.numerators.reduce((a2, b2) => a2 + b2, 0);
      const starts = mode4.numerators.reduce((acc, _n, i) => [...acc, i ? acc[i - 1] + mode4.numerators[i - 1] : 0], []);
      const kinds = range(total).map((i) => i === 0 ? "strong" : starts.includes(i) ? "accent" : "beat");
      return { beats: total, pulses: [total], groups: mode4.numerators, counts: range(total).map((i) => i + 1), clicks: subdivide(kinds, sub) };
    }
    if (mode4.kind === "cycle") {
      const cycle = UMT.RHYTHMIC_CYCLES[mode4.id];
      if (!cycle) return null;
      const strokes = UMT.cycleStrokes(cycle);
      const kinds = strokes.map((s) => s === "sam" ? "strong" : s === "tali" || s === "accent" ? "accent" : s === "khali" ? "khali" : "beat");
      return { beats: cycle.beats, pulses: [cycle.beats], groups: cycle.groups, counts: UMT.cycleCounts(cycle), clicks: subdivide(kinds, sub) };
    }
    if (mode4.kind === "clave") {
      const clave = UMT.CLAVE_PATTERNS[mode4.id];
      if (!clave) return null;
      const n = clave.steps.length;
      const perBeat = n % 4 === 0 ? 4 : 1;
      const clicks2 = [];
      clave.steps.forEach((on, i) => {
        if (on) clicks2.push({ at: i / perBeat, kind: i === 0 ? "strong" : "accent", voice: 0, pulse: i });
        else if (i % perBeat === 0) clicks2.push({ at: i / perBeat, kind: "sub", voice: 0, pulse: i });
      });
      return { beats: n / perBeat, pulses: [n], groups: perBeat === 4 ? [n / 2, n / 2] : [n], counts: range(n).map((i) => i + 1), clicks: clicks2 };
    }
    if (mode4.kind === "euclid") {
      const { pulses: pulses2, steps: steps2 } = mode4;
      if (steps2 < 1 || pulses2 < 0 || pulses2 > steps2) return null;
      const onsets = UMT.Polyrhythm.euclidean(pulses2, steps2);
      const kinds = onsets.map((on, i) => on ? i === 0 ? "strong" : "accent" : "sub");
      return { beats: steps2, pulses: [steps2], groups: [steps2], counts: range(steps2).map((i) => i + 1), clicks: subdivide(kinds, sub) };
    }
    const { a, b } = mode4;
    if (a < 1 || b < 1) return null;
    const clicks = [
      ...range(a).map((i) => ({ at: i, kind: i === 0 ? "strong" : "beat", voice: 0, pulse: i })),
      ...range(b).map((i) => ({ at: i * a / b, kind: "poly", voice: 1, pulse: i }))
    ].sort((x, y) => x.at - y.at || x.voice - y.voice);
    return { beats: a, pulses: [a, b], groups: [a], counts: range(a).map((i) => i + 1), clicks };
  }
  function tapTempo(taps2, max = 6) {
    const recent2 = taps2.slice(-max);
    if (recent2.length < 2) return null;
    const gaps = recent2.slice(1).map((t2, i) => t2 - recent2[i]);
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    return mean > 0 ? Math.round(6e4 / mean) : null;
  }

  // src/metronome/engine.ts
  var TEMPO_MIN = 20;
  var TEMPO_MAX = 300;
  var DEFAULTS = {
    mode: { kind: "meter", numerators: [4], denominator: 4 },
    tempo: 100,
    sub: 1,
    trainer: { on: false, step: 2, every: 4, max: 160 }
  };
  function loadSettings() {
    const s = loadJSON("metronome", {});
    const merged = { ...DEFAULTS, ...s, trainer: { ...DEFAULTS.trainer, ...s.trainer } };
    return buildPattern(merged.mode, merged.sub) ? merged : DEFAULTS;
  }
  var settings = loadSettings();
  var pattern = buildPattern(settings.mode, settings.sub);
  var getMetronome = () => settings;
  var getPattern = () => pattern;
  var onChange2 = () => {
  };
  function setMetronomeChangeCallback(cb) {
    onChange2 = cb;
  }
  function setMetronome(patch) {
    const next = { ...settings, ...patch, trainer: { ...settings.trainer, ...patch.trainer } };
    next.tempo = Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, next.tempo)));
    next.sub = Math.min(6, Math.max(1, Math.round(next.sub)));
    const p = buildPattern(next.mode, next.sub);
    if (!p) return false;
    const newPattern = JSON.stringify(next.mode) !== JSON.stringify(settings.mode) || next.sub !== settings.sub;
    settings = next;
    if (newPattern) {
      pattern = p;
      index = 0;
      played.length = 0;
    }
    save("metronome", settings);
    onChange2();
    return true;
  }
  var VOICE = {
    strong: { hz: 1760, gain: 0.9, len: 0.05, type: "sine" },
    accent: { hz: 1320, gain: 0.7, len: 0.04, type: "sine" },
    beat: { hz: 880, gain: 0.5, len: 0.035, type: "sine" },
    khali: { hz: 587, gain: 0.25, len: 0.03, type: "sine" },
    // the wave of a tala: a soft, low click
    sub: { hz: 1100, gain: 0.2, len: 0.02, type: "sine" },
    poly: { hz: 440, gain: 0.6, len: 0.05, type: "triangle" }
    // the polyrhythm's second voice
  };
  function click(ctx2, out, kind2, at) {
    const v = VOICE[kind2];
    const osc = ctx2.createOscillator();
    const g = ctx2.createGain();
    osc.type = v.type;
    osc.frequency.value = v.hz;
    g.gain.setValueAtTime(v.gain, at);
    g.gain.exponentialRampToValueAtTime(1e-4, at + v.len);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + v.len + 0.01);
  }
  var TICK_MS = 25;
  var AHEAD_S = 0.1;
  var running = false;
  var timer2 = null;
  var index = 0;
  var nextAt = 0;
  var cycles = 0;
  var played = [];
  var isMetronomeRunning = () => running;
  function schedule() {
    const { ctx: ctx2, out } = audioOutput();
    while (nextAt < ctx2.currentTime + AHEAD_S) {
      const c = pattern.clicks[index];
      click(ctx2, out, c.kind, nextAt);
      played.push({ at: nextAt, click: c, counts: pattern.counts });
      if (played.length > 64) played.shift();
      const secPerBeat = 60 / settings.tempo;
      if (index + 1 < pattern.clicks.length) {
        nextAt += (pattern.clicks[index + 1].at - c.at) * secPerBeat;
        index++;
      } else {
        nextAt += (pattern.beats - c.at) * secPerBeat;
        cycles++;
        index = 0;
        nextAt += pattern.clicks[0].at * 60 / settings.tempo;
        const t2 = settings.trainer;
        if (t2.on && cycles % Math.max(1, t2.every) === 0 && settings.tempo < t2.max) {
          settings = { ...settings, tempo: Math.min(t2.max, settings.tempo + t2.step) };
          save("metronome", settings);
          onChange2();
        }
      }
    }
  }
  function startMetronome() {
    if (running) return;
    const { ctx: ctx2 } = audioOutput();
    running = true;
    index = 0;
    cycles = 0;
    played.length = 0;
    nextAt = ctx2.currentTime + 0.05;
    schedule();
    timer2 = setInterval(schedule, TICK_MS);
    onChange2();
  }
  function stopMetronome() {
    if (!running) return;
    running = false;
    if (timer2) clearInterval(timer2);
    timer2 = null;
    played.length = 0;
    onChange2();
  }
  function currentClick() {
    if (!running) return null;
    const now = audioOutput().ctx.currentTime;
    let last = null;
    for (const p of played) if (p.at <= now) last = { click: p.click, at: p.at };
    return last;
  }
  var taps = [];
  function tap(now = performance.now()) {
    if (taps.length && now - taps[taps.length - 1] > 2e3) taps = [];
    taps.push(now);
    const bpm = tapTempo(taps);
    if (bpm) setMetronome({ tempo: bpm });
  }
  function runningMeter() {
    return running ? { bpm: settings.tempo, beatsPerBar: pattern.beats } : null;
  }

  // src/theory/key-map.ts
  function keyChord(symbol, key) {
    const a = romanInKey(symbol, key);
    const secondary = a && a.roman !== a.degree ? a.roman : void 0;
    return { symbol, roman: a?.degree ?? "?", secondary, function: a?.function ?? "unknown" };
  }
  var cache3 = /* @__PURE__ */ new Map();
  function buildKeyMap(key, sevenths) {
    const cacheKey = `${key}|${sevenths}`;
    if (cache3.has(cacheKey)) return cache3.get(cacheKey);
    const chords = tryUMT("diatonic chords", () => UMT.parseScaleSymbol(key).getDiatonicChords(sevenths ? "seventh" : "triad"), []);
    if (!chords.length) {
      cache3.set(cacheKey, null);
      return null;
    }
    const diatonic = chords.map((c) => keyChord(c.name, key));
    if (keyMode(key) === "Minor") {
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
      let row3 = byMode.get(b.sourceMode);
      if (!row3) byMode.set(b.sourceMode, row3 = { mode: b.sourceMode, brightness: b.brightness ?? 0, chords: [] });
      row3.chords.push({ ...keyChord(name, key), characteristic: !!b.characteristic, common: !!b.common });
    }
    const parallel = [...byMode.values()].sort((a, b) => b.brightness - a.brightness);
    const axis = tryUMT("coltrane axis", () => UMT.Harmony.getColtraneAxis(key).majorThirds, null);
    const coltraneAxis = axis ? axis.map((n) => spellPitchClassInKey(n, key)) : null;
    const map = { key, diatonic, negative, parallel, coltraneAxis };
    cache3.set(cacheKey, map);
    return map;
  }
  function sameChord(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const ca = tryParseChord(a), cb = tryParseChord(b);
    if (!ca || !cb) return false;
    const pc3 = (s) => s === void 0 ? -1 : (s % 12 + 12) % 12;
    return pc3(ca.rootStep) === pc3(cb.rootStep) && (ca.intervalsInSteps ?? []).join() === (cb.intervalsInSteps ?? []).join() && pc3(ca.bassStep) === pc3(cb.bassStep);
  }

  // src/detector/explain.ts
  var nth = (n) => t(`ex.nth.${n}`);
  var pc2 = (name) => pitchClassOf(name.replace(/-?\d+$/, ""));
  function notesOutside(symbol, key) {
    const scale = new Set(tryUMT("scale", () => UMT.parseScaleSymbol(key).getNotes().slice(0, 7).map((n) => pc2(n.name)), []));
    return chordNoteNames(symbol).filter((n) => !scale.has(pc2(n))).map((n) => noteLabel(n.replace(/-?\d+$/, "")));
  }
  function romanEntry(symbol, key, a) {
    const roman = a.degree ?? a.roman;
    const n = a.degreeNumber;
    if (!roman || roman === "?" || !n || n < 1 || n > 7) return null;
    const vars = { chord: chordLabel(symbol), roman, key: keyLabel(key), nth: nth(n) };
    const withDo = (text) => ({ term: roman, text: getPref("movable-do") ? `${text} ${movableDo(symbol, key)}` : text });
    const acc = roman.match(/^([b#♭♯])/)?.[1];
    if (acc) {
      const flat = acc === "b" || acc === "\u266D";
      return withDo(t("ex.romanAltered", { ...vars, dir: t(flat ? "ex.lowered" : "ex.raised"), acc: flat ? "\u266D" : "\u266F", n }));
    }
    const subtonic = n === 7 && !hasLeadingTone(key) && /^VII/.test(roman);
    const name = subtonic ? t("ex.deg.subtonic") : t(`ex.deg.${n}`);
    return withDo(t("ex.roman", { ...vars, name }));
  }
  function movableDo(symbol, key) {
    const root2 = symbol.match(/^[A-G][#b]*/)?.[0];
    const syllable = root2 ? movableSyllable(root2, key) : null;
    return syllable ? t("ex.movableDo", { syllable }) : "";
  }
  function secondaryTarget(target, key) {
    const map = buildKeyMap(key, false);
    const plain = (r) => r.replace(/[°ø+7]/g, "").toLowerCase();
    return map?.diatonic.find((c) => plain(c.roman) === plain(target))?.symbol ?? null;
  }
  function colourEntries(symbol, key, a) {
    const chord = chordLabel(symbol);
    const k = keyLabel(key);
    if (a.isSecondary && a.secondaryTarget) {
      const [kind2, target] = a.secondaryTarget.split("/");
      const targetChord = target ? secondaryTarget(target, key) : null;
      const vars = { chord, roman: a.secondaryTarget, target: targetChord ? chordLabel(targetChord) : target, targetRoman: target };
      return [{ term: a.secondaryTarget, text: t(kind2.startsWith("vii") ? "ex.secondaryVii" : "ex.secondaryV", vars) }];
    }
    if (a.isDiatonic) return [{ term: t("ex.term.diatonic"), text: t("ex.diatonic", { chord, key: k }) }];
    const notes2 = notesOutside(symbol, key).join(" ");
    if (a.isBorrowed && a.borrowedFrom) {
      const mode4 = scaleLabel(`${key.split(" ")[0]} ${a.borrowedFrom}`);
      return [{ term: t("analysis.borrowed", { mode: a.borrowedFrom }), text: t("ex.borrowed", { chord, mode: mode4, key: k, notes: notes2 }) }];
    }
    if (a.substitutionCandidate?.startsWith("tritone")) return [{ term: substitutionTypeLabel("tritone"), text: t("ex.tritoneSub", { chord }) }];
    return [{ term: t("analysis.chromatic"), text: t("ex.chromatic", { chord, key: k, notes: notes2 }) }];
  }
  var CADENCES = [
    ["Authentic", "authentic"],
    ["Minor Plagal", "minorPlagal"],
    ["Plagal", "plagal"],
    ["Deceptive", "deceptive"],
    ["Phrygian Half", "phrygianHalf"],
    ["Phrygian", "phrygian"],
    ["Backdoor", "backdoor"],
    ["Half", "half"],
    ["Picardy", "picardy"]
  ];
  function explainCadence(cadence) {
    const k = CADENCES.find(([start]) => cadence.startsWith(start))?.[1];
    return k ? t(`ex.cad.${k}`) : null;
  }
  var FIGURES = {
    "": "ex.fig.root",
    "5/3": "ex.fig.root",
    "6": "ex.fig.6",
    "6/3": "ex.fig.6",
    "6/4": "ex.fig.64",
    "7": "ex.fig.7",
    "6/5": "ex.fig.65",
    "4/3": "ex.fig.43",
    "4/2": "ex.fig.42",
    "2": "ex.fig.42"
  };
  function voicingEntries(noteNames, symbol) {
    if (noteNames.length < 3) return [];
    const chord = tryParseChord(symbol);
    const v = tryUMT("voicing", () => UMT.analyzeVoicing(noteNames.map((n) => UMT.parseNote(n)), chord), null);
    if (!v) return [];
    const out = [{ term: t("ex.term.voicing", { v: t(`voicing.${v.position}`) }), text: t(`ex.voicing.${v.position}`) }];
    if (v.drop) out.push({ term: v.drop, text: t("ex.voicing.drop") });
    return out;
  }
  var PLR_EXAMPLES = { P: ["C", "Cm"], R: ["C", "Am"], L: ["C", "Em"] };
  var SUBSTITUTION_TYPES = ["tritone", "diatonic", "deceptive", "chromatic-mediant", "sus4", "modal"];
  function explainDetection(detection, a, key, prevSymbol) {
    if (detection?.kind === "interval") {
      return [{ term: detection.intervalName, text: t("ex.interval", { n: detection.semitones % 12 || 12, inv: detection.inversionName }) }];
    }
    if (detection?.kind !== "chord" || !a) return [];
    const symbol = detection.candidates[detection.selectedIndex];
    const out = [];
    if (key) {
      const roman = romanEntry(symbol, key, a);
      if (roman) out.push(roman, { term: t("ex.case.term"), text: t("ex.case") });
      if (a.function !== "unknown") out.push({ term: t(`fn.${a.function}`), text: t(`ex.fn.${a.function}`) });
      out.push(...colourEntries(symbol, key, a));
    }
    const fig = FIGURES[a.figuredBass ?? ""];
    if (fig) out.push({ term: t("ex.term.figbass", { fig: a.figuredBass || "5/3" }), text: `${t(fig)} ${t("ex.fig.intro")}` });
    out.push(...voicingEntries(detection.notes, symbol));
    if (a.cadence) {
      const text = explainCadence(a.cadence);
      if (text) out.push({ term: cadenceLabel(a.cadence), text });
    }
    if (a.transformation && prevSymbol) {
      out.push({ term: a.transformation, text: t("ex.plr", { chord: chordLabel(symbol), prev: chordLabel(prevSymbol), path: a.transformation }) });
      for (const op of new Set(a.transformation.split(""))) {
        const [x, y] = PLR_EXAMPLES[op];
        out.push({ term: op, text: t(`ex.plr.${op}`, { a: chordLabel(x), b: chordLabel(y) }) });
      }
    }
    for (const type of a.substitutionTypes) {
      if (SUBSTITUTION_TYPES.includes(type)) out.push({ term: substitutionTypeLabel(type), text: t(`ex.sub.${type}`) });
    }
    if (a.upperStructures.length) out.push({ term: a.upperStructures.join(", "), text: t("ex.upper") });
    if (a.slash) {
      const s = a.slash;
      const vars = { upper: s.upper ? chordLabel(s.upper) : "", bass: noteLabel(s.bass), tensions: s.tensions.join(" ") };
      out.push({ term: t(`slash.type.${s.type}`), text: t(`ex.slash.${s.type}`, vars) });
    }
    for (const k of a.voiceRuleKeys) out.push({ term: t(`vl.issue.${k}`, { voices: "" }).replace(/\s*\(\)$/, ""), text: t(`ex.vl.${k}`) });
    return out;
  }
  function renderExplanation(container2, items) {
    container2.innerHTML = items.length ? `<dl class="explain-list">${items.map((i) => `<dt>${escapeHtml(i.term)}</dt><dd>${escapeHtml(i.text)}</dd>`).join("")}</dl>` : `<p class="explain-empty">${escapeHtml(t("ex.empty"))}</p>`;
  }

  // src/id.ts
  function newId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = b[6] & 15 | 64;
    b[8] = b[8] & 63 | 128;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // src/history/history.ts
  var FUNCTION_COLORS = {
    "T": "var(--fn-t)",
    "S": "var(--fn-s)",
    "D": "var(--fn-d)",
    "unknown": "var(--text-dim)"
  };
  var entries = [];
  var debounceTimer = null;
  var lastAutoAppended = null;
  var onChange3 = () => {
  };
  function setHistoryChangeCallback(cb) {
    onChange3 = cb;
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
  function addEntry(symbol, notes2, time) {
    const entry = { id: newId(), symbol, notes: notes2, ...time };
    entries = [entry, ...entries].slice(0, getPref("history-max"));
    onChange3(entries);
  }
  function removeEntry(id) {
    entries = entries.filter((e) => e.id !== id);
    lastAutoAppended = entries[0]?.symbol ?? null;
    onChange3(entries);
  }
  function restoreEntries(list) {
    entries = list.slice(0, getPref("history-max"));
    lastAutoAppended = entries[0]?.symbol ?? null;
    onChange3(entries);
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
    onChange3(entries);
  }
  var pending2 = null;
  function notifyChordDetected(symbol, notes2, at = Date.now()) {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (pending2?.symbol !== symbol) pending2 = { symbol, at };
    else delete pending2.until;
    if (symbol === lastAutoAppended && entries[0]) delete entries[0].until;
    debounceTimer = setTimeout(() => {
      if (symbol !== lastAutoAppended && symbol !== "?") {
        const p = pending2?.symbol === symbol ? pending2 : null;
        addEntry(symbol, notes2, p ? { at: p.at, until: p.until } : void 0);
        lastAutoAppended = symbol;
      }
    }, getPref("history-hold-ms"));
  }
  function notifyChordReleased(at = Date.now()) {
    if (pending2 && pending2.until === void 0) pending2.until = at;
    const e = entries[0];
    if (e?.at !== void 0 && e.until === void 0 && e.symbol === pending2?.symbol) {
      e.until = at;
      onChange3(entries);
    }
  }
  function markActiveHistoryEntry(container2, entryId) {
    container2.querySelectorAll(".history-chip").forEach((el2) => {
      el2.classList.toggle("active-cursor", el2.dataset.id === entryId);
    });
  }
  function renderHistory(container2, activeKey, onChipClick, activeCursorEntryId, onSend) {
    const strip = document.createElement("div");
    strip.className = "history-strip";
    const shown = entries.map((e) => ({ ...e, symbol: spellChordSymbol(e.symbol, activeKey) }));
    const steps2 = analyzeChordProgression(shown.map((e) => e.symbol).reverse(), activeKey).reverse();
    shown.forEach((entry, i) => {
      const older = i + 1 < shown.length ? steps2[i + 1] : null;
      const cadence = older?.cadence ?? null;
      const modulation = older && steps2[i].key && steps2[i].key !== older.key ? steps2[i].key : null;
      const analysis = steps2[i].info;
      const roman = analysis?.roman ?? "\u2014";
      const fn = analysis?.function ?? "unknown";
      const color2 = FUNCTION_COLORS[fn] ?? FUNCTION_COLORS.unknown;
      const chip2 = document.createElement("div");
      chip2.className = "history-chip";
      chip2.dataset.id = entry.id;
      chip2.classList.toggle("active-cursor", activeCursorEntryId === entry.id);
      chip2.style.borderLeft = `3px solid ${color2}`;
      chip2.innerHTML = `
      <span class="history-chip-symbol">${escapeHtml(chordLabel(entry.symbol))}</span>
      <span class="history-chip-roman">${escapeHtml(roman)}</span>
    `;
      chip2.addEventListener("click", () => {
        onChipClick(entry);
        if (entry.notes.length > 0) playNoteNames(entry.notes);
        else playChord(entry.symbol);
      });
      const inKey = steps2[i].key ? ` (${t("history.chip.inKey", { roman, key: keyLabel(steps2[i].key) })})` : "";
      const secs = entrySeconds(entries, i);
      const lasted = secs !== null ? ` \xB7 ${t("history.chip.duration", { s: decimal(secs) })}` : "";
      chip2.title = `${chordLabel(entry.symbol)}${inKey}${lasted} \u2014 ${t("history.chip.actions")}`;
      chip2.draggable = true;
      chip2.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("application/x-history-chord", JSON.stringify({ id: entry.id, symbol: entry.symbol, notes: entry.notes }));
        e.dataTransfer.effectAllowed = "copy";
        chip2.style.opacity = "0.5";
      });
      chip2.addEventListener("dragend", () => {
        chip2.style.opacity = "1";
      });
      const remove = () => {
        const before = entries;
        removeEntry(entry.id);
        showUndo(t("history.removed", { chord: chordLabel(entry.symbol) }), () => restoreEntries(before));
      };
      chip2.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        remove();
      });
      onLongPress(chip2, remove);
      makeActivatable(chip2, t("a11y.chip", { chord: chordLabel(entry.symbol), roman }));
      chip2.addEventListener("keydown", (e) => {
        if (e.key !== "Delete" && e.key !== "Backspace") return;
        e.preventDefault();
        e.stopPropagation();
        remove();
      });
      strip.appendChild(chip2);
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
        tag.title = `${cadenceLabel(cadence)}: ${chordLabel(shown[i + 1].symbol)} \u2192 ${chordLabel(entry.symbol)}` + (explainCadence(cadence) ? `
${explainCadence(cadence)}` : "");
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
    if (onSend && entries.length) {
      const sendBtn = document.createElement("button");
      sendBtn.textContent = t("history.send");
      sendBtn.title = t("history.send.title");
      sendBtn.className = "history-send-btn";
      sendBtn.addEventListener("click", onSend);
      wrap.appendChild(sendBtn);
    }
    wrap.appendChild(clearBtn);
    container2.innerHTML = "";
    container2.appendChild(wrap);
    const rhythm = rhythmText();
    if (rhythm) {
      const line2 = document.createElement("div");
      line2.className = "history-rhythm";
      line2.textContent = rhythm;
      line2.title = t("history.rhythm.title");
      container2.appendChild(line2);
    }
  }
  var decimal = (n) => n.toLocaleString(getLang(), { maximumFractionDigits: 1 });
  function rhythmText() {
    const running2 = runningMeter();
    const bpm = running2?.bpm ?? getPref("history-bpm"), beats = running2?.beatsPerBar ?? getPref("history-beats");
    const r = harmonicRhythm(entries, bpm, beats);
    if (!r) return null;
    return r.kind === "per-bar" ? t("history.rhythm.perBar", { n: decimal(r.changes), bpm: r.bpm, beats: r.beatsPerBar }) : t("history.rhythm.seconds", { s: decimal(r.secondsPerChange) });
  }

  // src/ui/icons.ts
  var line = (body) => `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  var ICONS = {
    keyboard: line('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h0M7 14h10"/>'),
    mic: line('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    play: '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>',
    layout: line('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>'),
    present: line('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    views: line('<rect x="3" y="7" width="14" height="13" rx="1.5"/><path d="M7 4h14v13"/>'),
    settings: line('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    rail: line('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
    midi: line('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M7 6v7M12 6v7M17 6v7"/>'),
    sound: line('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>'),
    search: line('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    // Settings sections
    sliders: line('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    note: line('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
    clock: line('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    ear: line('<path d="M7 9a5 5 0 0 1 10 0c0 3-2.5 4-3.5 6s-1 4-3.5 4a2.5 2.5 0 0 1-2.5-2.5"/><path d="M10 10a2 2 0 0 1 4 0"/>'),
    file: line('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14l3 3 3-3"/>'),
    more: '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>'
  };
  var LOGO = `<svg class="logo-mark" width="26" height="26" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="124" fill="var(--logo-bg)"/><g fill="var(--logo-ink)"><path d="M146 206 Q272 152 398 142 L398 93.1 Q272 101.6 146 154 Z"/><path d="M155 186.6 L155 376.2 M273 147.1 L273 338.2 M389 127.2 L389 302.2" fill="none" stroke="var(--logo-ink)" stroke-width="18" stroke-linecap="round"/><path d="M94 384 C94 367.1 110.1 358 130 358 C153.5 358 166 369.6 166 384 C166 395.8 149.9 411.9 130 410 C106.5 410 94 398.4 94 384 Z" transform="rotate(-24 130 384)"/><path d="M212 346 C212 329.1 228.1 320 248 320 C271.5 320 284 331.6 284 346 C284 357.8 267.9 373.9 248 372 C224.5 372 212 360.4 212 346 Z" transform="rotate(-24 248 346)"/><path d="M328 310 C328 293.1 344.1 284 364 284 C387.5 284 400 295.6 400 310 C400 321.8 383.9 337.9 364 336 C340.5 336 328 324.4 328 310 Z" transform="rotate(-24 364 310)"/></g></svg>`;

  // src/ui/settings.ts
  var SECTIONS = ["general", "io", "sound", "theory", "detector", "panels", "practice", "mic", "shortcuts", "data"];
  var SECTION_PREFS = {
    general: ["ui-zoom"],
    sound: ["preview-s", "piano-velocity"],
    theory: ["chord-style", "key-profile", "auto-modes", "voice-rules", "movable-do"],
    detector: ["history-hold-ms", "history-max", "history-bpm", "history-beats", "arpeggio-ms", "melody-gap-s", "capture-ms"],
    practice: ["progression-bpm", "ear-interval-play", "ear-chords", "ear-cadences"],
    mic: ["a4-hz", "mic-sensitivity", "mic-response"]
  };
  var PANEL_BUTTONS = [
    { id: "btn-staff-prev", label: "set.panels.prev" },
    { id: "btn-cof-minor", label: "set.panels.cofMinor" },
    { id: "btn-cof-deg", label: "set.panels.cofDegrees" },
    { id: "btn-cof-7", label: "set.panels.cofSevenths" },
    { id: "btn-key-7", label: "set.panels.keySevenths" },
    { id: "btn-key-neg", label: "set.panels.keyNegative" },
    { id: "btn-key-par", label: "set.panels.keyParallel" },
    { id: "btn-key-colt", label: "set.panels.keyColtrane" }
  ];
  var CADENCE_UMT = {
    authentic: "Authentic Cadence (V -> I)",
    plagal: "Plagal Cadence (IV -> I)",
    deceptive: "Deceptive Cadence (V -> vi)",
    half: "Half Cadence (-> V)"
  };
  var lbl = (name) => t(`pref.${name}`);
  var prefLabel = lbl;
  var hint = (name) => t(`pref.${name}.hint`);
  function prefOptionLabel(name, option) {
    return optionLabel(name, option);
  }
  function optionLabel(name, option) {
    if (name === "ear-chords") return t(`ear.chord.${option || "maj"}`);
    if (name === "ear-cadences") return cadenceLabel(CADENCE_UMT[option], true);
    return t(`pref.${name}.${option}`);
  }
  function formatPrefValue(def, v) {
    const n = (x) => x.toLocaleString(getLang(), { maximumFractionDigits: 2 });
    if (def.unit === "ms") return `${n(v / 1e3)} s`;
    return def.unit ? `${n(v)} ${def.unit}` : n(v);
  }
  var info = (hintText) => hintText ? `<button type="button" class="set-info" title="${escapeHtml(hintText)}" aria-label="${escapeHtml(hintText)}" aria-expanded="false">\u24D8</button>` : "";
  var row = (labelHtml, hintText, control, search, extra = "") => `
  <div class="set-row" data-search="${escapeHtml(search.toLowerCase())}">
    <div class="set-text">${labelHtml}</div>${info(hintText)}
    ${control ? `<div class="set-control">${control}</div>` : ""}${extra}
    ${hintText ? `<div class="set-hint" hidden>${escapeHtml(hintText)}</div>` : ""}
  </div>`;
  var pickRow = (holder, label, value, hintText, search, holderHtml) => `
  <div class="set-row" data-search="${escapeHtml(search.toLowerCase())}">
    <button type="button" class="set-text set-pick" data-pick="${holder}" aria-haspopup="dialog">
      <span class="set-label">${escapeHtml(label)}</span><span class="set-value" data-shows="${holder}">${escapeHtml(value)}</span>
    </button>${info(hintText)}${holderHtml}
    ${hintText ? `<div class="set-hint" hidden>${escapeHtml(hintText)}</div>` : ""}
  </div>`;
  function selectRow(id, label, options2, value, hintText, search, attrs = "") {
    const select = `<select id="${id}" class="set-holder" hidden${attrs}>${options2.map((o) => `<option value="${escapeHtml(o.value)}"${o.value === value ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>`;
    return pickRow(id, label, options2.find((o) => o.value === value)?.label ?? "", hintText, search, select);
  }
  function prefRow(name) {
    const def = PREFS[name];
    const id = `pref-${name}`;
    const v = getPref(name);
    const search = `${lbl(name)} ${hint(name)}`;
    switch (def.kind) {
      case "choice":
        return selectRow(id, lbl(name), def.options.map((o) => ({ value: o, label: optionLabel(name, o) })), v, hint(name), search, ` data-pref="${name}"`);
      case "bool":
        return row(
          `<label class="set-label" for="${id}">${escapeHtml(lbl(name))}</label>`,
          hint(name),
          `<input type="checkbox" id="${id}" class="set-check" role="switch" data-pref="${name}"${v ? " checked" : ""}>`,
          search
        );
      case "number":
        return row(
          `<label class="set-label" for="${id}">${escapeHtml(lbl(name))}</label><output class="set-value" for="${id}">${escapeHtml(formatPrefValue(def, v))}</output>`,
          hint(name),
          `<input type="range" id="${id}" class="set-range" data-pref="${name}" min="${def.min}" max="${def.max}" step="${def.step}" value="${v}">`,
          search
        );
      case "set": {
        const holder = `pref-set-${name}`;
        const boxes = `<div id="${holder}" class="set-holder" hidden aria-label="${escapeHtml(lbl(name))}">${def.options.map((o) => `<input type="checkbox" data-pref-set="${name}" value="${escapeHtml(o)}" data-label="${escapeHtml(optionLabel(name, o))}"${v.includes(o) ? " checked" : ""}>`).join("")}</div>`;
        return pickRow(
          holder,
          lbl(name),
          setSummary(name, v),
          hint(name),
          search + " " + def.options.map((o) => optionLabel(name, o)).join(" "),
          boxes
        );
      }
    }
  }
  function setSummary(name, chosen) {
    return chosen.length ? chosen.map((o) => optionLabel(name, o)).join(", ") : "\u2014";
  }
  function holderValue(holder) {
    if (holder instanceof HTMLSelectElement) return (holder.selectedOptions[0]?.textContent ?? "") + (holder.classList.contains("invalid") ? ` \xB7 ${holder.title}` : "");
    const on = [...holder.querySelectorAll("input:checked")].map((b) => b.dataset.label ?? b.value);
    return on.length ? on.join(", ") : "\u2014";
  }
  function refreshValues() {
    root()?.querySelectorAll("[data-shows]").forEach((out) => {
      const holder = document.getElementById(out.dataset.shows);
      if (holder) out.textContent = holderValue(holder);
    });
    refreshSummaries();
  }
  function syncPrefControl(name) {
    const el2 = root();
    if (!el2) return;
    const def = PREFS[name];
    const v = getPref(name);
    el2.querySelectorAll(`[data-pref="${name}"]`).forEach((c) => {
      if (c instanceof HTMLInputElement && c.type === "range") {
        c.value = String(v);
        const out = el2.querySelector(`output[for="${c.id}"]`);
        if (out) out.textContent = formatPrefValue(def, v);
      } else if (c instanceof HTMLInputElement && c.type === "checkbox") c.checked = v;
      else if (c instanceof HTMLSelectElement) c.value = v;
    });
    el2.querySelectorAll(`input[data-pref-set="${name}"]`).forEach((box) => {
      box.checked = v.includes(box.value);
    });
    refreshValues();
  }
  function keyLabel2(key) {
    const named = { Space: "kbd.space", Delete: "kbd.del", Escape: "kbd.esc" };
    if (named[key]) return t(named[key]);
    return { ArrowLeft: "\u2190", ArrowRight: "\u2192", ArrowUp: "\u2191", ArrowDown: "\u2193", Backspace: "\u232B" }[key] ?? key;
  }
  var capturing = null;
  var pendingConflict = null;
  function shortcutsHtml() {
    const conflictCard = () => pendingConflict ? `<div class="set-conflict" role="alert">
      <span>${escapeHtml(t("set.keys.conflict", { key: keyLabel2(pendingConflict.key), other: t(`action.${pendingConflict.other}`), action: t(`action.${pendingConflict.action}`) }))}</span>
      <button type="button" class="ctrl-btn set-primary" data-conflict-take>${escapeHtml(t("set.keys.take"))}</button>
      <button type="button" class="ctrl-btn" data-conflict-other>${escapeHtml(t("set.keys.other"))}</button>
    </div>` : "";
    const rows = ACTIONS.map((a) => {
      const keys = keysOf(a);
      const waiting2 = capturing?.action === a;
      const chips = keys.map((k, slot) => waiting2 && capturing.slot === slot ? `<kbd class="set-kbd set-kbd-wait">${escapeHtml(t("set.keys.press"))}</kbd>` : `<span class="set-kbd-wrap"><kbd class="set-kbd${DEFAULT_KEYS[a].includes(k) ? "" : " set-kbd-custom"}">${escapeHtml(keyLabel2(k))}</kbd><button type="button" class="set-kbd-x" data-key-remove="${a}" data-key="${escapeHtml(k)}" aria-label="${escapeHtml(t("set.keys.remove", { key: keyLabel2(k) }))}">\xD7</button></span>`).join("");
      const adding = waiting2 && capturing.slot >= keys.length ? `<kbd class="set-kbd set-kbd-wait">${escapeHtml(t("set.keys.press"))}</kbd>` : "";
      const buttons = waiting2 ? `<button type="button" class="ctrl-btn" data-key-cancel>${escapeHtml(t("set.keys.cancel"))}</button>` : `${keys.length ? `<button type="button" class="ctrl-btn" data-key-change="${a}">${escapeHtml(t("set.keys.change"))}</button>` : ""}
         ${keys.length < MAX_KEYS ? `<button type="button" class="ctrl-btn" data-key-add="${a}" aria-label="${escapeHtml(t("set.keys.add.title"))}">+</button>` : ""}
         ${isDefaultBinding(a) ? "" : `<button type="button" class="ctrl-btn" data-key-reset="${a}" title="${escapeHtml(t("set.keys.reset"))}" aria-label="${escapeHtml(t("set.keys.reset"))}">\u21BA</button>`}`;
      return `<div class="set-row set-key-row${waiting2 ? " set-key-waiting" : ""}" data-search="${escapeHtml(`${t(`action.${a}`)} ${keys.join(" ")}`.toLowerCase())}">
      <div class="set-text"><div class="set-label">${escapeHtml(t(`action.${a}`))}</div></div>
      <div class="set-control set-keys">${chips}${adding || (keys.length ? "" : `<span class="set-hint">${escapeHtml(t("set.keys.none"))}</span>`)}</div>
      <div class="set-key-buttons">${buttons}</div>
      ${pendingConflict?.action === a ? conflictCard() : ""}
    </div>`;
    }).join("");
    const fixed = `<div class="set-row" data-search="${escapeHtml(`${t("set.keys.fixed")} esc 1 9`.toLowerCase())}"><div class="set-text"><div class="set-label">${escapeHtml(t("set.keys.fixed"))}</div><div class="set-hint">${escapeHtml(t("set.keys.fixed.hint"))}</div></div>
    <div class="set-control set-keys"><kbd class="set-kbd">${escapeHtml(t("kbd.esc"))}</kbd><kbd class="set-kbd">1\u20139</kbd><kbd class="set-kbd">Tab</kbd></div></div>`;
    return rows + fixed;
  }
  function redrawShortcuts() {
    const el2 = document.getElementById("set-shortcuts");
    if (el2) el2.innerHTML = shortcutsHtml();
  }
  function onCaptureKey(e) {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      capturing = null;
      redrawShortcuts();
      focusShortcut();
      return;
    }
    const key = keyName2(e);
    if (RESERVED.has(key)) return;
    const { action, slot } = capturing;
    capturing = null;
    const other = conflictFor(key, action);
    if (other) pendingConflict = { action, slot, key, other };
    else assignKey(action, key, slot);
    redrawShortcuts();
    focusShortcut(action);
  }
  function focusShortcut(action) {
    const sel = pendingConflict ? "[data-conflict-take]" : action ? `[data-key-change="${action}"], [data-key-add="${action}"]` : "[data-key-change]";
    document.querySelector(`#set-shortcuts ${sel}`)?.focus();
  }
  function startCapture(action, slot) {
    capturing = { action, slot };
    pendingConflict = null;
    redrawShortcuts();
    document.querySelector("#set-shortcuts [data-key-cancel]")?.focus();
  }
  function isDataKey(key) {
    return key.startsWith("modus-song") || key.startsWith("harmony-companion-song") || ["active-key", "storage-persist-asked", "e2e", "tour-done", "ear-score"].includes(key);
  }
  function settingsSnapshot() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!isDataKey(k)) out[k] = localStorage.getItem(k);
      }
    } catch {
    }
    return out;
  }
  function replaceSettings(next, message) {
    try {
      sessionStorage.setItem("settings-undo", JSON.stringify({ before: settingsSnapshot(), message }));
      for (const k of Object.keys(settingsSnapshot())) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(next)) if (!isDataKey(k)) localStorage.setItem(k, v);
    } catch {
    }
    carryHistoryOverReload();
    location.reload();
  }
  function offerSettingsUndo() {
    let pending3 = null;
    try {
      pending3 = JSON.parse(sessionStorage.getItem("settings-undo") ?? "null");
      sessionStorage.removeItem("settings-undo");
    } catch {
    }
    if (!pending3) return;
    const before = pending3.before;
    showUndo(t(pending3.message), () => {
      try {
        for (const k of Object.keys(settingsSnapshot())) localStorage.removeItem(k);
        for (const [k, v] of Object.entries(before)) localStorage.setItem(k, v);
      } catch {
      }
      carryHistoryOverReload();
      location.reload();
    });
  }
  function exportSettings() {
    const body = JSON.stringify({ app: "modus", kind: "settings", version: 1, data: settingsSnapshot() }, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    a.download = "modus-settings.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  }
  function readSettingsFile(text) {
    try {
      const f = JSON.parse(text);
      if (f?.app !== "modus" || f?.kind !== "settings" || typeof f.data !== "object" || !f.data) return null;
      const out = {};
      for (const [k, v] of Object.entries(f.data)) if (typeof v === "string" && !isDataKey(k)) out[k] = v;
      return out;
    } catch {
      return null;
    }
  }
  function sectionBody(s) {
    const prefs = (SECTION_PREFS[s] ?? []).map(prefRow).join("");
    switch (s) {
      case "general":
        return `
      ${selectRow("help-lang", t("help.language"), LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] })), getLang(), t("set.reloads"), `${t("help.language")} idioma language`)}
      ${selectRow("help-note-names", t("help.noteNames"), NOTE_NAMINGS.map((n) => ({ value: n, label: t(`help.noteNames.${n}`) })), getNoteNaming(), t("set.noteNames.hint"), `${t("help.noteNames")} solfeo solf\xE8ge`)}
      ${selectRow("help-theme", t("help.theme"), THEME_CHOICES.map((c) => ({ value: c, label: t(`help.theme.${c}`) })), getThemeChoice(), "", `${t("help.theme")} theme`)}
      ${prefs}
      ${row(
          `<div class="set-label">${escapeHtml(t("tour.start"))}</div>`,
          t("tour.start.title"),
          `<button type="button" id="set-tour" class="ctrl-btn">${escapeHtml(t("tour.start"))}</button>`,
          `${t("tour.start")} tour`
        )}`;
      case "io":
        return `
      ${selectRow("midi-in-ch", t("set.io.inChannel"), [{ value: "0", label: t("midi.inChannel.all") }, ...Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1), label: t("midi.inChannel.one", { n: i + 1 }) }))], "0", t("midi.inChannel.title"), `${t("set.io.inChannel")} midi`)}
      ${selectRow("midi-out", t("set.io.out"), [{ value: "", label: t("midi.out.off") }], "", t("midi.out.title"), `${t("set.io.out")} midi daw`)}
      ${selectRow("midi-out-ch", t("set.io.outChannel"), Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1), label: t("midi.outChannel.one", { n: i + 1 }) })), "1", t("midi.outChannel.title"), `${t("set.io.outChannel")} midi`)}
      ${row(
          `<div class="set-label">${escapeHtml(t("set.io.thru"))}</div>`,
          t("midi.thru.title"),
          `<button type="button" id="btn-thru" class="set-switch" role="switch" aria-checked="false" aria-label="${escapeHtml(t("set.io.thru"))}"></button>`,
          `${t("set.io.thru")} thru midi`
        )}`;
      case "panels":
        return PANEL_BUTTONS.map((b) => row(
          `<label class="set-label" for="mirror-${b.id}">${escapeHtml(t(b.label))}</label>`,
          "",
          `<input type="checkbox" id="mirror-${b.id}" class="set-check" role="switch" data-mirror="${b.id}">`,
          t(b.label)
        )).join("");
      case "practice":
        return `${prefs}
      ${row(
          `<div class="set-label">${escapeHtml(t("set.ear.reset"))}</div>`,
          t("set.ear.reset.hint"),
          `<button type="button" class="ctrl-btn" data-ear-reset>${escapeHtml(t("set.ear.reset.button"))}</button>`,
          `${t("set.ear.reset")}`
        )}`;
      case "mic":
        return `
      ${selectRow("set-mic-mode", t("set.mic.mode"), MIC_MODES.map((m) => ({ value: m, label: t(`mic.mode.${m}`) })), getMicMode(), t("set.mic.mode.hint"), `${t("set.mic.mode")} micr\xF3fono microphone`)}
      ${prefs}`;
      case "shortcuts":
        return `<div id="set-shortcuts">${shortcutsHtml()}</div>`;
      case "data":
        return `
      ${row(
          `<div class="set-label">${escapeHtml(t("set.data.export"))}</div>`,
          t("set.data.export.hint"),
          `<button type="button" class="ctrl-btn" data-export-settings>${escapeHtml(t("set.data.export.button"))}</button>`,
          t("set.data.export")
        )}
      ${row(
          `<div class="set-label">${escapeHtml(t("set.data.import"))}</div>`,
          t("set.data.import.hint"),
          `<label class="ctrl-btn set-file">${escapeHtml(t("set.data.import.button"))}<input type="file" accept="application/json,.json" data-import-settings hidden></label>`,
          t("set.data.import")
        )}
      ${row(
          `<div class="set-label">${escapeHtml(t("set.data.reset"))}</div>`,
          t("set.data.reset.hint"),
          `<button type="button" class="ctrl-btn set-danger" data-reset-settings>${escapeHtml(t("set.data.reset.button"))}</button>`,
          t("set.data.reset")
        )}
      <p class="set-error" role="alert" hidden></p>`;
      default:
        return prefs;
    }
  }
  var SECTION_ICONS = {
    general: ICONS.sliders,
    io: ICONS.midi,
    sound: ICONS.sound,
    theory: ICONS.note,
    detector: ICONS.clock,
    panels: ICONS.layout,
    practice: ICONS.ear,
    mic: ICONS.mic,
    shortcuts: ICONS.keyboard,
    data: ICONS.file
  };
  var resettable = (s) => s !== "panels" && s !== "data" && s !== "io";
  function sectionHead(s) {
    const intro = s === "panels" ? t("set.panels.intro") : s === "shortcuts" ? t("set.keys.intro") : "";
    return `<div class="set-section-head">
    <button type="button" class="set-back" aria-label="${escapeHtml(t("set.back"))}">\u2190</button>
    <h2 class="set-section-title">${escapeHtml(t(`set.section.${s}`))}</h2>
    ${info([t(`set.section.${s}.hint`), intro].filter(Boolean).join(". "))}
    <span class="set-gap"></span>
    ${resettable(s) ? `<div class="set-more-wrap">
      <button type="button" class="set-more" aria-haspopup="true" aria-expanded="false" aria-label="${escapeHtml(t("menu.options"))}">\u22EE</button>
      <div class="set-more-menu" hidden><button type="button" class="menu-item" data-reset-section><span class="menu-label">${escapeHtml(t("set.resetSection"))}</span></button></div>
    </div>` : ""}
    <div class="set-hint" hidden>${escapeHtml([t(`set.section.${s}.hint`), intro].filter(Boolean).join(". "))}</div>
  </div>`;
  }
  function buildSettings() {
    return `
  <div id="settings" class="set-backdrop" hidden>
    <section class="set-dialog" role="dialog" aria-modal="true" aria-labelledby="set-title">
      <header class="set-header">
        <h1 id="set-title" class="set-title" title="${escapeHtml(t("set.footnote"))}">${escapeHtml(t("set.title"))}</h1>
        <input id="set-search" class="set-search" type="search" placeholder="${escapeHtml(t("set.search.placeholder"))}" aria-label="${escapeHtml(t("set.search"))}" autocomplete="off">
        <span class="set-gap"></span>
        <button type="button" class="set-close" aria-label="${escapeHtml(t("help.close"))}">\xD7</button>
      </header>
      <div class="set-main">
        <nav class="set-nav" aria-label="${escapeHtml(t("set.sections"))}">
          ${SECTIONS.map((s) => `<button type="button" class="set-nav-item" data-section="${s}">
            <span class="set-nav-icon">${SECTION_ICONS[s]}</span>
            <span class="set-nav-text"><span class="set-nav-name">${escapeHtml(t(`set.section.${s}`))}</span><span class="set-nav-sum" data-summary="${s}"></span></span>
          </button>`).join("")}
        </nav>
        <div class="set-content">
          ${SECTIONS.map((s) => `<div class="set-section" data-section="${s}" hidden>
            ${sectionHead(s)}
            ${sectionBody(s)}
          </div>`).join("")}
          <p class="set-nothing" hidden>${escapeHtml(t("set.nothing"))}</p>
        </div>
      </div>
      <div class="set-pick-layer" hidden>
        <div class="set-pick-card" role="dialog" aria-modal="true" aria-labelledby="set-pick-title">
          <h3 id="set-pick-title" class="set-pick-title"></h3>
          <div class="set-pick-list"></div>
          <div class="set-pick-foot"><button type="button" class="ctrl-btn" data-pick-done>${escapeHtml(t("set.pick.done"))}</button></div>
        </div>
      </div>
    </section>
  </div>`;
  }
  function sectionSummary(s) {
    const el2 = root();
    const sec = el2.querySelector(`.set-section[data-section="${s}"]`);
    if (s === "panels") {
      const boxes = [...sec.querySelectorAll("[data-mirror]")];
      return t("set.summary.on", { n: boxes.filter((b) => b.checked).length, total: boxes.length });
    }
    if (s === "shortcuts") {
      const changed2 = ACTIONS.filter((a) => !isDefaultBinding(a)).length;
      return changed2 ? t("set.summary.keys.changed", { n: changed2 }) : t("set.summary.keys.default");
    }
    if (s === "data") return t("set.summary.data");
    return [...sec.querySelectorAll(".set-row .set-value")].slice(0, 3).map((v) => v.textContent ?? "").join(" \xB7 ");
  }
  function refreshSummaries() {
    root()?.querySelectorAll("[data-summary]").forEach((el2) => {
      el2.textContent = sectionSummary(el2.dataset.summary);
    });
  }
  var picking = null;
  function openPicker(from) {
    const holder = document.getElementById(from.dataset.pick);
    const layer = root().querySelector(".set-pick-layer");
    if (!holder) return;
    picking = { holder, from };
    layer.querySelector(".set-pick-title").textContent = from.querySelector(".set-label")?.textContent ?? "";
    const list = layer.querySelector(".set-pick-list");
    const single = holder instanceof HTMLSelectElement;
    list.setAttribute("role", single ? "radiogroup" : "group");
    list.innerHTML = single ? [...holder.options].map((o) => `<button type="button" class="set-pick-option" role="radio" aria-checked="${o.selected}" data-pick-value="${escapeHtml(o.value)}"${o.disabled ? " disabled" : ""}><span class="set-radio" aria-hidden="true"></span>${escapeHtml(o.textContent ?? "")}</button>`).join("") : [...holder.querySelectorAll("input")].map((b) => `<label class="set-pick-option"><input type="checkbox" data-pick-check="${escapeHtml(b.value)}"${b.checked ? " checked" : ""}>${escapeHtml(b.dataset.label ?? b.value)}</label>`).join("");
    layer.querySelector(".set-pick-foot").hidden = single;
    layer.hidden = false;
    (list.querySelector('[aria-checked="true"], input') ?? list.querySelector("button"))?.focus();
  }
  function closePicker() {
    if (!picking) return false;
    root().querySelector(".set-pick-layer").hidden = true;
    picking.from.focus();
    picking = null;
    refreshValues();
    return true;
  }
  var section = loadChoice("settings-section", SECTIONS, "general");
  var returnFocus2 = null;
  var root = () => document.getElementById("settings");
  var phone = () => matchMedia("(max-width: 720px)").matches;
  var dialog = () => root().querySelector(".set-dialog");
  var isPaged = () => dialog().classList.contains("set-paged");
  function showSection(s, paged = true) {
    section = s;
    save("settings-section", s);
    const el2 = root();
    el2.querySelectorAll(".set-nav-item").forEach((b) => b.setAttribute("aria-current", String(b.dataset.section === s)));
    el2.querySelectorAll(".set-section").forEach((sec) => {
      sec.hidden = sec.dataset.section !== s;
    });
    dialog().classList.toggle("set-paged", paged);
    closeMoreMenus();
  }
  function backToList() {
    dialog().classList.remove("set-paged");
    root().querySelector(`.set-nav-item[data-section="${section}"]`)?.focus();
  }
  function closeMoreMenus() {
    root()?.querySelectorAll(".set-more-menu").forEach((m) => {
      m.hidden = true;
    });
    root()?.querySelectorAll(".set-more").forEach((b) => b.setAttribute("aria-expanded", "false"));
  }
  function applySearch(q) {
    const el2 = root();
    const query = q.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    dialog().classList.toggle("set-searching", !!query);
    if (!query) {
      el2.querySelectorAll(".set-row").forEach((r) => {
        r.hidden = false;
      });
      el2.querySelector(".set-nothing").hidden = true;
      showSection(section, isPaged());
      return;
    }
    let any = false;
    el2.querySelectorAll(".set-section").forEach((sec) => {
      let shown = 0;
      sec.querySelectorAll(".set-row").forEach((r) => {
        const text = (r.dataset.search ?? "").normalize("NFD").replace(/\p{M}/gu, "");
        r.hidden = !text.includes(query);
        if (!r.hidden) shown++;
      });
      sec.hidden = shown === 0;
      any ||= shown > 0;
    });
    el2.querySelectorAll(".set-nav-item").forEach((b) => b.setAttribute("aria-current", "false"));
    el2.querySelector(".set-nothing").hidden = any;
  }
  function syncMirrors() {
    root().querySelectorAll("[data-mirror]").forEach((box) => {
      const b = document.getElementById(box.dataset.mirror);
      box.checked = b?.getAttribute("aria-pressed") === "true";
      box.disabled = !b;
    });
  }
  function openSettings(at) {
    const el2 = root();
    if (!el2) return;
    returnFocus2 = document.activeElement;
    el2.hidden = false;
    syncMirrors();
    const paged = !!at || !phone();
    el2.querySelector("#set-search").value = "";
    showSection(at ?? section, paged);
    applySearch("");
    refreshValues();
    if (paged && phone()) el2.querySelector(`.set-section[data-section="${section}"] .set-back`)?.focus();
    else el2.querySelector(`.set-nav-item[data-section="${section}"]`)?.focus();
  }
  function openSettingsAt(query) {
    openSettings();
    const search = root().querySelector("#set-search");
    search.value = query;
    applySearch(query);
  }
  function settingsCommands() {
    const el2 = root();
    if (!el2) return [];
    return [...el2.querySelectorAll(".set-section")].flatMap((sec) => {
      const hint2 = sec.querySelector(".set-section-title")?.textContent ?? "";
      return [...sec.querySelectorAll(".set-row .set-label")].map((label) => {
        const name = label.textContent?.trim() ?? "";
        return { label: t("cmd.setting", { name }), hint: hint2, run: () => openSettingsAt(name) };
      });
    });
  }
  function closeSettings() {
    const el2 = root();
    if (!el2 || el2.hidden) return false;
    if (capturing) {
      capturing = null;
      redrawShortcuts();
      return true;
    }
    if (closePicker()) return true;
    if (el2.querySelector(".set-more-menu:not([hidden])")) {
      closeMoreMenus();
      return true;
    }
    if (phone() && isPaged() && !dialog().classList.contains("set-searching")) {
      backToList();
      return true;
    }
    el2.hidden = true;
    pendingConflict = null;
    returnFocus2?.focus();
    returnFocus2 = null;
    return true;
  }
  function wireSettings(opts) {
    const el2 = root();
    if (!el2) return;
    document.addEventListener("keydown", onCaptureKey, true);
    onPrefChange(syncPrefControl);
    el2.addEventListener("mousedown", (e) => {
      if (e.target === el2) closeSettings();
    });
    el2.querySelector(".set-close").addEventListener("click", () => closeSettings());
    el2.querySelectorAll(".set-nav-item").forEach((b) => b.addEventListener("click", () => {
      ;
      el2.querySelector("#set-search").value = "";
      applySearch("");
      showSection(b.dataset.section);
    }));
    el2.querySelector("#set-search").addEventListener("input", (e) => applySearch(e.target.value));
    const holders = new MutationObserver(() => refreshValues());
    el2.querySelectorAll("select.set-holder").forEach((s) => holders.observe(s, { childList: true, attributes: true }));
    el2.addEventListener("click", (e) => {
      const target = e.target;
      const infoBtn = target.closest(".set-info");
      if (infoBtn) {
        const hintEl = infoBtn.parentElement.querySelector(":scope > .set-hint");
        if (hintEl) {
          hintEl.hidden = !hintEl.hidden;
          infoBtn.setAttribute("aria-expanded", String(!hintEl.hidden));
        }
        return;
      }
      const pick2 = target.closest("[data-pick]");
      if (pick2) {
        openPicker(pick2);
        return;
      }
      if (target.closest(".set-back")) {
        backToList();
        return;
      }
      const more = target.closest(".set-more");
      if (more) {
        const menu = more.parentElement.querySelector(".set-more-menu");
        const open2 = menu.hidden;
        closeMoreMenus();
        menu.hidden = !open2;
        more.setAttribute("aria-expanded", String(open2));
        return;
      }
      if (!target.closest(".set-more-menu")) closeMoreMenus();
      if (target.closest("[data-ear-reset]")) opts.resetEarScore();
    });
    const layer = el2.querySelector(".set-pick-layer");
    layer.addEventListener("click", (e) => {
      const target = e.target;
      e.stopPropagation();
      if (target === layer || target.closest("[data-pick-done]")) {
        closePicker();
        return;
      }
      const option = target.closest("[data-pick-value]");
      if (option && picking?.holder instanceof HTMLSelectElement) {
        const sel = picking.holder;
        sel.value = option.dataset.pickValue;
        closePicker();
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        refreshValues();
      }
    });
    layer.addEventListener("change", (e) => {
      const box = e.target.closest("[data-pick-check]");
      if (!box || !picking) return;
      const holderBox = [...picking.holder.querySelectorAll("input")].find((b) => b.value === box.dataset.pickCheck);
      if (!holderBox) return;
      holderBox.checked = box.checked;
      holderBox.dispatchEvent(new Event("input", { bubbles: true }));
      refreshValues();
    });
    layer.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = [...layer.querySelectorAll(".set-pick-option:not([disabled]), .set-pick-option input")].filter((i2) => i2.tagName !== "LABEL");
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      e.preventDefault();
    });
    el2.addEventListener("input", (e) => {
      const input = e.target;
      const name = input.dataset.pref;
      if (input.dataset.prefSet) {
        const set = input.dataset.prefSet;
        const chosen = [...el2.querySelectorAll(`[data-pref-set="${set}"]`)].filter((b) => b.checked).map((b) => b.value);
        setPref(set, chosen);
        return;
      }
      if (!name) return;
      const def = PREFS[name];
      if (def.kind === "number") {
        const out = el2.querySelector(`output[for="${input.id}"]`);
        if (out) out.textContent = formatPrefValue(def, Number(input.value));
        if (name !== "ui-zoom") setPref(name, Number(input.value));
      } else if (def.kind === "bool") setPref(name, input.checked);
      else if (def.kind === "choice") setPref(name, input.value);
    });
    const reloadWith = (apply) => {
      apply();
      carryHistoryOverReload();
      location.reload();
    };
    el2.addEventListener("change", (e) => {
      const input = e.target;
      if (input.dataset.pref === "ui-zoom") setPref("ui-zoom", Number(input.value));
      else if (input.id === "help-theme") saveThemeChoice(input.value);
      else if (input.id === "help-lang") reloadWith(() => saveLang(input.value));
      else if (input.id === "help-note-names") reloadWith(() => saveNoteNaming(input.value));
      else if (input.id === "set-mic-mode") setMicMode(input.value);
      else if (input.dataset.mirror) {
        document.getElementById(input.dataset.mirror)?.click();
        syncMirrors();
      }
      refreshSummaries();
    });
    el2.addEventListener("click", (e) => {
      if (e.target.closest("#set-tour")) {
        closeSettings();
        startTour();
      }
    });
    el2.querySelector("#set-shortcuts").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.keyChange) startCapture(b.dataset.keyChange, 0);
      else if (b.dataset.keyAdd) startCapture(b.dataset.keyAdd, keysOf(b.dataset.keyAdd).length);
      else if (b.hasAttribute("data-key-cancel")) {
        capturing = null;
        redrawShortcuts();
        focusShortcut();
      } else if (b.dataset.keyRemove) {
        removeKey(b.dataset.keyRemove, b.dataset.key);
        redrawShortcuts();
      } else if (b.dataset.keyReset) {
        resetKeys(b.dataset.keyReset);
        redrawShortcuts();
      } else if (b.hasAttribute("data-conflict-take") && pendingConflict) {
        const c = pendingConflict;
        pendingConflict = null;
        assignKey(c.action, c.key, c.slot);
        redrawShortcuts();
        focusShortcut(c.action);
      } else if (b.hasAttribute("data-conflict-other") && pendingConflict) {
        const c = pendingConflict;
        startCapture(c.action, c.slot);
      }
    });
    el2.addEventListener("click", (e) => {
      if (!e.target.closest("[data-reset-section]")) return;
      closeMoreMenus();
      if (section === "shortcuts") {
        resetAllKeys();
        capturing = null;
        pendingConflict = null;
        redrawShortcuts();
        refreshSummaries();
        return;
      }
      if (section === "general") saveThemeChoice("system");
      for (const name of SECTION_PREFS[section] ?? []) resetPref(name);
      if (section === "mic") setMicMode("notes");
      const sec = el2.querySelector(`.set-section[data-section="${section}"]`);
      const tmp = document.createElement("div");
      tmp.innerHTML = buildSettings();
      const fresh = tmp.querySelector(`.set-section[data-section="${section}"]`);
      if (fresh) sec.innerHTML = fresh.innerHTML;
      refreshValues();
      sec.querySelector(".set-more")?.focus();
    });
    const error = el2.querySelector(".set-error");
    el2.querySelector("[data-export-settings]").addEventListener("click", exportSettings);
    el2.querySelector("[data-import-settings]").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const next = readSettingsFile(await file.text());
      if (!next) {
        error.hidden = false;
        error.textContent = t("set.data.import.bad");
        return;
      }
      replaceSettings(next, "set.data.imported");
    });
    el2.querySelector("[data-reset-settings]").addEventListener("click", () => replaceSettings({}, "set.data.wasReset"));
  }

  // src/ui/popover.ts
  var current2 = null;
  function wirePopover(menu, triggers, onOpen) {
    const pop = { menu, onOpen };
    for (const trigger of triggers) {
      trigger.setAttribute("aria-haspopup", "true");
      trigger.setAttribute("aria-expanded", "false");
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (current2?.pop === pop && current2.trigger === trigger) closePopover();
        else openPopover(pop, trigger);
      });
    }
  }
  var SHEETS = /* @__PURE__ */ new Set(["input-menu", "sound-menu", "layout-menu", "more-menu"]);
  var phone2 = () => matchMedia("(max-width: 720px)").matches;
  function openPopover(pop, trigger) {
    closePopover();
    const sheet = phone2() && SHEETS.has(pop.menu.id);
    const rail = sheet ? null : trigger.closest("#rail");
    const anchor = sheet ? document.body : rail ?? trigger.closest(".pop-anchor") ?? trigger.parentElement;
    anchor.appendChild(pop.menu);
    pop.menu.classList.toggle("pop-side", !!rail);
    pop.menu.classList.toggle("pop-sheet", sheet);
    pop.menu.classList.add("open");
    pop.menu.style.top = "";
    pop.menu.style.transform = "";
    if (sheet) {
      pop.menu.scrollTop = 0;
      if (!pop.menu.querySelector(":scope > .pop-handle")) pop.menu.insertAdjacentHTML("afterbegin", '<div class="pop-handle" aria-hidden="true"></div>');
    }
    if (rail) {
      const top = Math.min(trigger.offsetTop, rail.clientHeight - pop.menu.offsetHeight - 8);
      pop.menu.style.top = `${Math.max(8, top)}px`;
    }
    trigger.setAttribute("aria-expanded", "true");
    current2 = { pop, trigger };
    pop.onOpen?.();
  }
  function closePopover() {
    if (!current2) return;
    current2.pop.menu.classList.remove("open");
    current2.trigger.setAttribute("aria-expanded", "false");
    current2 = null;
  }
  function isPopoverOpen(menu) {
    return current2?.pop.menu === menu;
  }
  var pull = null;
  document.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest?.(".pop-handle");
    const menu = handle?.closest(".pop-sheet.open");
    if (!menu) return;
    pull = { menu, y: e.clientY, id: e.pointerId };
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
    }
  });
  document.addEventListener("pointermove", (e) => {
    if (!pull || e.pointerId !== pull.id) return;
    pull.menu.style.transform = `translateY(${Math.max(0, e.clientY - pull.y)}px)`;
  });
  var release = (e) => {
    if (!pull || e.pointerId !== pull.id) return;
    const { menu, y } = pull;
    pull = null;
    menu.style.transform = "";
    if (e.clientY - y > 80 && current2?.pop.menu === menu) closePopover();
  };
  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);
  document.addEventListener("pointerdown", (e) => {
    if (!current2) return;
    const target = e.target;
    if (current2.pop.menu.contains(target) || current2.trigger.contains(target)) return;
    closePopover();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !current2) return;
    const trigger = current2.trigger;
    closePopover();
    trigger.focus();
  });

  // src/ui/pref-menu.ts
  var PANEL_PREFS = {
    analysis: ["voice-rules"],
    explain: ["movable-do"],
    piano: ["piano-velocity"],
    history: ["history-hold-ms", "history-max", "history-bpm", "history-beats"],
    progressions: ["progression-bpm"],
    ear: ["ear-interval-play", "ear-chords", "ear-cadences"],
    tuner: ["a4-hz", "mic-sensitivity", "mic-response"]
  };
  function itemHtml(name) {
    const def = PREFS[name];
    const v = getPref(name);
    const label = escapeHtml(prefLabel(name));
    switch (def.kind) {
      case "number":
        return `
      <div class="menu-row"><span class="menu-label">${label}</span>
        <button type="button" class="menu-step" data-pref-step="${name}" data-dir="-1" aria-label="${escapeHtml(t("ctrl.smaller"))}">\u2212</button>
        <span class="menu-value" data-pref-value="${name}">${escapeHtml(formatPrefValue(def, v))}</span>
        <button type="button" class="menu-step" data-pref-step="${name}" data-dir="1" aria-label="${escapeHtml(t("ctrl.larger"))}">+</button></div>`;
      case "bool":
        return `
      <button type="button" class="menu-item" data-pref-bool="${name}" aria-pressed="${v}"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${label}</span></button>`;
      case "choice":
        return `<div class="menu-heading">${label}</div><div class="menu-chips">${def.options.map((o) => `<button type="button" class="menu-chip" data-pref-choice="${name}" data-value="${escapeHtml(o)}" data-label="${escapeHtml(`${prefLabel(name)}: ${prefOptionLabel(name, o)}`)}" aria-pressed="${o === v}">${escapeHtml(prefOptionLabel(name, o))}</button>`).join("")}</div>`;
      case "set":
        return `<div class="menu-heading">${label}</div><div class="menu-chips">${def.options.map((o) => `<button type="button" class="menu-chip" data-pref-set="${name}" data-value="${escapeHtml(o)}" data-label="${escapeHtml(`${prefLabel(name)}: ${prefOptionLabel(name, o)}`)}" aria-pressed="${v.includes(o)}">${escapeHtml(prefOptionLabel(name, o))}</button>`).join("")}</div>`;
    }
  }
  function prefMenuHtml(id) {
    const names = PANEL_PREFS[id];
    if (!names) return "";
    const extra = id === "ear" ? `<button type="button" class="menu-item menu-action" data-ear-reset><span class="menu-label">${escapeHtml(t("set.ear.reset"))}</span></button>` : "";
    return `<div class="pref-items" data-pref-panel="${id}">${names.map(itemHtml).join("")}${extra}</div>`;
  }
  function refresh(name) {
    const def = PREFS[name];
    const v = getPref(name);
    document.querySelectorAll(`[data-pref-value="${name}"]`).forEach((e) => {
      e.textContent = formatPrefValue(def, v);
    });
    document.querySelectorAll(`[data-pref-bool="${name}"]`).forEach((e) => e.setAttribute("aria-pressed", String(v)));
    document.querySelectorAll(`[data-pref-choice="${name}"]`).forEach((e) => e.setAttribute("aria-pressed", String(e.dataset.value === v)));
    document.querySelectorAll(`[data-pref-set="${name}"]`).forEach((e) => e.setAttribute("aria-pressed", String(v.includes(e.dataset.value))));
  }
  function wirePrefMenus() {
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".pref-items button");
      if (!b) return;
      if (b.dataset.prefStep) {
        const name = b.dataset.prefStep;
        const def = PREFS[name];
        const next = Math.round((getPref(name) + Number(b.dataset.dir) * def.step) * 1e3) / 1e3;
        setPref(name, Math.min(def.max, Math.max(def.min, next)));
      } else if (b.dataset.prefBool) {
        const name = b.dataset.prefBool;
        setPref(name, !getPref(name));
      } else if (b.dataset.prefChoice) {
        setPref(b.dataset.prefChoice, b.dataset.value);
      } else if (b.dataset.prefSet) {
        const name = b.dataset.prefSet;
        const now = getPref(name);
        const v = b.dataset.value;
        setPref(name, now.includes(v) ? now.filter((x) => x !== v) : [...now, v]);
      }
    });
    onPrefChange(refresh);
  }

  // src/i18n/instruments.ts
  var ES = {
    acoustic_grand_piano: "Piano de cola",
    bright_acoustic_piano: "Piano brillante",
    electric_grand_piano: "Piano de cola el\xE9ctrico",
    honkytonk_piano: "Piano honky-tonk",
    electric_piano_1: "Piano el\xE9ctrico 1",
    electric_piano_2: "Piano el\xE9ctrico 2",
    harpsichord: "Clave",
    clavinet: "Clavinet",
    celesta: "Celesta",
    glockenspiel: "Glockenspiel",
    music_box: "Caja de m\xFAsica",
    vibraphone: "Vibr\xE1fono",
    marimba: "Marimba",
    xylophone: "Xil\xF3fono",
    tubular_bells: "Campanas tubulares",
    dulcimer: "Salterio",
    drawbar_organ: "\xD3rgano Hammond",
    percussive_organ: "\xD3rgano percusivo",
    rock_organ: "\xD3rgano de rock",
    church_organ: "\xD3rgano de iglesia",
    reed_organ: "Armonio",
    accordion: "Acorde\xF3n",
    harmonica: "Arm\xF3nica",
    tango_accordion: "Bandone\xF3n",
    acoustic_guitar_nylon: "Guitarra de nailon",
    acoustic_guitar_steel: "Guitarra ac\xFAstica",
    electric_guitar_jazz: "Guitarra de jazz",
    electric_guitar_clean: "Guitarra el\xE9ctrica limpia",
    electric_guitar_muted: "Guitarra el\xE9ctrica apagada",
    overdriven_guitar: "Guitarra saturada",
    distortion_guitar: "Guitarra distorsionada",
    guitar_harmonics: "Arm\xF3nicos de guitarra",
    acoustic_bass: "Bajo ac\xFAstico",
    electric_bass_finger: "Bajo el\xE9ctrico (dedos)",
    electric_bass_pick: "Bajo el\xE9ctrico (p\xFAa)",
    fretless_bass: "Bajo sin trastes",
    slap_bass_1: "Bajo slap 1",
    slap_bass_2: "Bajo slap 2",
    synth_bass_1: "Bajo sintetizado 1",
    synth_bass_2: "Bajo sintetizado 2",
    violin: "Viol\xEDn",
    viola: "Viola",
    cello: "Violonchelo",
    contrabass: "Contrabajo",
    tremolo_strings: "Cuerdas en tr\xE9molo",
    pizzicato_strings: "Cuerdas en pizzicato",
    orchestral_harp: "Arpa",
    timpani: "Timbales",
    string_ensemble_1: "Conjunto de cuerdas 1",
    string_ensemble_2: "Conjunto de cuerdas 2",
    synth_strings_1: "Cuerdas sintetizadas 1",
    synth_strings_2: "Cuerdas sintetizadas 2",
    choir_aahs: "Coro (aah)",
    voice_oohs: "Voz (ooh)",
    synth_voice: "Voz sintetizada",
    orchestra_hit: "Golpe de orquesta",
    trumpet: "Trompeta",
    trombone: "Tromb\xF3n",
    tuba: "Tuba",
    muted_trumpet: "Trompeta con sordina",
    french_horn: "Trompa",
    brass_section: "Secci\xF3n de metales",
    synth_brass_1: "Metales sintetizados 1",
    synth_brass_2: "Metales sintetizados 2",
    soprano_sax: "Saxo soprano",
    alto_sax: "Saxo alto",
    tenor_sax: "Saxo tenor",
    baritone_sax: "Saxo bar\xEDtono",
    oboe: "Oboe",
    english_horn: "Corno ingl\xE9s",
    bassoon: "Fagot",
    clarinet: "Clarinete",
    piccolo: "Flaut\xEDn",
    flute: "Flauta",
    recorder: "Flauta dulce",
    pan_flute: "Flauta de pan",
    blown_bottle: "Botella soplada",
    shakuhachi: "Shakuhachi",
    whistle: "Silbido",
    ocarina: "Ocarina",
    lead_1_square: "Solista: cuadrada",
    lead_2_sawtooth: "Solista: diente de sierra",
    lead_3_calliope: "Solista: cal\xEDope",
    lead_4_chiff: "Solista: chiff",
    lead_5_charang: "Solista: charang",
    lead_6_voice: "Solista: voz",
    lead_7_fifths: "Solista: quintas",
    lead_8_bass_lead: "Solista: bajo",
    pad_1_new_age: "Pad: new age",
    pad_2_warm: "Pad: c\xE1lido",
    pad_3_polysynth: "Pad: polisintetizador",
    pad_4_choir: "Pad: coro",
    pad_5_bowed: "Pad: arco",
    pad_6_metallic: "Pad: met\xE1lico",
    pad_7_halo: "Pad: halo",
    pad_8_sweep: "Pad: barrido",
    fx_1_rain: "Efecto: lluvia",
    fx_2_soundtrack: "Efecto: banda sonora",
    fx_3_crystal: "Efecto: cristal",
    fx_4_atmosphere: "Efecto: atm\xF3sfera",
    fx_5_brightness: "Efecto: brillo",
    fx_6_goblins: "Efecto: duendes",
    fx_7_echoes: "Efecto: ecos",
    "fx_8_sci-fi": "Efecto: ciencia ficci\xF3n",
    sitar: "Sitar",
    banjo: "Banjo",
    shamisen: "Shamisen",
    koto: "Koto",
    kalimba: "Kalimba",
    bag_pipe: "Gaita",
    fiddle: "Viol\xEDn folk",
    shanai: "Shehnai",
    tinkle_bell: "Campanilla",
    agogo: "Agog\xF3",
    steel_drums: "Steel drum",
    woodblock: "Caja china",
    taiko_drum: "Taiko",
    melodic_tom: "Tom mel\xF3dico",
    synth_drum: "Tambor sintetizado",
    reverse_cymbal: "Platillo invertido",
    guitar_fret_noise: "Ruido de trastes",
    breath_noise: "Respiraci\xF3n",
    seashore: "Orilla del mar",
    bird_tweet: "P\xE1jaros",
    telephone_ring: "Tel\xE9fono",
    helicopter: "Helic\xF3ptero",
    applause: "Aplausos",
    gunshot: "Disparo"
  };
  function instrumentLabel(id) {
    if (getLang() === "es" && ES[id]) return ES[id];
    const words2 = id.replace(/_/g, " ");
    return words2.charAt(0).toUpperCase() + words2.slice(1);
  }

  // src/view/channel.ts
  var VIEW_NAMES = ["chord", "staff", "cof", "piano", "guitar"];
  var VIEW_BACKGROUNDS = { green: "#00ff00", magenta: "#ff00ff", black: "#000000", dark: "#141414" };
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
    let current4 = null;
    let last = "";
    channel2?.addEventListener("message", (e) => {
      if (e.data?.type === "hello" && current4) channel2.postMessage({ type: "state", state: current4 });
    });
    return (state2) => {
      current4 = state2;
      const sig = JSON.stringify(state2);
      if (sig === last) return;
      last = sig;
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
  function viewUrl(view2, bg, base = location.href) {
    const url = new URL(base);
    url.search = new URLSearchParams({ view: view2, bg }).toString();
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

  // src/layout/grid.ts
  var COLS = 12;
  var MIN_W = 2;
  var MIN_H = 2;
  function clampCell(c) {
    const w = Math.min(COLS, Math.max(MIN_W, Math.round(c.w)));
    const h = Math.max(MIN_H, Math.round(c.h));
    const x = Math.min(COLS - w, Math.max(0, Math.round(c.x)));
    const y = Math.max(0, Math.round(c.y));
    return { id: c.id, x, y, w, h };
  }
  function overlaps(a, b) {
    return a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }
  var byPosition = (a, b) => a.y - b.y || a.x - b.x;
  function compact(grid3, first) {
    const fixed = grid3.find((c) => c.id === first);
    const placed = fixed ? [clampCell(fixed)] : [];
    const rest = grid3.filter((c) => c.id !== first).map(clampCell).sort(byPosition);
    for (const c of rest) {
      const cell = { ...c };
      const sameColumns = (p) => p.x < cell.x + cell.w && cell.x < p.x + p.w;
      cell.y = Math.max(0, ...placed.filter((p) => sameColumns(p) && p.y + p.h <= c.y).map((p) => p.y + p.h));
      const hits = () => placed.filter((p) => overlaps(cell, p));
      for (let h = hits(); h.length; h = hits()) cell.y = Math.max(...h.map((p) => p.y + p.h));
      placed.push(cell);
    }
    return placed.sort(byPosition);
  }
  function placeCell(grid3, cell) {
    const others = grid3.filter((c) => c.id !== cell.id);
    const moved = compact([...others, clampCell(cell)], cell.id);
    return compact(moved);
  }
  function addCell(grid3, cell) {
    const bottom = grid3.reduce((m, c) => Math.max(m, c.y + c.h), 0);
    return compact([...grid3.filter((c) => c.id !== cell.id), clampCell({ ...cell, y: bottom })]);
  }
  function removeCell(grid3, id) {
    return compact(grid3.filter((c) => c.id !== id));
  }
  var FIT_MIN_H = 3;
  function fitGrid(grid3, rows) {
    const fitted = grid3.map((c) => {
      const want = rows[c.id];
      if (want === void 0) return c;
      return { ...c, h: Math.min(c.h, Math.max(FIT_MIN_H, Math.ceil(want))) };
    });
    return fitted.every((c, i) => c.h === grid3[i].h) ? grid3 : compact(fitted);
  }
  function gridRows(grid3) {
    return grid3.reduce((m, c) => Math.max(m, c.y + c.h), 0);
  }
  function parseGrid(value, known) {
    if (!Array.isArray(value)) return null;
    const seen = /* @__PURE__ */ new Set();
    const cells = value.flatMap((v) => {
      if (!v || typeof v !== "object") return [];
      const { id, x, y, w, h } = v;
      if (typeof id !== "string" || !known.includes(id) || seen.has(id)) return [];
      if (![x, y, w, h].every((n) => typeof n === "number" && Number.isFinite(n))) return [];
      seen.add(id);
      return [clampCell({ id, x, y, w, h })];
    });
    return cells.length ? compact(cells) : null;
  }

  // src/layout/presets.ts
  var MODULE_IDS = [
    "chord",
    "staff",
    "analysis",
    "explain",
    "next",
    "cof",
    "guitar",
    "key",
    "piano",
    "velocity",
    "progressions",
    "ear",
    "player",
    "tuner",
    "metronome",
    "history",
    "song"
  ];
  var MODULE_SIZE = {
    chord: { w: 4, h: 3 },
    staff: { w: 4, h: 8 },
    analysis: { w: 3, h: 11 },
    explain: { w: 4, h: 11 },
    next: { w: 4, h: 8 },
    cof: { w: 3, h: 7 },
    guitar: { w: 3, h: 9 },
    key: { w: 12, h: 11 },
    piano: { w: 7, h: 5 },
    velocity: { w: 2, h: 5 },
    progressions: { w: 12, h: 4 },
    ear: { w: 6, h: 5 },
    player: { w: 6, h: 5 },
    tuner: { w: 3, h: 5 },
    metronome: { w: 6, h: 10 },
    history: { w: 12, h: 3 },
    song: { w: 12, h: 12 }
  };
  var PRESET_IDS = ["standard", "study", "class", "transcription", "recording"];
  var grid = (specs) => specs.map(([id, x, y, w, h]) => ({ id, x, y, w, h }));
  var PRESETS = {
    // Everything but Velocity and Next (in the layout menu): the chord as a header across the page, the four
    // diagrams under it, the key and its explanation, then the piano and the practice panels
    standard: grid([
      ["chord", 0, 0, 12, 3],
      ["staff", 0, 3, 3, 11],
      ["analysis", 3, 3, 3, 11],
      ["cof", 6, 3, 3, 11],
      ["guitar", 9, 3, 3, 11],
      ["key", 0, 14, 8, 12],
      ["explain", 8, 14, 4, 12],
      ["piano", 0, 26, 12, 5],
      ["progressions", 0, 31, 12, 4],
      ["ear", 0, 35, 4, 5],
      ["tuner", 4, 35, 3, 5],
      ["player", 7, 35, 5, 5],
      ["metronome", 0, 40, 12, 9],
      ["history", 0, 49, 12, 3],
      ["song", 0, 52, 12, 12]
    ]),
    // Harmony at the desk: the key and the analysis large, what is played next to them
    study: grid([
      ["chord", 0, 0, 4, 3],
      ["analysis", 4, 0, 4, 12],
      ["cof", 8, 0, 4, 8],
      ["staff", 0, 3, 4, 9],
      ["history", 8, 8, 4, 4],
      ["key", 0, 12, 8, 12],
      ["explain", 8, 12, 4, 12],
      ["piano", 0, 24, 12, 5],
      ["progressions", 0, 29, 12, 4],
      ["ear", 0, 33, 6, 5],
      ["next", 6, 33, 6, 5],
      ["metronome", 0, 38, 6, 10]
    ]),
    // Teaching on a projector (made to be presented with P): few panels, large; the history
    // under the chord shows where it came from, Next where it can go
    class: grid([
      ["chord", 0, 0, 12, 4],
      ["history", 0, 4, 12, 4],
      ["staff", 0, 8, 4, 10],
      ["cof", 4, 8, 4, 10],
      ["guitar", 8, 8, 4, 10],
      ["piano", 0, 18, 12, 6],
      ["next", 0, 24, 12, 4]
    ]),
    // Writing down a recording: the player on top, the song and the history in reach of what is heard
    transcription: grid([
      ["player", 0, 0, 9, 5],
      ["tuner", 9, 0, 3, 5],
      ["chord", 0, 5, 3, 3],
      ["staff", 0, 8, 3, 8],
      ["analysis", 3, 5, 3, 11],
      ["piano", 6, 5, 6, 5],
      ["guitar", 6, 10, 6, 6],
      ["history", 0, 16, 12, 3],
      ["song", 0, 19, 12, 14]
    ]),
    // On camera or screen capture: the chord and the instruments, no controls in view
    recording: grid([
      ["chord", 0, 0, 6, 4],
      ["staff", 6, 0, 6, 9],
      ["guitar", 0, 4, 6, 9],
      ["piano", 0, 13, 12, 6]
    ])
  };

  // src/metronome/panel.ts
  var KINDS = ["meter", "cycle", "clave", "euclid", "poly"];
  var METERS = ["2/4", "3/4", "4/4", "6/8", "7/8", "2+2+3/8"];
  var TRADITIONS = ["hindustani", "carnatic", "flamenco", "aksak"];
  var VIEWS = ["necklace", "pulses"];
  var RECENT_MAX = 4;
  var kind = getMetronome().mode.kind;
  var view = loadChoice("metronome-view", VIEWS, "necklace");
  var flash = loadBool("metronome-flash", true);
  var showCount = loadBool("metronome-count", true);
  var recent = loadJSON("metronome-recent", []);
  var draftEuclid = { pulses: 3, steps: 8 };
  var draftPoly = { a: 3, b: 2 };
  var meterText = (m) => m.kind === "meter" ? `${m.numerators.join("+")}/${m.denominator}` : "";
  var sameMode = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function modeLabel(m) {
    switch (m.kind) {
      case "meter":
        return meterText(m);
      case "cycle":
        return UMT.RHYTHMIC_CYCLES[m.id]?.name ?? m.id;
      case "clave":
        return UMT.CLAVE_PATTERNS[m.id]?.name ?? m.id;
      case "euclid":
        return `E(${m.pulses}, ${m.steps})`;
      case "poly":
        return `${m.a}:${m.b}`;
    }
  }
  function choose(mode4) {
    recent = [mode4, ...recent.filter((r) => !sameMode(r, mode4))].slice(0, RECENT_MAX);
    save("metronome-recent", recent);
    closePopover();
    setMetronome({ mode: mode4 });
  }
  var row2 = (attrs, label, on, hint2 = "", title = "") => `<button type="button" class="choice-row" ${attrs} aria-pressed="${on}"${title ? ` title="${escapeHtml(title)}"` : ""}>${escapeHtml(label)}${hint2 ? `<span class="choice-hint">${escapeHtml(hint2)}</span>` : ""}</button>`;
  var chip = (attrs, label, on, title = "") => `<button type="button" class="menu-chip" ${attrs} aria-pressed="${on}"${title ? ` title="${escapeHtml(title)}"` : ""}>${escapeHtml(label)}</button>`;
  var stepper = (field, value, label) => `<span class="metro-stepper" role="group" aria-label="${escapeHtml(label)}">
    <button type="button" class="size-ctrl-btn" data-step="${field}" data-dir="-1" aria-label="${escapeHtml(t("ctrl.smaller"))}">\u2212</button>
    <span class="metro-step-value" data-value="${field}">${value}</span>
    <button type="button" class="size-ctrl-btn" data-step="${field}" data-dir="1" aria-label="${escapeHtml(t("ctrl.larger"))}">+</button>
  </span>`;
  function options() {
    const m = getMetronome().mode;
    switch (kind) {
      case "meter":
        return `<input type="text" class="metro-meter" value="${escapeHtml(meterText(m) || "4/4")}" aria-label="${escapeHtml(t("metro.meter"))}" title="${escapeHtml(t("metro.meter.title"))}" spellcheck="false">
        <div class="menu-chips">${METERS.map((s) => chip(`data-meter="${s}"`, s, meterText(m) === s)).join("")}</div>`;
      case "cycle":
        return TRADITIONS.map((tr) => `<div class="choice-group">${escapeHtml(t(`metro.trad.${tr}`))}</div>` + Object.keys(UMT.RHYTHMIC_CYCLES).filter((id) => UMT.RHYTHMIC_CYCLES[id].tradition === tr).map((id) => {
          const c = UMT.RHYTHMIC_CYCLES[id];
          return row2(`data-cycle="${id}"`, c.name, m.kind === "cycle" && m.id === id, String(c.beats), `${c.groups.join("+")} \u2014 ${c.source}`);
        }).join("")).join("");
      case "clave":
        return Object.keys(UMT.CLAVE_PATTERNS).map((id) => row2(`data-clave="${id}"`, UMT.CLAVE_PATTERNS[id].name, m.kind === "clave" && m.id === id, "", UMT.CLAVE_PATTERNS[id].description)).join("");
      case "euclid":
        return `<div class="metro-draft">${stepper("pulses", draftEuclid.pulses, t("metro.euclid.k"))}<span class="metro-label">${escapeHtml(t("metro.euclid.k"))} ${escapeHtml(t("metro.euclid.in"))}</span>
        ${stepper("steps", draftEuclid.steps, t("metro.euclid.n"))}<span class="metro-label">${escapeHtml(t("metro.euclid.n"))}</span></div>
        <button type="button" class="song-btn song-btn-main" data-use="euclid">${escapeHtml(t("metro.use"))}</button>`;
      case "poly":
        return `<div class="metro-draft">${stepper("a", draftPoly.a, t("metro.poly.a"))}<span class="metro-label">:</span>${stepper("b", draftPoly.b, t("metro.poly.b"))}</div>
        <button type="button" class="song-btn song-btn-main" data-use="poly">${escapeHtml(t("metro.use"))}</button>`;
    }
  }
  function modeMenu() {
    const m = getMetronome().mode;
    const recents = recent.filter((r) => !sameMode(r, m));
    return `<div class="view-menu pop-menu metro-pop" role="dialog" aria-label="${escapeHtml(t("metro.kind"))}">
    ${recents.length ? `<div class="metro-recent"><span class="metro-label">${escapeHtml(t("metro.recent"))}</span>${recents.map((r, i) => chip(`data-recent="${i}"`, modeLabel(r), false)).join("")}</div>` : ""}
    <div class="metro-pop-cols">
      <div class="metro-kinds" role="group" aria-label="${escapeHtml(t("metro.kind"))}">${KINDS.map((k) => `<button type="button" class="choice-row${k === kind ? " active-mode" : ""}" data-kind="${k}">${escapeHtml(t(`metro.tab.${k}`))}</button>`).join("")}</div>
      <div class="metro-options">${options()}</div>
    </div>
  </div>`;
  }
  function subMenu() {
    const sub = getMetronome().sub;
    return `<div class="view-menu pop-menu metro-sub-pop" role="group" aria-label="${escapeHtml(t("metro.sub"))}">
    <div class="view-menu-title">${escapeHtml(t("metro.sub"))}</div>
    <div class="menu-chips">${[1, 2, 3, 4, 5, 6].map((n) => chip(`data-sub="${n}"`, String(n), sub === n, t("metro.sub.title", { n }))).join("")}</div>
  </div>`;
  }
  var pulseKind = (p, v, i) => p.clicks.find((c) => c.voice === v && c.pulse === i && c.kind !== "sub")?.kind ?? "rest";
  var firstCount = (p) => String(p.counts[0] ?? 1);
  function necklace(p) {
    const C = 120, R = [84, 52], arcR = 96, labelR = 108;
    const pos = (i, n, r) => {
      const a = (-90 + 360 * i / n) * Math.PI / 180;
      return [C + r * Math.cos(a), C + r * Math.sin(a)];
    };
    let svg = `<circle class="metro-halo" cx="${C}" cy="${C}" r="${arcR + 6}"/>`;
    let start = 0;
    const n0 = p.pulses[0];
    if (p.groups.length > 1) for (const g of p.groups) {
      const [x1, y1] = pos(start + 0.15, n0, arcR), [x2, y2] = pos(start + g - 0.15, n0, arcR);
      const large = g / n0 > 0.5 ? 1 : 0;
      svg += `<path class="metro-arc" d="M${x1.toFixed(1)},${y1.toFixed(1)} A${arcR},${arcR} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)}"/>`;
      start += g;
    }
    p.pulses.forEach((n, v) => {
      for (let i = 0; i < n; i++) {
        const k = pulseKind(p, v, i);
        const [x, y] = pos(i, n, R[v]);
        const r = k === "strong" ? 7 : k === "accent" || k === "poly" ? 6 : k === "rest" ? 3 : 5;
        svg += `<circle class="metro-dot metro-${k}" data-v="${v}" data-p="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`;
        if (v === 0 && n <= 24) {
          const [lx, ly] = pos(i, n, labelR);
          svg += `<text class="metro-count" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${p.counts[i]}</text>`;
        }
      }
    });
    if (showCount) svg += `<text class="metro-big" x="${C}" y="${C}" font-size="${p.pulses.length > 1 ? 40 : 64}">${firstCount(p)}</text>`;
    return `<svg class="metro-necklace" viewBox="0 0 240 240" role="img" aria-label="${escapeHtml(t("metro.necklace"))}">${svg}</svg>`;
  }
  function pulses(p) {
    const rowOf = (v) => {
      const n = p.pulses[v];
      const groups = v === 0 ? p.groups : [n];
      let i = 0;
      return `<div class="metro-row">${groups.map((g) => `<div class="metro-group">${Array.from({ length: g }, () => {
        const k = pulseKind(p, v, i);
        return `<div class="metro-block metro-${k}" data-v="${v}" data-p="${i++}"></div>`;
      }).join("")}</div>`).join("")}</div>`;
    };
    return `<div class="metro-pulses" role="img" aria-label="${escapeHtml(t("metro.pulsesView"))}">
    ${showCount ? `<div class="metro-big-html">${firstCount(p)}</div>` : ""}
    ${p.pulses.map((_, v) => rowOf(v)).join("")}
  </div>`;
  }
  var container = null;
  var frame = 0;
  var lastAt = -1;
  var flashTimer = null;
  function light() {
    cancelAnimationFrame(frame);
    if (!container) return;
    const now = currentClick();
    if (now && now.at !== lastAt) {
      lastAt = now.at;
      const { click: click2 } = now;
      const p = getPattern();
      container.querySelectorAll(".lit").forEach((d) => d.classList.remove("lit"));
      container.querySelectorAll(`.metro-viz [data-v="${click2.voice}"][data-p="${click2.pulse}"]`).forEach((d) => d.classList.add("lit"));
      if (click2.voice === 0 && click2.kind !== "sub") {
        const big = container.querySelector(".metro-big, .metro-big-html");
        if (big) {
          big.textContent = String(p.counts[click2.pulse] ?? click2.pulse + 1);
          big.classList.toggle("accent", click2.kind === "strong" || click2.kind === "accent");
        }
      }
      if (flash && (click2.kind === "strong" || click2.kind === "accent")) {
        const viz = container.querySelector(".metro-viz");
        viz?.classList.remove("flash-strong", "flash-accent");
        void viz?.offsetWidth;
        viz?.classList.add(click2.kind === "strong" ? "flash-strong" : "flash-accent");
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => viz?.classList.remove("flash-strong", "flash-accent"), 110);
      }
    }
    if (isMetronomeRunning()) frame = requestAnimationFrame(light);
    else {
      container.querySelectorAll(".lit").forEach((d) => d.classList.remove("lit"));
      lastAt = -1;
    }
  }
  function renderMetronome(el2) {
    container = el2;
    if (container.querySelector(".metro-pop.open, .metro-sub-pop.open") && [...container.querySelectorAll(".metro-pop, .metro-sub-pop")].some(isPopoverOpen)) closePopover();
    const s = getMetronome();
    const running2 = isMetronomeRunning();
    const splits = s.mode.kind === "meter" || s.mode.kind === "cycle" || s.mode.kind === "euclid";
    kind = s.mode.kind;
    if (s.mode.kind === "euclid") draftEuclid = { pulses: s.mode.pulses, steps: s.mode.steps };
    if (s.mode.kind === "poly") draftPoly = { a: s.mode.a, b: s.mode.b };
    el2.innerHTML = `
    <div class="metro-head">
      <button type="button" class="ctrl-btn metro-play" title="${escapeHtml(t(running2 ? "metro.stop" : "metro.start"))}" aria-label="${escapeHtml(t(running2 ? "metro.stop" : "metro.start"))}">${running2 ? "\u25A0" : "\u25B6"}</button>
      <span class="metro-tempo" role="group" aria-label="${escapeHtml(t("metro.tempo"))}">
        <button type="button" class="size-ctrl-btn" data-tempo="-1" aria-label="${escapeHtml(t("ctrl.smaller"))}">\u2212</button>
        <input type="number" class="metro-num" data-field="tempo" min="${TEMPO_MIN}" max="${TEMPO_MAX}" step="1" value="${s.tempo}" aria-label="${escapeHtml(t("metro.tempo"))}"><span class="metro-label">bpm</span>
        <button type="button" class="size-ctrl-btn" data-tempo="1" aria-label="${escapeHtml(t("ctrl.larger"))}">+</button>
      </span>
      <button type="button" class="ctrl-btn metro-tap" title="${escapeHtml(t("metro.tap.title"))}">${escapeHtml(t("metro.tap"))}</button>
      <span class="pop-anchor"><button type="button" class="ctrl-btn metro-mode" title="${escapeHtml(t("metro.kind"))}">${escapeHtml(modeLabel(s.mode))} \u25BE</button>${modeMenu()}</span>
      ${splits ? `<span class="pop-anchor"><button type="button" class="ctrl-btn metro-sub" title="${escapeHtml(t("metro.sub"))}">\u266A ${s.sub} \u25BE</button>${subMenu()}</span>` : ""}
      ${s.trainer.on ? `<span class="metro-now">${escapeHtml(t("metro.trainer.on", { max: s.trainer.max }))}</span>` : ""}
      <span class="strings-tabs metro-views" role="group" aria-label="${escapeHtml(t("metro.view"))}">${VIEWS.map((v) => `<button type="button" class="strings-tab" data-view="${v}" aria-pressed="${v === view}">${escapeHtml(t(`metro.view.${v}`))}</button>`).join("")}</span>
    </div>
    <div class="metro-viz${running2 ? " running" : ""}">${view === "necklace" ? necklace(getPattern()) : pulses(getPattern())}</div>`;
    el2.querySelector(".metro-play").addEventListener("click", () => isMetronomeRunning() ? stopMetronome() : startMetronome());
    el2.querySelector(".metro-tap").addEventListener("click", () => tap());
    el2.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
      view = b.dataset.view;
      save("metronome-view", view);
      renderMetronome(el2);
    }));
    el2.querySelectorAll("[data-tempo]").forEach((b) => b.addEventListener("click", () => setMetronome({ tempo: getMetronome().tempo + Number(b.dataset.tempo) })));
    el2.querySelector('.metro-num[data-field="tempo"]').addEventListener("change", (e) => setMetronome({ tempo: Number(e.target.value) || getMetronome().tempo }));
    const pop = el2.querySelector(".metro-pop");
    wirePopover(pop, [el2.querySelector(".metro-mode")]);
    wireModeMenu(pop);
    const subPop = el2.querySelector(".metro-sub-pop");
    if (subPop) {
      wirePopover(subPop, [el2.querySelector(".metro-sub")]);
      subPop.querySelectorAll("[data-sub]").forEach((b) => b.addEventListener("click", () => {
        closePopover();
        setMetronome({ sub: Number(b.dataset.sub) });
      }));
    }
    wireMenu();
    lastAt = -1;
    light();
  }
  function wireModeMenu(pop) {
    const column = pop.querySelector(".metro-options");
    const wireOptions = () => {
      column.innerHTML = options();
      column.querySelectorAll("[data-meter]").forEach((b) => b.addEventListener("click", () => {
        const m = parseMeter(b.dataset.meter);
        if (m) choose({ kind: "meter", ...m });
      }));
      column.querySelector(".metro-meter")?.addEventListener("change", (e) => {
        const input = e.target;
        const m = parseMeter(input.value);
        input.classList.toggle("invalid", !m);
        if (m) choose({ kind: "meter", ...m });
      });
      column.querySelectorAll("[data-cycle]").forEach((b) => b.addEventListener("click", () => choose({ kind: "cycle", id: b.dataset.cycle })));
      column.querySelectorAll("[data-clave]").forEach((b) => b.addEventListener("click", () => choose({ kind: "clave", id: b.dataset.clave })));
      column.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
        const field = b.dataset.step, dir = Number(b.dataset.dir);
        const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
        if (field === "pulses") draftEuclid.pulses = clamp(draftEuclid.pulses + dir, 0, draftEuclid.steps);
        if (field === "steps") {
          draftEuclid.steps = clamp(draftEuclid.steps + dir, 1, 32);
          draftEuclid.pulses = Math.min(draftEuclid.pulses, draftEuclid.steps);
        }
        if (field === "a") draftPoly.a = clamp(draftPoly.a + dir, 1, 12);
        if (field === "b") draftPoly.b = clamp(draftPoly.b + dir, 1, 12);
        column.querySelectorAll("[data-value]").forEach((v) => {
          v.textContent = String({ pulses: draftEuclid.pulses, steps: draftEuclid.steps, a: draftPoly.a, b: draftPoly.b }[v.dataset.value]);
        });
      }));
      column.querySelector('[data-use="euclid"]')?.addEventListener("click", () => choose({ kind: "euclid", ...draftEuclid }));
      column.querySelector('[data-use="poly"]')?.addEventListener("click", () => choose({ kind: "poly", ...draftPoly }));
    };
    pop.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => {
      kind = b.dataset.kind;
      pop.querySelectorAll("[data-kind]").forEach((k) => k.classList.toggle("active-mode", k === b));
      wireOptions();
    }));
    const others = recent.filter((r) => !sameMode(r, getMetronome().mode));
    pop.querySelectorAll("[data-recent]").forEach((b) => b.addEventListener("click", () => choose(others[Number(b.dataset.recent)])));
    wireOptions();
  }
  function wireMenu() {
    const menu = document.getElementById("menu-metronome");
    if (!menu || menu.dataset.wired) return;
    menu.dataset.wired = "1";
    const tr = getMetronome().trainer;
    const on = menu.querySelector("#btn-metro-trainer");
    on?.setAttribute("aria-pressed", String(tr.on));
    on?.addEventListener("click", () => {
      const now = !getMetronome().trainer.on;
      setMetronome({ trainer: { ...getMetronome().trainer, on: now } });
      on.setAttribute("aria-pressed", String(now));
    });
    const count = menu.querySelector("#btn-metro-count");
    count?.setAttribute("aria-pressed", String(showCount));
    count?.addEventListener("click", () => {
      showCount = !showCount;
      save("metronome-count", showCount);
      count.setAttribute("aria-pressed", String(showCount));
      if (container) renderMetronome(container);
    });
    const fl = menu.querySelector("#btn-metro-flash");
    fl?.setAttribute("aria-pressed", String(flash));
    fl?.addEventListener("click", () => {
      flash = !flash;
      save("metronome-flash", flash);
      fl.setAttribute("aria-pressed", String(flash));
    });
    menu.querySelectorAll("input[data-trainer]").forEach((i) => {
      i.value = String(tr[i.dataset.trainer]);
      i.addEventListener("change", () => setMetronome({ trainer: { ...getMetronome().trainer, [i.dataset.trainer]: Math.max(1, Number(i.value) || 1) } }));
    });
  }
  function metronomeMenuHtml() {
    const field = (name, label, unit) => `<label class="menu-row metro-trainer-row"><span class="menu-label">${escapeHtml(label)}</span><input type="number" class="metro-num" data-trainer="${name}" min="1" max="${TEMPO_MAX}" step="1"><span class="metro-label">${escapeHtml(unit)}</span></label>`;
    return `<button type="button" id="btn-metro-count" class="menu-item" aria-pressed="true" title="${escapeHtml(t("metro.count.title"))}"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${escapeHtml(t("metro.count"))}</span></button>
    <button type="button" id="btn-metro-flash" class="menu-item" aria-pressed="true" title="${escapeHtml(t("metro.flash.title"))}"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${escapeHtml(t("metro.flash"))}</span></button>
    <div class="menu-sep"></div>
    <button type="button" id="btn-metro-trainer" class="menu-item" aria-pressed="false" title="${escapeHtml(t("metro.trainer.title"))}"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${escapeHtml(t("metro.trainer"))}</span></button>
    ${field("step", t("metro.trainer.step"), "bpm")}${field("every", t("metro.trainer.every"), t("metro.trainer.cycles"))}${field("max", t("metro.trainer.max"), "bpm")}`;
  }
  setMetronomeChangeCallback(() => {
    if (container?.isConnected) renderMetronome(container);
  });

  // src/ui/layout.ts
  var viewLabel = (v) => t(`view.${v}`);
  var $ = (id) => document.getElementById(id);
  function loadPanels() {
    return { guitarControls: loadBool("panel-guitarControls", true) };
  }
  var grid2 = parseGrid(loadJSON("layout", null), MODULE_IDS) ?? PRESETS.standard;
  var savedLayouts = loadSavedLayouts();
  var layoutListeners = [];
  function loadSavedLayouts() {
    const raw = loadJSON("layouts", {});
    const out = {};
    if (raw && typeof raw === "object") {
      for (const [name, value] of Object.entries(raw)) {
        const g = parseGrid(value, MODULE_IDS);
        if (g && name.trim()) out[name] = g;
      }
    }
    return out;
  }
  function currentGrid() {
    return grid2;
  }
  function isModuleShown(id) {
    return grid2.some((c) => c.id === id);
  }
  function onLayoutChange(f) {
    layoutListeners.push(f);
  }
  function setGrid(next, persist = true) {
    grid2 = next;
    applyGrid();
    if (persist) save("layout", grid2);
    layoutListeners.forEach((f) => f());
  }
  function applyPreset(id) {
    setGrid(PRESETS[id].map((c) => ({ ...c })));
  }
  function showModule(id, shown) {
    if (shown === isModuleShown(id)) return;
    setGrid(shown ? addCell(grid2, { id, x: 0, ...MODULE_SIZE[id] }) : removeCell(grid2, id));
  }
  function renderLayout(_panels, fieldsVisible) {
    $("app").innerHTML = buildToolbar() + '<div class="workspace">' + buildRail() + `<div class="work-main"><div id="midi-banner"></div><main id="grid" class="grid" aria-label="${t("a11y.panels")}">${MODULE_IDS.map((id) => moduleFrame(id, fieldsVisible)).join("")}</main></div></div>` + buildTabbar() + buildSettings();
    applyGrid();
    wireGrid();
    wireLayoutMenu();
    wirePanelMenus();
    watchFittedDiagrams();
    watchFittedPanels();
  }
  function wirePanelToggles(panels) {
    document.querySelectorAll(".menu-item[data-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.dataset.panel;
        panels[panel] = !panels[panel];
        save(`panel-${panel}`, panels[panel]);
        applyPanelVisibility(panels);
      });
    });
  }
  function applyPanelVisibility(panels) {
    setGuitarControlsVisible(panels.guitarControls);
    document.getElementById("guitar-container")?.classList.toggle("strings-bare", !panels.guitarControls);
    document.querySelector('.menu-item[data-panel="guitarControls"]')?.setAttribute("aria-pressed", String(panels.guitarControls));
  }
  function wirePanelMenus() {
    let open2 = null;
    const close = (focus = false) => {
      if (!open2) return;
      open2.menu.hidden = true;
      open2.btn.setAttribute("aria-expanded", "false");
      open2.btn.closest(".module")?.classList.remove("module-menu-open");
      if (focus) open2.btn.focus();
      open2 = null;
    };
    document.addEventListener("click", (e) => {
      const target = e.target;
      const btn = target.closest(".module-more");
      if (btn) {
        const was = open2?.btn === btn;
        close();
        if (was) return;
        const menu = $(`menu-${btn.dataset.menu}`);
        menu.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        btn.closest(".module")?.classList.add("module-menu-open");
        open2 = { btn, menu };
        return;
      }
      if (open2 && !e.composedPath().includes(open2.menu)) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open2) {
        e.stopPropagation();
        close(true);
      }
    }, true);
  }
  function buildToolbar() {
    return `
    <div id="z1-toolbar" class="toolbar" role="toolbar" aria-label="${t("a11y.toolbar")}">
      <button id="btn-rail" class="ctrl-btn icon-btn ghost" title="${t("rail.title")}" aria-controls="rail">${ICONS.rail}</button>
      <span class="brand" title="Modus">${LOGO}<span class="brand-name">modus</span></span>
      <div class="pop-anchor">
        <button id="btn-key" class="key-btn" title="${t("key.menu.title")}"><span id="key-btn-name"></span><span id="key-btn-auto" class="key-btn-auto"></span></button>
      </div>
      <div class="tb-search pop-anchor">
        ${ICONS.search}
        <input id="typed-chord" class="typed-chord" placeholder="${t("typed.placeholder")}" title="${t("typed.title")}" autocomplete="off" spellcheck="false"
          role="combobox" aria-expanded="false" aria-controls="cmd-results" aria-autocomplete="list">
        <kbd class="tb-kbd" aria-hidden="true">/</kbd>
        <div id="cmd-results" class="cmd-results" role="listbox" aria-label="${t("cmd.results")}" hidden></div>
      </div>
      <div class="tb-status">
        <div class="pop-anchor pop-end">
          <button id="btn-input-status" class="status-btn" title="${t("a11y.group.input")}"><span id="midi-status" class="midi-status">MIDI</span><span id="mode-status" class="status-sub"></span></button>
        </div>
        <div class="pop-anchor pop-end">
          <button id="btn-sound-status" class="status-btn" title="${t("a11y.group.sound")}"><span id="sound-status" class="sound-status"></span></button>
        </div>
        <button id="btn-settings" class="ctrl-btn icon-btn ghost" title="${t("set.title.button")}" aria-haspopup="dialog">${ICONS.settings}</button>
        <button id="btn-help" class="ctrl-btn icon-btn ghost help-q" title="${t("help.title")}">?</button>
      </div>
    </div>`;
  }
  function buildRail() {
    return `
    <div class="rail-col">
      <nav id="rail" class="rail" aria-label="${t("a11y.rail")}">
        <button id="rail-input" class="rail-btn" title="${t("a11y.group.input")}">${ICONS.midi}<span id="rail-midi-dot" class="rail-dot"></span></button>
        <button id="rail-sound" class="rail-btn" title="${t("a11y.group.sound")}">${ICONS.sound}</button>
        <button id="btn-keyboard" class="rail-btn" data-act="keyboard" title="${t("keyboard.title")}">${ICONS.keyboard}</button>
        <button id="btn-mic" class="rail-btn" data-act="mic" title="${t("mic.title")}">${ICONS.mic}</button>
        <span class="rail-sep" aria-hidden="true"></span>
        <button id="btn-layout" class="rail-btn" title="${t("layout.title")}">${ICONS.layout}</button>
        <button id="btn-present" class="rail-btn" title="${t("present.title")}">${ICONS.present}</button>
        <button id="btn-views" class="rail-btn" title="${t("views.title")}">${ICONS.views}</button>
        ${buildMenus()}
      </nav>
    </div>`;
  }
  function buildTabbar() {
    const tab = (id, icon, label, attrs = "") => `<button id="${id}" class="tab-btn"${attrs}>${icon}<span class="tab-label">${escapeHtml(label)}</span></button>`;
    return `
    <nav id="tabbar" class="tabbar" aria-label="${t("a11y.tabbar")}">
      ${tab("tab-input", ICONS.midi, t("tab.input"))}
      ${tab("tab-sound", ICONS.sound, t("tab.sound"))}
      ${tab("tab-mic", ICONS.mic, t("tab.mic"), ' data-act="mic"')}
      ${tab("tab-layout", ICONS.layout, t("tab.panels"))}
      ${tab("tab-more", ICONS.more, t("tab.more"))}
    </nav>`;
  }
  function buildMenus() {
    return `
    <div id="input-menu" class="view-menu pop-menu" role="group" aria-label="${t("a11y.group.input")}">
      <div class="view-menu-title">${t("input.playWith")}</div>
      <select id="midi-device" class="ctrl-select" hidden aria-label="${t("a11y.midiDevice")}"></select>
      <div id="midi-device-list" class="choice-list" role="group" aria-label="${t("a11y.midiDevice")}"></div>
      <button id="menu-keyboard" class="choice-row" data-act="keyboard" title="${t("keyboard.title")}">${ICONS.keyboard}<span>${t("input.keyboard")}</span><span id="keyboard-status" class="choice-hint"></span></button>
      <button id="menu-mic" class="choice-row" data-act="mic" title="${t("mic.title")}">${ICONS.mic}<span>${t("input.mic")}</span></button>
      <div class="view-menu-title">${t("a11y.group.mode")}</div>
      <div class="seg seg-full" role="group" aria-label="${t("a11y.group.mode")}">
        <button id="btn-normal" class="mode-btn" data-mode="normal" title="${t("mode.normal.title")}">${t("mode.normal")}</button>
        <button id="btn-hold" class="mode-btn" data-mode="hold" title="${t("mode.hold.title")}">${t("mode.hold")}</button>
        <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio" title="${t("mode.arpeggio.title")}">${t("mode.arpeggio")}</button>
      </div>
      <div id="mode-hint" class="view-menu-hint"></div>
    </div>
    <div id="sound-menu" class="view-menu pop-menu sound-menu" role="group" aria-label="${t("a11y.group.sound")}">
      <div class="sound-row">
        <button id="btn-play-chord" class="play-btn" title="${t("audio.play.title")}">${ICONS.play}</button>
        <input id="audio-volume" type="range" min="0" max="1" step="0.05" value="${getVolume()}" title="${t("audio.volume.title")}" aria-label="${t("audio.volume.title")}" class="volume-slider">
        <span id="volume-value" class="choice-hint"></span>
      </div>
      <div id="audio-progress" class="audio-progress" title="${t("audio.title")}">
        <div id="audio-progress-fill" class="audio-progress-fill"></div>
        <span id="audio-status" class="audio-status">${t("audio.idle")}</span>
      </div>
      <input id="instrument-filter" class="ctrl-select" placeholder="${t("sound.filter")}" aria-label="${t("sound.filter")}" autocomplete="off" spellcheck="false">
      <select id="audio-instrument" hidden title="${t("audio.instrument.title")}">
        ${GM_INSTRUMENT_GROUPS.map(
      (g) => `<optgroup label="${t(g.label)}">${g.instruments.map(
        (i) => `<option value="${i}"${i === getCurrentInstrument() ? " selected" : ""}>${escapeHtml(instrumentLabel(i))}</option>`
      ).join("")}</optgroup>`
    ).join("")}
      </select>
      <div id="instrument-list" class="choice-list choice-scroll" role="group" aria-label="${t("audio.instrument.title")}"></div>
    </div>
    <div id="key-menu" class="view-menu pop-menu key-menu" role="group" aria-label="${t("a11y.key")}">
      <select id="key-select" hidden aria-label="${t("a11y.key")}">
        <option value="">${t("key.auto")}</option>
        ${ALL_KEYS.map((k) => `<option value="${k}">${keyLabel(k)}</option>`).join("")}
      </select>
      <div class="key-menu-top">
        <button id="key-auto" class="choice-chip" title="${t("key.auto.title")}">${t("key.autoShort")}</button>
        <span id="auto-key-label" class="auto-key-label"></span>
      </div>
      <div class="seg" role="group" aria-label="${t("a11y.key")}">
        <button class="mode-btn" data-keymode="major">${t("key.majorCap")}</button>
        <button class="mode-btn" data-keymode="minor">${t("key.minorCap")}</button>
      </div>
      <div class="key-modes" role="group" aria-label="${t("key.modes")}">
        ${CHURCH_MODES.map((m) => `<button class="choice-chip" data-keymode="${m.toLowerCase()}" title="${escapeHtml(t("key.mode.title", { mode: t(`key.mode.${m.toLowerCase()}`) }))}">${t(`key.mode.${m.toLowerCase()}`)}</button>`).join("")}
      </div>
      <div id="key-grid" class="key-pick-grid"></div>
      <div class="view-menu-hint">${t("key.menu.hint")}</div>
    </div>
    <div id="layout-menu" class="view-menu pop-menu"></div>
    <div id="more-menu" class="view-menu pop-menu">
      <button id="more-present" class="choice-row">${ICONS.present}<span>${t("tab.present")}</span></button>
      <div class="view-menu-title">${t("views.save")}</div>
      ${exportRows()}
    </div>
    <div id="view-menu" class="view-menu pop-menu">
      <div class="view-menu-title">${t("views.open")}</div>
      ${VIEW_NAMES.map((v) => `<button class="ctrl-btn" data-view="${v}">${viewLabel(v)}</button>`).join("")}
      <label class="view-menu-bg">${t("views.background")}
        <select id="view-bg" class="ctrl-select">
          ${Object.keys(VIEW_BACKGROUNDS).map((b) => `<option value="${b}">${t(`views.bg.${b}`)}</option>`).join("")}
        </select>
      </label>
      <div class="view-menu-hint">${t("views.hint")}</div>
      <div class="view-menu-title">${t("views.save")}</div>
      ${exportRows()}
    </div>`;
  }
  var exportRows = () => ["staff", "cof", "guitar", "piano"].map((v) => `
  <div class="view-menu-export"><span>${viewLabel(v)}</span>
    <button class="ctrl-btn" data-export="${v}" data-format="svg">SVG</button>
    <button class="ctrl-btn" data-export="${v}" data-format="png">PNG</button>
  </div>`).join("");
  var item = (id, label, title = "", on) => `<button type="button" id="${id}" class="menu-item"${on !== void 0 ? ` aria-pressed="${on}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${escapeHtml(label)}</span></button>`;
  var steps = (minus, plus) => `<div class="menu-row"><span class="menu-label">${t("menu.size")}</span>
    <button type="button" id="${minus}" class="menu-step" title="${t("ctrl.smaller")}">\u2212</button>
    <button type="button" id="${plus}" class="menu-step" title="${t("ctrl.larger")}">+</button></div>`;
  var heading = (text) => `<div class="menu-heading">${escapeHtml(text)}</div>`;
  function panelMenu(id, fieldsVisible) {
    const own = ownMenu(id, fieldsVisible);
    const prefs = prefMenuHtml(id);
    return own && prefs ? `${own}<div class="menu-sep"></div>${prefs}` : own || prefs;
  }
  function ownMenu(id, fieldsVisible) {
    switch (id) {
      case "staff":
        return `
      ${heading(t("menu.clef"))}
      <div class="menu-chips" role="group" aria-label="${t("menu.clef")}" title="${t("staff.clef.title")}">${STAFF_CLEFS.map((c) => `<button type="button" class="menu-chip" data-clef="${c}" data-label="${escapeHtml(`${t("menu.clef")}: ${t(`staff.clef.${c}`)}`)}" aria-pressed="false">${t(`staff.clef.${c}`)}</button>`).join("")}</div>
      ${item("btn-staff-prev", t("menu.prev"), t("staff.prev.title"))}`;
      case "piano":
        return item("btn-piano-prev", t("menu.prev"), t("piano.prev.title"));
      case "analysis":
        return `
      ${steps("btn-analysis-minus", "btn-analysis-plus")}
      ${heading(t("menu.fields"))}
      <div class="menu-grid">${ANALYSIS_FIELD_KEYS.map(
          (f) => `<button type="button" id="btn-field-${f}" class="menu-item${fieldsVisible[f] ? " active" : ""}" aria-pressed="${fieldsVisible[f]}" data-label="${escapeHtml(fieldLabel(f))}"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${escapeHtml(fieldTooltip(f))}</span></button>`
        ).join("")}</div>`;
      case "cof":
        return `
      ${item("btn-cof-flat", t("menu.flat"), t("cof.flat.title"))}
      ${item("btn-cof-sharp", t("menu.sharp"), t("cof.sharp.title"))}
      <div class="menu-sep"></div>
      ${item("btn-cof-minor", t("menu.minor"), t("cof.minor.title"))}
      ${item("btn-cof-deg", t("menu.degrees"), t("cof.degrees.title"))}
      ${item("btn-cof-7", t("menu.sevenths"), t("cof.sevenths.title"))}`;
      case "key":
        return `
      ${steps("btn-key-minus", "btn-key-plus")}
      ${item("btn-key-7", t("menu.sevenths"), t("keyPanel.sevenths.title"))}
      ${item("btn-key-neg", t("menu.negative"), t("keyPanel.neg.title"))}
      ${item("btn-key-par", t("menu.parallel"), t("keyPanel.par.title"))}
      ${item("btn-key-usual", t("menu.usualBorrowings"), t("keyPanel.usual.title"))}
      ${item("btn-key-colt", t("menu.coltrane"), t("keyPanel.colt.title"))}`;
      case "metronome":
        return metronomeMenuHtml();
      case "guitar":
        return `<div id="strings-menu"></div><div class="menu-sep"></div><button type="button" class="menu-item" data-panel="guitarControls"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${t("menu.controls")}</span></button>`;
      default:
        return "";
    }
  }
  function moduleBody(id) {
    switch (id) {
      case "chord":
        return '<div id="chord-summary"></div>';
      case "staff":
        return '<div id="staff-container" class="fit"></div>';
      case "analysis":
        return '<div id="analysis-content"></div>';
      case "cof":
        return '<div id="cof-container" class="fit"></div>';
      case "guitar":
        return '<div id="guitar-container"></div>';
      case "key":
        return '<div id="key-container"></div>';
      case "explain":
        return '<div id="explain-container"></div>';
      case "next":
        return '<div id="next-container"></div>';
      case "metronome":
        return '<div id="metronome-container"></div>';
      case "progressions":
        return '<div id="progressions-container"></div>';
      case "ear":
        return '<div id="ear-container"></div>';
      case "player":
        return '<div id="player-container"></div>';
      case "tuner":
        return '<div id="tuner-container"></div>';
      case "piano":
        return '<div id="piano-container" class="fit"></div>';
      case "velocity":
        return '<div id="velocity-container"></div>';
      case "history":
        return '<div id="zone2-content"></div>';
      case "song":
        return '<div id="zone3-content"></div>';
    }
  }
  function moduleFrame(id, fieldsVisible) {
    const menu = panelMenu(id, fieldsVisible);
    return `
    <section id="mod-${id}" class="module module-${id}" data-module="${id}" aria-labelledby="mod-${id}-title">
      <header class="module-header" title="${t("module.drag")}" tabindex="0" aria-label="${t("a11y.panelKeys", { name: t(`module.${id}`) })}">
        <span class="module-title" id="mod-${id}-title">${t(`module.${id}`)}</span>
        ${menu ? `<button class="module-more" data-menu="${id}" title="${t("menu.options")}" aria-haspopup="true" aria-expanded="false" aria-controls="menu-${id}">${ICONS.more}</button>` : ""}
        <button class="module-close" data-close="${id}" title="${t("module.hide")}">\xD7</button>
      </header>
      ${menu ? `<div id="menu-${id}" class="module-menu" role="group" aria-label="${t("menu.optionsOf", { name: t(`module.${id}`) })}" hidden>${menu}</div>` : ""}
      <div class="module-body">${moduleBody(id)}</div>
      <div class="module-resize" title="${t("module.resize")}"></div>
    </section>`;
  }
  var byPosition2 = (a, b) => a.y - b.y || a.x - b.x;
  var FITTED = ["key", "explain", "history", "song", "tuner", "progressions", "ear", "next"];
  var contentRows = {};
  var dragging = false;
  function shownGrid() {
    return dragging || document.body.classList.contains("presenting") ? grid2 : fitGrid(grid2, contentRows);
  }
  function refreshLayout() {
    applyGrid();
  }
  function applyGrid() {
    const shown = shownGrid();
    const order = [...shown].sort(byPosition2).map((c) => c.id);
    for (const id of MODULE_IDS) {
      const el2 = document.getElementById(`mod-${id}`);
      if (!el2) continue;
      const c = shown.find((cell) => cell.id === id);
      el2.classList.toggle("module-hidden", !c);
      if (!c) continue;
      el2.style.gridColumn = `${c.x + 1} / span ${c.w}`;
      el2.style.gridRow = `${c.y + 1} / span ${c.h}`;
      el2.style.order = String(order.indexOf(id));
      el2.style.setProperty("--h", String(c.h));
    }
    renderLayoutMenu();
  }
  var narrow = () => matchMedia("(max-width: 720px)").matches;
  function wireGrid() {
    const gridEl = $("grid");
    gridEl.addEventListener("keydown", (e) => {
      const header = e.target;
      if (!header.classList?.contains("module-header") || !e.key.startsWith("Arrow") || narrow()) return;
      const id = header.closest(".module").dataset.module;
      const cell = grid2.find((c) => c.id === id);
      if (!cell) return;
      e.preventDefault();
      const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      const next = e.shiftKey ? { ...cell, w: cell.w + dx, h: cell.h + dy } : { ...cell, x: cell.x + dx, y: cell.y + dy };
      setGrid(placeCell(grid2, next), true);
      const now = grid2.find((c) => c.id === id);
      announce(t("a11y.moved", { name: t(`module.${id}`), x: now.x + 1, y: now.y + 1, w: now.w, h: now.h }), 0);
    });
    gridEl.addEventListener("click", (e) => {
      const close = e.target.closest("[data-close]");
      if (close) showModule(close.dataset.close, false);
    });
    gridEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || narrow() || document.body.classList.contains("presenting")) return;
      const target = e.target;
      const resize = target.closest(".module-resize");
      const header = target.closest(".module-header");
      if (!resize && (!header || target.closest("button, select, input"))) return;
      const el2 = target.closest(".module");
      const start = grid2.find((c) => c.id === el2.dataset.module);
      if (!start) return;
      e.preventDefault();
      const handle = resize ?? header;
      handle.setPointerCapture(e.pointerId);
      const cs = getComputedStyle(gridEl);
      const gap = parseFloat(cs.columnGap) || 0;
      const inner = gridEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const stepX = (inner - gap * (COLS - 1)) / COLS + gap;
      const stepY = (parseFloat(cs.gridAutoRows) || 30) + (parseFloat(cs.rowGap) || 0);
      const base = grid2;
      let last = `${start.x},${start.y},${start.w},${start.h}`;
      el2.classList.add("module-moving");
      const move = (ev) => {
        const dx = Math.round((ev.clientX - e.clientX) / stepX);
        const dy = Math.round((ev.clientY - e.clientY) / stepY);
        const cell = resize ? { ...start, w: start.w + dx, h: start.h + dy } : { ...start, x: start.x + dx, y: start.y + dy };
        const sig = `${cell.x},${cell.y},${cell.w},${cell.h}`;
        if (sig === last) return;
        last = sig;
        dragging = true;
        setGrid(placeCell(base, cell), false);
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        el2.classList.remove("module-moving");
        if (dragging) {
          dragging = false;
          applyGrid();
          save("layout", grid2);
        }
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }
  function watchFittedDiagrams() {
    const fitAll = (el2) => {
      el2.style.height = "";
      const svgs = el2.id === "guitar-container" ? el2.querySelectorAll(".strings-drawing svg") : el2.querySelectorAll(":scope > svg");
      svgs.forEach((svg) => fitSvg(svg, el2.id === "staff-container"));
    };
    const containers = [...document.querySelectorAll(".fit, #guitar-container")];
    const observer = new MutationObserver((records) => {
      const touched = new Set(records.map((r) => r.target.closest(".fit, #guitar-container")));
      touched.forEach((el2) => el2 && fitAll(el2));
    });
    containers.forEach((el2) => observer.observe(el2, { childList: true, subtree: true }));
  }
  function measureContentRows() {
    const cs = getComputedStyle($("grid"));
    const row3 = parseFloat(cs.gridAutoRows) || 30;
    const gap = parseFloat(cs.rowGap) || 0;
    const out = {};
    for (const id of FITTED) {
      const el2 = document.getElementById(`mod-${id}`);
      if (!el2 || el2.classList.contains("module-hidden")) continue;
      const body = el2.querySelector(".module-body");
      const bs = getComputedStyle(body);
      const kids = [...body.children];
      const content = kids.reduce((s, k) => s + k.scrollHeight, 0) + (parseFloat(bs.rowGap) || 0) * Math.max(0, kids.length - 1);
      const px = el2.querySelector(".module-header").offsetHeight + parseFloat(bs.paddingTop) + parseFloat(bs.paddingBottom) + content;
      out[id] = (px + gap) / (row3 + gap);
    }
    return out;
  }
  function watchFittedPanels() {
    let queued = false;
    const refit = () => {
      queued = false;
      if (dragging || document.body.classList.contains("presenting")) return;
      const before = fitGrid(grid2, contentRows);
      contentRows = measureContentRows();
      const after = fitGrid(grid2, contentRows);
      if (after.some((c, i) => c.y !== before[i]?.y || c.h !== before[i]?.h) || after.length !== before.length) applyGrid();
    };
    const schedule2 = () => {
      if (!queued) {
        queued = true;
        setTimeout(refit);
      }
    };
    const mutations = new MutationObserver(schedule2);
    const sizes = new ResizeObserver(schedule2);
    for (const id of FITTED) {
      const body = document.querySelector(`#mod-${id} .module-body`);
      if (!body) continue;
      mutations.observe(body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden", "style"] });
      sizes.observe(body);
    }
    onLayoutChange(schedule2);
    schedule2();
  }
  function renderLayoutMenu() {
    const menu = document.getElementById("layout-menu");
    if (!menu) return;
    const names = Object.keys(savedLayouts).sort((a, b) => a.localeCompare(b));
    menu.innerHTML = `
    <div class="view-menu-title">${t("layout.presets")}</div>
    <div class="layout-presets">
      ${PRESET_IDS.map((p) => `<button class="ctrl-btn" data-preset="${p}" title="${t(`layout.preset.${p}.title`)}">${t(`layout.preset.${p}`)}</button>`).join("")}
    </div>
    ${names.length ? `<div class="view-menu-title">${t("layout.saved")}</div>` : ""}
    ${names.map((n) => `
      <div class="layout-saved-row">
        <button class="ctrl-btn" data-saved="${escapeHtml(n)}">${escapeHtml(n)}</button>
        <button class="ctrl-btn" data-delete="${escapeHtml(n)}" title="${t("layout.delete")}">\xD7</button>
      </div>`).join("")}
    <div class="layout-save-row">
      <input id="layout-name" class="ctrl-select" placeholder="${t("layout.name")}" maxlength="40">
      <button id="layout-save" class="ctrl-btn">${t("layout.save")}</button>
    </div>
    <div class="view-menu-title">${t("layout.panels")}</div>
    <div class="layout-modules">
      ${MODULE_IDS.map((id) => `
        <label class="layout-module"><input type="checkbox" data-module="${id}"${isModuleShown(id) ? " checked" : ""}> ${t(`module.${id}`)}</label>`).join("")}
    </div>
    <div class="view-menu-hint">${t("layout.hint")}</div>`;
  }
  function wireLayoutMenu() {
    const menu = $("layout-menu");
    wirePopover(menu, [$("btn-layout"), $("tab-layout")]);
    menu.addEventListener("click", (e) => {
      e.stopPropagation();
      const el2 = e.target;
      const preset = el2.closest("[data-preset]")?.dataset.preset;
      const saved = el2.closest("[data-saved]")?.dataset.saved;
      const del = el2.closest("[data-delete]")?.dataset.delete;
      if (preset) applyPreset(preset);
      else if (saved !== void 0 && savedLayouts[saved]) setGrid(savedLayouts[saved].map((c) => ({ ...c })));
      else if (del !== void 0) {
        delete savedLayouts[del];
        save("layouts", savedLayouts);
        renderLayoutMenu();
      } else if (el2.id === "layout-save") saveCurrentAs();
    });
    menu.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.id === "layout-name") saveCurrentAs();
    });
    menu.addEventListener("change", (e) => {
      const box = e.target.closest("input[data-module]");
      if (box) showModule(box.dataset.module, box.checked);
    });
  }
  function layoutCommands() {
    const hint2 = t("layout.presets");
    return [
      ...PRESET_IDS.map((p) => ({ label: t("cmd.layout", { name: t(`layout.preset.${p}`) }), hint: hint2, run: () => applyPreset(p) })),
      ...Object.keys(savedLayouts).map((n) => ({ label: t("cmd.layout", { name: n }), hint: hint2, run: () => setGrid(savedLayouts[n].map((c) => ({ ...c }))) })),
      ...MODULE_IDS.map((id) => {
        const shown = isModuleShown(id);
        const name = t(`module.${id}`);
        return { label: t(shown ? "cmd.hide" : "cmd.show", { name }), hint: t("layout.panels"), run: () => showModule(id, !shown) };
      })
    ];
  }
  function panelMenuCommands() {
    return grid2.flatMap(({ id }) => {
      const menu = document.getElementById(`menu-${id}`);
      if (!menu) return [];
      const panel = t(`module.${id}`);
      return [...menu.querySelectorAll(".menu-item, .menu-step, .menu-chip")].map((el2) => {
        const text = el2.classList.contains("menu-step") ? `${t("menu.size")} ${el2.textContent}` : el2.dataset.label ?? (el2.querySelector(".menu-label") ?? el2).textContent ?? "";
        return { label: `${panel}: ${text.trim()}`, hint: el2.getAttribute("aria-pressed") === "true" ? t("cmd.on") : t("cmd.menu"), run: () => el2.click() };
      });
    });
  }
  function saveCurrentAs() {
    const input = document.getElementById("layout-name");
    const name = input?.value.trim();
    if (!name) {
      input?.classList.add("invalid");
      return;
    }
    savedLayouts[name] = grid2.map((c) => ({ ...c }));
    save("layouts", savedLayouts);
    renderLayoutMenu();
  }

  // src/view/presentation.ts
  var presenting = false;
  var onClose = () => {
  };
  function isPresenting() {
    return presenting;
  }
  function fitRows() {
    const gridEl = document.getElementById("grid");
    if (!gridEl) return;
    if (!presenting) {
      gridEl.style.removeProperty("--row");
      return;
    }
    const cs = getComputedStyle(gridEl);
    const rows = Math.max(1, gridRows(currentGrid()));
    const gap = parseFloat(cs.rowGap) || 0;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    gridEl.style.setProperty("--row", `${Math.max(4, (window.innerHeight - pad - gap * (rows - 1)) / rows)}px`);
  }
  onLayoutChange(fitRows);
  window.addEventListener("resize", fitRows);
  function openPresentation(close) {
    if (presenting) return;
    presenting = true;
    onClose = close;
    document.body.classList.add("presenting");
    refreshLayout();
    fitRows();
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.documentElement.requestFullscreen?.().then(fitRows, () => {
    });
  }
  function closePresentation() {
    if (!presenting) return;
    presenting = false;
    document.body.classList.remove("presenting");
    refreshLayout();
    fitRows();
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {
    });
    onClose();
  }
  function onFullscreenChange() {
    if (!document.fullscreenElement) closePresentation();
    else fitRows();
  }

  // src/diagrams/piano.ts
  var isNarrow = () => typeof matchMedia !== "undefined" && matchMedia("(max-width: 720px)").matches;
  var OCTAVE_W = 196;
  var EDGE_W = 20;
  var PIANO_H = 223;
  var MIN_OCTAVES = 2;
  var MAX_OCTAVES = 7;
  function pianoOctaves(width, height, narrow2) {
    if (narrow2) return MIN_OCTAVES;
    if (!width || !height) return 4;
    const fit = Math.floor((width * PIANO_H / height - EDGE_W) / OCTAVE_W);
    return Math.max(MIN_OCTAVES, Math.min(MAX_OCTAVES, fit));
  }
  function pianoRange(noteNames, octaves) {
    const from = 4 - Math.floor(octaves / 2), to = from + octaves - 1;
    const played2 = noteNames.map(noteNameToMidi).filter((m) => m !== null).map((m) => Math.floor(m / 12) - 1);
    const low = Math.min(from, ...played2), high = Math.max(to, ...played2);
    return { from: `C${Math.max(0, low)}`, to: `B${Math.min(8, high)}` };
  }
  var containerOctaves = (el2) => pianoOctaves(el2.clientWidth, el2.clientHeight, isNarrow());
  function renderPiano(container2, noteNames, fn, onPress, prevNotes = null) {
    const color2 = functionColor(fn);
    const now = new Set(noteNames.map(noteNameToMidi));
    const before = (prevNotes ?? []).filter((n) => !now.has(noteNameToMidi(n)));
    const keys = [...noteNames, ...before];
    const colors = [...noteNames.map(() => color2), ...before.map(() => neutralColor())];
    container2.innerHTML = Notae.renderPiano({
      name: "",
      keys,
      colors,
      range: pianoRange([...noteNames, ...before], containerOctaves(container2))
    }, {
      pianoWhiteKeyColor: color("piano-white"),
      pianoWhiteKeyStrokeColor: color("piano-white-stroke"),
      pianoBlackKeyColor: color("piano-black"),
      pianoBlackKeyStrokeColor: color("piano-black-stroke"),
      stringLabelColor: color("piano-label"),
      pianoBlackKeyLabelColor: color("piano-black-label")
    });
    localizeDrawnNoteNames(container2);
    container2.querySelectorAll("rect[data-note]").forEach((el2) => {
      const midi = noteNameToMidi(el2.dataset.note);
      if (midi === null) return;
      el2.style.cursor = "pointer";
      el2.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        onPress?.(midi, e.pointerId);
      });
    });
  }

  // src/diagrams/velocity.ts
  function renderVelocity(container2, notes2) {
    if (!notes2.length) {
      container2.innerHTML = `<div class="vel-empty">${escapeHtml(t("velocity.empty"))}</div>`;
      return;
    }
    const sorted = [...notes2].sort((a, b) => b.midi - a.midi);
    container2.innerHTML = sorted.map((n) => `
    <div class="vel-row" title="${escapeHtml(t("velocity.bar", { note: noteLabel(n.name), v: n.velocity }))}">
      <span class="vel-note">${escapeHtml(noteLabel(n.name))}</span>
      <span class="vel-bar"><span style="width:${(n.velocity / 127 * 100).toFixed(1)}%"></span></span>
      <span class="vel-num">${n.velocity}</span>
    </div>`).join("");
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
  function renderCircleOfFifths(container2, activeKey, activeChord, onSegmentClick, size = 160, opts = { accidental: "flat", showMinor: true, showDegrees: false, show7ths: false }) {
    const keys = opts.accidental === "sharp" ? CIRCLE_KEYS_SHARP : CIRCLE_KEYS_FLAT;
    const minorKeys = opts.accidental === "sharp" ? CIRCLE_KEYS_MINOR_SHARP : CIRCLE_KEYS_MINOR_FLAT;
    const mode4 = keyMode(activeKey);
    const tonicPc = activeKey ? pitchClass(activeKey.split(" ")[0]) : -1;
    const parentPc = parentMajorPc(activeKey);
    const activePos = parentPc === -1 ? -1 : keys.findIndex((k) => pitchClass(k) === parentPc);
    const tonicMajorPos = mode4 === "Major" || mode4 === "Lydian" || mode4 === "Mixolydian" ? keys.findIndex((k) => pitchClass(k) === tonicPc) : -1;
    const tonicMinorPos = mode4 === "Minor" || mode4 === "Dorian" || mode4 === "Phrygian" ? minorKeys.findIndex((m) => pitchClass(rootOf(m)) === tonicPc) : -1;
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
    const chordFn = activeChord ? romanInKey(activeChord, activeKey)?.function ?? null : null;
    const c = {
      tonic: color("cof-tonic"),
      chord: functionColor(chordFn, "cof-chord"),
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
      const isTonic = i === tonicMajorPos;
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
      const isMinorTonic = i === tonicMinorPos;
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
    container2.innerHTML = svg;
    container2.querySelectorAll("[data-chord]").forEach((el2) => {
      el2.addEventListener("click", () => onSegmentClick(el2.dataset.chord, el2.dataset.key ?? null));
      makeActivatable(el2, chordLabel(el2.dataset.chord));
    });
    container2.querySelector("svg")?.setAttribute("aria-label", t("a11y.cof"));
    container2.querySelector("svg")?.setAttribute("role", "group");
  }

  // src/view/viewer.ts
  function cofOptions(key) {
    return {
      accidental: cofAccidentalFor(key, loadChoice("cof-accidental", ["flat", "sharp"], "flat")),
      showMinor: loadBool("cof-show-minor", true),
      showDegrees: loadBool("cof-show-degrees", false),
      show7ths: loadBool("cof-show-7ths", false)
    };
  }
  function renderChordView(el2, s) {
    if (!s.label) {
      el2.innerHTML = "";
      return;
    }
    const fill = s.symbol ? functionColor(s.function, "text-strong") : color("text-strong");
    const detail = s.kind === "chord" && s.roman && s.roman !== "?" ? [s.roman, s.function && s.function !== "unknown" ? t(`fn.${s.function}`) : null].filter(Boolean).join(" \xB7 ") : "";
    el2.innerHTML = `
    <div class="view-chord-name" style="color:${fill}">${escapeHtml(s.label)}</div>
    ${detail ? `<div class="view-chord-detail">${escapeHtml(detail)}</div>` : ""}`;
  }
  function renderView(view2, el2, s) {
    if (view2 === "chord") return renderChordView(el2, s);
    if (view2 === "staff") {
      el2.innerHTML = "<div></div>";
      const inner = el2.firstElementChild;
      renderStaff(inner, s.notes, 200, s.key, 1, loadChoice("staff-clef", STAFF_CLEFS, "grand"));
      inner.style.height = "100%";
      inner.style.width = "100%";
    } else if (view2 === "cof") renderCircleOfFifths(el2, s.key, s.symbol, () => {
    }, 400, { ...cofOptions(s.key), backdrop: color("bg") });
    else if (view2 === "piano") renderPiano(el2, s.notes, s.symbol ? s.function : null);
    else if (view2 === "guitar") renderGuitar(el2, s.symbol, s.notes, s.guitarVoicing);
    fitSvg(el2.querySelector("svg"));
  }
  function runViewerFromUrl() {
    const params = new URLSearchParams(location.search);
    const view2 = params.get("view");
    if (!view2 || !VIEW_NAMES.includes(view2)) return false;
    const bg = params.get("bg") ?? "green";
    const background = VIEW_BACKGROUNDS[bg] ?? VIEW_BACKGROUNDS.green;
    document.title = `Modus view: ${view2}`;
    applyDocumentLang();
    applyTheme("dark");
    document.body.classList.add("view-mode");
    document.body.style.background = background;
    document.getElementById("app").style.display = "none";
    const el2 = document.createElement("div");
    el2.id = "view-content";
    el2.className = `view-${view2}`;
    document.body.appendChild(el2);
    subscribeView((s) => renderView(view2, el2, s));
    window.addEventListener("storage", (e) => {
      if (e.key && /^(guitar-|cof-|staff-clef|lang$|note-names$)/.test(e.key)) location.reload();
    });
    return true;
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

  // src/diagrams/key-explorer.ts
  var functionName = (fn) => fn === "unknown" ? t("fn.unknownLong") : t(`fn.${fn}`);
  var describe = (c) => [c.roman, c.secondary && t("keyPanel.also", { roman: c.secondary }), functionName(c.function)].filter(Boolean).join(" \xB7 ");
  function renderKeyExplorer(container2, map, keyLabel3, activeChord, onChordClick, opts) {
    container2.style.fontSize = opts.fontScale + "px";
    if (!map) {
      container2.innerHTML = `<div class="key-empty">${escapeHtml(t("keyPanel.empty"))}</div>`;
      return;
    }
    const button = (symbol, cls, title) => `<button class="key-chord ${cls}${sameChord(symbol, activeChord) ? " active" : ""}" data-chord="${escapeHtml(symbol)}"
      title="${escapeHtml(title)}">${escapeHtml(chordLabel(symbol))}</button>`;
    const cell = (c) => `
    <div class="key-cell">
      <span class="key-roman">${escapeHtml(c.roman)}</span>
      ${button(c.symbol, `key-fnb-${c.function}`, describe(c))}
      ${c.alternative ? button(c.alternative.symbol, "key-alt", `${describe(c.alternative)} \xB7 ${t("keyPanel.harmonicMinor")}`) : ""}
      <span class="key-function key-fn-${c.function}" title="${functionName(c.function)}">${c.function === "unknown" ? "\xB7" : c.function}</span>
    </div>`;
    let html = `<div class="key-main"><div class="key-title">${escapeHtml(keyLabel3)}</div>`;
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
    const anyCommon = map.parallel.some((r) => r.chords.some((c) => c.common));
    const rows = opts.usualOnly && anyCommon ? map.parallel.map((r) => ({ ...r, chords: r.chords.filter((c) => c.common) })).filter((r) => r.chords.length) : map.parallel;
    if (opts.showParallel && rows.length) {
      html += `<div class="key-parallel"><div class="key-section-label" title="${t("keyPanel.parallel.title")}">${t("keyPanel.parallel")}</div><div class="key-mode-grid">`;
      html += rows.map((row3) => `
      <div class="key-mode-row">
        <span class="key-mode-name">${escapeHtml(scaleLabel(row3.mode))}</span>
        <div class="key-mode-chords">${row3.chords.map((c) => `
          <span class="key-mode-chord">
            <span class="key-roman">${escapeHtml(c.roman)}</span>
            ${button(c.symbol, c.characteristic ? "key-characteristic" : "", [describe(c), t("keyPanel.from", { mode: scaleLabel(row3.mode) }), c.characteristic ? t("keyPanel.characteristic") : ""].filter(Boolean).join(" \xB7 "))}
          </span>`).join("")}
        </div>
      </div>`).join("") + "</div></div>";
    }
    container2.innerHTML = html;
    container2.querySelectorAll(".key-chord").forEach((btn) => {
      btn.addEventListener("click", () => onChordClick(btn.dataset.chord));
    });
  }

  // src/song/model.ts
  function createSong() {
    return { schemaVersion: 2, id: newId(), title: t("song.untitled"), key: null, updatedAt: Date.now(), sections: [] };
  }
  var UNTITLED = /* @__PURE__ */ new Set([en["song.untitled"], es["song.untitled"]]);
  function isBlankSong(song) {
    return !song.sections.length && UNTITLED.has(song.title);
  }
  function newMeasure() {
    return { id: newId(), chords: [] };
  }
  function addSection(song, name, color2) {
    const section2 = {
      id: newId(),
      name,
      color: color2,
      measures: [newMeasure()],
      collapsed: false,
      repeatCount: 1
    };
    return { ...song, sections: [...song.sections, section2] };
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
  function addChord(song, sectionId, measureId, symbol, notes2, beforeChordId) {
    const valid2 = isValidChordSymbol(symbol);
    const chord = { id: newId(), symbol, valid: valid2, ...notes2?.length ? { notes: notes2 } : {} };
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
  function insertChordAfter(song, afterChordId, symbol, notes2) {
    const valid2 = isValidChordSymbol(symbol);
    const newChord = { id: newId(), symbol, valid: valid2, ...notes2?.length ? { notes: notes2 } : {} };
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
  function updateChord(song, chordId, symbol, notes2) {
    const valid2 = isValidChordSymbol(symbol);
    return {
      ...song,
      sections: song.sections.map((s) => ({
        ...s,
        measures: s.measures.map((m) => ({
          ...m,
          chords: m.chords.map((c) => c.id === chordId ? { ...c, symbol, valid: valid2, ...notes2?.length ? { notes: notes2 } : { notes: void 0 } } : c)
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
    for (const section2 of song.sections) {
      for (const measure of section2.measures) {
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
        const last = kept[kept.length - 1];
        const reuse = last && last.chords.length === 0;
        if (reuse) kept.pop();
        const added = measures.map((syms, i) => ({
          id: i === 0 && reuse ? last.id : newId(),
          chords: syms.map((symbol) => ({ id: newId(), symbol, valid: isValidChordSymbol(symbol) }))
        }));
        return { ...s, measures: [...kept, ...added] };
      })
    };
  }
  function replaceSectionProgression(song, sectionId, measures) {
    return {
      ...song,
      sections: song.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const next = measures.map((syms, i) => {
          const old = s.measures[i];
          return {
            id: old?.id ?? newId(),
            chords: syms.map((symbol, j) => {
              const was = old?.chords[j];
              return was && was.symbol === symbol ? was : { id: newId(), symbol, valid: isValidChordSymbol(symbol) };
            })
          };
        });
        return { ...s, measures: next.length ? next : [newMeasure()] };
      })
    };
  }
  function sectionAsText(section2, label = (s) => s) {
    return section2.measures.map((m) => m.chords.filter((c) => c.symbol).map((c) => label(c.symbol)).join(" ")).filter(Boolean).join(" | ");
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
  function transposeRoot(root2, semitones, preferSharps) {
    const names = preferSharps ? SEMITONE_NAMES_SHARP : PITCH_NAMES_FLAT;
    const all = [...SEMITONE_NAMES_SHARP, ...PITCH_NAMES_FLAT];
    const idx = all.indexOf(root2);
    if (idx === -1) return root2;
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
    const pattern2 = letters.join("");
    if (/^(AB)+$/.test(pattern2)) return t("form.verseChorus", { p: pattern2 });
    if (/^AABA/.test(pattern2)) return `AABA (${pattern2})`;
    if (/^(A+B+A+)$/.test(pattern2)) return t("form.ternary", { p: pattern2 });
    if (pattern2 === "A") return t("form.single");
    if (/^A+$/.test(pattern2)) return t("form.strophic", { p: pattern2 });
    return `${pattern2}`;
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
    const index2 = readIndex();
    if (index2) return index2;
    const song = migrateLegacySong();
    write(songKey(song.id), song);
    const created = { activeId: song.id, songs: [metaOf(song)] };
    write(INDEX_KEY, created);
    return created;
  }
  function songTabs() {
    return ensureIndex().songs;
  }
  function listSongs() {
    return ensureIndex().songs.map((meta, order) => ({ meta, order })).sort((a, b) => b.meta.updatedAt - a.meta.updatedAt || b.order - a.order).map((x) => x.meta);
  }
  function saveSong(song) {
    const stored = { ...withoutEmptyChords(song), updatedAt: Date.now() };
    write(songKey(stored.id), stored);
    const index2 = ensureIndex();
    const at = index2.songs.findIndex((m) => m.id === stored.id);
    const songs = at < 0 ? [...index2.songs, metaOf(stored)] : index2.songs.map((m, i) => i === at ? metaOf(stored) : m);
    write(INDEX_KEY, { ...index2, songs });
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
    const index2 = ensureIndex();
    const song = readSong(index2.activeId) ?? listSongs().map((m) => readSong(m.id)).find((s) => s !== null);
    if (song) {
      if (song.id !== index2.activeId) setActive(song.id);
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
    const index2 = ensureIndex();
    try {
      localStorage.removeItem(songKey(id));
    } catch {
    }
    write(INDEX_KEY, { ...index2, songs: index2.songs.filter((m) => m.id !== id) });
    return { deleted, open: loadActiveSong() };
  }
  function restoreSong(song) {
    saveSong(song);
    setActive(song.id);
  }

  // src/song/playback.ts
  var DEFAULT_TEMPO = 100;
  var DEFAULT_BEATS = 4;
  var TEMPO_RANGE = [40, 240];
  var BEATS_RANGE = [1, 12];
  var songTempo = (song) => song.tempo ?? DEFAULT_TEMPO;
  var songBeats = (song) => song.beatsPerBar ?? DEFAULT_BEATS;
  function songSchedule(song, fromChordId = null) {
    const beatsPerBar = songBeats(song);
    const steps2 = [];
    let start = 0;
    for (const section2 of song.sections) {
      for (let r = 0; r < Math.max(1, section2.repeatCount); r++) {
        for (const measure of section2.measures) {
          const chords = measure.chords;
          if (!chords.length) {
            steps2.push({ chordId: null, sectionId: section2.id, symbol: null, start, beats: beatsPerBar });
            start += beatsPerBar;
            continue;
          }
          const each = beatsPerBar / chords.length;
          for (const c of chords) {
            steps2.push({ chordId: c.id, sectionId: section2.id, symbol: c.symbol && c.valid ? c.symbol : null, notes: c.notes, start, beats: each });
            start += each;
          }
        }
      }
    }
    const from = fromChordId ? steps2.findIndex((s) => s.chordId === fromChordId) : -1;
    if (from <= 0) return steps2;
    const offset = steps2[from].start;
    return steps2.slice(from).map((s) => ({ ...s, start: s.start - offset }));
  }
  var timer3 = null;
  var onEnd = null;
  var isSongPlaying = () => timer3 !== null;
  function playSchedule(steps2, tempo, h) {
    stopSong();
    if (!steps2.length) {
      h.end();
      return;
    }
    const beatMs = 6e4 / tempo;
    const t0 = performance.now();
    onEnd = h.end;
    let previous = null;
    const run = (i) => {
      if (i >= steps2.length) {
        stopSong();
        return;
      }
      const s = steps2[i];
      h.step(s, previous, s.beats * beatMs / 1e3);
      if (s.symbol) previous = s;
      const next = i + 1 < steps2.length ? steps2[i + 1].start : s.start + s.beats;
      timer3 = setTimeout(() => run(i + 1), Math.max(0, t0 + next * beatMs - performance.now()));
    };
    timer3 = setTimeout(() => run(0), 0);
  }
  function stopSong() {
    if (timer3) clearTimeout(timer3);
    timer3 = null;
    const end = onEnd;
    onEnd = null;
    end?.();
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
  var _song = createSong();
  var _handlers = null;
  var _container = null;
  var _draggedSectionId = null;
  var _draggedChordId = null;
  var _dropIndicator = null;
  var _insertBeforeChordId = null;
  function showNotice(msg, type = "info") {
    if (!_container) return;
    document.querySelectorAll(".song-notice").forEach((el2) => el2.remove());
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
  function mountSong(container2, song, handlers) {
    if (song.id !== _song.id && isSongPlaying()) stopSong();
    _song = song;
    _handlers = handlers;
    _container = container2;
    rerender();
  }
  function markActiveChord(chordId) {
    _container?.querySelectorAll(".chord-chip").forEach((el2) => {
      el2.classList.toggle("active-cursor", el2.dataset.chordId === chordId);
    });
    const section2 = sectionOf(chordId);
    _container?.querySelectorAll(".strip-block").forEach((b) => b.classList.toggle("in-play", b.dataset.sectionId === section2));
  }
  function rerender() {
    if (!_container || !_handlers) return;
    closePopover();
    _container.innerHTML = "";
    _container.appendChild(buildSongDOM(_song, _handlers));
    markPlaying(_playing);
  }
  var _playing = null;
  function markPlaying(step2) {
    _playing = step2;
    if (!_container) return;
    _container.querySelectorAll(".chord-chip").forEach((c) => c.classList.toggle("playing", !!step2 && c.dataset.chordId === step2.chordId));
    if (step2) _container.querySelectorAll(".strip-block").forEach((b) => b.classList.toggle("in-play", b.dataset.sectionId === step2.sectionId));
    _container.querySelector(".chord-chip.playing")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const btn = _container.querySelector(".song-play");
    if (btn) {
      const on = isSongPlaying();
      btn.textContent = on ? "\u25A0" : "\u25B6";
      btn.title = t(on ? "song.stop.title" : "song.play.title");
      btn.setAttribute("aria-label", t(on ? "song.stop" : "song.play"));
    }
  }
  function playFromCursor(h) {
    playSchedule(songSchedule(_song, h.activeCursorId), songTempo(_song), {
      step: (s, previous, seconds) => {
        if (s.symbol) playNoteNames(s.notes?.length ? s.notes : chordNoteNames(s.symbol), seconds);
        markPlaying(s);
        h.onPlayStep(s, previous);
      },
      end: () => markPlaying(null)
    });
    markPlaying(_playing);
  }
  var _textSections = /* @__PURE__ */ new Set();
  var TEMPLATES = [
    { label: "section.intro", name: "section.intro", color: "intro" },
    { label: "section.verse", name: "section.verse", color: "verse" },
    { label: "section.pre", name: "section.prechorus", color: "prechorus" },
    { label: "section.chorus", name: "section.chorus", color: "chorus" },
    { label: "section.bridge", name: "section.bridge", color: "bridge" },
    { label: "section.outro", name: "section.outro", color: "outro" }
  ];
  var FUNCTION_BORDER = { T: "var(--fn-t)", S: "var(--fn-s)", D: "var(--fn-d)" };
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    e.className = cls;
    if (text !== void 0) e.textContent = text;
    return e;
  }
  function commit2(song) {
    _song = song;
    saveSong(_song);
    _handlers?.onSongChange(_song);
  }
  function buildSongDOM(song, h) {
    const root2 = el("div", "song-root");
    const header = el("div", "song-header");
    const titleInput = el("input", "song-title-input");
    titleInput.value = song.title;
    titleInput.setAttribute("aria-label", t("song.saved.title"));
    titleInput.addEventListener("blur", () => {
      if (titleInput.value === _song.title) return;
      _song = { ..._song, title: titleInput.value };
      h.onSongChange(_song);
    });
    titleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") titleInput.blur();
    });
    const tabs2 = el("div", "song-tabs");
    tabs2.setAttribute("role", "tablist");
    tabs2.setAttribute("aria-label", t("song.list"));
    const metas = h.songs.some((m) => m.id === song.id) ? h.songs : [...h.songs, { id: song.id, title: song.title, updatedAt: song.updatedAt }];
    for (const m of metas) {
      const tab = el("button", "song-tab", (m.id === song.id ? song.title : m.title) || t("song.untitled"));
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(m.id === song.id));
      tab.dataset.songId = m.id;
      tab.addEventListener("click", () => {
        if (m.id !== _song.id) h.onOpenSong(m.id);
      });
      tab.addEventListener("dblclick", () => {
        titleInput.focus();
        titleInput.select();
      });
      tabs2.appendChild(tab);
    }
    const newTab = el("button", "song-tab song-tab-new", "+");
    newTab.title = t("song.new.title");
    newTab.setAttribute("aria-label", t("song.newSong"));
    newTab.addEventListener("click", () => {
      if (!isBlankSong(_song)) h.onNewSong();
    });
    tabs2.appendChild(newTab);
    root2.appendChild(tabs2);
    requestAnimationFrame(() => tabs2.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }));
    const bars = song.sections.reduce((n, s) => n + s.measures.length * Math.max(1, s.repeatCount), 0);
    const summary = el("span", "song-form-info");
    summary.textContent = song.sections.length ? [
      h.activeKey ? `${keyLabel(h.activeKey)}${h.keyIsAuto ? ` \xB7 ${t("song.auto")}` : ""}` : "",
      t("song.bars", { n: bars }),
      detectForm(song.sections.map((s) => s.name))
    ].filter(Boolean).join(" \xB7 ") : "";
    const addAnchor = el("div", "pop-anchor pop-end");
    const addBtn = el("button", "song-btn", t("song.addSection"));
    const addMenu = buildSectionMenu(h);
    addAnchor.append(addBtn, addMenu);
    const pasteBtn = el("button", "song-btn", t("song.paste"));
    pasteBtn.title = t("song.paste.title");
    const moreAnchor = el("div", "pop-anchor pop-end");
    const moreBtn = el("button", "song-more-btn", "\u22EF");
    moreBtn.title = t("song.more");
    moreBtn.setAttribute("aria-label", t("song.more"));
    const moreMenu = el("div", "view-menu pop-menu song-menu");
    moreMenu.innerHTML = `
    <button class="choice-row" data-act="new" title="${escapeHtml(t("song.new.title"))}">${escapeHtml(t("song.newSong"))}</button>
    <div class="view-menu-title">${escapeHtml(t("song.transposeBy"))}</div>
    <div class="menu-chips">${Array.from({ length: 11 }, (_, i) => `<button class="menu-chip" data-transpose="${i + 1}" title="${escapeHtml(t("song.transpose.title"))}">${escapeHtml(t("song.transpose.step", { n: i + 1 }))}</button>`).join("")}</div>
    <button class="choice-row" data-act="export" title="${escapeHtml(t("song.export.title"))}">${escapeHtml(t("song.export"))}</button>
    <button class="choice-row song-danger" data-act="delete" title="${escapeHtml(t("song.delete.title"))}">${escapeHtml(t("song.delete"))}</button>`;
    moreMenu.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      closePopover();
      const n = Number(b.dataset.transpose);
      if (n) commit2(transposeSong(_song, n, h.activeKey ? transposeKey(h.activeKey, n) : void 0));
      else if (b.dataset.act === "new") {
        if (!isBlankSong(_song)) h.onNewSong();
      } else if (b.dataset.act === "delete") h.onDeleteSong();
      else if (b.dataset.act === "export") {
        const printWin = window.open("", "_blank");
        if (!printWin) {
          showNotice(t("song.popupBlocked"), "warn");
          return;
        }
        printWin.document.write(buildPrintHTML(_song, h.activeKey));
        printWin.document.close();
        printWin.print();
      }
    });
    moreAnchor.append(moreBtn, moreMenu);
    wirePopover(moreMenu, [moreBtn]);
    const playBtn = el("button", "song-btn song-play", "\u25B6");
    playBtn.disabled = !song.sections.some((s) => s.measures.length);
    playBtn.addEventListener("click", () => {
      if (isSongPlaying()) stopSong();
      else playFromCursor(h);
    });
    const tempoAnchor = el("div", "pop-anchor pop-end");
    const tempoBtn = el("button", "song-btn song-tempo", `\u2669 ${songTempo(song)} \xB7 ${songBeats(song)}/4`);
    tempoBtn.title = t("song.tempo.title");
    const tempoMenu = el("div", "view-menu pop-menu song-menu");
    const numberRow = (field, label, value, [min, max], unit) => `<label class="song-tempo-row">${escapeHtml(label)}<input type="number" class="song-tempo-input" data-field="${field}" min="${min}" max="${max}" step="1" value="${value}">${escapeHtml(unit)}</label>`;
    tempoMenu.innerHTML = numberRow("tempo", t("song.tempo"), songTempo(song), TEMPO_RANGE, "bpm") + numberRow("beats", t("song.beats"), songBeats(song), BEATS_RANGE, "/4");
    tempoMenu.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
      const [min, max] = input.dataset.field === "tempo" ? TEMPO_RANGE : BEATS_RANGE;
      const v = Math.round(Number(input.value));
      if (!Number.isFinite(v)) return;
      const n = Math.min(max, Math.max(min, v));
      commit2(input.dataset.field === "tempo" ? { ..._song, tempo: n } : { ..._song, beatsPerBar: n });
    }));
    tempoAnchor.append(tempoBtn, tempoMenu);
    wirePopover(tempoMenu, [tempoBtn]);
    const titleWrap = el("div", "song-title-wrap");
    titleWrap.append(titleInput);
    header.append(titleWrap, summary, el("span", "song-gap"), playBtn, tempoAnchor, addAnchor, pasteBtn, moreAnchor);
    root2.appendChild(header);
    const pasteArea = el("div", "paste-area");
    pasteArea.hidden = true;
    const pasteTA = el("textarea", "paste-textarea");
    pasteTA.placeholder = t("song.paste.placeholder");
    pasteTA.rows = 2;
    const pasteSubmit = el("button", "song-btn song-btn-main", t("song.paste.add"));
    pasteSubmit.addEventListener("click", () => {
      const text = pasteTA.value.trim();
      if (!text) return;
      const measures = parseProgressionMeasures(text).map((m) => m.map(readTypedChord));
      if (!measures.length) return;
      if (!_song.sections.length) _song = addSection(_song, t("section.default"), "verse");
      const section2 = _song.sections[_song.sections.length - 1];
      commit2(appendProgression(_song, section2.id, measures));
    });
    pasteArea.append(pasteTA, pasteSubmit);
    pasteBtn.addEventListener("click", () => {
      pasteArea.hidden = !pasteArea.hidden;
      if (!pasteArea.hidden) pasteTA.focus();
    });
    root2.appendChild(pasteArea);
    if (song.sections.length > 1) root2.appendChild(buildFormStrip(song, h));
    if (!song.sections.length) root2.appendChild(el("p", "song-empty", t("song.empty")));
    const measureNums = computeMeasureNumbers(song);
    song.sections.forEach((section2) => root2.appendChild(buildSectionDOM(section2, h, measureNums)));
    return root2;
  }
  function buildSectionMenu(h) {
    const menu = el("div", "view-menu pop-menu song-menu");
    for (const tpl of TEMPLATES) {
      const name = t(tpl.name);
      const b = el("button", "choice-row");
      b.innerHTML = `<span class="section-dot" style="background:${SECTION_COLORS[tpl.color]}"></span>${escapeHtml(t(tpl.label))}`;
      b.title = t("song.addSection.title", { name });
      b.addEventListener("click", () => {
        closePopover();
        commit2(addSection(_song, name, tpl.color));
      });
      menu.appendChild(b);
    }
    queueMicrotask(() => {
      const trigger = menu.parentElement?.querySelector(":scope > button");
      if (trigger) wirePopover(menu, [trigger]);
    });
    void h;
    return menu;
  }
  var sectionOf = (chordId) => chordId ? _song.sections.find((s) => s.measures.some((m) => m.chords.some((c) => c.id === chordId)))?.id ?? null : null;
  function buildFormStrip(song, h) {
    const strip = el("div", "song-strip");
    strip.setAttribute("role", "list");
    strip.setAttribute("aria-label", t("song.strip"));
    strip.title = t("song.strip");
    const inPlay = sectionOf(h.captureTargetId ?? h.activeCursorId);
    for (const section2 of song.sections) {
      const bars = Math.max(1, section2.measures.length) * Math.max(1, section2.repeatCount);
      const block = el("div", "strip-block");
      block.setAttribute("role", "listitem");
      block.dataset.sectionId = section2.id;
      block.style.flexGrow = String(bars);
      block.style.borderTopColor = SECTION_COLORS[section2.color];
      block.classList.toggle("in-play", section2.id === inPlay);
      const go2 = el("button", "strip-go");
      go2.innerHTML = `<b>${escapeHtml(section2.name || t("section.default"))}</b><span>${section2.measures.length}${section2.repeatCount > 1 ? ` \xD7${section2.repeatCount}` : ""}</span>`;
      go2.addEventListener("click", () => {
        const target = _container?.querySelector(`.section-wrap[data-section-id="${section2.id}"]`);
        target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        target?.classList.add("section-flash");
        setTimeout(() => target?.classList.remove("section-flash"), 900);
      });
      block.append(go2);
      block.draggable = true;
      block.addEventListener("dragstart", (e) => {
        _draggedSectionId = section2.id;
        _draggedChordId = null;
        e.dataTransfer.effectAllowed = "move";
        requestAnimationFrame(() => block.classList.add("dragging"));
      });
      block.addEventListener("dragend", () => {
        _draggedSectionId = null;
        block.classList.remove("dragging");
      });
      block.addEventListener("dragover", (e) => {
        if (!_draggedSectionId || _draggedSectionId === section2.id) return;
        e.preventDefault();
        const r = block.getBoundingClientRect();
        block.classList.toggle("drop-before", e.clientX < r.left + r.width / 2);
        block.classList.toggle("drop-after", e.clientX >= r.left + r.width / 2);
      });
      block.addEventListener("dragleave", () => block.classList.remove("drop-before", "drop-after"));
      block.addEventListener("drop", (e) => {
        if (!_draggedSectionId || _draggedSectionId === section2.id) return;
        e.preventDefault();
        const before = block.classList.contains("drop-before");
        block.classList.remove("drop-before", "drop-after");
        const dragged = _draggedSectionId;
        _draggedSectionId = null;
        commit2(reorderSections(_song, dragged, section2.id, before));
      });
      strip.appendChild(block);
    }
    const addAnchor = el("div", "pop-anchor pop-end");
    const add = el("button", "strip-add", "+");
    add.title = t("song.strip.add");
    add.setAttribute("aria-label", t("song.strip.add"));
    addAnchor.append(add, buildSectionMenu(h));
    strip.appendChild(addAnchor);
    return strip;
  }
  function repeatControl(section2) {
    const badge = el("button", "section-repeat-badge", `\xD7${section2.repeatCount}`);
    badge.title = t("section.repeat.title");
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = el("input", "section-repeat-input");
      input.type = "number";
      input.min = "1";
      input.max = "16";
      input.value = String(section2.repeatCount);
      badge.replaceWith(input);
      input.focus();
      input.select();
      let done = false;
      const keep = () => {
        if (done) return;
        done = true;
        const n = parseInt(input.value);
        if (n >= 1 && n <= 16 && n !== section2.repeatCount) commit2(updateSection(_song, section2.id, { repeatCount: n }));
        else _handlers?.onSongChange(_song);
      };
      input.addEventListener("blur", keep);
      input.addEventListener("keydown", (ke) => {
        if (ke.key === "Enter") input.blur();
        if (ke.key === "Escape") {
          input.value = String(section2.repeatCount);
          input.blur();
        }
      });
    });
    return badge;
  }
  function buildSectionDOM(section2, h, measureNums) {
    const color2 = SECTION_COLORS[section2.color];
    const wrap = el("div", "section-wrap");
    wrap.dataset.sectionId = section2.id;
    const side = el("div", "section-header");
    side.style.borderLeftColor = color2;
    const nameRow = el("div", "section-name-row");
    const toggle = el("button", "section-toggle", section2.collapsed ? "\u25B8" : "\u25BE");
    toggle.title = t("section.collapse.title");
    toggle.addEventListener("click", () => commit2(updateSection(_song, section2.id, { collapsed: !section2.collapsed })));
    const nameInput = el("input", "section-name-input");
    nameInput.value = section2.name;
    nameInput.setAttribute("aria-label", t("section.default"));
    nameInput.addEventListener("blur", () => {
      if (nameInput.value !== section2.name) commit2(updateSection(_song, section2.id, { name: nameInput.value }));
    });
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") nameInput.blur();
    });
    nameRow.append(toggle, nameInput);
    const tools = el("div", "section-tools");
    const swatch = el("button", "section-swatch");
    swatch.style.background = color2;
    swatch.title = t("section.color.title");
    swatch.setAttribute("aria-label", t("section.color.title"));
    swatch.addEventListener("click", (e) => {
      e.stopPropagation();
      openColorPicker(swatch, section2);
    });
    const dupBtn = makeSmallBtn("\u29C9", () => commit2(duplicateSection(_song, section2.id)));
    dupBtn.title = t("section.duplicate.title");
    const delBtn = makeSmallBtn("\xD7", () => applyWithUndo(removeSection(_song, section2.id), t("section.deleted", { name: section2.name })));
    delBtn.title = t("section.delete.title");
    delBtn.classList.add("song-danger");
    tools.append(swatch, repeatControl(section2), dupBtn, delBtn);
    const textMode = _textSections.has(section2.id);
    const mode4 = el("div", "section-write");
    mode4.setAttribute("role", "group");
    mode4.setAttribute("aria-label", t("section.write"));
    for (const [m, label] of [["chips", t("section.chips")], ["text", t("section.text")]]) {
      const b = el("button", "section-write-btn", label);
      b.setAttribute("aria-pressed", String(m === "text" === textMode));
      b.addEventListener("click", () => {
        if (m === "text") _textSections.add(section2.id);
        else _textSections.delete(section2.id);
        rerender();
        if (m === "text") _container?.querySelector(`.section-wrap[data-section-id="${section2.id}"] .section-text-input`)?.focus();
      });
      mode4.appendChild(b);
    }
    side.append(nameRow, tools, mode4);
    wrap.appendChild(side);
    const body = el("div", "section-body");
    if (!section2.collapsed) {
      if (textMode) body.appendChild(buildSectionText(section2));
      else {
        const measuresWrap = el("div", "measures-wrap");
        section2.measures.forEach((measure, i) => measuresWrap.appendChild(buildMeasureDOM(measure, section2, h, measureNums.get(measure.id) ?? 0, i === section2.measures.length - 1)));
        body.appendChild(measuresWrap);
        const addMeasureBtn = el("button", "section-add-bar", t("section.addBar"));
        addMeasureBtn.title = t("section.addBar.title");
        addMeasureBtn.addEventListener("click", () => commit2(addMeasure(_song, section2.id)));
        body.appendChild(addMeasureBtn);
      }
    }
    wrap.appendChild(body);
    return wrap;
  }
  function openColorPicker(anchor, section2) {
    const PRESET_COLORS = ["intro", "verse", "prechorus", "chorus", "bridge", "outro", "custom"];
    document.querySelector(".color-picker-popup")?.remove();
    const picker = el("div", "color-picker-popup");
    PRESET_COLORS.forEach((c) => {
      const dot = el("button", "color-picker-dot");
      dot.title = t(`section.${c}`);
      dot.style.background = SECTION_COLORS[c];
      dot.style.borderColor = c === section2.color ? "var(--cursor)" : "transparent";
      dot.addEventListener("click", (ev) => {
        ev.stopPropagation();
        picker.remove();
        commit2(updateSection(_song, section2.id, { color: c }));
      });
      picker.appendChild(dot);
    });
    const rect = anchor.getBoundingClientRect();
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
  }
  function buildSectionText(section2) {
    const box = el("div", "section-text");
    const input = el("input", "section-text-input");
    const original = sectionAsText(section2, chordLabel);
    input.value = original;
    input.spellcheck = false;
    input.autocomplete = "off";
    input.setAttribute("aria-label", t("section.text"));
    const hint2 = el("div", "section-text-hint", t("section.text.hint"));
    const status2 = el("div", "section-text-status");
    const read = () => {
      const measures = parseProgressionMeasures(input.value).map((m) => m.map(readTypedChord));
      const bad = measures.flat().filter((s) => !isKnownChord(s));
      return { measures, bad };
    };
    const show = () => {
      const { measures, bad } = read();
      status2.classList.toggle("bad", bad.length > 0);
      status2.textContent = bad.length ? t("section.text.bad", { names: bad.join(", ") }) : input.value.trim() ? t("section.text.ok", { bars: measures.length, chords: measures.flat().length }) : "";
    };
    let left = false;
    const keep = () => {
      if (left || input.value === original) return;
      const { measures } = read();
      left = true;
      commit2(replaceSectionProgression(_song, section2.id, measures));
    };
    input.addEventListener("input", show);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        keep();
      }
      if (e.key === "Escape") {
        left = true;
        input.value = original;
        rerender();
      }
    });
    input.addEventListener("blur", keep);
    show();
    box.append(input, status2, hint2);
    return box;
  }
  function buildMeasureDOM(measure, section2, h, measureNum, last) {
    const wrap = el("div", "measure-row");
    wrap.classList.toggle("measure-last", last);
    wrap.appendChild(el("span", "measure-num", String(measureNum)));
    const chordsRow = el("div", "chords-row");
    measure.chords.forEach((chord) => chordsRow.appendChild(buildChordChip(chord, section2, measure, h)));
    const addBtn = el("button", "chord-add-btn", "+");
    addBtn.title = t("chord.add.title");
    addBtn.addEventListener("click", () => {
      _song = addChord(_song, section2.id, measure.id, "");
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
      if (!hasHistory && !_draggedChordId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = hasHistory ? "copy" : "move";
      chordsRow.classList.add("drop-target");
    });
    chordsRow.addEventListener("dragleave", (e) => {
      if (!chordsRow.contains(e.relatedTarget)) {
        chordsRow.classList.remove("drop-target");
        _dropIndicator?.remove();
        _insertBeforeChordId = null;
      }
    });
    chordsRow.addEventListener("drop", (e) => {
      chordsRow.classList.remove("drop-target");
      _dropIndicator?.remove();
      const histData = e.dataTransfer.getData("application/x-history-chord");
      if (histData) {
        e.preventDefault();
        const { symbol, notes: notes2 } = JSON.parse(histData);
        _song = addChord(_song, section2.id, measure.id, symbol, notes2, _insertBeforeChordId ?? void 0);
        _insertBeforeChordId = null;
        saveSong(_song);
        h.onSongChange(_song);
      } else if (_draggedChordId) {
        e.preventDefault();
        e.stopPropagation();
        _song = moveChordToPosition(_song, _draggedChordId, section2.id, measure.id, _insertBeforeChordId ?? void 0);
        _draggedChordId = null;
        _insertBeforeChordId = null;
        saveSong(_song);
        h.onSongChange(_song);
      }
    });
    wrap.appendChild(chordsRow);
    const sectionObj = _song.sections.find((s) => s.id === section2.id);
    if (sectionObj && sectionObj.measures.length > 1) {
      const delMBtn = makeSmallBtn("\xD7", () => applyWithUndo(removeMeasure(_song, section2.id, measure.id), t("measure.deleted", { n: measureNum })));
      delMBtn.title = t("measure.delete.title");
      delMBtn.classList.add("measure-del", "song-danger");
      wrap.appendChild(delMBtn);
    }
    return wrap;
  }
  function buildChordChip(chord, section2, measure, h) {
    const isActive = h.activeCursorId === chord.id;
    const isCapture = h.captureTargetId === chord.id;
    const degree = chord.valid && chord.symbol ? computeDegree(chord.symbol, h.activeKey) : "\u2014";
    const borrowed = chord.valid && chord.symbol ? isBorrowedChord(chord.symbol, h.activeKey) : false;
    const fn = chord.valid && chord.symbol ? romanInKey(chord.symbol, h.activeKey)?.function : void 0;
    const wrap = document.createElement("div");
    wrap.className = "chord-chip";
    wrap.dataset.chordId = chord.id;
    wrap.classList.toggle("capture-target", isCapture);
    wrap.classList.toggle("active-cursor", isActive);
    wrap.classList.toggle("invalid", chord.valid === false);
    if (fn && FUNCTION_BORDER[fn]) wrap.style.borderLeftColor = FUNCTION_BORDER[fn];
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
      const commit3 = () => {
        const symbol = readTypedChord(input.value) || prevVal;
        _song = updateChord(_song, chord.id, symbol, symbol === prevVal ? notesState : void 0);
        saveSong(_song);
        h.onSongChange(_song);
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit3();
        if (e.key === "Escape") h.onSongChange(_song);
      });
      input.addEventListener("blur", commit3);
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
    makeActivatable(wrap);
    wrap.addEventListener("focus", () => controls.style.display = "flex");
    wrap.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") controls.style.display = "flex";
    });
    wrap.addEventListener("focusout", (e) => {
      if (!wrap.contains(e.relatedTarget)) controls.style.display = "none";
    });
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
        const targetMeasure = _song.sections.find((s) => s.id === section2.id)?.measures.find((m) => m.id === measure.id);
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
      _song = moveChordToPosition(_song, _draggedChordId, section2.id, measure.id, _insertBeforeChordId ?? void 0);
      _draggedChordId = null;
      _insertBeforeChordId = null;
      saveSong(_song);
      h.onSongChange(_song);
    });
    return wrap;
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
    for (const section2 of song.sections) {
      html += `<div class="section"><div class="section-name">${escapeHtml(section2.name)}${section2.repeatCount > 1 ? ` \xD7${section2.repeatCount}` : ""}</div><div class="measures">`;
      for (const measure of section2.measures) {
        const num2 = measureNums.get(measure.id) ?? "";
        html += `<div class="measure"><div class="bar-num">${num2}</div>`;
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
  var FIXED_KEYS = [
    ["kbd.esc", "shortcut.escape"],
    ["1\u20139", "shortcut.candidate"],
    ["Tab", "shortcut.tab"],
    ["kbd.panelArrows", "shortcut.panelArrows"]
  ];
  var GESTURES = [
    "gesture.click",
    "gesture.doubleClick",
    "gesture.logged",
    "gesture.drag",
    "gesture.fill",
    "gesture.remove",
    "gesture.piano",
    "gesture.layout"
  ];
  var TOUCH_GESTURES = [
    "gesture.touch.tap",
    "gesture.touch.doubleTap",
    "gesture.logged",
    "gesture.touch.song",
    "gesture.fill",
    "gesture.touch.remove",
    "gesture.touch.piano",
    "gesture.touch.layout"
  ];
  var hasKeyboard = () => matchMedia("(any-pointer: fine)").matches;
  var hasTouch = () => matchMedia("(any-pointer: coarse)").matches;
  var helpVisible = false;
  var returnFocus3 = null;
  function closeHelp() {
    if (!helpVisible) return false;
    helpVisible = false;
    document.getElementById("shortcut-help")?.remove();
    returnFocus3?.focus();
    returnFocus3 = null;
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
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", t("help.heading"));
    returnFocus3 = document.activeElement;
    const keyboard = hasKeyboard();
    const touch = hasTouch() ? `
    <div class="shortcut-section">${t("help.touch")}</div>
    ${TOUCH_GESTURES.map((g) => `<div class="gesture-row">${escapeHtml(t(g))}</div>`).join("")}` : "";
    popup.innerHTML = `
    <div class="shortcut-help-header">
      <span>${t("help.heading")}</span>
      <button class="shortcut-help-close" aria-label="${t("help.close")}">\xD7</button>
    </div>
    ${keyboard ? "" : touch}
    ${keyboard ? `
    <div class="shortcut-section">${t("help.keys")}</div>
    ${ACTIONS.map((a) => `
      <div class="shortcut-row">
        <kbd class="shortcut-key">${escapeHtml(keysOf(a).map(keyLabel2).join(" ") || "\u2014")}</kbd>
        <span class="shortcut-action">${escapeHtml(t(`action.${a}`))}</span>
      </div>`).join("")}
    ${FIXED_KEYS.map(([k, action]) => `
      <div class="shortcut-row">
        <kbd class="shortcut-key">${escapeHtml(k.startsWith("kbd.") ? t(k) : k)}</kbd>
        <span class="shortcut-action">${escapeHtml(t(action))}</span>
      </div>`).join("")}
    <div class="help-setting"><button id="help-keys" class="ctrl-btn">${escapeHtml(t("help.changeKeys"))}</button></div>
    <div class="shortcut-section">${t("help.mouse")}</div>
    ${GESTURES.map((g) => `<div class="gesture-row">${escapeHtml(t(g))}</div>`).join("")}
    ${touch}` : ""}
    <div class="shortcut-section">${t("help.panels")}</div>
    ${MODULE_IDS.map((id) => `<div class="gesture-row"><b>${escapeHtml(t(`module.${id}`))}</b> \u2014 ${escapeHtml(t(`help.panel.${id}`))}</div>`).join("")}
    <div class="help-setting"><button id="help-tour" class="ctrl-btn" title="${escapeHtml(t("tour.start.title"))}">${escapeHtml(t("tour.start"))}</button></div>`;
    document.body.appendChild(popup);
    popup.querySelector(".shortcut-help-close").addEventListener("click", closeHelp);
    popup.querySelector("#help-tour").addEventListener("click", () => {
      closeHelp();
      startTour();
    });
    popup.querySelector("#help-keys")?.addEventListener("click", () => {
      closeHelp();
      openSettings("shortcuts");
    });
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
      if (keyBelongsToControl(e)) return;
      if (e.key === "Escape") {
        if (!closeHelp() && !actions.closeSettings()) actions.escape();
        return;
      }
      if (e.key >= "1" && e.key <= "9") {
        actions.selectCandidate(parseInt(e.key) - 1);
        return;
      }
      switch (actionFor(keyName2(e))) {
        case "hold":
          actions.toggleHold();
          break;
        case "arpeggio":
          actions.toggleArpeggio();
          break;
        case "play":
          e.preventDefault();
          actions.play();
          break;
        case "send":
          actions.sendToSong();
          break;
        case "clear":
          actions.clearHistory();
          break;
        case "help":
          e.preventDefault();
          toggleHelp();
          break;
        case "settings":
          e.preventDefault();
          actions.openSettings();
          break;
        case "keyboard":
          actions.toggleComputerKeyboard();
          break;
        case "present":
          actions.togglePresentation();
          break;
        case "type":
          e.preventDefault();
          actions.focusChordInput();
          break;
        case "stepPrev":
          e.preventDefault();
          actions.step(-1);
          break;
        case "stepNext":
          e.preventDefault();
          actions.step(1);
          break;
        case "delete":
          if (actions.deleteAtCursor()) e.preventDefault();
          break;
      }
    });
  }

  // src/ui/progressions.ts
  var PROGRESSION_IDS = [
    "ii-V-I",
    "ii-V-i",
    "turnaround-jazz",
    "backdoor-ii-V",
    "rhythm-changes",
    "coltrane-changes",
    "giant-steps-cycle",
    "blues-12",
    "blues-minor",
    "blues-jazz",
    "bird-blues",
    "I-V-vi-IV",
    "I-vi-IV-V",
    "I-IV-V",
    "pachelbel",
    "andalusian",
    "authentic-cadence",
    "plagal-cadence",
    "deceptive-cadence",
    "half-cadence",
    "phrygian-half-cadence",
    "minor-plagal-cadence",
    "bVI-bVII-I",
    "picardy-third"
  ];
  var GROUPS = {
    jazz: ["ii-V-I", "ii-V-i", "turnaround-jazz", "backdoor-ii-V", "rhythm-changes", "coltrane-changes", "giant-steps-cycle"],
    blues: ["blues-12", "blues-minor", "blues-jazz", "bird-blues"],
    pop: ["I-V-vi-IV", "I-vi-IV-V", "I-IV-V", "pachelbel", "andalusian"],
    cadence: ["authentic-cadence", "plagal-cadence", "deceptive-cadence", "half-cadence", "phrygian-half-cadence", "minor-plagal-cadence"],
    mixture: ["bVI-bVII-I", "picardy-third"]
  };
  var groupOf = (id) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(id));
  var MINOR_UNMARKED = ["ii-V-i", "blues-minor", "andalusian"];
  var isMinorProgression = (id) => UMT.PROGRESSIONS[id]?.mode === "minor" || MINOR_UNMARKED.includes(id);
  var barMs = () => 4 * 6e4 / getPref("progression-bpm");
  var BLUES = ["blues-12", "blues-jazz", "bird-blues"];
  function progressionKey(id, key) {
    const minor = isMinorProgression(id);
    if (key) {
      const root2 = key.split(" ")[0];
      return normalizeKey(`${root2} ${minor ? "Minor" : "Major"}`) ?? key;
    }
    const own = UMT.PROGRESSIONS[id]?.defaultKey;
    return normalizeKey(own) ?? (minor ? "A Minor" : "C Major");
  }
  function realizeProgression(id, key) {
    const entry = UMT.PROGRESSIONS[id];
    if (!entry) return [];
    const bars = entry.romanNumerals.flatMap((tokens, bar) => tokens.trim().split(/\s+/).map(() => bar));
    const chords = tryUMT("progressions", () => UMT.getProgression(id, key).map((c) => c.name), []);
    if (chords.length !== bars.length) return [];
    const steps2 = analyzeChordProgression(chords, key, BLUES.includes(id) ? "blues" : void 0);
    return chords.map((symbol, i) => ({
      symbol,
      bar: bars[i],
      roman: steps2[i].info?.roman ?? "\u2014",
      fn: steps2[i].info?.function ?? "unknown",
      cadence: i > 0 ? steps2[i - 1].cadence : null,
      modulation: i > 0 && steps2[i].key && steps2[i].key !== steps2[i - 1].key ? steps2[i].key : null
    }));
  }
  var FUNCTION_COLORS2 = {
    T: "var(--fn-t)",
    S: "var(--fn-s)",
    D: "var(--fn-d)",
    unknown: "var(--text-dim)"
  };
  var current3 = loadChoice("progression", PROGRESSION_IDS, "ii-V-I");
  var timer4 = null;
  var playing = -1;
  function stopProgression() {
    if (timer4) clearTimeout(timer4);
    timer4 = null;
    playing = -1;
    document.querySelectorAll(".prog-chip.playing").forEach((c) => c.classList.remove("playing"));
    const btn = document.getElementById("prog-play");
    if (btn) {
      btn.textContent = "\u25B6";
      btn.title = t("prog.play.title");
    }
  }
  function renderProgressions(container2, analysisKey2, handlers) {
    stopProgression();
    const key = progressionKey(current3, analysisKey2);
    const chords = realizeProgression(current3, key);
    const group = groupOf(current3);
    const groups = Object.keys(GROUPS).map((g) => `<button type="button" class="mode-btn${g === group ? " active-mode" : ""}" data-group="${g}">${escapeHtml(t(`prog.group.${g}`))}</button>`).join("");
    const picks = GROUPS[group].map((id) => `<button type="button" class="menu-chip" data-prog="${id}" aria-pressed="${id === current3}">${escapeHtml(t(`prog.${id}`))}</button>`).join("");
    let strip = "";
    chords.forEach((c, i) => {
      if (i > 0 && c.bar !== chords[i - 1].bar) strip += '<span class="prog-bar">|</span>';
      if (c.modulation) strip += `<span class="prog-modulation history-modulation" title="${escapeHtml(t("history.modulation", { key: keyLabel(c.modulation) }))}">\u2192 ${escapeHtml(keyLabel(c.modulation))}</span>`;
      if (c.cadence) {
        const title = `${cadenceLabel(c.cadence)}${explainCadence(c.cadence) ? `
${explainCadence(c.cadence)}` : ""}`;
        strip += `<span class="prog-cadence history-cadence" title="${escapeHtml(title)}">${escapeHtml(cadenceLabel(c.cadence, true))}</span>`;
      }
      strip += `<button class="prog-chip" data-i="${i}" style="border-left:3px solid ${FUNCTION_COLORS2[c.fn] ?? FUNCTION_COLORS2.unknown}">
      <span class="prog-chip-symbol">${escapeHtml(chordLabel(c.symbol))}</span>
      <span class="prog-chip-roman">${escapeHtml(c.roman)}</span></button>`;
    });
    container2.innerHTML = `
    <div class="prog-head">
      <div class="seg" role="group" aria-label="${escapeHtml(t("prog.select.title"))}">${groups}</div>
      <div class="prog-picks" role="group" aria-label="${escapeHtml(t("prog.select.title"))}">${picks}</div>
      <button id="prog-play" class="ctrl-btn" title="${escapeHtml(t("prog.play.title"))}">\u25B6</button>
      <span class="prog-key">${escapeHtml(keyLabel(key))}</span>
    </div>
    <p class="prog-about">${escapeHtml(t(`prog.${current3}.about`))}</p>
    <div class="prog-strip">${strip}</div>`;
    const pick2 = (id) => {
      current3 = id;
      save("progression", current3);
      renderProgressions(container2, analysisKey2, handlers);
    };
    container2.querySelectorAll("[data-group]").forEach((b) => b.addEventListener("click", () => {
      const g = b.dataset.group;
      if (g !== group) pick2(GROUPS[g][0]);
    }));
    container2.querySelectorAll("[data-prog]").forEach((b) => b.addEventListener("click", () => pick2(b.dataset.prog)));
    const chips = [...container2.querySelectorAll(".prog-chip")];
    const mark = (i) => chips.forEach((c, j) => c.classList.toggle("playing", i === j));
    const show = (i) => {
      mark(i);
      handlers.play(chords[i].symbol, i > 0 ? chords[i - 1].symbol : null, key);
    };
    chips.forEach((chip2, i) => chip2.addEventListener("click", () => {
      stopProgression();
      show(i);
    }));
    const playBtn = container2.querySelector("#prog-play");
    playBtn.addEventListener("click", () => {
      if (playing >= 0) {
        stopProgression();
        return;
      }
      playBtn.textContent = "\u25A0";
      playBtn.title = t("prog.stop.title");
      const step2 = (i) => {
        if (i >= chords.length) {
          stopProgression();
          return;
        }
        playing = i;
        show(i);
        const inBar = chords.filter((c) => c.bar === chords[i].bar).length;
        timer4 = setTimeout(() => step2(i + 1), barMs() / inBar);
      };
      step2(0);
    });
  }

  // src/detector/next.ts
  function keyChords(key, sevenths) {
    const map = buildKeyMap(key, sevenths);
    return map ? map.diatonic.flatMap((c) => c.alternative ? [c.symbol, c.alternative.symbol] : [c.symbol]) : [];
  }
  function resolutionTarget(target, key, sevenths) {
    const map = buildKeyMap(key, sevenths);
    const plain = (r) => r.replace(/[°ø+7]|maj/g, "").toLowerCase();
    return map?.diatonic.find((c) => plain(c.roman) === plain(target))?.symbol ?? null;
  }
  function suggestNext(current4, key, previous = null) {
    const chord = tryParseChord(current4);
    if (!chord || !key) return [];
    const sevenths = (chord.intervalsInSteps?.length ?? 0) >= 4;
    const out = [];
    const entry = (symbol) => {
      if (sameChord(symbol, current4)) return null;
      let s = out.find((o) => sameChord(o.symbol, symbol));
      if (!s) {
        const info3 = romanInKey(symbol, key);
        out.push(s = { symbol, roman: info3?.roman ?? null, function: info3?.function ?? "unknown", resolution: null, cadence: null, progressions: [] });
      }
      return s;
    };
    const info2 = romanInKey(current4, key);
    if (info2?.isSecondary && info2.secondaryTarget) {
      const target = info2.secondaryTarget.split("/")[1];
      const to = target ? resolutionTarget(target, key, sevenths) : null;
      const s = to ? entry(to) : null;
      if (s) s.resolution = t("next.resolves", { chord: chordLabel(current4), roman: info2.secondaryTarget, target: chordLabel(s.symbol) });
    }
    for (const symbol of keyChords(key, sevenths)) {
      const next = tryParseChord(symbol);
      const cad = next ? tryUMT("cadence", () => UMT.Harmony.analyzeCadence(chord, next, key), null) : null;
      if (!cad || cad === "No standard cadence") continue;
      const s = entry(symbol);
      if (s) s.cadence = { name: cadenceLabel(cad), about: explainCadence(cad) };
    }
    const minorKey = isMinorKey(key);
    const matches = [];
    for (const id of PROGRESSION_IDS) {
      if (isMinorProgression(id) !== minorKey) continue;
      const chords = realizeProgression(id, progressionKey(id, key)).map((c) => c.symbol);
      let best = null;
      chords.forEach((c, i) => {
        if (!sameChord(c, current4)) return;
        const next = chords.slice(i + 1).find((n) => !sameChord(n, current4));
        if (!next) return;
        const before = chords.slice(0, i).reverse().find((p) => !sameChord(p, current4));
        const length = previous && before && sameChord(before, previous) ? 2 : 1;
        if (!best || length > best.length) best = { symbol: next, length };
      });
      const b = best;
      if (b) matches.push({ id, ...b });
    }
    matches.sort((a, b) => b.length - a.length).forEach((m) => entry(m.symbol)?.progressions.push(m.id));
    return out;
  }
  function renderNext(container2, current4, key, items, onPick) {
    if (!current4 || !items.length) {
      container2.innerHTML = `<p class="next-empty">${escapeHtml(t(current4 && !key ? "next.noKey" : current4 ? "next.none" : "next.empty"))}</p>`;
      return;
    }
    const progression = (id) => `<span class="next-reason" title="${escapeHtml(t(`prog.${id}.about`))}">${escapeHtml(t(`prog.${id}`))}</span>`;
    container2.innerHTML = `<ul class="next-list">${items.map((s) => `
    <li class="next-row">
      <button type="button" class="key-chord key-fnb-${s.function}" data-chord="${escapeHtml(s.symbol)}"
        title="${escapeHtml(t("next.play", { chord: chordLabel(s.symbol) }))}">${escapeHtml(chordLabel(s.symbol))}</button>
      <span class="key-roman">${escapeHtml(s.roman ?? "\u2014")}</span>
      <span class="next-why">
        ${s.resolution ? `<span>${escapeHtml(s.resolution)}</span>` : ""}
        ${s.cadence ? `<span class="next-reason"${s.cadence.about ? ` title="${escapeHtml(s.cadence.about)}"` : ""}>${escapeHtml(s.cadence.name)}</span>` : ""}
        ${s.progressions.length ? `<span>${escapeHtml(t("next.inProgressions"))} ${s.progressions.map(progression).join(", ")}</span>` : ""}
      </span>
    </li>`).join("")}</ul>`;
    container2.querySelectorAll(".key-chord").forEach((btn) => btn.addEventListener("click", () => onPick(btn.dataset.chord)));
  }

  // src/ui/ear.ts
  var EAR_MODES = ["interval", "chord", "cadence", "degree"];
  var INTERVALS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
  var CHORDS = ["", "m", "dim", "aug", "sus4", "7", "maj7", "m7", "m7b5", "dim7"];
  var CADENCES2 = {
    authentic: { numerals: "V7 I", umt: "Authentic Cadence (V -> I)" },
    plagal: { numerals: "IV I", umt: "Plagal Cadence (IV -> I)" },
    deceptive: { numerals: "V7 vi", umt: "Deceptive Cadence (V -> vi)" },
    half: { numerals: "IV V", umt: "Half Cadence (-> V)" }
  };
  var DEGREES = ["1", "2", "3", "4", "5", "6", "7"];
  var EAR_ANSWERS = {
    interval: INTERVALS,
    chord: CHORDS,
    cadence: Object.keys(CADENCES2),
    degree: DEGREES
  };
  function earAnswers(mode4) {
    const chosen = mode4 === "chord" ? getPref("ear-chords") : mode4 === "cadence" ? getPref("ear-cadences") : null;
    const list = chosen ? EAR_ANSWERS[mode4].filter((a) => chosen.includes(a)) : EAR_ANSWERS[mode4];
    return list.length ? list : EAR_ANSWERS[mode4];
  }
  var pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];
  var toMidi = (names) => names.map(noteNameToMidi).filter((m) => m !== null);
  function voiceNear(names, rootPc) {
    let midis = toMidi(names);
    if (!midis.length) return [];
    while (Math.min(...midis) >= 67) midis = midis.map((m) => m - 12);
    while (Math.min(...midis) < 55) midis = midis.map((m) => m + 12);
    const bass = 36 + (rootPc % 12 + 12) % 12;
    return [bass, ...midis].map(midiToNoteName);
  }
  function makeQuestion(mode4, rng = Math.random) {
    if (mode4 === "interval") {
      const n = parseInt(pick(INTERVALS, rng));
      const low = 55 + Math.floor(rng() * 12);
      const [a, b] = [midiToNoteName(low), midiToNoteName(low + n)];
      const play = getPref("ear-interval-play");
      const steps3 = play === "harmonic" ? [[a, b]] : play === "down" ? [[b], [a], [a, b]] : [[a], [b], [a, b]];
      return { mode: mode4, answer: String(n), steps: steps3, symbol: null, prev: null, key: null };
    }
    if (mode4 === "chord") {
      const suffix = pick(earAnswers("chord"), rng);
      const root2 = pick(["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"], rng);
      const symbol = root2 + suffix;
      return { mode: mode4, answer: suffix, steps: [chordNoteNames(symbol)], symbol, prev: null, key: null };
    }
    if (mode4 === "degree") {
      const answer2 = pick(DEGREES, rng);
      const key2 = pick(ALL_KEYS.filter((k) => k.endsWith("Major")), rng);
      const chords2 = tryUMT("roman numerals", () => UMT.parseRomanProgression("I IV V7 I", key2), []);
      const scale = tryUMT("scale", () => UMT.parseScaleSymbol(key2).getNotes().map((n) => n.name.replace(/-?\d+$/, "")), []);
      const name = scale[Number(answer2) - 1];
      let midi = noteNameToMidi(name + "4") ?? 60;
      while (midi < 60) midi += 12;
      while (midi >= 72) midi -= 12;
      const note = name + (Math.floor(midi / 12) - 1);
      const steps3 = [...chords2.map((c) => voiceNear(chordNoteNames(c.name), c.rootStep + 9)), [note]];
      return { mode: mode4, answer: answer2, steps: steps3, symbol: null, prev: null, key: key2 };
    }
    const answer = pick(earAnswers("cadence"), rng);
    const key = pick(ALL_KEYS.filter((k) => k.endsWith("Major")), rng);
    const chords = tryUMT("roman numerals", () => UMT.parseRomanProgression(`I ${CADENCES2[answer].numerals}`, key), []);
    const steps2 = chords.map((c) => voiceNear(chordNoteNames(c.name), c.rootStep + 9));
    const symbols = chords.map((c) => c.name);
    return { mode: mode4, answer, steps: steps2, symbol: symbols[2] ?? null, prev: symbols[1] ?? null, key };
  }
  function answerLabel(mode4, answer) {
    if (mode4 === "interval") return answer === "12" ? t("interval.octave") : t(`interval.${answer}`);
    if (mode4 === "chord") return t(`ear.chord.${answer || "maj"}`);
    if (mode4 === "degree") return movableSyllable(["C", "D", "E", "F", "G", "A", "B"][Number(answer) - 1], "C Major") ?? answer;
    return cadenceLabel(CADENCES2[answer].umt, true);
  }
  var STEP_MS = { interval: 700, chord: 0, cadence: 1100, degree: 900 };
  var timers = [];
  function playQuestion(q) {
    timers.forEach(clearTimeout);
    timers = q.steps.map((notes2, i) => setTimeout(() => playNoteNames(notes2, q.mode === "interval" && q.steps.length > 1 && i < 2 ? 0.8 : 1.6), i * STEP_MS[q.mode]));
  }
  var emptyScore = () => ({ interval: { right: 0, total: 0 }, chord: { right: 0, total: 0 }, cadence: { right: 0, total: 0 }, degree: { right: 0, total: 0 } });
  var mode3 = loadChoice("ear-mode", EAR_MODES, "chord");
  var score = { ...emptyScore(), ...loadJSON("ear-score", {}) };
  var question = null;
  function resetEarScore() {
    score = emptyScore();
    save("ear-score", score);
  }
  var answered = false;
  function renderEar(container2, handlers) {
    const tally = score[mode3];
    container2.innerHTML = `
    <div class="ear-head">
      <span class="strings-tabs" role="group" aria-label="${escapeHtml(t("ear.kind"))}">${EAR_MODES.map((m) => `<button type="button" class="strings-tab ear-mode" data-mode="${m}" aria-pressed="${m === mode3}">${escapeHtml(t(`ear.mode.${m}`))}</button>`).join("")}</span>
      <span class="ear-score" title="${escapeHtml(t("ear.score.title"))}">${escapeHtml(t("ear.score", { right: tally.right, total: tally.total }))}</span>
    </div>
    <div class="ear-actions">
      <button id="ear-new" class="ear-new" title="${escapeHtml(t("ear.new.title"))}">${escapeHtml(t("ear.new"))}</button>
      <button id="ear-again" class="ctrl-btn ghost" title="${escapeHtml(t("ear.again.title"))}" aria-label="${escapeHtml(t("ear.again.title"))}"${question ? "" : " disabled"}>\u21BA</button>
    </div>
    <p class="ear-prompt">${escapeHtml(question ? t(`ear.ask.${mode3}`) : t("ear.start"))}</p>
    <div class="ear-answers">
      ${earAnswers(mode3).map((a) => `<button class="ear-answer" data-answer="${escapeHtml(a)}"${question && !answered ? "" : " disabled"}>${escapeHtml(answerLabel(mode3, a))}</button>`).join("")}
    </div>
    <p class="ear-feedback" aria-live="polite"></p>`;
    container2.querySelectorAll(".ear-mode").forEach((b) => b.addEventListener("click", () => {
      mode3 = b.dataset.mode;
      save("ear-mode", mode3);
      question = null;
      renderEar(container2, handlers);
    }));
    container2.querySelector("#ear-new").addEventListener("click", () => {
      question = makeQuestion(mode3);
      answered = false;
      renderEar(container2, handlers);
      playQuestion(question);
    });
    container2.querySelector("#ear-again").addEventListener("click", () => {
      if (question) playQuestion(question);
    });
    container2.querySelectorAll(".ear-answer").forEach((b) => b.addEventListener("click", () => {
      if (!question || answered) return;
      answered = true;
      const given = b.dataset.answer;
      const right = given === question.answer;
      score[mode3].total++;
      if (right) score[mode3].right++;
      save("ear-score", score);
      const q = question;
      renderEar(container2, handlers);
      const correct = answerLabel(q.mode, q.answer);
      const feedback = container2.querySelector(".ear-feedback");
      feedback.className = `ear-feedback ${right ? "ear-right" : "ear-wrong"}`;
      const where = q.key ? ` \xB7 ${keyLabel(q.key)}` : "";
      feedback.textContent = (right ? t("ear.right", { answer: correct }) : t("ear.wrong", { answer: correct })) + where;
      const button = (a) => container2.querySelector(`.ear-answer[data-answer="${CSS.escape(a)}"]`);
      button(q.answer)?.classList.add("ear-correct");
      if (!right) button(given)?.classList.add("ear-missed");
      handlers.show(q);
    }));
  }

  // src/ui/player.ts
  var SPEEDS = ["0.5", "0.6", "0.75", "0.9", "1", "1.1", "1.25"];
  function formatTime(s, tenths = false) {
    if (!isFinite(s) || s < 0) s = 0;
    const d = Math.floor(s * 10 + 1e-6);
    const m = Math.floor(d / 600);
    const sec = Math.floor(d % 600 / 10);
    return `${m}:${String(sec).padStart(2, "0")}${tenths ? `.${d % 10}` : ""}`;
  }
  function computePeaks(samples2, columns) {
    const per = Math.max(1, Math.floor(samples2.length / columns));
    const peaks = [];
    for (let c = 0; c < columns; c++) {
      let max = 0;
      const end = Math.min(samples2.length, (c + 1) * per);
      for (let i = c * per; i < end; i++) {
        const v = Math.abs(samples2[i]);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    return peaks;
  }
  function loopTarget(time, a, b, duration) {
    if (a === null) return null;
    const end = b !== null && b > a ? b : duration;
    return time >= end ? a : null;
  }
  var audio = typeof Audio === "undefined" ? null : new Audio();
  var fileName2 = "";
  var samples = null;
  var loopA = null;
  var loopB = null;
  var speed = loadChoice("player-speed", SPEEDS, "1");
  var frame2 = 0;
  var notes = null;
  var reading2 = null;
  var readFailed = false;
  var readToken = 0;
  var followChords = loadBool("player-chords", true);
  var sentNotes = "";
  var onNotes = () => {
  };
  function setPlayerNotesCallback(cb) {
    onNotes = cb;
  }
  function sendPlayheadNotes() {
    const midis = followChords && notes && audio ? soundingAt(notes, audio.currentTime) : [];
    const key = midis.join();
    if (key === sentNotes) return;
    sentNotes = key;
    onNotes(midis);
  }
  async function readChords(source, rate, container2) {
    const token = ++readToken;
    reading2 = 0;
    readFailed = false;
    showReading(container2);
    try {
      const found = await transcribe(await toModelRate(source, rate), (p) => {
        if (token !== readToken) return;
        reading2 = p;
        showReading(container2);
      });
      if (token !== readToken) return;
      notes = found;
    } catch {
      if (token === readToken) readFailed = true;
    }
    if (token !== readToken) return;
    reading2 = null;
    showReading(container2);
    sendPlayheadNotes();
  }
  function showReading(container2) {
    const el2 = container2.querySelector(".player-reading");
    if (el2) el2.textContent = readingText();
  }
  var readingText = () => reading2 !== null ? t("player.reading", { p: Math.round(reading2 * 100) }) : readFailed ? t("player.readFailed") : "";
  if (audio) {
    audio.preload = "auto";
    audio.preservesPitch = true;
  }
  async function openFile(file, container2) {
    if (!audio) return;
    if (audio.src) URL.revokeObjectURL(audio.src);
    audio.src = URL.createObjectURL(file);
    audio.playbackRate = Number(speed);
    fileName2 = file.name;
    loopA = loopB = null;
    samples = null;
    notes = null;
    readToken++;
    reading2 = null;
    readFailed = false;
    sendPlayheadNotes();
    renderPlayer(container2);
    let rate = 44100;
    try {
      const ctx2 = new OfflineAudioContext(1, 1, 44100);
      const buffer = await ctx2.decodeAudioData(await file.arrayBuffer());
      samples = buffer.getChannelData(0);
      rate = buffer.sampleRate;
    } catch {
      samples = null;
    }
    drawWave(container2);
    if (samples) readChords(samples, rate, container2);
  }
  function drawWave(container2) {
    const canvas = container2.querySelector(".player-wave");
    if (!canvas || !audio) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const g = canvas.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, h);
    const dur = audio.duration;
    const x = (s) => isFinite(dur) && dur > 0 ? s / dur * w : 0;
    if (loopA !== null) {
      g.globalAlpha = 0.25;
      g.fillStyle = color("accent");
      const end = loopB !== null && loopB > loopA ? loopB : dur;
      g.fillRect(x(loopA), 0, x(end) - x(loopA), h);
      g.globalAlpha = 1;
    }
    if (samples) {
      const peaks = computePeaks(samples, w);
      g.fillStyle = color("text-muted");
      peaks.forEach((p, i) => {
        const ph = Math.max(1, p * h * 0.9);
        g.fillRect(i, (h - ph) / 2, 1, ph);
      });
    }
    g.fillStyle = color("cursor");
    g.fillRect(Math.round(x(audio.currentTime)), 0, Math.max(1, dpr), h);
  }
  function tick(container2) {
    cancelAnimationFrame(frame2);
    if (!audio || audio.paused) return;
    const back = loopTarget(audio.currentTime, loopA, loopB, audio.duration);
    if (back !== null) audio.currentTime = back;
    const time = container2.querySelector(".player-time");
    if (time) time.textContent = `${formatTime(audio.currentTime, true)} / ${formatTime(audio.duration)}`;
    drawWave(container2);
    sendPlayheadNotes();
    frame2 = requestAnimationFrame(() => tick(container2));
  }
  function renderPlayer(container2) {
    const loaded = !!audio?.src;
    const dis = loaded ? "" : " disabled";
    const mark = (s) => s === null ? "" : ` ${formatTime(s, true)}`;
    container2.innerHTML = `
    <div class="player-head">
      <label class="ctrl-btn player-open" title="${escapeHtml(t("player.open.title"))}">${escapeHtml(t("player.open"))}<input type="file" accept="audio/*" hidden></label>
      <span class="player-name">${escapeHtml(fileName2 || t("player.none"))}</span>
      <span class="player-reading">${escapeHtml(readingText())}</span>
    </div>
    <canvas class="player-wave" title="${escapeHtml(t("player.wave.title"))}"></canvas>
    <div class="player-ctrl">
      <button class="ctrl-btn" data-act="back" title="${escapeHtml(t("player.back.title"))}"${dis}>\u27F25</button>
      <button class="ctrl-btn" data-act="play" title="${escapeHtml(t("player.play.title"))}"${dis}>${audio && !audio.paused ? "\u23F8" : "\u25B6"}</button>
      <span class="player-time">${formatTime(audio?.currentTime ?? 0, true)} / ${formatTime(audio?.duration ?? 0)}</span>
      <span class="player-speed" role="group" aria-label="${escapeHtml(t("player.speed.title"))}" title="${escapeHtml(t("player.speed.title"))}">
        <button class="size-ctrl-btn" data-speed="-1" aria-label="${escapeHtml(t("ctrl.smaller"))}"${speed === SPEEDS[0] ? " disabled" : ""}>\u2212</button>
        <span class="player-speed-value">${Math.round(Number(speed) * 100)} %</span>
        <button class="size-ctrl-btn" data-speed="1" aria-label="${escapeHtml(t("ctrl.larger"))}"${speed === SPEEDS[SPEEDS.length - 1] ? " disabled" : ""}>+</button>
      </span>
      <button class="size-ctrl-btn${loopA !== null ? " active" : ""}" data-act="a" title="${escapeHtml(t("player.a.title"))}"${dis}>A${mark(loopA)}</button>
      <button class="size-ctrl-btn${loopB !== null ? " active" : ""}" data-act="b" title="${escapeHtml(t("player.b.title"))}"${dis}>B${mark(loopB)}</button>
      <button class="size-ctrl-btn" data-act="clear" title="${escapeHtml(t("player.clear.title"))}"${loopA === null ? " disabled" : ""}>\xD7</button>
      <button class="size-ctrl-btn${followChords ? " active" : ""}" data-act="chords" aria-pressed="${followChords}" title="${escapeHtml(t("player.chords.title"))}">${escapeHtml(t("player.chords"))}</button>
    </div>`;
    const input = container2.querySelector("input[type=file]");
    input.addEventListener("change", () => {
      const f = input.files?.[0];
      if (f) openFile(f, container2);
    });
    container2.ondragover = (e) => {
      e.preventDefault();
    };
    container2.ondrop = (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f || !f.type.startsWith("audio")) return;
      e.preventDefault();
      openFile(f, container2);
    };
    container2.querySelectorAll("[data-speed]").forEach((b) => b.addEventListener("click", () => {
      const i = SPEEDS.indexOf(speed) + Number(b.dataset.speed);
      if (i < 0 || i >= SPEEDS.length) return;
      speed = SPEEDS[i];
      save("player-speed", speed);
      if (audio) audio.playbackRate = Number(speed);
      renderPlayer(container2);
    }));
    container2.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
      const act = b.dataset.act;
      if (act === "chords") {
        followChords = !followChords;
        save("player-chords", followChords);
        sendPlayheadNotes();
        renderPlayer(container2);
        return;
      }
      if (!audio?.src) return;
      if (act === "play") {
        if (audio.paused) audio.play().then(() => tick(container2)).catch(() => {
        });
        else audio.pause();
      } else if (act === "back") audio.currentTime = Math.max(loopA ?? 0, audio.currentTime - 5);
      else if (act === "a") {
        loopA = audio.currentTime;
        if (loopB !== null && loopB <= loopA) loopB = null;
      } else if (act === "b") {
        if (loopA === null) loopA = 0;
        loopB = audio.currentTime > loopA ? audio.currentTime : null;
      } else if (act === "clear") loopA = loopB = null;
      renderPlayer(container2);
    }));
    const canvas = container2.querySelector(".player-wave");
    canvas.addEventListener("click", (e) => {
      if (!audio?.src || !isFinite(audio.duration)) return;
      const r = canvas.getBoundingClientRect();
      audio.currentTime = Math.max(0, Math.min(audio.duration, (e.clientX - r.left) / r.width * audio.duration));
      renderPlayer(container2);
    });
    if (audio) {
      audio.onseeked = () => sendPlayheadNotes();
    }
    if (audio) {
      audio.onloadedmetadata = () => renderPlayer(container2);
      audio.onpause = () => {
        cancelAnimationFrame(frame2);
        renderPlayer(container2);
      };
      audio.onended = () => {
        if (loopA !== null) {
          audio.currentTime = loopA;
          audio.play().catch(() => {
          });
          return;
        }
        cancelAnimationFrame(frame2);
        renderPlayer(container2);
      };
      audio.onplay = () => tick(container2);
    }
    requestAnimationFrame(() => drawWave(container2));
    if (observed !== container2 && typeof ResizeObserver !== "undefined") {
      observed = container2;
      new ResizeObserver(() => drawWave(container2)).observe(container2);
    }
  }
  var observed = null;

  // src/ui/tuner.ts
  function renderTuner(container2, handlers, error) {
    const on = isMicOn();
    const mode4 = getMicMode();
    container2.innerHTML = `
    <div class="tuner-head">
      <button id="tuner-mic" class="ctrl-btn${on ? " active-mode" : ""}" title="${escapeHtml(t("mic.title"))}">${ICONS.mic}${escapeHtml(t(on ? "mic.on" : "mic.off"))}</button>
      ${MIC_MODES.map((m) => `<button class="size-ctrl-btn tuner-mode${m === mode4 ? " active" : ""}" data-mode="${m}" title="${escapeHtml(t(`mic.mode.${m}.title`))}">${escapeHtml(t(`mic.mode.${m}`))}</button>`).join("")}
    </div>
    <div class="tuner-note">\u2014</div>
    <div class="tuner-meter"><span class="tuner-zero"></span><span class="tuner-needle"></span></div>
    <div class="tuner-detail">${escapeHtml(error === "InsecureContext" ? t("mic.insecure") : error ? t("mic.error", { error }) : on ? t("mic.listening") : t("mic.hint"))}</div>`;
    container2.querySelector("#tuner-mic").addEventListener("click", () => handlers.toggle());
    container2.querySelectorAll(".tuner-mode").forEach((b) => b.addEventListener("click", () => {
      setMicMode(b.dataset.mode);
      renderTuner(container2, handlers);
    }));
  }
  function updateTuner(container2, heard) {
    const note = container2.querySelector(".tuner-note");
    const needle = container2.querySelector(".tuner-needle");
    const detail = container2.querySelector(".tuner-detail");
    if (!note || !needle || !detail) return;
    if (!heard) {
      note.textContent = "\u2014";
      needle.style.left = "50%";
      needle.classList.remove("in-tune", "off");
      if (isMicOn()) detail.textContent = t("mic.listening");
      return;
    }
    const name = midiToNoteName(heard.midi);
    note.textContent = noteLabel(name);
    needle.style.left = `${50 + heard.cents}%`;
    needle.classList.toggle("in-tune", Math.abs(heard.cents) <= 5);
    needle.classList.toggle("off", Math.abs(heard.cents) > 15);
    detail.textContent = `${heard.cents > 0 ? "+" : ""}${heard.cents} \xA2 \xB7 ${heard.freq.toFixed(1)} Hz`;
  }

  // src/ui/commands.ts
  var MAX_RESULTS = 8;
  var fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  var words = (s) => fold(s).split(/[^a-z0-9#]+/).filter(Boolean);
  var singular = (w) => w.length > 4 ? w.replace(/e?s$/, "") : w;
  function matchCommands(query, commands) {
    const q = words(query);
    if (!q.length) return [];
    const scored = commands.flatMap((c, i) => {
      const w = words(`${c.label} ${c.hint ?? ""}`);
      if (!q.every((part) => w.some((word) => word.startsWith(part) || word.startsWith(singular(part))))) return [];
      const first = words(c.label.split(":").pop() ?? c.label)[0] ?? "";
      return [{ c, i, rank: first.startsWith(q[0]) ? 0 : 1 }];
    });
    return scored.sort((a, b) => a.rank - b.rank || a.i - b.i).slice(0, MAX_RESULTS).map((s) => s.c);
  }
  function wireCommandSearch(o) {
    let items = [];
    let marked = 0;
    const hide = () => {
      o.list.hidden = true;
      o.input.setAttribute("aria-expanded", "false");
      o.input.removeAttribute("aria-activedescendant");
    };
    const render = () => {
      const q = o.input.value.trim();
      if (!q) {
        items = [];
        hide();
        return;
      }
      const chord = o.chordOf(q);
      items = [
        ...chord ? [{ label: o.playLabel(chord), run: o.submitChord, keep: true }] : [],
        ...matchCommands(q, o.commands())
      ];
      marked = 0;
      o.list.innerHTML = items.length ? items.map((c, i) => `<div id="cmd-${i}" class="cmd-item" role="option" data-i="${i}" aria-selected="${i === marked}"><span>${escapeHtml(c.label)}</span>${c.hint ? `<span class="cmd-hint">${escapeHtml(c.hint)}</span>` : ""}</div>`).join("") : `<div class="cmd-none">${escapeHtml(o.noneLabel(q))}</div>`;
      o.list.hidden = false;
      o.input.setAttribute("aria-expanded", "true");
      mark(0);
    };
    const mark = (i) => {
      if (!items.length) return;
      marked = (i + items.length) % items.length;
      o.list.querySelectorAll(".cmd-item").forEach((el2, j) => el2.setAttribute("aria-selected", String(j === marked)));
      o.input.setAttribute("aria-activedescendant", `cmd-${marked}`);
      o.list.querySelector(`#cmd-${marked}`)?.scrollIntoView({ block: "nearest" });
    };
    const run = (i) => {
      const c = items[i];
      if (!c) {
        o.submitChord();
        return;
      }
      if (c.keep) {
        hide();
        c.run();
        return;
      }
      o.input.value = "";
      hide();
      o.input.blur();
      c.run();
    };
    o.input.addEventListener("input", () => {
      o.input.classList.remove("invalid");
      render();
    });
    o.input.addEventListener("focus", render);
    o.input.addEventListener("blur", hide);
    o.input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" && items.length) {
        e.preventDefault();
        mark(marked + 1);
      } else if (e.key === "ArrowUp" && items.length) {
        e.preventDefault();
        mark(marked - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        run(items.length ? marked : -1);
      } else if (e.key === "Escape") {
        e.stopPropagation();
        if (!o.list.hidden) hide();
        else o.input.blur();
      }
    });
    o.list.addEventListener("pointerdown", (e) => {
      const el2 = e.target.closest(".cmd-item");
      if (!el2) return;
      e.preventDefault();
      run(Number(el2.dataset.i));
    });
  }

  // src/app.ts
  var STAFF_WIDTH = 380;
  var COF_SIZE = 300;
  var staffClef = loadChoice("staff-clef", STAFF_CLEFS, "grand");
  var cofAccidental = loadChoice("cof-accidental", ["flat", "sharp"], "flat");
  var cofShowMinor = loadBool("cof-show-minor", true);
  var cofShowDegrees = loadBool("cof-show-degrees", false);
  var cofShow7ths = loadBool("cof-show-7ths", false);
  var showPrevChord = loadBool("show-prev-chord", false);
  var analysisFieldsVisible = Object.fromEntries(
    // Every field shown at first but Movable do, for who sings: from the panel's menu
    ANALYSIS_FIELD_KEYS.map((f) => [f, loadBool(`analysis-field-${f}`, f !== "movable")])
  );
  var analysisScale = loadNumber("analysis-scale", 13, 10, 24);
  var keyScale = loadNumber("key-scale", 12, 10, 24);
  var keySevenths = loadBool("key-sevenths", false);
  var keyShowNegative = loadBool("key-show-negative", true);
  var keyShowParallel = loadBool("key-show-parallel", true);
  var keyUsualOnly = loadBool("key-usual-borrowings", true);
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
    warning.firstChild.textContent = t(window.isSecureContext ? "page.noMidi" : "page.insecure") + " ";
    $2("cdn-error-banner").textContent = t("page.cdnError");
  }
  function init() {
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {
    });
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
    unlockAudioOnAnyGesture();
    preloadAudio();
    buildLayout();
    watchIconButtons($2("app"));
    wireShortcuts();
    wireComputerKeyboard();
    setComputerKeyboardChange(updateComputerKeyboardButton);
    document.querySelectorAll('[data-act="keyboard"]').forEach((b) => b.addEventListener("click", () => {
      initAudioOnGesture();
      toggleComputerKeyboard();
    }));
    document.querySelectorAll('[data-act="mic"]').forEach((b) => b.addEventListener("click", toggleMic));
    window.addEventListener("pointerup", onPianoRelease);
    window.addEventListener("pointercancel", onPianoRelease);
    wireBar();
    setModeBtn(getMode());
    renderDetector();
    drawEar();
    wireSettings({ resetEarScore: () => {
      resetEarScore();
      drawEar();
    } });
    wirePrefMenus();
    document.querySelector("#menu-ear [data-ear-reset]")?.addEventListener("click", () => {
      resetEarScore();
      drawEar();
    });
    $2("btn-settings").addEventListener("click", () => openSettings());
    applyZoom();
    onPrefChange(applyPref);
    offerSettingsUndo();
    const player = document.getElementById("player-container");
    if (player) renderPlayer(player);
    setPlayerNotesCallback((midis) => setHeardNotes(midis, 80, "player"));
    const metronome = document.getElementById("metronome-container");
    if (metronome) renderMetronome(metronome);
    drawTuner();
    maybeStartTour();
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
      const el2 = document.getElementById("audio-progress");
      if (!el2) return;
      el2.classList.remove("missed");
      void el2.offsetWidth;
      el2.classList.add("missed");
    });
    let progressTimer = null;
    let progressValue = 0;
    setAudioStatusCallback((status2) => {
      const el2 = document.getElementById("audio-status");
      const fill = document.getElementById("audio-progress-fill");
      if (!el2 || !fill) return;
      const known = ["idle", "loading", "suspended", "ready", "error"];
      el2.textContent = known.includes(status2) ? t(`audio.${status2}`) : status2;
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
      onChordClick: (id, symbol, notes2) => {
        state.activeCursorId = id;
        markActiveChord(id);
        if (symbol) showChord(symbol, notes2, previousSongChord(id));
      },
      // The song playing: each chord in the detector, read from the one before it
      onPlayStep: (step2, previous) => {
        if (step2.symbol) showChord(step2.symbol, step2.notes, previous?.symbol ? { symbol: previous.symbol, notes: previous.notes } : null);
      },
      onChordCapture: (id) => {
        state.captureTargetId = id;
        state.activeCursorId = id;
        renderZone3();
      },
      activeCursorId: state.activeCursorId,
      captureTargetId: state.captureTargetId,
      activeKey: songKey2(),
      keyIsAuto: !state.activeKey,
      onSongChange: (song) => {
        state.song = song;
        saveSong(song);
        renderZone3();
      },
      songs: songTabs(),
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
      btn.setAttribute("aria-pressed", String(used === acc));
      btn.disabled = !!key;
      btn.title = key ? t("cof.spelledInKey", { key: keyLabel(key) }) : acc === "flat" ? t("cof.flat.title") : t("cof.sharp.title");
    }
  }
  function pressed(id, on) {
    $2(id).setAttribute("aria-pressed", String(on));
  }
  function wireLayoutEvents() {
    const updateCofButtons = () => {
      syncCofAccidentalButtons();
      pressed("btn-cof-minor", cofShowMinor);
      pressed("btn-cof-deg", cofShowDegrees);
      pressed("btn-cof-7", cofShow7ths);
    };
    updateCofButtons();
    const onCofControl = (id, apply) => {
      $2(id).addEventListener("click", () => {
        apply();
        updateCofButtons();
        renderDiagrams();
      });
    };
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
      analysisScale = Math.max(10, analysisScale - 1);
      save("analysis-scale", analysisScale);
      renderAnalysisPanel();
    });
    $2("btn-analysis-plus").addEventListener("click", () => {
      analysisScale = Math.min(24, analysisScale + 1);
      save("analysis-scale", analysisScale);
      renderAnalysisPanel();
    });
    const clefChips = [...document.querySelectorAll("#menu-staff [data-clef]")];
    const showClef = () => clefChips.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.clef === staffClef)));
    showClef();
    clefChips.forEach((b) => b.addEventListener("click", () => {
      staffClef = b.dataset.clef;
      save("staff-clef", staffClef);
      showClef();
      renderZone1Diagrams(displayedNotes(), selectedSymbol());
    }));
    const prevButtons = [$2("btn-staff-prev"), $2("btn-piano-prev")];
    const showPrev = () => prevButtons.forEach((b) => {
      b.classList.toggle("active", showPrevChord);
      b.setAttribute("aria-pressed", String(showPrevChord));
    });
    showPrev();
    prevButtons.forEach((b) => b.addEventListener("click", () => {
      showPrevChord = !showPrevChord;
      save("show-prev-chord", showPrevChord);
      showPrev();
      renderZone1Diagrams(displayedNotes(), selectedSymbol());
    }));
    ANALYSIS_FIELD_KEYS.forEach((f) => {
      $2(`btn-field-${f}`).addEventListener("click", () => {
        analysisFieldsVisible[f] = !analysisFieldsVisible[f];
        save(`analysis-field-${f}`, analysisFieldsVisible[f]);
        $2(`btn-field-${f}`).classList.toggle("active", analysisFieldsVisible[f]);
        $2(`btn-field-${f}`).setAttribute("aria-pressed", String(analysisFieldsVisible[f]));
        renderAnalysisPanel();
      });
    });
    const updateKeyButtons = () => {
      pressed("btn-key-7", keySevenths);
      pressed("btn-key-neg", keyShowNegative);
      pressed("btn-key-par", keyShowParallel);
      pressed("btn-key-usual", keyUsualOnly);
      pressed("btn-key-colt", keyShowColtrane);
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
      keyScale = Math.max(10, keyScale - 1);
      save("key-scale", keyScale);
    });
    onKeyControl("btn-key-plus", () => {
      keyScale = Math.min(24, keyScale + 1);
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
    onKeyControl("btn-key-usual", () => {
      keyUsualOnly = !keyUsualOnly;
      save("key-usual-borrowings", keyUsualOnly);
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
      closePopover();
    });
    $2("btn-help").addEventListener("click", toggleHelp);
    $2("btn-play-chord").addEventListener("click", playCurrent);
    $2("audio-instrument").addEventListener("change", (e) => {
      setInstrument(e.target.value);
      updateSoundStatus();
    });
    $2("audio-volume").addEventListener("input", (e) => {
      setVolume(parseFloat(e.target.value));
      updateSoundStatus();
    });
  }
  function buildLayout() {
    renderLayout(state.panels, analysisFieldsVisible);
    wireLayoutEvents();
    applyPanelVisibility(state.panels);
    const pianoEl = $2("piano-container");
    let octaves = containerOctaves(pianoEl);
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => {
      const now = containerOctaves(pianoEl);
      if (now !== octaves) {
        octaves = now;
        renderDetector();
      }
    }).observe(pianoEl);
    let shown = currentGrid().map((c) => c.id).sort().join();
    onLayoutChange(() => {
      const now = currentGrid().map((c) => c.id).sort().join();
      if (now === shown) return;
      shown = now;
      for (const k of Object.keys(lastRenderSig)) delete lastRenderSig[k];
      renderDetector();
      renderZone2();
    });
  }
  var autoKey = null;
  var cadencePrev = null;
  var prevVoicing = null;
  var lastChordNotes = [];
  function analysisKey() {
    return state.activeKey ?? autoKey;
  }
  function songKey2() {
    if (state.activeKey) return state.activeKey;
    const chords = state.song.sections.flatMap((s) => s.measures.flatMap((m) => m.chords)).filter((c) => c.valid && c.symbol);
    if (chords.length < 3) return autoKey;
    const entries2 = chords.map((c) => ({ id: c.id, symbol: c.symbol, notes: c.notes?.length ? c.notes : chordNoteNames(c.symbol) }));
    return getAutoKey(entries2) ?? autoKey;
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
  var melody = [];
  var melodyAt = 0;
  var melodyHeld = /* @__PURE__ */ new Set();
  function trackMelody(notes2, detection) {
    const struck = notes2.filter((n) => !melodyHeld.has(n));
    melodyHeld = new Set(notes2);
    if (!detection || !struck.length) return;
    if (detection.kind === "chord") {
      melody = [];
      return;
    }
    const now = Date.now();
    if (now - melodyAt > getPref("melody-gap-s") * 1e3) melody = [];
    melodyAt = now;
    const names = detection.kind === "note" ? [detection.noteName] : detection.notes;
    const midis = detection.kind === "note" ? [detection.midiNumber] : notes2;
    names.forEach((name, i) => {
      const pc3 = name.replace(/-?\d+$/, "");
      if (struck.includes(midis[i]) && !melody.includes(pc3)) melody.push(pc3);
    });
  }
  function refreshAnalysis() {
    const sym = selectedSymbol();
    const notes2 = displayedNotes();
    const sig = `${sym}|${analysisKey()}|${cadencePrev}|${prevVoicing?.join(" ")}|${notes2.join(" ")}|${melody.join(" ")}`;
    if (sig === lastAnalysisSig) return;
    lastAnalysisSig = sig;
    state.analysis = sym ? buildHarmonicAnalysis(sym, analysisKey(), cadencePrev, notes2, prevVoicing) : null;
    const kind2 = state.detection?.kind;
    const useMelody = (kind2 === "note" || kind2 === "interval") && melody.length >= 2;
    noteSet = useMelody ? analyzeNoteSet(melody, analysisKey(), true) : notes2.length >= 2 ? analyzeNoteSet(notes2, analysisKey()) : null;
  }
  function renderAnalysisPanel() {
    const from = selectedSymbol() ? cadencePrev : null;
    const info2 = from ? romanInKey(from, analysisKey()) : null;
    renderZone1Analysis(
      state.detection,
      state.analysis,
      noteSet,
      analysisFieldsVisible,
      analysisScale,
      onAltSelect,
      { from, fromRoman: info2?.roman ?? null, fromFunction: info2?.function ?? null }
    );
  }
  function renderDiagrams() {
    renderZone1Diagrams(displayedNotes(), selectedSymbol());
  }
  function renderExplain() {
    const el2 = document.getElementById("explain-container");
    if (!el2) return;
    const items = explainDetection(state.detection, state.analysis, analysisKey(), cadencePrev);
    const rhythm = state.detection ? rhythmText() : null;
    if (rhythm) items.push({ term: t("ex.term.rhythm"), text: `${rhythm}. ${t("ex.rhythm")}` });
    renderExplanation(el2, items);
  }
  var nextFrom = null;
  var liftingNotes = false;
  var releaseNoted = false;
  function renderNextPanel() {
    const el2 = document.getElementById("next-container");
    if (!el2) return;
    const sym = selectedSymbol();
    if (sym && !liftingNotes) nextFrom = { symbol: sym, notes: displayedNotes(), prev: cadencePrev };
    const key = analysisKey();
    renderNext(el2, nextFrom?.symbol ?? null, key, nextFrom ? suggestNext(nextFrom.symbol, key, nextFrom.prev) : [], onNextPick);
  }
  function onNextPick(chord) {
    const from = nextFrom;
    playChord(chord);
    showChord(chord, void 0, from ? { symbol: from.symbol, notes: from.notes } : null);
  }
  function announceDetection() {
    const d = state.detection;
    if (!d) return;
    if (d.kind === "note") {
      announce(t("a11y.note", { note: noteLabel(d.noteName) }));
      return;
    }
    if (d.kind === "interval") {
      announce(d.intervalName);
      return;
    }
    const sym = selectedSymbol();
    if (!sym) return;
    const chord = tryParseChord(sym);
    const name = chord ? tryUMT("chord names", () => UMT.chordLongName(chord, getLang()), chordLabel(sym)) : chordLabel(sym);
    const a = state.analysis;
    announce(a && a.roman !== "?" ? t("a11y.chord", { chord: name, roman: a.roman, fn: t(`fn.${a.function}`) }) : name);
  }
  function renderDetector() {
    announceDetection();
    renderAnalysisPanel();
    renderExplain();
    renderNextPanel();
    renderProgressionPanel();
    renderDiagrams();
    publishView();
  }
  var sendView = createViewPublisher();
  function publishView() {
    const view2 = viewState();
    sendView(view2);
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
  function togglePresentation() {
    if (isPresenting()) {
      closePresentation();
      return;
    }
    closePopover();
    openPresentation(() => $2("btn-present").classList.remove("active-mode"));
    $2("btn-present").classList.add("active-mode");
  }
  var viewBackground = loadChoice("view-bg", Object.keys(VIEW_BACKGROUNDS), "green");
  function wireViewMenu() {
    const menu = $2("view-menu");
    wirePopover(menu, [$2("btn-views")]);
    const bgSel = $2("view-bg");
    bgSel.value = viewBackground;
    bgSel.addEventListener("change", () => {
      viewBackground = bgSel.value;
      save("view-bg", viewBackground);
    });
    menu.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view2 = btn.dataset.view;
        const [w, h] = VIEW_WINDOW[view2];
        window.open(viewUrl(view2, viewBackground), `modus-view-${view2}`, `popup,width=${w},height=${h}`)?.focus();
        closePopover();
      });
    });
    wirePopover($2("more-menu"), [$2("tab-more")]);
    $2("more-present").addEventListener("click", (e) => {
      e.stopPropagation();
      togglePresentation();
    });
    document.querySelectorAll("[data-export]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ok = await exportDiagram(btn.dataset.export, btn.dataset.format, selectedSymbol() ?? analysisKey());
        if (!ok) btn.classList.add("invalid");
        else closePopover();
      });
    });
    setGuitarVoicingChange(() => publishView());
    $2("btn-present").addEventListener("click", (e) => {
      e.stopPropagation();
      togglePresentation();
    });
  }
  var detectionFromMidi = false;
  var heldNotes = [];
  function respellMidiDetection() {
    if (detectionFromMidi) state.detection = spellDetection(state.detection, analysisKey());
  }
  function showDetection(detection, prev) {
    state.detection = detection;
    cadencePrev = prev?.symbol ?? null;
    prevVoicing = prev?.notes?.length ? spellVoicing(prev.notes, prev.symbol, analysisKey()) : null;
    if (selectedSymbol()) lastChordNotes = displayedNotes();
    refreshAnalysis();
    renderDetector();
  }
  function showChord(symbol, notes2, prev) {
    detectionFromMidi = false;
    showDetection({
      kind: "chord",
      notes: notes2?.length ? spellVoicing(notes2, symbol, analysisKey()) : chordNoteNames(symbol),
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
    const notes2 = selectedSymbol() ? displayedNotes() : lastChordNotes;
    if (notes2.length) playNoteNames(notes2);
  }
  function previousHistoryChord(symbol) {
    return state.history.find((e) => e.symbol !== symbol) ?? null;
  }
  function previousSongChord(chordId) {
    const chords = songChords(state.song).filter((c) => c.symbol);
    const i = chords.findIndex((c) => c.id === chordId);
    return i > 0 ? chords[i - 1] : null;
  }
  var captureTimer = null;
  var captureArmed = true;
  var pendingCapture = null;
  function scheduleCapture(symbol, notes2) {
    if (captureTimer) clearTimeout(captureTimer);
    pendingCapture = { symbol, notes: notes2, since: performance.now() };
    captureTimer = setTimeout(commitCapture, getPref("capture-ms"));
  }
  function commitCapture() {
    if (captureTimer) clearTimeout(captureTimer);
    captureTimer = null;
    const pending3 = pendingCapture;
    pendingCapture = null;
    const targetId = state.captureTargetId;
    if (!pending3 || !targetId) return;
    state.song = updateChord(state.song, targetId, pending3.symbol, pending3.notes);
    saveSong(state.song);
    captureArmed = false;
    const next = findChordAfter(state.song, targetId)?.id ?? null;
    state.activeCursorId = next;
    state.captureTargetId = next;
    renderZone3();
  }
  function cancelCapture() {
    if (captureTimer) {
      clearTimeout(captureTimer);
      captureTimer = null;
    }
    pendingCapture = null;
  }
  function chordChangedBeforeFill() {
    if (pendingCapture && performance.now() - pendingCapture.since >= getPref("capture-ms")) commitCapture();
    else cancelCapture();
  }
  function onNoteChange2(notes2) {
    detectionFromMidi = true;
    const result = spellDetection(analyzeNotes(notes2), analysisKey());
    trackMelody(notes2, result);
    const top = result?.kind === "chord" ? result.candidates[0] : null;
    const known = top && top !== "?" ? top : null;
    if (state.captureTargetId) {
      if (notes2.length < 3) captureArmed = true;
      if (captureArmed && known && result?.kind === "chord") {
        if (pendingCapture && pendingCapture.symbol !== known) chordChangedBeforeFill();
        if (state.captureTargetId && captureArmed) scheduleCapture(known, result.notes);
      } else chordChangedBeforeFill();
    }
    const releasing = notes2.length < heldNotes.length && notes2.every((n) => heldNotes.includes(n));
    liftingNotes = releasing;
    showDetection(result, known ? previousHistoryChord(known) : null);
    liftingNotes = false;
    if (releasing && !releaseNoted) {
      releaseNoted = true;
      notifyChordReleased();
    } else if (!releasing) releaseNoted = false;
    heldNotes = notes2;
    if (known && result?.kind === "chord" && !releasing) notifyChordDetected(known, result.notes);
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
    renderExplain();
  }
  function updateAutoKeyLabel() {
    $2("auto-key-label").textContent = !state.activeKey && autoKey ? t("key.autoDetected", { key: keyLabel(autoKey) }) : "";
    updateKeyButton();
  }
  var lastRenderSig = {};
  function renderIfChanged(name, sig, render) {
    if (lastRenderSig[name] === sig) return;
    lastRenderSig[name] = sig;
    render();
  }
  var pianoNotes = /* @__PURE__ */ new Map();
  function onPianoPress(midi, pointerId) {
    const held2 = pianoNotes.get(pointerId);
    if (held2 !== void 0) pointerUp(held2);
    pianoNotes.set(pointerId, midi);
    pointerDown(midi, getPref("piano-velocity"));
  }
  function onPianoRelease(e) {
    const held2 = pianoNotes.get(e.pointerId);
    if (held2 === void 0) return;
    pianoNotes.delete(e.pointerId);
    pointerUp(held2);
  }
  function submitTypedChord(input) {
    const symbol = readTypedChord(input.value);
    if (!symbol) return;
    const valid2 = isKnownChord(symbol);
    input.classList.toggle("invalid", !valid2);
    if (!valid2) return;
    showChord(symbol, void 0, null);
    playChord(symbol);
  }
  function updateComputerKeyboardButton() {
    const on = isComputerKeyboardOn();
    document.querySelectorAll('[data-act="keyboard"]').forEach((b) => b.classList.toggle("active-mode", on));
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
    const notes2 = noteNames.join(" ");
    syncCofAccidentalButtons();
    const cofOpts = { accidental: cofAccidentalFor(key, cofAccidental), showMinor: cofShowMinor, showDegrees: cofShowDegrees, show7ths: cofShow7ths };
    const prev = showPrevChord && chordSymbol ? prevVoicing : null;
    renderIfChanged("staff", `${notes2}|${key}|${staffClef}|${prev?.join(" ")}`, () => renderStaff($2("staff-container"), noteNames, STAFF_WIDTH, key, 1, staffClef, prev));
    const fn = chordSymbol ? state.analysis?.function ?? null : null;
    renderIfChanged("piano", `${notes2}|${fn}|${prev?.join(" ")}|${containerOctaves($2("piano-container"))}`, () => renderPiano($2("piano-container"), noteNames, fn, onPianoPress, prev));
    const spoken = noteNames.map(noteLabel).join(" ") || t("a11y.nothing");
    for (const [id, key2] of [["staff-container", "a11y.staff"], ["piano-container", "a11y.piano"]]) {
      const el2 = $2(id);
      el2.setAttribute("role", "img");
      el2.setAttribute("aria-label", t(key2, { notes: spoken }));
    }
    const vel = noteVelocities(noteNames);
    renderIfChanged("velocity", JSON.stringify(vel), () => renderVelocity($2("velocity-container"), vel));
    const neck = getStringsView() === "neck" ? `${notes2}|${keyPrefersSharps(key)}` : "";
    const named = !isModuleShown("chord");
    setGuitarShowsName(named);
    renderIfChanged("guitar", `${chordSymbol}|${neck}|${named}`, () => renderGuitar($2("guitar-container"), chordSymbol, noteNames, void 0, !keyPrefersSharps(key)));
    renderIfChanged("cof", `${key}|${chordSymbol}|${JSON.stringify(cofOpts)}`, () => renderCircleOfFifths($2("cof-container"), key, chordSymbol, onCofClick, COF_SIZE, cofOpts));
    const keyOpts = { sevenths: keySevenths, showNegative: keyShowNegative, showParallel: keyShowParallel, showColtrane: keyShowColtrane, usualOnly: keyUsualOnly, fontScale: keyScale };
    const keyTitle = key ? state.activeKey ? keyLabel(key) : t("keyPanel.auto", { key: keyLabel(key) }) : "";
    renderIfChanged("key", `${keyTitle}|${chordSymbol}|${JSON.stringify(keyOpts)}`, () => renderKeyExplorer($2("key-container"), key ? buildKeyMap(key, keySevenths) : null, keyTitle, chordSymbol, onKeyChordClick, keyOpts));
  }
  function onKeyChordClick(chord) {
    playChord(chord);
    showChord(chord, void 0, previousHistoryChord(chord));
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
    showChord(chord, void 0, previousHistoryChord(chord));
  }
  function drawTuner(error) {
    document.querySelectorAll('[data-act="mic"]').forEach((b) => b.classList.toggle("active-mode", isMicOn()));
    const el2 = document.getElementById("tuner-container");
    if (el2) renderTuner(el2, { toggle: toggleMic }, error);
  }
  function toggleMic() {
    if (isMicOn()) {
      stopMic();
      return;
    }
    startMic({
      notes: (midis, velocity2) => setHeardNotes(midis, velocity2),
      frame: (heard) => {
        const el2 = document.getElementById("tuner-container");
        if (el2) updateTuner(el2, heard);
      },
      state: (_on, error) => drawTuner(error)
    });
  }
  function drawEar() {
    const ear = document.getElementById("ear-container");
    if (ear) renderEar(ear, { show: showEarAnswer });
  }
  function applyZoom() {
    const z = getPref("ui-zoom");
    document.body.style.zoom = z === 100 ? "" : String(z / 100);
    document.documentElement.style.setProperty("--zoom", String(z / 100));
  }
  function applyPref(name) {
    if (name === "ui-zoom") {
      applyZoom();
      return;
    }
    if (name.startsWith("ear-")) {
      drawEar();
      return;
    }
    if (name === "key-profile" || name === "auto-modes") {
      autoKey = void 0;
      onHistoryChange(state.history);
    }
    lastAnalysisSig = "";
    for (const k of Object.keys(lastRenderSig)) delete lastRenderSig[k];
    progressionsKey = void 0;
    refreshAnalysis();
    renderDetector();
    renderZone2();
    renderZone3();
  }
  function showEarAnswer(q) {
    if (!q.symbol && q.key && analysisKey() !== q.key) {
      progressionsKey = q.key;
      applyKey(q.key);
    }
    if (!q.symbol) {
      detectionFromMidi = false;
      const notes2 = q.steps[q.steps.length - 1];
      showDetection(spellDetection(analyzeNotes(notes2.map(noteNameToMidi).filter((m) => m !== null)), analysisKey()), null);
      return;
    }
    if (q.key && analysisKey() !== q.key) {
      progressionsKey = q.key;
      applyKey(q.key);
    }
    const last = q.steps[q.steps.length - 1];
    const before = q.steps.length > 1 ? q.steps[q.steps.length - 2] : null;
    showChord(q.symbol, last, q.prev && before ? { symbol: q.prev, notes: before } : null);
  }
  var progressionsKey;
  function renderProgressionPanel() {
    const el2 = document.getElementById("progressions-container");
    if (!el2 || progressionsKey === analysisKey()) return;
    progressionsKey = analysisKey();
    renderProgressions(el2, analysisKey(), {
      play: (symbol, prev, key) => {
        if (analysisKey() !== key) {
          progressionsKey = key;
          applyKey(key);
        }
        playChord(symbol);
        showChord(symbol, void 0, prev ? { symbol: prev, notes: chordNoteNames(prev) } : null);
      }
    });
  }
  function renderZone2() {
    renderHistory(
      $2("zone2-content"),
      analysisKey(),
      (entry) => {
        state.historyActiveCursorId = entry.id;
        const i = state.history.findIndex((e) => e.id === entry.id);
        showChord(entry.symbol, entry.notes, state.history[i + 1] ?? null);
        markActiveHistoryEntry($2("zone2-content"), entry.id);
      },
      state.historyActiveCursorId,
      isModuleShown("song") ? sendActiveToSong : void 0
    );
  }
  function sendActiveToSong() {
    const entry = state.historyActiveCursorId ? state.history.find((e) => e.id === state.historyActiveCursorId) : state.history[0];
    if (entry) sendToSong(entry);
  }
  function escapeAll() {
    if (isPresenting()) {
      closePresentation();
      return;
    }
    if (isSongPlaying()) {
      stopSong();
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
    sel.onchange = () => {
      chooseDevice(sel.value);
      refreshDeviceDropdown();
    };
    const target = resolveDevice();
    if (target) sel.value = target;
    const current4 = devices.find((d) => d.id === sel.value);
    setMidiStatus(current4 ? current4.name : t("midi.noDevices"), current4 ? "var(--ok)" : "var(--text-dim)", devices.length ? t("midi.connected") : t("midi.noDevices"));
    if (!deviceListenersAttached) {
      deviceListenersAttached = true;
      window.addEventListener("midi-devices-changed", () => {
        refreshDeviceDropdown();
        refreshOutputDropdown();
      });
      window.addEventListener("midi-device-disconnected", () => {
        setMidiStatus(t("midi.disconnected"), "var(--danger-soft)", t("midi.disconnected"));
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
    thruBtn.setAttribute("aria-checked", String(thru2));
    sel.addEventListener("change", () => {
      chooseOutput(sel.value || null);
      refreshOutputDropdown();
    });
    ch.addEventListener("change", () => setOutputChannel(parseInt(ch.value)));
    thruBtn.addEventListener("click", () => {
      const on = !getOutputSettings().thru;
      setThru(on);
      thruBtn.setAttribute("aria-checked", String(on));
    });
    $2("midi-device").addEventListener("change", () => setTimeout(refreshOutputDropdown));
  }
  function showMidiBanner(msg) {
    const el2 = $2("midi-banner");
    el2.textContent = msg;
    el2.style.display = "block";
  }
  function wireShortcuts() {
    wireKeyboard({
      toggleHold: () => setModeBtn(getMode() === "hold" ? "normal" : "hold"),
      toggleArpeggio: () => setModeBtn(getMode() === "arpeggio" ? "normal" : "arpeggio"),
      play: playCurrent,
      sendToSong: sendActiveToSong,
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
      openSettings: () => openSettings(),
      closeSettings,
      escape: escapeAll,
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
      showChord(next.symbol, next.notes, previousSongChord(next.id));
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
    showChord(entry.symbol, entry.notes, state.history[at + 1] ?? null);
    playChordOrNotes(entry.symbol, entry.notes);
  }
  function playChordOrNotes(symbol, notes2) {
    if (notes2?.length) playNoteNames(notes2);
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
  function setModeBtn(mode4) {
    setMode(mode4);
    document.querySelectorAll(".mode-btn[data-mode]").forEach((b) => {
      b.classList.toggle("active-mode", b.dataset.mode === mode4);
    });
    $2("mode-status").textContent = t(`mode.${mode4}`);
    $2("mode-hint").textContent = t(`mode.${mode4}.title`);
  }
  var FIFTHS_MAJOR = [6, 1, 8, 3, 10, 5, 0, 7, 2, 9, 4, 11];
  var keyMenuMode = "Major";
  function wireBar() {
    wirePopover($2("input-menu"), [$2("rail-input"), $2("btn-input-status"), $2("tab-input")]);
    wirePopover($2("sound-menu"), [$2("rail-sound"), $2("btn-sound-status"), $2("tab-sound")], () => {
      const filter2 = $2("instrument-filter");
      filter2.value = "";
      renderChoices($2("audio-instrument"), $2("instrument-list"), "");
      $2("instrument-list").querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "center" });
    });
    wirePopover($2("key-menu"), [$2("btn-key")], () => {
      keyMenuMode = keyMode(state.activeKey) ?? "Major";
      renderKeyGrid();
    });
    mirrorChoices($2("midi-device"), $2("midi-device-list"));
    mirrorChoices($2("audio-instrument"), $2("instrument-list"));
    const filter = $2("instrument-filter");
    filter.addEventListener("input", () => renderChoices($2("audio-instrument"), $2("instrument-list"), filter.value));
    $2("key-auto").addEventListener("click", () => pickKey(""));
    document.querySelectorAll("[data-keymode]").forEach((b) => b.addEventListener("click", () => {
      keyMenuMode = KEY_MODES.find((m) => m.toLowerCase() === b.dataset.keymode) ?? "Major";
      renderKeyGrid();
    }));
    railOpen = loadBool("rail-open", true) && !isNarrow();
    applyRail();
    $2("btn-rail").addEventListener("click", () => {
      railOpen = !railOpen;
      if (!isNarrow()) save("rail-open", railOpen);
      applyRail();
    });
    document.addEventListener("pointerdown", (e) => {
      if (!railOpen || !isNarrow() || document.querySelector(".rail-col").contains(e.target)) return;
      railOpen = false;
      applyRail();
    }, true);
    const input = $2("typed-chord");
    wireCommandSearch({
      input,
      list: $2("cmd-results"),
      chordOf: (text) => {
        const symbol = readTypedChord(text);
        return symbol && isKnownChord(symbol) ? chordLabel(symbol) : null;
      },
      submitChord: () => submitTypedChord(input),
      commands: barCommands,
      playLabel: (chord) => t("cmd.play", { chord }),
      noneLabel: (q) => t("cmd.none", { q })
    });
    updateKeyButton();
    updateSoundStatus();
    setAudioStatusDot();
  }
  var railOpen = true;
  function applyRail() {
    document.body.classList.toggle("rail-hidden", !railOpen);
    $2("btn-rail").setAttribute("aria-expanded", String(railOpen));
    if (!railOpen) closePopover();
  }
  function pickKey(key) {
    const sel = $2("key-select");
    sel.value = key;
    sel.dispatchEvent(new Event("change"));
  }
  function renderKeyGrid() {
    document.querySelectorAll("[data-keymode]").forEach((b) => b.classList.toggle("active-mode", b.dataset.keymode === keyMenuMode.toLowerCase()));
    $2("key-auto").classList.toggle("active-mode", !state.activeKey);
    const keys = FIFTHS_MAJOR.map((pc3) => keyOnParent(pc3, keyMenuMode));
    $2("key-grid").innerHTML = keys.map((k) => `<button class="choice-chip${k === state.activeKey ? " active-mode" : ""}" data-key="${k}" title="${escapeHtml(keyLabel(k))}">${escapeHtml(noteLabel(k.split(" ")[0]))}</button>`).join("");
    $2("key-grid").querySelectorAll("[data-key]").forEach((b) => b.addEventListener("click", () => pickKey(b.dataset.key)));
  }
  function updateKeyButton() {
    const shown = state.activeKey ?? autoKey;
    $2("key-btn-name").textContent = shown ? keyLabel(shown) : t("key.none");
    $2("key-btn-auto").textContent = state.activeKey ? "" : t("key.autoShort").toLowerCase();
  }
  function setMidiStatus(text, color2, title) {
    const el2 = $2("midi-status");
    el2.textContent = text;
    el2.title = title;
    el2.style.setProperty("--dot", color2);
    $2("rail-midi-dot").style.background = color2;
  }
  function updateSoundStatus() {
    const name = instrumentLabel($2("audio-instrument").value);
    $2("sound-status").textContent = name;
    const v = Math.round(parseFloat($2("audio-volume").value) * 100);
    $2("volume-value").textContent = `${v} %`;
  }
  function setAudioStatusDot() {
    const status2 = $2("audio-status");
    const dot = () => {
      const fill = $2("audio-progress-fill").style.background || "var(--text-dim)";
      $2("sound-status").style.setProperty("--dot", fill);
    };
    new MutationObserver(dot).observe(status2, { childList: true, characterData: true, subtree: true });
    dot();
  }
  function mirrorChoices(sel, list) {
    const draw2 = () => renderChoices(sel, list, "");
    new MutationObserver(draw2).observe(sel, { childList: true, subtree: true });
    sel.addEventListener("change", draw2);
    list.addEventListener("click", (e) => {
      const b = e.target.closest("[data-value]");
      if (!b || b.hasAttribute("disabled")) return;
      sel.value = b.dataset.value;
      sel.dispatchEvent(new Event("change"));
    });
    draw2();
  }
  function renderChoices(sel, list, filter) {
    const q = filter.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const match = (text) => !q || text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q);
    const option = (o) => `<button class="choice-row" data-value="${escapeHtml(o.value)}" aria-pressed="${o.value === sel.value}"${o.disabled || !o.value && !sel.options.length ? " disabled" : ""}>${escapeHtml(o.text)}</button>`;
    list.innerHTML = [...sel.children].map((child) => {
      if (child instanceof HTMLOptGroupElement) {
        const opts = [...child.children].filter((o) => o instanceof HTMLOptionElement && match(o.text));
        return opts.length ? `<div class="choice-group">${escapeHtml(child.label)}</div>${opts.map(option).join("")}` : "";
      }
      return child instanceof HTMLOptionElement && match(child.text) ? option(child) : "";
    }).join("");
  }
  function barCommands() {
    const input = t("a11y.group.input");
    const keyboardOn = isComputerKeyboardOn();
    return [
      ...["normal", "hold", "arpeggio"].map((m) => ({ label: t("cmd.mode", { mode: t(`mode.${m}`) }), hint: input, run: () => setModeBtn(m) })),
      { label: t("input.keyboard"), hint: keyboardOn ? t("cmd.on") : input, run: () => {
        initAudioOnGesture();
        toggleComputerKeyboard();
      } },
      { label: t("input.mic"), hint: isMicOn() ? t("cmd.on") : input, run: toggleMic },
      { label: t("cmd.keyAuto"), hint: t("a11y.key"), run: () => pickKey("") },
      ...FIFTHS_MAJOR.flatMap((pc3) => KEY_MODES.map((m) => keyOnParent(pc3, m))).map((k) => ({ label: t("cmd.key", { key: keyLabel(k) }), run: () => pickKey(k) })),
      ...layoutCommands(),
      { label: t("cmd.playCurrent"), hint: t("kbd.space"), run: playCurrent },
      { label: t("cmd.send"), hint: "S", run: sendActiveToSong },
      { label: t("cmd.clearHistory"), hint: "C", run: clearHistoryWithUndo },
      { label: t("cmd.escape"), hint: "Esc", run: escapeAll },
      ...panelMenuCommands(),
      { label: t("cmd.present"), hint: "P", run: togglePresentation },
      ...VIEW_NAMES.map((v) => ({ label: t("cmd.view", { name: t(`view.${v}`) }), hint: "OBS", run: () => document.querySelector(`#view-menu [data-view="${v}"]`)?.click() })),
      { label: t("cmd.settings"), run: () => openSettings() },
      { label: t("cmd.help"), hint: "?", run: toggleHelp },
      { label: t("cmd.tour"), run: startTour },
      ...[...document.querySelectorAll("#view-menu [data-export]")].map((b) => ({
        label: t("cmd.export", { name: t(`view.${b.dataset.export}`), format: b.dataset.format.toUpperCase() }),
        hint: t("views.save"),
        run: () => b.click()
      })),
      ...settingsCommands(),
      { label: t("cmd.rail"), run: () => $2("btn-rail").click() },
      ...GM_INSTRUMENT_GROUPS.flatMap((g) => g.instruments.map((i) => ({
        label: t("cmd.instrument", { name: instrumentLabel(i) }),
        hint: t(g.label),
        run: () => {
          const sel = $2("audio-instrument");
          sel.value = i;
          sel.dispatchEvent(new Event("change"));
        }
      })))
    ];
  }
  if (!runViewerFromUrl()) init();
})();
//# sourceMappingURL=app.js.map
