import type { Tree, TreeNode } from '../types/tree'
import type { Metafile } from './metafile'
import { bytesToText } from '../utils/helpers'
import { commonPrefixFinder, isSourceMapPath, splitPathBySlash, stripDisabledPathPrefix } from './helpers'

export function esbuildMetafileToTree<T>(metafile: Metafile): Tree<T> {
  const outputs = metafile.outputs
  const nodes: TreeNode<T>[] = []
  let commonPrefix: string[] | undefined
  const root: TreeNodeInProgress = { text: '', id: '', size: 0, childrenMap: {} }

  const sortChildren = (node: TreeNodeInProgress): TreeNode<T> => {
    const children = node.childrenMap
    const sorted: TreeNode<T>[] = []
    for (const file in children) {
      sorted.push(sortChildren(children[file]))
    }
    return {
      text: node.text,
      id: node.id,
      subtext: bytesToText(node.size),
      size: node.size,
      children: sorted.sort(orderChildrenBySize),
    }
  }

  const setParents = (node: TreeNode<T>, depth: number): number => {
    let maxDepth = 0
    for (const child of node.children) {
      const childDepth = setParents(child, depth + 1)
      child.parent = node
      if (childDepth > maxDepth)
        maxDepth = childDepth
    }
    return maxDepth + 1
  }

  // Include the inputs with size 0 so we can see when something has been tree-shaken
  for (const i in metafile.inputs) {
    accumulatePath(root, stripDisabledPathPrefix(i), 0)
  }

  for (const o in metafile.outputs) {
    // Find the common directory prefix, not including the file name
    const parts = splitPathBySlash(o)
    parts.pop()
    commonPrefix = commonPrefixFinder(parts.join('/'), commonPrefix)
  }

  for (const o in outputs) {
    if (isSourceMapPath(o))
      continue

    const name = commonPrefix ? splitPathBySlash(o).slice(commonPrefix.length).join('/') : o
    const node: TreeNodeInProgress = { text: name, id: '', size: 0, childrenMap: {} }
    const output = outputs[o]
    const inputs = output.inputs
    const bytes = output.bytes

    // Accumulate the input files that contributed to this output file
    for (const i in inputs) {
      accumulatePath(root, stripDisabledPathPrefix(i), inputs[i].bytesInOutput)
    }

    node.size = bytes
    nodes.push(sortChildren(node))
  }

  // Unwrap common nested directories
  stop: while (true) {
    let prefix: string | undefined
    for (const node of nodes) {
      const children = node.children
      if (!children.length)
        continue
      if (children.length > 1 || children[0].children.length !== 1)
        break stop
      const name = children[0].text
      if (prefix === undefined)
        prefix = name
      else if (prefix !== name)
        break stop
    }
    if (prefix === undefined)
      break

    // Remove one level
    for (const node of nodes) {
      let children = node.children
      if (children.length) {
        children = children[0].children
        for (const child of children)
          child.text = prefix + child.text
        node.children = children
      }
    }
  }

  // Add entries for the remaining space in each chunk
  for (const node of nodes) {
    let childBytes = 0
    for (const child of node.children) {
      childBytes += child.size
    }
    if (childBytes < node.size) {
      node.children.push({
        text: '(unassigned)',
        id: '',
        subtext: bytesToText(node.size - childBytes),
        size: node.size - childBytes,
        children: [],
        parent: node,
      })
    }
  }

  nodes.sort(orderChildrenBySize)

  const finalRoot = sortChildren(root)
  return {
    root: finalRoot,
    maxDepth: setParents(finalRoot, 0),
  }
}

export interface TreeNodeInProgress {
  text: string
  id: string
  size: number
  childrenMap: Record<string, TreeNodeInProgress>
}

export function orderChildrenBySize(
  a: { size: number, id: string },
  b: { size: number, id: string },
): number {
  return b.size - a.size || +(a.id > b.id) - +(a.id < b.id)
}

export function accumulatePath(root: TreeNodeInProgress, path: string, bytesInOutput: number): number {
  const parts = splitPathBySlash(path)
  const n = parts.length
  let parent = root
  let inputPath = ''
  root.size += bytesInOutput

  for (let i = 0; i < n; i++) {
    const part = parts[i]
    const children = parent.childrenMap
    let child = children[part]
    const name = part + (i + 1 < n ? '/' : '')
    inputPath += name

    if (!Object.prototype.hasOwnProperty.call(children, part)) {
      child = {
        text: name,
        id: inputPath,
        size: 0,
        childrenMap: {},
      }
      children[part] = child
    }

    child.size += bytesInOutput
    parent = child
  }

  return n
}
