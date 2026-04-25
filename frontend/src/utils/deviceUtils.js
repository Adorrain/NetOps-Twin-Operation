import { DeviceStatus } from '../types';

export const judgeDeviceStatus = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'up' || s === 'active' || s === 'online') return DeviceStatus.ONLINE;
  if (s === 'down' || s === 'offline') return DeviceStatus.OFFLINE;
  if (s === 'warning') return DeviceStatus.WARNING;
  if (s === 'error') return DeviceStatus.ERROR;
  if (s === 'maintenance') return DeviceStatus.MAINTENANCE;
  return status;
};

export const getDeviceStatusLabel = (status) => {
  const s = judgeDeviceStatus(status);
  if (s === DeviceStatus.ONLINE) return '在线 (Online)';
  if (s === DeviceStatus.WARNING) return '警告 (Warning)';
  if (s === DeviceStatus.ERROR) return '故障 (Error)';
  if (s === DeviceStatus.OFFLINE) return '离线 (Offline)';
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

