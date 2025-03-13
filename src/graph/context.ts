import type { Events, GraphBaseOptions, Tree } from '../types'
import { createNanoEvents } from 'nanoevents'
import { createColorGetterSpectrum } from '../utils/color'
import { DEFAULT_GRAPH_OPTIONS, DEFAULT_PALETTE } from '../utils/defaults'

export function createGraphContext<T>(
  tree: Tree<T>,
  options: GraphBaseOptions<T> = {},
) {
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
    getColor,
    getText,
    getSubtext,
    dispose,
  }
}
