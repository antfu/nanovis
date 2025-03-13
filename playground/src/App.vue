<script setup lang="ts">
import type { TreeNode } from '../../src'
import type { Metafile } from '../../src/esbuild/metafile'
import { useMouse } from '@vueuse/core'
import { reactive, shallowRef } from 'vue'
import { createFlame, createSunburst, createTreemap } from '../../src'
import { esbuildMetafileToTree } from '../../src/esbuild/metafile-to-tree'
import { createColorGetterGradient } from '../../src/utils/color'
import data from '../data/esbuild-analyze-example-metafile.json'

const mouse = reactive(useMouse())
const selected = shallowRef<TreeNode<any> | null>(null)

const metafile = data as Metafile
const tree = esbuildMetafileToTree(metafile)
const getColor = createColorGetterGradient(tree)

function onClick(_node: TreeNode<any>) {
  selected.value = null
}
function onHover(node: TreeNode<any> | null) {
  selected.value = node
}

const treemap = createTreemap(tree, { getColor, onClick, onHover })
document.body.appendChild(treemap.el)
const flame = createFlame(tree, { getColor, onClick, onHover })
document.body.appendChild(flame.el)
const sunburst = createSunburst(tree, { getColor, onClick, onHover })
document.body.appendChild(sunburst.el)
</script>

<template>
  <div />
  <div
    v-if="selected"
    style="position: absolute;background:#000;color:#fff;padding:2px 4px;border-radius:4px;"
    :style="{
      left: `${mouse.x + 10}px`,
      top: `${mouse.y + 10}px`,
    }"
  >
    {{ selected?.id }}
  </div>
</template>
