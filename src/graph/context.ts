import type { Emitter } from 'nanoevents'
import type { ColorValue, Events, GraphBaseOptions, Palette, Tree, TreeNode } from '../types'
import { createNanoEvents } from 'nanoevents'
import { createColorGetterSpectrum } from '../utils/color'
import { DEFAULT_GRAPH_OPTIONS, DEFAULT_PALETTE } from '../utils/defaults'

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
  invalidate(): void {
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
  tick(): void {
    this.draw()
  }

  /**
   * To be overridden by subclasses to implement custom animation logic.
   */
  draw(): void {}

  resize(): void {
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
}
