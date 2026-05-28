import { DeviceStatus } from '../types';

export const judgeDeviceStatus = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'up' || s === 'online') return DeviceStatus.ONLINE;
  if (s === 'offline') return DeviceStatus.OFFLINE;
  if (s === 'warning') return DeviceStatus.WARNING;
  if (s === 'error') return DeviceStatus.ERROR;
  if (s === 'maintenance') return DeviceStatus.MAINTENANCE;
  return status;
};

export const getDeviceStatusLabel = (status) => {
  const s = judgeDeviceStatus(status);
  if (s === DeviceStatus.ONLINE) return '在线';
  if (s === DeviceStatus.WARNING) return '警告';
  if (s === DeviceStatus.ERROR) return '故障';
  if (s === DeviceStatus.OFFLINE) return '离线';
  if (s === DeviceStatus.MAINTENANCE) return '维护中';
  return '未知';
};

export const getDeviceTypeLabel = (deviceType) => {
  const type = String(deviceType || '').toLowerCase();
  if (type.includes('pc') || type.includes('terminal')) return '终端主机';
  if (type.includes('router')) return '路由器';
  if (type.includes('switch')) return '交换机';
  if (type.includes('server')) return '服务器';
  return '通用设备';
};

export const countDeviceStatus = (networkTopology) => {
  const devices = networkTopology?.devices || [];
  const links = networkTopology?.links || [];
  const deviceTotal = devices.length;
  const linkTotal = links.length;
  const activeDevices = devices.filter((device) => {return device?.status ==='up' || device?.status === 'online';}).length;
  const activeLinks = links.filter((link) => link?.status === 'up' || link?.status === 'active').length;
  const offlineDevices = devices.filter((device) => device?.status === 'offline').length;
  const issueDevices = devices.filter((device) => {return device?.status !=='online' && device?.status !== 'up';}).length;
  const maintenanceDevices = devices.filter((device) => device?.status === 'maintenance').length;
  const issueLinks = links.filter((link) => { return link?.status === 'inactive' || link?.status === 'failed';}).length;
  return {
    offlineDevices,
    deviceTotal,
    linkTotal,
    activeDevices,
    activeLinks,
    issueDevices,
    issueLinks,
    maintenanceDevices,
  };
};

export const getVlans = (device) => {
  if (!Array.isArray(device?.interfaces)){
    return [];
  }
  return device.interfaces.flatMap(i => i?.vlans || []);
};