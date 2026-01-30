/**
 * 拓扑数据转换与布局计算。
 *
 * 将后端返回的拓扑结构转换为前端 3D/界面可用的数据格式，并生成默认布局坐标。
 *
 * 作者: Adorrain
 * 创建时间: 2026-01-30
 */

import { getAllVlans, getEndpointAccessVlan } from '../../utils/net';

/**
 * 根据设备名称/类型推断其逻辑角色。
 *
 * @param {any} device 设备对象。
 * @returns {string} 角色标识（core/aggregation/access/firewall/terminal）。
 */
export const inferRole = (device) => {
  const name = String(device?.name || '').toLowerCase();
  if (device?.role) return String(device.role).toLowerCase();

  if (name.includes('核心') || name.includes('core')) return 'core';
  if (name.includes('汇聚') || name.includes('agg') || name.includes('distribution')) return 'aggregation';
  if (name.includes('接入') || name.includes('access') || name.includes('edge')) return 'access';
  if (name.includes('防火墙') || name.includes('firewall') || name.includes('fw')) return 'firewall';

  const t = String(device?.deviceType || device?.device_type || device?.type || '').toLowerCase();
  if (t === 'router') return 'core';
  if (t === 'switch' || t === 'l2_switch') return 'access';
  if (t === 'l3_switch') return 'aggregation';
  if (t === 'firewall') return 'firewall';

  return 'terminal';
};

/**
 * 为设备列表生成简易的分层布局坐标。
 *
 * @param {any[]} devices 设备列表。
 * @returns {Record<string, {x:number,y:number,z:number}>} 以设备 id 为 key 的坐标映射。
 */
export const calculateLayout = (devices) => {
  const core = devices.filter((d) => inferRole(d) === 'core');
  const agg = devices.filter((d) => inferRole(d) === 'aggregation');
  const access = devices.filter((d) => inferRole(d) === 'access');
  const others = devices.filter((d) => !['core', 'aggregation', 'access'].includes(inferRole(d)));

  const layout = {};
  const spacingX = 6;

  core.forEach((d, i) => {
    layout[d.id] = { x: (i - (core.length - 1) / 2) * spacingX, y: 0, z: -5 };
  });

  agg.forEach((d, i) => {
    layout[d.id] = { x: (i - (agg.length - 1) / 2) * spacingX, y: 0, z: 2 };
  });

  access.forEach((d, i) => {
    layout[d.id] = { x: (i - (access.length - 1) / 2) * spacingX, y: 0, z: 9 };
  });

  others.forEach((d, i) => {
    layout[d.id] = { x: (i - (others.length - 1) / 2) * (spacingX / 2), y: 0, z: 15 };
  });

  return layout;
};

/**
 * 将后端拓扑配置转换为前端统一的 topology 结构。
 *
 * @param {any} cfg 后端返回或导入的拓扑配置对象。
 * @returns {any} 前端使用的拓扑对象（包含 devices 与 connections）。
 */
export const buildFrontendTopology = (cfg) => {
  const computedLayout = calculateLayout(cfg.devices || []);

  const devices = (cfg.devices || []).map((d) => {
    const derivedVlans = getAllVlans(d);
    const normalizedVlans = Array.isArray(d.vlans) && d.vlans.length > 0 ? d.vlans : derivedVlans.map((v) => ({ vlan_id: v, name: `VLAN${v}` }));

    return {
      id: String(d.id),
      name: d.name,
      role: inferRole(d),
      deviceType: d.deviceType || d.device_type || d.type || 'unknown',
      position: d.position || computedLayout[d.id] || { x: Math.random() * 20 - 10, y: 0, z: Math.random() * 20 - 10 },
      status: d.status === 'down' || d.status === 'offline' ? 'offline' : 'online',
      vlan: getEndpointAccessVlan(d) ?? undefined,
      configuration: {
        ...d.configuration,
        ospf: d.ospf,
        vlans: normalizedVlans
      },
      metrics: d.metrics || {
        cpuUsage: Math.floor(Math.random() * 30),
        memoryUsage: Math.floor(Math.random() * 40),
        diskUsage: 20,
        networkIn: 0,
        networkOut: 0,
        uptime: 0,
        lastUpdated: new Date()
      },
      ipAddress: d.mgmt_ip || d.ip,
      macAddress: d.mac_address,
      description: d.description,
      interfaces: d.interfaces || [],
      ospf: d.ospf,
      vlans: normalizedVlans
    };
  });

  const connections = (cfg.links || cfg.connections || []).map((c) => ({
    id: c.id,
    sourceDeviceId: String(c.src_device_id || c.src_device || c.source || c.sourceDeviceId),
    targetDeviceId: String(c.dst_device_id || c.dst_device || c.target || c.targetDeviceId),
    connectionType: c.type || 'ethernet',
    status: c.status || 'up',
    from: String(c.src_device_id || c.src_device || c.source || c.sourceDeviceId),
    to: String(c.dst_device_id || c.dst_device || c.target || c.targetDeviceId),
    bandwidth: c.bandwidth || 1000,
    latency: c.latency || 1,
    packetLoss: c.packet_loss || 0
  }));

  return {
    id: 'imported-topology',
    name: cfg.topology?.name || cfg.name || '导入的拓扑',
    description: cfg.description,
    devices,
    connections,
    createdAt: new Date(),
    updatedAt: new Date()
  };
};
