import { fileURLToPath } from 'node:url'

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export const alias = {
  'nanovis/esbuild': r('./src/esbuild/index.ts'),
  'nanovis': r('./src/index.ts'),
}
