/**
 * HTTP 请求封装工具
 *
 * 作者: Adorrain
 * 创建时间: 2026-01-30
 */
import { API_BASE } from '../config.js';

/**
 * 向后端发起 JSON POST 请求并解析返回 JSON
 */
export const postJson = (path, body) =>
  fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(res => {
    if (!res.ok) {
      throw new Error(`请求失败：${res.status}`);
    }
    return res.json();
  });
