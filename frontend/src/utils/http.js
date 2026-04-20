/**
 * HTTP 请求封装工具。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */
import { API_BASE } from '../config.js';

/**
 * 向后端发起 JSON POST 请求并解析返回 JSON。
 * 若无法连接后端（如未启动），会抛出更明确的错误提示。
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
