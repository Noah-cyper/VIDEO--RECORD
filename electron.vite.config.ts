import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve('src/shared')

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], resolve: { alias: { '@shared': shared } } },
  preload: { plugins: [externalizeDepsPlugin()], resolve: { alias: { '@shared': shared } } },
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html'),
        },
      },
    },
  },
})
