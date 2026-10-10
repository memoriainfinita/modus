"use strict";
(() => {
  // src/input/midi.ts
  function isNoteOff(status2, velocity2) {
    return (status2 & 240) === 128 || (status2 & 240) === 144 && velocity2 === 0;
  }
  var midiAccess = null;
  var selectedDeviceId = null;
  var mode = "normal";
  var activeNotes = /* @__PURE__ */ new Set();
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
  function handleMidiMessage(e) {
    if (!e.data || e.data.length < 3) return;
    const [status2, note, velocity2] = e.data;
    if (isNoteOff(status2, velocity2)) keyUp(note, "controller");
    else if ((status2 & 240) === 144) keyDown(note, velocity2, "controller");
    else if (isSustain(status2, note)) sound.sustain(velocity2 >= 64, "controller");
  }
  function keyDown(note, velocity2, source = "virtual") {
    sound.noteOn(note, velocity2, source);
    handleNoteOn(note);
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
  function isTyping(t) {
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t instanceof HTMLElement && t.isContentEditable;
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

  // src/theory/chord.ts
  var CHORD_FAMILY_COLORS = {
    major: "#f59e0b",
    minor: "#3b82f6",
    dominant: "#ef4444",
    diminished: "#7c3aed",
    "half-diminished": "#7c3aed",
    augmented: "#0d9488",
    sus: "#6b7280"
  };
  var NEUTRAL_COLOR = "#6b7280";
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
    return family ? CHORD_FAMILY_COLORS[family] : NEUTRAL_COLOR;
  }
  function chordNoteNames(symbol) {
    const chord = tryParseChord(symbol);
    if (!chord) return [];
    return tryUMT("chord tones", () => UMT.spellChord(chord), []).filter(Boolean);
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

  // src/detector/analyzer.ts
  var INTERVAL_NAMES = [
    "Unison",
    "Minor 2nd",
    "Major 2nd",
    "Minor 3rd",
    "Major 3rd",
    "Perfect 4th",
    "Tritone",
    "Perfect 5th",
    "Minor 6th",
    "Major 6th",
    "Minor 7th",
    "Major 7th"
  ];
  function semitonesToInterval(semitones) {
    const n = (semitones % 12 + 12) % 12;
    if (n === 0) return semitones === 0 ? { name: "Unison", inversionName: "Octave" } : { name: "Octave", inversionName: "Unison" };
    return { name: INTERVAL_NAMES[n], inversionName: INTERVAL_NAMES[12 - n] };
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
    candidates = tryUMT("chord detection", () => (UMT.Harmony.detectChords(noteNames.map((n) => UMT.parseNote(n))) ?? []).map(normalizeChordName).filter(isKnownChord), []);
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
    const a = chord ? tryUMT("progression", () => UMT.Harmony.analyzeProgression([chord], key).analysis[0], null) : null;
    const info = a ? {
      roman: a.isSecondary && a.secondaryTarget ? a.secondaryTarget : a.roman ?? "?",
      degree: a.roman ?? "?",
      function: a.function ?? "unknown",
      isDiatonic: a.isDiatonic ?? false,
      isBorrowed: a.isBorrowed ?? false,
      borrowedFrom: a.borrowedFrom,
      isSecondary: a.isSecondary ?? false,
      secondaryTarget: a.secondaryTarget
    } : null;
    romanCache.set(cacheKey, info);
    return info;
  }
  function progressionCadences(chords, key) {
    const none = chords.map(() => null);
    if (!key || chords.length < 2) return none;
    const parsed = chords.map(tryParseChord);
    if (parsed.some((c) => !c)) {
      return chords.map((_, i) => parsed[i] && parsed[i + 1] ? progressionCadences([chords[i], chords[i + 1]], key)[0] : null);
    }
    const analysis = tryUMT("progression", () => UMT.Harmony.analyzeProgression(parsed, key).analysis, []);
    return chords.map((_, i) => analysis[i]?.cadenceWithNext ?? null);
  }
  function buildHarmonicAnalysis(chordSymbol, activeKey, prevChordSymbol) {
    const chord = tryParseChord(chordSymbol);
    if (!chord) return emptyAnalysis(chordSymbol);
    const result = emptyAnalysis(chordSymbol);
    const bassNote = tryUMT("notes", () => chord.getNotes()[0] ?? null, null);
    if (bassNote) result.figuredBass = tryUMT("figured bass", () => UMT.FiguredBass.fromChord(chord, bassNote), "");
    result.suggestedScales = tryUMT("scales", () => UMT.Harmony.getSuggestedScales(chord).map((s) => s.scale), []);
    if (!activeKey) return result;
    const a = romanInKey(chordSymbol, activeKey);
    if (a) Object.assign(result, a);
    const prevChord = tryParseChord(prevChordSymbol);
    if (prevChord) {
      const cad = tryUMT("cadence", () => UMT.Harmony.analyzeCadence(prevChord, chord, activeKey), null);
      if (cad && cad !== "No standard cadence") result.cadence = cad;
    }
    result.substitutions = tryUMT("substitutions", () => UMT.getSubstitutions(chord, activeKey).map((s) => {
      const name = s.chord?.name ?? s.name ?? String(s);
      return s.type ? `${name} (${s.type})` : name;
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
      cadence: null
    };
  }
  function getAutoKey(history) {
    const noteNames = history.flatMap((e) => e.notes);
    if (noteNames.length === 0) return null;
    return normalizeKey(tryUMT("key detection", () => UMT.KeyDetection.detect(noteNames.map((n) => UMT.parseNote(n)))[0]?.key ?? null, null));
  }

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
    { label: "Piano", instruments: ["acoustic_grand_piano", "bright_acoustic_piano", "electric_grand_piano", "honkytonk_piano", "electric_piano_1", "electric_piano_2", "harpsichord", "clavinet"] },
    { label: "Chromatic Perc", instruments: ["celesta", "glockenspiel", "music_box", "vibraphone", "marimba", "xylophone", "tubular_bells", "dulcimer"] },
    { label: "Organ", instruments: ["drawbar_organ", "percussive_organ", "rock_organ", "church_organ", "reed_organ", "accordion", "harmonica", "tango_accordion"] },
    { label: "Guitar", instruments: ["acoustic_guitar_nylon", "acoustic_guitar_steel", "electric_guitar_jazz", "electric_guitar_clean", "electric_guitar_muted", "overdriven_guitar", "distortion_guitar", "guitar_harmonics"] },
    { label: "Bass", instruments: ["acoustic_bass", "electric_bass_finger", "electric_bass_pick", "fretless_bass", "slap_bass_1", "slap_bass_2", "synth_bass_1", "synth_bass_2"] },
    { label: "Strings", instruments: ["violin", "viola", "cello", "contrabass", "tremolo_strings", "pizzicato_strings", "orchestral_harp", "timpani"] },
    { label: "Ensemble", instruments: ["string_ensemble_1", "string_ensemble_2", "synth_strings_1", "synth_strings_2", "choir_aahs", "voice_oohs", "synth_voice", "orchestra_hit"] },
    { label: "Brass", instruments: ["trumpet", "trombone", "tuba", "muted_trumpet", "french_horn", "brass_section", "synth_brass_1", "synth_brass_2"] },
    { label: "Reed", instruments: ["soprano_sax", "alto_sax", "tenor_sax", "baritone_sax", "oboe", "english_horn", "bassoon", "clarinet"] },
    { label: "Pipe", instruments: ["piccolo", "flute", "recorder", "pan_flute", "blown_bottle", "shakuhachi", "whistle", "ocarina"] },
    { label: "Synth Lead", instruments: ["lead_1_square", "lead_2_sawtooth", "lead_3_calliope", "lead_4_chiff", "lead_5_charang", "lead_6_voice", "lead_7_fifths", "lead_8_bass_lead"] },
    { label: "Synth Pad", instruments: ["pad_1_new_age", "pad_2_warm", "pad_3_polysynth", "pad_4_choir", "pad_5_bowed", "pad_6_metallic", "pad_7_halo", "pad_8_sweep"] },
    { label: "Synth FX", instruments: ["fx_1_rain", "fx_2_soundtrack", "fx_3_crystal", "fx_4_atmosphere", "fx_5_brightness", "fx_6_goblins", "fx_7_echoes", "fx_8_sci-fi"] },
    { label: "Ethnic", instruments: ["sitar", "banjo", "shamisen", "koto", "kalimba", "bag_pipe", "fiddle", "shanai"] },
    { label: "Percussive", instruments: ["tinkle_bell", "agogo", "steel_drums", "woodblock", "taiko_drum", "melodic_tom", "synth_drum", "reverse_cymbal"] },
    { label: "Sound FX", instruments: ["guitar_fret_noise", "breath_noise", "seashore", "bird_tweet", "telephone_ring", "helicopter", "applause", "gunshot"] }
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
  function buildStaffAbc(noteNames, keyStr) {
    const { abcKey, accidentals } = keySignature(keyStr);
    const header = `X:1
M:none
L:1
K:${abcKey}
`;
    const abcNotes = noteNames.flatMap((n) => {
      const m = n.match(/^([A-G])(#{0,2}|b{0,2})(-?\d+)$/);
      if (!m) return [];
      const [, letter, acc, octStr] = m;
      const keyAcc = accidentals[letter] ?? "";
      const mark = acc === keyAcc ? "" : acc ? acc.replace(/#/g, "^").replace(/b/g, "_") : "=";
      const oct = parseInt(octStr);
      const pitch = oct >= 5 ? letter.toLowerCase() + "'".repeat(oct - 5) : oct === 4 ? letter : letter + ",".repeat(4 - oct);
      return [mark + pitch];
    });
    return header + (abcNotes.length ? `[${abcNotes.join("")}]1` : "z");
  }
  function renderStaff(container, noteNames, width = 380, keyStr = null, scale = 2) {
    ABCJS.renderAbc(container, buildStaffAbc(noteNames, keyStr), { staffwidth: width - 20, scale });
  }

  // src/diagrams/piano.ts
  function renderPiano(container, noteNames, chordSymbol, onPress) {
    const color = chordSymbol ? chordColor(chordSymbol) : NEUTRAL_COLOR;
    const colors = noteNames.map(() => color);
    container.innerHTML = Notae.renderPiano({
      name: "",
      keys: noteNames,
      colors,
      range: { from: "C2", to: "B5" }
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
  var DARK_FRETBOARD_STYLE = {
    chordNameColor: "#e0e0e0",
    fretLabelColor: "#9ca3af",
    nutColor: "#aaaaaa",
    indicatorColor: "#9ca3af",
    stringLabelColor: "#9ca3af"
  };

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
    standard: { notae: ["E", "A", "D", "G", "B", "E"], label: "Standard" },
    dropD: { notae: ["D", "A", "D", "G", "B", "E"], label: "Drop D" },
    openG: { notae: ["D", "G", "D", "G", "B", "D"], label: "Open G" }
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
    const match = Object.entries(GUITAR_TUNINGS).find(([, t]) => t.notae.every((n, i) => n === notes[i]));
    return match ? match[0] : "custom";
  }
  function guitarStyle() {
    const sp = guitarSpacing;
    return {
      ...DARK_FRETBOARD_STYLE,
      stringSpacing: sp,
      fretSpacing: Math.round(sp * 23 / 19),
      dotRadius: Math.max(5, Math.round(sp * 9 / 19)),
      fingerNumberSize: Math.max(6, Math.round(sp * 8 / 19)),
      showStringLabels: guitarLabelMode !== "none",
      ...guitarLabelMode !== "none" ? {
        stringLabelMode: guitarLabelMode,
        stringLabelPosition: "bottom",
        stringLabelColor: "#9ca3af"
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
    <button class="guitar-nav" data-dir="-1" title="Previous voicing">\u2039</button>
    <span class="guitar-voicing-count">${idx + 1}/${total}</span>
    <button class="guitar-nav" data-dir="1" title="Next voicing">\u203A</button>` : "";
    const tunerRow = guitarTunerExpanded ? `
    <div class="tuner-row">
      ${guitarStringTuning.map(
      (note, i) => `<input class="guitar-string-input" data-string="${i}" value="${note}" title="String ${6 - i}" maxlength="2">`
    ).join("")}
    </div>` : "";
    return `
    <div id="guitar-ctrl-wrap" style="display:${guitarControlsVisible ? "flex" : "none"}">
      <div class="guitar-ctrl-row">
        ${nav || '<span class="guitar-nav-placeholder">\u2014</span>'}
        <button class="guitar-size-btn guitar-ctrl" data-action="size-minus" title="Smaller diagram">\u2212</button>
        <button class="guitar-size-btn guitar-ctrl" data-action="size-plus"  title="Larger diagram">+</button>
      </div>
      <div class="guitar-ctrl-row-wrap">
        ${btn("label-none", "Off", guitarLabelMode === "none", "Hide string labels")}
        ${btn("label-tuning", FORK_ICON, guitarLabelMode === "tuning", "Show open string notes (tuning)")}
        ${btn("label-notes", NOTE_ICON, guitarLabelMode === "notes", "Show fretted note names")}
        <select class="guitar-tuning-sel" title="Tuning preset">
          ${Object.entries(GUITAR_TUNINGS).map(
      ([k, t]) => `<option value="${k}" ${guitarTuningKey === k ? "selected" : ""}>${t.label}</option>`
    ).join("")}
          <option value="custom" ${guitarTuningKey === "custom" ? "selected" : ""}>Custom</option>
        </select>
        ${btn("toggle-tuner", "\u270E", guitarTunerExpanded, "Edit string tuning")}
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
      container.innerHTML = '<div class="no-voicing">No voicings</div>' + guitarControls(0, 0);
      wireGuitarControls(container);
      return;
    }
    const total = voicings.length;
    const idx = Math.min(guitarVoicingIdx, total - 1);
    let svg = "";
    try {
      svg = Notae.renderFretboard(
        { name: chordSymbol, ...voicings[idx], tuning: guitarStringTuning },
        guitarStyle()
      );
    } catch {
    }
    container.innerHTML = `<div>${svg}</div>` + guitarControls(total, idx);
    container.querySelectorAll(".guitar-nav").forEach((btn) => {
      btn.addEventListener("click", () => {
        guitarVoicingIdx = (idx + parseInt(btn.dataset.dir) + total) % total;
        renderGuitar(container, lastGuitarSymbol, lastNoteNames);
        onVoicingChange(guitarVoicingIdx);
      });
    });
    wireGuitarControls(container);
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
    let last = "";
    channel2?.addEventListener("message", (e) => {
      if (e.data?.type === "hello" && current2) channel2.postMessage({ type: "state", state: current2 });
    });
    return (state2) => {
      current2 = state2;
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
  function viewUrl(view, bg, base = location.href) {
    const url = new URL(base);
    url.search = new URLSearchParams({ view, bg }).toString();
    url.hash = "";
    return url.toString();
  }
  var VIEW_WINDOW = {
    chord: [640, 360],
    staff: [800, 320],
    cof: [520, 520],
    piano: [960, 300],
    guitar: [380, 460]
  };

  // src/diagrams/cof.ts
  var CIRCLE_KEYS_FLAT = ["C", "G", "D", "A", "E", "B", "Gb", "Db", "Ab", "Eb", "Bb", "F"];
  var CIRCLE_KEYS_SHARP = ["C", "G", "D", "A", "E", "B", "F#", "C#", "Ab", "Eb", "Bb", "F"];
  var CIRCLE_KEYS_MINOR_FLAT = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm"];
  var CIRCLE_KEYS_MINOR_SHARP = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m", "Fm", "Cm", "Gm", "Dm"];
  var CIRCLE_DIM = ["B", "F#", "C#", "G#", "D#", "A#", "F", "C", "G", "D", "A", "E"];
  var pitchClass = pitchClassOf;
  var rootOf = (symbol) => symbol.match(/^([A-G][b#]*)/)?.[1] ?? "";
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
    const TIP = "Click: play \xB7 double-click: set as key";
    const diatonicPos = activePos !== -1 ? /* @__PURE__ */ new Set([(activePos + 11) % 12, activePos, (activePos + 1) % 12]) : /* @__PURE__ */ new Set();
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
      const fill = isTonic ? "#4f46e5" : isChordRoot ? "#0d9488" : isDiatonic ? "#252550" : "#2d2d44";
      const stroke = isChordRoot ? "#0d9488" : isDiatonic ? "#7c7ca0" : "#4a4a6a";
      const suffix7 = opts.show7ths ? relPos === 1 ? "7" : "maj7" : "";
      svg += `<path d="${ring(outerR, innerR, angle, nextAngle)}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor:pointer"
      data-chord="${key + suffix7}" data-key="${key} Major"><title>${TIP}</title></path>`;
      svg += label(
        cx + labelR * Math.cos(midAngle),
        cy + labelR * Math.sin(midAngle),
        majorFont,
        "#e0e0e0",
        key + suffix7,
        showDeg ? degreeOf(key) : null,
        "#a5b4fc"
      );
      if (!opts.showMinor) return;
      const minorRoot = rootOf(minorKeys[i]);
      const isMinorTonic = activePos === i && keyIsMinor;
      const isMinorChordHere = isMinorActiveChord && chordRootPc === pitchClass(minorRoot);
      const minorChord = minorKeys[i] + (opts.show7ths ? "7" : "");
      const minorSegFill = isMinorTonic ? "#4f46e5" : isMinorChordHere ? "#0d9488" : isDiatonic ? "#252550" : "transparent";
      const minorSegStroke = isMinorTonic ? "#4f46e5" : isMinorChordHere ? "#0d9488" : isDiatonic ? "#7c7ca0" : "transparent";
      svg += `<path d="${ring(minorOutR, minorInR, angle, nextAngle)}" fill="${minorSegFill}" stroke="${minorSegStroke}" stroke-width="1"
      pointer-events="all" style="cursor:pointer" data-chord="${minorChord}" data-key="${minorRoot} Minor"><title>${TIP}</title></path>`;
      const minorFill = isMinorTonic || isMinorChordHere ? "#e0e0e0" : isDiatonic ? "#c4b5fd" : "#9ca3af";
      svg += label(
        cx + minorR * Math.cos(midAngle),
        cy + minorR * Math.sin(midAngle),
        minorFont,
        minorFill,
        minorChord,
        showDeg ? degreeOf(minorKeys[i]) : null,
        "#818cf8"
      );
      const dimRoot = CIRCLE_DIM[i];
      const isDiatonicDim = i === activePos;
      const isDimChordHere = isDimActiveChord && chordRootPc === pitchClass(dimRoot);
      const dimChord = `${dimRoot}${opts.show7ths ? "m7b5" : "dim"}`;
      svg += `<path d="${ring(dimOutR, dimInR, angle, nextAngle)}"
      fill="${isDimChordHere ? "#0d9488" : isDiatonicDim ? "#2a2a5a" : "#1e1e35"}" stroke="${isDiatonicDim ? "#a0a0d8" : "#3a3a5c"}" stroke-width="${isDiatonicDim ? 1.5 : 1}"
      pointer-events="all" style="cursor:pointer" data-chord="${dimChord}"><title>Click: play</title></path>`;
      const dimText = opts.show7ths ? `${dimRoot}\xF87` : `${dimRoot}\xB0`;
      svg += label(
        cx + dimLabR * Math.cos(midAngle),
        cy + dimLabR * Math.sin(midAngle),
        dimFont,
        isDimChordHere ? "#e0e0e0" : isDiatonicDim ? "#a78bfa" : "#6b7280",
        dimText,
        showDeg ? degreeOf(`${dimRoot}dim`) : null,
        "#818cf8"
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
  var FUNCTION_NAMES = { T: "Tonic", S: "Subdominant", D: "Dominant" };
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
  function cofOptions() {
    return {
      accidental: loadChoice("cof-accidental", ["flat", "sharp"], "flat"),
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
    const color = s.symbol ? chordColor(s.symbol) : NEUTRAL_COLOR;
    const detail = s.kind === "chord" && s.roman && s.roman !== "?" ? [s.roman, s.function ? FUNCTION_NAMES[s.function] : null].filter(Boolean).join(" \xB7 ") : "";
    el.innerHTML = `
    <div class="view-chord-name" style="color:${color}">${escapeHtml(s.label)}</div>
    ${detail ? `<div class="view-chord-detail">${escapeHtml(detail)}</div>` : ""}`;
  }
  function render(view, el, s) {
    if (view === "chord") return renderChordView(el, s);
    if (view === "staff") {
      el.innerHTML = "<div></div>";
      const inner = el.firstElementChild;
      renderStaff(inner, s.notes, 200, s.key, 1);
      inner.style.height = "100%";
      inner.style.width = "100%";
    } else if (view === "cof") renderCircleOfFifths(el, s.key, s.symbol, () => {
    }, 400, { ...cofOptions(), backdrop: "#1a1a2e" });
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
    document.body.classList.add("view-mode");
    document.body.style.background = background;
    document.getElementById("app").style.display = "none";
    const el = document.createElement("div");
    el.id = "view-content";
    el.className = `view-${view}`;
    document.body.appendChild(el);
    subscribeView((s) => render(view, el, s));
    window.addEventListener("storage", (e) => {
      if (e.key && /^(guitar-|cof-)/.test(e.key)) location.reload();
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
      ...DARK_FRETBOARD_STYLE,
      numFrets: NECK_FRETS,
      dotColor: "#3b82f6",
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
      for (const t of tryUMT("chord tones", () => UMT.spellChord(chord), [])) {
        const base = t.replace(/-?\d+$/, "");
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
  var cache = /* @__PURE__ */ new Map();
  function buildKeyMap(key, sevenths) {
    const cacheKey = `${key}|${sevenths}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const chords = tryUMT("diatonic chords", () => UMT.parseScaleSymbol(key).getDiatonicChords(sevenths ? "seventh" : "triad"), []);
    if (!chords.length) {
      cache.set(cacheKey, null);
      return null;
    }
    const diatonic = chords.map((c) => keyChord(c.name, key));
    const negative = chords.map((c) => tryUMT("negative harmony", () => {
      const name = UMT.Harmony.getNegativeHarmony(c, key)?.name;
      return name ? spellChordSymbol(name, key) : null;
    }, null));
    const byMode = /* @__PURE__ */ new Map();
    for (const b of tryUMT("borrowed chords", () => UMT.Harmony.getBorrowedChords(key), [])) {
      const name = b.chord?.name;
      if (!name || !tryParseChord(name)) continue;
      let row = byMode.get(b.sourceMode);
      if (!row) byMode.set(b.sourceMode, row = { mode: b.sourceMode, brightness: b.brightness ?? 0, chords: [] });
      row.chords.push(keyChord(name, key));
    }
    const parallel = [...byMode.values()].sort((a, b) => b.brightness - a.brightness);
    const axis = tryUMT("coltrane axis", () => UMT.Harmony.getColtraneAxis(key).majorThirds, null);
    const coltraneAxis = axis ? axis.map((n) => spellPitchClassInKey(n, key)) : null;
    const map = { key, diatonic, negative, parallel, coltraneAxis };
    cache.set(cacheKey, map);
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
  var FUNCTION_NAMES2 = { T: "Tonic", S: "Subdominant", D: "Dominant", unknown: "Unknown function" };
  var describe = (c) => [c.roman, c.secondary && `also ${c.secondary}`, FUNCTION_NAMES2[c.function]].filter(Boolean).join(" \xB7 ");
  function renderKeyExplorer(container, map, keyLabel, activeChord, onChordClick, opts) {
    container.style.fontSize = opts.fontScale + "px";
    if (!map) {
      container.innerHTML = `<div class="key-empty">Pick a key, or play: on Auto the detected key shows here.</div>`;
      return;
    }
    const button = (symbol, cls, title) => `<button class="key-chord ${cls}${sameChord(symbol, activeChord) ? " active" : ""}" data-chord="${escapeHtml(symbol)}"
      title="${escapeHtml(title)}" style="border-left-color:${chordColor(symbol)}">${escapeHtml(symbol)}</button>`;
    const cell = (c) => `
    <div class="key-cell">
      <span class="key-roman">${escapeHtml(c.roman)}</span>
      ${button(c.symbol, "", describe(c))}
      <span class="key-function key-fn-${c.function}" title="${FUNCTION_NAMES2[c.function]}">${c.function === "unknown" ? "\xB7" : c.function}</span>
    </div>`;
    let html = `<div class="key-main"><div class="key-title">${escapeHtml(keyLabel)}</div>`;
    html += `<div class="key-grid">${map.diatonic.map(cell).join("")}</div>`;
    if (opts.showNegative) {
      html += `<div class="key-section-label" title="Each diatonic chord mirrored around the axis between the minor and major 3rd of the tonic (Harmony.getNegativeHarmony)">Negative harmony</div>
      <div class="key-grid">${map.negative.map(
        (n, i) => `<div class="key-cell">${n ? button(n, "", `Negative of ${map.diatonic[i].symbol}`) : '<span class="key-roman">\u2014</span>'}</div>`
      ).join("")}</div>`;
    }
    if (opts.showColtrane && map.coltraneAxis) {
      html += `<div class="key-axis" title="Tonics a major third apart (Harmony.getColtraneAxis)">
      <span class="key-section-label">Coltrane axis</span> ${map.coltraneAxis.map(escapeHtml).join(" \xB7 ")}</div>`;
    }
    html += "</div>";
    if (opts.showParallel && map.parallel.length) {
      html += `<div class="key-parallel"><div class="key-section-label" title="Seventh chords of each mode on the same tonic that use a note outside the key (Harmony.getBorrowedChords)">Parallel modes</div><div class="key-mode-grid">`;
      html += map.parallel.map((row) => `
      <div class="key-mode-row">
        <span class="key-mode-name">${escapeHtml(row.mode)}</span>
        <div class="key-mode-chords">${row.chords.map((c) => `
          <span class="key-mode-chord">
            <span class="key-roman">${escapeHtml(c.roman)}</span>
            ${button(c.symbol, "", `${describe(c)} \xB7 from ${row.mode}`)}
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
    el.innerHTML = `<span>${escapeHtml(message)}</span><button class="undo-btn">Undo</button>`;
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
    "T": "#f59e0b",
    "S": "#3b82f6",
    "D": "#ef4444",
    "unknown": "#6b7280"
  };
  var entries = [];
  var debounceTimer = null;
  var lastAutoAppended = null;
  var onChange2 = () => {
  };
  function setHistoryChangeCallback(cb) {
    onChange2 = cb;
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
    showUndo(`History cleared (${before.length})`, () => restoreEntries(before));
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
  function shortCadence(name) {
    return name.replace(/\s*\(.*\)$/, "").replace(/ Cadence$/, "").replace(/ Resolution$/, "");
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
    const cadences = progressionCadences(shown.map((e) => e.symbol).reverse(), activeKey).reverse();
    shown.forEach((entry, i) => {
      const cadence = i + 1 < shown.length ? cadences[i + 1] : null;
      const analysis = romanInKey(entry.symbol, activeKey);
      const roman = analysis?.roman ?? "\u2014";
      const fn = analysis?.function ?? "unknown";
      const color = FUNCTION_COLORS[fn] ?? "#6b7280";
      const chip = document.createElement("div");
      chip.className = "history-chip";
      chip.dataset.id = entry.id;
      chip.classList.toggle("active-cursor", activeCursorEntryId === entry.id);
      chip.style.borderLeft = `3px solid ${color}`;
      chip.innerHTML = `
      <span class="history-chip-symbol">${escapeHtml(entry.symbol)}</span>
      <span class="history-chip-roman">${escapeHtml(roman)}</span>
    `;
      chip.addEventListener("click", () => {
        onChipClick(entry);
        if (entry.notes.length > 0) playNoteNames(entry.notes);
        else playChord(entry.symbol);
      });
      chip.title = `${entry.symbol} \u2014 click to play, drag to song, right-click to remove`;
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
        showUndo(`Removed ${entry.symbol}`, () => restoreEntries(before));
      });
      strip.appendChild(chip);
      if (cadence) {
        const tag = document.createElement("span");
        tag.className = "history-cadence";
        tag.textContent = shortCadence(cadence);
        tag.title = `${cadence}: ${shown[i + 1].symbol} \u2192 ${entry.symbol}`;
        strip.appendChild(tag);
      }
    });
    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.title = "Clear history (C) \u2014 can be undone";
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
    return { schemaVersion: 2, id: newId(), title: "Untitled", key: null, updatedAt: Date.now(), sections: [] };
  }
  function isBlankSong(song) {
    return !song.sections.length && song.title === "Untitled";
  }
  function newId() {
    return crypto.randomUUID();
  }
  function newMeasure() {
    return { id: newId(), chords: [] };
  }
  function addSection(song, name, color) {
    const section = {
      id: newId(),
      name,
      color,
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
    return text.split(/[\s,\n|]+/).map((t) => t.trim()).filter(Boolean);
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
      const t = midi + semitones;
      return names[(t % 12 + 12) % 12] + (Math.floor(t / 12) - 1);
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
    if (sectionNames.length === 0) return "Empty";
    const map = /* @__PURE__ */ new Map();
    let letter = 65;
    const letters = sectionNames.map((name) => {
      const key = name.trim().toLowerCase();
      if (!map.has(key)) map.set(key, String.fromCharCode(letter++));
      return map.get(key);
    });
    const pattern = letters.join("");
    if (/^(AB)+$/.test(pattern)) return `Verse-Chorus (${pattern})`;
    if (/^AABA/.test(pattern)) return `AABA (${pattern})`;
    if (/^(A+B+A+)$/.test(pattern)) return `Ternary (${pattern})`;
    if (pattern === "A") return "Single section (A)";
    if (/^A+$/.test(pattern)) return `Strophic (${pattern})`;
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
    return withoutEmptyChords({ ...createSong(), title: legacy.title ?? "Untitled", key, sections: legacy.sections });
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
    intro: "#7c3aed",
    verse: "#2563eb",
    prechorus: "#0891b2",
    chorus: "#16a34a",
    bridge: "#d97706",
    outro: "#6b7280",
    custom: "#4b5563"
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
    if (chord) applyWithUndo(removeChord(_song, chordId), `Removed ${chord.symbol || "chord"}`);
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
    songSelect.title = "Saved songs";
    const metas = h.songs.some((m) => m.id === song.id) ? h.songs : [{ id: song.id, title: song.title, updatedAt: song.updatedAt }, ...h.songs];
    songSelect.innerHTML = metas.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.id === song.id ? song.title : m.title) || "Untitled"}</option>`).join("");
    songSelect.value = song.id;
    songSelect.addEventListener("change", () => h.onOpenSong(songSelect.value));
    const newBtn = makeBtn("New", "#374151", () => {
      if (isBlankSong(_song)) return;
      h.onNewSong();
    });
    newBtn.title = "Start a new song; the current one stays in the list";
    const deleteBtn = makeBtn("Delete", "#374151", () => h.onDeleteSong());
    deleteBtn.title = "Delete this song \u2014 can be undone";
    const pasteArea = document.createElement("div");
    pasteArea.className = "paste-area";
    pasteArea.style.display = "none";
    const pasteTA = document.createElement("textarea");
    pasteTA.placeholder = "Am G | C F  (| separates measures; without bars, one chord per measure)";
    pasteTA.rows = 2;
    pasteTA.className = "paste-textarea";
    const pasteSubmit = makeBtn("Add chords", "#4f46e5", () => {
      const text = pasteTA.value.trim();
      if (!text) return;
      const measures = parseProgressionMeasures(text);
      if (!measures.length) return;
      if (!_song.sections.length) {
        _song = addSection(_song, "Section", "verse");
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
      { label: "Intro", name: "Intro", color: "intro" },
      { label: "Verse", name: "Verse", color: "verse" },
      { label: "Pre", name: "Pre-Chorus", color: "prechorus" },
      { label: "Chorus", name: "Chorus", color: "chorus" },
      { label: "Bridge", name: "Bridge", color: "bridge" },
      { label: "Outro", name: "Outro", color: "outro" }
    ];
    const templateWrap = document.createElement("div");
    templateWrap.className = "template-wrap";
    templates.forEach((t) => {
      const btn = makeBtn(`+ ${t.label}`, SECTION_COLORS[t.color], () => {
        _song = addSection(_song, t.name, t.color);
        saveSong(_song);
        h.onSongChange(_song);
      });
      btn.style.fontSize = "11px";
      btn.title = `Add ${t.name} section`;
      templateWrap.appendChild(btn);
    });
    const transposeSelect = document.createElement("select");
    transposeSelect.title = "Transpose all chords up by semitones";
    transposeSelect.className = "transpose-select";
    transposeSelect.innerHTML = '<option value="">\u21C4 Transpose</option>' + Array.from({ length: 11 }, (_, i) => `<option value="${i + 1}">+${i + 1} st</option>`).join("");
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
    const exportBtn = makeBtn("\u2399 Export", "#374151", () => {
      const printWin = window.open("", "_blank");
      if (!printWin) {
        showNotice("Pop-up blocked \u2014 allow pop-ups for this page to export.", "warn");
        return;
      }
      printWin.document.write(buildPrintHTML(_song, h.activeKey));
      printWin.document.close();
      printWin.print();
    });
    exportBtn.title = "Print / export song to PDF";
    const pasteBtn = makeBtn("Paste", "#374151", () => {
      const open2 = pasteArea.style.display === "none";
      pasteArea.style.display = open2 ? "block" : "none";
      if (open2) pasteTA.focus();
    });
    pasteBtn.title = "Paste a chord progression as text";
    header.append(songSelect, titleInput, newBtn, deleteBtn, templateWrap, transposeSelect, exportBtn, pasteBtn);
    root.appendChild(header);
    root.appendChild(pasteArea);
    const formInfo = document.createElement("div");
    formInfo.className = "song-form-info";
    const form = detectForm(_song.sections.map((s) => s.name));
    const keyStr = h.activeKey ? ` \xB7 Key: ${h.activeKey}` : "";
    formInfo.textContent = _song.sections.length ? `Form: ${form}${keyStr}` : "";
    root.appendChild(formInfo);
    const measureNums = computeMeasureNumbers(song);
    song.sections.forEach((section) => {
      root.appendChild(buildSectionDOM(section, h, measureNums));
    });
    return root;
  }
  function buildSectionDOM(section, h, measureNums) {
    const color = SECTION_COLORS[section.color];
    const wrap = document.createElement("div");
    wrap.className = "section-wrap";
    wrap.style.borderLeft = `3px solid ${color}`;
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
    nameInput.style.color = color;
    nameInput.addEventListener("focus", () => nameInput.style.borderBottomColor = color);
    nameInput.addEventListener("blur", () => {
      nameInput.style.borderBottomColor = "transparent";
      _song = updateSection(_song, section.id, { name: nameInput.value });
      saveSong(_song);
      h.onSongChange(_song);
    });
    const PRESET_COLORS = ["intro", "verse", "prechorus", "chorus", "bridge", "outro", "custom"];
    const swatchEl = document.createElement("button");
    swatchEl.className = "section-swatch";
    swatchEl.style.background = color;
    swatchEl.title = "Change section color";
    swatchEl.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelector(".color-picker-popup")?.remove();
      const picker = document.createElement("div");
      picker.className = "color-picker-popup";
      PRESET_COLORS.forEach((c) => {
        const dot = document.createElement("button");
        dot.title = c;
        dot.className = "color-picker-dot";
        dot.style.background = SECTION_COLORS[c];
        dot.style.borderColor = c === section.color ? "#fff" : "transparent";
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
    repeatBadge.title = "Repeat count \u2014 click to edit";
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
    dragHandle.title = "Drag to reorder section";
    dragHandle.className = "section-drag-handle";
    const dupBtn = makeSmallBtn("\u29C9", () => {
      _song = duplicateSection(_song, section.id);
      saveSong(_song);
      h.onSongChange(_song);
    });
    dupBtn.title = "Duplicate section";
    const delBtn = makeSmallBtn("\xD7", () => {
      applyWithUndo(removeSection(_song, section.id), `Deleted section ${section.name}`);
    });
    delBtn.style.color = "#f87171";
    delBtn.title = "Delete section \u2014 can be undone";
    secHeader.append(dragHandle, toggle, nameInput, swatchEl, repeatBadge, dupBtn, delBtn);
    const addMeasureBtn = makeSmallBtn("+ Bar", () => {
      _song = addMeasure(_song, section.id);
      saveSong(_song);
      h.onSongChange(_song);
    });
    addMeasureBtn.title = "Add a measure to this section";
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
      wrap.style.borderTop = before ? "2px solid #4f46e5" : "";
      wrap.style.borderBottom = !before ? "2px solid #4f46e5" : "";
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
      chordsRow.style.outline = "1px dashed #4f46e5";
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
      applyWithUndo(removeMeasure(_song, section.id, measure.id), `Deleted measure ${measureNum}`);
    });
    delMBtn.title = "Delete measure \u2014 can be undone";
    delMBtn.style.color = "#f87171";
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
        const val = input.value.trim();
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
    symbolEl.textContent = chord.symbol;
    symbolEl.className = "chord-chip-symbol";
    if (!chord.valid) symbolEl.style.color = "#ef4444";
    const degreeEl = document.createElement("div");
    degreeEl.textContent = degree;
    degreeEl.className = "chord-chip-degree";
    if (borrowed) degreeEl.style.color = "#f59e0b";
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
        const symbol = input.value.trim() || prevVal;
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
        notesRow.style.cssText = "display:flex;align-items:center;gap:3px;font-size:9px;color:#9ca3af;white-space:nowrap;overflow:hidden";
        const notesText = document.createElement("span");
        notesText.textContent = "\u2669 " + notesState.join(" ");
        notesText.style.overflow = "hidden";
        notesText.style.textOverflow = "ellipsis";
        const clearBtn = document.createElement("button");
        clearBtn.textContent = "\xD7";
        clearBtn.title = "Clear stored voicing";
        clearBtn.style.cssText = "background:none;border:none;color:#6b7280;cursor:pointer;padding:0 2px;font-size:10px;flex-shrink:0";
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
    editBtn.title = "Edit chord symbol";
    const dupBtn = makeSmallBtn("\u29C9", () => {
      _song = duplicateChord(_song, chord.id);
      saveSong(_song);
      h.onSongChange(_song);
    });
    dupBtn.title = "Duplicate chord";
    const delBtn = makeSmallBtn("\xD7", () => removeChordWithUndo(chord.id));
    delBtn.title = "Remove chord (Del) \u2014 can be undone";
    const captureBtn = makeSmallBtn("\u2299", () => h.onChordCapture(chord.id));
    captureBtn.title = "MIDI fill: next chord played on MIDI keyboard replaces this slot";
    if (isCapture) {
      captureBtn.style.color = "#818cf8";
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
    <div class="key">${activeKey ? "Key: " + activeKey : ""}</div>`;
    for (const section of song.sections) {
      html += `<div class="section"><div class="section-name">${escapeHtml(section.name)}${section.repeatCount > 1 ? ` \xD7${section.repeatCount}` : ""}</div><div class="measures">`;
      for (const measure of section.measures) {
        const num = measureNums.get(measure.id) ?? "";
        html += `<div class="measure"><div class="bar-num">${num}</div>`;
        for (const chord of measure.chords) {
          const degree = activeKey ? computeDegree(chord.symbol, activeKey) : "\u2014";
          html += `<div class="chord">${escapeHtml(chord.symbol)}</div><div class="degree">${degree}</div>`;
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
    { key: "Space", action: "Play current chord (or last if none active)" },
    { key: "\u2190 \u2192", action: "Previous / next chord in the song (or history) \u2014 plays it" },
    { key: "Del", action: "Remove the selected song chord (undo in the toast)" },
    { key: "H", action: "Toggle Hold mode" },
    { key: "A", action: "Toggle Arpeggio mode" },
    { key: "S", action: "Send history chip \u2192 Song" },
    { key: "C", action: "Clear history (undo in the toast)" },
    { key: "Esc", action: "Drop a held chord, clear cursor, stop MIDI fill" },
    { key: "M", action: "Play with the computer keyboard (M or Esc to stop)" },
    { key: "/", action: "Type a chord name" },
    { key: "1\u20139", action: "Select chord candidate" },
    { key: "?", action: "Show / hide this panel" }
  ];
  var GESTURES = [
    "Click a history chip, song chord or circle segment to play it and show it in the detector.",
    "Double-click a major or minor circle segment to make it the key.",
    "A chord is logged to history once held steady for 0.8 s, and not twice in a row.",
    "Drag a history chip onto a song measure to insert it; drag song chords and section headers to reorder.",
    "\u2299 on a song chord arms MIDI fill: each chord you play fills a slot and arms the next, until the song ends or Esc.",
    "Right-click a history chip to remove it. Removals and Clear can be undone from the toast.",
    "Click the on-screen piano to play: in Hold each click adds or removes a note of the chord."
  ];
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
      <span>Shortcuts and gestures</span>
      <button class="shortcut-help-close">\xD7</button>
    </div>
    ${SHORTCUTS.map((s) => `
      <div class="shortcut-row">
        <kbd class="shortcut-key">${s.key}</kbd>
        <span class="shortcut-action">${s.action}</span>
      </div>`).join("")}
    <div class="shortcut-section">Mouse</div>
    ${GESTURES.map((g) => `<div class="gesture-row">${g}</div>`).join("")}`;
    document.body.appendChild(popup);
    popup.querySelector(".shortcut-help-close").addEventListener("click", closeHelp);
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
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (t instanceof HTMLElement && t.isContentEditable) return;
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
  var ANALYSIS_FIELD_KEYS = ["roman", "function", "figbass", "diatonic", "scales", "cadence", "secondary", "subs"];
  var ANALYSIS_FIELD_LABELS = {
    roman: "Roman",
    function: "Func",
    figbass: "Fig",
    diatonic: "Diat",
    scales: "Scl",
    cadence: "Cad",
    secondary: "Sec",
    subs: "Subs"
  };
  var ANALYSIS_FIELD_TOOLTIPS = {
    roman: "Roman numeral",
    function: "Harmonic function",
    figbass: "Figured bass",
    diatonic: "Diatonic / borrowed",
    scales: "Suggested scales",
    cadence: "Cadence",
    secondary: "Secondary dominant",
    subs: "Substitutions"
  };
  function renderChordSummary(detection, onAltSelect2) {
    const el = document.getElementById("chord-summary");
    if (!el) return;
    if (!detection || detection.kind !== "chord") {
      el.innerHTML = "";
      return;
    }
    const chordName = escapeHtml(detection.candidates[detection.selectedIndex]);
    const color = chordColor(chordName);
    const notes = detection.notes.map((n) => n.replace(/(-?\d+)$/, "")).join(" \xB7 ");
    const alts = detection.candidates.slice(1, 7);
    el.innerHTML = `
    <div class="chord-summary-row">
      <span class="chord-name-badge" style="background:${color}22;border-left:3px solid ${color}">${chordName}</span>
      <span class="chord-notes">${notes}</span>
      ${alts.map(
      (c, i) => `<button class="alt-chord-btn alt-chord-sum" data-idx="${i + 1}">${escapeHtml(c)}</button>`
    ).join("")}
    </div>`;
    el.querySelectorAll(".alt-chord-sum").forEach((btn) => {
      btn.addEventListener("click", () => onAltSelect2(parseInt(btn.dataset.idx)));
    });
  }
  function renderZone1Analysis(detection, analysis, fieldsVisible, scale, onAltSelect2) {
    renderChordSummary(detection, onAltSelect2);
    const el = document.getElementById("analysis-content");
    if (!el) return;
    el.style.fontSize = scale + "px";
    const visibleCount = ANALYSIS_FIELD_KEYS.filter((f) => fieldsVisible[f]).length;
    el.style.height = Math.ceil((visibleCount * 1.6 - 0.4) * scale) + "px";
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
    const maybeRow = (f, label, val) => fieldsVisible[f] ? row(label, val) : "";
    const conditionalRow = (f, label, val) => fieldsVisible[f] ? row(label, val ?? "\u2014") : "";
    let roman = "\u2014", func_ = "\u2014", figuredBass = "\u2014", diatonic = "\u2014", scales = "\u2014", cadence = "\u2014";
    let secondary = null, subs = null;
    let extra = "";
    if (detection?.kind === "note") {
      extra = row("Note", `${detection.noteName} \xB7 MIDI ${detection.midiNumber}`);
    } else if (detection?.kind === "interval") {
      extra = row("Interval", `${detection.intervalName} \xB7 ${detection.semitones} st`) + row("Inversion", detection.inversionName);
    } else if (detection?.kind === "chord" && analysis) {
      roman = analysis.roman;
      func_ = { T: "Tonic", S: "Subdominant", D: "Dominant", unknown: "Unknown" }[analysis.function];
      figuredBass = analysis.figuredBass || "\u2014";
      diatonic = analysis.isDiatonic ? "Yes" : analysis.isBorrowed ? `Borrowed (${analysis.borrowedFrom ?? "?"})` : "Chromatic";
      scales = analysis.suggestedScales.slice(0, 4).join(", ") || "\u2014";
      cadence = analysis.cadence || "\u2014";
      if (analysis.isSecondary) secondary = `\u2192 ${analysis.secondaryTarget?.split("/")[1] ?? "?"}`;
      if (analysis.substitutions?.length) subs = analysis.substitutions.join(", ");
    }
    el.innerHTML = maybeRow("roman", "Roman", roman) + maybeRow("function", "Function", func_) + maybeRow("figbass", "Fig. bass", figuredBass) + maybeRow("diatonic", "Diatonic", diatonic) + maybeRow("scales", "Scales", scales) + maybeRow("cadence", "Cadence", cadence) + conditionalRow("secondary", "Secondary", secondary) + conditionalRow("subs", "Subs.", subs) + extra;
  }

  // src/ui/layout.ts
  var VIEW_LABELS = { chord: "Chord", staff: "Staff", cof: "Circle of Fifths", piano: "Piano", guitar: "Guitar" };
  var $ = (id) => document.getElementById(id);
  function loadPanels() {
    return {
      notation: true,
      // always open on load (not persisted)
      instruments: loadBool("panel-instruments", true),
      colPiano: loadBool("panel-colPiano", true),
      colNeck: loadBool("panel-colNeck", true),
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
      <select id="midi-out" class="ctrl-select" title="MIDI out: what sounds goes to this port"><option value="">Out: off</option></select>
      <select id="midi-out-ch" class="ctrl-select" title="MIDI out channel">
        ${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">ch ${i + 1}</option>`).join("")}
      </select>
      <button id="btn-thru" class="mode-btn" title="Thru: also send the controller's notes (off: the DAW usually hears the controller itself)">Thru</button>
      <button id="btn-normal" class="mode-btn" data-mode="normal">Normal</button>
      <button id="btn-hold" class="mode-btn" data-mode="hold">Hold</button>
      <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio">Arpeggio</button>
      <button id="btn-keyboard" class="mode-btn" title="Play with the computer keyboard (M): A-\xD1 white keys, W E T Y U O P black, Z/X octave, C/V velocity, Tab sustain">\u2328</button>
      <span id="keyboard-status" class="auto-key-label"></span>
      <select id="key-select" class="ctrl-select">
        <option value="">Key: Auto</option>
        ${ALL_KEYS.map((k) => `<option value="${k}">${k}</option>`).join("")}
      </select>
      <span id="auto-key-label" class="auto-key-label"></span>
      <input id="typed-chord" class="ctrl-select typed-chord" placeholder="Chord\u2026 (/)" title="Type a chord name and press Enter" autocomplete="off" spellcheck="false">
      <span class="toolbar-sep"></span>
      <div id="audio-progress" class="audio-progress" title="Soundfont status">
        <div id="audio-progress-fill" class="audio-progress-fill"></div>
        <span id="audio-status" class="audio-status">\u266A idle</span>
      </div>
      <button id="btn-play-chord" class="ctrl-btn" title="Play current chord (Space)">\u25B6</button>
      <select id="audio-instrument" class="ctrl-select" title="Soundfont instrument">
        ${GM_INSTRUMENT_GROUPS.map(
      (g) => `<optgroup label="${g.label}">${g.instruments.map(
        (i) => `<option value="${i}"${i === getCurrentInstrument() ? " selected" : ""}>${i.replace(/_/g, " ")}</option>`
      ).join("")}</optgroup>`
    ).join("")}
      </select>
      <input id="audio-volume" type="range" min="0" max="1" step="0.05" value="${getVolume()}" title="Volume" class="volume-slider">
      <div class="view-menu-wrap">
        <button id="btn-views" class="ctrl-btn" title="View windows for OBS, and diagram export (SVG, PNG)">\u29C9</button>
        <div id="view-menu" class="view-menu">
          <div class="view-menu-title">Open a view window</div>
          ${VIEW_NAMES.map((v) => `<button class="ctrl-btn" data-view="${v}">${VIEW_LABELS[v]}</button>`).join("")}
          <label class="view-menu-bg">Background
            <select id="view-bg" class="ctrl-select">
              ${Object.keys(VIEW_BACKGROUNDS).map((b) => `<option value="${b}">${b}</option>`).join("")}
            </select>
          </label>
          <div class="view-menu-hint">In OBS: Window Capture of "Modus view: \u2026", then a Chroma Key filter. The window follows this one live.</div>
          <div class="view-menu-title">Save the diagram on screen (transparent)</div>
          ${["staff", "cof", "guitar", "piano"].map((t) => `
            <div class="view-menu-export"><span>${VIEW_LABELS[t]}</span>
              <button class="ctrl-btn" data-export="${t}" data-format="svg">SVG</button>
              <button class="ctrl-btn" data-export="${t}" data-format="png">PNG</button>
            </div>`).join("")}
        </div>
      </div>
      <button id="btn-help" class="help-btn" title="Keyboard shortcuts">?</button>
    </div>`;
  }
  function buildNotationPanel(panels, fieldsVisible) {
    return `
    <div id="notation-panel" class="zone-panel">
      <div class="panel-header">
        <span>Notation</span>
        <div class="col-vis-row">
          <button class="col-vis-btn${panels.colStaff ? " active" : ""}" data-col="colStaff" title="Staff">St</button>
          <button class="col-vis-btn${panels.colAnalysis ? " active" : ""}" data-col="colAnalysis" title="Analysis">An</button>
          <button class="col-vis-btn${panels.colCoF ? " active" : ""}" data-col="colCoF" title="Circle of Fifths">CoF</button>
          <button class="col-vis-btn${panels.colGuitar ? " active" : ""}" data-col="colGuitar" title="Guitar">Git</button>
        </div>
        <button class="toggle-btn" data-panel="notation">\u25BC</button>
      </div>
      <div id="notation-content">
        <div class="col-auto" id="col-staff">
          <div class="col-label">Staff</div>
          <div id="chord-summary"></div>
          <div id="staff-container"></div>
          <div class="ctrl-row" style="justify-content:center">
            <button id="btn-staff-minus" class="size-ctrl-btn" title="Smaller staff">\u2212</button>
            <button id="btn-staff-plus"  class="size-ctrl-btn" title="Larger staff">+</button>
          </div>
        </div>
        <div class="col-analysis" id="col-analysis">
          <div class="col-header">
            <div class="col-label">Analysis</div>
            <button class="toggle-btn small" data-panel="analysisControls">\u25BC</button>
          </div>
          <div id="analysis-content"></div>
          <div id="analysis-controls">
            <div class="ctrl-row">
              <button id="btn-analysis-minus" class="size-ctrl-btn" title="Smaller">\u2212</button>
              <button id="btn-analysis-plus"  class="size-ctrl-btn" title="Larger">+</button>
            </div>
            <div class="ctrl-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px">
              ${ANALYSIS_FIELD_KEYS.map(
      (f) => `<button id="btn-field-${f}" class="size-ctrl-btn${fieldsVisible[f] ? " active" : ""}"
                  title="${ANALYSIS_FIELD_TOOLTIPS[f]}">${ANALYSIS_FIELD_LABELS[f]}</button>`
    ).join("")}
            </div>
          </div>
        </div>
        <div class="col-auto" id="col-cof">
          <div class="col-header">
            <div class="col-label">CoF</div>
            <button class="toggle-btn small" data-panel="cofControls">\u25BC</button>
          </div>
          <div id="cof-container"></div>
          <div id="cof-controls">
            <div class="ctrl-row">
              <button id="btn-cof-minus" class="size-ctrl-btn" title="Smaller">\u2212</button>
              <button id="btn-cof-plus"  class="size-ctrl-btn" title="Larger">+</button>
            </div>
            <div class="ctrl-row">
              <button id="btn-cof-flat"   class="size-ctrl-btn" title="Show flat enharmonics (Gb, Db\u2026)">b</button>
              <button id="btn-cof-sharp"  class="size-ctrl-btn" title="Show sharp enharmonics (F#, C#\u2026)">#</button>
              <button id="btn-cof-minor"  class="size-ctrl-btn" title="Show/hide minor and diminished rings">m</button>
              <button id="btn-cof-deg"    class="size-ctrl-btn" title="Show scale degrees (I, IV, V\u2026)">\xB0</button>
              <button id="btn-cof-7"      class="size-ctrl-btn" title="Show 7th chords (maj7, m7, \xF87)">7</button>
            </div>
          </div>
        </div>
        <div class="col-auto" id="col-guitar">
          <div class="col-header">
            <div class="col-label">Guitar</div>
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
        <span>Key</span>
        <div class="ctrl-row">
          <button id="btn-key-minus" class="size-ctrl-btn" title="Smaller">\u2212</button>
          <button id="btn-key-plus"  class="size-ctrl-btn" title="Larger">+</button>
          <button id="btn-key-7"     class="size-ctrl-btn" title="Seventh chords instead of triads">7</button>
          <button id="btn-key-neg"   class="size-ctrl-btn" title="Show/hide negative harmony">Neg</button>
          <button id="btn-key-par"   class="size-ctrl-btn" title="Show/hide parallel modes">Par</button>
          <button id="btn-key-colt"  class="size-ctrl-btn" title="Show/hide Coltrane axis">Colt</button>
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
        <span>Instruments</span>
        <div class="col-vis-row">
          <button class="col-vis-btn${panels.colPiano ? " active" : ""}" data-col="colPiano" title="Piano">Pi</button>
          <button class="col-vis-btn${panels.colNeck ? " active" : ""}" data-col="colNeck"  title="Fretboard">Fr</button>
        </div>
        <button class="toggle-btn" data-panel="instruments">\u25BC</button>
      </div>
      <div id="instruments-content">
        <div id="col-piano"><div id="piano-container"></div></div>
        <div id="col-neck">
          <div id="neck-container"></div>
          <div class="ctrl-row" style="justify-content:center;margin-top:4px">
            <button id="btn-neck-minus" class="size-ctrl-btn" title="Smaller">\u2212</button>
            <button id="btn-neck-plus"  class="size-ctrl-btn" title="Larger">+</button>
          </div>
        </div>
      </div>
    </div>`;
  }
  function buildZoneHeaders() {
    $("zone2").innerHTML = `
    <div class="zone-header">
      <span class="zone-title">History</span>
      <button class="toggle-btn" data-panel="history">\u25BC</button>
    </div>
    <div id="zone2-content"></div>`;
    $("zone3").innerHTML = `
    <div class="zone-header">
      <span class="zone-title">Song Structure</span>
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
  function init() {
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
        showMidiBanner("MIDI access denied. Grant permission in browser settings to use a controller.");
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
      const labels = { idle: "\u266A idle", loading: "\u266A loading\u2026", suspended: "\u266A click to activate", ready: "\u266A ready", error: "\u266A error" };
      el.textContent = labels[status2] ?? status2;
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
        fill.style.background = "#f59e0b";
        fill.style.transition = "width 0.3s ease-out";
        fill.style.width = "100%";
      } else if (status2 === "ready") {
        fill.style.background = "#22c55e";
        fill.style.transition = "width 0.2s ease-out";
        fill.style.width = "100%";
      } else if (status2 === "error") {
        fill.style.background = "#ef4444";
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
        if (deleted) showUndo(`Deleted "${deleted.title}"`, () => {
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
  function wireLayoutEvents() {
    const updateCofButtons = () => {
      $2("btn-cof-flat").classList.toggle("active", cofAccidental === "flat");
      $2("btn-cof-sharp").classList.toggle("active", cofAccidental === "sharp");
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
      renderStaff($2("staff-container"), displayedNotes(), staffWidth, analysisKey(), staffScale);
    };
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
  function refreshAnalysis() {
    const sym = selectedSymbol();
    const sig = `${sym}|${analysisKey()}|${cadencePrev}`;
    if (sig === lastAnalysisSig) return;
    lastAnalysisSig = sig;
    state.analysis = sym ? buildHarmonicAnalysis(sym, analysisKey(), cadencePrev) : null;
  }
  function renderAnalysisPanel() {
    renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect);
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
    const d = state.detection;
    sendView({
      key: analysisKey(),
      kind: d?.kind ?? null,
      label: !d ? "" : d.kind === "note" ? d.pitchClass : d.kind === "interval" ? d.intervalName : selectedSymbol() ?? "",
      symbol: selectedSymbol(),
      notes: displayedNotes(),
      roman: state.analysis?.roman ?? null,
      function: state.analysis?.function ?? null,
      guitarVoicing: getGuitarVoicingIndex()
    });
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
    $2("auto-key-label").textContent = !state.activeKey && autoKey ? `auto: ${autoKey}` : "";
  }
  var lastRenderSig = {};
  function renderIfChanged(name, sig, render2) {
    if (lastRenderSig[name] === sig) return;
    lastRenderSig[name] = sig;
    render2();
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
    const symbol = normalizeChordName(input.value.trim());
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
  function renderZone1Diagrams(noteNames, chordSymbol) {
    const key = analysisKey();
    const notes = noteNames.join(" ");
    const cofOpts = { accidental: cofAccidental, showMinor: cofShowMinor, showDegrees: cofShowDegrees, show7ths: cofShow7ths };
    renderIfChanged("staff", `${notes}|${key}|${staffScale}`, () => renderStaff($2("staff-container"), noteNames, staffWidth, key, staffScale));
    renderIfChanged("piano", `${notes}|${chordSymbol}`, () => renderPiano($2("piano-container"), noteNames, chordSymbol, onPianoPress));
    renderIfChanged("neck", `${notes}|${keyPrefersSharps(key)}`, () => renderNeck($2("neck-container"), noteNames, !keyPrefersSharps(key)));
    renderIfChanged("guitar", `${chordSymbol}`, () => renderGuitar($2("guitar-container"), chordSymbol, noteNames));
    renderIfChanged("cof", `${key}|${chordSymbol}|${cofSize}|${JSON.stringify(cofOpts)}`, () => renderCircleOfFifths($2("cof-container"), key, chordSymbol, onCofClick, cofSize, cofOpts));
    const keyOpts = { sevenths: keySevenths, showNegative: keyShowNegative, showParallel: keyShowParallel, showColtrane: keyShowColtrane, fontScale: keyScale };
    const keyLabel = key ? state.activeKey ? key : `${key} (auto)` : "";
    renderIfChanged("key", `${keyLabel}|${chordSymbol}|${JSON.stringify(keyOpts)}`, () => renderKeyExplorer($2("key-container"), key ? buildKeyMap(key, keySevenths) : null, keyLabel, chordSymbol, onKeyChordClick, keyOpts));
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
      state.song = addSection(state.song, "Verse", "verse");
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
    sel.innerHTML = devices.length ? devices.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join("") : "<option>No MIDI devices</option>";
    sel.onchange = () => chooseDevice(sel.value);
    const target = resolveDevice();
    if (target) sel.value = target;
    $2("midi-status").textContent = devices.length ? "MIDI: connected" : "MIDI: no devices";
    $2("midi-status").style.color = devices.length ? "#4ade80" : "#6b7280";
    if (!deviceListenersAttached) {
      deviceListenersAttached = true;
      window.addEventListener("midi-devices-changed", () => {
        refreshDeviceDropdown();
        refreshOutputDropdown();
      });
      window.addEventListener("midi-device-disconnected", () => {
        $2("midi-status").textContent = "MIDI: disconnected";
        $2("midi-status").style.color = "#f87171";
      });
    }
  }
  function refreshOutputDropdown() {
    const sel = $2("midi-out");
    const { port } = getOutputSettings();
    const outputs = getOutputs();
    const present = port && outputs.find((o) => o.name === port.name);
    sel.innerHTML = '<option value="">Out: off</option>' + outputs.map((o) => `<option value="${escapeHtml(o.id)}">Out: ${escapeHtml(o.name)}</option>`).join("") + // A chosen port that is unplugged stays chosen and comes back when it reappears
    (port && !present ? `<option value="__missing" disabled>Out: ${escapeHtml(port.name)} (absent)</option>` : "");
    sel.value = present ? present.id : port ? "__missing" : "";
    const loops = outputLoops();
    sel.classList.toggle("invalid", loops);
    sel.title = loops ? "Same port as the input: nothing is sent, it would come back as input" : "MIDI out: what sounds goes to this port";
  }
  function wireMidiOut() {
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
      escape: () => {
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
