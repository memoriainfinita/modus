/**
 * Makes an SVG scale to its container: a viewBox from its size, no fixed width or height.
 * `crop` trims the viewBox to what is drawn, for abcjs, which leaves part of its canvas empty.
 */
export function fitSvg(svg: SVGSVGElement | null, crop = false) {
  if (!svg) return
  if (!svg.getAttribute('viewBox')) {
    const w = parseFloat(svg.getAttribute('width') ?? ''), h = parseFloat(svg.getAttribute('height') ?? '')
    if (w > 0 && h > 0) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  if (crop) {
    // Nothing to measure while the panel is hidden: the full canvas stays
    const bb = svg.getBBox?.()
    const pad = 4
    if (bb && bb.width && bb.height) svg.setAttribute('viewBox', `${bb.x - pad} ${bb.y - pad} ${bb.width + 2 * pad} ${bb.height + 2 * pad}`)
  }
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.style.width = '100%'
  svg.style.height = '100%'
}
