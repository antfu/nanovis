import type { TreeNode, TreeNodeInput } from '../types/tree'
import { randomStr } from '@antfu/utils'

/**
 * Allow to create the TreeNode with more flexible input.
 */
export function normalizeTreeNode<T>(node: TreeNodeInput<T>, parent?: TreeNode<T>): TreeNode<T> {
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
  normalized.children = (normalized.children || []).map(child => normalizeTreeNode(child, normalized))
  normalized.size ||= normalized.children.reduce((acc, child) => acc + child.size, 0) + normalized.sizeSelf
  normalized.children.sort((a, b) => b.size - a.size)

  return normalized
}

export function getTreeMaxDepth(node: TreeNode<any>): number {
  if (node.children.length === 0)
    return 1
  return Math.max(...node.children.map(child => getTreeMaxDepth(child))) + 1
}
