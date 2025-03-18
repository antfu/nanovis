import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../alias'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    Vue(),
    UnoCSS(),
  ],
  resolve: {
    alias,
  },
})
