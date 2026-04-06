/**
 * 运维相关 API 调用封装。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import { postJson } from '../../utils/http';


const ping = (sourceId, targetId) => postJson('/ops/ping', { sourceId, targetId });

const traceroute = (sourceId, targetId) => postJson('/ops/traceroute', { sourceId, targetId });

const updateDevice = (id, data) => postJson('/ops/device/status', { deviceId: id, status: data.status });

const updateConnection = (id, data) => postJson('/ops/link/status', { linkId: id, status: data.status });

const updateInterfaceStatus = (deviceId, ifaceName, status) => postJson('/ops/interface/status', { deviceId, ifaceName, status });

const updateOspf = (deviceId, data) => postJson('/ops/ospf/config', { deviceId, area: data.area, routerId: data.routerId });

const recoverVlan = (deviceId, data) => postJson('/ops/vlan/recover', { deviceId, port: data.port });

const configureVlan = (deviceId, data) => postJson('/ops/vlan/configure', { deviceId, port: data.port, mode: data.mode, vlanId: data.vlanId, allowedVlans: data.allowedVlans });

const getOspfNeighbors = (deviceId) => postJson('/ops/ospf/neighbors', { deviceId });

export const opsApi = {
  ping,
  traceroute,
  updateDevice,
  updateConnection,
  updateInterfaceStatus,
  updateOspf,
  recoverVlan,
  configureVlan,
  getOspfNeighbors,
};
