import type { TreeNode, TreeNodeInput } from '../types/tree'
import { randomStr } from '@antfu/utils'

/**
 * Allow to create the TreeNode with more flexible input.
 */
export function normalizeTreeNode<T>(
  node: TreeNodeInput<T>,
  parent?: TreeNode<T>,
  sort: false | ((a: TreeNode<T>, b: TreeNode<T>) => number) = (a, b) => b.size - a.size,
): TreeNode<T> {
  if ((node as any).__nanovis)
    return node as any

  const normalized: TreeNode<T> = {
    ...node,
  } as any
  normalized.id ||= randomStr()
  normalized.parent ||= parent
  normalized.children ||= []
  if (normalized.sizeSelf == null && normalized.size != null && normalized.children.length === 0)
    normalized.sizeSelf = normalized.size
  else
    normalized.sizeSelf ||= 0
  normalized.children = (normalized.children || []).map(child => normalizeTreeNode(child, normalized, sort))
  normalized.size ||= normalized.children.reduce((acc, child) => acc + child.size, 0) + normalized.sizeSelf

  if (sort)
    normalized.children.sort(sort)

  Object.defineProperty(normalized, '__nanovis', { enumerable: false, value: true })
  return normalized
}

export function getTreeMaxDepth(node: TreeNode<any>): number {
  if (node.children.length === 0)
    return 1
  return Math.max(...node.children.map(child => getTreeMaxDepth(child))) + 1
}
