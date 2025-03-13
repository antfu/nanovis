import type { Metafile } from './metafile'
import type { Tree, TreeNode } from './types'
import { bytesToText, commonPrefixFinder, hasOwnProperty, isSourceMapPath, splitPathBySlash, stripDisabledPathPrefix } from './helpers'

export function analyzeDirectoryTree(metafile: Metafile): Tree {
  const outputs = metafile.outputs
  const nodes: TreeNode[] = []
  let commonPrefix: string[] | undefined
  const root: TreeNodeInProgress = { name_: '', inputPath_: '', bytesInOutput_: 0, children_: {} }

  const sortChildren = (node: TreeNodeInProgress, isOutputFile: boolean): TreeNode => {
    const children = node.children_
    const sorted: TreeNode[] = []
    for (const file in children) {
      sorted.push(sortChildren(children[file], false))
    }
    return {
      name_: node.name_,
      inputPath_: node.inputPath_,
      sizeText_: bytesToText(node.bytesInOutput_),
      bytesInOutput_: node.bytesInOutput_,
      sortedChildren_: sorted.sort(orderChildrenBySize),
      isOutputFile_: isOutputFile,
      parent_: null,
    }
  }

  const setParents = (node: TreeNode, depth: number): number => {
    let maxDepth = 0
    for (const child of node.sortedChildren_) {
      const childDepth = setParents(child, depth + 1)
      child.parent_ = node
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
    const node: TreeNodeInProgress = { name_: name, inputPath_: '', bytesInOutput_: 0, children_: {} }
    const output = outputs[o]
    const inputs = output.inputs
    const bytes = output.bytes

    // Accumulate the input files that contributed to this output file
    for (const i in inputs) {
      accumulatePath(root, stripDisabledPathPrefix(i), inputs[i].bytesInOutput)
    }

    node.bytesInOutput_ = bytes
    nodes.push(sortChildren(node, true))
  }

  // Unwrap common nested directories
  stop: while (true) {
    let prefix: string | undefined
    for (const node of nodes) {
      const children = node.sortedChildren_
      if (!children.length)
        continue
      if (children.length > 1 || children[0].sortedChildren_.length !== 1)
        break stop
      const name = children[0].name_
      if (prefix === undefined)
        prefix = name
      else if (prefix !== name)
        break stop
    }
    if (prefix === undefined)
      break

    // Remove one level
    for (const node of nodes) {
      let children = node.sortedChildren_
      if (children.length) {
        children = children[0].sortedChildren_
        for (const child of children)
          child.name_ = prefix + child.name_
        node.sortedChildren_ = children
      }
    }
  }

  // Add entries for the remaining space in each chunk
  for (const node of nodes) {
    let childBytes = 0
    for (const child of node.sortedChildren_) {
      childBytes += child.bytesInOutput_
    }
    if (childBytes < node.bytesInOutput_) {
      node.sortedChildren_.push({
        name_: '(unassigned)',
        inputPath_: '',
        sizeText_: bytesToText(node.bytesInOutput_ - childBytes),
        bytesInOutput_: node.bytesInOutput_ - childBytes,
        sortedChildren_: [],
        isOutputFile_: false,
        parent_: node,
      })
    }
  }

  nodes.sort(orderChildrenBySize)

  const finalRoot = sortChildren(root, false)
  return {
    root_: finalRoot,
    maxDepth_: setParents(finalRoot, 0),
  }
}

export interface TreeNodeInProgress {
  name_: string
  inputPath_: string
  bytesInOutput_: number
  children_: Record<string, TreeNodeInProgress>
}

export function orderChildrenBySize(a: { inputPath_: string, bytesInOutput_: number }, b: { inputPath_: string, bytesInOutput_: number }): number {
  return b.bytesInOutput_ - a.bytesInOutput_ || +(a.inputPath_ > b.inputPath_) - +(a.inputPath_ < b.inputPath_)
}

export function accumulatePath(root: TreeNodeInProgress, path: string, bytesInOutput: number): number {
  const parts = splitPathBySlash(path)
  const n = parts.length
  let parent = root
  let inputPath = ''
  root.bytesInOutput_ += bytesInOutput

  for (let i = 0; i < n; i++) {
    const part = parts[i]
    const children = parent.children_
    let child = children[part]
    const name = part + (i + 1 < n ? '/' : '')
    inputPath += name

    if (!hasOwnProperty.call(children, part)) {
      child = {
        name_: name,
        inputPath_: inputPath,
        bytesInOutput_: 0,
        children_: {},
      }
      children[part] = child
    }

    child.bytesInOutput_ += bytesInOutput
    parent = child
  }

  return n
}
