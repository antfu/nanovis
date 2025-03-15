import type { Emitter } from 'nanoevents'
import type { ColorValue, Events, GraphBaseOptions, Palette, Tree, TreeNode } from '../types'
import { createNanoEvents } from 'nanoevents'
import { createColorGetterSpectrum } from '../utils/color'
import { DEFAULT_GRAPH_OPTIONS, DEFAULT_PALETTE } from '../utils/defaults'

const CONSTANT_DOT_CHAR_CODE = 46
const CONSTANT_NORMAL_FONT = '14px sans-serif'

export class GraphContext<T, Options extends GraphBaseOptions<T>> {
  public readonly el: HTMLElement

  public readonly canvas: HTMLCanvasElement
  public readonly c: CanvasRenderingContext2D
  public width = 0
  public height = 0

  public tree: Tree<T>
  public readonly events: Emitter<Events<T>>

  public options: Options
  public palette: Palette
  public disposables: (() => void)[]

  public getColor: (node: TreeNode<T>) => ColorValue | undefined
  public getText: (node: TreeNode<T>) => string | undefined
  public getSubtext: (node: TreeNode<T>) => string | undefined

  private _animationFrame: number | null = null

  constructor(tree: Tree<T>, options: Options) {
    this.options = {
      ...DEFAULT_GRAPH_OPTIONS,
      ...options,
    }

    const {
      getColor = createColorGetterSpectrum(tree),
      getText = () => undefined,
      getSubtext = () => undefined,
    } = this.options

    this.palette = {
      ...DEFAULT_PALETTE,
      ...options.palette,
    }

    this.el = document.createElement('div')
    this.canvas = document.createElement('canvas')
    this.c = this.canvas.getContext('2d')!
    this.tree = tree
    this.disposables = []
    this.events = createNanoEvents<Events<T>>()
    this.getColor = getColor
    this.getText = getText
    this.getSubtext = getSubtext

    this.setFont(CONSTANT_NORMAL_FONT)

    if (options.onClick)
      this.events.on('click', options.onClick)
    if (options.onHover)
      this.events.on('hover', options.onHover)
    if (options.onLeave)
      this.events.on('leave', options.onLeave)
    if (options.onSelect)
      this.events.on('select', options.onSelect)

    this.el.addEventListener('mouseleave', () => {
      this.events.emit('leave')
    })
  }

  /**
   * Invalidate the graph and request a new frame.
   */
  public invalidate(): void {
    if (this._animationFrame === null) {
      this._animationFrame = requestAnimationFrame(() => {
        this._animationFrame = null
        this.tick()
      })
    }
  }

  /**
   * To be overridden by subclasses to implement custom animation logic.
   */
  public tick(): void {
    this.draw()
  }

  /**
   * To be overridden by subclasses to implement custom animation logic.
   */
  public draw(): void {}

  public resize(): void {
    const ratio = window.devicePixelRatio || 1
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.canvas.width = Math.round(this.width * ratio)
    this.canvas.height = Math.round(this.height * ratio)
    this.c.scale(ratio, ratio)
    this.draw()
  }

  public dispose(): void {
    this.disposables.forEach(disposable => disposable())
    this.disposables.length = 0
    this.el.remove()
  }

  public [Symbol.dispose](): void {
    this.dispose()
  }

  private _font = '14px sans-serif'
  private _fontWidthCache: Map<string, Record<number, number>> = new Map()
  protected ellipsisWidth = 0

  private getFontCache() {
    if (!this._fontWidthCache.has(this._font))
      this._fontWidthCache.set(this._font, {})
    return this._fontWidthCache.get(this._font)!
  }

  protected setFont(font: string) {
    this._font = font
    this.c.font = font
    this.ellipsisWidth = 3 * this.charCodeWidth(CONSTANT_DOT_CHAR_CODE)
  }

  protected charCodeWidth(ch: number): number {
    const cache = this.getFontCache()
    let width = cache[ch]
    if (width === undefined) {
      width = this.c.measureText(String.fromCharCode(ch)).width
      cache[ch] = width
    }
    return width
  }

  protected textOverflowEllipsis(text: string, width: number): [string, number] {
    if (width < this.ellipsisWidth)
      return ['', 0]
    let textWidth = 0
    const n = text.length
    let i = 0
    while (i < n) {
      const charWidth = this.charCodeWidth(text.charCodeAt(i))
      if (width < textWidth + this.ellipsisWidth + charWidth) {
        return [`${text.slice(0, i)}...`, textWidth + this.ellipsisWidth]
      }
      textWidth += charWidth
      i++
    }

    return [text, textWidth]
  }
}
