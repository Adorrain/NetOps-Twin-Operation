/*
 * 后端接口基址，由 frontend 下 .env / .env.development / .env.production 中的 VITE_API_BASE 配置。
 * 开发默认 /api，由 vite.config.js 代理到后端；未设置时回退为 /api。
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
