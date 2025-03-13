import { createTreemap } from '../../port/treemap'
import data from '../esbuild-github-io-analyze-example-metafile.json'
import '../../port/index.css'

document.body.innerHTML = 'Hello World'

const tree = createTreemap(data as any)

document.body.appendChild(tree.el)
