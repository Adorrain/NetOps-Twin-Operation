/**
 * 拓扑相关 API 调用封装。
 *
 * 作者: Adorrain
 * 创建时间: 2026-01-30
 */

import { API_BASE, fetchWithTimeout } from '../../utils/http';

/**
 * 上传拓扑配置文件到后端并返回解析后的拓扑数据。
 *
 * @param {File} file 要上传的文件对象。
 * @param {number} timeoutMs 超时时间（毫秒）。
 * @returns {Promise<any>} 后端返回的拓扑数据。
 * @throws {Error} 后端返回非 2xx 时抛出。
 */
export const uploadTopologyFile = async (file, timeoutMs) => {
  const fd = new FormData();
  fd.append('file', file);

  const res = await fetchWithTimeout(`${API_BASE}/network/topology/upload`, { method: 'POST', body: fd }, timeoutMs);
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.detail || '后端上传失败');
  }
  return res.json();
};
