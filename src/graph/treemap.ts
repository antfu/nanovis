/* eslint-disable no-restricted-syntax */
import type { GraphBaseOptions, Tree, TreeNode } from '../types/tree'
import {
  colorToCanvasFill,
} from '../utils/color'
import { DEFAULT_GRAPH_OPTIONS } from '../utils/defaults'
import {
  now,
  strokeRectWithFirefoxBugWorkaround,
  useResizeEventListener,
  useWheelEventListener,
} from '../utils/helpers'
import { GraphContext } from './context'

const CONSTANT_PADDING = 4
const CONSTANT_HEADER_HEIGHT = 20
const CONSTANT_INSET_X = 2 * CONSTANT_PADDING
const CONSTANT_INSET_Y = CONSTANT_HEADER_HEIGHT + CONSTANT_PADDING

const enum DrawFlags {
  CONTAINS_HOVER = 1,
  CONTAINS_TARGET = 2,
}

const enum Culling {
  Disabled,
  Enabled,
  Culled,
}

interface NodeLayout<T> {
  node: TreeNode<T>
  box: [x: number, y: number, w: number, h: number]
  children: NodeLayout<T>[]
}

// "Squarified Treemaps": https://www.win.tue.nl/~vanwijk/stm.pdf
function layoutTreemap<T>(sortedChildren: TreeNode<T>[], x: number, y: number, w: number, h: number): NodeLayout<T>[] {
  const children: NodeLayout<T>[] = []

  const worst = (start: number, end: number, shortestSide: number, totalArea: number, bytesToArea: number): number => {
    const maxArea = sortedChildren[start].size * bytesToArea
    const minArea = sortedChildren[end].size * bytesToArea
    return Math.max(
      (shortestSide * shortestSide * maxArea) / (totalArea * totalArea),
      totalArea * totalArea / (shortestSide * shortestSide * minArea),
    )
  }

  const squarify = (start: number, x: number, y: number, w: number, h: number): void => {
    while (start < sortedChildren.length) {
      let totalBytes = 0
      for (let i = start; i < sortedChildren.length; i++) {
        totalBytes += sortedChildren[i].size
      }

      const shortestSide = Math.min(w, h)
      const bytesToArea = (w * h) / totalBytes
      let end = start
      let areaInRun = 0
      let oldWorst = 0

      // Find the optimal split
      while (end < sortedChildren.length) {
        const area = sortedChildren[end].size * bytesToArea
        const newWorst = worst(start, end, shortestSide, areaInRun + area, bytesToArea)
        if (end > start && oldWorst < newWorst)
          break
        areaInRun += area
        oldWorst = newWorst
        end++
      }

      // Layout the run up to the split
      const split = Math.round(areaInRun / shortestSide)
      let areaInLayout = 0
      for (let i = start; i < end; i++) {
        const child = sortedChildren[i]
        const area = child.size * bytesToArea
        const lower = Math.round(shortestSide * areaInLayout / areaInRun)
        const upper = Math.round(shortestSide * (areaInLayout + area) / areaInRun)
        const [cx, cy, cw, ch] = w >= h
          ? [x, y + lower, split, upper - lower]
          : [x + lower, y, upper - lower, split]
        children.push({
          node: child,
          box: [cx, cy, cw, ch],
          children: cw > CONSTANT_INSET_X && ch > CONSTANT_INSET_Y
            ? layoutTreemap(
                child.children,
                cx + CONSTANT_PADDING,
                cy + CONSTANT_HEADER_HEIGHT,
                cw - CONSTANT_INSET_X,
                ch - CONSTANT_INSET_Y,
              )
            : [],
        })
        areaInLayout += area
      }

      // Layout everything remaining
      start = end
      if (w >= h) {
        x += split
        w -= split
      }
      else {
        y += split
        h -= split
      }
    }
  }

  squarify(0, x, y, w, h)
  return children
}

export interface TreemapOptions<T> extends GraphBaseOptions<T> {
  /**
   * Padding ratio for the selected node. Ratio relative to the width and height of the canvas.
   *
   * @default 0.2
   */
  selectedPaddingRatio?: number
}

export class Treemap<T> extends GraphContext<T, TreemapOptions<T>> {
  private layoutNodes: NodeLayout<T>[] = []

  private hoveredNode: TreeNode<T> | null = null
  private bgOriginX = 0
  private bgOriginY = 0
  private currentNode: NodeLayout<T> | null = null
  private currentLayout: NodeLayout<T> | null = null
  private previousLayout: NodeLayout<T> | null = null

  private currentOriginX = 0
  private currentOriginY = 0
  private animationStart = 0
  private animationBlend = 1
  private animationSource: NodeLayout<T> | null = null
  private animationTarget: NodeLayout<T> | null = null

  constructor(tree: Tree<T>, options: TreemapOptions<T> = {}) {
    super(tree, options)

    this.canvas.addEventListener('mousemove', (e) => {
      this.updateHover(e)
    })

    this.canvas.addEventListener('mouseout', (e) => {
      this.changeHoveredNode(null)
      this.events.emit('hover', null, e)
    })

    this.el.addEventListener('click', (e) => {
      const layout = this.hitTestNode(e)
      if (layout) {
        const node = layout.node
        this.events.emit('click', node, e)
        if (!node.children.length) {
          this.updateHover(e)
        }
        else if (layout !== this.currentLayout) {
          this.changeCurrentNode(layout)
          this.changeHoveredNode(null)
        }
        else {
          this.updateHover(e)
        }
      }
      else if (this.currentNode) {
        this.changeCurrentNode(null)
        this.updateHover(e)
      }
    })

    this.el.append(this.canvas)

    this.resize()
    Promise.resolve().then(() => this.resize()) // Resize once the element is in the DOM

    this.disposables.push(useWheelEventListener(e => this.updateHover(e)))
    this.disposables.push(useResizeEventListener(() => this.resize()))
  }

  public select(node: TreeNode<T> | null, animate?: boolean) {
    this.changeCurrentNode(
      node
        ? this.searchFor(this.layoutNodes, node)
        : null,
      animate,
    )
  }

  public override draw(): void {
    this.c.clearRect(0, 0, this.width, this.height)
    this.c.textBaseline = 'middle'
    this.ellipsisWidth = this.c.measureText('...').width

    // Draw the full tree first
    let _nodeContainingHover: NodeLayout<T> | null = null
    let nodeContainingTarget: NodeLayout<T> | null = null
    const transition = !this.currentLayout
      ? 0
      : !this.animationSource
          ? this.animationBlend
          : !this.animationTarget ? 1 - this.animationBlend : 1
    this.bgOriginX = this.bgOriginY = 0
    for (const node of this.layoutNodes) {
      const flags = this.drawNodeBackground(node, Culling.Enabled)
      if (flags & DrawFlags.CONTAINS_HOVER)
        _nodeContainingHover = node
      if (flags & DrawFlags.CONTAINS_TARGET)
        nodeContainingTarget = node
    }
    for (const node of this.layoutNodes) {
      this.drawNodeForeground(node, false)

      // Fade out nodes that are not activated
      if (this.currentLayout) {
        const [x, y, w, h] = node.box
        this.c.globalAlpha = 0.6 * (!this.currentLayout || (!this.animationSource && nodeContainingTarget && node !== nodeContainingTarget)
          ? 1
          : transition)
        this.c.fillStyle = this.palette.bg
        this.c.fillRect(x, y, w, h)
        this.c.globalAlpha = 1
      }
    }

    // Draw the previous node
    if (this.previousLayout) {
      this.drawNodeBackground(this.previousLayout, Culling.Disabled)
      this.drawNodeForeground(this.previousLayout, true)
    }

    // Draw the current node on top
    if (this.currentLayout) {
      const [x, y, w, h] = this.currentLayout.box
      const matrix = this.c.getTransform()
      const scale = Math.sqrt(matrix.a * matrix.d)

      // Draw a shadow under the node
      this.c.save()
      this.c.shadowColor = this.palette.shadow
      this.c.shadowBlur = scale * (30 * transition)
      this.c.shadowOffsetX = scale * (2 * this.width)
      this.c.shadowOffsetY = scale * (2 * this.height + 15 * transition)
      this.c.fillRect(x - 2 * this.width, y - 2 * this.height, w, h)
      this.c.restore()

      this.bgOriginX = this.currentOriginX
      this.bgOriginY = this.currentOriginY
      this.drawNodeBackground(this.currentLayout, Culling.Disabled)
      this.drawNodeForeground(this.currentLayout, true)
    }
  }

  public override tick(): void {
    const oldAnimationBlend = this.animationBlend
    const oldCurrentNode = this.currentNode
    this.animationBlend = (now() - this.animationStart) / (this.options.animateDuration ?? DEFAULT_GRAPH_OPTIONS.animateDuration)

    if (this.animationBlend < 0 || this.animationBlend > 1) {
      this.currentNode = this.animationTarget
      this.previousLayout = null
      this.animationBlend = 1
    }
    else {
      // Use a cubic "ease-out" curve
      this.animationBlend = 1 - this.animationBlend
      this.animationBlend *= this.animationBlend * this.animationBlend
      this.animationBlend = 1 - this.animationBlend
      this.invalidate()
    }

    if (this.animationBlend !== oldAnimationBlend || this.currentNode !== oldCurrentNode) {
      this.updateCurrentLayout()
    }

    this.draw()
  }

  public override resize(): void {
    const oldWidth = this.width
    const oldHeight = this.height
    this.width = Math.min(this.el.clientWidth, 1600)
    this.height = Math.max(Math.round(this.width / 2), innerHeight - 200)
    if (this.width !== oldWidth || this.height !== oldHeight) {
      this.layoutNodes = layoutTreemap([this.tree.root], 0, 0, this.width - 1, this.height - 1)
      this.updateCurrentLayout()
    }
    super.resize()
  }

  private drawNodeBackground(layout: NodeLayout<T>, culling: Culling): DrawFlags {
    const node = layout.node
    const [x, y, w, h] = layout.box
    let flags = (node === this.hoveredNode ? DrawFlags.CONTAINS_HOVER : 0)
      | (layout === this.animationTarget ? DrawFlags.CONTAINS_TARGET : 0)

    // Improve performance by not drawing backgrounds unnecessarily
    if (culling === Culling.Enabled && this.currentLayout) {
      const [cx, cy, cw, ch] = this.currentLayout.box
      if (x >= cx && y >= cy && x + w <= cx + cw && y + h <= cy + ch) {
        culling = Culling.Culled
      }
    }

    for (const child of layout.children) {
      flags |= this.drawNodeBackground(child, culling)
    }

    if (culling !== Culling.Culled) {
      this.c.fillStyle = colorToCanvasFill(this.getColor(node) || this.palette.fallback, this.c, this.bgOriginX, this.bgOriginY, 1)
      if (layout.children.length) {
        // Avoiding overdraw is probably a good idea...
        this.c.fillRect(x, y, w, CONSTANT_HEADER_HEIGHT)
        this.c.fillRect(x, y + h - CONSTANT_PADDING, w, CONSTANT_PADDING)
        this.c.fillRect(x, y + CONSTANT_HEADER_HEIGHT, CONSTANT_PADDING, h - CONSTANT_INSET_Y)
        this.c.fillRect(x + w - CONSTANT_PADDING, y + CONSTANT_HEADER_HEIGHT, CONSTANT_PADDING, h - CONSTANT_INSET_Y)
      }
      else {
        // Fill in the whole node if there are no children
        this.c.fillRect(x, y, w, h)
      }
    }

    return flags
  }

  private drawNodeForeground(layout: NodeLayout<T>, inCurrentNode: boolean): void {
    const node = layout.node
    const [x, y, w, h] = layout.box

    // Draw the hover highlight
    if (this.hoveredNode === node && (!this.currentNode || inCurrentNode)) {
      this.c.fillStyle = this.palette.hover
      this.c.fillRect(x, y, w, h)
    }

    strokeRectWithFirefoxBugWorkaround(this.c, this.palette.stroke, x + 0.5, y + 0.5, w, h)

    if (h >= CONSTANT_HEADER_HEIGHT) {
      this.c.fillStyle = this.palette.text

      // Measure the node name
      const maxWidth = w - CONSTANT_INSET_X
      const textY = y + Math.round(CONSTANT_INSET_Y / 2)
      const [nameText, nameWidth] = this.textOverflowEllipsis(this.getText(node) || '', maxWidth)
      let textX = x + Math.round((w - nameWidth) / 2)

      const text = this.getText(node)
      const subtext = this.getSubtext(node)
      // Measure and draw the node detail (but only if there's more space and not for leaf nodes)
      if (nameText === text && node.children.length) {
        let detailText = subtext || ''
        if (detailText && text)
          detailText = ` - ${detailText}`
        const [sizeText, sizeWidth] = this.textOverflowEllipsis(detailText, maxWidth - nameWidth)
        textX = x + Math.round((w - nameWidth - sizeWidth) / 2)
        this.c.globalAlpha = 0.5
        this.c.fillText(sizeText, textX + nameWidth, textY)
        this.c.globalAlpha = 1
      }

      // Draw the node name
      this.c.fillText(nameText, textX, textY)

      // Draw the node detail (only if there's enough space and only for leaf nodes)
      if (h > CONSTANT_INSET_Y + 16 && !node.children.length) {
        const [sizeText, sizeWidth] = this.textOverflowEllipsis(subtext || '', maxWidth)
        this.c.globalAlpha = 0.5
        // Handle the case where title is empty
        const headerHeight = text ? CONSTANT_HEADER_HEIGHT : (CONSTANT_HEADER_HEIGHT / 2 + CONSTANT_PADDING)
        this.c.fillText(sizeText, x + Math.round((w - sizeWidth) / 2), y + headerHeight + Math.round(h - CONSTANT_INSET_Y) / 2)
        this.c.globalAlpha = 1
      }

      // Draw the children
      for (const child of layout.children) {
        this.drawNodeForeground(child, inCurrentNode)
      }
    }
  }

  private updateCurrentLayout(): void {
    const selectedPaddingRatio = this.options.selectedPaddingRatio ?? 0.2
    if (this.currentNode) {
      const [ox1, oy1, ow, oh] = this.currentNode.box
      const ox2 = ox1 + ow
      const oy2 = oy1 + oh
      const nx1 = Math.round(this.width * selectedPaddingRatio / 2)
      const ny1 = Math.round(this.height * selectedPaddingRatio / 2)
      const nx2 = this.width - nx1 - 1
      const ny2 = this.height - ny1 - 1
      const t = this.animationTarget ? this.animationBlend : 1 - this.animationBlend
      const x1 = Math.round(ox1 + (nx1 - ox1) * t)
      const y1 = Math.round(oy1 + (ny1 - oy1) * t)
      const x2 = Math.round(ox2 + (nx2 - ox2) * t)
      const y2 = Math.round(oy2 + (ny2 - oy2) * t)
      const wrap64 = (x: number) => x - Math.floor(x / 64 - 0.5) * 64
      this.currentLayout = layoutTreemap([this.currentNode.node], x1, y1, x2 - x1, y2 - y1)[0]
      this.currentOriginX = wrap64(-(ox1 + ox2) / 2) * (1 - t) + (x1 + x2) / 2
      this.currentOriginY = wrap64(-(oy1 + oy2) / 2) * (1 - t) + (y1 + y2) / 2
    }
    else {
      this.currentLayout = null
      this.currentOriginX = 0
      this.currentOriginY = 0
    }
  }

  private hitTestNode(mouseEvent: MouseEvent | WheelEvent): NodeLayout<T> | null {
    let mouseX = mouseEvent.pageX
    let mouseY = mouseEvent.pageY
    for (let el: HTMLElement | null = this.canvas; el; el = el.offsetParent as HTMLElement | null) {
      mouseX -= el.offsetLeft
      mouseY -= el.offsetTop
    }

    const visit = (nodes: NodeLayout<T>[], isTopLevel: boolean): NodeLayout<T> | null => {
      for (const node of nodes) {
        const [x, y, w, h] = node.box
        if (mouseX >= x && mouseY >= y && mouseX < x + w && mouseY < y + h) {
          return visit(node.children, false) || (isTopLevel ? null : node)
        }
      }
      return null
    }

    return this.currentLayout
      ? visit([this.currentLayout], false)
      : visit(this.layoutNodes, true)
  }

  private updateHover(e: MouseEvent): void {
    const layout = this.hitTestNode(e)
    this.changeHoveredNode(layout && layout.node)

    // Show a tooltip for hovered nodes
    this.events.emit('hover', layout?.node || null, e)
  }

  private changeHoveredNode(node: TreeNode<T> | null): void {
    if (this.hoveredNode !== node) {
      this.hoveredNode = node
      this.canvas.style.cursor = node && !node.children.length ? 'pointer' : 'auto'
      this.invalidate()
    }
  }

  private searchFor(children: NodeLayout<T>[], node: TreeNode<T>): NodeLayout<T> | null {
    for (const child of children) {
      const result = child.node === node ? child : this.searchFor(child.children, node)
      if (result)
        return result
    }
    return null
  }

  private changeCurrentNode(node: NodeLayout<T> | null, animate = this.options.animate): void {
    if (this.currentNode !== node) {
      this.events.emit('select', node?.node || null)
      this.previousLayout = node ? this.currentLayout : null
      if (animate) {
        this.animationBlend = 0
        this.animationStart = now()
        this.animationSource = this.currentNode
      }
      this.animationTarget = node
      this.currentNode = node || this.searchFor(this.layoutNodes, this.currentNode!.node)
      this.updateCurrentLayout()
      this.invalidate()
    }
  }
}
