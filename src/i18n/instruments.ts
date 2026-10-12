// The soundfont's instruments by name: the General MIDI names in English, and in Spanish
// the names a Spanish speaker would look for.

import { getLang } from './i18n'

const ES: Record<string, string> = {
  acoustic_grand_piano: 'Piano de cola', bright_acoustic_piano: 'Piano brillante', electric_grand_piano: 'Piano de cola eléctrico',
  honkytonk_piano: 'Piano honky-tonk', electric_piano_1: 'Piano eléctrico 1', electric_piano_2: 'Piano eléctrico 2',
  harpsichord: 'Clave', clavinet: 'Clavinet',
  celesta: 'Celesta', glockenspiel: 'Glockenspiel', music_box: 'Caja de música', vibraphone: 'Vibráfono',
  marimba: 'Marimba', xylophone: 'Xilófono', tubular_bells: 'Campanas tubulares', dulcimer: 'Salterio',
  drawbar_organ: 'Órgano Hammond', percussive_organ: 'Órgano percusivo', rock_organ: 'Órgano de rock', church_organ: 'Órgano de iglesia',
  reed_organ: 'Armonio', accordion: 'Acordeón', harmonica: 'Armónica', tango_accordion: 'Bandoneón',
  acoustic_guitar_nylon: 'Guitarra de nailon', acoustic_guitar_steel: 'Guitarra acústica', electric_guitar_jazz: 'Guitarra de jazz',
  electric_guitar_clean: 'Guitarra eléctrica limpia', electric_guitar_muted: 'Guitarra eléctrica apagada', overdriven_guitar: 'Guitarra saturada',
  distortion_guitar: 'Guitarra distorsionada', guitar_harmonics: 'Armónicos de guitarra',
  acoustic_bass: 'Bajo acústico', electric_bass_finger: 'Bajo eléctrico (dedos)', electric_bass_pick: 'Bajo eléctrico (púa)',
  fretless_bass: 'Bajo sin trastes', slap_bass_1: 'Bajo slap 1', slap_bass_2: 'Bajo slap 2', synth_bass_1: 'Bajo sintetizado 1', synth_bass_2: 'Bajo sintetizado 2',
  violin: 'Violín', viola: 'Viola', cello: 'Violonchelo', contrabass: 'Contrabajo',
  tremolo_strings: 'Cuerdas en trémolo', pizzicato_strings: 'Cuerdas en pizzicato', orchestral_harp: 'Arpa', timpani: 'Timbales',
  string_ensemble_1: 'Conjunto de cuerdas 1', string_ensemble_2: 'Conjunto de cuerdas 2', synth_strings_1: 'Cuerdas sintetizadas 1',
  synth_strings_2: 'Cuerdas sintetizadas 2', choir_aahs: 'Coro (aah)', voice_oohs: 'Voz (ooh)', synth_voice: 'Voz sintetizada', orchestra_hit: 'Golpe de orquesta',
  trumpet: 'Trompeta', trombone: 'Trombón', tuba: 'Tuba', muted_trumpet: 'Trompeta con sordina',
  french_horn: 'Trompa', brass_section: 'Sección de metales', synth_brass_1: 'Metales sintetizados 1', synth_brass_2: 'Metales sintetizados 2',
  soprano_sax: 'Saxo soprano', alto_sax: 'Saxo alto', tenor_sax: 'Saxo tenor', baritone_sax: 'Saxo barítono',
  oboe: 'Oboe', english_horn: 'Corno inglés', bassoon: 'Fagot', clarinet: 'Clarinete',
  piccolo: 'Flautín', flute: 'Flauta', recorder: 'Flauta dulce', pan_flute: 'Flauta de pan',
  blown_bottle: 'Botella soplada', shakuhachi: 'Shakuhachi', whistle: 'Silbido', ocarina: 'Ocarina',
  lead_1_square: 'Solista: cuadrada', lead_2_sawtooth: 'Solista: diente de sierra', lead_3_calliope: 'Solista: calíope', lead_4_chiff: 'Solista: chiff',
  lead_5_charang: 'Solista: charang', lead_6_voice: 'Solista: voz', lead_7_fifths: 'Solista: quintas', lead_8_bass_lead: 'Solista: bajo',
  pad_1_new_age: 'Pad: new age', pad_2_warm: 'Pad: cálido', pad_3_polysynth: 'Pad: polisintetizador', pad_4_choir: 'Pad: coro',
  pad_5_bowed: 'Pad: arco', pad_6_metallic: 'Pad: metálico', pad_7_halo: 'Pad: halo', pad_8_sweep: 'Pad: barrido',
  fx_1_rain: 'Efecto: lluvia', fx_2_soundtrack: 'Efecto: banda sonora', fx_3_crystal: 'Efecto: cristal', fx_4_atmosphere: 'Efecto: atmósfera',
  fx_5_brightness: 'Efecto: brillo', fx_6_goblins: 'Efecto: duendes', fx_7_echoes: 'Efecto: ecos', 'fx_8_sci-fi': 'Efecto: ciencia ficción',
  sitar: 'Sitar', banjo: 'Banjo', shamisen: 'Shamisen', koto: 'Koto',
  kalimba: 'Kalimba', bag_pipe: 'Gaita', fiddle: 'Violín folk', shanai: 'Shehnai',
  tinkle_bell: 'Campanilla', agogo: 'Agogó', steel_drums: 'Steel drum', woodblock: 'Caja china',
  taiko_drum: 'Taiko', melodic_tom: 'Tom melódico', synth_drum: 'Tambor sintetizado', reverse_cymbal: 'Platillo invertido',
  guitar_fret_noise: 'Ruido de trastes', breath_noise: 'Respiración', seashore: 'Orilla del mar', bird_tweet: 'Pájaros',
  telephone_ring: 'Teléfono', helicopter: 'Helicóptero', applause: 'Aplausos', gunshot: 'Disparo',
}

/** "acoustic_grand_piano" → "Acoustic grand piano", or its Spanish name. */
export function instrumentLabel(id: string): string {
  if (getLang() === 'es' && ES[id]) return ES[id]
  const words = id.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
