import type { ColorValue, Palette } from './color'

export interface TreeNode<T> {
  id: string
  text: string
  subtext?: string
  size: number
  color?: ColorValue
  children: TreeNode<T>[]
  parent?: TreeNode<T>
  meta?: T
}

export interface Events<T> {
  hover: (node: TreeNode<T> | null, e?: MouseEvent) => void
  click: (node: TreeNode<T>, e: MouseEvent) => void
  select: (node: TreeNode<T> | null) => void
  leave: (e?: MouseEvent) => void
}

export interface Tree<T> {
  root: TreeNode<T>
  maxDepth: number
}

export interface GraphBaseOptions<T> {
  getColor?: (node: TreeNode<T>) => ColorValue | undefined
  getText?: (node: TreeNode<T>) => string | undefined
  getSubtext?: (node: TreeNode<T>) => string | undefined
  palette?: Partial<Palette>
  animate?: boolean
  animateDuration?: number

  onHover?: Events<T>['hover']
  onClick?: Events<T>['click']
  onLeave?: Events<T>['leave']
  onSelect?: Events<T>['select']
}
