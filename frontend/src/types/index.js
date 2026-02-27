/**
 * 前端通用类型与枚举常量。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

/**
 * 网络设备类型枚举。
 * @type {{PC:string, ROUTER:string, SWITCH:string, SERVER:string, FIREWALL:string, ACCESS_POINT:string}}
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
 * 设备状态枚举。
 * @type {{ONLINE:string, OFFLINE:string, WARNING:string, ERROR:string, MAINTENANCE:string}}
 */
export const DeviceStatus = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  WARNING: 'warning',
  ERROR: 'error',
  MAINTENANCE: 'maintenance'
};

/**
 * 连接状态枚举。
 * @type {{ACTIVE:string, INACTIVE:string, DEGRADED:string, FAILED:string}}
 */
export const ConnectionStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DEGRADED: 'degraded',
  FAILED: 'failed'
};
