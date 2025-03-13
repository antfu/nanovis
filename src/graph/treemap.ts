import type { Events, Tree, TreeNode } from '../types/tree'
import type {
  ColorMapping,
} from '../utils/color'
import { createNanoEvents } from 'nanoevents'
import {
  canvasFillStyleForInputPath,
  COLOR,
  moduleTypeLabelInputPath,
} from '../utils/color'
import {
  now,
  strokeRectWithFirefoxBugWorkaround,
  useDarkModeListener,
  useResizeEventListener,
  useWheelEventListener,
} from '../utils/helpers'
// import styles from './treemap.module.css'

enum CONSTANTS {
  PADDING = 4,
  HEADER_HEIGHT = 20,
  DOT_CHAR_CODE = 46,
  ANIMATION_DURATION = 350,
  INSET_X = 2 * PADDING,
  INSET_Y = HEADER_HEIGHT + PADDING,
}

enum DrawFlags {
  CONTAINS_HOVER = 1,
  CONTAINS_TARGET = 2,
}

enum Culling {
  Disabled,
  Enabled,
  Culled,
}

interface NodeLayout {
  node_: TreeNode
  box_: [x: number, y: number, w: number, h: number]
  children_: NodeLayout[]
}

// "Squarified Treemaps": https://www.win.tue.nl/~vanwijk/stm.pdf
function layoutTreemap(sortedChildren: TreeNode[], x: number, y: number, w: number, h: number): NodeLayout[] {
  const children: NodeLayout[] = []

  const worst = (start: number, end: number, shortestSide: number, totalArea: number, bytesToArea: number): number => {
    const maxArea = sortedChildren[start].bytesInOutput_ * bytesToArea
    const minArea = sortedChildren[end].bytesInOutput_ * bytesToArea
    return Math.max(
      (shortestSide * shortestSide * maxArea) / (totalArea * totalArea),
      totalArea * totalArea / (shortestSide * shortestSide * minArea),
    )
  }

  const squarify = (start: number, x: number, y: number, w: number, h: number): void => {
    while (start < sortedChildren.length) {
      let totalBytes = 0
      for (let i = start; i < sortedChildren.length; i++) {
        totalBytes += sortedChildren[i].bytesInOutput_
      }

      const shortestSide = Math.min(w, h)
      const bytesToArea = (w * h) / totalBytes
      let end = start
      let areaInRun = 0
      let oldWorst = 0

      // Find the optimal split
      while (end < sortedChildren.length) {
        const area = sortedChildren[end].bytesInOutput_ * bytesToArea
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
        const area = child.bytesInOutput_ * bytesToArea
        const lower = Math.round(shortestSide * areaInLayout / areaInRun)
        const upper = Math.round(shortestSide * (areaInLayout + area) / areaInRun)
        const [cx, cy, cw, ch] = w >= h
          ? [x, y + lower, split, upper - lower]
          : [x + lower, y, upper - lower, split]
        children.push({
          node_: child,
          box_: [cx, cy, cw, ch],
          children_: cw > CONSTANTS.INSET_X && ch > CONSTANTS.INSET_Y
            ? layoutTreemap(
                child.sortedChildren_,
                cx + CONSTANTS.PADDING,
                cy + CONSTANTS.HEADER_HEIGHT,
                cw - CONSTANTS.INSET_X,
                ch - CONSTANTS.INSET_Y,
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

export interface TreemapOptions {
  colorMapping?: ColorMapping
  colorMode?: COLOR
}

export function createTreemap(tree: Tree, options?: TreemapOptions) {
  const {
    colorMapping = {},
    colorMode = COLOR.DIRECTORY,
  } = options || {}

  const events = createNanoEvents<Events>()
  const disposables: (() => void)[] = []
  let layoutNodes: NodeLayout[] = []
  const componentEl = document.createElement('div')
  const mainEl = document.createElement('main')
  const canvas = document.createElement('canvas')
  const c = canvas.getContext('2d')!
  let width = 0
  let height = 0
  let animationFrame: number | null = null
  let hoveredNode: TreeNode | null = null
  let bgOriginX = 0
  let bgOriginY = 0
  let bgColor = ''
  let fgOnColor = ''
  const normalFont = '14px sans-serif', boldWidthCache: Record<number, number> = {}
  const boldFont = 'bold ' + normalFont, normalWidthCache: Record<number, number> = {}
  let ellipsisWidth = 0
  let currentWidthCache: Record<number, number> = normalWidthCache
  let currentNode: NodeLayout | null = null
  let currentLayout: NodeLayout | null = null
  let currentOriginX = 0
  let currentOriginY = 0
  let animationStart = 0
  let animationBlend = 1
  let animationSource: NodeLayout | null = null
  let animationTarget: NodeLayout | null = null

  const updateCurrentLayout = (): void => {
    if (currentNode) {
      const [ox1, oy1, ow, oh] = currentNode.box_
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
      currentLayout = layoutTreemap([currentNode.node_], x1, y1, x2 - x1, y2 - y1)[0]
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
    width = Math.min(mainEl.clientWidth, 1600)
    height = Math.max(Math.round(width / 2), innerHeight - 200)
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    mainEl.style.height = height + 'px'
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    c.scale(ratio, ratio)
    if (width !== oldWidth || height !== oldHeight) {
      layoutNodes = layoutTreemap(tree.root_.sortedChildren_, 0, 0, width - 1, height - 1)
      updateCurrentLayout()
    }
    draw()
  }

  const tick = (): void => {
    const oldAnimationBlend = animationBlend
    const oldCurrentNode = currentNode
    animationBlend = (now() - animationStart) / CONSTANTS.ANIMATION_DURATION

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

  const drawNodeBackground = (layout: NodeLayout, culling: Culling): DrawFlags => {
    const node = layout.node_
    const [x, y, w, h] = layout.box_
    let flags
      = (node === hoveredNode ? DrawFlags.CONTAINS_HOVER : 0)
        | (layout === animationTarget ? DrawFlags.CONTAINS_TARGET : 0)

    // Improve performance by not drawing backgrounds unnecessarily
    if (culling === Culling.Enabled && currentLayout) {
      const [cx, cy, cw, ch] = currentLayout.box_
      if (x >= cx && y >= cy && x + w <= cx + cw && y + h <= cy + ch) {
        culling = Culling.Culled
      }
    }

    for (const child of layout.children_) {
      flags |= drawNodeBackground(child, culling)
    }

    if (culling !== Culling.Culled && !node.isOutputFile_) {
      c.fillStyle = canvasFillStyleForInputPath(colorMapping, c, node.inputPath_, bgOriginX, bgOriginY, 1)
      if (layout.children_.length) {
        // Avoiding overdraw is probably a good idea...
        c.fillRect(x, y, w, CONSTANTS.HEADER_HEIGHT)
        c.fillRect(x, y + h - CONSTANTS.PADDING, w, CONSTANTS.PADDING)
        c.fillRect(x, y + CONSTANTS.HEADER_HEIGHT, CONSTANTS.PADDING, h - CONSTANTS.INSET_Y)
        c.fillRect(x + w - CONSTANTS.PADDING, y + CONSTANTS.HEADER_HEIGHT, CONSTANTS.PADDING, h - CONSTANTS.INSET_Y)
      }
      else {
        // Fill in the whole node if there are no children
        c.fillRect(x, y, w, h)
      }
    }

    return flags
  }

  const drawNodeForeground = (layout: NodeLayout, inCurrentNode: boolean): void => {
    const node = layout.node_
    const [x, y, w, h] = layout.box_
    const isOutputFile = node.isOutputFile_

    // Draw the hover highlight
    if (hoveredNode === node && !isOutputFile && (!currentNode || inCurrentNode)) {
      c.fillStyle = 'rgba(255,255,255,0.5)'
      c.fillRect(x, y, w, h)
    }

    if (!isOutputFile) {
      // Note: The stroke deliberately overlaps the right and bottom edges
      strokeRectWithFirefoxBugWorkaround(c, '#222', x + 0.5, y + 0.5, w, h)
    }

    if (h >= CONSTANTS.HEADER_HEIGHT) {
      c.fillStyle = isOutputFile ? fgOnColor : '#000'

      // Switch to the bold font
      if (isOutputFile) {
        c.font = boldFont
        currentWidthCache = boldWidthCache
        ellipsisWidth = 3 * charCodeWidth(CONSTANTS.DOT_CHAR_CODE)
      }

      // Measure the node name
      const maxWidth = w - CONSTANTS.INSET_X
      const textY = y + Math.round(CONSTANTS.INSET_Y / 2)
      const [nameText, nameWidth] = textOverflowEllipsis(node.name_, maxWidth)
      let textX = x + Math.round((w - nameWidth) / 2)

      // Switch to the normal font
      if (isOutputFile) {
        c.font = normalFont
        currentWidthCache = normalWidthCache
        ellipsisWidth = 3 * charCodeWidth(CONSTANTS.DOT_CHAR_CODE)
      }

      // Measure and draw the node detail (but only if there's more space and not for leaf nodes)
      if (nameText === node.name_ && node.sortedChildren_.length) {
        const detailText = ' – ' + (colorMode === COLOR.FORMAT ? moduleTypeLabelInputPath(colorMapping, node.inputPath_, '') : node.sizeText_)
        const [sizeText, sizeWidth] = textOverflowEllipsis(detailText, maxWidth - nameWidth)
        textX = x + Math.round((w - nameWidth - sizeWidth) / 2)
        c.globalAlpha = 0.5
        c.fillText(sizeText, textX + nameWidth, textY)
        c.globalAlpha = 1
      }

      // Switch to the bold font
      if (isOutputFile) {
        c.font = boldFont
        currentWidthCache = boldWidthCache
        ellipsisWidth = 3 * charCodeWidth(CONSTANTS.DOT_CHAR_CODE)
      }

      // Draw the node name
      c.fillText(nameText, textX, textY)

      // Switch to the normal font
      if (isOutputFile) {
        c.font = normalFont
        currentWidthCache = normalWidthCache
        ellipsisWidth = 3 * charCodeWidth(CONSTANTS.DOT_CHAR_CODE)
      }

      // Draw the node detail (only if there's enough space and only for leaf nodes)
      if (h > CONSTANTS.INSET_Y + 16 && !node.sortedChildren_.length) {
        const detailText = colorMode === COLOR.FORMAT ? moduleTypeLabelInputPath(colorMapping, node.inputPath_, '') : node.sizeText_
        const [sizeText, sizeWidth] = textOverflowEllipsis(detailText, maxWidth)
        c.globalAlpha = 0.5
        c.fillText(sizeText, x + Math.round((w - sizeWidth) / 2), y + CONSTANTS.HEADER_HEIGHT + Math.round(h - CONSTANTS.INSET_Y) / 2)
        c.globalAlpha = 1
      }

      // Draw the children
      for (const child of layout.children_) {
        drawNodeForeground(child, inCurrentNode)
      }
    }
  }

  let draw = (): void => {
    const bodyStyle = getComputedStyle(document.body)
    bgColor = bodyStyle.getPropertyValue('--bg')
    fgOnColor = bodyStyle.getPropertyValue('--fg-on')
    animationFrame = null

    c.clearRect(0, 0, width, height)
    c.textBaseline = 'middle'
    ellipsisWidth = c.measureText('...').width

    // Draw the full tree first
    let nodeContainingHover: NodeLayout | null = null
    let nodeContainingTarget: NodeLayout | null = null
    const transition = !currentLayout
      ? 0
      : !animationSource
          ? animationBlend
          : !animationTarget ? 1 - animationBlend : 1
    bgOriginX = bgOriginY = 0
    for (const node of layoutNodes) {
      const flags = drawNodeBackground(node, Culling.Enabled)
      if (flags & DrawFlags.CONTAINS_HOVER)
        nodeContainingHover = node
      if (flags & DrawFlags.CONTAINS_TARGET)
        nodeContainingTarget = node
    }
    for (const node of layoutNodes) {
      drawNodeForeground(node, false)

      // Fade out nodes that aren't being hovered
      if (currentLayout || (nodeContainingHover && node !== nodeContainingHover)) {
        const [x, y, w, h] = node.box_
        c.globalAlpha = 0.6 * (!currentLayout || (!animationSource
          && nodeContainingTarget && node !== nodeContainingTarget)
          ? 1
          : transition)
        c.fillStyle = bgColor
        c.fillRect(x, y, w, h)
        c.globalAlpha = 1
      }
    }

    // Draw the current node on top
    if (currentLayout) {
      const [x, y, w, h] = currentLayout.box_
      const matrix = c.getTransform()
      const scale = Math.sqrt(matrix.a * matrix.d)

      // Draw a shadow under the node
      c.save()
      c.shadowColor = 'rgba(0,0,0,0.5)'
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

  const hitTestNode = (mouseEvent: MouseEvent | WheelEvent): NodeLayout | null => {
    const visit = (nodes: NodeLayout[], isTopLevel: boolean): NodeLayout | null => {
      for (const node of nodes) {
        const [x, y, w, h] = node.box_
        if (mouseX >= x && mouseY >= y && mouseX < x + w && mouseY < y + h) {
          return visit(node.children_, false) || (isTopLevel ? null : node)
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
    changeHoveredNode(layout && layout.node_)

    // Show a tooltip for hovered nodes
    events.emit('hover', layout?.node_ || null, e)
  }

  let changeHoveredNode = (node: TreeNode | null): void => {
    if (hoveredNode !== node) {
      hoveredNode = node
      canvas.style.cursor = node && !node.sortedChildren_.length ? 'pointer' : 'auto'
      invalidate()
    }
  }

  const searchFor = (children: NodeLayout[], node: TreeNode): NodeLayout | null => {
    for (const child of children) {
      const result = child.node_ === node ? child : searchFor(child.children_, node)
      if (result)
        return result
    }
    return null
  }

  const changeCurrentNode = (node: NodeLayout | null): void => {
    if (currentNode !== node) {
      animationBlend = 0
      animationStart = now()
      animationSource = currentNode
      animationTarget = node
      currentNode = node || searchFor(layoutNodes, currentNode!.node_)
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

  componentEl.addEventListener('click', (e) => {
    const layout = hitTestNode(e)
    if (layout) {
      const node = layout.node_
      if (!node.sortedChildren_.length) {
        events.emit('click', node, e)
        updateHover(e)
      }
      else if (layout !== currentLayout) {
        changeCurrentNode(layout)
        changeHoveredNode(null)
        events.emit('click', node, e)
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
  disposables.push(useDarkModeListener(draw))

  function dispose() {
    disposables.forEach(d => d())
    disposables.length = 0
  }

  // componentEl.id = styles.treemapPanel
  mainEl.append(canvas)
  componentEl.append(mainEl)

  return {
    el: componentEl,
    events,
    resize,
    draw,
    dispose,
  }
}
