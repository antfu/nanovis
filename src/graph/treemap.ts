/* eslint-disable no-restricted-syntax */
import type { GraphBase, GraphBaseOptions, Tree, TreeNode } from '../types/tree'
import {
  colorToCanvasFill,
} from '../utils/color'
import {
  now,
  strokeRectWithFirefoxBugWorkaround,
  useResizeEventListener,
  useWheelEventListener,
} from '../utils/helpers'
import { createGraphContext } from './context'

const CONSTANT_PADDING = 4
const CONSTANT_HEADER_HEIGHT = 20
const CONSTANT_DOT_CHAR_CODE = 46
const CONSTANT_ANIMATION_DURATION = 350
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
}

export function createTreemap<T>(tree: Tree<T>, options: TreemapOptions<T> = {}) {
  const {
    getColor,
    getText,
    getSubtext,
    el,
    events,
    disposables,
    palette,
    dispose,
  } = createGraphContext(tree, options)

  let layoutNodes: NodeLayout<T>[] = []
  const canvas = document.createElement('canvas')
  const c = canvas.getContext('2d')!
  let width = 0
  let height = 0
  let animationFrame: number | null = null
  let hoveredNode: TreeNode<T> | null = null
  let bgOriginX = 0
  let bgOriginY = 0
  let bgColor = ''
  const normalFont = '14px sans-serif'
  // const boldWidthCache: Record<number, number> = {}
  // const boldFont = 'bold ' + normalFont
  const normalWidthCache: Record<number, number> = {}
  let ellipsisWidth = 0
  let currentWidthCache: Record<number, number> = normalWidthCache
  let currentNode: NodeLayout<T> | null = null
  let currentLayout: NodeLayout<T> | null = null
  let previousLayout: NodeLayout<T> | null = null

  let currentOriginX = 0
  let currentOriginY = 0
  let animationStart = 0
  let animationBlend = 1
  let animationSource: NodeLayout<T> | null = null
  let animationTarget: NodeLayout<T> | null = null

  const updateCurrentLayout = (): void => {
    if (currentNode) {
      const [ox1, oy1, ow, oh] = currentNode.box
      const ox2 = ox1 + ow
      const oy2 = oy1 + oh
      const nx1 = Math.round(width / 10)
      const ny1 = Math.round(height / 10)
      const nx2 = width - nx1 - 1
      const ny2 = height - ny1 - 1
      const t = animationTarget ? animationBlend : 1 - animationBlend
      const x1 = Math.round(ox1 + (nx1 - ox1) * t)
      const y1 = Math.round(oy1 + (ny1 - oy1) * t)
      const x2 = Math.round(ox2 + (nx2 - ox2) * t)
      const y2 = Math.round(oy2 + (ny2 - oy2) * t)
      const wrap64 = (x: number) => x - Math.floor(x / 64 - 0.5) * 64
      currentLayout = layoutTreemap([currentNode.node], x1, y1, x2 - x1, y2 - y1)[0]
      currentOriginX = wrap64(-(ox1 + ox2) / 2) * (1 - t) + (x1 + x2) / 2
      currentOriginY = wrap64(-(oy1 + oy2) / 2) * (1 - t) + (y1 + y2) / 2
    }
    else {
      currentLayout = null
      currentOriginX = 0
      currentOriginY = 0
    }
  }

  const resize = (): void => {
    const oldWidth = width
    const oldHeight = height
    const ratio = window.devicePixelRatio || 1
    width = Math.min(el.clientWidth, 1600)
    height = Math.max(Math.round(width / 2), innerHeight - 200)
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    c.scale(ratio, ratio)
    if (width !== oldWidth || height !== oldHeight) {
      layoutNodes = layoutTreemap(tree.root.children, 0, 0, width - 1, height - 1)
      updateCurrentLayout()
    }
    draw()
  }

  const tick = (): void => {
    const oldAnimationBlend = animationBlend
    const oldCurrentNode = currentNode
    animationBlend = (now() - animationStart) / CONSTANT_ANIMATION_DURATION

    if (animationBlend < 0 || animationBlend > 1) {
      currentNode = animationTarget
      animationBlend = 1
      animationFrame = null
    }
    else {
      // Use a cubic "ease-out" curve
      animationBlend = 1 - animationBlend
      animationBlend *= animationBlend * animationBlend
      animationBlend = 1 - animationBlend
      animationFrame = requestAnimationFrame(tick)
    }

    if (animationBlend !== oldAnimationBlend || currentNode !== oldCurrentNode) {
      updateCurrentLayout()
    }
    draw()
  }

  const invalidate = (): void => {
    if (animationFrame === null)
      animationFrame = requestAnimationFrame(tick)
  }

  const charCodeWidth = (ch: number): number => {
    let width = currentWidthCache[ch]
    if (width === undefined) {
      width = c.measureText(String.fromCharCode(ch)).width
      currentWidthCache[ch] = width
    }
    return width
  }

  const textOverflowEllipsis = (text: string, width: number): [string, number] => {
    if (width < ellipsisWidth)
      return ['', 0]
    let textWidth = 0
    const n = text.length
    let i = 0
    while (i < n) {
      const charWidth = charCodeWidth(text.charCodeAt(i))
      if (width < textWidth + ellipsisWidth + charWidth) {
        return [text.slice(0, i) + '...', textWidth + ellipsisWidth]
      }
      textWidth += charWidth
      i++
    }
    return [text, textWidth]
  }

  const drawNodeBackground = (layout: NodeLayout<T>, culling: Culling): DrawFlags => {
    const node = layout.node
    const [x, y, w, h] = layout.box
    let flags = (node === hoveredNode ? DrawFlags.CONTAINS_HOVER : 0)
      | (layout === animationTarget ? DrawFlags.CONTAINS_TARGET : 0)

    // Improve performance by not drawing backgrounds unnecessarily
    if (culling === Culling.Enabled && currentLayout) {
      const [cx, cy, cw, ch] = currentLayout.box
      if (x >= cx && y >= cy && x + w <= cx + cw && y + h <= cy + ch) {
        culling = Culling.Culled
      }
    }

    for (const child of layout.children) {
      flags |= drawNodeBackground(child, culling)
    }

    if (culling !== Culling.Culled) {
      c.fillStyle = colorToCanvasFill(getColor(node) || palette.fallback, c, bgOriginX, bgOriginY, 1)
      if (layout.children.length) {
        // Avoiding overdraw is probably a good idea...
        c.fillRect(x, y, w, CONSTANT_HEADER_HEIGHT)
        c.fillRect(x, y + h - CONSTANT_PADDING, w, CONSTANT_PADDING)
        c.fillRect(x, y + CONSTANT_HEADER_HEIGHT, CONSTANT_PADDING, h - CONSTANT_INSET_Y)
        c.fillRect(x + w - CONSTANT_PADDING, y + CONSTANT_HEADER_HEIGHT, CONSTANT_PADDING, h - CONSTANT_INSET_Y)
      }
      else {
        // Fill in the whole node if there are no children
        c.fillRect(x, y, w, h)
      }
    }

    return flags
  }

  const drawNodeForeground = (layout: NodeLayout<T>, inCurrentNode: boolean): void => {
    const node = layout.node
    const [x, y, w, h] = layout.box

    // Draw the hover highlight
    if (hoveredNode === node && (!currentNode || inCurrentNode)) {
      c.fillStyle = palette.hover
      c.fillRect(x, y, w, h)
    }

    strokeRectWithFirefoxBugWorkaround(c, palette.stroke, x + 0.5, y + 0.5, w, h)

    if (h >= CONSTANT_HEADER_HEIGHT) {
      c.fillStyle = palette.text

      c.font = normalFont
      currentWidthCache = normalWidthCache
      ellipsisWidth = 3 * charCodeWidth(CONSTANT_DOT_CHAR_CODE)

      // Measure the node name
      const maxWidth = w - CONSTANT_INSET_X
      const textY = y + Math.round(CONSTANT_INSET_Y / 2)
      const [nameText, nameWidth] = textOverflowEllipsis(getText(node) || '', maxWidth)
      let textX = x + Math.round((w - nameWidth) / 2)

      // Measure and draw the node detail (but only if there's more space and not for leaf nodes)
      if (nameText === getText(node) && node.children.length) {
        let detailText = getSubtext(node) || ''
        if (detailText)
          detailText = ' - ' + detailText
        const [sizeText, sizeWidth] = textOverflowEllipsis(detailText, maxWidth - nameWidth)
        textX = x + Math.round((w - nameWidth - sizeWidth) / 2)
        c.globalAlpha = 0.5
        c.fillText(sizeText, textX + nameWidth, textY)
        c.globalAlpha = 1
      }

      // Draw the node name
      c.fillText(nameText, textX, textY)

      // Draw the node detail (only if there's enough space and only for leaf nodes)
      if (h > CONSTANT_INSET_Y + 16 && !node.children.length) {
        const [sizeText, sizeWidth] = textOverflowEllipsis(getSubtext(node) || '', maxWidth)
        c.globalAlpha = 0.5
        c.fillText(sizeText, x + Math.round((w - sizeWidth) / 2), y + CONSTANT_HEADER_HEIGHT + Math.round(h - CONSTANT_INSET_Y) / 2)
        c.globalAlpha = 1
      }

      // Draw the children
      for (const child of layout.children) {
        drawNodeForeground(child, inCurrentNode)
      }
    }
  }

  let draw = (): void => {
    bgColor = palette.bg
    animationFrame = null

    c.clearRect(0, 0, width, height)
    c.textBaseline = 'middle'
    ellipsisWidth = c.measureText('...').width

    // Draw the full tree first
    let _nodeContainingHover: NodeLayout<T> | null = null
    let nodeContainingTarget: NodeLayout<T> | null = null
    const transition = !currentLayout
      ? 0
      : !animationSource
          ? animationBlend
          : !animationTarget ? 1 - animationBlend : 1
    bgOriginX = bgOriginY = 0
    for (const node of layoutNodes) {
      const flags = drawNodeBackground(node, Culling.Enabled)
      if (flags & DrawFlags.CONTAINS_HOVER)
        _nodeContainingHover = node
      if (flags & DrawFlags.CONTAINS_TARGET)
        nodeContainingTarget = node
    }
    for (const node of layoutNodes) {
      drawNodeForeground(node, false)

      // Fade out nodes that are not activated
      if (currentLayout) {
        const [x, y, w, h] = node.box
        c.globalAlpha = 0.6 * (!currentLayout || (!animationSource && nodeContainingTarget && node !== nodeContainingTarget)
          ? 1
          : transition)
        c.fillStyle = bgColor
        c.fillRect(x, y, w, h)
        c.globalAlpha = 1
      }
    }

    // Draw the previous node
    if (previousLayout) {
      drawNodeBackground(previousLayout, Culling.Disabled)
      drawNodeForeground(previousLayout, true)
    }

    // Draw the current node on top
    if (currentLayout) {
      const [x, y, w, h] = currentLayout.box
      const matrix = c.getTransform()
      const scale = Math.sqrt(matrix.a * matrix.d)

      // Draw a shadow under the node
      c.save()
      c.shadowColor = palette.shadow
      c.shadowBlur = scale * (30 * transition)
      c.shadowOffsetX = scale * (2 * width)
      c.shadowOffsetY = scale * (2 * height + 15 * transition)
      c.fillRect(x - 2 * width, y - 2 * height, w, h)
      c.restore()

      bgOriginX = currentOriginX
      bgOriginY = currentOriginY
      drawNodeBackground(currentLayout, Culling.Disabled)
      drawNodeForeground(currentLayout, true)
    }
  }

  const hitTestNode = (mouseEvent: MouseEvent | WheelEvent): NodeLayout<T> | null => {
    const visit = (nodes: NodeLayout<T>[], isTopLevel: boolean): NodeLayout<T> | null => {
      for (const node of nodes) {
        const [x, y, w, h] = node.box
        if (mouseX >= x && mouseY >= y && mouseX < x + w && mouseY < y + h) {
          return visit(node.children, false) || (isTopLevel ? null : node)
        }
      }
      return null
    }

    let mouseX = mouseEvent.pageX
    let mouseY = mouseEvent.pageY
    for (let el: HTMLElement | null = canvas; el; el = el.offsetParent as HTMLElement | null) {
      mouseX -= el.offsetLeft
      mouseY -= el.offsetTop
    }

    return currentLayout ? visit([currentLayout], false) : visit(layoutNodes, true)
  }

  const updateHover = (e: MouseEvent): void => {
    const layout = hitTestNode(e)
    changeHoveredNode(layout && layout.node)

    // Show a tooltip for hovered nodes
    events.emit('hover', layout?.node || null, e)
  }

  let changeHoveredNode = (node: TreeNode<T> | null): void => {
    if (hoveredNode !== node) {
      hoveredNode = node
      canvas.style.cursor = node && !node.children.length ? 'pointer' : 'auto'
      invalidate()
    }
  }

  const searchFor = (children: NodeLayout<T>[], node: TreeNode<T>): NodeLayout<T> | null => {
    for (const child of children) {
      const result = child.node === node ? child : searchFor(child.children, node)
      if (result)
        return result
    }
    return null
  }

  const changeCurrentNode = (node: NodeLayout<T> | null, animate: boolean = options.animate ?? true): void => {
    if (currentNode !== node) {
      events.emit('select', node?.node || null)
      previousLayout = node ? currentLayout : null
      if (animate) {
        animationBlend = 0
        animationStart = now()
        animationSource = currentNode
      }
      animationTarget = node
      currentNode = node || searchFor(layoutNodes, currentNode!.node)
      updateCurrentLayout()
      invalidate()
    }
  }

  canvas.addEventListener('mousemove', (e) => {
    updateHover(e)
  })

  canvas.addEventListener('mouseout', (e) => {
    changeHoveredNode(null)
    events.emit('hover', null, e)
  })

  el.addEventListener('click', (e) => {
    const layout = hitTestNode(e)
    if (layout) {
      const node = layout.node
      events.emit('click', node, e)
      if (!node.children.length) {
        updateHover(e)
      }
      else if (layout !== currentLayout) {
        changeCurrentNode(layout)
        changeHoveredNode(null)
      }
      else {
        updateHover(e)
      }
    }
    else if (currentNode) {
      changeCurrentNode(null)
      updateHover(e)
    }
  })

  resize()
  Promise.resolve().then(resize) // Resize once the element is in the DOM

  disposables.push(useWheelEventListener(updateHover))
  disposables.push(useResizeEventListener(resize))

  el.append(canvas)

  return {
    el,
    events,
    resize,
    draw,
    select: (node: TreeNode<T> | null, animate?: boolean) => {
      changeCurrentNode(node ? searchFor(layoutNodes, node) : null, animate)
    },
    dispose,
    [Symbol.dispose]: dispose,
  } satisfies GraphBase<T>
}
