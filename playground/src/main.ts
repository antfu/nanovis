/* eslint-disable no-console */
import { createFlame } from '../../port/flame'
import { createSunburst } from '../../port/sunburst'
import { createTreemap } from '../../port/treemap'
import data from '../esbuild-github-io-analyze-example-metafile.json'
import './index.css'

document.body.innerHTML = 'Hello World'

const tree = createTreemap(data as any)
tree.events.on('click', (node, e) => {
  console.log('click', node, e)
})

tree.events.on('hover', (node, e) => {
  console.log('hover', node, e)
})
document.body.appendChild(tree.el)

const flame = createFlame(data as any)
document.body.appendChild(flame)

const sunburst = createSunburst(data as any)
document.body.appendChild(sunburst)
