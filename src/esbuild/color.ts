import type { ColorMapPlain, ColorValue } from '../types/color'
import type { TreeNode, TreeRoot } from '../types/tree'
import type { Metafile } from './metafile'
import { createColorGetterFromMap, hueAngleToColor } from '../utils/color'

// eslint-disable-next-line no-restricted-syntax
const enum FORMATS {
  CJS = 1,
  ESM = 2,
}

const COLOR_CJS = hueAngleToColor(3.5)
const COLOR_ESM = hueAngleToColor(1)
const COLOR_BOTH = [COLOR_CJS, COLOR_ESM] as const

function colorForFormats(formats: FORMATS): ColorValue | undefined {
  if (!formats)
    return undefined
  if (formats === FORMATS.CJS)
    return COLOR_CJS
  if (formats === FORMATS.ESM)
    return COLOR_ESM
  return COLOR_BOTH
}

export function moduleTypeLabelInputPath(
  color: ColorValue | undefined,
  prefix: string,
): string {
  if (!color)
    return ''
  if (color === COLOR_ESM)
    return `${prefix}ESM`
  if (color === COLOR_CJS)
    return `${prefix}CJS`
  return `${prefix}ESM & CJS`
}

export function createColorGetterFormats<T>(tree: TreeRoot<T>, metafile: Metafile): (node: TreeNode<T>) => ColorValue | undefined {
  const colorMapping: ColorMapPlain = {}
  assignColorsByFormat(colorMapping, tree.root, metafile)
  // TODO: make it on-demand
  return createColorGetterFromMap(colorMapping)
}

function assignColorsByFormat<T>(colorMapping: ColorMapPlain, node: TreeNode<T>, metafile: Metafile): FORMATS {
  let formats: FORMATS | 0 = 0
  let hasChild = false

  for (const child of node.children) {
    formats |= assignColorsByFormat(colorMapping, child, metafile)
    hasChild = true
  }

  if (!hasChild) {
    const input = metafile.inputs[node.id]
    const format = input && input.format
    formats = format === 'esm' ? FORMATS.ESM : format === 'cjs' ? FORMATS.CJS : 0
  }

  colorMapping[node.id] = colorForFormats(formats)
  return formats
}
