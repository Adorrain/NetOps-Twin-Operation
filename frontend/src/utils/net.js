/**
 * 网络数据处理工具。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

/**
 * 规范化 IP 字符串，移除 CIDR 掩码。
 *
 * @param {any} value IP 值（可能为 null/undefined/非字符串）。
 * @returns {string|null} 规范化后的 IP；无效值返回 null。
 */
export const normalizeIp = (value) => {
  if (!value) return null;
  const s = String(value);
  return s.includes('/') ? s.split('/')[0] : s;
};

/**
 * 规范化设备类型字符串。
 *
 * @param {any} device 设备对象（字段可能为 deviceType/device_type/role）。
 * @returns {string} 小写设备类型字符串。
 */
export const normalizeDeviceType = (device) =>
  String(device?.deviceType || device?.device_type || device?.role || '').toLowerCase();

/**
 * 判断链路状态是否为“可用/连通”。
 *
 * @param {any} status 链路状态值。
 * @returns {boolean} 可用返回 true。
 */
export const isLinkActive = (status) => {
  const s = String(status || '').toLowerCase();
  return s === 'up' || s === 'active';
};

/**
 * 汇总设备可推导出的所有 VLAN ID（去重、排序）。
 *
 * @param {any} device 设备对象（可能包含 vlan/vlans/interfaces 等字段）。
 * @returns {number[]} VLAN ID 列表。
 */
export const getAllVlans = (device) => {
  const vlans = new Set();
  if (device?.vlan != null) vlans.add(Number(device.vlan));

  const list = device?.vlans || device?.configuration?.vlans;
  if (Array.isArray(list)) {
    list.forEach(v => {
      if (typeof v === 'number' || typeof v === 'string') vlans.add(Number(v));
      else if (v && typeof v === 'object' && v.vlan_id != null) vlans.add(Number(v.vlan_id));
    });
  }

  const ifaces = Array.isArray(device?.interfaces) ? device.interfaces : [];
  ifaces.forEach(it => {
    const mode = String(it?.mode || 'access').toLowerCase();
    if (mode === 'trunk') return;
    if (it?.vlan != null) vlans.add(Number(it.vlan));
  });

  return Array.from(vlans).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
};

/**
 * 判断设备是否为端点设备（PC/服务器/终端等）。
 *
 * @param {any} device 设备对象。
 * @returns {boolean} 端点设备返回 true。
 */
export const isEndpointDevice = (device) => {
  const t = normalizeDeviceType(device);
  return t === 'pc' || t === 'server' || t === 'terminal' || t === 'host' || t === 'access_point';
};

/**
 * 获取端点设备的 access VLAN（用于二层隔离判断）。
 *
 * @param {any} device 设备对象。
 * @returns {number|null} VLAN ID；非端点或无法判断返回 null。
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
 * 判断设备是否具备 VLAN 相关能力/配置。
 *
 * @param {any} device 设备对象。
 * @returns {boolean} 存在 VLAN/接口 VLAN 信息时返回 true。
 */
export const isVlanCapableDevice = (device) => {
  if (!device) return false;
  if (device.vlan != null) return true;
  const list = device.vlans || device.configuration?.vlans;
  if (Array.isArray(list) && list.length > 0) return true;
  const ifaces = Array.isArray(device.interfaces) ? device.interfaces : [];
  return ifaces.some(it => it?.vlan != null || it?.mode || it?.allowed_vlans || it?.allowedVlans);
};

/**
 * 获取用于 UI 展示的 VLAN ID（优先使用显式字段，其次从集合推导）。
 *
 * @param {any} device 设备对象。
 * @returns {number|null} VLAN ID；无法推导返回 null。
 */
export const getDisplayVlanId = (device) => {
  if (device?.vlan != null) return Number(device.vlan);
  if (Array.isArray(device?.vlans) && device.vlans.length > 0) {
    const first = device.vlans[0];
    if (typeof first === 'number' || typeof first === 'string') return Number(first);
    if (first && typeof first === 'object' && first.vlan_id != null) return Number(first.vlan_id);
  }
  const all = getAllVlans(device);
  return all.length ? all[0] : null;
};
