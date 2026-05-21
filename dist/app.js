"use strict";
(() => {
  // src/midi.ts
  var PITCH_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  function midiToNoteName(midiNote) {
    const pc = midiNote % 12;
    const octave = Math.floor(midiNote / 12) - 1;
    return PITCH_NAMES_FLAT[pc] + octave;
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
  function setNoteChangeCallback(cb) {
    onNoteChange = cb;
  }
  async function initMidi() {
    if (!navigator.requestMIDIAccess) {
      return { ok: false, denied: false, unsupported: true };
    }
    try {
      midiAccess = await navigator.requestMIDIAccess();
      midiAccess.onstatechange = () => refreshDeviceList();
      const savedMode = localStorage.getItem("midi-mode");
      if (savedMode && ["normal", "hold", "arpeggio"].includes(savedMode))
        mode = savedMode;
      restoreDevice();
      return { ok: true, denied: false, unsupported: false };
    } catch {
      return { ok: false, denied: true, unsupported: false };
    }
  }
  function getDevices() {
    if (!midiAccess)
      return [];
    return Array.from(midiAccess.inputs.values()).map((i) => ({ id: i.id, name: i.name ?? i.id }));
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
    if (target)
      selectDevice(target);
  }
  function attachToDevice(id) {
    if (!midiAccess)
      return;
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
    if (!e.data || e.data.length < 3)
      return;
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
    if (mode === "normal") {
      activeNotes.add(note);
      onNoteChange(sortedNotes(activeNotes));
    } else if (mode === "hold") {
      if (physicallyHeldNotes.size === 0)
        activeNotes.clear();
      physicallyHeldNotes.add(note);
      activeNotes.add(note);
      onNoteChange(sortedNotes(activeNotes));
    } else if (mode === "arpeggio") {
      if (arpeggioTimer)
        clearTimeout(arpeggioTimer);
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
    if (m === mode)
      return;
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
    const inv = n === 0 ? 0 : 12 - n;
    return { name: INTERVAL_NAMES[n], inversionName: INTERVAL_NAMES[inv] };
  }
  function noteNameToUMT(name) {
    return UMT.parseNote(name);
  }
  function analyzeNotes(midiNotes, activeKey, prevChordSymbol) {
    if (midiNotes.length === 0)
      return null;
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
      const umtNotes = noteNames.map(noteNameToUMT);
      candidates = UMT.Harmony.detectChords(umtNotes) ?? [];
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
    const chord = UMT.parseChordSymbol(chordSymbol);
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
          if (cad && cad !== "No standard cadence")
            cadence = cad;
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
      negativeHarmony,
      detectedKey: null
      // filled by getAutoKey separately
    };
  }
  function getAutoKey(history) {
    if (history.length === 0)
      return null;
    const allNotes = history.flatMap((e) => e.notes.map((n) => UMT.parseNote(n)));
    if (allNotes.length === 0)
      return null;
    try {
      const results = UMT.KeyDetection.detect(allNotes);
      return results[0]?.key ?? null;
    } catch {
      return null;
    }
  }

  // src/audio.ts
  var audioCtx = null;
  var player = null;
  var ready = false;
  function ensureContext() {
    if (!audioCtx) {
      audioCtx = new AudioContext();
      player = new WebAudioFontPlayer();
      player.loader.decodeAfterLoading(audioCtx, "_tone_0000_GeneralUserGS_sf2_file");
    }
  }
  function initAudioOnGesture() {
    if (ready)
      return;
    ensureContext();
    audioCtx.resume().then(() => {
      ready = true;
    });
  }
  function playNote(midiNumber, duration = 1.5) {
    if (!audioCtx || !player)
      return;
    audioCtx.resume();
    player.queueWaveTable(
      audioCtx,
      audioCtx.destination,
      _tone_0000_GeneralUserGS_sf2_file,
      0,
      midiNumber,
      duration,
      0.8
    );
  }
  function playNoteByName(noteName, duration = 1.5) {
    const midi = noteNameToMidi(noteName);
    if (midi !== null)
      playNote(midi, duration);
  }
  function playChord(chordSymbol) {
    try {
      const chord = UMT.parseChordSymbol(chordSymbol);
      const notes = chord.getNotes ? chord.getNotes() : [];
      for (const note of notes) {
        const name = note.name ?? note._name;
        if (name)
          playNoteByName(name);
      }
    } catch {
    }
  }
  var PC_MAP = {
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
  function noteNameToMidi(name) {
    const m = name.match(/^([A-G][b#]?)(-?\d+)$/);
    if (!m)
      return null;
    const pc = PC_MAP[m[1]];
    if (pc === void 0)
      return null;
    return (parseInt(m[2]) + 1) * 12 + pc;
  }

  // src/diagrams.ts
  function loadGuitarDB() {
    return Promise.resolve();
  }
  function activeKeyToAbcKey(keyStr) {
    if (!keyStr)
      return "none";
    const [root, mode2] = keyStr.split(" ");
    return root + (mode2?.toLowerCase() === "minor" ? "m" : "");
  }
  function renderStaff(container, noteNames, width = 380, keyStr = null) {
    const abcKey = activeKeyToAbcKey(keyStr);
    const header = `X:1
M:none
L:1
K:${abcKey}
`;
    const opts = { staffwidth: width - 20 };
    if (!noteNames.length) {
      ABCJS.renderAbc(container, header + "z", opts);
      return;
    }
    const abcNotes = noteNames.map((n) => {
      const m = n.match(/^([A-G][b#]?)(-?\d+)$/);
      if (!m)
        return "C";
      const raw = m[1];
      const name = raw.endsWith("b") ? "_" + raw[0] : raw.endsWith("#") ? "^" + raw[0] : raw;
      const oct = parseInt(m[2]);
      let abc = name;
      if (oct >= 5)
        abc = name.toLowerCase() + "'".repeat(oct - 5);
      else if (oct === 4)
        abc = name;
      else
        abc = name + ",".repeat(4 - oct);
      return abc;
    });
    ABCJS.renderAbc(container, header + `[${abcNotes.join("")}]1`, opts);
  }
  var QUALITY_COLORS = {
    major: "#f59e0b",
    minor: "#3b82f6",
    "dominant seventh": "#ef4444",
    "major seventh": "#f59e0b",
    "minor seventh": "#3b82f6",
    diminished: "#7c3aed",
    "diminished seventh": "#7c3aed",
    "half-diminished seventh": "#7c3aed",
    augmented: "#0d9488"
  };
  function renderPiano(container, noteNames, quality) {
    const color = QUALITY_COLORS[quality?.toLowerCase()] ?? "#6b7280";
    const colors = noteNames.map(() => color);
    const svg = Notae.renderPiano({
      name: "",
      keys: noteNames,
      colors,
      range: { from: "C2", to: "B5" }
    });
    container.innerHTML = svg;
    const keyEls = container.querySelectorAll("[data-note]");
    if (keyEls.length > 0) {
      keyEls.forEach((el) => {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => playNoteByName(el.dataset.note));
      });
    }
  }
  var DARK_FRETBOARD_STYLE = {
    chordNameColor: "#e0e0e0",
    fretLabelColor: "#9ca3af",
    nutColor: "#aaaaaa",
    indicatorColor: "#9ca3af",
    stringLabelColor: "#9ca3af"
  };
  function renderGuitar(container, chordSymbol) {
    if (!chordSymbol) {
      container.innerHTML = '<div class="no-voicing">\u2014</div>';
      return;
    }
    let voicings = [];
    try {
      const chord = UMT.parseChordSymbol(chordSymbol);
      voicings = UMT.getFretboardVoicings(chord, UMT.GUITAR_STANDARD) ?? [];
    } catch {
    }
    if (!voicings.length) {
      container.innerHTML = '<div class="no-voicing">No voicings</div>';
      return;
    }
    const svgs = voicings.slice(0, 3).map((v) => {
      try {
        return `<div>${Notae.renderFretboard({ name: chordSymbol, ...v }, DARK_FRETBOARD_STYLE)}</div>`;
      } catch {
        return "";
      }
    }).join("");
    container.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:nowrap;align-items:flex-start">${svgs}</div>`;
  }
  var CIRCLE_KEYS = ["C", "G", "D", "A", "E", "B", "F#/Gb", "Db", "Ab", "Eb", "Bb", "F"];
  var CIRCLE_KEYS_MINOR = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m/Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm"];
  function renderCircleOfFifths(container, activeKey, chordRoot, onKeyClick, size = 160) {
    const cx = size / 2, cy = size / 2;
    const outerR = size * 0.425;
    const innerR = size * 0.275;
    const labelR = size * 0.356;
    const minorR = size * 0.206;
    const majorFont = Math.max(7, Math.round(size * 0.0625));
    const minorFont = Math.max(5, Math.round(size * 0.05));
    let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">`;
    CIRCLE_KEYS.forEach((key, i) => {
      const angle = (i * 30 - 90) * Math.PI / 180;
      const nextAngle = ((i + 1) * 30 - 90) * Math.PI / 180;
      const x1o = cx + outerR * Math.cos(angle), y1o = cy + outerR * Math.sin(angle);
      const x2o = cx + outerR * Math.cos(nextAngle), y2o = cy + outerR * Math.sin(nextAngle);
      const x1i = cx + innerR * Math.cos(angle), y1i = cy + innerR * Math.sin(angle);
      const x2i = cx + innerR * Math.cos(nextAngle), y2i = cy + innerR * Math.sin(nextAngle);
      const isActiveKey = activeKey?.startsWith(key.split("/")[0]);
      const isChordRoot = chordRoot === key.split("/")[0];
      const fill = isActiveKey ? "#4f46e5" : isChordRoot ? "#0d9488" : "#2d2d44";
      const stroke = isChordRoot ? "#0d9488" : "#4a4a6a";
      const midAngle = (i * 30 + 15 - 90) * Math.PI / 180;
      const lx = cx + labelR * Math.cos(midAngle);
      const ly = cy + labelR * Math.sin(midAngle);
      svg += `<path d="M${x1i},${y1i} L${x1o},${y1o} A${outerR},${outerR} 0 0,1 ${x2o},${y2o} L${x2i},${y2i} A${innerR},${innerR} 0 0,0 ${x1i},${y1i}"
      fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor:pointer"
      data-key="${key.split("/")[0]} Major" />`;
      svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
      font-size="${majorFont}" fill="#e0e0e0" pointer-events="none">${key}</text>`;
      const mKey = CIRCLE_KEYS_MINOR[i];
      const mx = cx + minorR * Math.cos(midAngle);
      const my = cy + minorR * Math.sin(midAngle);
      svg += `<text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="middle"
      font-size="${minorFont}" fill="#9ca3af" pointer-events="none">${mKey}</text>`;
    });
    svg += "</svg>";
    container.innerHTML = svg;
    container.querySelectorAll("[data-key]").forEach((el) => {
      el.addEventListener("click", () => onKeyClick(el.dataset.key));
    });
  }

  // src/history.ts
  var MAX_ENTRIES = 200;
  var QUALITY_COLORS2 = {
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
    if (debounceTimer)
      clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (symbol !== lastAutoAppended && symbol !== "Unknown") {
        addEntry(symbol, notes);
        lastAutoAppended = symbol;
      }
    }, 800);
  }
  function renderHistory(container, activeKey, onChipClick, activeCursorEntryId) {
    const strip = document.createElement("div");
    strip.style.cssText = "display:flex;gap:6px;overflow-x:auto;padding:8px 12px;align-items:center";
    entries.forEach((entry) => {
      const analysis = activeKey ? buildHarmonicAnalysis(entry.symbol, activeKey, null) : null;
      const roman = analysis?.roman ?? "\u2014";
      const fn = analysis?.function ?? "unknown";
      const color = QUALITY_COLORS2[fn] ?? "#6b7280";
      const chip = document.createElement("div");
      chip.className = "history-chip";
      chip.dataset.id = entry.id;
      chip.style.cssText = `
      display:flex;flex-direction:column;align-items:center;padding:4px 8px;
      border-radius:6px;border:1.5px solid ${activeCursorEntryId === entry.id ? "#fff" : "#3a3a5c"};
      background:#252540;cursor:pointer;min-width:50px;user-select:none;
      border-left:3px solid ${color};
    `;
      chip.innerHTML = `
      <span style="font-size:12px;font-weight:600">${entry.symbol}</span>
      <span style="font-size:10px;color:#9ca3af">${roman}</span>
    `;
      chip.addEventListener("click", () => onChipClick(entry));
      chip.title = `${entry.symbol} \u2014 drag to song, right-click to remove`;
      chip.draggable = true;
      chip.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("application/x-history-chord", JSON.stringify({ id: entry.id, symbol: entry.symbol }));
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
    clearBtn.style.cssText = "padding:4px 10px;border-radius:4px;background:#374151;color:#fff;border:none;cursor:pointer;flex-shrink:0";
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
    wrap.style.cssText = "display:flex;gap:8px;align-items:center";
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
    if (!src)
      return song;
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
        if (s.id !== sectionId || s.measures.length <= 1)
          return s;
        return { ...s, measures: s.measures.filter((m) => m.id !== measureId) };
      })
    };
  }
  function addChord(song, sectionId, measureId, symbol) {
    const valid = isValidChordSymbol(symbol);
    const chord = { id: newId(), symbol, valid };
    return {
      ...song,
      sections: song.sections.map((s) => s.id !== sectionId ? s : {
        ...s,
        measures: s.measures.map((m) => m.id !== measureId ? m : {
          ...m,
          chords: [...m.chords, chord]
        })
      })
    };
  }
  function insertChordAfter(song, afterChordId, symbol) {
    const valid = isValidChordSymbol(symbol);
    const newChord = { id: newId(), symbol, valid };
    return {
      ...song,
      sections: song.sections.map((s) => ({
        ...s,
        measures: s.measures.map((m) => {
          const idx = m.chords.findIndex((c) => c.id === afterChordId);
          if (idx === -1)
            return m;
          const chords = [...m.chords];
          chords.splice(idx + 1, 0, newChord);
          return { ...m, chords };
        })
      }))
    };
  }
  function updateChord(song, chordId, symbol) {
    const valid = isValidChordSymbol(symbol);
    return {
      ...song,
      sections: song.sections.map((s) => ({
        ...s,
        measures: s.measures.map((m) => ({
          ...m,
          chords: m.chords.map((c) => c.id === chordId ? { ...c, symbol, valid } : c)
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
  function moveChordToPosition(song, chordId, targetSectionId, targetMeasureId, beforeChordId) {
    let movedChord;
    const without = {
      ...song,
      sections: song.sections.map((s) => ({
        ...s,
        measures: s.measures.map((m) => {
          const idx = m.chords.findIndex((c) => c.id === chordId);
          if (idx === -1)
            return m;
          movedChord = m.chords[idx];
          return { ...m, chords: m.chords.filter((c) => c.id !== chordId) };
        })
      }))
    };
    if (!movedChord)
      return song;
    return {
      ...without,
      sections: without.sections.map((s) => {
        if (s.id !== targetSectionId)
          return s;
        return {
          ...s,
          measures: s.measures.map((m) => {
            if (m.id !== targetMeasureId)
              return m;
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
    if (fromIdx === -1)
      return song;
    const [moved] = sections.splice(fromIdx, 1);
    const toIdx = sections.findIndex((s) => s.id === targetId);
    if (toIdx === -1)
      return song;
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
    if (!activeKey || !chordSymbol)
      return "\u2014";
    try {
      const chord = UMT.parseChordSymbol(chordSymbol);
      const { analysis } = UMT.Harmony.analyzeProgression([chord], activeKey);
      const a = analysis[0];
      if (!a)
        return "?";
      return a.roman ?? "?";
    } catch {
      return "?";
    }
  }
  function isBorrowedChord(chordSymbol, activeKey) {
    if (!activeKey)
      return false;
    try {
      const chord = UMT.parseChordSymbol(chordSymbol);
      const { analysis } = UMT.Harmony.analyzeProgression([chord], activeKey);
      return analysis[0]?.isBorrowed ?? false;
    } catch {
      return false;
    }
  }
  function isValidChordSymbol(symbol) {
    if (!symbol)
      return false;
    try {
      UMT.parseChordSymbol(symbol);
      return true;
    } catch {
      return false;
    }
  }
  var SEMITONE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var SEMITONE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  var SHARP_KEYS = ["G", "D", "A", "E", "B", "F#", "C#"];
  function transposeRoot(root, semitones, preferSharps) {
    const names = preferSharps ? SEMITONE_NAMES_SHARP : SEMITONE_NAMES_FLAT;
    const all = [...SEMITONE_NAMES_SHARP, ...SEMITONE_NAMES_FLAT];
    const idx = all.indexOf(root);
    if (idx === -1)
      return root;
    const pc = all.indexOf(root) % 12;
    return names[((pc + semitones) % 12 + 12) % 12];
  }
  function transposeSong(song, semitones, targetKey) {
    const preferSharps = targetKey ? SHARP_KEYS.includes(targetKey.split(" ")[0]) : false;
    const transposeSymbol = (symbol) => {
      try {
        const chord = UMT.parseChordSymbol(symbol);
        const root = chord.root?.name ?? chord.root ?? "";
        const newRoot = transposeRoot(root, semitones, preferSharps);
        return symbol.replace(root, newRoot);
      } catch {
        return symbol;
      }
    };
    return {
      ...song,
      sections: song.sections.map((s) => ({
        ...s,
        measures: s.measures.map((m) => ({
          ...m,
          chords: m.chords.map((c) => ({ ...c, symbol: transposeSymbol(c.symbol), valid: true }))
        }))
      }))
    };
  }
  function saveSong(song) {
    localStorage.setItem("harmony-companion-song", JSON.stringify(song));
  }
  function loadSong() {
    try {
      const raw = localStorage.getItem("harmony-companion-song");
      if (!raw)
        return createSong();
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
  function showNotice(msg, type = "info") {
    if (!_container)
      return;
    document.querySelectorAll(".song-notice").forEach((el) => el.remove());
    const div = document.createElement("div");
    div.className = "song-notice";
    div.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:6px 12px;border-radius:4px;font-size:12px;margin-bottom:6px;background:${type === "warn" ? "#7c2d12" : "#1e3a5f"};color:#e0e0e0`;
    const span = document.createElement("span");
    span.textContent = msg;
    const x = document.createElement("button");
    x.textContent = "\xD7";
    x.style.cssText = "background:none;border:none;color:#9ca3af;cursor:pointer;font-size:14px;margin-left:8px;padding:0";
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
  function rerender() {
    if (!_container || !_handlers)
      return;
    _container.innerHTML = "";
    _container.appendChild(buildSongDOM(_song, _handlers));
  }
  function buildSongDOM(song, h) {
    const root = document.createElement("div");
    root.style.cssText = "padding:12px;display:flex;flex-direction:column;gap:8px";
    const header = document.createElement("div");
    header.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap";
    const titleInput = document.createElement("input");
    titleInput.value = song.title;
    titleInput.style.cssText = "font-size:16px;font-weight:700;background:transparent;border:none;border-bottom:1px solid #4a4a6a;color:#e0e0e0;padding:2px 4px;min-width:120px";
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
    pasteArea.style.cssText = "display:none;padding:8px 0;width:100%";
    const pasteTA = document.createElement("textarea");
    pasteTA.placeholder = "Am G C F  (space, comma or newline separated)";
    pasteTA.rows = 2;
    pasteTA.style.cssText = "width:100%;background:#252540;color:#e0e0e0;border:1px solid #4a4a6a;border-radius:4px;padding:6px;font-size:12px;resize:vertical;box-sizing:border-box";
    const pasteSubmit = makeBtn("Add chords", "#4f46e5", () => {
      const text = pasteTA.value.trim();
      if (!text)
        return;
      const symbols = parseProgressionText(text);
      if (!_song.sections.length) {
        _song = addSection(_song, "Section", "verse");
      }
      const section = _song.sections[_song.sections.length - 1];
      const measure = newPasteMeasure(symbols);
      _song = { ..._song, sections: _song.sections.map((s) => s.id !== section.id ? s : { ...s, measures: [...s.measures, measure] }) };
      if (symbols.length > 8)
        showNotice("All chords added to one measure \u2014 split as needed.");
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
    templateWrap.style.cssText = "display:flex;gap:4px;flex-wrap:wrap";
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
    transposeSelect.style.cssText = "background:#252540;color:#e0e0e0;border:1px solid #4a4a6a;border-radius:4px;padding:3px";
    transposeSelect.innerHTML = '<option value="">\u21C4 Transpose</option>' + Array.from({ length: 11 }, (_, i) => `<option value="${i + 1}">+${i + 1} st</option>`).join("");
    transposeSelect.addEventListener("change", () => {
      const n = parseInt(transposeSelect.value);
      if (n) {
        _song = transposeSong(_song, n);
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
      if (open)
        pasteTA.focus();
    });
    pasteBtn.title = "Paste a chord progression as text";
    header.append(titleInput, newBtn, templateWrap, transposeSelect, exportBtn, pasteBtn);
    root.appendChild(header);
    root.appendChild(pasteArea);
    const formInfo = document.createElement("div");
    formInfo.style.cssText = "font-size:11px;color:#6b7280;padding:2px 0 4px;width:100%";
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
        valid: isValidChordSymbolPublic(sym)
      }))
    };
  }
  function isValidChordSymbolPublic(symbol) {
    if (!symbol)
      return false;
    try {
      UMT.parseChordSymbol(symbol);
      return true;
    } catch {
      return false;
    }
  }
  function buildSectionDOM(section, song, h, measureNums) {
    const color = SECTION_COLORS[section.color];
    const wrap = document.createElement("div");
    wrap.style.cssText = `border-left:3px solid ${color};border-radius:4px;background:#1e1e35;overflow:hidden`;
    const secHeader = document.createElement("div");
    secHeader.style.cssText = "display:flex;align-items:center;gap:6px;padding:6px 10px;background:#252540";
    const toggle = document.createElement("span");
    toggle.textContent = section.collapsed ? "\u25B6" : "\u25BC";
    toggle.style.cssText = "cursor:pointer;font-size:11px;color:#9ca3af";
    toggle.addEventListener("click", () => {
      _song = updateSection(_song, section.id, { collapsed: !section.collapsed });
      saveSong(_song);
      h.onSongChange(_song);
    });
    const nameInput = document.createElement("input");
    nameInput.value = section.name;
    nameInput.style.cssText = `font-size:13px;font-weight:600;color:${color};background:transparent;border:none;border-bottom:1px dashed transparent;padding:1px 2px`;
    nameInput.addEventListener("focus", () => nameInput.style.borderBottomColor = color);
    nameInput.addEventListener("blur", () => {
      nameInput.style.borderBottomColor = "transparent";
      _song = updateSection(_song, section.id, { name: nameInput.value });
      saveSong(_song);
      h.onSongChange(_song);
    });
    const PRESET_COLORS = ["intro", "verse", "prechorus", "chorus", "bridge", "outro", "custom"];
    const swatchEl = document.createElement("button");
    swatchEl.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:none;cursor:pointer;flex-shrink:0`;
    swatchEl.title = "Change section color";
    swatchEl.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelector(".color-picker-popup")?.remove();
      const picker = document.createElement("div");
      picker.className = "color-picker-popup";
      picker.style.cssText = "position:fixed;z-index:1000;background:#1a1a2e;border:1px solid #4a4a6a;border-radius:6px;padding:6px;display:flex;gap:4px;box-shadow:0 4px 12px rgba(0,0,0,0.6)";
      PRESET_COLORS.forEach((c) => {
        const dot = document.createElement("button");
        dot.title = c;
        dot.style.cssText = `width:20px;height:20px;border-radius:50%;background:${SECTION_COLORS[c]};border:2px solid ${c === section.color ? "#fff" : "transparent"};cursor:pointer;padding:0`;
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
    repeatBadge.style.cssText = "font-size:10px;color:#9ca3af;cursor:pointer;background:#374151;border-radius:3px;padding:1px 4px";
    repeatBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = "16";
      input.value = String(section.repeatCount);
      input.style.cssText = "width:36px;background:#252540;color:#e0e0e0;border:1px solid #4f46e5;border-radius:3px;padding:1px 4px;font-size:10px";
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
        if (ke.key === "Enter")
          input.blur();
        if (ke.key === "Escape") {
          input.value = String(section.repeatCount);
          input.blur();
        }
      });
    });
    const dragHandle = document.createElement("span");
    dragHandle.textContent = "\u283F";
    dragHandle.title = "Drag to reorder section";
    dragHandle.style.cssText = "cursor:grab;font-size:14px;color:#6b7280;user-select:none;flex-shrink:0;padding:0 2px";
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
      if (!_draggedSectionId || _draggedSectionId === section.id)
        return;
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
      if (!_draggedSectionId || _draggedSectionId === section.id)
        return;
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
      measuresWrap.style.cssText = "padding:8px;display:flex;flex-direction:column;gap:6px";
      section.measures.forEach((measure) => {
        measuresWrap.appendChild(buildMeasureDOM(measure, section, h, measureNums.get(measure.id) ?? 0));
      });
      wrap.appendChild(measuresWrap);
    }
    return wrap;
  }
  function buildMeasureDOM(measure, section, h, measureNum) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:flex-start;gap:4px";
    const numLabel = document.createElement("span");
    numLabel.textContent = String(measureNum);
    numLabel.style.cssText = "font-size:10px;color:#6b7280;min-width:18px;padding-top:8px";
    wrap.appendChild(numLabel);
    const chordsRow = document.createElement("div");
    chordsRow.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start";
    measure.chords.forEach((chord) => {
      chordsRow.appendChild(buildChordChip(chord, section, measure, h));
    });
    const addBtn = document.createElement("button");
    addBtn.textContent = "+";
    addBtn.style.cssText = "width:32px;height:40px;border-radius:4px;background:#252540;color:#9ca3af;border:1px dashed #4a4a6a;cursor:pointer;font-size:18px";
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
      if (!hasHistory && !hasChord)
        return;
      e.preventDefault();
      e.dataTransfer.dropEffect = hasHistory ? "copy" : "move";
      chordsRow.style.outline = "1px dashed #4f46e5";
    });
    chordsRow.addEventListener("dragleave", (e) => {
      if (!chordsRow.contains(e.relatedTarget))
        chordsRow.style.outline = "";
    });
    chordsRow.addEventListener("drop", (e) => {
      chordsRow.style.outline = "";
      const histData = e.dataTransfer.getData("application/x-history-chord");
      if (histData) {
        e.preventDefault();
        const { symbol } = JSON.parse(histData);
        _song = addChord(_song, section.id, measure.id, symbol);
        saveSong(_song);
        h.onSongChange(_song);
      } else if (_draggedChordId) {
        e.preventDefault();
        e.stopPropagation();
        _song = moveChordToPosition(_song, _draggedChordId, section.id, measure.id);
        _draggedChordId = null;
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
    if (!sectionObj || sectionObj.measures.length <= 1)
      delMBtn.style.display = "none";
    wrap.appendChild(delMBtn);
    return wrap;
  }
  function buildChordChip(chord, section, measure, h) {
    const isActive = h.activeCursorId === chord.id;
    const isCapture = h.captureTargetId === chord.id;
    const degree = chord.valid && chord.symbol ? computeDegree(chord.symbol, h.activeKey) : "\u2014";
    const borrowed = chord.valid && chord.symbol ? isBorrowedChord(chord.symbol, h.activeKey) : false;
    const wrap = document.createElement("div");
    if (isCapture)
      wrap.classList.add("capture-target");
    wrap.style.cssText = `
    position:relative;display:flex;flex-direction:column;align-items:center;
    min-width:52px;padding:4px 6px;border-radius:6px;
    background:#252540;cursor:pointer;
    border:1.5px solid ${isActive ? "#fff" : chord.valid === false ? "#ef4444" : "#3a3a5c"};
  `;
    const isEditing = !chord.symbol;
    if (isEditing) {
      const input = document.createElement("input");
      input.className = "chord-input";
      input.style.cssText = "width:52px;background:transparent;border:none;color:#e0e0e0;font-size:12px;font-weight:600;text-align:center;outline:none";
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
          if (!prevValue)
            _song = removeChord(_song, chord.id);
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
    symbolEl.style.cssText = `font-size:12px;font-weight:600;color:${chord.valid ? "#e0e0e0" : "#ef4444"}`;
    const degreeEl = document.createElement("div");
    degreeEl.textContent = degree;
    degreeEl.style.cssText = `font-size:9px;color:${borrowed ? "#f59e0b" : "#6b7280"};margin-top:2px`;
    wrap.appendChild(symbolEl);
    wrap.appendChild(degreeEl);
    const controls = document.createElement("div");
    controls.style.cssText = "display:none;position:absolute;top:-20px;left:0;gap:2px;background:#1a1a2e;border-radius:3px;padding:1px 2px";
    const editBtn = makeSmallBtn("\u270E", () => {
      const input = document.createElement("input");
      input.className = "chord-input";
      input.value = chord.symbol;
      input.style.cssText = "width:52px;background:transparent;border:none;color:#e0e0e0;font-size:12px;font-weight:600;text-align:center;outline:none";
      const prevVal = chord.symbol;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          _song = updateChord(_song, chord.id, input.value.trim() || prevVal);
          saveSong(_song);
          h.onSongChange(_song);
        }
        if (e.key === "Escape") {
          h.onSongChange(_song);
        }
      });
      input.addEventListener("blur", () => {
        _song = updateChord(_song, chord.id, input.value.trim() || prevVal);
        saveSong(_song);
        h.onSongChange(_song);
      });
      wrap.innerHTML = "";
      wrap.appendChild(input);
      input.focus();
    });
    editBtn.title = "Edit chord symbol";
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
    controls.append(editBtn, captureBtn, delBtn);
    wrap.appendChild(controls);
    wrap.addEventListener("mouseenter", () => controls.style.display = "flex");
    wrap.addEventListener("mouseleave", () => controls.style.display = "none");
    wrap.addEventListener("click", () => h.onChordClick(chord.id, chord.symbol));
    wrap.addEventListener("dblclick", () => playChord(chord.symbol));
    wrap.draggable = true;
    wrap.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      _draggedChordId = chord.id;
      _draggedSectionId = null;
      e.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => {
        wrap.style.opacity = "0.5";
      });
    });
    wrap.addEventListener("dragend", () => {
      _draggedChordId = null;
      wrap.style.opacity = "1";
      wrap.style.outline = "";
    });
    wrap.addEventListener("dragover", (e) => {
      if (!_draggedChordId || _draggedChordId === chord.id)
        return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      const rect = wrap.getBoundingClientRect();
      wrap.style.outline = e.clientX < rect.left + rect.width / 2 ? "2px solid #4f46e5" : "2px solid #a5b4fc";
      wrap.style.outlineOffset = "-2px";
    });
    wrap.addEventListener("dragleave", () => {
      wrap.style.outline = "";
    });
    wrap.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!_draggedChordId || _draggedChordId === chord.id)
        return;
      const rect = wrap.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      wrap.style.outline = "";
      const targetMeasure = _song.sections.find((s) => s.id === section.id)?.measures.find((m) => m.id === measure.id);
      const chordIdx = targetMeasure?.chords.findIndex((c) => c.id === chord.id) ?? -1;
      const beforeChordId = before ? chord.id : targetMeasure?.chords[chordIdx + 1]?.id;
      _song = moveChordToPosition(_song, _draggedChordId, section.id, measure.id, beforeChordId);
      _draggedChordId = null;
      saveSong(_song);
      h.onSongChange(_song);
    });
    return wrap;
  }
  function makeBtn(label, bg, onClick) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = `padding:4px 10px;border-radius:4px;background:${bg};color:#fff;border:none;cursor:pointer;font-size:12px`;
    btn.addEventListener("click", onClick);
    return btn;
  }
  function makeSmallBtn(label, onClick) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = "padding:2px 5px;border-radius:3px;background:#374151;color:#e0e0e0;border:none;cursor:pointer;font-size:11px";
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
    if (sectionNames.length === 0)
      return "Empty";
    const map = /* @__PURE__ */ new Map();
    let letter = 65;
    const letters = sectionNames.map((name) => {
      const key = name.trim().toLowerCase();
      if (!map.has(key))
        map.set(key, String.fromCharCode(letter++));
      return map.get(key);
    });
    const pattern = letters.join("");
    if (/^(AB)+$/.test(pattern) || pattern === "ABAB")
      return `Verse-Chorus (${pattern})`;
    if (/^AABA/.test(pattern))
      return `AABA (${pattern})`;
    if (/^(A+B+A+)$/.test(pattern))
      return `Ternary (${pattern})`;
    if (/^A+$/.test(pattern))
      return `Through-composed \u2014 single section (${pattern})`;
    return `${pattern}`;
  }

  // src/app.ts
  var staffWidth = parseInt(localStorage.getItem("staff-width") ?? "380");
  var cofSize = parseInt(localStorage.getItem("cof-size") ?? "160");
  var state = {
    midi: { deviceId: null, mode: "normal", activeNotes: /* @__PURE__ */ new Set(), lastArpeggioNotes: [], arpeggioTimer: null },
    activeKey: localStorage.getItem("active-key") || null,
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
      analysis: true,
      history: JSON.parse(localStorage.getItem("panel-history") ?? "true"),
      song: JSON.parse(localStorage.getItem("panel-song") ?? "true")
    }
  };
  var $ = (id) => document.getElementById(id);
  function init() {
    if (!navigator.requestMIDIAccess) {
      $("browser-warning").style.display = "block";
    }
    document.addEventListener("click", initAudioOnGesture, { once: true });
    loadGuitarDB();
    buildLayout();
    wireKeyboard();
    renderZone1Diagrams([], null);
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
    setHistoryChangeCallback(onHistoryChange);
    window.addEventListener("history-capture-requested", () => {
      if (state.detection?.kind === "chord") {
        addEntry(state.detection.candidates[0], state.detection.notes);
      }
    });
    renderZone3();
  }
  function makeSongHandlers() {
    return {
      onChordClick: (id, symbol) => {
        state.activeCursorId = id;
        if (symbol)
          triggerChordAnalysis(symbol);
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
  function buildLayout() {
    $("zone1").innerHTML = `
    <div id="z1-toolbar" style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:#111128;border-bottom:1px solid #2d2d44;flex-wrap:wrap">
      <span id="midi-status" style="font-size:12px;color:#6b7280">MIDI: \u2014</span>
      <select id="midi-device" style="background:#252540;color:#e0e0e0;border:1px solid #4a4a6a;border-radius:4px;padding:3px;font-size:12px"></select>
      <button id="btn-normal" class="mode-btn" data-mode="normal">Normal</button>
      <button id="btn-hold" class="mode-btn" data-mode="hold">Hold</button>
      <button id="btn-arpeggio" class="mode-btn" data-mode="arpeggio">Arpeggio</button>
      <select id="key-select" style="background:#252540;color:#e0e0e0;border:1px solid #4a4a6a;border-radius:4px;padding:3px;font-size:12px">
        <option value="">Key: Auto</option>
        ${["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].flatMap(
      (r) => [`<option value="${r} Major">${r} Major</option>`, `<option value="${r} Minor">${r} Minor</option>`]
    ).join("")}
      </select>
      <span id="auto-key-label" style="font-size:11px;color:#6b7280"></span>
    </div>
    <!-- Row 1: notation \u2014 staff + CoF side by side, guitar stacked below CoF -->
    <div id="notation-panel" style="padding:8px 12px;border-bottom:1px solid #2d2d44">
      <div class="panel-header"><span>Notation</span><button class="toggle-btn" data-panel="notation">\u{1F441}</button></div>
      <div id="notation-content" style="display:flex;gap:16px;align-items:flex-start">
        <!-- Column 1: Staff -->
        <div style="flex:0 0 auto">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Staff</div>
          <div id="staff-container"></div>
        </div>
        <!-- Column 2: CoF -->
        <div style="flex:0 0 auto">
          <div style="display:flex;gap:3px;align-items:center;margin-bottom:4px">
            <span style="font-size:10px;color:#6b7280">CoF</span>
            <button id="btn-cof-minus" class="size-ctrl-btn">\u2212</button>
            <button id="btn-cof-plus" class="size-ctrl-btn">+</button>
          </div>
          <div id="cof-container"></div>
        </div>
        <!-- Column 3: Guitar -->
        <div style="flex:0 0 auto">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Guitar</div>
          <div id="guitar-container"></div>
        </div>
      </div>
    </div>
    <!-- Row 2: analysis -->
    <div id="analysis-panel" style="padding:8px 12px;border-bottom:1px solid #2d2d44">
      <div class="panel-header"><span>Analysis</span><button class="toggle-btn" data-panel="analysis">\u{1F441}</button></div>
      <div id="analysis-content" style="font-size:13px;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px 12px;align-content:start"></div>
    </div>
    <!-- Row 3: piano -->
    <div style="padding:8px 12px;border-bottom:1px solid #2d2d44">
      <div id="piano-container"></div>
    </div>
    <div id="midi-banner" style="display:none;background:#7f1d1d;padding:6px 12px;font-size:12px"></div>
  `;
    $("zone2").innerHTML = `
    <div class="zone-header">
      <span style="font-size:12px;font-weight:600">History</span>
      <button class="toggle-btn" data-panel="history">\u25BC</button>
    </div>
    <div id="zone2-content"></div>
  `;
    $("zone3").innerHTML = `
    <div class="zone-header">
      <span style="font-size:12px;font-weight:600">Song Structure</span>
      <button class="toggle-btn" data-panel="song">\u25BC</button>
    </div>
    <div id="zone3-content"></div>
  `;
    $("btn-cof-minus").addEventListener("click", () => {
      cofSize = Math.max(100, cofSize - 20);
      localStorage.setItem("cof-size", String(cofSize));
      reRenderDiagrams();
    });
    $("btn-cof-plus").addEventListener("click", () => {
      cofSize = Math.min(280, cofSize + 20);
      localStorage.setItem("cof-size", String(cofSize));
      reRenderDiagrams();
    });
    if (state.activeKey) {
      $("key-select").value = state.activeKey;
    }
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = btn.dataset.mode;
        if (getMode() === m)
          return;
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
        if (panel === "history" || panel === "song") {
          localStorage.setItem(`panel-${panel}`, JSON.stringify(state.panels[panel]));
        }
        applyPanelVisibility();
      });
    });
    applyPanelVisibility();
  }
  function applyPanelVisibility() {
    const nc = $("notation-content");
    if (nc)
      nc.style.display = state.panels.notation ? "flex" : "none";
    const ac = $("analysis-content");
    if (ac)
      ac.style.display = state.panels.analysis ? "grid" : "none";
    const z2 = $("zone2-content");
    if (z2)
      z2.style.display = state.panels.history ? "" : "none";
    const z3 = $("zone3-content");
    if (z3)
      z3.style.display = state.panels.song ? "" : "none";
  }
  function onNoteChange2(notes) {
    if (state.captureTargetId && notes.length >= 1) {
      const result2 = analyzeNotes(notes, state.activeKey, getLastHistorySymbol());
      if (result2?.kind === "chord") {
        const sym = result2.candidates[0];
        state.song = updateChord(state.song, state.captureTargetId, sym);
        saveSong(state.song);
        const next = findChordAfter(state.song, state.captureTargetId);
        state.activeCursorId = next?.id ?? null;
        state.captureTargetId = null;
        renderZone3();
        return;
      }
    }
    const result = analyzeNotes(notes, state.activeKey, getLastHistorySymbol());
    state.detection = result;
    if (result?.kind === "chord") {
      const sym = result.candidates[result.selectedIndex];
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
    renderZone1Analysis();
    refreshAutoKey();
  }
  function getLastHistorySymbol() {
    return state.history[0]?.symbol ?? null;
  }
  function renderZone1Diagrams(noteNames, chordSymbol) {
    renderStaff($("staff-container"), noteNames, staffWidth, state.activeKey);
    const quality = chordSymbol ? getChordQuality(chordSymbol) : "";
    renderPiano($("piano-container"), noteNames, quality);
    renderGuitar($("guitar-container"), chordSymbol);
    renderCircleOfFifths($("cof-container"), state.activeKey, chordSymbol ? chordSymbol[0] : null, (key) => {
      state.activeKey = key;
      localStorage.setItem("active-key", key);
      $("key-select").value = key;
      refreshAll();
    }, cofSize);
  }
  function reRenderDiagrams() {
    const d = state.detection;
    if (!d) {
      renderZone1Diagrams([], null);
      return;
    }
    if (d.kind === "chord")
      renderZone1Diagrams(d.notes, d.candidates[d.selectedIndex]);
    else if (d.kind === "note")
      renderZone1Diagrams([d.noteName], null);
    else
      renderZone1Diagrams(d.notes ?? [], null);
  }
  function getChordQuality(chordSymbol) {
    try {
      return UMT.parseChordSymbol(chordSymbol).quality?.toLowerCase() ?? "";
    } catch {
      return "";
    }
  }
  var CHORD_QUALITY_COLORS = {
    major: "#f59e0b",
    minor: "#3b82f6",
    "dominant seventh": "#ef4444",
    "major seventh": "#f59e0b",
    "minor seventh": "#3b82f6",
    diminished: "#7c3aed",
    "diminished seventh": "#7c3aed",
    "half-diminished seventh": "#7c3aed",
    augmented: "#0d9488",
    sus: "#6b7280"
  };
  function renderZone1Analysis() {
    const el = $("analysis-content");
    if (!el)
      return;
    if (!state.detection) {
      el.innerHTML = '<span style="color:#6b7280;font-size:12px">Play notes to analyze</span>';
      return;
    }
    const d = state.detection;
    if (d.kind === "note") {
      el.innerHTML = `<div><b>${d.noteName}</b><br><small>MIDI ${d.midiNumber} \xB7 ${d.pitchClass}</small></div>`;
      return;
    }
    if (d.kind === "interval") {
      el.innerHTML = `<div><b>${d.intervalName}</b><br><small>${d.semitones} semitones \xB7 inversion: ${d.inversionName}</small></div>`;
      return;
    }
    const a = state.analysis;
    const chordName = d.candidates[d.selectedIndex];
    const chordQuality = getChordQuality(chordName);
    const badgeColor = CHORD_QUALITY_COLORS[chordQuality] ?? "#6b7280";
    const pitchClasses = d.notes.map((n) => n.replace(/(-?\d+)$/, ""));
    const altCandidates = d.candidates.slice(1, 9);
    let html = `
    <div style="grid-column:1/-1">
      <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:${altCandidates.length ? "6px" : "0"}">
        <span style="font-size:26px;font-weight:700;padding:2px 10px;border-radius:4px;background:${badgeColor}22;border-left:3px solid ${badgeColor}">${chordName}</span>
        <span style="font-size:11px;color:#6b7280">${pitchClasses.join(" \xB7 ")}</span>
      </div>
      ${altCandidates.length ? `
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${altCandidates.map(
      (c, i) => `<button class="alt-chord" data-idx="${i + 1}" style="padding:3px 9px;border-radius:4px;background:#1e1e35;color:#9ca3af;border:1px solid #3a3a5c;cursor:pointer;font-size:12px;font-weight:500">${c}</button>`
    ).join("")}
        </div>
      ` : ""}
    </div>
  `;
    if (a) {
      html += `
      <div><label>Roman</label><span>${a.roman}</span></div>
      <div><label>Function</label><span>${{ T: "Tonic", S: "Subdominant", D: "Dominant", unknown: "Unknown" }[a.function]}</span></div>
      <div><label>Figured bass</label><span>${a.figuredBass || "\u2014"}</span></div>
      <div><label>Diatonic</label><span>${a.isDiatonic ? "Yes" : a.isBorrowed ? `Borrowed from ${a.borrowedFrom ?? "?"}` : "Chromatic"}</span></div>
      ${a.isSecondary ? `<div style="grid-column:1/-1"><label>Secondary</label><span>\u2192 ${a.secondaryTarget}</span></div>` : ""}
      <div><label>Scales</label><span>${a.suggestedScales.slice(0, 4).join(", ") || "\u2014"}</span></div>
      ${a.cadence ? `<div><label>Cadence</label><span>${a.cadence}</span></div>` : ""}
      ${a.coltraneAxis ? `<div><label>Coltrane axis</label><span>${a.coltraneAxis.join(" \xB7 ")}</span></div>` : ""}
      ${a.negativeHarmony ? `<div><label>Negative harmony</label><span>${a.negativeHarmony}</span></div>` : ""}
      ${a.substitutions?.length ? `<div style="grid-column:1/-1"><label>Substitutions</label><span>${a.substitutions.join(" \xB7 ")}</span></div>` : ""}
    `;
    }
    el.innerHTML = html;
    el.querySelectorAll(".alt-chord").forEach((altEl) => {
      altEl.addEventListener("click", () => {
        if (state.detection?.kind === "chord") {
          state.detection.selectedIndex = parseInt(altEl.dataset.idx);
          const sym = state.detection.candidates[state.detection.selectedIndex];
          state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol());
          renderZone1Analysis();
          renderZone1Diagrams(state.detection.notes, sym);
        }
      });
    });
  }
  function renderZone2() {
    renderHistory(
      $("zone2-content"),
      state.activeKey,
      (entry) => {
        state.historyActiveCursorId = entry.id;
        triggerChordAnalysis(entry.symbol);
        renderZone2();
      },
      state.historyActiveCursorId
    );
  }
  function renderZone3() {
    mountSong($("zone3-content"), state.song, makeSongHandlers());
  }
  function refreshAll() {
    reRenderDiagrams();
    renderZone1Analysis();
    renderZone2();
    renderZone3();
  }
  function triggerChordAnalysis(symbol) {
    state.analysis = buildHarmonicAnalysis(symbol, state.activeKey, getLastHistorySymbol());
    state.detection = { kind: "chord", notes: [], candidates: [symbol], selectedIndex: 0 };
    renderZone1Analysis();
    const dummyNotes = [];
    try {
      const chord = UMT.parseChordSymbol(symbol);
      chord.getNotes?.().forEach((n) => {
        if (n.name)
          dummyNotes.push(n.name);
      });
    } catch {
    }
    renderZone1Diagrams(dummyNotes, symbol);
  }
  function sendToSong(entry) {
    if (!state.song.sections.length) {
      state.song = addSection(state.song, "Verse", "verse");
    }
    if (state.activeCursorId) {
      state.song = insertChordAfter(state.song, state.activeCursorId, entry.symbol);
      const next = findChordAfter(state.song, state.activeCursorId);
      state.activeCursorId = next?.id ?? state.activeCursorId;
    } else {
      const lastSection = state.song.sections[state.song.sections.length - 1];
      const lastMeasure = lastSection.measures[lastSection.measures.length - 1];
      state.song = addChord(state.song, lastSection.id, lastMeasure.id, entry.symbol);
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
    state.detectedKey = auto;
    const label = $("auto-key-label");
    if (label)
      label.textContent = state.activeKey ? "" : auto ? `auto: ${auto}` : "";
    if (!state.activeKey && auto && state.analysis) {
      const sym = state.detection?.kind === "chord" ? state.detection.candidates[0] : null;
      if (sym) {
        state.analysis = buildHarmonicAnalysis(sym, auto, getLastHistorySymbol());
        renderZone1Analysis();
      }
    }
  }
  var deviceListenersAttached = false;
  function refreshDeviceDropdown() {
    const sel = $("midi-device");
    const devices = getDevices();
    sel.innerHTML = devices.length ? devices.map((d) => `<option value="${d.id}">${d.name}</option>`).join("") : "<option>No MIDI devices</option>";
    sel.onchange = () => selectDevice(sel.value);
    if (devices[0])
      selectDevice(devices[0].id);
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
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
          if (state.detection?.kind === "chord") {
            addEntry(state.detection.candidates[0], state.detection.notes);
          }
          break;
        case "s":
        case "S": {
          const activeEntry = state.historyActiveCursorId ? state.history.find((e2) => e2.id === state.historyActiveCursorId) : state.history[0];
          if (activeEntry)
            sendToSong(activeEntry);
          break;
        }
        case "c":
        case "C":
          if (confirm("Clear history?"))
            clearHistory();
          break;
        case "Escape":
          state.activeCursorId = null;
          state.captureTargetId = null;
          renderZone3();
          break;
        default:
          if (e.key >= "1" && e.key <= "9") {
            const idx = parseInt(e.key) - 1;
            if (state.detection?.kind === "chord" && idx < state.detection.candidates.length) {
              state.detection.selectedIndex = idx;
              const sym = state.detection.candidates[idx];
              state.analysis = buildHarmonicAnalysis(sym, state.activeKey, getLastHistorySymbol());
              renderZone1Analysis();
            }
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
