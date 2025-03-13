import type { GraphBaseOptions } from '../types/tree'

export const DEFAULT_GRAPH_OPTIONS = {
  getColor: node => node.color,
  getText: node => node.text,
  getSubtext: node => node.subtext,
} satisfies GraphBaseOptions<any>
