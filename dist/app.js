"use strict";
(() => {
  // src/midi.ts
  var PITCH_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  var NOTE_SEMITONE = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11
  };
  function midiToNoteName(midiNote) {
    const pc = midiNote % 12;
    const octave = Math.floor(midiNote / 12) - 1;
    return PITCH_NAMES_FLAT[pc] + octave;
  }
  function noteNameToMidi(name) {
    const m = name.match(/^([A-G][b#]?)(-?\d+)$/);
    if (!m) return null;
    const pc = NOTE_SEMITONE[m[1]];
    if (pc === void 0) return null;
    return (parseInt(m[2]) + 1) * 12 + pc;
  }
  function isNoteOff(status, velocity) {
    return (status & 240) === 128 || (status & 240) === 144 && velocity === 0;
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
  var onNoteOn = () => {
  };
  function setNoteChangeCallback(cb) {
    onNoteChange = cb;
  }
  function setNoteOnCallback(cb) {
    onNoteOn = cb;
  }
  async function initMidi() {
    if (!navigator.requestMIDIAccess) {
      return { ok: false, denied: false, unsupported: true };
    }
    try {
      midiAccess = await navigator.requestMIDIAccess();
      midiAccess.onstatechange = () => refreshDeviceList();
      const savedMode = localStorage.getItem("midi-mode");
      if (savedMode && ["normal", "hold", "arpeggio"].includes(savedMode)) mode = savedMode;
      restoreDevice();
      return { ok: true, denied: false, unsupported: false };
    } catch {
      return { ok: false, denied: true, unsupported: false };
    }
  }
  function getDevices() {
    if (!midiAccess) return [];
    return Array.from(midiAccess.inputs.values()).map((i) => ({ id: i.id, name: i.name ?? i.id }));
  }
  function getSelectedDeviceId() {
    return selectedDeviceId;
  }
  function selectDevice(id) {
    selectedDeviceId = id;
    localStorage.setItem("midi-device-id", id);
    attachToDevice(id);
  }
  function restoreDevice() {
    const saved = localStorage.getItem("midi-device-id");
    const devices = getDevices();
    const target = saved && devices.find((d) => d.id === saved) ? saved : devices[0]?.id ?? null;
    if (target) selectDevice(target);
  }
  function attachToDevice(id) {
    if (!midiAccess) return;
    for (const input of midiAccess.inputs.values()) {
      input.onmidimessage = input.id === id ? handleMidiMessage : null;
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
    const [status, note, velocity] = e.data;
    if (isNoteOff(status, velocity)) {
      handleNoteOff(note);
    } else if ((status & 240) === 144) {
      handleNoteOn(note);
    }
  }
  function sortedNotes(s) {
    return Array.from(s).sort((a, b) => a - b);
  }
  function handleNoteOn(note) {
    onNoteOn(note);
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
    activeNotes.clear();
    physicallyHeldNotes.clear();
    arpeggioNotes = [];
    if (arpeggioTimer) {
      clearTimeout(arpeggioTimer);
      arpeggioTimer = null;
    }
    localStorage.setItem("midi-mode", m);
  }
  function getMode() {
    return mode;
  }

  // src/chord.ts
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
    return name.replace(/^([A-G][b#]?)M(?=\/|$)/, "$1");
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
    try {
      return (chord.getNotes?.() ?? []).map((n) => n.name).filter(Boolean);
    } catch {
      return [];
    }
  }

  // src/analyzer.ts
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
    try {
      const umtNotes = noteNames.map((n) => UMT.parseNote(n));
      candidates = (UMT.Harmony.detectChords(umtNotes) ?? []).map(normalizeChordName).filter(isKnownChord);
      candidates = [...new Set(candidates)];
    } catch {
    }
    const result = {
      kind: "chord",
      notes: noteNames,
      candidates: candidates.length ? candidates : ["?"],
      selectedIndex: 0
    };
    return result;
  }
  function buildHarmonicAnalysis(chordSymbol, activeKey, prevChordSymbol) {
    const chord = tryParseChord(chordSymbol);
    if (!chord) return emptyAnalysis(chordSymbol);
    const notes = chord.getNotes ? chord.getNotes() : [];
    const bassNote = notes[0] ?? null;
    let roman = "?";
    let fn = "unknown";
    let isDiatonic = false;
    let isBorrowed = false;
    let borrowedFrom;
    let isSecondary = false;
    let secondaryTarget;
    let cadence = null;
    if (activeKey) {
      try {
        const { analysis } = UMT.Harmony.analyzeProgression([chord], activeKey);
        const a = analysis[0];
        roman = a.roman ?? "?";
        fn = a.function ?? "unknown";
        isDiatonic = a.isDiatonic ?? false;
        isBorrowed = a.isBorrowed ?? false;
        borrowedFrom = a.borrowedFrom;
        isSecondary = a.isSecondary ?? false;
        secondaryTarget = a.secondaryTarget;
      } catch {
      }
      if (prevChordSymbol) {
        try {
          const prevChord = UMT.parseChordSymbol(prevChordSymbol);
          const cad = UMT.Harmony.analyzeCadence(prevChord, chord, activeKey);
          if (cad && cad !== "No standard cadence") cadence = cad;
        } catch {
        }
      }
    }
    let figuredBass = "";
    if (bassNote) {
      try {
        figuredBass = UMT.FiguredBass.fromChord(chord, bassNote);
      } catch {
      }
    }
    const suggestedScales = [];
    try {
      UMT.Harmony.getSuggestedScales(chord).forEach((s) => suggestedScales.push(s.scale));
    } catch {
    }
    let coltraneAxis = null;
    try {
      if (activeKey) {
        const ax = UMT.Harmony.getColtraneAxis(activeKey);
        coltraneAxis = ax.majorThirds;
      }
    } catch {
    }
    let negativeHarmony = null;
    try {
      if (activeKey) {
        const neg = UMT.Harmony.getNegativeHarmony(chord, activeKey);
        negativeHarmony = neg?.name ?? null;
      }
    } catch {
    }
    const substitutions = [];
    try {
      if (activeKey) {
        const subs = UMT.getSubstitutions(chord, activeKey);
        subs.forEach((s) => {
          const name = s.chord?.name ?? s.name ?? String(s);
          const type = s.type ?? "";
          substitutions.push(type ? `${name} (${type})` : name);
        });
      }
    } catch {
    }
    return {
      chordName: chordSymbol,
      roman,
      function: fn,
      isDiatonic,
      isBorrowed,
      borrowedFrom,
      isSecondary,
      secondaryTarget,
      figuredBass,
      suggestedScales,
      substitutions,
      cadence,
      coltraneAxis,
      negativeHarmony
    };
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
      coltraneAxis: null,
      negativeHarmony: null
    };
  }
  function getAutoKey(history) {
    if (history.length === 0) return null;
    const allNotes = history.flatMap((e) => e.notes.map((n) => UMT.parseNote(n)));
    if (allNotes.length === 0) return null;
    try {
      const results = UMT.KeyDetection.detect(allNotes);
      return results[0]?.key ?? null;
    } catch {
      return null;
    }
  }

  // src/audio.ts
  var audioCtx = null;
  var instrument = null;
  var loadingInstrument = false;
  var volume = parseFloat(localStorage.getItem("audio-volume") ?? "0.8");
  var currentInstrumentName = localStorage.getItem("audio-instrument") ?? "acoustic_grand_piano";
  var audioStatus = "idle";
  var onStatusChange = null;
  function setAudioStatusCallback(cb) {
    onStatusChange = cb;
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
    if (!audioCtx) audioCtx = new AudioContext();
  }
  var loadToken = 0;
  function loadCurrentInstrument() {
    if (!audioCtx) return;
    const token = ++loadToken;
    loadingInstrument = true;
    instrument = null;
    setStatus("loading");
    Soundfont.instrument(audioCtx, currentInstrumentName, { soundfont: "FluidR3_GM" }).then((inst) => {
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
  function initAudioOnGesture() {
    ensureContext();
    audioCtx.resume().then(() => {
      if (instrument && audioStatus === "suspended") setStatus("ready");
    });
    if (!instrument && !loadingInstrument) loadCurrentInstrument();
  }
  function setInstrument(name) {
    currentInstrumentName = name;
    localStorage.setItem("audio-instrument", name);
    instrument = null;
    if (audioCtx) loadCurrentInstrument();
  }
  function getCurrentInstrument() {
    return currentInstrumentName;
  }
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    localStorage.setItem("audio-volume", String(volume));
  }
  function getVolume() {
    return volume;
  }
  function playMidi(midis, duration) {
    initAudioOnGesture();
    const inst = instrument;
    if (!inst || !midis.length) return;
    audioCtx.resume().then(() => {
      for (const midi of midis) inst.play(midi, audioCtx.currentTime, { duration, gain: volume });
    });
  }
  function playNote(midiNumber, duration = 1.5) {
    playMidi([midiNumber], duration);
  }
  function playNoteByName(noteName, duration = 1.5) {
    const midi = noteNameToMidi(noteName);
    if (midi !== null) playMidi([midi], duration);
  }
  function playMidiNotes(midiNotes, duration = 2) {
    playMidi(midiNotes, duration);
  }
  function playNoteNames(noteNames, duration = 2) {
    playMidi(noteNames.map(noteNameToMidi).filter((m) => m !== null), duration);
  }
  function playChord(chordSymbol) {
    playNoteNames(chordNoteNames(chordSymbol));
  }

  // src/keys.ts
  var KEY_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  var MAJOR_KEY_SIG = {
    C: 0,
    G: 1,
    D: 2,
    A: 3,
    E: 4,
    B: 5,
    "F#": 6,
    "C#": 7,
    F: -1,
    Bb: -2,
    Eb: -3,
    Ab: -4,
    Db: -5,
    Gb: -6,
    Cb: -7
  };
  var MINOR_KEY_SIG = {
    A: 0,
    E: 1,
    B: 2,
    "F#": 3,
    "C#": 4,
    "G#": 5,
    "D#": 6,
    "A#": 7,
    D: -1,
    G: -2,
    C: -3,
    F: -4,
    Bb: -5,
    Eb: -6,
    Ab: -7
  };
  var MINOR_ENHARMONIC = { Db: "C#", Gb: "F#" };
  var SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
  var FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
  function parseKey(key) {
    const [root, mode2] = key.split(" ");
    return { root, minor: mode2?.toLowerCase() === "minor" };
  }
  function signatureOf(key) {
    let { root, minor } = parseKey(key);
    if (minor && MINOR_ENHARMONIC[root]) root = MINOR_ENHARMONIC[root];
    const count = (minor ? MINOR_KEY_SIG : MAJOR_KEY_SIG)[root];
    return count === void 0 ? null : { root, minor, count };
  }
  function keyPrefersSharps(key) {
    return key ? (signatureOf(key)?.count ?? 0) > 0 : false;
  }
  function keySignature(key) {
    const sig = key ? signatureOf(key) : null;
    if (!sig) return { abcKey: "none", accidentals: {} };
    const accidentals = {};
    if (sig.count > 0) SHARP_ORDER.slice(0, sig.count).forEach((l) => {
      accidentals[l] = "#";
    });
    else FLAT_ORDER.slice(0, -sig.count).forEach((l) => {
      accidentals[l] = "b";
    });
    return { abcKey: sig.root + (sig.minor ? "m" : ""), accidentals };
  }

  // src/diagrams.ts
  var guitarControlsVisible = JSON.parse(localStorage.getItem("panel-guitarControls") ?? "true");
  function setGuitarControlsVisible(v) {
    guitarControlsVisible = v;
  }
  function buildStaffAbc(noteNames, keyStr) {
    const { abcKey, accidentals } = keySignature(keyStr);
    const header = `X:1
M:none
L:1
K:${abcKey}
`;
    const abcNotes = noteNames.flatMap((n) => {
      const m = n.match(/^([A-G])([b#]?)(-?\d+)$/);
      if (!m) return [];
      const [, letter, acc, octStr] = m;
      const keyAcc = accidentals[letter] ?? "";
      const mark = acc === keyAcc ? "" : acc === "b" ? "_" : acc === "#" ? "^" : "=";
      const oct = parseInt(octStr);
      const pitch = oct >= 5 ? letter.toLowerCase() + "'".repeat(oct - 5) : oct === 4 ? letter : letter + ",".repeat(4 - oct);
      return [mark + pitch];
    });
    return header + (abcNotes.length ? `[${abcNotes.join("")}]1` : "z");
  }
  function renderStaff(container, noteNames, width = 380, keyStr = null) {
    ABCJS.renderAbc(container, buildStaffAbc(noteNames, keyStr), { staffwidth: width - 20, scale: 2 });
  }
  var OPEN_MIDI = [40, 45, 50, 55, 59, 64];
  var NECK_FRETS = 12;
  var neckSpacing = parseInt(localStorage.getItem("neck-spacing") ?? "16");
  function adjustNeckSpacing(delta) {
    neckSpacing = Math.min(28, Math.max(10, neckSpacing + delta));
    localStorage.setItem("neck-spacing", String(neckSpacing));
  }
  function renderNeck(container, noteNames, root = null) {
    const midi = noteNames.map(noteNameToMidi).filter((n) => n !== null);
    const frets = OPEN_MIDI.map((open) => {
      const pos = midi.map((n) => n - open).filter((f) => f >= 0 && f <= NECK_FRETS);
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
      ...root ? { showDegrees: true } : {}
    };
    try {
      container.innerHTML = Notae.renderFretboard(
        { name: "", frets, tuning: ["E", "A", "D", "G", "B", "E"], ...root ? { root } : {} },
        { ...style, orientation: "horizontal" }
      );
    } catch {
      container.innerHTML = "";
    }
  }
  var PIANO_WHITE_NOTES = [];
  var PIANO_BLACK_NOTES = [];
  var WHITE_SEMITONES_P = [0, 2, 4, 5, 7, 9, 11];
  var BLACK_SEMITONES_P = [1, 3, 6, 8, 10];
  for (let oct = 2; oct <= 5; oct++) {
    WHITE_SEMITONES_P.forEach((s) => PIANO_WHITE_NOTES.push(PITCH_NAMES_FLAT[s] + oct));
    BLACK_SEMITONES_P.forEach((s) => PIANO_BLACK_NOTES.push(PITCH_NAMES_FLAT[s] + oct));
  }
  var PIANO_KEY_ORDER = [...PIANO_WHITE_NOTES, ...PIANO_BLACK_NOTES];
  function renderPiano(container, noteNames, chordSymbol) {
    const color = chordSymbol ? chordColor(chordSymbol) : NEUTRAL_COLOR;
    const colors = noteNames.map(() => color);
    container.innerHTML = Notae.renderPiano({
      name: "",
      keys: noteNames,
      colors,
      range: { from: "C2", to: "B5" }
    });
    const rects = container.querySelectorAll("rect");
    rects.forEach((el, i) => {
      const note = PIANO_KEY_ORDER[i];
      if (!note) return;
      el.dataset.note = note;
      el.style.cursor = "pointer";
      el.addEventListener("click", () => playNoteByName(note));
    });
  }
  var DARK_FRETBOARD_STYLE = {
    chordNameColor: "#e0e0e0",
    fretLabelColor: "#9ca3af",
    nutColor: "#aaaaaa",
    indicatorColor: "#9ca3af",
    stringLabelColor: "#9ca3af"
  };
  var EMPTY_FRETBOARD = { name: "", frets: [null, null, null, null, null, null], tuning: ["E", "A", "D", "G", "B", "E"] };
  function deriveVoicingFromNotes(noteNames, tuning) {
    const activeClasses = new Set(
      noteNames.map((n) => NOTE_SEMITONE[n.match(/^([A-G][b#]?)/)?.[1] ?? ""] ?? -1).filter((n) => n >= 0)
    );
    if (!activeClasses.size) return { frets: tuning.map(() => null), baseFret: 1 };
    const frets = tuning.map((open) => {
      const base = NOTE_SEMITONE[open] ?? 0;
      for (let f = 0; f <= 12; f++) {
        if (activeClasses.has((base + f) % 12)) return f;
      }
      return null;
    });
    const nonOpen = frets.filter((f) => f !== null && f > 0);
    const baseFret = nonOpen.length ? Math.min(...nonOpen) : 1;
    return { frets, baseFret };
  }
  var guitarVoicingIdx = 0;
  var lastGuitarSymbol = null;
  var lastNoteNames = [];
  var guitarLabelMode = localStorage.getItem("guitar-label-mode") || "none";
  var guitarTuningKey = localStorage.getItem("guitar-tuning") || "standard";
  var guitarTunerExpanded = false;
  var guitarSpacing = parseInt(localStorage.getItem("guitar-spacing") ?? "19");
  var GUITAR_TUNINGS = {
    standard: { umt: () => UMT.GUITAR_STANDARD, notae: ["E", "A", "D", "G", "B", "E"], label: "Standard" },
    dropD: { umt: () => UMT.GUITAR_DROPPED_D, notae: ["D", "A", "D", "G", "B", "E"], label: "Drop D" },
    openG: { umt: () => UMT.GUITAR_OPEN_G, notae: ["D", "G", "D", "G", "B", "D"], label: "Open G" }
  };
  function loadStringTuning() {
    try {
      const saved = localStorage.getItem("guitar-string-tuning");
      if (saved) {
        const v = JSON.parse(saved);
        if (Array.isArray(v) && v.length === 6) return v;
      }
    } catch {
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
          localStorage.setItem("guitar-label-mode", guitarLabelMode);
        } else if (action === "toggle-tuner") {
          guitarTunerExpanded = !guitarTunerExpanded;
        } else if (action === "size-minus") {
          guitarSpacing = Math.max(12, guitarSpacing - 3);
          localStorage.setItem("guitar-spacing", String(guitarSpacing));
        } else if (action === "size-plus") {
          guitarSpacing = Math.min(32, guitarSpacing + 3);
          localStorage.setItem("guitar-spacing", String(guitarSpacing));
        }
        renderGuitar(container, lastGuitarSymbol, lastNoteNames);
      });
    });
    const sel = container.querySelector(".guitar-tuning-sel");
    if (sel) {
      sel.addEventListener("change", () => {
        const key = sel.value;
        guitarTuningKey = key;
        localStorage.setItem("guitar-tuning", key);
        if (key !== "custom" && GUITAR_TUNINGS[key]) {
          guitarStringTuning = [...GUITAR_TUNINGS[key].notae];
          localStorage.setItem("guitar-string-tuning", JSON.stringify(guitarStringTuning));
        }
        const sym = lastGuitarSymbol;
        guitarVoicingIdx = 0;
        lastGuitarSymbol = null;
        renderGuitar(container, sym, lastNoteNames);
      });
    }
    container.querySelectorAll(".guitar-string-input").forEach((input) => {
      input.addEventListener("change", () => {
        const val = input.value.trim();
        if (!val) return;
        guitarStringTuning[parseInt(input.dataset.string)] = val;
        localStorage.setItem("guitar-string-tuning", JSON.stringify(guitarStringTuning));
        guitarTuningKey = detectPreset(guitarStringTuning);
        localStorage.setItem("guitar-tuning", guitarTuningKey);
        const sym = lastGuitarSymbol;
        const notes = [...lastNoteNames];
        guitarVoicingIdx = 0;
        lastGuitarSymbol = null;
        renderGuitar(container, sym, notes);
      });
    });
  }
  function renderGuitar(container, chordSymbol, noteNames = []) {
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
    if (guitarTuningKey === "custom") {
      const { frets, baseFret } = deriveVoicingFromNotes(noteNames, guitarStringTuning);
      let svg2 = "";
      try {
        svg2 = Notae.renderFretboard(
          { name: chordSymbol, frets, tuning: guitarStringTuning, baseFret },
          guitarStyle()
        );
      } catch {
      }
      container.innerHTML = `<div>${svg2}</div>` + guitarControls(0, 0);
      wireGuitarControls(container);
      return;
    }
    const umtTuning = GUITAR_TUNINGS[guitarTuningKey].umt();
    let voicings = [];
    try {
      const chord = UMT.parseChordSymbol(chordSymbol);
      voicings = UMT.getFretboardVoicings(chord, umtTuning) ?? [];
    } catch {
    }
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
      });
    });
    wireGuitarControls(container);
  }
  var CIRCLE_KEYS_FLAT = ["C", "G", "D", "A", "E", "B", "Gb", "Db", "Ab", "Eb", "Bb", "F"];
  var CIRCLE_KEYS_SHARP = ["C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "Bb", "F"];
  var CIRCLE_KEYS_MINOR_FLAT = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm"];
  var CIRCLE_KEYS_MINOR_SHARP = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "Bbm", "Fm", "Cm", "Gm", "Dm"];
  var CIRCLE_DIM = ["B\xB0", "F#\xB0", "C#\xB0", "G#\xB0", "D#\xB0", "A#\xB0", "F\xB0", "C\xB0", "G\xB0", "D\xB0", "A\xB0", "E\xB0"];
  var COF_DEGREES = ["I", "V", "II", "VI", "III", "VII", "\u266DV", "\u266DII", "\u266DVI", "\u266DIII", "\u266DVII", "IV"];
  var COF_DEGREES_MINOR = ["vi", "iii", "vii", "\u266Fiv", "\u266Dii", "\u266Dvi", "\u266Diii", "\u266Dvii", "iv", "i", "v", "ii"];
  function renderCircleOfFifths(container, activeKey, activeChord, onKeyClick, size = 160, opts = { accidental: "flat", showMinor: true, showDegrees: false, show7ths: false }) {
    const keys = opts.accidental === "sharp" ? CIRCLE_KEYS_SHARP : CIRCLE_KEYS_FLAT;
    const minorKeys = opts.accidental === "sharp" ? CIRCLE_KEYS_MINOR_SHARP : CIRCLE_KEYS_MINOR_FLAT;
    const activeRoot = activeKey?.split(" ")[0] ?? null;
    const activePos = activeRoot !== null ? keys.findIndex((k) => k === activeRoot) : -1;
    const activeChordRoot = activeChord?.match(/^([A-G][b#]?)/)?.[1] ?? null;
    const isMinorActiveChord = activeChord ? /^[A-G][b#]?m(?!aj)/.test(activeChord) : false;
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
    let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">`;
    const diatonicPos = activePos !== -1 ? /* @__PURE__ */ new Set([(activePos + 11) % 12, activePos, (activePos + 1) % 12]) : /* @__PURE__ */ new Set();
    const diatonicDimPos = activePos;
    keys.forEach((key, i) => {
      const angle = (i * 30 - 90) * Math.PI / 180;
      const nextAngle = ((i + 1) * 30 - 90) * Math.PI / 180;
      const x1o = cx + outerR * Math.cos(angle), y1o = cy + outerR * Math.sin(angle);
      const x2o = cx + outerR * Math.cos(nextAngle), y2o = cy + outerR * Math.sin(nextAngle);
      const x1i = cx + innerR * Math.cos(angle), y1i = cy + innerR * Math.sin(angle);
      const x2i = cx + innerR * Math.cos(nextAngle), y2i = cy + innerR * Math.sin(nextAngle);
      const isActiveKey = activeRoot && key === activeRoot;
      const isChordRoot = !isMinorActiveChord && activeChordRoot === key;
      const minorKeyRoot = minorKeys[i].match(/^([A-G][b#]?)/)?.[1] ?? "";
      const isMinorChordHere = isMinorActiveChord && activeChordRoot === minorKeyRoot;
      const isDiatonic = diatonicPos.has(i);
      const fill = isActiveKey ? "#4f46e5" : isChordRoot ? "#0d9488" : isDiatonic ? "#252550" : "#2d2d44";
      const stroke = isChordRoot ? "#0d9488" : isDiatonic ? "#7c7ca0" : "#4a4a6a";
      const midAngle = (i * 30 + 15 - 90) * Math.PI / 180;
      const lx = cx + labelR * Math.cos(midAngle);
      const ly = cy + labelR * Math.sin(midAngle);
      const degree = opts.showDegrees && activePos !== -1 ? COF_DEGREES[(i - activePos + 12) % 12] : null;
      const relPos = activePos !== -1 ? (i - activePos + 12) % 12 : -1;
      const suffix7 = opts.show7ths ? relPos === 1 ? "7" : "maj7" : "";
      const keyLabel = key + suffix7;
      svg += `<path d="M${x1i},${y1i} L${x1o},${y1o} A${outerR},${outerR} 0 0,1 ${x2o},${y2o} L${x2i},${y2i} A${innerR},${innerR} 0 0,0 ${x1i},${y1i}"
      fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor:pointer"
      data-key="${key} Major" data-chord="${key + suffix7}" />`;
      if (degree) {
        svg += `<text x="${lx}" y="${ly - majorFont * 0.45}" text-anchor="middle" dominant-baseline="middle"
        font-size="${majorFont}" fill="#e0e0e0" pointer-events="none">${keyLabel}</text>`;
        svg += `<text x="${lx}" y="${ly + majorFont * 0.7}" text-anchor="middle" dominant-baseline="middle"
        font-size="${majorFont * 0.85}" fill="#a5b4fc" pointer-events="none">${degree}</text>`;
      } else {
        svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
        font-size="${majorFont}" fill="#e0e0e0" pointer-events="none">${keyLabel}</text>`;
      }
      if (opts.showMinor) {
        const mx = cx + minorR * Math.cos(midAngle);
        const my = cy + minorR * Math.sin(midAngle);
        const minorLabel = minorKeys[i] + (opts.show7ths ? "7" : "");
        const minorDegree = opts.showDegrees && activePos !== -1 ? COF_DEGREES_MINOR[(i - activePos + 12) % 12] : null;
        const mx1o = cx + minorOutR * Math.cos(angle), my1o = cy + minorOutR * Math.sin(angle);
        const mx2o = cx + minorOutR * Math.cos(nextAngle), my2o = cy + minorOutR * Math.sin(nextAngle);
        const mx1i = cx + minorInR * Math.cos(angle), my1i = cy + minorInR * Math.sin(angle);
        const mx2i = cx + minorInR * Math.cos(nextAngle), my2i = cy + minorInR * Math.sin(nextAngle);
        const minorSegFill = isMinorChordHere ? "#0d9488" : isDiatonic ? "#252550" : "transparent";
        const minorSegStroke = isMinorChordHere ? "#0d9488" : isDiatonic ? "#7c7ca0" : "transparent";
        const minorChordSym = minorKeys[i] + (opts.show7ths ? "7" : "");
        svg += `<path d="M${mx1i},${my1i} L${mx1o},${my1o} A${minorOutR},${minorOutR} 0 0,1 ${mx2o},${my2o} L${mx2i},${my2i} A${minorInR},${minorInR} 0 0,0 ${mx1i},${my1i}"
        fill="${minorSegFill}" stroke="${minorSegStroke}" stroke-width="1"
        pointer-events="all" style="cursor:pointer" data-minor-chord="${minorChordSym}"/>`;
        const minorFill = isMinorChordHere ? "#e0e0e0" : isDiatonic ? "#c4b5fd" : "#9ca3af";
        if (minorDegree) {
          svg += `<text x="${mx}" y="${my - minorFont * 0.55}" text-anchor="middle" dominant-baseline="middle"
          font-size="${minorFont}" fill="${minorFill}" pointer-events="none">${minorLabel}</text>`;
          svg += `<text x="${mx}" y="${my + minorFont * 0.75}" text-anchor="middle" dominant-baseline="middle"
          font-size="${minorFont * 0.85}" fill="#818cf8" pointer-events="none">${minorDegree}</text>`;
        } else {
          svg += `<text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="middle"
          font-size="${minorFont}" fill="${minorFill}" pointer-events="none">${minorLabel}</text>`;
        }
        const da = angle, dna = nextAngle;
        const dx1o = cx + dimOutR * Math.cos(da), dy1o = cy + dimOutR * Math.sin(da);
        const dx2o = cx + dimOutR * Math.cos(dna), dy2o = cy + dimOutR * Math.sin(dna);
        const dx1i = cx + dimInR * Math.cos(da), dy1i = cy + dimInR * Math.sin(da);
        const dx2i = cx + dimInR * Math.cos(dna), dy2i = cy + dimInR * Math.sin(dna);
        const isDiatonicDim = i === diatonicDimPos;
        const dimRoot = CIRCLE_DIM[i].replace("\xB0", "");
        const dimChordSym = `${dimRoot}${opts.show7ths ? "m7b5" : "dim"}`;
        svg += `<path d="M${dx1i},${dy1i} L${dx1o},${dy1o} A${dimOutR},${dimOutR} 0 0,1 ${dx2o},${dy2o} L${dx2i},${dy2i} A${dimInR},${dimInR} 0 0,0 ${dx1i},${dy1i}"
        fill="${isDiatonicDim ? "#2a2a5a" : "#1e1e35"}" stroke="${isDiatonicDim ? "#a0a0d8" : "#3a3a5c"}" stroke-width="${isDiatonicDim ? 1.5 : 1}"
        pointer-events="all" style="cursor:pointer" data-dim-chord="${dimChordSym}"/>`;
        const dlx = cx + dimLabR * Math.cos(midAngle);
        const dly = cy + dimLabR * Math.sin(midAngle);
        const dimChord = opts.show7ths ? CIRCLE_DIM[i].replace("\xB0", "\xF87") : CIRCLE_DIM[i];
        const dimTextFill = isDiatonicDim ? "#a78bfa" : "#6b7280";
        if (opts.showDegrees && activePos !== -1) {
          svg += `<text x="${dlx}" y="${dly - dimFont * 0.55}" text-anchor="middle" dominant-baseline="middle"
          font-size="${dimFont}" fill="${dimTextFill}" pointer-events="none">${dimChord}</text>`;
          svg += `<text x="${dlx}" y="${dly + dimFont * 0.75}" text-anchor="middle" dominant-baseline="middle"
          font-size="${dimFont * 0.85}" fill="#818cf8" pointer-events="none">vii\xB0</text>`;
        } else {
          svg += `<text x="${dlx}" y="${dly}" text-anchor="middle" dominant-baseline="middle"
          font-size="${dimFont}" fill="${dimTextFill}" pointer-events="none">${dimChord}</text>`;
        }
      }
    });
    svg += "</svg>";
    container.innerHTML = svg;
    container.querySelectorAll("[data-key]").forEach((el) => {
      el.addEventListener("click", () => {
        initAudioOnGesture();
        if (el.dataset.chord) playChord(el.dataset.chord);
        onKeyClick(el.dataset.key, el.dataset.chord);
      });
    });
    container.querySelectorAll("[data-minor-chord]").forEach((el) => {
      el.addEventListener("click", () => {
        initAudioOnGesture();
        playChord(el.dataset.minorChord);
        onKeyClick(null, el.dataset.minorChord);
      });
    });
    container.querySelectorAll("[data-dim-chord]").forEach((el) => {
      el.addEventListener("click", () => {
        initAudioOnGesture();
        playChord(el.dataset.dimChord);
        onKeyClick(null, el.dataset.dimChord);
      });
    });
  }

  // src/history.ts
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
  var onChange = () => {
  };
  function setHistoryChangeCallback(cb) {
    onChange = cb;
  }
  function addEntry(symbol, notes) {
    const entry = { id: crypto.randomUUID(), symbol, notes };
    entries = [entry, ...entries].slice(0, MAX_ENTRIES);
    onChange(entries);
  }
  function removeEntry(id) {
    entries = entries.filter((e) => e.id !== id);
    onChange(entries);
  }
  function clearHistory() {
    entries = [];
    lastAutoAppended = null;
    onChange(entries);
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
    entries.forEach((entry) => {
      const analysis = activeKey ? buildHarmonicAnalysis(entry.symbol, activeKey, null) : null;
      const roman = analysis?.roman ?? "\u2014";
      const fn = analysis?.function ?? "unknown";
      const color = FUNCTION_COLORS[fn] ?? "#6b7280";
      const chip = document.createElement("div");
      chip.className = "history-chip";
      chip.dataset.id = entry.id;
      chip.classList.toggle("active-cursor", activeCursorEntryId === entry.id);
      chip.style.borderLeft = `3px solid ${color}`;
      chip.innerHTML = `
      <span class="history-chip-symbol">${entry.symbol}</span>
      <span class="history-chip-roman">${roman}</span>
    `;
      chip.addEventListener("click", () => onChipClick(entry));
      chip.addEventListener("dblclick", () => {
        if (entry.notes.length > 0) playNoteNames(entry.notes);
        else playChord(entry.symbol);
      });
      chip.title = `${entry.symbol} \u2014 dblclick to play, drag to song, right-click to remove`;
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
        removeEntry(entry.id);
      });
      strip.appendChild(chip);
    });
    let _clearPending = false;
    let _clearTimer = 0;
    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.title = "Clear history \u2014 click twice to confirm";
    clearBtn.className = "history-clear-btn";
    clearBtn.addEventListener("click", () => {
      if (_clearPending) {
        clearTimeout(_clearTimer);
        _clearPending = false;
        clearBtn.textContent = "Clear";
        clearBtn.style.background = "#374151";
        clearHistory();
      } else {
        _clearPending = true;
        clearBtn.textContent = "?";
        clearBtn.style.background = "#991b1b";
        _clearTimer = window.setTimeout(() => {
          _clearPending = false;
          clearBtn.textContent = "Clear";
          clearBtn.style.background = "#374151";
        }, 3e3);
      }
    });
    const wrap = document.createElement("div");
    wrap.className = "history-wrap";
    wrap.appendChild(strip);
    wrap.appendChild(clearBtn);
    container.innerHTML = "";
    container.appendChild(wrap);
  }

  // src/song.ts
  function createSong() {
    return { schemaVersion: 1, title: "Untitled", sections: [] };
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
    return text.split(/[\s,\n]+/).map((t) => t.trim()).filter(Boolean);
  }
  function computeDegree(chordSymbol, activeKey) {
    if (!activeKey || !chordSymbol) return "\u2014";
    try {
      const chord = UMT.parseChordSymbol(chordSymbol);
      const { analysis } = UMT.Harmony.analyzeProgression([chord], activeKey);
      const a = analysis[0];
      if (!a) return "?";
      return a.roman ?? "?";
    } catch {
      return "?";
    }
  }
  function isBorrowedChord(chordSymbol, activeKey) {
    if (!activeKey) return false;
    try {
      const chord = UMT.parseChordSymbol(chordSymbol);
      const { analysis } = UMT.Harmony.analyzeProgression([chord], activeKey);
      return analysis[0]?.isBorrowed ?? false;
    } catch {
      return false;
    }
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
  function transposeKey(key, semitones) {
    const [root, mode2] = key.split(" ");
    const pc = NOTE_SEMITONE[root];
    if (pc === void 0) return key;
    return [KEY_ROOTS[((pc + semitones) % 12 + 12) % 12], mode2].filter(Boolean).join(" ");
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
  function saveSong(song) {
    localStorage.setItem("modus-song", JSON.stringify(song));
  }
  function loadSong() {
    try {
      const raw = localStorage.getItem("modus-song") ?? localStorage.getItem("harmony-companion-song");
      if (!raw) return createSong();
      const parsed = JSON.parse(raw);
      if (parsed.schemaVersion !== 1) {
        console.warn("Song schema version mismatch \u2014 resetting");
        return createSong();
      }
      return parsed;
    } catch {
      return createSong();
    }
  }
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
  var _pendingConfirmEl = null;
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
  function confirmOnce(btn, action) {
    if (_pendingConfirmEl?.el === btn) {
      clearTimeout(_pendingConfirmEl.timer);
      _pendingConfirmEl = null;
      btn.textContent = btn.dataset.orig;
      btn.style.background = "#374151";
      action();
      return;
    }
    if (_pendingConfirmEl) {
      clearTimeout(_pendingConfirmEl.timer);
      _pendingConfirmEl.el.textContent = _pendingConfirmEl.el.dataset.orig;
      _pendingConfirmEl.el.style.background = "#374151";
      _pendingConfirmEl = null;
    }
    btn.dataset.orig = btn.textContent;
    btn.textContent = "?";
    btn.style.background = "#991b1b";
    const timer = window.setTimeout(() => {
      btn.textContent = btn.dataset.orig;
      btn.style.background = "#374151";
      _pendingConfirmEl = null;
    }, 3e3);
    _pendingConfirmEl = { el: btn, timer };
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
    const newBtn = makeBtn("New", "#374151", () => {
      confirmOnce(newBtn, () => {
        _song = createSong();
        saveSong(_song);
        h.onSongChange(_song);
      });
    });
    newBtn.title = "Start new song \u2014 click twice to confirm";
    const pasteArea = document.createElement("div");
    pasteArea.className = "paste-area";
    pasteArea.style.display = "none";
    const pasteTA = document.createElement("textarea");
    pasteTA.placeholder = "Am G C F  (space, comma or newline separated)";
    pasteTA.rows = 2;
    pasteTA.className = "paste-textarea";
    const pasteSubmit = makeBtn("Add chords", "#4f46e5", () => {
      const text = pasteTA.value.trim();
      if (!text) return;
      const symbols = parseProgressionText(text);
      if (!_song.sections.length) {
        _song = addSection(_song, "Section", "verse");
      }
      const section = _song.sections[_song.sections.length - 1];
      const measure = newPasteMeasure(symbols);
      _song = { ..._song, sections: _song.sections.map((s) => s.id !== section.id ? s : { ...s, measures: [...s.measures, measure] }) };
      if (symbols.length > 8) showNotice("All chords added to one measure \u2014 split as needed.");
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
      printWin.document.write(buildPrintHTML(_song, h.activeKey));
      printWin.document.close();
      printWin.print();
    });
    exportBtn.title = "Print / export song to PDF";
    const pasteBtn = makeBtn("Paste", "#374151", () => {
      const open = pasteArea.style.display === "none";
      pasteArea.style.display = open ? "block" : "none";
      if (open) pasteTA.focus();
    });
    pasteBtn.title = "Paste a chord progression as text";
    header.append(titleInput, newBtn, templateWrap, transposeSelect, exportBtn, pasteBtn);
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
      root.appendChild(buildSectionDOM(section, song, h, measureNums));
    });
    return root;
  }
  function newPasteMeasure(symbols) {
    return {
      id: crypto.randomUUID(),
      chords: symbols.map((sym) => ({
        id: crypto.randomUUID(),
        symbol: sym,
        valid: isValidChordSymbol(sym)
      }))
    };
  }
  function buildSectionDOM(section, song, h, measureNums) {
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
      confirmOnce(delBtn, () => {
        _song = removeSection(_song, section.id);
        saveSong(_song);
        h.onSongChange(_song);
      });
    });
    delBtn.style.color = "#f87171";
    delBtn.title = "Delete section \u2014 click twice to confirm";
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
      _song = removeMeasure(_song, section.id, measure.id);
      saveSong(_song);
      h.onSongChange(_song);
    });
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
    const delBtn = makeSmallBtn("\xD7", () => {
      _song = removeChord(_song, chord.id);
      saveSong(_song);
      h.onSongChange(_song);
    });
    delBtn.title = "Remove chord";
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
    wrap.addEventListener("click", () => h.onChordClick(chord.id, chord.symbol, chord.notes));
    wrap.addEventListener("dblclick", () => {
      initAudioOnGesture();
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
    <h1>${song.title}</h1>
    <div class="key">${activeKey ? "Key: " + activeKey : ""}</div>`;
    for (const section of song.sections) {
      html += `<div class="section"><div class="section-name">${section.name}${section.repeatCount > 1 ? ` \xD7${section.repeatCount}` : ""}</div><div class="measures">`;
      for (const measure of section.measures) {
        const num = measureNums.get(measure.id) ?? "";
        html += `<div class="measure"><div class="bar-num">${num}</div>`;
        for (const chord of measure.chords) {
          const degree = activeKey ? computeDegree(chord.symbol, activeKey) : "\u2014";
          html += `<div class="chord">${chord.symbol}</div><div class="degree">${degree}</div>`;
        }
        html += "</div>";
      }
      html += "</div></div>";
    }
    html += "</body></html>";
    return html;
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

  // src/shortcuts.ts
  var SHORTCUTS = [
    { key: "Space", action: "Play current chord (or last if none active)" },
    { key: "H", action: "Toggle Hold mode" },
    { key: "A", action: "Toggle Arpeggio mode" },
    { key: "S", action: "Send history chip \u2192 Song" },
    { key: "C", action: "Clear history" },
    { key: "Esc", action: "Clear cursor / capture" },
    { key: "1\u20139", action: "Select chord candidate" },
    { key: "P", action: "Play current chord" },
    { key: "?", action: "Show / hide this panel" }
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
      <span>Keyboard shortcuts</span>
      <button class="shortcut-help-close">\xD7</button>
    </div>
    ${SHORTCUTS.map((s) => `
      <div class="shortcut-row">
        <kbd class="shortcut-key">${s.key}</kbd>
        <span class="shortcut-action">${s.action}</span>
      </div>`).join("")}`;
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

  // src/analysis-panel.ts
  var ANALYSIS_FIELD_KEYS = ["roman", "function", "figbass", "diatonic", "scales", "cadence", "secondary", "coltrane", "negharm", "subs"];
  var ANALYSIS_FIELD_LABELS = {
    roman: "Roman",
    function: "Func",
    figbass: "Fig",
    diatonic: "Diat",
    scales: "Scl",
    cadence: "Cad",
    secondary: "Sec",
    coltrane: "Colt",
    negharm: "Neg",
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
    coltrane: "Coltrane axis",
    negharm: "Negative harmony",
    subs: "Substitutions"
  };
  function renderChordSummary(detection, onAltSelect2) {
    const el = document.getElementById("chord-summary");
    if (!el) return;
    if (!detection || detection.kind !== "chord") {
      el.innerHTML = "";
      return;
    }
    const chordName = detection.candidates[detection.selectedIndex];
    const color = chordColor(chordName);
    const notes = detection.notes.map((n) => n.replace(/(-?\d+)$/, "")).join(" \xB7 ");
    const alts = detection.candidates.slice(1, 7);
    el.innerHTML = `
    <div class="chord-summary-row">
      <span class="chord-name-badge" style="background:${color}22;border-left:3px solid ${color}">${chordName}</span>
      <span class="chord-notes">${notes}</span>
      ${alts.map(
      (c, i) => `<button class="alt-chord-btn alt-chord-sum" data-idx="${i + 1}">${c}</button>`
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
      <span class="analysis-value">${val}</span>
    </div>`;
    const maybeRow = (f, label, val) => fieldsVisible[f] ? row(label, val) : "";
    const conditionalRow = (f, label, val) => fieldsVisible[f] ? row(label, val ?? "\u2014") : "";
    let roman = "\u2014", func_ = "\u2014", figuredBass = "\u2014", diatonic = "\u2014", scales = "\u2014", cadence = "\u2014";
    let secondary = null, coltrane = null;
    let negharm = null, subs = null;
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
      if (analysis.isSecondary) secondary = `\u2192 ${analysis.secondaryTarget}`;
      if (analysis.coltraneAxis) coltrane = analysis.coltraneAxis.join(" \xB7 ");
      if (analysis.negativeHarmony) negharm = analysis.negativeHarmony;
      if (analysis.substitutions?.length) subs = analysis.substitutions.join(", ");
    }
    el.innerHTML = maybeRow("roman", "Roman", roman) + maybeRow("function", "Function", func_) + maybeRow("figbass", "Fig. bass", figuredBass) + maybeRow("diatonic", "Diatonic", diatonic) + maybeRow("scales", "Scales", scales) + maybeRow("cadence", "Cadence", cadence) + conditionalRow("secondary", "Secondary", secondary) + conditionalRow("coltrane", "Coltrane", coltrane) + conditionalRow("negharm", "Neg. harm.", negharm) + conditionalRow("subs", "Subs.", subs) + extra;
  }

  // src/app.ts
  var staffWidth = 380;
  var cofSize = parseInt(localStorage.getItem("cof-size") ?? "160");
  var cofAccidental = localStorage.getItem("cof-accidental") ?? "flat";
  var cofShowMinor = JSON.parse(localStorage.getItem("cof-show-minor") ?? "true");
  var cofShowDegrees = JSON.parse(localStorage.getItem("cof-show-degrees") ?? "false");
  var cofShow7ths = JSON.parse(localStorage.getItem("cof-show-7ths") ?? "false");
  var analysisFieldsVisible = {
    roman: JSON.parse(localStorage.getItem("analysis-field-roman") ?? "true"),
    function: JSON.parse(localStorage.getItem("analysis-field-function") ?? "true"),
    figbass: JSON.parse(localStorage.getItem("analysis-field-figbass") ?? "true"),
    diatonic: JSON.parse(localStorage.getItem("analysis-field-diatonic") ?? "true"),
    scales: JSON.parse(localStorage.getItem("analysis-field-scales") ?? "true"),
    cadence: JSON.parse(localStorage.getItem("analysis-field-cadence") ?? "true"),
    secondary: JSON.parse(localStorage.getItem("analysis-field-secondary") ?? "true"),
    coltrane: JSON.parse(localStorage.getItem("analysis-field-coltrane") ?? "true"),
    negharm: JSON.parse(localStorage.getItem("analysis-field-negharm") ?? "true"),
    subs: JSON.parse(localStorage.getItem("analysis-field-subs") ?? "true")
  };
  var analysisScale = parseInt(localStorage.getItem("analysis-scale") ?? "11");
  var lastChordSymbol = null;
  var lastChordMidi = [];
  var state = {
    activeKey: localStorage.getItem("active-key") || null,
    detection: null,
    analysis: null,
    history: [],
    song: loadSong(),
    activeCursorId: null,
    historyActiveCursorId: null,
    captureTargetId: null,
    panels: {
      notation: true,
      instruments: JSON.parse(localStorage.getItem("panel-instruments") ?? "true"),
      colPiano: JSON.parse(localStorage.getItem("panel-colPiano") ?? "true"),
      colNeck: JSON.parse(localStorage.getItem("panel-colNeck") ?? "true"),
      history: JSON.parse(localStorage.getItem("panel-history") ?? "true"),
      song: JSON.parse(localStorage.getItem("panel-song") ?? "true"),
      cofControls: JSON.parse(localStorage.getItem("panel-cofControls") ?? "true"),
      guitarControls: JSON.parse(localStorage.getItem("panel-guitarControls") ?? "true"),
      analysisControls: JSON.parse(localStorage.getItem("panel-analysisControls") ?? "true"),
      colStaff: JSON.parse(localStorage.getItem("panel-colStaff") ?? "true"),
      colAnalysis: JSON.parse(localStorage.getItem("panel-colAnalysis") ?? "true"),
      colCoF: JSON.parse(localStorage.getItem("panel-colCoF") ?? "true"),
      colGuitar: JSON.parse(localStorage.getItem("panel-colGuitar") ?? "true")
    }
  };
  function showModal(title, message, onConfirm, onCancel) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
    <div class="modal-popup">
      <div class="modal-title">${title}</div>
      <div class="modal-message">${message}</div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel">Cancel</button>
        <button class="modal-btn modal-btn-confirm">Confirm</button>
      </div>
    </div>`;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelector(".modal-btn-cancel").addEventListener("click", () => {
      close();
      onCancel?.();
    });
    backdrop.querySelector(".modal-btn-confirm").addEventListener("click", () => {
      close();
      onConfirm();
    });
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) {
        close();
        onCancel?.();
      }
    });
  }
  var $ = (id) => document.getElementById(id);
  function init() {
    if (!navigator.requestMIDIAccess) {
      $("browser-warning").style.display = "block";
    }
    document.addEventListener("click", initAudioOnGesture, { once: true });
    buildLayout();
    wireKeyboard();
    renderZone1Diagrams([], null);
    renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect);
    initMidi().then((result) => {
      if (result.denied) {
        showMidiBanner("MIDI access denied. Grant permission in browser settings to use a controller.");
      }
      if (!result.unsupported) {
        refreshDeviceDropdown();
        setModeBtn(getMode());
      }
    });
    setNoteChangeCallback(onNoteChange2);
    setNoteOnCallback((note) => {
      initAudioOnGesture();
      playNote(note, 1.5);
    });
    setHistoryChangeCallback(onHistoryChange);
    let progressTimer = null;
    let progressValue = 0;
    setAudioStatusCallback((status) => {
      const el = document.getElementById("audio-status");
      const fill = document.getElementById("audio-progress-fill");
      if (!el || !fill) return;
      const labels = { idle: "\u266A idle", loading: "\u266A loading\u2026", suspended: "\u266A click to activate", ready: "\u266A ready", error: "\u266A error" };
      el.textContent = labels[status] ?? status;
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
      if (status === "loading") {
        progressValue = 0;
        fill.style.background = "";
        fill.style.transition = "none";
        fill.style.width = "0%";
        progressTimer = setInterval(() => {
          progressValue += (90 - progressValue) * 0.06;
          fill.style.transition = "width 0.1s linear";
          fill.style.width = progressValue.toFixed(1) + "%";
        }, 100);
      } else if (status === "suspended") {
        fill.style.background = "#f59e0b";
        fill.style.transition = "width 0.3s ease-out";
        fill.style.width = "100%";
      } else if (status === "ready") {
        fill.style.background = "#22c55e";
        fill.style.transition = "width 0.2s ease-out";
        fill.style.width = "100%";
      } else if (status === "error") {
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
        if (!symbol) return;
        if (notes?.length) {
          state.analysis = buildHarmonicAnalysis(symbol, state.activeKey, getLastHistorySymbol());
          state.detection = { kind: "chord", notes, candidates: [symbol], selectedIndex: 0 };
          renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect);
          renderZone1Diagrams(notes, symbol);
        } else {
          triggerChordAnalysis(symbol);
        }
      },
      onChordCapture: (id) => {
        state.captureTargetId = id;
        state.activeCursorId = id;
        renderZone3();
      },
      activeCursorId: state.activeCursorId,
      captureTargetId: state.captureTargetId,
      activeKey: state.activeKey,
      onSongChange: (song) => {
        state.song = song;
        saveSong(song);
        renderZone3();
      }
    };
  }
  function buildToolbar() {
    return `
    <div id="z1-toolbar" class="toolbar">
      <span id="midi-status" class="midi-status">MIDI: \u2014</span>
      <select id="midi-device" class="ctrl-select"></select>
      <button id="btn-normal" class="mode-btn" data-mode="normal">Normal</button>
      <button id="btn-hold" class="mode-btn" data-mode="hold">Hold</button>
      <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio">Arpeggio</button>
      <select id="key-select" class="ctrl-select">
        <option value="">Key: Auto</option>
        ${["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].flatMap(
      (r) => [`<option value="${r} Major">${r} Major</option>`, `<option value="${r} Minor">${r} Minor</option>`]
    ).join("")}
      </select>
      <span id="auto-key-label" class="auto-key-label"></span>
      <span class="toolbar-sep"></span>
      <div id="audio-progress" class="audio-progress" title="Soundfont status">
        <div id="audio-progress-fill" class="audio-progress-fill"></div>
        <span id="audio-status" class="audio-status">\u266A idle</span>
      </div>
      <button id="btn-play-chord" class="ctrl-btn" title="Play current chord (P)">\u25B6</button>
      <select id="audio-instrument" class="ctrl-select" title="Soundfont instrument">
        ${GM_INSTRUMENT_GROUPS.map(
      (g) => `<optgroup label="${g.label}">${g.instruments.map(
        (i) => `<option value="${i}"${i === getCurrentInstrument() ? " selected" : ""}>${i.replace(/_/g, " ")}</option>`
      ).join("")}</optgroup>`
    ).join("")}
      </select>
      <input id="audio-volume" type="range" min="0" max="1" step="0.05" value="${getVolume()}" title="Volume" class="volume-slider">
      <button id="btn-help" class="help-btn" title="Keyboard shortcuts">?</button>
    </div>`;
  }
  function buildNotationPanel() {
    return `
    <div id="notation-panel" class="zone-panel">
      <div class="panel-header">
        <span>Notation</span>
        <div class="col-vis-row">
          <button class="col-vis-btn${state.panels.colStaff ? " active" : ""}" data-col="colStaff" title="Staff">St</button>
          <button class="col-vis-btn${state.panels.colAnalysis ? " active" : ""}" data-col="colAnalysis" title="Analysis">An</button>
          <button class="col-vis-btn${state.panels.colCoF ? " active" : ""}" data-col="colCoF" title="Circle of Fifths">CoF</button>
          <button class="col-vis-btn${state.panels.colGuitar ? " active" : ""}" data-col="colGuitar" title="Guitar">Git</button>
        </div>
        <button class="toggle-btn" data-panel="notation">\u25BC</button>
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
            <button class="toggle-btn small" data-panel="analysisControls">\u25BC</button>
          </div>
          <div id="analysis-content"></div>
          <div id="analysis-controls">
            <div class="ctrl-row">
              <button id="btn-analysis-minus" class="size-ctrl-btn" title="Smaller">\u2212</button>
              <button id="btn-analysis-plus"  class="size-ctrl-btn" title="Larger">+</button>
            </div>
            <div class="ctrl-row" style="display:grid;grid-template-columns:repeat(5,1fr);gap:2px">
              ${ANALYSIS_FIELD_KEYS.map(
      (f) => `<button id="btn-field-${f}" class="size-ctrl-btn${analysisFieldsVisible[f] ? " active" : ""}"
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
  function buildInstrumentsPanel() {
    return `
    <div id="instruments-panel" class="zone-panel">
      <div class="panel-header">
        <span>Instruments</span>
        <div class="col-vis-row">
          <button class="col-vis-btn${state.panels.colPiano ? " active" : ""}" data-col="colPiano" title="Piano">Pi</button>
          <button class="col-vis-btn${state.panels.colNeck ? " active" : ""}" data-col="colNeck"  title="Fretboard">Fr</button>
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
  function wireLayoutEvents() {
    const updateCofButtons = () => {
      ;
      $("btn-cof-flat").classList.toggle("active", cofAccidental === "flat");
      $("btn-cof-sharp").classList.toggle("active", cofAccidental === "sharp");
      $("btn-cof-minor").style.opacity = cofShowMinor ? "1" : "0.4";
      $("btn-cof-deg").style.opacity = cofShowDegrees ? "1" : "0.4";
      $("btn-cof-7").style.opacity = cofShow7ths ? "1" : "0.4";
    };
    updateCofButtons();
    $("btn-cof-minus").addEventListener("click", () => {
      cofSize = Math.max(100, cofSize - 20);
      localStorage.setItem("cof-size", String(cofSize));
      reRenderDiagrams();
    });
    $("btn-cof-plus").addEventListener("click", () => {
      cofSize = Math.min(400, cofSize + 20);
      localStorage.setItem("cof-size", String(cofSize));
      reRenderDiagrams();
    });
    $("btn-cof-flat").addEventListener("click", () => {
      cofAccidental = "flat";
      localStorage.setItem("cof-accidental", cofAccidental);
      updateCofButtons();
      reRenderDiagrams();
    });
    $("btn-cof-sharp").addEventListener("click", () => {
      cofAccidental = "sharp";
      localStorage.setItem("cof-accidental", cofAccidental);
      updateCofButtons();
      reRenderDiagrams();
    });
    $("btn-cof-minor").addEventListener("click", () => {
      cofShowMinor = !cofShowMinor;
      localStorage.setItem("cof-show-minor", String(cofShowMinor));
      updateCofButtons();
      reRenderDiagrams();
    });
    $("btn-cof-deg").addEventListener("click", () => {
      cofShowDegrees = !cofShowDegrees;
      localStorage.setItem("cof-show-degrees", String(cofShowDegrees));
      updateCofButtons();
      reRenderDiagrams();
    });
    $("btn-cof-7").addEventListener("click", () => {
      cofShow7ths = !cofShow7ths;
      localStorage.setItem("cof-show-7ths", String(cofShow7ths));
      updateCofButtons();
      reRenderDiagrams();
    });
    const updateAnalysisFieldButtons = () => {
      ANALYSIS_FIELD_KEYS.forEach((f) => {
        const btn = document.getElementById(`btn-field-${f}`);
        if (btn) btn.classList.toggle("active", analysisFieldsVisible[f]);
      });
    };
    $("btn-analysis-minus").addEventListener("click", () => {
      analysisScale = Math.max(8, analysisScale - 1);
      localStorage.setItem("analysis-scale", String(analysisScale));
      renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect);
    });
    $("btn-analysis-plus").addEventListener("click", () => {
      analysisScale = Math.min(20, analysisScale + 1);
      localStorage.setItem("analysis-scale", String(analysisScale));
      renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect);
    });
    const reRenderNeck = () => {
      const d = state.detection;
      const notes = d?.kind === "chord" ? d.notes : d?.kind === "note" ? [d.noteName] : d?.notes ?? [];
      const sym = d?.kind === "chord" ? d.candidates[d.selectedIndex] : null;
      const chordRoot = sym ? (sym.match(/^([A-G][b#]?)/) ?? [, ""])[1] || null : null;
      renderNeck($("neck-container"), notes, chordRoot);
    };
    $("btn-neck-minus").addEventListener("click", () => {
      adjustNeckSpacing(-2);
      reRenderNeck();
    });
    $("btn-neck-plus").addEventListener("click", () => {
      adjustNeckSpacing(2);
      reRenderNeck();
    });
    ANALYSIS_FIELD_KEYS.forEach((f) => {
      $(`btn-field-${f}`).addEventListener("click", () => {
        analysisFieldsVisible[f] = !analysisFieldsVisible[f];
        localStorage.setItem(`analysis-field-${f}`, String(analysisFieldsVisible[f]));
        updateAnalysisFieldButtons();
        renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect);
      });
    });
    document.querySelectorAll(".col-vis-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const col = btn.dataset.col;
        state.panels[col] = !state.panels[col];
        localStorage.setItem(`panel-${col}`, JSON.stringify(state.panels[col]));
        applyPanelVisibility();
      });
    });
    if (state.activeKey) {
      $("key-select").value = state.activeKey;
    }
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = btn.dataset.mode;
        if (getMode() === m) return;
        setMode(m);
        document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active-mode"));
        btn.classList.add("active-mode");
      });
    });
    $("key-select").addEventListener("change", (e) => {
      state.activeKey = e.target.value || null;
      localStorage.setItem("active-key", state.activeKey ?? "");
      refreshAll();
    });
    document.querySelectorAll(".toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.dataset.panel;
        state.panels[panel] = !state.panels[panel];
        if (panel === "history" || panel === "song" || panel === "instruments" || panel === "cofControls" || panel === "guitarControls" || panel === "analysisControls") {
          localStorage.setItem(`panel-${panel}`, JSON.stringify(state.panels[panel]));
        }
        applyPanelVisibility();
      });
    });
    $("btn-help").addEventListener("click", toggleHelp);
    $("btn-play-chord").addEventListener("click", () => {
      initAudioOnGesture();
      if (lastChordMidi.length > 0) {
        playMidiNotes(lastChordMidi);
      } else if (lastChordSymbol) {
        playChord(lastChordSymbol);
      }
    });
    $("audio-instrument").addEventListener("change", (e) => {
      setInstrument(e.target.value);
    });
    $("audio-volume").addEventListener("input", (e) => {
      setVolume(parseFloat(e.target.value));
    });
  }
  function buildLayout() {
    $("zone1").innerHTML = buildToolbar() + buildNotationPanel() + buildInstrumentsPanel() + '<div id="midi-banner"></div>';
    buildZoneHeaders();
    wireLayoutEvents();
    applyPanelVisibility();
  }
  function applyPanelVisibility() {
    const nc = $("notation-content");
    if (nc) nc.style.display = state.panels.notation ? "flex" : "none";
    const ic = $("instruments-content");
    if (ic) ic.style.display = state.panels.instruments ? "" : "none";
    const cp = $("col-piano");
    if (cp) cp.style.display = state.panels.colPiano ? "" : "none";
    const cn = $("col-neck");
    if (cn) cn.style.display = state.panels.colNeck ? "" : "none";
    const z2 = $("zone2-content");
    if (z2) z2.style.display = state.panels.history ? "" : "none";
    const z3 = $("zone3-content");
    if (z3) z3.style.display = state.panels.song ? "" : "none";
    const cc = $("cof-controls");
    if (cc) cc.style.display = state.panels.cofControls ? "" : "none";
    setGuitarControlsVisible(state.panels.guitarControls);
    const gcw = document.getElementById("guitar-ctrl-wrap");
    if (gcw) gcw.style.display = state.panels.guitarControls ? "" : "none";
    const ac = $("analysis-controls");
    if (ac) ac.style.display = state.panels.analysisControls ? "" : "none";
    const cs = $("col-staff");
    if (cs) cs.style.display = state.panels.colStaff ? "" : "none";
    const ca = $("col-analysis");
    if (ca) ca.style.display = state.panels.colAnalysis ? "" : "none";
    const ccof = $("col-cof");
    if (ccof) ccof.style.display = state.panels.colCoF ? "" : "none";
    const cg = $("col-guitar");
    if (cg) cg.style.display = state.panels.colGuitar ? "" : "none";
    document.querySelectorAll(".col-vis-btn").forEach((btn) => {
      const col = btn.dataset.col;
      if (col) btn.classList.toggle("active", !!state.panels[col]);
    });
    ["notation", "instruments", "history", "song", "cofControls", "guitarControls", "analysisControls"].forEach((key) => {
      const btn = document.querySelector(`.toggle-btn[data-panel="${key}"]`);
      if (btn) btn.textContent = state.panels[key] ? "\u25B2" : "\u25BC";
    });
  }
  var CAPTURE_SETTLE_MS = 250;
  var captureTimer = null;
  function scheduleCapture(symbol, notes) {
    if (captureTimer) clearTimeout(captureTimer);
    captureTimer = setTimeout(() => {
      captureTimer = null;
      const targetId = state.captureTargetId;
      if (!targetId) return;
      state.song = updateChord(state.song, targetId, symbol, notes);
      saveSong(state.song);
      state.activeCursorId = findChordAfter(state.song, targetId)?.id ?? null;
      state.captureTargetId = null;
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
    const result = analyzeNotes(notes);
    state.detection = result;
    if (state.captureTargetId) {
      const sym = result?.kind === "chord" ? result.candidates[0] : null;
      if (result?.kind === "chord" && sym && sym !== "?") scheduleCapture(sym, result.notes);
      else cancelCapture();
    }
    if (result?.kind === "chord") {
      const sym = result.candidates[result.selectedIndex];
      if (sym && sym !== "?") {
        lastChordSymbol = sym;
        lastChordMidi = [...notes];
      }
      const isKnown = sym !== "?";
      state.analysis = null;
      if (isKnown) {
        try {
          state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol());
        } catch {
        }
        notifyChordDetected(sym, result.notes);
      }
      renderZone1Diagrams(result.notes, isKnown ? sym : null);
    } else if (result?.kind === "note") {
      state.analysis = null;
      renderZone1Diagrams([result.noteName], null);
    } else if (result?.kind === "interval") {
      state.analysis = null;
      renderZone1Diagrams(result.notes, null);
    } else {
      state.analysis = null;
      renderZone1Diagrams([], null);
    }
    renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect);
    refreshAutoKey();
  }
  function getLastHistorySymbol() {
    return state.history[0]?.symbol ?? null;
  }
  function onAltSelect(idx) {
    if (state.detection?.kind !== "chord") return;
    state.detection.selectedIndex = idx;
    const sym = state.detection.candidates[idx];
    state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol());
    renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect);
    renderZone1Diagrams(state.detection.notes, sym);
  }
  function renderZone1Diagrams(noteNames, chordSymbol) {
    renderStaff($("staff-container"), noteNames, staffWidth, state.activeKey);
    renderPiano($("piano-container"), noteNames, chordSymbol);
    const chordRoot = chordSymbol ? (chordSymbol.match(/^([A-G][b#]?)/) ?? [, ""])[1] || null : null;
    renderNeck($("neck-container"), noteNames, chordRoot);
    renderGuitar($("guitar-container"), chordSymbol, noteNames);
    renderCircleOfFifths($("cof-container"), state.activeKey, chordSymbol ?? null, (key, chord) => {
      if (key) {
        state.activeKey = key;
        localStorage.setItem("active-key", key);
        $("key-select").value = key;
      }
      if (chord) {
        triggerChordAnalysis(chord);
        renderZone2();
        renderZone3();
      } else {
        refreshAll();
      }
    }, cofSize, { accidental: cofAccidental, showMinor: cofShowMinor, showDegrees: cofShowDegrees, show7ths: cofShow7ths });
  }
  function reRenderDiagrams() {
    const d = state.detection;
    if (!d) {
      renderZone1Diagrams([], null);
      return;
    }
    if (d.kind === "chord") renderZone1Diagrams(d.notes, d.candidates[d.selectedIndex]);
    else if (d.kind === "note") renderZone1Diagrams([d.noteName], null);
    else renderZone1Diagrams(d.notes ?? [], null);
  }
  function renderZone2() {
    renderHistory(
      $("zone2-content"),
      state.activeKey,
      (entry) => {
        state.historyActiveCursorId = entry.id;
        if (entry.notes.length > 0) {
          state.analysis = buildHarmonicAnalysis(entry.symbol, state.activeKey, getLastHistorySymbol());
          state.detection = { kind: "chord", notes: entry.notes, candidates: [entry.symbol], selectedIndex: 0 };
          renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect);
          renderZone1Diagrams(entry.notes, entry.symbol);
        } else {
          triggerChordAnalysis(entry.symbol);
        }
        markActiveHistoryEntry($("zone2-content"), entry.id);
      },
      state.historyActiveCursorId
    );
  }
  function renderZone3() {
    mountSong($("zone3-content"), state.song, makeSongHandlers());
  }
  function refreshAll() {
    reRenderDiagrams();
    renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect);
    renderZone2();
    renderZone3();
  }
  function triggerChordAnalysis(symbol) {
    state.analysis = buildHarmonicAnalysis(symbol, state.activeKey, getLastHistorySymbol());
    state.detection = { kind: "chord", notes: [], candidates: [symbol], selectedIndex: 0 };
    renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect);
    renderZone1Diagrams(chordNoteNames(symbol), symbol);
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
  function findChordAfter(song, afterId) {
    for (const section of song.sections) {
      for (const measure of section.measures) {
        const idx = measure.chords.findIndex((c) => c.id === afterId);
        if (idx !== -1 && idx + 1 < measure.chords.length) {
          return measure.chords[idx + 1];
        }
      }
    }
    return null;
  }
  function onHistoryChange(entries2) {
    state.history = entries2;
    renderZone2();
    refreshAutoKey();
  }
  function refreshAutoKey() {
    const auto = getAutoKey(state.history);
    const label = $("auto-key-label");
    if (label) label.textContent = state.activeKey ? "" : auto ? `auto: ${auto}` : "";
    if (!state.activeKey && auto && state.analysis) {
      const sym = state.detection?.kind === "chord" ? state.detection.candidates[0] : null;
      if (sym) {
        state.analysis = buildHarmonicAnalysis(sym, auto, getLastHistorySymbol());
        renderZone1Analysis(state.detection, state.analysis, analysisFieldsVisible, analysisScale, onAltSelect);
      }
    }
  }
  var deviceListenersAttached = false;
  function refreshDeviceDropdown() {
    const sel = $("midi-device");
    const devices = getDevices();
    sel.innerHTML = devices.length ? devices.map((d) => `<option value="${d.id}">${d.name}</option>`).join("") : "<option>No MIDI devices</option>";
    sel.onchange = () => selectDevice(sel.value);
    const current = getSelectedDeviceId();
    const target = devices.find((d) => d.id === current)?.id ?? devices[0]?.id;
    if (target) {
      selectDevice(target);
      sel.value = target;
    }
    $("midi-status").textContent = devices.length ? "MIDI: connected" : "MIDI: no devices";
    $("midi-status").style.color = devices.length ? "#4ade80" : "#6b7280";
    if (!deviceListenersAttached) {
      deviceListenersAttached = true;
      window.addEventListener("midi-devices-changed", () => refreshDeviceDropdown());
      window.addEventListener("midi-device-disconnected", () => {
        $("midi-status").textContent = "MIDI: disconnected";
        $("midi-status").style.color = "#f87171";
      });
    }
  }
  function showMidiBanner(msg) {
    const el = $("midi-banner");
    el.textContent = msg;
    el.style.display = "block";
  }
  function wireKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (t instanceof HTMLElement && t.isContentEditable) return;
      switch (e.key) {
        case "h":
        case "H":
          setModeBtn(getMode() === "hold" ? "normal" : "hold");
          break;
        case "a":
        case "A":
          setModeBtn(getMode() === "arpeggio" ? "normal" : "arpeggio");
          break;
        case " ":
          e.preventDefault();
          initAudioOnGesture();
          if (state.detection?.kind === "chord" && state.detection.notes.length > 0) {
            playNoteNames(state.detection.notes);
          } else if (lastChordMidi.length > 0) {
            playMidiNotes(lastChordMidi);
          } else if (lastChordSymbol) {
            playChord(lastChordSymbol);
          }
          break;
        case "s":
        case "S": {
          const activeEntry = state.historyActiveCursorId ? state.history.find((e2) => e2.id === state.historyActiveCursorId) : state.history[0];
          if (activeEntry) sendToSong(activeEntry);
          break;
        }
        case "p":
        case "P":
          if (lastChordMidi.length > 0) {
            playMidiNotes(lastChordMidi);
          } else if (lastChordSymbol) {
            playChord(lastChordSymbol);
          }
          break;
        case "c":
        case "C":
          showModal("Clear history", "Remove all history entries?", clearHistory);
          break;
        case "?":
          e.preventDefault();
          toggleHelp();
          break;
        case "Escape":
          if (closeHelp()) break;
          state.activeCursorId = null;
          state.captureTargetId = null;
          renderZone3();
          break;
        default:
          if (e.key >= "1" && e.key <= "9") {
            const idx = parseInt(e.key) - 1;
            if (state.detection?.kind === "chord" && idx < state.detection.candidates.length) onAltSelect(idx);
          }
      }
    });
  }
  function setModeBtn(mode2) {
    setMode(mode2);
    document.querySelectorAll(".mode-btn").forEach((b) => {
      b.classList.toggle("active-mode", b.dataset.mode === mode2);
    });
  }
  init();
})();
//# sourceMappingURL=app.js.map
