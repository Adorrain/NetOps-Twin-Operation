/**
 * Vite 构建配置。
 *
 * 作者: Adorrain
 * 创建时间: 2026-01-30
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  const backendUrl =
    env.BACKEND_URL?.trim() || 'http://127.0.0.1:8080'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target: backendUrl, changeOrigin: true },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: '../test/setup.js',
      include: ['../test/**/*.test.js'],
    },
  }
})
