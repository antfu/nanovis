import type { Events, Tree, TreeNode } from '../types/tree'
import type {
  ColorMapping,
} from '../utils/color'
import { createNanoEvents } from 'nanoevents'
import {
  canvasFillStyleForInputPath,
  COLOR,
  moduleTypeLabelInputPath,
  otherColor,
} from '../utils/color'
import {
  now,
  strokeRectWithFirefoxBugWorkaround,
  useDarkModeListener,
  useResizeEventListener,
  useWheelEventListener,
} from '../utils/helpers'
import styles from './flame.module.css'

enum CONSTANTS {
  MARGIN = 50,
  ROW_HEIGHT = 24,
  TEXT_INDENT = 5,
  DOT_CHAR_CODE = 46,
  ZOOMED_OUT_WIDTH = 1000,
}

enum FLAGS {
  OUTPUT = 1,
  HOVER = 2,
}

export interface CreateFlameOptions {
  colorMapping?: ColorMapping
  colorMode?: COLOR
}

export function createFlame(tree: Tree, options?: CreateFlameOptions) {
  const {
    colorMapping = {},
    colorMode = COLOR.DIRECTORY,
  } = options || {}

  const events = createNanoEvents<Events>()
  const disposables: (() => void)[] = []
  const totalBytes = tree.root_.bytesInOutput_
  let viewportMin = 0
  let viewportMax = totalBytes
  const componentEl = document.createElement('div')
  const mainEl = document.createElement('main')
  const canvas = document.createElement('canvas')
  const c = canvas.getContext('2d')!
  let width = 0
  let height = 0
  let zoomedOutMin = 0
  let zoomedOutWidth = 0
  let prevWheelTime = 0
  let prevWheelWasZoom = false
  let stripeScaleAdjust = 1
  let animationFrame: number | null = null
  let hoveredNode: TreeNode | null = null
  let fgOnColor = ''
  const normalFont = '14px sans-serif', boldWidthCache: Record<number, number> = {}
  const boldFont = 'bold ' + normalFont, normalWidthCache: Record<number, number> = {}
  let ellipsisWidth = 0
  let currentWidthCache: Record<number, number> = normalWidthCache

  const changeHoveredNode = (node: TreeNode | null, e: MouseEvent): void => {
    if (hoveredNode !== node) {
      hoveredNode = node
      canvas.style.cursor = node && !node.sortedChildren_.length ? 'pointer' : 'auto'
      if (!node) {
        events.emit('hover', null, e)
      }
      invalidate()
    }
  }

  const charCodeWidth = (ch: number): number => {
    let width = currentWidthCache[ch]
    if (width === undefined) {
      width = c.measureText(String.fromCharCode(ch)).width
      currentWidthCache[ch] = width
    }
    return width
  }

  const resize = (): void => {
    const ratio = window.devicePixelRatio || 1
    width = componentEl.clientWidth + 2 * CONSTANTS.MARGIN
    height = tree.maxDepth_ * CONSTANTS.ROW_HEIGHT + 1
    zoomedOutMin = (width - CONSTANTS.ZOOMED_OUT_WIDTH) >> 1
    zoomedOutWidth = zoomedOutMin + CONSTANTS.ZOOMED_OUT_WIDTH
    if (zoomedOutMin < 0)
      zoomedOutMin = 0
    if (zoomedOutWidth > width)
      zoomedOutWidth = width
    zoomedOutWidth -= zoomedOutMin
    stripeScaleAdjust = totalBytes / zoomedOutWidth
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    mainEl.style.height = height + 'px'
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    c.scale(ratio, ratio)
    draw()
  }

  const textOverflowEllipsis = (text: string, width: number): string => {
    let textWidth = ellipsisWidth
    const n = text.length
    let i = 0
    while (i < n) {
      textWidth += charCodeWidth(text.charCodeAt(i))
      if (textWidth > width)
        break
      i++
    }
    return text.slice(0, i) + '...'
  }

  // We want to avoid overlapping strokes from lots of really small adjacent
  // rectangles all merging together into a solid color. So we enforce a
  // minimum rectangle width of 2px and we also skip drawing rectangles that
  // have a right edge less than 1.5px from the previous right edge.
  const drawNode = (node: TreeNode, y: number, startBytes: number, prevRightEdge: number, flags: FLAGS): number => {
    const scale = zoomedOutWidth / (viewportMax - viewportMin)
    const x = zoomedOutMin + (startBytes - viewportMin) * scale
    const w = node.bytesInOutput_ * scale
    const rightEdge = x + w
    if (rightEdge < prevRightEdge + 1.5)
      return prevRightEdge
    if (x + w < 0 || x > width)
      return rightEdge

    const rectWidth = w < 2 ? 2 : w
    const textX = (x > 0 ? x : 0) + CONSTANTS.TEXT_INDENT
    const textY = y + CONSTANTS.ROW_HEIGHT / 2
    let nameText = ''
    let sizeText = ''
    let measuredW: number
    let typesetX = 0
    const typesetW = w + x - textX
    const fillColor = node.inputPath_
      ? canvasFillStyleForInputPath(colorMapping, c, node.inputPath_, zoomedOutMin - viewportMin * scale, CONSTANTS.ROW_HEIGHT, scale * stripeScaleAdjust)
      : otherColor
    let textColor = 'black'
    let childRightEdge = -Infinity

    if (flags & FLAGS.OUTPUT) {
      textColor = fgOnColor
      c.font = boldFont
      currentWidthCache = boldWidthCache
      ellipsisWidth = 3 * charCodeWidth(CONSTANTS.DOT_CHAR_CODE)
    }
    else {
      c.fillStyle = fillColor
      c.fillRect(x, y, rectWidth, CONSTANTS.ROW_HEIGHT)

      // Draw the hover highlight
      if ((flags & FLAGS.HOVER) || (hoveredNode && node.inputPath_ === hoveredNode.inputPath_)) {
        c.fillStyle = 'rgba(255, 255, 255, 0.3)'
        c.fillRect(x, y, rectWidth, CONSTANTS.ROW_HEIGHT)
        flags |= FLAGS.HOVER
      }
    }

    // Typeset the node name
    if (ellipsisWidth < typesetW) {
      nameText = node.name_
      measuredW = c.measureText(nameText).width
      if (measuredW <= typesetW) {
        typesetX += measuredW
      }
      else {
        nameText = textOverflowEllipsis(nameText, typesetW)
        typesetX = typesetW
      }
      c.fillStyle = textColor
      c.fillText(nameText, textX, textY)
    }

    // Switch to the size font
    if (flags & FLAGS.OUTPUT) {
      c.font = normalFont
      currentWidthCache = normalWidthCache
      ellipsisWidth = 3 * charCodeWidth(CONSTANTS.DOT_CHAR_CODE)
    }

    // Typeset the node size
    if (typesetX + ellipsisWidth < typesetW) {
      sizeText = colorMode === COLOR.FORMAT ? moduleTypeLabelInputPath(colorMapping, node.inputPath_, ' – ') : node.sizeText_
      measuredW = c.measureText(sizeText).width
      if (typesetX + measuredW > typesetW) {
        sizeText = textOverflowEllipsis(sizeText, typesetW - typesetX)
      }
      c.globalAlpha = 0.5
      c.fillText(sizeText, textX + typesetX, textY)
      c.globalAlpha = 1
    }

    // Draw the children
    for (const child of node.sortedChildren_) {
      childRightEdge = drawNode(child, y + CONSTANTS.ROW_HEIGHT, startBytes, childRightEdge, flags & ~FLAGS.OUTPUT)
      startBytes += child.bytesInOutput_
    }

    // Draw the outline
    if (!(flags & FLAGS.OUTPUT)) {
      // Note: The stroke deliberately overlaps the right and bottom edges
      strokeRectWithFirefoxBugWorkaround(c, '#222', x + 0.5, y + 0.5, rectWidth, CONSTANTS.ROW_HEIGHT)
    }

    return rightEdge
  }

  let draw = (): void => {
    const bodyStyle = getComputedStyle(document.body)
    let startBytes = 0
    let rightEdge = -Infinity

    animationFrame = null
    fgOnColor = bodyStyle.getPropertyValue('--fg-on')
    c.clearRect(0, 0, width, height)
    c.textBaseline = 'middle'

    for (const child of tree.root_.sortedChildren_) {
      rightEdge = drawNode(child, 0, startBytes, rightEdge, FLAGS.OUTPUT)
      startBytes += child.bytesInOutput_
    }
  }

  let invalidate = (): void => {
    if (animationFrame === null)
      animationFrame = requestAnimationFrame(draw)
  }

  const hitTestNode = (mouseEvent: MouseEvent | WheelEvent): TreeNode | null => {
    const visit = (node: TreeNode, y: number, startBytes: number): TreeNode | null => {
      if (mouseBytes >= startBytes && mouseBytes < startBytes + node.bytesInOutput_) {
        if (mouseY >= y && mouseY < y + CONSTANTS.ROW_HEIGHT && node.inputPath_) {
          return node
        }

        if (mouseY >= y + CONSTANTS.ROW_HEIGHT) {
          for (const child of node.sortedChildren_) {
            const result = visit(child, y + CONSTANTS.ROW_HEIGHT, startBytes)
            if (result)
              return result
            startBytes += child.bytesInOutput_
          }
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

    let mouseBytes = viewportMin + (viewportMax - viewportMin) / zoomedOutWidth * (mouseX - zoomedOutMin)
    let startBytes = 0

    for (const child of tree.root_.sortedChildren_) {
      const result = visit(child, 0, startBytes)
      if (result)
        return result
      startBytes += child.bytesInOutput_
    }

    return null
  }

  const modifyViewport = (deltaX: number, deltaY: number, xForZoom: number | null): void => {
    let min = viewportMin
    let max = viewportMax
    let translate = 0

    if (xForZoom !== null) {
      const mouse = min + (max - min) / zoomedOutWidth * (xForZoom - zoomedOutMin)
      const scale = 1.01 ** deltaY
      min = mouse + (min - mouse) * scale
      max = mouse + (max - mouse) * scale
    }
    else {
      translate = deltaX * (max - min) / zoomedOutWidth
    }

    if (min + translate < 0)
      translate = -min
    else if (max + translate > totalBytes)
      translate = totalBytes - max
    min += translate
    max += translate

    if (min < 0)
      min = 0
    if (max > totalBytes)
      max = totalBytes

    if (viewportMin !== min || viewportMax !== max) {
      viewportMin = min
      viewportMax = max
      invalidate()
    }
  }

  const updateHover = (e: MouseEvent | WheelEvent): void => {
    const node = hitTestNode(e)
    changeHoveredNode(node, e)

    // Show a tooltip for hovered nodes
    events.emit('hover', node, e)
  }

  let didDrag = false

  canvas.onmousedown = (e) => {
    didDrag = false

    if (e.button !== 2) {
      let oldX = e.pageX

      const move = (e: MouseEvent): void => {
        const deltaX = e.pageX - oldX
        if (!didDrag && Math.abs(deltaX) < 3)
          return
        didDrag = true
        modifyViewport(-deltaX, 0, null)
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

  canvas.onmousemove = (e) => {
    updateHover(e)
  }

  canvas.onmouseout = (e) => {
    changeHoveredNode(null, e)
  }

  canvas.onclick = (e) => {
    // Don't trigger on mouse up after a drag
    if (didDrag)
      return

    const node = hitTestNode(e)
    changeHoveredNode(node, e)

    if (node && !node.sortedChildren_.length) {
      events.emit('click', node, e)
    }
  }

  disposables.push(useWheelEventListener((e) => {
    // This compares with the time of the previous zoom to implement "zoom
    // locking" to prevent zoom from changing to scroll if you zoom by
    // flicking on the touchpad with a key pressed but release the key while
    // momentum scrolling is still generating input events.
    const deltaX = e.deltaX
    const deltaY = e.deltaY
    const wheelTime = now()
    const isZoom = wheelTime - prevWheelTime < 50 ? prevWheelWasZoom : e.ctrlKey || e.metaKey
    prevWheelTime = wheelTime
    prevWheelWasZoom = isZoom

    // If we're zooming or panning sideways, then don't let the user interact
    // with the page itself. Note that this has to be ">=" not ">" for Chrome.
    if (isZoom || Math.abs(deltaX) >= Math.abs(deltaY)) {
      e.preventDefault()
    }

    modifyViewport(deltaX, deltaY, isZoom ? e.pageX : null)
    updateHover(e)
  }))

  resize()
  Promise.resolve().then(resize) // Resize once the element is in the DOM

  disposables.push(useDarkModeListener(draw))
  disposables.push(useResizeEventListener(resize))

  function dispose() {
    disposables.forEach(d => d())
    disposables.length = 0
  }

  componentEl.id = styles.flamePanel
  mainEl.append(canvas)
  componentEl.append(mainEl)

  return {
    el: componentEl,
    events,
    draw,
    resize,
    dispose,
  }
}
