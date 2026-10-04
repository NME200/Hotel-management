import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import { BACKEND_ORIGIN } from './src/request.ts'

// 前端不读取任何 env 配置：接口只用相对路径 /api/v1。
// dev 环境由下面的 proxy 转发到后端（地址只有 src/request.ts 一处）；
// 生产环境由同域反向代理承接，构建产物无需改动。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: BACKEND_ORIGIN,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Element Plus 按 DESIGN.md 要求整体引入，主包体积天然较大，这里放宽阈值而非拆包魔法配置
    chunkSizeWarningLimit: 1200,
  },
})
