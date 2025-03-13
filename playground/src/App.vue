<script setup lang="ts">
import type { TreeNode } from 'nanovis'
import type { Metafile } from 'nanovis/esbuild'
import { useMouse } from '@vueuse/core'
import { createColorGetterGradient, createFlamegraph, createSunburst, createTreemap } from 'nanovis'
import { esbuildMetafileToTree } from 'nanovis/esbuild'
import { onMounted, onUnmounted, reactive, shallowRef, useTemplateRef } from 'vue'
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
const el = useTemplateRef('el')

onMounted(() => {
  const treemap = createTreemap(tree, { getColor, onClick, onHover })
  el.value!.appendChild(treemap.el)
  const flamegraph = createFlamegraph(tree, { getColor, onClick, onHover })
  el.value!.appendChild(flamegraph.el)
  const sunburst = createSunburst(tree, { getColor, onClick, onHover })
  el.value!.appendChild(sunburst.el)

  onUnmounted(() => {
    treemap.dispose()
    flamegraph.dispose()
    sunburst.dispose()
  })
})
</script>

<template>
  <div ref="el" />
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
