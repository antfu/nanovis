import type { TreeNode } from './tree'

export type ColorValue = string | readonly [string, string]
export type ColorMapPlain = Record<string, ColorValue | undefined>
export interface ColorMapping<T> {
  get: (node: TreeNode<T>) => ColorValue | undefined
}

export interface Palette {
  fallback: string
  stroke: string
  hover: string
  shadow: string
  text: string
  fg: string
  bg: string
}
