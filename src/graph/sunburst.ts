import type { GraphBase, GraphBaseOptions, Tree, TreeNode } from '../types/tree'
import { colorToCanvasFill } from '../utils/color'
import {
  bytesToText,
  now,
  useResizeEventListener,
  useWheelEventListener,
} from '../utils/helpers'
import { createGraphContext } from './context'

const CONSTANT_ANIMATION_DURATION = 350

// eslint-disable-next-line no-restricted-syntax
const enum FLAGS {
  ROOT = 1,
  FILL = 2,
  CHAIN = 4,
  HOVER = 8,
}

function isParentOf(parent: TreeNode<any>, child: TreeNode<any> | null): boolean {
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

function computeRadius(depth: number): number {
  return 50 * 8 * Math.log(1 + Math.log(1 + depth / 8))
}

export interface CreateSunburstOptions<T> extends GraphBaseOptions<T> {
}

export function createSunburst<T>(tree: Tree<T>, options: CreateSunburstOptions<T> = {}) {
  const {
    getColor,
    events,
    disposables,
    dispose,
    el,
    palette,
  } = createGraphContext(tree, options)

  while (tree.root.children.length === 1) {
    tree = {
      root: tree.root.children[0],
      maxDepth: tree.maxDepth - 1,
    }
  }

  let currentNode = tree.root
  let hoveredNode: TreeNode<T> | null = null

  const changeCurrentNode = (node: TreeNode<T>, e: MouseEvent): void => {
    if (currentNode !== node) {
      currentNode = node
      updateSunburst()
      events.emit('click', node, e)
    }
  }

  const changeHoveredNode = (node: TreeNode<T> | null): void => {
    if (hoveredNode !== node) {
      hoveredNode = node
      updateSunburst()
    }
  }

  const canvas = document.createElement('canvas')
  const c = canvas.getContext('2d')!

  function resize(): void {
    const maxRadius = 2 * Math.ceil(computeRadius(tree.maxDepth))
    const ratio = window.devicePixelRatio || 1
    width = Math.min(Math.round(innerWidth * 0.4), maxRadius)
    height = width
    centerX = width >> 1
    centerY = height >> 1
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    c.scale(ratio, ratio)
    draw()
  }

  // We want to avoid overlapping strokes from lots of really small adjacent
  // slices all merging together into a solid color. So we enforce a
  // minimum slice width of 2px and we also skip drawing slices that
  // have a tail edge less than 1.5px from the previous tail edge.
  function drawNode(node: TreeNode<T>, depth: number, innerRadius: number, startAngle: number, sweepAngle: number, flags: FLAGS, prevTailEdge: number): number {
    const outerRadius = computeRadius(depth + 1)
    if (outerRadius > centerY)
      return prevTailEdge // Don't draw slices that fall outside the canvas bounds

    if (node === hoveredNode) {
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
      c.fillStyle = colorToCanvasFill(getColor(node) || palette.fallback, c, centerX, centerY, 1)
      c.beginPath()
      c.arc(centerX, centerY, innerRadius, startAngle, startAngle + clampedSweepAngle, false)
      c.arc(centerX, centerY, outerRadius, startAngle + clampedSweepAngle, startAngle, true)
      c.fill()
      if (hoveredNode && (flags & FLAGS.HOVER || node.parent === hoveredNode)) {
        c.fillStyle = palette.hover
        c.fill()
      }
    }

    // Handle the stroke
    else {
      const isFullCircle = clampedSweepAngle === Math.PI * 2
      const moveToRadius = flags & FLAGS.CHAIN || isFullCircle ? outerRadius : innerRadius
      if (flags & FLAGS.ROOT && innerRadius > 0)
        c.arc(centerX, centerY, innerRadius, startAngle + clampedSweepAngle, startAngle, true)
      c.moveTo(centerX + moveToRadius * Math.cos(startAngle), centerY + moveToRadius * Math.sin(startAngle))
      c.arc(centerX, centerY, outerRadius, startAngle, startAngle + clampedSweepAngle, false)
      if (!isFullCircle)
        c.lineTo(centerX + innerRadius * Math.cos(startAngle + clampedSweepAngle), centerY + innerRadius * Math.sin(startAngle + clampedSweepAngle))
    }

    const totalBytes = node.size
    let childFlags = flags & (FLAGS.FILL | FLAGS.HOVER)
    let bytesSoFar = 0
    let childTailEdge = -Infinity

    for (const child of node.children) {
      childTailEdge = drawNode(child, depth + 1, outerRadius, startAngle + sweepAngle * bytesSoFar / totalBytes, child.size / totalBytes * sweepAngle, childFlags, childTailEdge)
      bytesSoFar += child.size
      childFlags |= FLAGS.CHAIN
    }

    return tailEdge
  }

  function draw(): void {
    c.clearRect(0, 0, width, height)

    // Draw the fill first
    drawNode(animatedNode, animatedDepth, computeRadius(animatedDepth), animatedStartAngle, animatedSweepAngle, FLAGS.ROOT | FLAGS.FILL, -Infinity)

    // Draw the stroke second
    c.strokeStyle = palette.stroke
    c.beginPath()
    drawNode(animatedNode, animatedDepth, computeRadius(animatedDepth), animatedStartAngle, animatedSweepAngle, FLAGS.ROOT, -Infinity)
    c.stroke()

    // Draw the size of the current node in the middle
    if (animatedDepth === 0) {
      c.fillStyle = palette.stroke
      c.font = 'bold 16px sans-serif'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(bytesToText(targetNode.size), centerX, centerY)
    }
  }

  const START_ANGLE = -Math.PI / 2
  let width = 0
  let height = 0
  let centerX = 0
  let centerY = 0

  let animationFrame: number | null = null
  let animationStart = 0

  let sourceDepth = 0
  let sourceStartAngle = START_ANGLE
  let sourceSweepAngle = Math.PI * 2

  let targetNode = currentNode
  let targetDepth = sourceDepth
  let targetStartAngle = sourceStartAngle
  let targetSweepAngle = sourceSweepAngle

  let animatedNode = currentNode
  let animatedDepth = sourceDepth
  let animatedStartAngle = sourceStartAngle
  let animatedSweepAngle = sourceSweepAngle

  function hitTestNode(mouseEvent: MouseEvent): TreeNode<T> | null {
    function visit(node: TreeNode<T>, depth: number, innerRadius: number, startAngle: number, sweepAngle: number): TreeNode<T> | null {
      const outerRadius = computeRadius(depth + 1)
      if (outerRadius > centerY)
        return null // Don't draw slices that fall outside the canvas bounds

      // Hit-test the current node
      if (mouseRadius >= innerRadius && mouseRadius < outerRadius) {
        let deltaAngle = mouseAngle - startAngle
        deltaAngle /= Math.PI * 2
        deltaAngle -= Math.floor(deltaAngle)
        deltaAngle *= Math.PI * 2
        if (deltaAngle < sweepAngle) {
          if (node === animatedNode)
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

      return null
    }

    let x = mouseEvent.pageX
    let y = mouseEvent.pageY
    for (let el: HTMLElement | null = canvas; el; el = el.offsetParent as HTMLElement | null) {
      x -= el.offsetLeft
      y -= el.offsetTop
    }

    x -= centerX
    y -= centerY
    let mouseRadius = Math.sqrt(x * x + y * y)
    let mouseAngle = Math.atan2(y, x)
    return visit(animatedNode, animatedDepth, computeRadius(animatedDepth), animatedStartAngle, animatedSweepAngle)
  }

  function tick(): void {
    let t = (now() - animationStart) / CONSTANT_ANIMATION_DURATION

    if (t < 0 || t > 1) {
      t = 1
      animationFrame = null
      animatedNode = targetNode
      targetDepth = 0
      targetStartAngle = START_ANGLE
      targetSweepAngle = Math.PI * 2
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
      animationFrame = requestAnimationFrame(tick)
    }

    animatedDepth = sourceDepth + (targetDepth - sourceDepth) * t
    animatedStartAngle = sourceStartAngle + (targetStartAngle - sourceStartAngle) * t
    animatedSweepAngle = sourceSweepAngle + (targetSweepAngle - sourceSweepAngle) * t

    draw()
  }

  let previousHoveredNode: TreeNode<T> | null = null
  let historyStack: TreeNode<T>[] = []
  function handleMouseMove(e: MouseEvent): void {
    const node = hitTestNode(e)
    changeHoveredNode(node)

    // Show a tooltip for hovered nodes
    if (node && node !== animatedNode.parent) {
      events.emit('hover', node, e)
      canvas.style.cursor = 'pointer'
    }
    else {
      events.emit('hover', null, e)
    }
  }

  resize()
  disposables.push(useResizeEventListener(resize))
  disposables.push(useWheelEventListener(handleMouseMove))

  canvas.onmousemove = (e) => {
    handleMouseMove(e)
  }

  canvas.onmouseout = (e) => {
    changeHoveredNode(null)
    events.emit('hover', null, e)
  }

  canvas.onclick = (e) => {
    let node = hitTestNode(e)
    if (!node)
      return
    events.emit('click', node, e)

    let stack: TreeNode<T>[] = []

    // Handle clicking in the middle node
    if (node !== animatedNode.parent) {
      stack = historyStack.concat(currentNode)
    }
    else if (historyStack.length > 0) {
      node = historyStack.pop()!
      stack = historyStack.slice()
    }

    if (node.children.length > 0) {
      changeCurrentNode(node, e)
      historyStack = stack
    }
    else {
      e.preventDefault() // Prevent the browser from removing the focus on the dialog
      events.emit('click', node, e)
    }
  }

  const updateSunburst = () => {
    if (previousHoveredNode !== hoveredNode) {
      previousHoveredNode = hoveredNode
      if (!hoveredNode) {
        canvas.style.cursor = 'auto'
        events.emit('hover', null)
      }
      if (animationFrame === null)
        animationFrame = requestAnimationFrame(tick)
    }

    if (targetNode === currentNode)
      return
    historyStack.length = 0

    if (animationFrame === null)
      animationFrame = requestAnimationFrame(tick)
    animationStart = now()

    // Animate from parent to child
    if (isParentOf(animatedNode, currentNode)) {
      const slice: Slice = {
        depth_: animatedDepth,
        startAngle_: animatedStartAngle,
        sweepAngle_: animatedSweepAngle,
      }
      narrowSlice(animatedNode, currentNode, slice)
      animatedDepth = slice.depth_
      animatedStartAngle = slice.startAngle_
      animatedSweepAngle = slice.sweepAngle_
      targetDepth = 0
      targetStartAngle = START_ANGLE
      targetSweepAngle = Math.PI * 2
      animatedNode = currentNode
    }

    // Animate from child to parent
    else if (isParentOf(currentNode, animatedNode)) {
      const slice: Slice = {
        depth_: 0,
        startAngle_: START_ANGLE,
        sweepAngle_: Math.PI * 2,
      }
      narrowSlice(currentNode, animatedNode, slice)
      targetDepth = slice.depth_
      targetStartAngle = slice.startAngle_
      targetSweepAngle = slice.sweepAngle_
    }

    else {
      animationStart = -Infinity
      animatedNode = currentNode
    }

    sourceDepth = animatedDepth
    sourceStartAngle = animatedStartAngle
    sourceSweepAngle = animatedSweepAngle
    targetNode = currentNode
  }

  el.append(canvas)

  return {
    el,
    events,
    draw,
    resize,
    dispose,
    [Symbol.dispose]: dispose,
  } satisfies GraphBase<T>
}
