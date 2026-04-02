/**
 * 拓扑相关 API 调用封装。
 *
 * 作者: Adorrain
 * 创建时间: 2026-01-30
 */

import { fetchWithTimeout } from '../../utils/http';

/**
 * 上传拓扑配置文件到后端并返回解析后的拓扑数据。
 */
export const uploadTopologyFile = async (file, timeoutMs) => {
  const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
  const fd = new FormData();
  fd.append('file', file);

  const res = await fetchWithTimeout(`${API_BASE}/topology/upload`, { method: 'POST', body: fd }, timeoutMs);
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.detail || '后端上传失败');
  }
  return res.json();
};
