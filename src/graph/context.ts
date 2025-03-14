import type { Emitter } from 'nanoevents'
import type { ColorValue, Events, GraphBaseOptions, Palette, Tree, TreeNode } from '../types'
import { createNanoEvents } from 'nanoevents'
import { createColorGetterSpectrum } from '../utils/color'
import { DEFAULT_GRAPH_OPTIONS, DEFAULT_PALETTE } from '../utils/defaults'

export interface GraphContext<T> {
  el: HTMLElement
  events: Emitter<Events<T>>
  options: GraphBaseOptions<T>
  palette: Palette
  disposables: (() => void)[]
  getColor: (node: TreeNode<T>) => ColorValue | undefined
  getText: (node: TreeNode<T>) => string | undefined
  getSubtext: (node: TreeNode<T>) => string | undefined
  dispose: () => void
  [Symbol.dispose]: () => void
}

export function createGraphContext<T>(
  tree: Tree<T>,
  options: GraphBaseOptions<T> = {},
): GraphContext<T> {
  const merged = {
    ...DEFAULT_GRAPH_OPTIONS,
    ...options,
  }
  const {
    getColor = createColorGetterSpectrum(tree),
    getText,
    getSubtext,
  } = merged

  const palette = {
    ...DEFAULT_PALETTE,
    ...options.palette,
  }

  const el = document.createElement('div')
  const disposables: (() => void)[] = []
  const events = createNanoEvents<Events<T>>()
  if (options.onClick)
    events.on('click', options.onClick)
  if (options.onHover)
    events.on('hover', options.onHover)
  if (options.onLeave)
    events.on('leave', options.onLeave)
  if (options.onSelect)
    events.on('select', options.onSelect)

  function dispose() {
    disposables.forEach(disposable => disposable())
    disposables.length = 0
    el.remove()
  }

  el.addEventListener('mouseleave', () => {
    events.emit('leave')
  })

  return {
    el,
    events,
    disposables,
    palette,
    options: merged,
    getColor,
    getText,
    getSubtext,
    dispose,
    [Symbol.dispose]: dispose,
  }
}
