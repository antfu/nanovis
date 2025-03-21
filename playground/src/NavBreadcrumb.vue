<script setup lang="ts">
import type { TreeNode } from 'nanovis'
import { computed } from 'vue'

const props = defineProps<{
  selected?: TreeNode | null
}>()

const emit = defineEmits<{
  (e: 'select', node: TreeNode | null): void
}>()

const parentStack = computed(() => {
  const stack: TreeNode[] = []
  let current = props.selected
  while (current) {
    stack.unshift(current)
    current = current.parent
  }
  return stack
})
</script>

<template>
  <div flex="~ gap-1 items-center wrap font-mono">
    <template v-for="node, idx of parentStack" :key="node.id">
      <div v-if="idx > 0" text-sm op50>
        ⇒
      </div>
      <button
        hover="bg-#8884" rounded px1
        @click="emit('select', node)"
      >
        {{ node.text || node.id }}
      </button>
    </template>
  </div>
</template>
