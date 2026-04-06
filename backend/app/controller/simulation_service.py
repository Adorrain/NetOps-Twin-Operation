"""网络运维核心业务代码

作者: Adorrain
修改时间: 2026-04-06
"""

import random
import time
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx
from networkx.algorithms.shortest_paths.weighted import dijkstra_path, dijkstra_path_length
from sqlalchemy.orm import Session

from app.dao.snapshot_dao import createSnapshot
from app.model.api_schemas import (
    DeviceStatusBody,
    InterfaceStatusBody,
    LinkStatusBody,
    OSPFConfigBody,
    OSPFCostUpdateBody,
    OSPFNeighborsBody,
    PingBody,
    TracerouteBody,
    VlanBody,
)
from app.model.db_models import TopologySnapshot
from app.model.topology import Device, Link, TopologyData
from app.utils.serialization import dumpModel


class SimulationService:
    _DEVICE_STATUS_FORWARDING_OK = frozenset({"online", "warning", "up", "active"})

    def __init__(self, topologyData, db = None, snapshot = None):
        self.topologyData = topologyData
        self.db = db
        self.snapshot = snapshot

    def _persist_snapshot(self, description, type=None, target=None):
        """持久化拓扑快照"""
        if self.db is None:
            return
        createSnapshot(self.db, self.topologyData, description, type, target)

    def _success(self, message=None, data=None):
        """返回成功响应"""
        return {"success": True, "message": message, "data": data}

    def _error(self, message=None):
        """返回错误响应"""
        return {"success": False, "message": message}

    def _deviceIsUp(self, device):
        """判断设备是否可以参与转发"""
        s = (device.status or "").strip().lower()
        return s in self._DEVICE_STATUS_FORWARDING_OK

    def _deviceMap(self):
        """设备列表"""
        return {device.id: device for device in self.topologyData.devices}

    @staticmethod
    def _interfaceForwardingOk(iface):
        """判断设备接口是否可以参与转发"""
        s = (iface.get("status") or "up").strip().lower()
        return s == "up"

    @staticmethod
    def _linkRecordStatusOk(link):
        """判断链路是否可以参与转发"""
        return (link.status or "").strip().lower() == "up"

    @staticmethod
    def _getInterfaceByName(device, name):
        """获取设备接口"""
        if not name:
            return None
        name = str(name).strip()
        for interface in device.interfaces or []:
            if (interface.get("name") or "").strip() == name:
                return interface
        return None

    def _linkEndpointsInterfacesOk(self, link, devices):
        """判断链路两端接口是否可以参与转发"""
        src_device = devices.get(link.srcDevice)
        dst_device = devices.get(link.dstDevice)
        if not src_device or not dst_device:
            return False
        src_name = (link.srcInterface or "").strip() if link.srcInterface else ""
        dst_name = (link.dstInterface or "").strip() if link.dstInterface else ""
        if src_name:
            si = self._getInterfaceByName(src_device, src_name)
            if si is None or not self._interfaceForwardingOk(si):
                return False
        if dst_name:
            di = self._getInterfaceByName(dst_device, dst_name)
            if di is None or not self._interfaceForwardingOk(di):
                return False
        return True

    @staticmethod
    def _bandwidthMbps(raw):
        """带宽字符串 → Mbps；未配置或无法解析时返回 None。"""
        if not raw:
            return None
        s = str(raw).strip().lower()
        try:
            if s.endswith("g"):
                return float(s[:-1]) * 1000
            if s.endswith("m"):
                return float(s[:-1])
            return float(s)
        except ValueError:
            return None

    def _linkCost(self, link):
        """计算链路 cost = 参考带宽 / 实际带宽"""
        referenceBandwidth = self._bandwidthMbps(self.topologyData.ospfReferenceBandwidth)
        actualBandwidth = self._bandwidthMbps(link.bandwidth)
        if referenceBandwidth is None or referenceBandwidth <= 0:
            return None
        if actualBandwidth is None or actualBandwidth <= 0:
            return None
        return max(1, int(referenceBandwidth / actualBandwidth))

    def _buildForwardingGraph(self):
        """
        构建设备层无向转发图
        """
        devices = self._deviceMap()
        G = nx.Graph()
        for deviceId, device in devices.items():
            if self._deviceIsUp(device):
                G.add_node(deviceId)

        for link in self.topologyData.links:
            if not self._linkRecordStatusOk(link):
                continue
            if not self._linkEndpointsInterfacesOk(link, devices):
                continue
            u, v = link.srcDevice, link.dstDevice
            if u not in G or v not in G:
                continue
            w = self._linkCost(link)
            if w is None:
                continue
            if G.has_edge(u, v):
                if w < G[u][v]["weight"]:
                    G[u][v]["weight"] = w
            else:
                G.add_edge(u, v, weight=w)
        return G

    @staticmethod
    def _normalizeMode(raw_mode):
        """规范化模式"""
        mode = (raw_mode or "access").strip().lower()
        return "trunk" if mode == "trunk" else "access"

    @staticmethod
    def _normalizeAllowedVlans(iface):
        """规范化允许的 VLAN"""
        allowed = iface.get("allowedVlans")
        if allowed is None:
            allowed = iface.get("allowed_vlans")
        if allowed is None:
            return None
        if not isinstance(allowed, list):
            return set()
        normalized = set()
        for item in allowed:
            try:
                normalized.add(int(item))
            except (TypeError, ValueError):
                continue
        return normalized

    @staticmethod
    def _interfaceAccessVlan(iface):
        """获取接口访问 VLAN"""
        raw_vlan = (iface or {}).get("vlan", 1)
        try:
            return int(raw_vlan)
        except (TypeError, ValueError):
            return 1

    def _deviceDefaultVlan(self, device):
        """获取设备默认 VLAN"""
        interfaces = device.interfaces or []
        for iface in interfaces:
            mode = self._normalizeMode(iface.get("mode"))
            if mode == "access":
                return self._interfaceAccessVlan(iface)
        raw_vlan = getattr(device, "vlan", None)
        if raw_vlan is not None:
            try:
                return int(raw_vlan)
            except (TypeError, ValueError):
                return 1
        return 1

    def _linkAllowsVlan(self, link, devices, vlan_id):
        """判断链路是否允许 VLAN"""
        src_device = devices.get(link.srcDevice)
        dst_device = devices.get(link.dstDevice)
        src_iface_name = (link.srcInterface or "").strip()
        dst_iface_name = (link.dstInterface or "").strip()
        src_iface = self._getInterfaceByName(src_device, src_iface_name) if src_device else None
        dst_iface = self._getInterfaceByName(dst_device, dst_iface_name) if dst_device else None
        src_mode = self._normalizeMode((src_iface or {}).get("mode"))
        dst_mode = self._normalizeMode((dst_iface or {}).get("mode"))
        src_access_vlan = self._interfaceAccessVlan(src_iface)
        dst_access_vlan = self._interfaceAccessVlan(dst_iface)
        src_allowed = self._normalizeAllowedVlans(src_iface or {})
        dst_allowed = self._normalizeAllowedVlans(dst_iface or {})

        if src_mode == "access" and src_access_vlan != vlan_id:
            return False
        if dst_mode == "access" and dst_access_vlan != vlan_id:
            return False
        if src_mode == "trunk" and src_allowed is not None and vlan_id not in src_allowed:
            return False
        if dst_mode == "trunk" and dst_allowed is not None and vlan_id not in dst_allowed:
            return False
        return True

    def _buildForwardingGraphForVlan(self, vlan_id):
        """构建 VLAN 转发图"""
        devices = self._deviceMap()
        graph = nx.Graph()
        for device_id, device in devices.items():
            if self._deviceIsUp(device):
                graph.add_node(device_id)

        for link in self.topologyData.links:
            src_id = link.srcDevice
            dst_id = link.dstDevice
            cost = self._linkCost(link)
            status_ok = self._linkRecordStatusOk(link)
            iface_status_ok = self._linkEndpointsInterfacesOk(link, devices)
            vlan_ok = self._linkAllowsVlan(link, devices, vlan_id)

            if not status_ok or not iface_status_ok or not vlan_ok:
                continue
            if src_id not in graph or dst_id not in graph or cost is None:
                continue
            if graph.has_edge(src_id, dst_id):
                if cost < graph[src_id][dst_id]["weight"]:
                    graph[src_id][dst_id]["weight"] = cost
            else:
                graph.add_edge(src_id, dst_id, weight=cost)
        return graph

    def _dijkstraShortestPath( self, G: nx.Graph, sourceId, targetId):
        """
        Dijkstra：在转发图上求源到目的的最短路径，边权为链路 cost；返回路径节点序列与路径上 cost 之和。
        不可达或端点不在图中时返回 None。
        """
        if sourceId not in G or targetId not in G:
            return None
        try:
            path = dijkstra_path(G, sourceId, targetId, weight="weight")
            total = dijkstra_path_length(G, sourceId, targetId, weight="weight")
        except nx.NetworkXNoPath:
            return None
        return path, int(round(total))

    def ping(self, body: PingBody) -> dict:
        """Ping：源设备向目标设备发送 ICMP Echo"""
        sourceId = body.sourceId
        targetId = body.targetId
        devices = self._deviceMap()
        sourceDevice = devices.get(sourceId)
        targetDevice = devices.get(targetId)
        sourceVlan = self._deviceDefaultVlan(sourceDevice) if sourceDevice else 1
        targetVlan = self._deviceDefaultVlan(targetDevice) if targetDevice else 1
        graph = self._buildForwardingGraphForVlan(sourceVlan)
        shortest = self._dijkstraShortestPath(graph, sourceId, targetId)

        if not sourceDevice or not targetDevice:
            return self._error(f"设备不存在: {sourceId if not sourceDevice else targetId}")
        if sourceVlan != targetVlan:
            return self._error(f"VLAN 不一致，源设备 VLAN {sourceVlan}，目标设备 VLAN {targetVlan}")
        if shortest is None:
            return self._error("网络不可达")

        path, totalCost = shortest
        hops = max(0, len(path) - 1)
        oneWayDelay = float(hops * 0.2 + 0.5) + random.uniform(0.1, 0.5)
        rtt = round(oneWayDelay * 2, 2)
        message = f"来自 {targetId} 的应答: 往返时延={rtt} ms"
        data = {
            "sourceId": sourceId,
            "targetId": targetId,
            "vlanId": sourceVlan,
            "path": path,
            "hops": hops,
            "cost": totalCost,
            "rtt": rtt,
        }
        self._persist_snapshot(f"Ping 测试: {sourceId} -> {targetId}", "ops_ping", targetId)
        return self._success(message=message, data=data)

    def traceroute(self, body: TracerouteBody) -> dict:
        """Traceroute：与 ping 共用 _buildForwardingGraph，沿 Dijkstra 最短路径列出逐跳设备"""
        sourceId = body.sourceId
        targetId = body.targetId
        devices = self._deviceMap()
        sourceDevice = devices.get(sourceId)
        targetDevice = devices.get(targetId)
        sourceVlan = self._deviceDefaultVlan(sourceDevice) if sourceDevice else 1
        targetVlan = self._deviceDefaultVlan(targetDevice) if targetDevice else 1
        graph = self._buildForwardingGraphForVlan(sourceVlan)
        shortest = self._dijkstraShortestPath(graph, sourceId, targetId)

        if not sourceDevice or not targetDevice:
            return self._error(f"设备不存在: {sourceId if not sourceDevice else targetId}")
        if sourceVlan != targetVlan:
            return self._error(f"VLAN 不一致，源设备 VLAN {sourceVlan}，目标设备 VLAN {targetVlan}")
        if shortest is None:
            return self._error("路径不可达")

        path, totalCost = shortest
        hops = []
        for index, nodeId in enumerate(path):
            node = devices.get(nodeId)
            hopNo = index + 1
            hopName = node.name if node else nodeId
            hopIp = node.ip if node else None
            hops.append(
                {
                    "hop": hopNo,
                    "deviceId": nodeId,
                    "deviceName": hopName,
                    "ip": hopIp,
                }
            )

        data = {
            "sourceId": sourceId,
            "targetId": targetId,
            "vlanId": sourceVlan,
            "cost": totalCost,
            "path": path,
            "hops": hops,
        }
        self._persist_snapshot(f"Traceroute: {sourceId} -> {targetId}", "ops_traceroute", targetId)
        return self._success(message="Traceroute 完成", data=data)

    def UpdateDeviceStatus(self, body):
        """更新设备状态"""
        device = self._deviceMap().get(body.deviceId)
        if not device:
            return self._error(f"设备不存在: {body.deviceId}")
        device.status = body.status
        self._persist_snapshot(f"设备 {body.deviceId} 状态变更为{body.status}")
        return self._success(message="设备状态已更新", data=dumpModel(device))

    def UpdateLinkStatus(self, body):
        """更新链路状态"""
        if body.linkId:
            for link in self.topologyData.links:
                if link.id == body.linkId:
                    link.status = body.status
                    self._persist_snapshot(f"链路 {link.id} 状态变更为{body.status}")
                    return self._success(message="链路状态已更新", data=dumpModel(link))
            return self._error("链路不存在")
        if body.srcId and body.dstId:
            pair = {body.srcId, body.dstId}
            for link in self.topologyData.links:
                if {link.srcDevice, link.dstDevice} == pair:
                    link.status = body.status
                    self._persist_snapshot(f"链路 {link.id} 状态变更为{body.status}")
                    return self._success(message="链路状态已更新", data=dumpModel(link))
            return self._error("链路不存在")
        return self._error("必须提供 linkId，或同时提供 srcId 与 dstId")

    def UpdateInterfaceStatus(self, body):
        """更新设备接口状态"""
        device = self._deviceMap().get(body.deviceId)
        if not device:
            return self._error(f"设备不存在: {body.deviceId}")
        iface = self._getInterfaceByName(device, body.ifaceName)
        if not iface:
            return self._error(f"接口不存在: {body.ifaceName}")
        iface["status"] = body.status
        self._persist_snapshot(f"设备 {body.deviceId} 接口 {body.ifaceName} 状态变更为{body.status}")
        return self._success(message=f"接口{body.ifaceName}状态已更新为{body.status}", data=dumpModel(device))

    def _ensure_vlan_baseline(self, device):
        """确保设备 VLAN 基线配置"""
        baselineConfig = device.configuration
        if "vlanBaseline" not in baselineConfig:
            baselineConfig["vlanBaseline"] = {}
        return baselineConfig["vlanBaseline"]

    def RecoverVlan(self, body):
        """恢复 VLAN 配置"""
        device = self._deviceMap().get(body.deviceId)
        iface = self._getInterfaceByName(device, body.port) if device else None
        config = device.configuration if device else {}
        vlan_baseline = config.get("vlanBaseline", {}) if isinstance(config, dict) else {}
        baseline = vlan_baseline.get(body.port)
        mode = (baseline or {}).get("mode", "access")
        baseline_vlan = (baseline or {}).get("vlan")
        baseline_allowed = (baseline or {}).get("allowedVlans")
        if not device:
            return self._error(f"设备不存在: {body.deviceId}")
        if not iface:
            return self._error(f"接口不存在: {body.port}")
        if not baseline:
            return self._error("无 VLAN 恢复基线，请先对该端口做过配置")

        iface["mode"] = mode
        if mode == "access":
            if baseline_vlan is not None:
                iface["vlan"] = baseline_vlan
            iface.pop("allowedVlans", None)
            iface.pop("allowed_vlans", None)
        else:
            if baseline_allowed is not None:
                iface["allowedVlans"] = baseline_allowed

        self._persist_snapshot(f"恢复 VLAN: {body.deviceId} 端口 {body.port}",)
        return self._success(message="VLAN 已恢复", data=dumpModel(device))

    def ConfigureVlan(self, body: VlanBody) -> dict:
        """配置 VLAN 配置"""
        device = self._deviceMap().get(body.deviceId)
        if not device:
            return self._error(f"设备不存在: {body.deviceId}")

        iface = self._getInterfaceByName(device, body.port)
        if not iface:
            return self._error(f"接口不存在: {body.port}")

        mode = (body.mode or "").strip().lower()
        if not mode:
            return self._error("缺少 mode")

        baseline = self._ensure_vlan_baseline(device)
        if body.port not in baseline:
            baseline[body.port] = {
                "mode": iface.get("mode", "access"),
                "vlan": iface.get("vlan"),
                "allowedVlans": iface.get("allowedVlans"),
            }

        iface["mode"] = mode
        if mode == "access":
            if body.vlanId is not None:
                iface["vlan"] = body.vlanId
            iface.pop("allowedVlans", None)
        elif mode == "trunk" and body.allowedVlans is not None:
            iface["allowedVlans"] = body.allowedVlans

        self._persist_snapshot(f"VLAN 配置: {body.deviceId} 端口 {body.port} mode={mode}")
        return self._success(message="VLAN 配置已生效", data=dumpModel(device))

    def UpdateOspfConfig(self, body):
        """更新 OSPF 配置"""
        device = self._deviceMap().get(body.deviceId)
        if not device:
            return self._error(f"设备不存在: {body.deviceId}")

        if device.ospf is None:
            device.ospf = {}

        routerId = body.routerId or (str(device.ip).split("/")[0] if device.ip else "1.1.1.1")
        device.ospf["area"] = body.area
        device.ospf["routerId"] = routerId
        device.ospf["lastResetTime"] = 0

        configurationOspf = device.configuration.setdefault("ospf", {})
        configurationOspf["area"] = body.area
        configurationOspf["routerId"] = routerId
        configurationOspf["lastResetTime"] = 0

        self._persist_snapshot(f"OSPF 配置: {body.deviceId} area={body.area} routerId={routerId}")
        return self._success(message="OSPF 配置已更新", data=dumpModel(device))

    def UpdateOspfCost(self, body: OSPFCostUpdateBody):
        """更新 OSPF 链路成本"""
        linkId = body.linkId
        newCost = body.newCost
        links = self.topologyData.links
        targetLink = None

        for link in links:
            if link.id == linkId:
                targetLink = link
                break
        if targetLink is None:
            return self._error("链路不存在")
        referenceBandwidth = self._bandwidthMbps(self.topologyData.ospfReferenceBandwidth)
        costValue = max(1, int(newCost))
        if referenceBandwidth and costValue > 0:
            newBandwidth = round(referenceBandwidth / costValue, 2)
            targetLink.bandwidth = f"{newBandwidth}m"

        self._persist_snapshot(f"OSPF Cost 更新: {linkId} -> {costValue}", "ospfCost", linkId)
        return self._success(message="OSPF Cost 已更新", data=dumpModel(targetLink))

    @staticmethod
    def _ospfNeighborState(ospf):
        """OSPF 邻居状态机"""
        t = time.time() - float(ospf.get("lastResetTime", 0) or 0)
        if t < 5:
            return "Init"
        if t < 10:
            return "2-Way"
        if t < 15:
            return "ExStart"
        if t < 20:
            return "Loading"
        return "Full"

    def GetOspfNeighbors(self, body):
        deviceId = body.deviceId
        devices = self._deviceMap()
        device = devices.get(deviceId)
        links = self.topologyData.links
        rows = []
        if not device or not device.ospf:
            return self._success(message="无 OSPF 配置或设备不存在", data=[])

        ospfConfiguration = device.ospf
        state = self._ospfNeighborState(ospfConfiguration)

        for link in links:
            neighborId = None
            localInterface = ""
            if link.srcDevice == deviceId:
                neighborId = link.dstDevice
                localInterface = link.srcInterface or ""
            elif link.dstDevice == deviceId:
                neighborId = link.srcDevice
                localInterface = link.dstInterface or ""

            if not neighborId:
                continue
            neighborDevice = devices.get(neighborId)
            if not neighborDevice or not neighborDevice.ospf:
                continue

            neighborOspf = neighborDevice.ospf or {}
            routerId = neighborOspf.get("routerId") or "0.0.0.0"
            rows.append(
                {
                    "neighborId": neighborId,
                    "routerId": routerId,
                    "address": neighborDevice.ip,
                    "interface": localInterface,
                    "state": state,
                    "area": str(neighborOspf.get("area", 0)),
                }
            )

        return self._success(message="OK", data=rows)
