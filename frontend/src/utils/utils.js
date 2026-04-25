/**
 * 网络数据处理工具。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

/**
 * 判断链路状态是否为“可用/连通”
 */
export const isLinkActive = (status) => {
  const s = String(status).toLowerCase();
  return s === 'up';
};

/**
 * 计算拓扑健康统计（用于侧边栏/监控概览复用）
 */
export const getTopologyHealth = (networkTopology) => {
  const devices = Array.isArray(networkTopology?.devices) ? networkTopology?.devices : [];
  const links = Array.isArray(networkTopology?.links) ? networkTopology?.links : [];
  const normalizeStatus = (status) => String(status).toLowerCase();
  const activeDevices = devices.filter((device) => {
    const s = normalizeStatus(device?.status);
    return s !== 'offline' && s !== 'maintenance' && s !== 'error';
  }).length;
  const activeLinks = links.filter((link) => isLinkActive(link?.status)).length;
  const issueDevices = devices.filter((device) => {
    const s = normalizeStatus(device?.status);
    return s === 'offline' || s === 'maintenance' || s === 'warning' || s === 'error';
  }).length;
  const issueLinks = links.filter((link) => {
    const s = normalizeStatus(link?.status);
    return s === 'inactive' || s === 'failed';
  }).length;
  const deviceTotal = devices.length;
  const linkTotal = links.length;
  const deviceHealth = deviceTotal ? Math.round((activeDevices / deviceTotal) * 100) : 0;
  const linkHealth = linkTotal ? Math.round((activeLinks / linkTotal) * 100) : 0;
  const healthScore = Math.round(deviceHealth * 0.65 + linkHealth * 0.35);
  return {
    deviceTotal,
    linkTotal,
    activeDevices,
    activeLinks,
    issueDevices,
    issueLinks,
    deviceHealth,
    linkHealth,
    healthScore,
  };
};

/**
 * 汇总设备可推导出的所有 VLAN ID（去重、排序）
 */
export const getVlans = (device) => {
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
  const type = String(device?.deviceType || '').toLowerCase();
  const name = String(device?.name || '').toLowerCase();
  const role = String(device?.role || '').toLowerCase();
  if (
    type.includes('switch') ||
    name.includes('交换机') ||
    role === 'access' ||
    role === 'aggregation'
  ) {
    return true;
  }
  if (device.vlan != null) return true;
  const ifaces = Array.isArray(device.interfaces) ? device.interfaces : [];
  return ifaces.some(it => it?.vlan != null || it?.mode || it?.allowedVlans);
};

