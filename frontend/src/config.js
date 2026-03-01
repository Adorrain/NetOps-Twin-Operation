/*
 * 后端接口
 * Author: Adorrain
 * Date: 2026-03-01
 */

// 使用.env配置环境变量情况下的后端接口获取
// const defaultApiBase = import.meta.env.DEV ? "http://localhost:8000/api" : "/api";
// export const API_BASE = import.meta.env.VITE_API_BASE ?? defaultApiBase;

// 未配置.env环境变量下后端接口
export const API_BASE = "http://localhost:8000/api";