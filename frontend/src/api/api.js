import { postJson, uploadFile, getJson } from '../utils/http';

const uploadTopologyFile = (file) => uploadFile(file);

const ping = (sourceId, targetId) => postJson('/ops/ping', { sourceId, targetId });

const traceroute = (sourceId, targetId) => postJson('/ops/traceroute', { sourceId, targetId });

const traceSmartRoute = (sourceId, targetId, scene) => postJson('/ops/smart/route', scene ? { sourceId, targetId, scene } : { sourceId, targetId });

const ospfLoadBalance = (sourceId, targetId) => postJson('/ops/ospf/loadbalance', { sourceId, targetId });

const startPeakTraffic = (sourceId, targetId, trafficIntensity) => postJson('/ops/peak/start', { sourceId, targetId, trafficIntensity });

const stopPeakTraffic = () => postJson('/ops/peak/stop', {});

const getPeakTrafficData = () => getJson('/ops/peak/data');

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
  smartRoute: traceSmartRoute,
  traceSmartRoute,
  ospfLoadBalance,
  startPeakTraffic,
  stopPeakTraffic,
  getPeakTrafficData,
  updateDeviceStatus,
  updateLinkStatus,
  updateInterfaceStatus,
  configureVlan,
  updateOspfCost,
};
