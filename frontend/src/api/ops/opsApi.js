/**
 * 运维相关 API 调用封装。
 *
 * 将前端操作映射到后端 /api/ops 下的接口。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import { postJson } from '../../utils/http';


const ping = (sourceId, targetId) => postJson('/ops/ping', { source_id: sourceId, target_id: targetId });

const traceroute = (sourceId, targetId) => postJson('/ops/traceroute', { source_id: sourceId, target_id: targetId });

const updateDevice = (id, data) => postJson('/ops/device/status', { device_id: id, status: data.status });

const updateConnection = (id, data) => postJson('/ops/link/status', { link_id: id, status: data.status });

const updateInterfaceStatus = (deviceId, ifaceName, status) => postJson('/ops/interface/status', { device_id: deviceId, iface_name: ifaceName, status });

const updateOspf = (deviceId, data) => postJson('/ops/ospf/config', { device_id: deviceId, area: data.area, router_id: data.routerId });

const removeVlan = (deviceId, data) => postJson('/ops/vlan/remove', { device_id: deviceId, port: data.port });


const configureVlan = (deviceId, data) => postJson('/ops/vlan/configure', {device_id: deviceId, port: data.port, mode: data.mode, vlan_id: data.vlanId, allowed_vlans: data.allowedVlans});

const getOspfNeighbors = (deviceId) => postJson('/ops/ospf/neighbors', { device_id: deviceId });

export const opsApi = {
  ping,
  traceroute,
  updateDevice,
  updateConnection,
  updateInterfaceStatus,
  updateOspf,
  removeVlan,
  configureVlan,
  getOspfNeighbors,
};
