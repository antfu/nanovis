import type { ColorValue, Palette } from './color'

/**
 * Input TreeNode, can be normalized with `normalizeTreeNode`
 */
export type TreeNodeInput<T = undefined> = Exclude<Partial<TreeNode<T>>, 'children'> & {
  children?: TreeNodeInput<T>[]
}

/**
 *  Normalized TreeNode, can be created with `normalizeTreeNode` from a more flexible input.
 */
export interface TreeNode<T = undefined> {
  /**
   * Id of the node, should be unique within the tree.
   * If created with `normalizeTreeNode`, this is will be generated with random string if not provided.
   */
  id: string
  /**
   * Text to display for the node.
   */
  text?: string
  /**
   * Subtext to display for the node.
   */
  subtext?: string
  /**
   * The size of the node itself, not including its children.
   */
  sizeSelf: number
  /**
   * Size of the node, used to calculate the area of the node.
   * For a node with children, this is the size should be the sum of the sizes of all children.
   * When creating the treeNode With `normalizeTreeNode`, this is calculated automatically.
   */
  size: number
  /**
   * Color of the node, used to color the node.
   */
  color?: ColorValue
  /**
   * Children of the node. Should be sorted by size in descending order.
   */
  children: TreeNode<T>[]
  /**
   * Parent of the node.
   */
  parent?: TreeNode<T>
  /**
   * Arbitrary metadata held by the node.
   */
  meta?: T
}

export interface Events<T = undefined> {
  hover: (node: TreeNode<T> | null, e?: MouseEvent) => void
  click: (node: TreeNode<T>, e: MouseEvent) => void
  select: (node: TreeNode<T> | null) => void
  leave: (e?: MouseEvent) => void
}

export interface GraphBaseOptions<T = undefined> {
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
