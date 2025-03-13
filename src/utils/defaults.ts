import type { GraphBaseOptions, Palette } from '../types'

export const DEFAULT_GRAPH_OPTIONS = {
  getText: node => node.text,
  getSubtext: node => node.subtext,
} satisfies GraphBaseOptions<any>

export const DEFAULT_PALETTE: Palette = {
  fallback: '#CCC',
  stroke: '#0008',
  text: '#222',
  hover: '#fff5',
  shadow: '#0008',
  fg: '#fff',
  bg: '#222',
}
