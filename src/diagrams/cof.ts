import { pitchClassOf } from '../theory/notes'
import { romanInKey } from '../detector/analyzer'
import { keyPrefersSharps, keyMode, parentMajorPc } from '../theory/keys'
import { t, chordLabel, noteLabel } from '../i18n/i18n'
import { color } from '../ui/theme'
import { functionColor } from '../theory/chord'
import { makeActivatable } from '../ui/a11y'

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

  // The active key's notes are those of a major scale: its segment, with the ones beside it, is
  // the diatonic block. The tonic is marked on its ring: major for major, lydian and mixolydian,
  // minor for minor, dorian and phrygian; locrian's is that block's diminished chord. Matching
  // is by pitch class, so F# Major finds Gb in flat mode.
  const mode = keyMode(activeKey)
  const tonicPc = activeKey ? pitchClass(activeKey.split(' ')[0]) : -1
  const parentPc = parentMajorPc(activeKey)
  const activePos = parentPc === -1 ? -1 : keys.findIndex(k => pitchClass(k) === parentPc)
  const tonicMajorPos = mode === 'Major' || mode === 'Lydian' || mode === 'Mixolydian' ? keys.findIndex(k => pitchClass(k) === tonicPc) : -1
  const tonicMinorPos = mode === 'Minor' || mode === 'Dorian' || mode === 'Phrygian' ? minorKeys.findIndex(m => pitchClass(rootOf(m)) === tonicPc) : -1
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

  // The chord on the circle in the colour of its function in the key (one colour code), the key in the accent
  const chordFn = activeChord ? romanInKey(activeChord, activeKey)?.function ?? null : null
  const c = {
    tonic: color('cof-tonic'), chord: functionColor(chordFn, 'cof-chord'), diatonic: color('cof-diatonic'), diatonicStroke: color('cof-diatonic-stroke'),
    segment: color('cof-segment'), stroke: color('cof-stroke'), dimDiatonic: color('cof-dim-diatonic'),
    dimDiatonicStroke: color('cof-dim-diatonic-stroke'), dim: color('cof-dim'), dimStroke: color('cof-dim-stroke'),
    label: color('cof-label'), onMark: color('cof-label-on-mark'), minorLabel: color('cof-minor-label'),
    minorDiatonicLabel: color('cof-minor-diatonic-label'), dimLabel: color('cof-dim-label'),
    dimDiatonicLabel: color('cof-dim-diatonic-label'), degree: color('cof-degree'), degreeSmall: color('cof-degree-small'),
  }

  // Segments in drawing order: per position major, then minor and diminished when shown. The
  // one with the chord, else the tonic, is the circle's tab stop unless one was focused before
  const rings = opts.showMinor ? 3 : 1
  let chordSeg = -1, tonicSeg = -1

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
    const isTonic = i === tonicMajorPos
    const isChordRoot = !isMinorActiveChord && !isDimActiveChord && chordRootPc === pitchClass(key)
    const fill = isTonic ? c.tonic : isChordRoot ? c.chord : isDiatonic ? c.diatonic : c.segment
    const stroke = isChordRoot ? c.chord : isDiatonic ? c.diatonicStroke : c.stroke
    if (isChordRoot) chordSeg = i * rings
    if (isTonic) tonicSeg = i * rings
    // The dominant seventh sits one step clockwise of the relative major (V in major, VII in minor).
    const suffix7 = opts.show7ths ? (relPos === 1 ? '7' : 'maj7') : ''
    svg += `<path d="${ring(outerR, innerR, angle, nextAngle)}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor:pointer"
      data-chord="${key + suffix7}" data-key="${key} Major"><title>${TIP}</title></path>`
    svg += label(cx + labelR * Math.cos(midAngle), cy + labelR * Math.sin(midAngle), majorFont, isTonic || isChordRoot ? c.onMark : c.label,
      chordLabel(key + suffix7), showDeg ? degreeOf(key) : null, isTonic || isChordRoot ? c.onMark : c.degree)

    if (!opts.showMinor) return

    // Minor ring
    const minorRoot = rootOf(minorKeys[i])
    const isMinorTonic = i === tonicMinorPos
    const isMinorChordHere = isMinorActiveChord && chordRootPc === pitchClass(minorRoot)
    const minorChord = minorKeys[i] + (opts.show7ths ? '7' : '')
    if (isMinorChordHere) chordSeg = i * rings + 1
    if (isMinorTonic) tonicSeg = i * rings + 1
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
    if (isDimChordHere) chordSeg = i * rings + 2
    svg += `<path d="${ring(dimOutR, dimInR, angle, nextAngle)}"
      fill="${isDimChordHere ? c.chord : isDiatonicDim ? c.dimDiatonic : c.dim}" stroke="${isDiatonicDim ? c.dimDiatonicStroke : c.dimStroke}" stroke-width="${isDiatonicDim ? 1.5 : 1}"
      pointer-events="all" style="cursor:pointer" data-chord="${dimChord}"><title>${t('cof.segment.play')}</title></path>`
    const dimText = `${noteLabel(dimRoot)}${opts.show7ths ? 'ø7' : '°'}`
    svg += label(cx + dimLabR * Math.cos(midAngle), cy + dimLabR * Math.sin(midAngle), dimFont,
      isDimChordHere ? c.onMark : isDiatonicDim ? c.dimDiatonicLabel : c.dimLabel,
      dimText, showDeg ? degreeOf(`${dimRoot}dim`) : null, isDimChordHere ? c.onMark : c.degreeSmall)
  })

  svg += '</svg>'
  // A segment played from the keyboard redraws the circle: the focus stays on the same segment
  const segments = () => [...container.querySelectorAll<SVGPathElement>('[data-chord]')]
  const focused = segments().indexOf(document.activeElement as SVGPathElement)
  container.innerHTML = svg

  segments().forEach(el => {
    el.addEventListener('click', () => onSegmentClick(el.dataset.chord!, el.dataset.key ?? null))
    makeActivatable(el, chordLabel(el.dataset.chord!))
    // The <title> is the mouse's tooltip; a screen reader takes this description before it
    el.setAttribute('aria-description', t(el.dataset.key ? 'a11y.cof.segment' : 'a11y.cof.segmentPlay'))
  })
  container.querySelector('svg')?.setAttribute('aria-label', t('a11y.cof'))
  container.querySelector('svg')?.setAttribute('role', 'group')

  // One tab stop (roving tabindex): arrows go round the ring and across the rings
  const all = segments()
  const remembered = lastSegment.get(container)
  const stop = (n: number) => all.forEach((el, k) => el.setAttribute('tabindex', k === n ? '0' : '-1'))
  stop([remembered ?? -1, chordSeg, tonicSeg, 0].find(n => n >= 0 && n < all.length) ?? 0)
  all.forEach((el, k) => el.addEventListener('focus', () => { lastSegment.set(container, k); stop(k) }))
  container.querySelector('svg')?.addEventListener('keydown', e => {
    const k = all.indexOf(e.target as SVGPathElement)
    if (k < 0) return
    const pos = Math.floor(k / rings), r = k % rings
    const next =
      e.key === 'ArrowRight' ? ((pos + 1) % 12) * rings + r :
      e.key === 'ArrowLeft' ? ((pos + 11) % 12) * rings + r :
      e.key === 'ArrowUp' ? pos * rings + Math.max(0, r - 1) :
      e.key === 'ArrowDown' ? pos * rings + Math.min(rings - 1, r + 1) :
      e.key === 'Home' ? 0 : -1
    if (next < 0) return
    e.preventDefault()
    all[next].focus()
  })
  if (focused >= 0) all[focused]?.focus()
}

// The segment last focused in each circle, by its place in drawing order
const lastSegment = new WeakMap<HTMLElement, number>()
