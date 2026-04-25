/**
 * 仿真拓扑类型状态枚举
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */


/**
 * 设备状态枚举
 */
export const DeviceStatus = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  WARNING: 'warning',
  ERROR: 'error',
  MAINTENANCE: 'maintenance'
};

/**
 * 连接状态枚举
 */
export const ConnectionStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DEGRADED: 'degraded',
  FAILED: 'failed'
};

/**
 * 设备尺寸配置
 */
export const DEVICE_SIZE_CONFIG = {
  core: { size: [3, 0.8, 2] },
  aggregation: { size: [2.5, 0.6, 1.8] },
  access: { size: [2, 0.5, 1.5] },
  edge: { size: [2.3, 0.7, 1.7] },
  server: { size: [1.2, 2.5, 1.2] },
  router: { size: [2.6, 0.8, 2.1] },
  pc: { size: [0.8, 0.6, 0.1] },
};


/**
 * VLAN 颜色配置
 */
export const VLAN_PALETTE = [
  '#f472b6',
  '#22d3ee',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#60a5fa',
  '#c084fc',
];
