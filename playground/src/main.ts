/* eslint-disable no-console */
import type { Metafile } from '../../port/metafile'
import { COLOR, getColorMapping } from '../../port/color'
import { createFlame } from '../../port/graph/flame'
import { createSunburst } from '../../port/graph/sunburst'
import { createTreemap } from '../../port/graph/treemap'
import { analyzeDirectoryTree } from '../../port/metafile-to-tree'
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

const sunburst = createSunburst(metafile, { colorMapping })
document.body.appendChild(sunburst.el)
