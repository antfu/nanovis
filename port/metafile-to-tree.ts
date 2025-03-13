import type { Metafile } from './metafile'
import type { TreeNodeInProgress } from './tree'
import { bytesToText, commonPrefixFinder, isSourceMapPath, splitPathBySlash, stripDisabledPathPrefix } from './helpers'
import { accumulatePath, orderChildrenBySize } from './tree'

export interface TreeNode {
  name_: string
  inputPath_: string
  sizeText_: string
  bytesInOutput_: number
  sortedChildren_: TreeNode[]
  isOutputFile_: boolean
}

export interface Tree {
  root_: TreeNode
  maxDepth_: number
}

export function analyzeDirectoryTree(metafile: Metafile): Tree {
  const outputs = metafile.outputs
  let totalBytes = 0
  let maxDepth = 0
  const nodes: TreeNode[] = []
  let commonPrefix: string[] | undefined

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
    }
  }

  for (const o in outputs) {
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
      const depth = accumulatePath(node, stripDisabledPathPrefix(i), inputs[i].bytesInOutput)
      if (depth > maxDepth)
        maxDepth = depth
    }

    node.bytesInOutput_ = bytes
    totalBytes += bytes
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
        for (const child of children) child.name_ = prefix + child.name_
        node.sortedChildren_ = children
      }
    }
    maxDepth--
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
      })
    }
  }

  nodes.sort(orderChildrenBySize)
  return {
    root_: {
      name_: '',
      inputPath_: '',
      sizeText_: '',
      bytesInOutput_: totalBytes,
      sortedChildren_: nodes,
      isOutputFile_: false,
    },
    maxDepth_: maxDepth + 1,
  }
}
