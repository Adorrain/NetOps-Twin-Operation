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
})
