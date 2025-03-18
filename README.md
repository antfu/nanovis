# nanovis

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

Tiny visualization library for rendering tree structure in Treemap, Sunburst, Flame.

Algorithm is ported from [esbuild Bundle Size Analyzer](https://esbuild.github.io/analyze/) by [Evan Wallace](https://github.com/evanw). Refactored heavily to make the logic more flexible and efficient.

## Features

- Canvas-based, more efficient
- Interactive, animations
- Flexible and customizable
- Lightweight, zero-dependencies

## Usage

```ts
import { Flamegraph, normalizeTreeNode, Sunburst, Treemap } from 'nanovis'

const tree = normalizeTreeNode({
  // ...
})

const flamegraph = new Flamegraph(tree) // or Sunburst(tree) or Treemap(tree)

// Register events
flamegraph.events.on('select', (node) => {
  console.log(node)
})
flamegraph.events.on('hover', (node) => {
  console.log(node)
})

// Mount the element to the DOM
document.body.append(flamegraph.el)
```

The `tree` data should be in the following format:

```ts
/**
 * Normalized TreeNode, can be created with `normalizeTreeNode` from a more flexible input.
 */
export interface TreeNode<T = undefined> {
  /**
   * Id of the node, should be unique within the tree.
   * If created with `normalizeTreeNode`, this is will be generated with random string if not provided.
   */
  id: string
  /**
   * Text to display for the node.
   */
  text?: string
  /**
   * Subtext to display for the node.
   */
  subtext?: string
  /**
   * The size of the node itself, not including its children.
   */
  sizeSelf: number
  /**
   * Size of the node, used to calculate the area of the node.
   * For a node with children, this is the size should be the sum of the sizes of all children.
   * When creating the treeNode With `normalizeTreeNode`, this is calculated automatically.
   */
  size: number
  /**
   * Color of the node, used to color the node.
   */
  color?: ColorValue
  /**
   * Children of the node. Should be sorted by size in descending order.
   */
  children: TreeNode<T>[]
  /**
   * Parent of the node.
   */
  parent?: TreeNode<T>
  /**
   * Arbitrary metadata held by the node.
   */
  meta?: T
}
```

## License

[MIT](./LICENSE) License

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/nanovis?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/nanovis
[npm-downloads-src]: https://img.shields.io/npm/dm/nanovis?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/nanovis
[bundle-src]: https://img.shields.io/bundlephobia/minzip/nanovis?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=nanovis
[license-src]: https://img.shields.io/github/license/antfu/nanovis.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/antfu/nanovis/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/nanovis
