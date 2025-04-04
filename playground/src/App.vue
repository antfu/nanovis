<script setup lang="ts">
import type { GraphBaseOptions, TreeNode } from 'nanovis'
import type { Metafile } from 'nanovis/esbuild'
import { useFps, useMouse } from '@vueuse/core'
import { createColorGetterSpectrum, Flamegraph, Sunburst, Treemap } from 'nanovis'
import { esbuildMetafileToTree } from 'nanovis/esbuild'
import { onMounted, onUnmounted, reactive, shallowRef, useTemplateRef, watch } from 'vue'
import data from '../data/esbuild-analyze-example-metafile.json'
import NavBreadcrumb from './NavBreadcrumb.vue'

const fps = useFps()
const mouse = reactive(useMouse({
  initialValue: { x: -200, y: -200 },
}))

const metafile = data as Metafile
const tree = esbuildMetafileToTree(metafile) as TreeNode<undefined>
const getColor = createColorGetterSpectrum(tree)
const selected = shallowRef<TreeNode<any> | null>(tree)
const hovering = shallowRef<TreeNode<any> | null>()

const options: GraphBaseOptions = {
  getColor,
  onSelect(node) {
    selected.value = node
  },
  onHover(node) {
    hovering.value = node
  },
  onLeave() {
    hovering.value = null
  },
  // animate: false,
  // animateDuration: 1000,
}

const elTreemap = useTemplateRef('el-treemap')
const elFlamegraph = useTemplateRef('el-flamegraph')
const elSunburst = useTemplateRef('el-sunburst')

onMounted(() => {
  const treemap = new Treemap(tree, { ...options, getColor: createColorGetterSpectrum(tree, 0.6) })
  elTreemap.value!.appendChild(treemap.el)
  const flamegraph = new Flamegraph(tree, options)
  elFlamegraph.value!.appendChild(flamegraph.el)
  const sunburst = new Sunburst(tree, options)
  elSunburst.value!.appendChild(sunburst.el)

  watch(selected, () => {
    treemap.select(selected.value ?? null)
    flamegraph.select(selected.value ?? null)
    sunburst.select(selected.value ?? null)
  }, { immediate: true })

  onUnmounted(() => {
    treemap.dispose()
    flamegraph.dispose()
    sunburst.dispose()
  })
})
</script>

<template>
  <div fixed left-0 top-0 right-0 p2 bg-black:75 backdrop-blur-5px font-mono text-white z-100 flex="~ gap-3">
    <NavBreadcrumb :selected flex-auto @select="e => selected = e" />
    <div>
      fps: {{ fps }}
    </div>
  </div>
  <div mt20 />

  <div flex="~ col gap-4" p2>
    <div ref="el-flamegraph" />
    <div grid="~ gap-2 cols-[3fr_1fr]">
      <div ref="el-treemap" />
      <div ref="el-sunburst" :style="{ maxWidth: '500px' }" />
    </div>
  </div>

  <div
    v-if="hovering"
    bg-black:75 p1 px2 rounded text-white absolute text-sm
    :style="{
      left: `${mouse.x + 10}px`,
      top: `${mouse.y + 10}px`,
    }"
  >
    <div>{{ hovering?.text }}</div>
    <div op50 text-xs>
      {{ hovering?.id }}
    </div>
  </div>
</template>
