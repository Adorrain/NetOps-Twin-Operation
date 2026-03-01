/**
 * 仿真拓扑类型状态枚举
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

/**
 * 网络设备类型枚举
 */
export const DeviceType = {
  PC: 'pc',
  ROUTER: 'router',
  SWITCH: 'switch',
  SERVER: 'server',
  FIREWALL: 'firewall',
  ACCESS_POINT: 'access_point'
};

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
