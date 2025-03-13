export interface TreeNode {
  name_: string
  inputPath_: string
  sizeText_: string
  bytesInOutput_: number
  sortedChildren_: TreeNode[]
  isOutputFile_: boolean
  parent_: TreeNode | null
}

export interface Events {
  hover: (node: TreeNode | null, e?: MouseEvent) => void
  click: (node: TreeNode, e: MouseEvent) => void
}

export interface Tree {
  root_: TreeNode
  maxDepth_: number
}
