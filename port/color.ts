import type { Metafile } from "./metafile"
import type { TreeNodeInProgress } from "./tree";
import {
  hueAngleToColor,
  isSourceMapPath,
  stripDisabledPathPrefix,
} from "./helpers"
import { accumulatePath, orderChildrenBySize } from "./tree"

export enum COLOR {
  NONE = 0,
  DIRECTORY = 1,
  FORMAT = 2,
}

enum FORMATS {
  CJS = 1,
  ESM = 2,
}

let previousPatternContext: CanvasRenderingContext2D | undefined
let previousPatternRatio: number | undefined
let previousPatternScale: number | undefined
const patternCanvas = document.createElement('canvas')
const patternContext = patternCanvas.getContext('2d')!
let patternScale = 1
let pattern: CanvasPattern

export type Color = string | readonly [string, string]
export type ColorMapping = Record<string, Color>

export function canvasFillStyleForInputPath (
  colorMapping: ColorMapping,
  c: CanvasRenderingContext2D,
  inputPath: string,
  originX: number,
  originY: number,
  scale: number
): string | CanvasPattern {
  const color = colorMapping[inputPath] || otherColor
  if (color instanceof Array) {
    const ratio = window.devicePixelRatio || 1
    if (previousPatternContext !== c || previousPatternRatio !== ratio || previousPatternScale !== scale) {
      const s = Math.round(64 * ratio) / 64
     
      patternScale = scale
      patternScale = Math.log2(patternScale)
      patternScale -= Math.floor(patternScale)
      const t1 = patternScale
      const t8 = Math.min(1, 8 * t1)
      patternScale = 2**patternScale
      const lineWidth = 8 * Math.SQRT2 / patternScale

      previousPatternContext = c
      previousPatternRatio = ratio
      previousPatternScale = scale

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
      patternScale, 0,
      0, patternScale,
      originX, originY,
    ]))
    return pattern
  }
  return color
}

export function cssBackgroundForInputPath (
  colorMapping: ColorMapping,
  inputPath: string
): string {
  const color = colorMapping[inputPath] || otherColor
  if (color instanceof Array) {
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
  return color
}

export function getColorMapping (metafile: Metafile, color: COLOR): ColorMapping {
  const colorMapping: ColorMapping = {}

  const outputs = metafile.outputs
  const root = { name_: '', inputPath_: '', bytesInOutput_: 0, children_: {} }

  // For each output file
  for (const o in outputs) {
    if (isSourceMapPath(o)) continue

    const output = outputs[o]
    const inputs = output.inputs

    // Accumulate the input files that contributed to this output file
    for (const i in inputs) {
      accumulatePath(root, stripDisabledPathPrefix(i), inputs[i].bytesInOutput)
    }
  }

  if (color === COLOR.DIRECTORY) {
    assignColorsByDirectory(colorMapping, root, 0, Math.PI * 2)
  } else if (color === COLOR.FORMAT) {
    assignColorsByFormat(colorMapping, root, metafile)
  }

  return colorMapping
}

function assignColorsByDirectory (
  colorMapping: ColorMapping,
  node: TreeNodeInProgress,
  startAngle: number,
  sweepAngle: number
): void {
  const totalBytes = node.bytesInOutput_
  const children = node.children_
  const sorted: TreeNodeInProgress[] = []

  colorMapping[node.inputPath_] = hueAngleToColor(startAngle + sweepAngle / 2)

  for (const file in children) {
    sorted.push(children[file])
  }

  for (const child of sorted.sort(orderChildrenBySize)) {
    const childSweepAngle = child.bytesInOutput_ / totalBytes * sweepAngle
    assignColorsByDirectory(colorMapping, child, startAngle, childSweepAngle)
    startAngle += childSweepAngle
  }
}

export const cjsColor = hueAngleToColor(3.5)
export const esmColor = hueAngleToColor(1)
export let otherColor = '#CCC'
const bothColor = [cjsColor, esmColor] as const

function colorForFormats (formats: FORMATS): Color {
  if (!formats) return otherColor
  if (formats === FORMATS.CJS) return cjsColor
  if (formats === FORMATS.ESM) return esmColor
  return bothColor
}

export function moduleTypeLabelInputPath (
  colorMapping: ColorMapping,
  inputPath: string, 
  prefix: string
): string {
  const color = colorMapping[inputPath] || otherColor
  if (color === otherColor) return ''
  if (color === esmColor) return prefix + 'ESM'
  if (color === cjsColor) return prefix + 'CJS'
  return prefix + 'ESM & CJS'
}

function assignColorsByFormat (colorMapping: ColorMapping, node: TreeNodeInProgress, metafile: Metafile): FORMATS {
  const children = node.children_
  let formats: FORMATS | 0 = 0
  let hasChild = false

  for (const file in children) {
    formats |= assignColorsByFormat(colorMapping, children[file], metafile)
    hasChild = true
  }

  if (!hasChild) {
    const input = metafile.inputs[node.inputPath_]
    const format = input && input.format
    formats = format === 'esm' ? FORMATS.ESM : format === 'cjs' ? FORMATS.CJS : 0
  }

  colorMapping[node.inputPath_] = colorForFormats(formats)
  return formats
}
