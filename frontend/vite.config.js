/**
 * Vite 构建配置。
 *
 * 作者: Adorrain
 * 创建时间: 2026-01-30
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 开发时把 /api 请求转发到后端，避免跨域与 localhost 连接问题
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: '../test/setup.js',
    include: ['../test/**/*.test.js'],
  },
})
