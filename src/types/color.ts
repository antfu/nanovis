import type { TreeNode } from './tree'

export type ColorValue = string | readonly [string, string]
export type ColorMapPlain = Record<string, ColorValue>
export interface ColorMapping<T> {
  get: (node: TreeNode<T>) => ColorValue | undefined
}
