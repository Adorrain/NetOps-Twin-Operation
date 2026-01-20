export const normalizeIp = (value) => {
  if (!value) return null;
  const s = String(value);
  return s.includes('/') ? s.split('/')[0] : s;
};

export const normalizeDeviceType = (device) =>
  String(device?.deviceType || device?.device_type || device?.role || '').toLowerCase();

export const isLinkActive = (status) => {
  const s = String(status || '').toLowerCase();
  return s === 'up' || s === 'active';
};

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

export const isEndpointDevice = (device) => {
  const t = normalizeDeviceType(device);
  return t === 'pc' || t === 'server' || t === 'terminal' || t === 'host' || t === 'access_point';
};

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

export const isVlanCapableDevice = (device) => {
  if (!device) return false;
  if (device.vlan != null) return true;
  const list = device.vlans || device.configuration?.vlans;
  if (Array.isArray(list) && list.length > 0) return true;
  const ifaces = Array.isArray(device.interfaces) ? device.interfaces : [];
  return ifaces.some(it => it?.vlan != null || it?.mode || it?.allowed_vlans || it?.allowedVlans);
};

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
