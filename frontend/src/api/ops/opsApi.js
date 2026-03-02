/**
 * 运维相关 API 调用封装。
 *
 * 将前端操作映射到后端 /api/ops 下的接口。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import { postJson } from '../../utils/http';

/**
 * 发起 Ping 仿真。
 *
 * @param {string} sourceId 源设备 ID。
 * @param {string} targetIp 目标 IP。
 * @returns {Promise<any>} 后端返回的结果。
 */
const ping = (sourceId, targetIp) => postJson('/ops/ping', { source_id: sourceId, target_ip: targetIp });

/**
 * 发起 Traceroute 仿真。
 *
 * @param {string} sourceId 源设备 ID。
 * @param {string} targetIp 目标 IP。
 * @returns {Promise<any>} 后端返回的结果。
 */
const traceroute = (sourceId, targetIp) => postJson('/ops/traceroute', { source_id: sourceId, target_ip: targetIp });

/**
 * 更新设备运行状态。
 *
 * @param {string} id 设备 ID。
 * @param {{status: string}} data 状态参数。
 * @returns {Promise<any>} 后端返回的结果。
 */
const updateDevice = (id, data) => postJson('/ops/device/status', { device_id: id, status: data.status });

/**
 * 更新链路状态。
 *
 * @param {string} id 链路 ID。
 * @param {{status: string}} data 状态参数。
 * @returns {Promise<any>} 后端返回的结果。
 */
const updateConnection = (id, data) => postJson('/ops/link/status', { link_id: id, status: data.status });

/**
 * 更新设备接口状态。
 *
 * @param {string} deviceId 设备 ID。
 * @param {string} ifaceName 接口名称。
 * @param {string} status 接口状态。
 * @returns {Promise<any>} 后端返回的结果。
 */
const updateInterfaceStatus = (deviceId, ifaceName, status) =>
  postJson('/ops/interface/status', { device_id: deviceId, iface_name: ifaceName, status });

/**
 * 更新设备 OSPF 配置。
 *
 * @param {string} deviceId 设备 ID。
 * @param {{area: number, routerId?: string}} data OSPF 参数。
 * @returns {Promise<any>} 后端返回的结果。
 */
const updateOspf = (deviceId, data) =>
  postJson('/ops/ospf/config', { device_id: deviceId, area: data.area, router_id: data.routerId });

/**
 * 重置设备 OSPF 进程。
 *
 * @param {string} deviceId 设备 ID。
 * @returns {Promise<any>} 后端返回的结果。
 */
const resetOspf = (deviceId) => postJson('/ops/ospf/reset', { device_id: deviceId });

/**
 * 移除端口 VLAN 配置。
 *
 * @param {string} deviceId 设备 ID。
 * @param {{port: string}} data 端口参数。
 * @returns {Promise<any>} 后端返回的结果。
 */
const removeVlan = (deviceId, data) => postJson('/ops/vlan/remove', { device_id: deviceId, port: data.port });

/**
 * 配置端口 VLAN 模式（access/trunk）。
 *
 * @param {string} deviceId 设备 ID。
 * @param {{port: string, mode: string, vlanId?: number, allowedVlans?: number[]}} data VLAN 参数。
 * @returns {Promise<any>} 后端返回的结果。
 */
const configureVlan = (deviceId, data) =>
  postJson('/ops/vlan/configure', {
    device_id: deviceId,
    port: data.port,
    mode: data.mode,
    vlan_id: data.vlanId,
    allowed_vlans: data.allowedVlans
  });

/**
 * 查询设备 OSPF 邻居信息。
 *
 * @param {string} deviceId 设备 ID。
 * @returns {Promise<any>} 后端返回的结果。
 */
const getOspfNeighbors = (deviceId) => postJson('/ops/ospf/neighbors', { device_id: deviceId });

export const opsApi = {
  ping,
  traceroute,
  updateDevice,
  updateConnection,
  updateInterfaceStatus,
  updateOspf,
  resetOspf,
  removeVlan,
  configureVlan,
  getOspfNeighbors
};
