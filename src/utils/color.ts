import type { ColorMapPlain, ColorValue } from '../types/color'
import type { Tree, TreeNode } from '../types/tree'

export function hueAngleToColor(hueAngle: number, saturationMultiplier = 1, lightnessMultiplier = 1): string {
  const saturation = (0.6 + 0.4 * Math.max(0, Math.cos(hueAngle))) * saturationMultiplier
  const lightness = (0.5 + 0.2 * Math.max(0, Math.cos(hueAngle + Math.PI * 2 / 3))) * lightnessMultiplier
  return `hsl(${hueAngle * 180 / Math.PI}deg, ${Math.round(100 * saturation)}%, ${Math.round(100 * lightness)}%)`
}

let previousPatternContext: CanvasRenderingContext2D | undefined
let previousPatternRatio: number | undefined
let previousPatternScale: number | undefined
let patternCanvas: HTMLCanvasElement | undefined
let patternContext: CanvasRenderingContext2D | undefined
let patternScale = 1
let pattern: CanvasPattern

export function colorToCanvasFill(
  color: ColorValue,
  c: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  scale: number,
): string | CanvasPattern {
  if (!Array.isArray(color))
    return color as string

  const ratio = window.devicePixelRatio || 1
  if (previousPatternContext !== c || previousPatternRatio !== ratio || previousPatternScale !== scale) {
    const s = Math.round(64 * ratio) / 64

    patternScale = scale
    patternScale = Math.log2(patternScale)
    patternScale -= Math.floor(patternScale)
    const t1 = patternScale
    const t8 = Math.min(1, 8 * t1)
    patternScale = 2 ** patternScale
    const lineWidth = 8 * Math.SQRT2 / patternScale

    previousPatternContext = c
    previousPatternRatio = ratio
    previousPatternScale = scale

    patternCanvas ||= document.createElement('canvas')
    patternContext ||= patternCanvas.getContext('2d')!

    patternCanvas.width = patternCanvas.height = Math.round(64 * s)
    patternContext.scale(s, s)

    // Interpolate the two colors together so stripes are at 25% and 75% opacity
    patternContext.fillStyle = color[0]
    patternContext.fillRect(0, 0, 64, 64)
    patternContext.globalAlpha = 0.25
    patternContext.fillStyle = color[1]
    patternContext.fillRect(0, 0, 64, 64)
    patternContext.globalAlpha = 0.67
    patternContext.strokeStyle = color[1]

    // Draw the thicker lines
    patternContext.beginPath()
    for (let i = 0; i <= 64; i += 16) {
      patternContext.moveTo(i - 32, i + 32)
      patternContext.lineTo(i + 32, i - 32)
    }
    patternContext.lineWidth = lineWidth * (1 - (t8 - t1) / 2)
    patternContext.stroke()

    // Draw the thinner lines
    if (t8 + t1 > 0) {
      patternContext.beginPath()
      for (let i = 8; i < 64; i += 16) {
        patternContext.moveTo(i - 32, i + 32)
        patternContext.lineTo(i + 32, i - 32)
      }
      patternContext.lineWidth = lineWidth * (t8 + t1) / 2
      patternContext.stroke()
    }

    pattern = c.createPattern(patternCanvas, 'repeat')!
    patternScale /= s
  }

  // Re-center the pattern near the origin so the shaders don't run out of precision
  originX /= 64 * patternScale * ratio
  originX -= Math.floor(originX)
  originX *= 64 * patternScale * ratio

  pattern.setTransform(new DOMMatrix([
    patternScale,
    0,
    0,
    patternScale,
    originX,
    originY,
  ]))
  return pattern
}

export function colorToCssBackground(
  color: ColorValue,
): string {
  if (Array.isArray(color)) {
    return `url('`
      + `data:image/svg+xml,`
      + `<svg width="26" height="26" xmlns="http://www.w3.org/2000/svg">`
      + `<rect width="26" height="26" fill="${color[0]}"/>`
      // Interpolate the two colors together so stripes are at 25% and 75% opacity
      + `<rect width="26" height="26" fill="${color[1]}" fill-opacity="25%"/>`
      + `<path d="M22.5 -3.5L-3.5 22.5M35.5 9.5L9.5 35.5" stroke="${color[1]}" stroke-opacity="67%" stroke-width="9.19239"/>`
      + `</svg>`
      + `')`
  }
  return color as string
}

export function createColorGetterFromMap<T>(plain: ColorMapPlain): (node: TreeNode<T>) => ColorValue | undefined {
  return (node: TreeNode<T>) => node.id ? plain[node.id] || node.color : node.color
}

export function createColorGetterSpectrum<T>(
  tree: Tree<T>,
  saturationMultiplier = 1,
  lightnessMultiplier = 1,
): (node: TreeNode<T>) => ColorValue | undefined {
  const colorMapping: ColorMapPlain = {}
  assignColorsByDirectory(colorMapping, tree.root, 0, Math.PI * 2, saturationMultiplier, lightnessMultiplier)
  return createColorGetterFromMap(colorMapping)
}

function assignColorsByDirectory<T>(
  colorMapping: ColorMapPlain,
  node: TreeNode<T>,
  startAngle: number,
  sweepAngle: number,
  saturationMultiplier = 1,
  lightnessMultiplier = 1,
): void {
  const totalBytes = node.size
  colorMapping[node.id] = hueAngleToColor(startAngle + sweepAngle / 2, saturationMultiplier, lightnessMultiplier)

  for (const child of node.children) {
    const childSweepAngle = child.size / totalBytes * sweepAngle
    assignColorsByDirectory(colorMapping, child, startAngle, childSweepAngle, saturationMultiplier, lightnessMultiplier)
    startAngle += childSweepAngle
  }
}
