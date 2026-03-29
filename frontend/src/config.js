/*
 * 开发默认 /api，由 vite.config.js 代理到后端；未设置时回退为 /api。
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
