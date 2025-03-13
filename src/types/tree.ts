export interface TreeNode {
  text: string
  id: string
  subtext: string
  size: number
  children: TreeNode[]
  parent: TreeNode | null
  isOutput: boolean
}

export interface Events {
  hover: (node: TreeNode | null, e?: MouseEvent) => void
  click: (node: TreeNode, e: MouseEvent) => void
}

export interface Tree {
  root: TreeNode
  maxDepth: number
}
