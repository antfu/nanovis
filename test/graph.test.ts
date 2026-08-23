import type { TreeNode } from '../src/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeElement {
  public clientWidth = 100
  public style: Record<string, string> = {}
  private listeners = new Map<string, ((event: any) => void)[]>()

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) || []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  dispatchEvent(event: any): void {
    for (const listener of this.listeners.get(event.type) || [])
      listener(event)
  }

  append(): void {}
  remove(): void {}
}

const context = {
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  getImageData: vi.fn(() => ({})),
  getTransform: vi.fn(() => ({ a: 1, d: 1 })),
  measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  putImageData: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  scale: vi.fn(),
  stroke: vi.fn(),
  strokeRect: vi.fn(),
  fillStyle: '',
  font: '',
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  lineWidth: 1,
  shadowBlur: 0,
  shadowColor: '',
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  strokeStyle: '',
  textAlign: 'start',
  textBaseline: '',
}

class FakeCanvas extends FakeElement {
  public width = 0
  public height = 0

  getContext(): typeof context {
    return context
  }

  getBoundingClientRect(): { left: number, top: number } {
    return { left: 0, top: 0 }
  }
}

function createTree(): TreeNode {
  const child: TreeNode = {
    id: 'child',
    size: 1,
    sizeSelf: 1,
    children: [],
  }
  const root: TreeNode = {
    id: 'root',
    size: 1,
    sizeSelf: 0,
    children: [child],
  }
  child.parent = root
  return root
}

describe('graph drawing', () => {
  let frames: FrameRequestCallback[]

  beforeEach(() => {
    frames = []
    vi.clearAllMocks()
    vi.stubGlobal('document', {
      createElement: (tag: string) => tag === 'canvas' ? new FakeCanvas() : new FakeElement(),
    })
    vi.stubGlobal('innerHeight', 300)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      devicePixelRatio: 1,
      performance,
      removeEventListener: vi.fn(),
    })
  })

  it('recomputes dynamic treemap colors after hover invalidates the graph', async () => {
    const { Treemap } = await import('../src/graph/treemap')
    let hovered: TreeNode | null = null
    const getColor = vi.fn((node: TreeNode) => node === hovered ? '#fff' : '#000')
    const graph = new Treemap(createTree(), {
      animate: false,
      getColor,
      onHover: node => hovered = node,
    })
    await Promise.resolve()
    getColor.mockClear()

    graph.canvas.dispatchEvent({ type: 'mousemove', clientX: 10, clientY: 30 } as MouseEvent)
    expect((hovered as TreeNode | null)?.id).toBe('child')
    expect(frames).toHaveLength(1)
    frames.shift()!(0)

    expect(getColor).toHaveBeenCalled()
  })

  it('passes the canvas context to onDidDraw after every graph draw', async () => {
    const [{ Treemap }, { Flamegraph }, { Sunburst }] = await Promise.all([
      import('../src/graph/treemap'),
      import('../src/graph/flamegraph'),
      import('../src/graph/sunburst'),
    ])

    for (const Graph of [Treemap, Flamegraph, Sunburst] as any[]) {
      const onDidDraw = vi.fn()
      const graph = new Graph(createTree(), { animate: false, onDidDraw })
      onDidDraw.mockClear()

      graph.draw()

      expect(onDidDraw).toHaveBeenCalledExactlyOnceWith(graph.c)
    }
  })
})
