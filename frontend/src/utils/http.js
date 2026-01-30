/**
 * HTTP 请求封装工具。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

/**
 * 后端 API 基础地址。
 * @type {string}
 */
import { API_BASE } from './env.js';

/**
 * 向后端发起 JSON POST 请求并解析返回 JSON。
 *
 * @param {string} path API 路径（以 / 开头）。
 * @param {any} body 请求体对象。
 * @returns {Promise<any>} 后端返回的 JSON 数据。
 */
export const postJson = (path, body) =>
  fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(res => res.json());

/**
 * 带超时控制的 fetch 请求。
 *
 * @param {string} url 请求地址。
 * @param {RequestInit} options fetch 参数。
 * @param {number} timeoutMs 超时时间（毫秒）。
 * @returns {Promise<Response>} fetch Response 对象。
 */
export const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};
