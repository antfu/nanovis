import type { GraphBaseOptions, Tree, TreeNode } from '../types/tree'
import { colorToCanvasFill } from '../utils/color'
import { DEFAULT_GRAPH_OPTIONS } from '../utils/defaults'
import {
  now,
  strokeRectWithFirefoxBugWorkaround,
  useResizeEventListener,
  useWheelEventListener,
} from '../utils/helpers'
import { CONSTANT_BOLD_FONT, CONSTANT_NORMAL_FONT, GraphBase } from './base'

// const CONSTANT_MARGIN = 50
const CONSTANT_ROW_HEIGHT = 24
const CONSTANT_TEXT_INDENT = 5
const CONSTANT_FOCUS_PADDING_RATIO = 0.01
const CONSTANT_ZOOMED_OUT_WIDTH = 1000

// eslint-disable-next-line no-restricted-syntax
const enum FLAGS {
  ROOT = 1,
  HOVER = 2,
}

export interface CreateFlamegraphOptions<T> extends GraphBaseOptions<T> {
}

export class Flamegraph<T> extends GraphBase<T, CreateFlamegraphOptions<T>> {
  private mainEl = document.createElement('div')

  private totalBytes: number
  private viewportMin: number
  private viewportMax: number

  private zoomedOutMin = 0
  private zoomedOutWidth = 0
  private prevWheelTime = 0
  private prevWheelWasZoom = false
  private stripeScaleAdjust = 1
  private hoveredNode: TreeNode<T> | null = null
  private selectedNode: TreeNode<T> | null = null
  private nodeStartBytes: Map<string, number> = new Map()

  private animationFromMin = 0
  private animationFromMax = 0
  private animationToMin = 0
  private animationToMax = 0
  private animationStart = 0

  constructor(tree: Tree<T>, userOptions: CreateFlamegraphOptions<T> = {}) {
    super(tree, userOptions)

    this.totalBytes = tree.root.size
    this.viewportMin = this.animationFromMin = this.animationToMin = 0
    this.viewportMax = this.animationFromMax = this.animationToMax = this.totalBytes

    Object.assign(this.mainEl.style, {
      position: 'relative',
    })
    Object.assign(this.canvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
    })

    let didDrag = false

    this.canvas.onmousedown = (e) => {
      didDrag = false

      if (e.button !== 2) {
        let oldX = e.pageX

        const move = (e: MouseEvent): void => {
          const deltaX = e.pageX - oldX
          if (!didDrag && Math.abs(deltaX) < 3)
            return
          didDrag = true
          this.modifyViewport(-deltaX, 0, null)
          oldX = e.pageX
        }

        const up = (): void => {
          document.removeEventListener('mousemove', move)
          document.removeEventListener('mouseup', up)
        }

        e.preventDefault()
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', up)
      }
    }

    this.canvas.onmousemove = (e) => {
      this.updateHover(e)
    }

    this.canvas.onmouseout = () => {
      this.changeHoveredNode(null)
    }

    this.canvas.onclick = (e) => {
      // Don't trigger on mouse up after a drag
      if (didDrag)
        return

      const node = this.hitTestNode(e)
      this.changeHoveredNode(node)
      this.changeSelectedNode(node)
      if (node)
        this.events.emit('click', node, e)
    }

    this.disposables.push(useWheelEventListener((e) => {
      // This compares with the time of the previous zoom to implement "zoom
      // locking" to prevent zoom from changing to scroll if you zoom by
      // flicking on the touchpad with a key pressed but release the key while
      // momentum scrolling is still generating input events.
      const deltaX = e.deltaX
      const deltaY = e.deltaY
      const wheelTime = now()
      const isZoom = wheelTime - this.prevWheelTime < 50 ? this.prevWheelWasZoom : e.ctrlKey || e.metaKey
      this.prevWheelTime = wheelTime
      this.prevWheelWasZoom = isZoom

      // If we're zooming or panning sideways, then don't let the user interact
      // with the page itself. Note that this has to be ">=" not ">" for Chrome.
      if (isZoom || Math.abs(deltaX) >= Math.abs(deltaY)) {
        e.preventDefault()
      }

      this.modifyViewport(deltaX, deltaY, isZoom ? e.pageX : null)
      this.updateHover(e)
    }))

    this.resize()
    Promise.resolve().then(() => this.resize()) // Resize once the element is in the DOM

    this.disposables.push(useResizeEventListener(() => this.resize()))

    this.mainEl.append(this.canvas)
    this.el.append(this.mainEl)
  }

  public override tick(): void {
    let t = (now() - this.animationStart) / (this.options.animateDuration ?? DEFAULT_GRAPH_OPTIONS.animateDuration)

    if (t < 0 || t > 1) {
      t = 1
      this.viewportMin = this.animationToMin
      this.viewportMax = this.animationToMax
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
      this.viewportMin = this.animationFromMin + (this.animationToMin - this.animationFromMin) * t
      this.viewportMax = this.animationFromMax + (this.animationToMax - this.animationFromMax) * t
      this.invalidate()
    }

    this.draw()
  }

  public override draw(): void {
    this.c.clearRect(0, 0, this.width, this.height)
    this.c.textBaseline = 'middle'

    this.drawNode(this.tree.root, 0, 0, -Infinity, FLAGS.ROOT)
  }

  private changeSelectedNode(node: TreeNode<T> | null, animate = this.options.animate ?? DEFAULT_GRAPH_OPTIONS.animate): void {
    if (this.selectedNode === node)
      return
    this.selectedNode = node
    this.events.emit('select', node)
    if (node && this.nodeStartBytes.has(node.id)) {
      let start = this.nodeStartBytes.get(node.id)!
      let end = start + node.size
      start = Math.max(0, start - node.size * CONSTANT_FOCUS_PADDING_RATIO)
      end = Math.min(this.totalBytes, end + node.size * CONSTANT_FOCUS_PADDING_RATIO)
      this.setViewport(start, end, animate)
    }
  }

  public override select(node: TreeNode<T> | null, animate = this.options.animate ?? DEFAULT_GRAPH_OPTIONS.animate): void {
    this.changeSelectedNode(node, animate)
  }

  public override resize(): void {
    this.width = this.el.clientWidth
    this.height = this.tree.maxDepth * CONSTANT_ROW_HEIGHT + 1
    this.zoomedOutMin = (this.width - CONSTANT_ZOOMED_OUT_WIDTH) >> 1
    this.zoomedOutWidth = this.zoomedOutMin + CONSTANT_ZOOMED_OUT_WIDTH
    if (this.zoomedOutMin < 0)
      this.zoomedOutMin = 0
    if (this.zoomedOutWidth > this.width)
      this.zoomedOutWidth = this.width
    this.zoomedOutWidth -= this.zoomedOutMin
    this.stripeScaleAdjust = this.totalBytes / this.zoomedOutWidth
    this.mainEl.style.height = `${this.height}px`
    super.resize()
  }

  // We want to avoid overlapping strokes from lots of really small adjacent
  // rectangles all merging together into a solid color. So we enforce a
  // minimum rectangle width of 2px and we also skip drawing rectangles that
  // have a right edge less than 1.5px from the previous right edge.
  private drawNode(node: TreeNode<T>, y: number, startBytes: number, prevRightEdge: number, flags: FLAGS): number {
    this.nodeStartBytes.set(node.id, startBytes)
    const scale = this.zoomedOutWidth / (this.viewportMax - this.viewportMin)
    const x = this.zoomedOutMin + (startBytes - this.viewportMin) * scale
    const w = node.size * scale
    const rightEdge = x + w
    if (rightEdge < prevRightEdge + 1.5)
      return prevRightEdge
    if (x + w < 0 || x > this.width)
      return rightEdge

    const rectWidth = w < 2 ? 2 : w
    const textX = (x > 0 ? x : 0) + CONSTANT_TEXT_INDENT
    const textY = y + CONSTANT_ROW_HEIGHT / 2
    let nameText = ''
    let sizeText = ''
    let measuredW: number
    let typesetX = 0
    const typesetW = w + x - textX
    const fillColor = colorToCanvasFill(this.getColor(node) || this.palette.fallback, this.c, this.zoomedOutMin - this.viewportMin * scale, CONSTANT_ROW_HEIGHT, scale * this.stripeScaleAdjust)
    let textColor = this.palette.text
    let childRightEdge = -Infinity

    if (flags & FLAGS.ROOT) {
      textColor = this.palette.fg
      this.setFont(CONSTANT_BOLD_FONT)
    }
    else {
      this.c.fillStyle = fillColor
      this.c.fillRect(x, y, rectWidth, CONSTANT_ROW_HEIGHT)

      // Draw the hover highlight
      if ((flags & FLAGS.HOVER) || (this.hoveredNode && node.id === this.hoveredNode.id)) {
        this.c.fillStyle = this.palette.hover
        this.c.fillRect(x, y, rectWidth, CONSTANT_ROW_HEIGHT)
        flags |= FLAGS.HOVER
      }
    }

    // Typeset the node name
    if (this.ellipsisWidth < typesetW) {
      nameText = this.getText(node) || ''
      measuredW = this.c.measureText(nameText).width
      if (measuredW <= typesetW) {
        typesetX += measuredW
      }
      else {
        nameText = this.textOverflowEllipsis(nameText, typesetW)[0]
        typesetX = typesetW
      }
      this.c.fillStyle = textColor
      this.c.fillText(nameText, textX, textY)
    }

    // Switch to the size font
    if (flags & FLAGS.ROOT) {
      this.setFont(CONSTANT_NORMAL_FONT)
    }

    // Typeset the node size
    if (typesetX + this.ellipsisWidth < typesetW) {
      sizeText = this.getSubtext(node) || ''
      if (sizeText)
        sizeText = ` - ${sizeText}`
      measuredW = this.c.measureText(sizeText).width
      if (typesetX + measuredW > typesetW) {
        sizeText = this.textOverflowEllipsis(sizeText, typesetW - typesetX)[0]
      }
      this.c.globalAlpha = 0.5
      this.c.fillText(sizeText, textX + typesetX, textY)
      this.c.globalAlpha = 1
    }

    // Draw the children
    for (const child of node.children) {
      childRightEdge = this.drawNode(child, y + CONSTANT_ROW_HEIGHT, startBytes, childRightEdge, flags & ~FLAGS.ROOT)
      startBytes += child.size
    }

    // Draw the outline
    if (!(flags & FLAGS.ROOT)) {
      // Note: The stroke deliberately overlaps the right and bottom edges
      strokeRectWithFirefoxBugWorkaround(this.c, this.palette.stroke, x + 0.5, y + 0.5, rectWidth, CONSTANT_ROW_HEIGHT)
    }

    return rightEdge
  }

  private changeHoveredNode(node: TreeNode<T> | null): void {
    if (this.hoveredNode !== node) {
      this.hoveredNode = node
      this.canvas.style.cursor = node && !node.children.length ? 'pointer' : 'auto'
      this.invalidate()
    }
  }

  private hitTestNode(mouseEvent: MouseEvent | WheelEvent): TreeNode<T> | null {
    let mouseX = mouseEvent.pageX
    let mouseY = mouseEvent.pageY
    for (let el: HTMLElement | null = this.canvas; el; el = el.offsetParent as HTMLElement | null) {
      mouseX -= el.offsetLeft
      mouseY -= el.offsetTop
    }

    const mouseBytes = this.viewportMin + (this.viewportMax - this.viewportMin) / this.zoomedOutWidth * (mouseX - this.zoomedOutMin)

    const visit = (node: TreeNode<T>, y: number, startBytes: number): TreeNode<T> | null => {
      if (mouseBytes >= startBytes && mouseBytes < startBytes + node.size) {
        if (mouseY >= y && mouseY < y + CONSTANT_ROW_HEIGHT && node.id) {
          return node
        }

        if (mouseY >= y + CONSTANT_ROW_HEIGHT) {
          for (const child of node.children) {
            const result = visit(child, y + CONSTANT_ROW_HEIGHT, startBytes)
            if (result)
              return result
            startBytes += child.size
          }
        }
      }
      return null
    }

    return visit(this.tree.root, 0, 0)
  }

  private modifyViewport(deltaX: number, deltaY: number, xForZoom: number | null): void {
    let min = this.viewportMin
    let max = this.viewportMax
    let translate = 0

    if (xForZoom !== null) {
      const mouse = min + (max - min) / this.zoomedOutWidth * (xForZoom - this.zoomedOutMin)
      const scale = 1.01 ** deltaY
      min = mouse + (min - mouse) * scale
      max = mouse + (max - mouse) * scale
    }
    else {
      translate = deltaX * (max - min) / this.zoomedOutWidth
    }

    if (min + translate < 0)
      translate = -min
    else if (max + translate > this.totalBytes)
      translate = this.totalBytes - max
    min += translate
    max += translate

    if (min < 0)
      min = 0
    if (max > this.totalBytes)
      max = this.totalBytes

    this.setViewport(min, max, false)
  }

  private setViewport(min: number, max: number, animate: boolean): void {
    this.animationFromMin = this.viewportMin
    this.animationFromMax = this.viewportMax
    this.animationToMin = min
    this.animationToMax = max

    if (animate)
      this.animationStart = now()
    else
      this.animationStart = 0

    this.invalidate()
  }

  private updateHover(e: MouseEvent | WheelEvent): void {
    const node = this.hitTestNode(e)
    this.changeHoveredNode(node)

    // Show a tooltip for hovered nodes
    this.events.emit('hover', node, e)
  }
}
