/**
 * 网络数据处理工具。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

/**
 * 规范化设备类型字符串
 */
export const normalizeDeviceType = (device) =>
  String(device?.device_type || device?.role || '').toLowerCase();

/**
 * 判断链路状态是否为“可用/连通”
 */
export const isLinkActive = (status) => {
  if (status == null || status === '') return true;
  const s = String(status || '').toLowerCase();
  return s === 'up' || s === 'active' || s === 'online';
};

/**
 * 汇总设备可推导出的所有 VLAN ID（去重、排序）
 */
export const getAllVlans = (device) => {
  const vlans = new Set();
  if (device?.vlan != null) vlans.add(Number(device.vlan));

  const ifaces = Array.isArray(device?.interfaces) ? device.interfaces : [];
  ifaces.forEach(it => {
    const mode = String(it?.mode || 'access').toLowerCase();
    if (mode === 'trunk') return;
    if (it?.vlan != null) vlans.add(Number(it.vlan));
  });

  return Array.from(vlans).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
};

/**
 * 判断设备是否具备 VLAN 相关能力/配置
 */
export const isVlanCapableDevice = (device) => {
  if (!device) return false;
  if (device.vlan != null) return true;
  const ifaces = Array.isArray(device.interfaces) ? device.interfaces : [];
  return ifaces.some(it => it?.vlan != null || it?.mode || it?.allowed_vlans);
};

/**
 * 判断设备是否为端点设备（PC/服务器/终端等）
 */
export const isEndpointDevice = (device) => {
  const t = normalizeDeviceType(device);
  return t === 'pc' || t === 'server' || t === 'terminal' || t === 'host' || t === 'access_point';
};

/**
 * 获取端点设备的 access VLAN（用于二层隔离判断）
 */
export const getEndpointAccessVlan = (device) => {
  if (!isEndpointDevice(device)) return null;
  if (device?.vlan != null) return Number(device.vlan);
  const ifaces = Array.isArray(device?.interfaces) ? device.interfaces : [];
  for (const it of ifaces) {
    const mode = String(it?.mode || 'access').toLowerCase();
    if (mode !== 'trunk' && it?.vlan != null) return Number(it.vlan);
  }
  return null;
};

/**
 * 获取用于 UI 展示的 VLAN ID（优先使用显式字段，其次从集合推导）
 */
export const getDisplayVlanId = (device) => {
  if (device?.vlan != null) return Number(device.vlan);
  const all = getAllVlans(device);
  return all.length ? all[0] : null;
};
