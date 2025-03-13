import { defineConfig } from 'vitest/config'
import { alias } from './alias'

export default defineConfig({
  test: {
    server: {
      deps: {
        inline: ['vitest-package-exports'],
      },
    },
  },
  resolve: {
    alias,
  },
})
