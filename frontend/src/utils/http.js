/**
 * HTTP 请求封装工具。
 *
 * Author: Adorrain
 * Date: 2026-01-30
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
  }).then(res => res.json());

/**
 * 带超时控制的 fetch 请求
 */
export const fetchWithTimeout = async (url, options, timeoutMs = 10000) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
    })
  ]);
};
