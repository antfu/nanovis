const isFirefox = /\bFirefox\//.test(navigator.userAgent)

let numberFormat: Intl.NumberFormat | undefined

export function formatInteger(value: number): string {
  return numberFormat ? numberFormat.format(value) : value + ''
}

export function now(): number {
  return (window.performance || Date).now()
}

export function formatNumberWithDecimal(value: number): string {
  const parts = value.toFixed(1).split('.', 2)
  return formatInteger(+parts[0]) + '.' + parts[1]
}

export function bytesToText(bytes: number): string {
  if (bytes === 1)
    return '1 byte'
  if (bytes < 1024)
    return formatInteger(bytes) + ' bytes'
  if (bytes < 1024 * 1024)
    return formatNumberWithDecimal(bytes / 1024) + ' kb'
  if (bytes < 1024 * 1024 * 1024)
    return formatNumberWithDecimal(bytes / (1024 * 1024)) + ' mb'
  return formatNumberWithDecimal(bytes / (1024 * 1024 * 1024)) + ' gb'
}

export function strokeRectWithFirefoxBugWorkaround(c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  // Line drawing in Firefox (at least on macOS) has some really weird bugs:
  //
  //   1. Calling "strokeRect" appears to draw four individual line segments
  //      instead of a single four-line polygon. This is visually different
  //      from other browsers when the stroke color is partially-transparent.
  //
  //   2. Drawing lines appears to be incorrectly offset by 0.5px. Normally
  //      you need to offset your 1px-wide lines by 0.5px when using center
  //      stroke so that they fill up the whole pixel instead of straddling
  //      two pixels. But Firefox offsets by another 0.5px, so lines are
  //      sharp in all browsers except Firefox.
  //
  // As a hack, draw our rectangle outlines using fill instead of stroke on
  // Firefox. That fixes both of these bugs.
  if (isFirefox) {
    const lineWidth = c.lineWidth
    const halfWidth = lineWidth / 2
    c.fillStyle = color
    c.fillRect(x - halfWidth, y - halfWidth, w + lineWidth, lineWidth)
    c.fillRect(x - halfWidth, y + halfWidth, lineWidth, h - lineWidth)
    c.fillRect(x - halfWidth, y + h - halfWidth, w + lineWidth, lineWidth)
    c.fillRect(x + w - halfWidth, y + halfWidth, lineWidth, h - lineWidth)
    return
  }

  c.strokeStyle = color
  c.strokeRect(x, y, w, h)
}

export function useWheelEventListener(listener: ((e: WheelEvent) => void)) {
  window.addEventListener('wheel', listener, { passive: false })
  return () => window.removeEventListener('wheel', listener)
}
export function useResizeEventListener(listener: () => void) {
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}

// Handle the case where this API doesn't exist
try {
  numberFormat = new Intl.NumberFormat()
}
catch {
}
