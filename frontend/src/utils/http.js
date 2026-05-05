import { API_BASE } from '../config.js';

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

export const getJson = (path) =>
  fetch(`${API_BASE}${path}`).then(res => {
    if (!res.ok) throw new Error(`请求失败：${res.status}`);
    return res.json();
  });

export const uploadFile = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${API_BASE}/topology/upload`, {
    method: 'POST',
    body: formData,
  }).then(res => {
    if (!res.ok) throw new Error(`请求失败：${res.status}`);
    return res.json();
  });
};