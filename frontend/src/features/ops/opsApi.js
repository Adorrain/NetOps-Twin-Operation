import { postJson } from '../../utils/http';

export const opsApi = {
  ping: (sourceId, targetIp) => postJson('/ops/ping', { source_id: sourceId, target_ip: targetIp }),
  traceroute: (sourceId, targetIp) => postJson('/ops/traceroute', { source_id: sourceId, target_ip: targetIp }),
  ddos: (data) => postJson('/ops/ddos/simulate', { target_id: data.target }),
  updateDevice: (id, data) => postJson('/ops/device/status', { device_id: id, status: data.status }),
  updateConnection: (id, data) => postJson('/ops/link/status', { link_id: id, status: data.status }),
  updateInterfaceStatus: (deviceId, ifaceName, status) =>
    postJson('/ops/interface/status', { device_id: deviceId, iface_name: ifaceName, status }),
  updateOspf: (deviceId, data) => postJson('/ops/ospf/config', { device_id: deviceId, area: data.area, routerId: data.routerId }),
  resetOspf: (deviceId) => postJson('/ops/ospf/reset', { device_id: deviceId }),
  removeVlan: (deviceId, data) => postJson('/ops/vlan/remove', { device_id: deviceId, port: data.port }),
  configureVlan: (deviceId, data) =>
    postJson('/ops/vlan/configure', { device_id: deviceId, port: data.port, mode: data.mode, vlan_id: data.vlanId, allowed_vlans: data.allowedVlans }),
  getOspfNeighbors: (deviceId) => postJson('/ops/ospf/neighbors', { device_id: deviceId })
};

