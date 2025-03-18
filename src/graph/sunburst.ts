import type { GraphBaseOptions, TreeNode } from '../types/tree'
import { colorToCanvasFill } from '../utils/color'
import { DEFAULT_GRAPH_OPTIONS } from '../utils/defaults'
import {
  bytesToText,
  now,
  useResizeEventListener,
  useWheelEventListener,
} from '../utils/helpers'
import { CONSTANT_BOLD_FONT, GraphBase } from './base'

// eslint-disable-next-line no-restricted-syntax
const enum FLAGS {
  ROOT = 1,
  FILL = 2,
  CHAIN = 4,
  HOVER = 8,
}

function isParentOf(parent: TreeNode<any>, child: TreeNode<any> | undefined): boolean {
  while (child) {
    if (child === parent)
      return true
    child = child.parent
  }
  return false
}

interface Slice {
  depth_: number
  startAngle_: number
  sweepAngle_: number
}

function narrowSlice(root: TreeNode<any>, node: TreeNode<any>, slice: Slice): void {
  if (root === node)
    return

  const parent = node.parent!
  const totalBytes = parent.size || 1 // Don't divide by 0
  let bytesSoFar = 0
  narrowSlice(root, parent, slice)

  for (const child of parent.children) {
    if (child === node) {
      slice.startAngle_ += slice.sweepAngle_ * bytesSoFar / totalBytes
      slice.sweepAngle_ = child.size / totalBytes * slice.sweepAngle_
      break
    }
    bytesSoFar += child.size
  }

  slice.depth_ += 1
}

const baseRadiusCache: Record<number, number> = {}
function baseRadius(depth: number): number {
  if (!baseRadiusCache[depth])
    baseRadiusCache[depth] = 50 * 8 * Math.log(1 + Math.log(1 + depth / 8))
  return baseRadiusCache[depth]
}

export interface CreateSunburstOptions<T> extends GraphBaseOptions<T> {
}

const START_ANGLE = -Math.PI / 2

export class Sunburst<T> extends GraphBase<T, CreateSunburstOptions<T>> {
  private currentNode: TreeNode<T>
  private hoveredNode: TreeNode<T> | undefined

  private centerX = 0
  private centerY = 0
  private animationStart = 0
  private radiusScale = 1

  private sourceDepth = 0
  private sourceStartAngle = START_ANGLE
  private sourceSweepAngle = Math.PI * 2

  private targetNode: TreeNode<T>
  private targetDepth = this.sourceDepth
  private targetStartAngle = this.sourceStartAngle
  private targetSweepAngle = this.sourceSweepAngle

  private animatedNode: TreeNode<T>
  private animatedDepth = this.sourceDepth
  private animatedStartAngle = this.sourceStartAngle
  private animatedSweepAngle = this.sourceSweepAngle

  private previousHoveredNode: TreeNode<T> | undefined
  private historyStack: TreeNode<T>[] = []

  constructor(tree: TreeNode<T>, options: CreateSunburstOptions<T> = {}) {
    while (tree.children.length === 1) {
      tree = tree.children[0]
    }
    super(tree, options)

    this.currentNode = tree
    this.targetNode = this.currentNode
    this.animatedNode = this.currentNode

    this.canvas.onmousemove = (e) => {
      this.handleMouseMove(e)
    }

    this.canvas.onmouseout = (e) => {
      this.changeHoveredNode(undefined)
      this.events.emit('hover', null, e)
    }

    this.canvas.onclick = (e) => {
      let node = this.hitTestNode(e)
      if (!node)
        return
      this.events.emit('click', node, e)

      let stack: TreeNode<T>[] = []

      // Handle clicking in the middle node
      if (node !== this.animatedNode.parent) {
        stack = this.historyStack.concat(this.currentNode)
      }
      else if (this.historyStack.length > 0) {
        node = this.historyStack.pop()!
        stack = this.historyStack.slice()
      }

      this.events.emit('click', node, e)
      if (node.children.length > 0) {
        this.select(node)
        this.historyStack = stack
      }
      else {
        e.preventDefault() // Prevent the browser from removing the focus on the dialog
      }
    }

    this.el.append(this.canvas)

    this.resize()
    Promise.resolve().then(() => this.resize())
    this.disposables.push(useResizeEventListener(() => this.resize()))
    this.disposables.push(useWheelEventListener(e => this.handleMouseMove(e)))
  }

  public override select(node: TreeNode<T> | null, animate?: boolean): void {
    node = node || this.root
    if (this.currentNode !== node) {
      this.currentNode = node
      this.updateSunburst(animate)
      this.events.emit('select', node)
    }
  }

  public override resize(): void {
    this.width = this.el.clientWidth
    this.height = this.width
    this.centerX = this.width >> 1
    this.centerY = this.height >> 1

    const maxRadius = 2 * Math.ceil(baseRadius(this.maxDepth))
    this.radiusScale = this.width / maxRadius
    super.resize()
  }

  public override draw(): void {
    this.c.clearRect(0, 0, this.width, this.height)

    // Draw the fill first
    this.drawNode(this.animatedNode, this.animatedDepth, this.computeRadius(this.animatedDepth), this.animatedStartAngle, this.animatedSweepAngle, FLAGS.ROOT | FLAGS.FILL, -Infinity)

    // Draw the stroke second
    this.c.strokeStyle = this.palette.stroke
    this.c.beginPath()
    this.drawNode(this.animatedNode, this.animatedDepth, this.computeRadius(this.animatedDepth), this.animatedStartAngle, this.animatedSweepAngle, FLAGS.ROOT, -Infinity)
    this.c.stroke()

    // Draw the size of the current node in the middle
    if (this.animatedDepth === 0) {
      this.c.fillStyle = this.palette.stroke
      this.setFont(CONSTANT_BOLD_FONT)
      this.c.textAlign = 'center'
      this.c.fillText(bytesToText(this.targetNode.size), this.centerX, this.centerY)
    }
  }

  // We want to avoid overlapping strokes from lots of really small adjacent
  // slices all merging together into a solid color. So we enforce a
  // minimum slice width of 2px and we also skip drawing slices that
  // have a tail edge less than 1.5px from the previous tail edge.
  private drawNode(node: TreeNode<T>, depth: number, innerRadius: number, startAngle: number, sweepAngle: number, flags: FLAGS, prevTailEdge: number): number {
    const outerRadius = this.computeRadius(depth + 1)
    if (outerRadius > this.centerY)
      return prevTailEdge // Don't draw slices that fall outside the canvas bounds

    if (node === this.hoveredNode) {
      flags |= FLAGS.HOVER
    }

    const middleRadius = (innerRadius + outerRadius) / 2
    const tailEdge = startAngle + sweepAngle
    if (tailEdge - prevTailEdge < 1.5 / middleRadius)
      return prevTailEdge
    let clampedSweepAngle = 2 / middleRadius
    if (sweepAngle > clampedSweepAngle)
      clampedSweepAngle = sweepAngle

    // Handle the fill
    if (flags & FLAGS.FILL) {
      this.c.fillStyle = colorToCanvasFill(this.getColor(node) || this.palette.fallback, this.c, this.centerX, this.centerY, 1)
      this.c.beginPath()
      this.c.arc(this.centerX, this.centerY, innerRadius, startAngle, startAngle + clampedSweepAngle, false)
      this.c.arc(this.centerX, this.centerY, outerRadius, startAngle + clampedSweepAngle, startAngle, true)
      this.c.fill()
      if (this.hoveredNode && (flags & FLAGS.HOVER || node.parent === this.hoveredNode)) {
        this.c.fillStyle = this.palette.hover
        this.c.fill()
      }
    }

    // Handle the stroke
    else {
      const isFullCircle = clampedSweepAngle === Math.PI * 2
      const moveToRadius = flags & FLAGS.CHAIN || isFullCircle ? outerRadius : innerRadius
      if (flags & FLAGS.ROOT && innerRadius > 0)
        this.c.arc(this.centerX, this.centerY, innerRadius, startAngle + clampedSweepAngle, startAngle, true)
      this.c.moveTo(this.centerX + moveToRadius * Math.cos(startAngle), this.centerY + moveToRadius * Math.sin(startAngle))
      this.c.arc(this.centerX, this.centerY, outerRadius, startAngle, startAngle + clampedSweepAngle, false)
      if (!isFullCircle)
        this.c.lineTo(this.centerX + innerRadius * Math.cos(startAngle + clampedSweepAngle), this.centerY + innerRadius * Math.sin(startAngle + clampedSweepAngle))
    }

    const totalBytes = node.size
    let childFlags = flags & (FLAGS.FILL | FLAGS.HOVER)
    let bytesSoFar = 0
    let childTailEdge = -Infinity

    for (const child of node.children) {
      childTailEdge = this.drawNode(child, depth + 1, outerRadius, startAngle + sweepAngle * bytesSoFar / totalBytes, child.size / totalBytes * sweepAngle, childFlags, childTailEdge)
      bytesSoFar += child.size
      childFlags |= FLAGS.CHAIN
    }

    return tailEdge
  }

  private changeHoveredNode(node: TreeNode<T> | undefined, animate?: boolean): void {
    if (this.hoveredNode !== node) {
      this.hoveredNode = node
      this.updateSunburst(animate)
    }
  }

  private hitTestNode(mouseEvent: MouseEvent): TreeNode<T> | undefined {
    let x = mouseEvent.pageX
    let y = mouseEvent.pageY
    for (let el: HTMLElement | null = this.canvas; el; el = el.offsetParent as HTMLElement | null) {
      x -= el.offsetLeft
      y -= el.offsetTop
    }

    x -= this.centerX
    y -= this.centerY
    const mouseRadius = Math.sqrt(x * x + y * y)
    const mouseAngle = Math.atan2(y, x)

    const visit = (node: TreeNode<T>, depth: number, innerRadius: number, startAngle: number, sweepAngle: number): TreeNode<T> | undefined => {
      const outerRadius = this.computeRadius(depth + 1)
      if (outerRadius > this.centerY)
        return undefined // Don't draw slices that fall outside the canvas bounds

      // Hit-test the current node
      if (mouseRadius >= innerRadius && mouseRadius < outerRadius) {
        let deltaAngle = mouseAngle - startAngle
        deltaAngle /= Math.PI * 2
        deltaAngle -= Math.floor(deltaAngle)
        deltaAngle *= Math.PI * 2
        if (deltaAngle < sweepAngle) {
          if (node === this.animatedNode)
            return node.parent
          return node
        }
      }

      const totalBytes = node.size
      let bytesSoFar = 0

      // Hit-test the children
      for (const child of node.children) {
        const hit = visit(child, depth + 1, outerRadius, startAngle + sweepAngle * bytesSoFar / totalBytes, child.size / totalBytes * sweepAngle)
        if (hit)
          return hit
        bytesSoFar += child.size
      }

      return undefined
    }

    return visit(this.animatedNode, this.animatedDepth, this.computeRadius(this.animatedDepth), this.animatedStartAngle, this.animatedSweepAngle)
  }

  override tick(): void {
    let t = (now() - this.animationStart) / (this.options.animateDuration ?? DEFAULT_GRAPH_OPTIONS.animateDuration)

    if (t < 0 || t > 1) {
      t = 1
      this.animatedNode = this.targetNode
      this.targetDepth = 0
      this.targetStartAngle = START_ANGLE
      this.targetSweepAngle = Math.PI * 2
    }
    else {
      // Use a cubic "ease-in-out" curve
      if (t < 0.5) {
        t *= 4 * t * t
      }
      else {
        t = 1 - t
        t *= 4 * t * t
        t = 1 - t
      }
      this.invalidate()
    }

    this.animatedDepth = this.sourceDepth + (this.targetDepth - this.sourceDepth) * t
    this.animatedStartAngle = this.sourceStartAngle + (this.targetStartAngle - this.sourceStartAngle) * t
    this.animatedSweepAngle = this.sourceSweepAngle + (this.targetSweepAngle - this.sourceSweepAngle) * t

    this.draw()
  }

  private handleMouseMove(e: MouseEvent): void {
    const node = this.hitTestNode(e)
    this.changeHoveredNode(node)

    // Show a tooltip for hovered nodes
    if (node && node !== this.animatedNode.parent) {
      this.events.emit('hover', node, e)
      this.canvas.style.cursor = 'pointer'
    }
    else {
      this.events.emit('hover', null, e)
    }
  }

  private computeRadius(depth: number): number {
    return baseRadius(depth) * this.radiusScale
  }

  private updateSunburst(animate: boolean = this.options.animate ?? true): void {
    if (this.previousHoveredNode !== this.hoveredNode) {
      this.previousHoveredNode = this.hoveredNode
      if (!this.hoveredNode) {
        this.canvas.style.cursor = 'auto'
        this.events.emit('hover', null)
      }
      this.invalidate()
    }

    if (this.targetNode === this.currentNode)
      return
    this.historyStack.length = 0

    this.invalidate()

    if (animate) {
      this.animationStart = now()
    }

    // Animate from parent to child
    if (isParentOf(this.animatedNode, this.currentNode)) {
      const slice: Slice = {
        depth_: this.animatedDepth,
        startAngle_: this.animatedStartAngle,
        sweepAngle_: this.animatedSweepAngle,
      }
      narrowSlice(this.animatedNode, this.currentNode, slice)
      this.animatedDepth = slice.depth_
      this.animatedStartAngle = slice.startAngle_
      this.animatedSweepAngle = slice.sweepAngle_
      this.targetDepth = 0
      this.targetStartAngle = START_ANGLE
      this.targetSweepAngle = Math.PI * 2
      this.animatedNode = this.currentNode
    }

    // Animate from child to parent
    else if (isParentOf(this.currentNode, this.animatedNode)) {
      const slice: Slice = {
        depth_: 0,
        startAngle_: START_ANGLE,
        sweepAngle_: Math.PI * 2,
      }
      narrowSlice(this.currentNode, this.animatedNode, slice)
      this.targetDepth = slice.depth_
      this.targetStartAngle = slice.startAngle_
      this.targetSweepAngle = slice.sweepAngle_
    }
    else {
      this.animationStart = -Infinity
      this.animatedNode = this.currentNode
    }

    this.sourceDepth = this.animatedDepth
    this.sourceStartAngle = this.animatedStartAngle
    this.sourceSweepAngle = this.animatedSweepAngle
    this.targetNode = this.currentNode
    this.events.emit('select', this.currentNode)
  }
}
