"""网络仿真与运维行为核心服务。

基于拓扑构建运行时图（NetworkX），提供：
- ping / traceroute 转发仿真
- 链路 / 设备 / 接口状态变更
- VLAN 与 OSPF 配置管理
"""

import ipaddress
import random
import time
from typing import Any, Dict, List, Optional, Set

import networkx as nx
from sqlalchemy.orm import Session

from app.model.topology import Device, TopologyData
from app.model.db_models import TopologySnapshot


class SimulationService:
    """基于拓扑的仿真服务：运行时图、L2/L3 可达性、转发路径、状态与配置管理。"""

    def __init__(
        self,
        topology_data: TopologyData,
        db: Optional[Session] = None,
        snapshot: Optional[TopologySnapshot] = None,
    ):
        """
        使用给定拓扑初始化服务，并立即构建运行时图与路由表。
        """
        self.topology = topology_data
        self.db: Optional[Session] = db
        self.snapshot: Optional[TopologySnapshot] = snapshot
        self._rebuild_runtime()

    # ==================== 运行时构建 ====================

    def _normalize_config(self) -> None:
        """将设备顶层的 ospf 配置迁移到 configuration['ospf']，便于统一读取。"""
        for dev in self.topology.devices:
            if not dev.ospf:
                continue
            if "ospf" not in dev.configuration:
                dev.configuration["ospf"] = {}
            if isinstance(dev.ospf, dict):
                for k, v in dev.ospf.items():
                    if k not in dev.configuration["ospf"]:
                        dev.configuration["ospf"][k] = v
            dev.ospf = None

    def _rebuild_runtime(self) -> None:
        """重建运行时索引：设备映射、IP 映射、物理图、OSPF 图、路由表。"""
        self._normalize_config()
        self.device_map = {d.id: d for d in self.topology.devices}
        self.ip_map = self._build_ip_map()
        self.graph = self._build_physical_graph()
        self.ospf_graph = self._build_ospf_graph()
        self.routing_tables = self._build_routing_tables()

    def _build_ip_map(self) -> Dict[str, str]:
        """构建 IP 地址 -> 设备 ID 的映射（含设备主 IP 与接口 IP），用于根据目标 IP 反查设备。"""
        out = {}
        for dev in self.topology.devices:
            if dev.ip:
                out[dev.ip.split("/")[0]] = dev.id
            for iface in dev.interfaces:
                ip = iface.get("ip")
                if ip:
                    out[str(ip).split("/")[0]] = dev.id
        return out

    def _build_physical_graph(self) -> nx.Graph:
        """构建物理连通图（仅包含 up 状态的设备与链路），边上带 weight、allowed_vlans、接口名等。"""
        G = nx.Graph()
        for dev in self.topology.devices:
            if dev.status.lower() not in ("down", "offline"):
                G.add_node(dev.id, name=dev.name, device_type=dev.device_type, ip=dev.ip)
        for link in self.topology.links:
            if link.src_device not in G or link.dst_device not in G or link.status.lower() not in ("up", "active"):
                continue
            src_iface = self._get_interface(self.device_map[link.src_device], link.src_interface)
            dst_iface = self._get_interface(self.device_map[link.dst_device], link.dst_interface)
            if not self._is_interface_up(src_iface) or not self._is_interface_up(dst_iface):
                continue
            allowed_vlans = self._compute_link_allowed_vlans(src_iface, dst_iface)
            weight = self._get_link_cost(link.bandwidth)
            G.add_edge(
                link.src_device, link.dst_device,
                weight=weight, allowed_vlans=allowed_vlans,
                src_interface=link.src_interface, dst_interface=link.dst_interface, bandwidth=link.bandwidth,
            )
        return G

    # ==================== 接口与 L2 / VLAN ====================

    def _get_interface(self, device: Device, port_name: str) -> Optional[Dict[str, Any]]:
        """按端口名查找设备的接口配置字典，未找到返回 None。"""
        if not port_name:
            return None
        for iface in device.interfaces:
            if iface.get("name") == port_name:
                return iface
        return None

    def _is_interface_up(self, iface: Optional[Dict]) -> bool:
        """判断接口是否处于 up 状态，无配置时默认视为 up。"""
        return not iface or iface.get("status", "up").lower() == "up"

    def _get_link_cost(self, bandwidth: Optional[str]) -> int:
        """根据带宽字符串计算链路 cost（用于最短路径），100M 返回 10，其余默认 1。"""
        if not bandwidth:
            return 1
        return 10 if "100m" in bandwidth.lower() else 1

    def _compute_link_allowed_vlans(self, src_iface: Dict, dst_iface: Dict) -> Optional[Set[int]]:
        """根据两端接口的 mode（access/trunk）与 vlan/allowed_vlans 计算该链路允许通过的 VLAN 集合；None 表示允许全部。"""
        s_mode = (src_iface or {}).get("mode", "access")
        d_mode = (dst_iface or {}).get("mode", "access")
        s_vlan = int((src_iface or {}).get("vlan", 1))
        d_vlan = int((dst_iface or {}).get("vlan", 1))

        def allowed(iface):
            if not iface or "allowed_vlans" not in iface:
                return None
            val = iface["allowed_vlans"]
            return set(map(int, val)) if isinstance(val, list) else set()

        s_allowed, d_allowed = allowed(src_iface), allowed(dst_iface)
        if s_mode == "access" and d_mode == "access":
            return {s_vlan} if s_vlan == d_vlan else set()
        if s_mode == "trunk" and d_mode == "trunk":
            if s_allowed is None and d_allowed is None:
                return None
            return d_allowed if s_allowed is None else (s_allowed if d_allowed is None else s_allowed & d_allowed)
        trunk_allowed = s_allowed if s_mode == "trunk" else d_allowed
        access_vlan = d_vlan if s_mode == "trunk" else s_vlan
        return {access_vlan} if (trunk_allowed is None or access_vlan in trunk_allowed) else set()

    def _find_l2_path(self, src: str, dst: str, vlan: int) -> Optional[List[str]]:
        """在指定 VLAN 内计算 L2 最短路径（按边的 allowed_vlans 过滤），无路径时返回 None。"""
        def filter_edge(u, v, k=None):
            allowed = self.graph[u][v].get("allowed_vlans")
            return allowed is None or vlan in allowed
        view = nx.subgraph_view(self.graph, filter_edge=filter_edge)
        try:
            return nx.shortest_path(view, src, dst, weight="weight", method="dijkstra")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None

    def _get_access_vlan(self, device_id: str) -> Optional[int]:
        """获取设备的接入 VLAN（设备级 vlan 或第一个非 trunk 接口的 vlan），默认 1。"""
        dev = self.device_map.get(device_id)
        if not dev:
            return None
        if dev.vlan:
            return dev.vlan
        for iface in dev.interfaces:
            if iface.get("mode") != "trunk" and iface.get("vlan"):
                return int(iface["vlan"])
        return 1

    def _get_local_interface_on_link(self, device_id: str, peer_id: str) -> Optional[str]:
        """根据拓扑链路返回本设备（device_id）在到 peer_id 链路上的接口名。"""
        for link in self.topology.links:
            if {link.src_device, link.dst_device} != {device_id, peer_id}:
                continue
            return link.src_interface if link.src_device == device_id else link.dst_interface
        return None

    # ==================== L3 与 OSPF ====================

    def _is_l3_device(self, device_id: str) -> bool:
        """判断设备是否为三层设备（路由器/L3 交换机、或配置了 OSPF、或接口有 IP）。"""
        dev = self.device_map.get(device_id)
        if not dev:
            return False
        if dev.device_type.lower() in ("router", "l3_switch", "multilayer_switch"):
            return True
        if self._get_ospf_config(dev):
            return True
        return any(iface.get("ip") for iface in dev.interfaces)

    def _get_ospf_config(self, device: Optional[Device]) -> Optional[Dict]:
        """获取设备的 OSPF 配置字典，并统一 router_id / routerId 字段；无配置返回 None。"""
        if not device:
            return None
        cfg = device.configuration or {}
        ospf = cfg.get("ospf")
        if not isinstance(ospf, dict):
            return None
        if "router_id" in ospf:
            return ospf

    def _is_ospf_ready(self, device: Device) -> bool:
        """判断 OSPF 进程是否已就绪（模拟：上次重置超过 2 秒）。"""
        ospf = self._get_ospf_config(device)
        if not ospf:
            return False
        last_reset = float(ospf.get("last_reset_time", 0) or 0)
        return (time.time() - last_reset) > 2

    def _build_ospf_graph(self) -> nx.Graph:
        """构建 OSPF 逻辑拓扑：仅包含已就绪的 OSPF 设备，且仅在同 area 且链路允许 VLAN 时建边。"""
        G = nx.Graph()
        for dev in self.topology.devices:
            if self._is_ospf_ready(dev):
                G.add_node(dev.id)
        for u, v, data in self.graph.edges(data=True):
            if u not in G or v not in G:
                continue
            allowed = data.get("allowed_vlans")
            if allowed is not None and len(allowed) == 0:
                continue
            u_ospf = self._get_ospf_config(self.device_map[u])
            v_ospf = self._get_ospf_config(self.device_map[v])
            if int(u_ospf.get("area", 0)) == int(v_ospf.get("area", 0)):
                G.add_edge(u, v, weight=data.get("weight", 1))
        return G

    def _build_routing_tables(self) -> Dict[str, List[Dict]]:
        """为所有 L3 设备计算路由表：直连 + 静态；若在 OSPF 图中则叠加 OSPF 学到的路由，并写回设备 configuration。"""
        connected = {}
        for dev in self.topology.devices:
            routes = []
            for iface in dev.interfaces:
                if iface.get("ip"):
                    try:
                        net = ipaddress.ip_interface(iface["ip"]).network
                        routes.append({
                            "prefix": str(net), "protocol": "CONNECTED", "cost": 0,
                            "next_hop": None, "out_interface": iface.get("name"),
                        })
                    except Exception:
                        pass
            connected[dev.id] = routes

        l3_nodes = {n for n in self.graph.nodes if self._is_l3_device(n)}
        tables = {}
        for src in l3_nodes:
            my_routes = list(connected.get(src, []))
            my_routes.extend(self._get_static_routes(self.device_map[src]))
            if src in self.ospf_graph.nodes:
                try:
                    paths = nx.single_source_dijkstra_path(self.ospf_graph, src, weight="weight")
                    for dst, path in paths.items():
                        if src == dst:
                            continue
                        next_hop = path[1]
                        cost = sum(self.ospf_graph[path[i]][path[i + 1]].get("weight", 1) for i in range(len(path) - 1))
                        out_iface = self._get_local_interface_on_link(src, next_hop)
                        for remote in connected.get(dst, []):
                            if not any(r["prefix"] == remote["prefix"] for r in my_routes):
                                my_routes.append({
                                    "prefix": remote["prefix"], "protocol": "OSPF",
                                    "cost": cost, "next_hop": next_hop, "out_interface": out_iface,
                                })
                except Exception:
                    pass
            tables[src] = my_routes
            self._save_routing_table_to_device(self.device_map[src], my_routes)
        return tables

    def _get_static_routes(self, device: Device) -> List[Dict]:
        """从设备 configuration.static_routes 读取静态路由列表，返回与内部路由表相同结构的字典列表。"""
        cfg = device.configuration or {}
        return [
            {"prefix": r.get("prefix"), "protocol": "STATIC", "cost": 1, "next_hop": r.get("next_hop"), "out_interface": r.get("out_interface")}
            for r in cfg.get("static_routes", [])
        ]

    def _save_routing_table_to_device(self, device: Device, routes: List[Dict]) -> None:
        """将计算得到的路由表写入设备的 configuration['routing_table']，供前端展示。"""
        device.configuration["routing_table"] = [
            {"destination": r["prefix"], "next_hop": r["next_hop"], "out_interface": r["out_interface"], "cost": r["cost"], "protocol": r["protocol"]}
            for r in routes
        ]

    # ==================== 转发仿真 (Ping / Traceroute) ====================

    def ping(self, src_id: str, target_ip: str) -> Dict:
        """模拟从源设备向目标 IP 执行 ping：先算转发路径并返回结果。"""
        path_res = self._compute_forwarding_path(src_id, target_ip)
        if not path_res["success"]:
            return path_res
        hops = len(path_res["path"]) - 1
        rtt = hops * 1.5 + random.uniform(0.5, 2.0)
        return {
            "success": True,
            "message": f"Reply from {target_ip}: bytes=32 time={rtt:.2f}ms TTL={64 - hops}",
            "rtt": rtt,
            "path": path_res["path"],
            "hops": hops,
        }

    def traceroute(self, src_id: str, target_ip: str) -> Dict:
        """模拟 traceroute：计算转发路径后，按跳返回每跳的设备 ID、名称、IP 与模拟 RTT。"""
        path_res = self._compute_forwarding_path(src_id, target_ip)
        if not path_res["success"]:
            return {
                "success": False,
                "message": path_res["message"],
                "hops": [],
            }
        path = path_res["path"]
        hops_data = [
            {
                "hop": i + 1,
                "ip": getattr(self.device_map.get(n), "ip", None) or "Unknown",
                "device_id": n,
                "device_name": getattr(self.device_map.get(n), "name", None) or n,
                "rtt": f"{(i + 1) * 1.2 + random.random():.2f} ms",
            }
            for i, n in enumerate(path)
        ]
        return {"success": True, "path": path, "hops": hops_data}

    def _compute_forwarding_path(self, src_id: str, dst_ip: str) -> Dict:
        """计算从源设备到目标 IP 的端到端转发路径：先尝试同 VLAN L2，否则经网关走 L3 查表转发，返回 success/path/mode 或错误信息。"""
        if src_id not in self.graph:
            return {"success": False, "message": "Source device down"}
        dst_id = self.ip_map.get(dst_ip)
        if not dst_id:
            return {"success": False, "message": "Target IP unknown"}

        src_vlan = self._get_access_vlan(src_id)
        dst_vlan = self._get_access_vlan(dst_id)
        if src_vlan and dst_vlan and src_vlan == dst_vlan:
            l2_path = self._find_l2_path(src_id, dst_id, src_vlan)
            if l2_path:
                return {"success": True, "path": l2_path, "mode": "L2"}

        current, path, visited = src_id, [src_id], {src_id}
        if not self._is_l3_device(current) and src_vlan:
            gateway = self._find_gateway_in_vlan(current, src_vlan)
            if not gateway:
                return {"success": False, "message": "No Gateway found"}
            l2_to_gw = self._find_l2_path(current, gateway, src_vlan)
            if not l2_to_gw:
                return {"success": False, "message": "Gateway unreachable (L2)"}
            for node in l2_to_gw[1:]:
                path.append(node)
                visited.add(node)
            current = gateway

        while current != dst_id:
            if len(path) > 30:
                return {"success": False, "message": "TTL Exceeded"}
            routes = self.routing_tables.get(current, [])
            best = self._match_route(routes, dst_ip)
            if not best:
                return {"success": False, "message": f"No route to host at {current}"}
            next_hop, protocol = best["next_hop"], best["protocol"]

            if protocol == "CONNECTED":
                if self.graph.has_edge(current, dst_id):
                    path.append(dst_id)
                    return {"success": True, "path": path, "mode": "L3"}
                l2_final = self._find_l2_path(current, dst_id, dst_vlan or 1)
                if l2_final:
                    for node in l2_final[1:]:
                        if node in visited:
                            return {"success": False, "message": "Loop detected"}
                        path.append(node)
                        visited.add(node)
                    return {"success": True, "path": path, "mode": "L3"}
                return {"success": False, "message": "Destination unreachable on connected network"}
            if not next_hop:
                return {"success": False, "message": "Invalid Route"}
            if next_hop in visited:
                return {"success": False, "message": "Routing Loop"}
            if not self.graph.has_edge(current, next_hop):
                return {"success": False, "message": "Next hop unreachable"}
            path.append(next_hop)
            visited.add(next_hop)
            current = next_hop
        return {"success": True, "path": path, "mode": "L3"}

    def _match_route(self, routes: List[Dict], target_ip: str) -> Optional[Dict]:
        """最长前缀匹配：在路由表中选出能匹配 target_ip 且前缀最长、同长度时 cost 最小的路由。"""
        try:
            ip = ipaddress.ip_address(target_ip)
        except Exception:
            return None
        best, best_len = None, -1
        for r in routes:
            try:
                net = ipaddress.ip_network(r["prefix"], strict=False)
                if ip not in net:
                    continue
                if net.prefixlen > best_len:
                    best, best_len = r, net.prefixlen
                elif net.prefixlen == best_len and (not best or r["cost"] < best["cost"]):
                    best = r
            except Exception:
                continue
        return best

    def _find_gateway_in_vlan(self, device_id: str, vlan: int) -> Optional[str]:
        """在指定 VLAN 的连通子图中，从 device_id 出发 BFS 查找最近的三层设备作为网关。"""
        def filter_edge(u, v, k=None):
            allowed = self.graph[u][v].get("allowed_vlans")
            return allowed is None or vlan in allowed
        view = nx.subgraph_view(self.graph, filter_edge=filter_edge)
        if device_id not in view:
            return None
        visited, queue = {device_id}, [(device_id, 0)]
        while queue:
            node, _ = queue.pop(0)
            if node != device_id and self._is_l3_device(node):
                return node
            for nb in view.neighbors(node):
                if nb not in visited:
                    visited.add(nb)
                    queue.append((nb, 0))
        return None

    # ==================== 状态与配置 (Mutation API) ====================

    def update_device_status(self, device_id: str, status: str) -> TopologyData:
        """更新指定设备状态并重建运行时。"""
        if device_id in self.device_map:
            self.device_map[device_id].status = status
            self._rebuild_runtime()
        return self.topology

    def update_link_status(self, link_id: str, status: str) -> TopologyData:
        """按链路 ID 更新链路状态并重建运行时。"""
        for link in self.topology.links:
            if link.id == link_id:
                link.status = status
                break
        self._rebuild_runtime()
        return self.topology

    def find_and_update_link(self, src_id: str, dst_id: str, status: str) -> TopologyData:
        """按源/目标设备 ID 查找并更新对应链路状态，然后重建运行时。"""
        for link in self.topology.links:
            if {link.src_device, link.dst_device} == {src_id, dst_id}:
                link.status = status
        self._rebuild_runtime()
        return self.topology

    def update_interface_status(self, device_id: str, port_name: str, status: str) -> TopologyData:
        """更新指定设备某端口的状态（up/down）并重建运行时。"""
        dev = self.device_map.get(device_id)
        if dev:
            iface = self._get_interface(dev, port_name)
            if iface:
                iface["status"] = status
                self._rebuild_runtime()
        return self.topology

    def configure_vlan(self, device_id: str, port: str, mode: str, vlan_id: int = None, allowed_vlans: List[int] = None) -> TopologyData:
        """配置设备端口的 VLAN 模式（access/trunk）及 vlan_id 或 allowed_vlans，并重建运行时。"""
        dev = self.device_map.get(device_id)
        if dev:
            iface = self._get_interface(dev, port)
            if iface:
                iface["mode"] = mode
                if mode == "access":
                    if vlan_id is not None:
                        iface["vlan"] = vlan_id
                    if "allowed_vlans" in iface:
                        del iface["allowed_vlans"]
                elif mode == "trunk" and allowed_vlans is not None:
                    iface["allowed_vlans"] = allowed_vlans
                self._rebuild_runtime()
        return self.topology

    def assign_vlan(self, device_id: str, port: str, vlan_id: int) -> TopologyData:
        """将端口设为 access 并指定 vlan_id。"""
        return self.configure_vlan(device_id, port, "access", vlan_id=vlan_id)

    def remove_vlan(self, device_id: str, port: str) -> TopologyData:
        """将端口恢复为 access vlan 1。"""
        return self.configure_vlan(device_id, port, "access", vlan_id=1)

    def _ensure_ospf_dict(self, device: Device) -> Dict:
        """保证设备 configuration['ospf'] 存在且为字典，便于写入 area/router_id 等。"""
        if not device.configuration:
            device.configuration = {}
        ospf = device.configuration.get("ospf")
        if not isinstance(ospf, dict):
            device.configuration["ospf"] = {}
            ospf = device.configuration["ospf"]
        return ospf

    def update_ospf_config(self, device_id: str, area: int, router_id: str = None) -> TopologyData:
        """更新指定设备的 OSPF 配置（area、router_id），记录 last_reset_time 并重建运行时。"""
        dev = self.device_map.get(device_id)
        if dev:
            ospf = self._ensure_ospf_dict(dev)
            ospf["area"] = area
            if router_id:
                ospf["router_id"] = router_id
            elif "router_id" not in ospf:
                rid = (dev.ip or "1.1.1.1").split("/")[0]
                ospf["router_id"] = rid
            
            # 强制设置重置时间为 0，使邻居状态立即变为 Full
            ospf["last_reset_time"] = 0 
            
            self._rebuild_runtime()
        return self.topology

    def get_ospf_neighbors(self, device_id: str) -> List[Dict]:
        """获取指定设备的 OSPF 邻居列表（含 neighbor_id、router_id、接口、状态、area 等），未就绪或非 OSPF 设备返回空列表。"""
        dev = self.device_map.get(device_id)
        if not dev or not self._is_ospf_ready(dev):
            return []
        my_ospf = self._get_ospf_config(dev)
        if not my_ospf:
            return []
        t = time.time() - float(my_ospf.get("last_reset_time", 0) or 0)
        state = "Full"
        if t < 5: state = "Init"
        elif t < 10: state = "2-Way"
        elif t < 15: state = "ExStart"
        elif t < 20: state = "Loading"

        result = []
        for n_id in self.ospf_graph.neighbors(device_id):
            n_dev = self.device_map[n_id]
            n_ospf = self._get_ospf_config(n_dev)
            iface = self._get_local_interface_on_link(device_id, n_id)
            result.append({
                "neighbor_id": n_id,
                "router_id": n_ospf.get("router_id") or "0.0.0.0",
                "address": n_dev.ip,
                "interface": iface,
                "state": state,
                "area": str(n_ospf.get("area", 0)),
                "details": f"State is {state}",
            })
        return result
