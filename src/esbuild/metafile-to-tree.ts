import type { TreeNode, TreeNodeInput } from '../types/tree'
import type { Metafile } from './metafile'
import { bytesToText } from '../utils/helpers'
import { normalizeTreeNode } from '../utils/tree'
import { commonPrefixFinder, isSourceMapPath, splitPathBySlash, stripDisabledPathPrefix } from './helpers'

export function esbuildMetafileToTree<T>(metafile: Metafile): TreeNode<T> {
  const outputs = metafile.outputs
  const nodes: TreeNodeInput<T>[] = []
  let commonPrefix: string[] | undefined
  const root: TreeNodeInProgress = { text: '<Root>', id: '<root>', size: 0, childrenMap: {} }

  const sortChildren = (node: TreeNodeInProgress): TreeNodeInput<T> => {
    const children = node.childrenMap
    const sorted: TreeNodeInput<T>[] = []
    for (const file in children) {
      sorted.push(sortChildren(children[file]))
    }
    return <TreeNodeInput<T>>{
      text: node.text,
      id: node.id,
      subtext: bytesToText(node.size),
      // sizeSelf: node.size,
      size: node.size,
      children: sorted,
    }
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
      const children = node.children || []
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
      let children = node.children || []
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
    for (const child of node.children || []) {
      childBytes += child.size
    }
    if (childBytes < node.size!) {
      node.children!.push({
        text: '(unassigned)',
        id: '',
        subtext: bytesToText(node.size! - childBytes),
        size: node.size! - childBytes,
        children: [],
      })
    }
  }
  return normalizeTreeNode(sortChildren(root))
}

export interface TreeNodeInProgress {
  text: string
  id: string
  size: number
  childrenMap: Record<string, TreeNodeInProgress>
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
