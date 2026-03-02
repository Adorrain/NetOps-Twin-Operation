/*
 * 后端接口
 * 开发时使用相对路径 /api，由 Vite 代理到 127.0.0.1:8000，避免跨域与连接失败。
 */
export const API_BASE = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_BASE ?? '/api');