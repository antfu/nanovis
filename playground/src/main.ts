/* eslint-disable no-console */
import type { Metafile } from '../../src/esbuild/metafile'
import { createFlame, createSunburst, createTreemap } from '../../src'
import { analyzeDirectoryTree } from '../../src/esbuild/metafile-to-tree'
import { COLOR, getColorMapping } from '../../src/utils/color'
import data from '../esbuild-github-io-analyze-example-metafile.json'
import './index.css'

const metafile = data as Metafile
const tree = analyzeDirectoryTree(metafile)
const colorMapping = getColorMapping(metafile, COLOR.DIRECTORY)
const treemap = createTreemap(tree, { colorMapping })
treemap.events.on('click', (node, e) => {
  console.log('click', node, e)
})
treemap.events.on('hover', (node, e) => {
  console.log('hover', node, e)
})
document.body.appendChild(treemap.el)

const flame = createFlame(tree, { colorMapping })
document.body.appendChild(flame.el)

const sunburst = createSunburst(tree, { colorMapping })
document.body.appendChild(sunburst.el)
