import { DeviceStatus } from '../types';

export const normalizeDeviceStatus = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'up' || s === 'active' || s === 'online') return DeviceStatus.ONLINE;
  if (s === 'down' || s === 'offline') return DeviceStatus.OFFLINE;
  if (s === 'warning') return DeviceStatus.WARNING;
  if (s === 'error') return DeviceStatus.ERROR;
  if (s === 'maintenance') return DeviceStatus.MAINTENANCE;
  return status;
};

export const getDeviceStatusColor = (status) => {
  const s = normalizeDeviceStatus(status);
  if (s === DeviceStatus.ONLINE) return '#22c55e';
  if (s === DeviceStatus.WARNING) return '#eab308';
  if (s === DeviceStatus.ERROR) return '#ef4444';
  return '#64748b';
};

export const getDeviceStatusBg = (status) => {
  const s = normalizeDeviceStatus(status);
  if (s === DeviceStatus.ONLINE) return 'rgba(34, 197, 94, 0.1)';
  if (s === DeviceStatus.WARNING) return 'rgba(234, 179, 8, 0.1)';
  if (s === DeviceStatus.ERROR) return 'rgba(239, 68, 68, 0.1)';
  return 'rgba(100, 116, 139, 0.1)';
};

export const getDeviceStatusBorder = (status) => {
  const s = normalizeDeviceStatus(status);
  if (s === DeviceStatus.ONLINE) return 'rgba(34, 197, 94, 0.3)';
  if (s === DeviceStatus.WARNING) return 'rgba(234, 179, 8, 0.3)';
  if (s === DeviceStatus.ERROR) return 'rgba(239, 68, 68, 0.3)';
  return 'rgba(100, 116, 139, 0.3)';
};

export const getDeviceStatusLabel = (status) => {
  const s = normalizeDeviceStatus(status);
  if (s === DeviceStatus.ONLINE) return '在线 (Online)';
  if (s === DeviceStatus.WARNING) return '警告 (Warning)';
  if (s === DeviceStatus.ERROR) return '故障 (Error)';
  if (s === DeviceStatus.OFFLINE) return '离线 (Offline)';
  if (s === DeviceStatus.MAINTENANCE) return '维护中';
  return '未知';
};

export const getDeviceTypeLabel = (deviceType) => {
  const type = String(deviceType || '').toLowerCase();
  if (type.includes('pc') || type.includes('host') || type.includes('terminal')) return '终端主机';
  if (type.includes('router')) return '路由器';
  if (type.includes('switch')) return '交换机';
  if (type.includes('server')) return '服务器';
  return '通用设备';
};

