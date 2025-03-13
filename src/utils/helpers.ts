const isFirefox = /\bFirefox\//.test(navigator.userAgent)

let numberFormat: Intl.NumberFormat | undefined

export const hasOwnProperty = Object.prototype.hasOwnProperty
export const indexOf = Array.prototype.indexOf

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

export function shortenDataURLForDisplay(path: string): string {
  // Data URLs can be really long. This shortens them to something suitable for
  // display in a tooltip. This shortening behavior is also what esbuild does.
  if (path.startsWith('data:') && path.includes(',')) {
    path = path.slice(0, 65).replace(/\n/g, '\\n')
    return '<' + (path.length > 64 ? path.slice(0, 64) + '...' : path) + '>'
  }
  return path
}

export function textToHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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

export function createText(text: string): Text {
  return document.createTextNode(text)
}

export function createCode(text: string): HTMLElement {
  const code = document.createElement('code')
  code.textContent = text
  return code
}

export function createSpanWithClass(className: string, text: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = className
  span.textContent = text
  return span
}

export let lastInteractionWasKeyboard = false

const darkMode = matchMedia('(prefers-color-scheme: dark)')
export function useWheelEventListener(listener: ((e: WheelEvent) => void)) {
  window.addEventListener('wheel', listener, { passive: false })
  return () => window.removeEventListener('wheel', listener)
}
export function useResizeEventListener(listener: () => void) {
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}
export function useDarkModeListener(listener: () => void) {
  darkMode.addEventListener('change', listener)
  return () => darkMode.removeEventListener('change', listener)
}

// Only do certain keyboard accessibility stuff if the user is interacting with the keyboard
document.addEventListener('keydown', () => lastInteractionWasKeyboard = true, { capture: true })
document.addEventListener('mousedown', () => lastInteractionWasKeyboard = false, { capture: true })

// Handle the case where this API doesn't exist
try {
  numberFormat = new Intl.NumberFormat()
}
catch {
}
