import type { Events, GraphBase, GraphBaseOptions, Tree, TreeNode } from '../types/tree'
import { createNanoEvents } from 'nanoevents'
import {
  colorToCanvasFill,
} from '../utils/color'
import { DEFAULT_GRAPH_OPTIONS } from '../utils/defaults'
import {
  now,
  strokeRectWithFirefoxBugWorkaround,
  useDarkModeListener,
  useResizeEventListener,
  useWheelEventListener,
} from '../utils/helpers'

const CONSTANT_MARGIN = 50
const CONSTANT_ROW_HEIGHT = 24
const CONSTANT_TEXT_INDENT = 5
const CONSTANT_DOT_CHAR_CODE = 46
const CONSTANT_ZOOMED_OUT_WIDTH = 1000

// eslint-disable-next-line no-restricted-syntax
const enum FLAGS {
  OUTPUT = 1,
  HOVER = 2,
}

export interface CreateFlamegraphOptions<T> extends GraphBaseOptions<T> {
}

export function createFlamegraph<T>(tree: Tree<T>, options: CreateFlamegraphOptions<T> = {}) {
  const {
    getColor,
    getText,
    getSubtext,
  } = {
    ...DEFAULT_GRAPH_OPTIONS,
    ...options,
  }

  const events = createNanoEvents<Events<T>>()
  if (options.onClick)
    events.on('click', options.onClick)
  if (options.onHover)
    events.on('hover', options.onHover)

  const disposables: (() => void)[] = []
  const totalBytes = tree.root.size
  let viewportMin = 0
  let viewportMax = totalBytes
  const componentEl = document.createElement('div')
  const mainEl = document.createElement('div')
  const canvas = document.createElement('canvas')

  Object.assign(mainEl.style, {
    position: 'relative',
  })
  Object.assign(canvas.style, {
    position: 'absolute',
    left: (-CONSTANT_MARGIN) + 'px',
    top: '0',
  })

  const c = canvas.getContext('2d')!
  let width = 0
  let height = 0
  let zoomedOutMin = 0
  let zoomedOutWidth = 0
  let prevWheelTime = 0
  let prevWheelWasZoom = false
  let stripeScaleAdjust = 1
  let animationFrame: number | null = null
  let hoveredNode: TreeNode<T> | null = null
  let fgOnColor = ''
  const normalFont = '14px sans-serif', boldWidthCache: Record<number, number> = {}
  const boldFont = 'bold ' + normalFont, normalWidthCache: Record<number, number> = {}
  let ellipsisWidth = 0
  let currentWidthCache: Record<number, number> = normalWidthCache

  const changeHoveredNode = (node: TreeNode<T> | null, e: MouseEvent): void => {
    if (hoveredNode !== node) {
      hoveredNode = node
      canvas.style.cursor = node && !node.children.length ? 'pointer' : 'auto'
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
    width = componentEl.clientWidth + 2 * CONSTANT_MARGIN
    height = tree.maxDepth * CONSTANT_ROW_HEIGHT + 1
    zoomedOutMin = (width - CONSTANT_ZOOMED_OUT_WIDTH) >> 1
    zoomedOutWidth = zoomedOutMin + CONSTANT_ZOOMED_OUT_WIDTH
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
  const drawNode = (node: TreeNode<T>, y: number, startBytes: number, prevRightEdge: number, flags: FLAGS): number => {
    const scale = zoomedOutWidth / (viewportMax - viewportMin)
    const x = zoomedOutMin + (startBytes - viewportMin) * scale
    const w = node.size * scale
    const rightEdge = x + w
    if (rightEdge < prevRightEdge + 1.5)
      return prevRightEdge
    if (x + w < 0 || x > width)
      return rightEdge

    const rectWidth = w < 2 ? 2 : w
    const textX = (x > 0 ? x : 0) + CONSTANT_TEXT_INDENT
    const textY = y + CONSTANT_ROW_HEIGHT / 2
    let nameText = ''
    let sizeText = ''
    let measuredW: number
    let typesetX = 0
    const typesetW = w + x - textX
    const fillColor = colorToCanvasFill(getColor(node), c, zoomedOutMin - viewportMin * scale, CONSTANT_ROW_HEIGHT, scale * stripeScaleAdjust)
    let textColor = 'black'
    let childRightEdge = -Infinity

    if (flags & FLAGS.OUTPUT) {
      textColor = fgOnColor
      c.font = boldFont
      currentWidthCache = boldWidthCache
      ellipsisWidth = 3 * charCodeWidth(CONSTANT_DOT_CHAR_CODE)
    }
    else {
      c.fillStyle = fillColor
      c.fillRect(x, y, rectWidth, CONSTANT_ROW_HEIGHT)

      // Draw the hover highlight
      if ((flags & FLAGS.HOVER) || (hoveredNode && node.id === hoveredNode.id)) {
        c.fillStyle = 'rgba(255, 255, 255, 0.3)'
        c.fillRect(x, y, rectWidth, CONSTANT_ROW_HEIGHT)
        flags |= FLAGS.HOVER
      }
    }

    // Typeset the node name
    if (ellipsisWidth < typesetW) {
      nameText = getText(node) || ''
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
      ellipsisWidth = 3 * charCodeWidth(CONSTANT_DOT_CHAR_CODE)
    }

    // Typeset the node size
    if (typesetX + ellipsisWidth < typesetW) {
      sizeText = getSubtext(node) || ''
      if (sizeText)
        sizeText = ' - ' + sizeText
      measuredW = c.measureText(sizeText).width
      if (typesetX + measuredW > typesetW) {
        sizeText = textOverflowEllipsis(sizeText, typesetW - typesetX)
      }
      c.globalAlpha = 0.5
      c.fillText(sizeText, textX + typesetX, textY)
      c.globalAlpha = 1
    }

    // Draw the children
    for (const child of node.children) {
      childRightEdge = drawNode(child, y + CONSTANT_ROW_HEIGHT, startBytes, childRightEdge, flags & ~FLAGS.OUTPUT)
      startBytes += child.size
    }

    // Draw the outline
    if (!(flags & FLAGS.OUTPUT)) {
      // Note: The stroke deliberately overlaps the right and bottom edges
      strokeRectWithFirefoxBugWorkaround(c, '#222', x + 0.5, y + 0.5, rectWidth, CONSTANT_ROW_HEIGHT)
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

    for (const child of tree.root.children) {
      rightEdge = drawNode(child, 0, startBytes, rightEdge, FLAGS.OUTPUT)
      startBytes += child.size
    }
  }

  let invalidate = (): void => {
    if (animationFrame === null)
      animationFrame = requestAnimationFrame(draw)
  }

  const hitTestNode = (mouseEvent: MouseEvent | WheelEvent): TreeNode<T> | null => {
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

    let mouseX = mouseEvent.pageX
    let mouseY = mouseEvent.pageY
    for (let el: HTMLElement | null = canvas; el; el = el.offsetParent as HTMLElement | null) {
      mouseX -= el.offsetLeft
      mouseY -= el.offsetTop
    }

    let mouseBytes = viewportMin + (viewportMax - viewportMin) / zoomedOutWidth * (mouseX - zoomedOutMin)
    let startBytes = 0

    for (const child of tree.root.children) {
      const result = visit(child, 0, startBytes)
      if (result)
        return result
      startBytes += child.size
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

    if (node && !node.children.length) {
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

  // componentEl.id = styles.flamePanel
  mainEl.append(canvas)
  componentEl.append(mainEl)

  return {
    el: componentEl,
    events,
    draw,
    resize,
    dispose,
    [Symbol.dispose]: dispose,
  } satisfies GraphBase<T>
}
