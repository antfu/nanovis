export interface TreeNode<T> {
  text: string
  id: string
  subtext: string
  size: number
  children: TreeNode<T>[]
  parent: TreeNode<T> | null
  isOutput: boolean
  meta?: T
}

export interface Events<T> {
  hover: (node: TreeNode<T> | null, e?: MouseEvent) => void
  click: (node: TreeNode<T>, e: MouseEvent) => void
}

export interface Tree<T> {
  root: TreeNode<T>
  maxDepth: number
}
