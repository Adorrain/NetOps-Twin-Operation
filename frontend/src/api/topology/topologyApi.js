/**
 * 拓扑相关 API 调用封装。
 *
 * 作者: Adorrain
 * 创建时间: 2026-01-30
 */


/**
 * 上传拓扑配置文件到后端并返回解析后的拓扑数据。
 */
export const uploadTopologyFile = async (file, timeoutMs = 30000) => {
  const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

  const fd = new FormData();
  fd.append('file', file);

  const controller = new AbortController();

  setTimeout(() => { controller.abort(); }, timeoutMs);

  const res = await fetch(`${API_BASE}/topology/upload`, { method: 'POST', body: fd, signal: controller.signal });

  if (!res.ok) {
    throw new Error(`上传失败：${res.status}`);
  }
  return res.json();
};