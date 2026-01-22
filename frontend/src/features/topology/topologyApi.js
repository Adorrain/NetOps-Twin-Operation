import { API_BASE, fetchWithTimeout } from '../../utils/http';

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

