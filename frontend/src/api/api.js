import { postJson, uploadFile, getJson } from '../utils/http';

const uploadTopologyFile = (file) => uploadFile(file);

const ping = (sourceId, targetId) => postJson('/ops/ping', { sourceId, targetId });

const traceroute = (sourceId, targetId) => postJson('/ops/traceroute', { sourceId, targetId });

const smartRoute = (sourceId, targetId) => postJson('/ops/smart/route', { sourceId, targetId });

const ospfLoadBalance = (sourceId, targetId) => postJson('/ops/ospf/loadbalance', { sourceId, targetId });

const peakTraffic = (sourceIds, targetId, totalTraffic) => postJson('/ops/peak', { sourceIds, targetId, totalTraffic });

const updateDeviceStatus = (deviceId, status) => postJson('/ops/device/status', { deviceId, status });

const updateLinkStatus = (linkId, status) => postJson('/ops/link/status', { linkId, status });

const updateInterfaceStatus = (deviceId, port, status) => postJson('/ops/interface/status', { deviceId, port, status });

const configureVlan = (deviceId, port, mode, vlans) => postJson('/ops/vlan/configure', { deviceId, port, mode, vlans });

const updateOspfCost = (linkId, cost) => postJson('/ops/cost/update', { linkId, cost });

const getLogs = () => getJson('/ops/logs');

export const opsApi = {
  getLogs,
  uploadTopologyFile,
  ping,
  traceroute,
  smartRoute,
  ospfLoadBalance,
  peakTraffic,
  updateDeviceStatus,
  updateLinkStatus,
  updateInterfaceStatus,
  configureVlan,
  updateOspfCost,
};
