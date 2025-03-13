import { hasOwnProperty, splitPathBySlash } from "./helpers"

export interface TreeNodeInProgress {
  name_: string
  inputPath_: string
  bytesInOutput_: number
  children_: Record<string, TreeNodeInProgress>
}

export function orderChildrenBySize (a: { inputPath_: string, bytesInOutput_: number },
  b: { inputPath_: string, bytesInOutput_: number }): number {
  return b.bytesInOutput_ - a.bytesInOutput_ || +(a.inputPath_ > b.inputPath_) - +(a.inputPath_ < b.inputPath_)
}

export function accumulatePath (root: TreeNodeInProgress, path: string, bytesInOutput: number): number {
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
