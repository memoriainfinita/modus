import { pitchClassOf } from '../theory/notes'
import { romanInKey } from '../detector/analyzer'
import { keyPrefersSharps } from '../theory/keys'
import { t, chordLabel, noteLabel } from '../i18n/i18n'
import { color } from '../ui/theme'

const CIRCLE_KEYS_FLAT  = ['C','G','D','A','E','B','Gb','Db','Ab','Eb','Bb','F']
// Sharps only where they name a standard key: G# and D# major would need double sharps.
const CIRCLE_KEYS_SHARP = ['C','G','D','A','E','B','F#','C#','Ab','Eb','Bb','F']
const CIRCLE_KEYS_MINOR_FLAT  = ['Am','Em','Bm','F#m','C#m','G#m','Ebm','Bbm','Fm','Cm','Gm','Dm']
const CIRCLE_KEYS_MINOR_SHARP = ['Am','Em','Bm','F#m','C#m','G#m','D#m','A#m','Fm','Cm','Gm','Dm']
const CIRCLE_DIM = ['B','F#','C#','G#','D#','A#','F','C','G','D','A','E']


const pitchClass = pitchClassOf
const rootOf = (symbol: string): string => symbol.match(/^([A-G][b#]*)/)?.[1] ?? ''

/**
 * The spelling of the circle's enharmonic segments: with a key (selected, or detected on
 * Auto) the key's signature decides, as everywhere else; the b / # buttons only without one.
 */
export function cofAccidentalFor(key: string | null, chosen: 'sharp' | 'flat'): 'sharp' | 'flat' {
  return key ? (keyPrefersSharps(key) ? 'sharp' : 'flat') : chosen
}

export type CofOptions = { accidental: 'sharp' | 'flat', showMinor: boolean, showDegrees: boolean, show7ths: boolean, fontScale?: number, backdrop?: string }

/**
 * Renders the circle. `onSegmentClick` receives the segment's chord and, for major and
 * minor segments, the key it stands for ("G Major", "E Minor"); the caller decides what
 * a click or a double click does.
 */
export function renderCircleOfFifths(
  container: HTMLElement,
  activeKey: string | null,
  activeChord: string | null,
  onSegmentClick: (chord: string, key: string | null) => void,
  size = 160,
  opts: CofOptions = { accidental: 'flat', showMinor: true, showDegrees: false, show7ths: false }
) {
  const keys = opts.accidental === 'sharp' ? CIRCLE_KEYS_SHARP : CIRCLE_KEYS_FLAT
  const minorKeys = opts.accidental === 'sharp' ? CIRCLE_KEYS_MINOR_SHARP : CIRCLE_KEYS_MINOR_FLAT

  // The active key sits on its relative major's segment; a minor key's tonic is the minor
  // segment there. Matching is by pitch class, so F# Major finds Gb in flat mode.
  const [keyRoot, keyMode] = activeKey?.split(' ') ?? []
  const keyIsMinor = keyMode?.toLowerCase() === 'minor'
  const tonicPc = keyRoot ? pitchClass(keyRoot) : -1
  const activePos = tonicPc === -1 ? -1
    : keyIsMinor ? minorKeys.findIndex(m => pitchClass(rootOf(m)) === tonicPc)
    : keys.findIndex(k => pitchClass(k) === tonicPc)
  // Degrees as the analysis panel reads them (UMT, by letter: F#° in C is #iv°), drawn with ♭ ♯.
  const degreeOf = (chord: string) =>
    (romanInKey(chord, activeKey)?.degree ?? '').replace(/^([b#]+)/, acc => acc.replace(/b/g, '♭').replace(/#/g, '♯'))

  const chordRootPc = activeChord ? pitchClass(rootOf(activeChord)) : -1
  const isDimActiveChord = activeChord ? /^[A-G][b#]*(dim|°|m7b5|ø)/.test(activeChord) : false
  const isMinorActiveChord = !isDimActiveChord && activeChord ? /^[A-G][b#]*m(?!aj)/.test(activeChord) : false

  const cx = size / 2, cy = size / 2
  const outerR    = size * 0.425
  const innerR    = size * 0.275
  const labelR    = size * 0.356
  const minorOutR = size * 0.265
  const minorInR  = size * 0.165
  const minorR    = size * 0.21
  const dimOutR   = size * 0.155
  const dimInR    = size * 0.065
  const dimLabR   = size * 0.11
  const fs = opts.fontScale ?? 0.55
  const majorFont = Math.max(4, Math.round(size * 0.0625 * fs))
  const minorFont = Math.max(3, Math.round(size * 0.05   * fs))
  const dimFont   = Math.max(3, Math.round(size * 0.04   * fs))

  const ring = (rOut: number, rIn: number, a1: number, a2: number) => {
    const p = (r: number, a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
    return `M${p(rIn, a1)} L${p(rOut, a1)} A${rOut},${rOut} 0 0,1 ${p(rOut, a2)} L${p(rIn, a2)} A${rIn},${rIn} 0 0,0 ${p(rIn, a1)}`
  }
  const label = (x: number, y: number, font: number, fill: string, main: string, sub: string | null, subFill: string) => sub
    ? `<text x="${x}" y="${y - font * 0.5}" text-anchor="middle" dominant-baseline="middle" font-size="${font}" fill="${fill}" pointer-events="none">${main}</text>` +
      `<text x="${x}" y="${y + font * 0.72}" text-anchor="middle" dominant-baseline="middle" font-size="${font * 0.85}" fill="${subFill}" pointer-events="none">${sub}</text>`
    : `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${font}" fill="${fill}" pointer-events="none">${main}</text>`
  const TIP = t('cof.segment.tip')

  const diatonicPos = activePos !== -1
    ? new Set([(activePos + 11) % 12, activePos, (activePos + 1) % 12])
    : new Set<number>()

  const c = {
    tonic: color('cof-tonic'), chord: color('cof-chord'), diatonic: color('cof-diatonic'), diatonicStroke: color('cof-diatonic-stroke'),
    segment: color('cof-segment'), stroke: color('cof-stroke'), dimDiatonic: color('cof-dim-diatonic'),
    dimDiatonicStroke: color('cof-dim-diatonic-stroke'), dim: color('cof-dim'), dimStroke: color('cof-dim-stroke'),
    label: color('cof-label'), onMark: color('cof-label-on-mark'), minorLabel: color('cof-minor-label'),
    minorDiatonicLabel: color('cof-minor-diatonic-label'), dimLabel: color('cof-dim-label'),
    dimDiatonicLabel: color('cof-dim-diatonic-label'), degree: color('cof-degree'), degreeSmall: color('cof-degree-small'),
  }

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">`
  // A view window on a chroma background needs the rings on a solid disc.
  if (opts.backdrop) svg += `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.43}" fill="${opts.backdrop}"/>`

  keys.forEach((key, i) => {
    const angle = (i * 30 - 90) * Math.PI / 180
    const nextAngle = ((i + 1) * 30 - 90) * Math.PI / 180
    const midAngle = (i * 30 + 15 - 90) * Math.PI / 180
    const relPos = activePos !== -1 ? (i - activePos + 12) % 12 : -1
    const isDiatonic = diatonicPos.has(i)
    const showDeg = opts.showDegrees && activePos !== -1

    // Major ring
    const isTonic = activePos === i && !keyIsMinor
    const isChordRoot = !isMinorActiveChord && !isDimActiveChord && chordRootPc === pitchClass(key)
    const fill = isTonic ? c.tonic : isChordRoot ? c.chord : isDiatonic ? c.diatonic : c.segment
    const stroke = isChordRoot ? c.chord : isDiatonic ? c.diatonicStroke : c.stroke
    // The dominant seventh sits one step clockwise of the relative major (V in major, VII in minor).
    const suffix7 = opts.show7ths ? (relPos === 1 ? '7' : 'maj7') : ''
    svg += `<path d="${ring(outerR, innerR, angle, nextAngle)}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor:pointer"
      data-chord="${key + suffix7}" data-key="${key} Major"><title>${TIP}</title></path>`
    svg += label(cx + labelR * Math.cos(midAngle), cy + labelR * Math.sin(midAngle), majorFont, isTonic || isChordRoot ? c.onMark : c.label,
      chordLabel(key + suffix7), showDeg ? degreeOf(key) : null, isTonic || isChordRoot ? c.onMark : c.degree)

    if (!opts.showMinor) return

    // Minor ring
    const minorRoot = rootOf(minorKeys[i])
    const isMinorTonic = activePos === i && keyIsMinor
    const isMinorChordHere = isMinorActiveChord && chordRootPc === pitchClass(minorRoot)
    const minorChord = minorKeys[i] + (opts.show7ths ? '7' : '')
    const minorSegFill   = isMinorTonic ? c.tonic : isMinorChordHere ? c.chord : isDiatonic ? c.diatonic : 'transparent'
    const minorSegStroke = isMinorTonic ? c.tonic : isMinorChordHere ? c.chord : isDiatonic ? c.diatonicStroke : 'transparent'
    svg += `<path d="${ring(minorOutR, minorInR, angle, nextAngle)}" fill="${minorSegFill}" stroke="${minorSegStroke}" stroke-width="1"
      pointer-events="all" style="cursor:pointer" data-chord="${minorChord}" data-key="${minorRoot} Minor"><title>${TIP}</title></path>`
    const minorFill = isMinorTonic || isMinorChordHere ? c.onMark : isDiatonic ? c.minorDiatonicLabel : c.minorLabel
    svg += label(cx + minorR * Math.cos(midAngle), cy + minorR * Math.sin(midAngle), minorFont, minorFill,
      chordLabel(minorChord), showDeg ? degreeOf(minorKeys[i]) : null, isMinorTonic || isMinorChordHere ? c.onMark : c.degreeSmall)

    // Diminished ring: the leading-tone chord of the major key on this segment
    const dimRoot = CIRCLE_DIM[i]
    const isDiatonicDim = i === activePos
    const isDimChordHere = isDimActiveChord && chordRootPc === pitchClass(dimRoot)
    const dimChord = `${dimRoot}${opts.show7ths ? 'm7b5' : 'dim'}`
    svg += `<path d="${ring(dimOutR, dimInR, angle, nextAngle)}"
      fill="${isDimChordHere ? c.chord : isDiatonicDim ? c.dimDiatonic : c.dim}" stroke="${isDiatonicDim ? c.dimDiatonicStroke : c.dimStroke}" stroke-width="${isDiatonicDim ? 1.5 : 1}"
      pointer-events="all" style="cursor:pointer" data-chord="${dimChord}"><title>${t('cof.segment.play')}</title></path>`
    const dimText = `${noteLabel(dimRoot)}${opts.show7ths ? 'ø7' : '°'}`
    svg += label(cx + dimLabR * Math.cos(midAngle), cy + dimLabR * Math.sin(midAngle), dimFont,
      isDimChordHere ? c.onMark : isDiatonicDim ? c.dimDiatonicLabel : c.dimLabel,
      dimText, showDeg ? degreeOf(`${dimRoot}dim`) : null, isDimChordHere ? c.onMark : c.degreeSmall)
  })

  svg += '</svg>'
  container.innerHTML = svg

  container.querySelectorAll<SVGPathElement>('[data-chord]').forEach(el => {
    el.addEventListener('click', () => onSegmentClick(el.dataset.chord!, el.dataset.key ?? null))
  })
}
