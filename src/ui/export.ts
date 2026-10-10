// Export of a diagram on screen as an SVG or PNG file, transparent background. The SVG is
// copied with the colours it inherits written in (abcjs draws in currentColor).

export type ExportTarget = 'staff' | 'cof' | 'guitar' | 'piano'

const CONTAINERS: Record<ExportTarget, string> = {
  staff: '#staff-container', cof: '#cof-container', guitar: '#guitar-container', piano: '#piano-container',
}

const PAD = 4   // drawing units around the content: strokes reach past getBBox

/**
 * A standalone copy of the target's diagram, cropped to what is drawn and at the size it
 * has on screen; null when there is none. abcjs leaves part of its canvas empty and
 * scales with a CSS transform, so the crop comes from the content, not the element.
 */
export function diagramSvg(target: ExportTarget): { svg: string; width: number; height: number } | null {
  const source = document.querySelector<SVGSVGElement>(`${CONTAINERS[target]} svg`)
  if (!source) return null
  const bb = source.getBBox()
  if (!bb.width || !bb.height) return null
  const rect = source.getBoundingClientRect()
  const vb = source.viewBox.baseVal
  const units = vb && vb.width ? vb.width : parseFloat(source.getAttribute('width') ?? '') || rect.width
  const screenScale = rect.width / units || 1
  const x = bb.x - PAD, y = bb.y - PAD, w = bb.width + 2 * PAD, h = bb.height + 2 * PAD
  const copy = source.cloneNode(true) as SVGSVGElement
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copy.removeAttribute('style')
  if (target === 'cof' && vb?.width) {
    // The minor ring is transparent over the page: the file gets the page colour behind the rings
    const disc = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    disc.setAttribute('cx', String(vb.width / 2))
    disc.setAttribute('cy', String(vb.height / 2))
    disc.setAttribute('r', String(vb.width * 0.43))
    disc.setAttribute('fill', getComputedStyle(document.body).backgroundColor)
    copy.insertBefore(disc, copy.firstChild)
  }
  copy.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)
  const width = Math.round(w * screenScale), height = Math.round(h * screenScale)
  copy.setAttribute('width', String(width))
  copy.setAttribute('height', String(height))
  copy.style.color = getComputedStyle(source).color
  copy.style.fontFamily = getComputedStyle(source).fontFamily
  return { svg: new XMLSerializer().serializeToString(copy), width, height }
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const fileName = (target: ExportTarget, label: string | null, ext: string) =>
  `modus-${target}${label ? '-' + label.replace(/[^\w#-]+/g, '_') : ''}.${ext}`

/** Saves the diagram. PNG at `scale` × the size on screen. False when there is nothing to save. */
export async function exportDiagram(target: ExportTarget, format: 'svg' | 'png', label: string | null, scale = 3): Promise<boolean> {
  const d = diagramSvg(target)
  if (!d) return false
  const svgBlob = new Blob([d.svg], { type: 'image/svg+xml' })
  if (format === 'svg') { download(svgBlob, fileName(target, label, 'svg')); return true }

  const url = URL.createObjectURL(svgBlob)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = d.width * scale
    canvas.height = d.height * scale
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
    if (!png) return false
    download(png, fileName(target, label, 'png'))
    return true
  } finally {
    URL.revokeObjectURL(url)
  }
}
