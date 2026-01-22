import { getAllVlans, getEndpointAccessVlan } from '../../utils/net';

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

