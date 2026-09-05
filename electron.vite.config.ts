import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve('src/shared')
// app.getVersion() trả về phiên bản Electron khi chạy chưa đóng gói, nên nhúng thẳng số thật
// từ package.json lúc build thay vì hỏi runtime.
const version = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')).version as string

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    define: { __APP_VERSION__: JSON.stringify(version) },
  },
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
