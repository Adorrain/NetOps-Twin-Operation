"""网络仿真与运维行为核心服务。

基于拓扑构建运行时图（NetworkX），提供：
- ping / traceroute 转发仿真
- 链路 / 设备 / 接口状态变更
- VLAN 与 OSPF 配置管理
"""

import ipaddress
import math
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
        self.topology = topology_data
        self.db: Optional[Session] = db
        self.snapshot: Optional[TopologySnapshot] = snapshot
        self.vlan_baseline: Dict[str, Dict[str, Any]] = {}
        self._init_vlan_baseline()
        self._rebuild_runtime()

    def _rebuild_runtime(self) -> None:
        """重建运行时数据"""
        self._normalize_config()
        self.device_map = {d.id: d for d in self.topology.devices}
        self.ip_map = self._build_ip_map()
        self.graph = self._build_physical_graph()
        self.ospf_graph = self._build_ospf_graph()
        self.routing_tables = self._build_routing_tables()

    def _normalize_config(self) -> None:
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

    def _init_vlan_baseline(self) -> None:
        for dev in self.topology.devices:
            for iface in dev.interfaces:
                name = iface.get("name")
                if not name:
                    continue
                key = f"{dev.id}:{name}"
                self.vlan_baseline[key] = {
                    "mode": iface.get("mode", "access"),
                    "vlan": iface.get("vlan"),
                    "allowed_vlans": list(iface.get("allowed_vlans", [])) if isinstance(iface.get("allowed_vlans"), list) else None,
                }


    # ==================== 基础构建 ====================

    def _build_ip_map(self) -> Dict[str, str]:
        out = {}
        for dev in self.topology.devices:
            if dev.ip:
                out[dev.ip.split("/")[0]] = dev.id
            for iface in dev.interfaces:
                if iface.get("ip"):
                    out[iface["ip"].split("/")[0]] = dev.id
        return out


    def _build_physical_graph(self) -> nx.Graph:
        G = nx.Graph()

        for dev in self.topology.devices:
            if dev.status.lower() not in ("down", "offline"):
                G.add_node(dev.id)

        for link in self.topology.links:
            if link.status.lower() not in ("up", "active"):
                continue
            if link.src_device not in G or link.dst_device not in G:
                continue

            s = self._get_interface(self.device_map[link.src_device], link.src_interface)
            d = self._get_interface(self.device_map[link.dst_device], link.dst_interface)

            if not self._is_interface_up(s) or not self._is_interface_up(d):
                continue

            G.add_edge(
                link.src_device,
                link.dst_device,
                weight=self._get_link_cost(link),
                allowed_vlans=self._compute_link_allowed_vlans(s, d),
            )
        return G


    # ==================== 接口工具 ====================

    def _get_interface(self, device, name):
        return next((i for i in device.interfaces if i.get("name") == name), None)


    def _is_interface_up(self, iface):
        return not iface or iface.get("status", "up") == "up"


    def _get_link_cost(self, link) -> int:
        if getattr(link, "ospf_cost", None):
            return max(1, int(link.ospf_cost))

        bw = str(getattr(link, "bandwidth", "1000")).lower()
        try:
            if bw.endswith("g"):
                mbps = float(bw[:-1]) * 1000
            elif bw.endswith("m"):
                mbps = float(bw[:-1])
            else:
                mbps = float(bw)
        except:
            mbps = 1000

        return max(1, int(1000 / max(1, mbps)))

    def _bandwidth_to_mbps(self, bandwidth: Optional[str]) -> float:
        raw = str(bandwidth or "1000").strip().lower()
        try:
            if raw.endswith("g"):
                return max(1.0, float(raw[:-1]) * 1000.0)
            if raw.endswith("m"):
                return max(1.0, float(raw[:-1]))
            return max(1.0, float(raw))
        except Exception:
            return 1000.0

    def _format_bandwidth(self, mbps: float) -> str:
        if mbps >= 1000:
            g = mbps / 1000.0
            return (f"{g:.2f}".rstrip("0").rstrip(".") + "G") if g % 1 else f"{int(g)}G"
        if mbps >= 1:
            return (f"{mbps:.2f}".rstrip("0").rstrip(".") + "M") if mbps % 1 else f"{int(mbps)}M"
        return f"{mbps * 1000:.0f}K"

    def _get_link_between(self, src_id: str, dst_id: str):
        for link in self.topology.links:
            if {link.src_device, link.dst_device} == {src_id, dst_id}:
                return link
        return None

    def _estimate_link_latency_ms(
        self,
        link,
        traffic_load: float = 0.5,
        packet_size_bytes: int = 1500,
    ) -> float:
        bw_mbps = self._bandwidth_to_mbps(getattr(link, "bandwidth", None))
        tx_ms = (packet_size_bytes * 8.0) / (bw_mbps * 1000.0)
        propagation_ms = 0.2
        queue_factor = max(0.0, min(0.99, float(traffic_load)))
        queue_ms = (0.1 + tx_ms) * (queue_factor / max(0.01, 1 - queue_factor))
        return round(tx_ms + propagation_ms + queue_ms, 3)

    def _path_link_ids(self, path: List[str]) -> List[str]:
        out: List[str] = []
        for i in range(len(path) - 1):
            link = self._get_link_between(path[i], path[i + 1])
            if link:
                out.append(link.id)
        return out

    def _path_cost(self, path: List[str]) -> int:
        cost = 0
        for i in range(len(path) - 1):
            link = self._get_link_between(path[i], path[i + 1])
            if link:
                cost += self._get_link_cost(link)
        return int(cost)

    def _path_latency(self, path: List[str], traffic_load: float, packet_size_bytes: int) -> float:
        total = 0.0
        for i in range(len(path) - 1):
            link = self._get_link_between(path[i], path[i + 1])
            if link:
                total += self._estimate_link_latency_ms(link, traffic_load, packet_size_bytes)
        return round(total, 3)

    def _build_hop_details(
        self,
        path: List[str],
        traffic_load: float,
        packet_size_bytes: int,
        link_load_count: Optional[Dict[str, int]] = None,
    ) -> List[Dict[str, Any]]:
        details: List[Dict[str, Any]] = []
        cumulative = 0.0
        for i, node_id in enumerate(path):
            dev = self.device_map.get(node_id)
            if i > 0:
                prev = path[i - 1]
                link = self._get_link_between(prev, node_id)
                if link:
                    eff_load = traffic_load
                    if link_load_count is not None:
                        eff_load = min(0.99, traffic_load / max(1, link_load_count.get(link.id, 1)))
                    cumulative += self._estimate_link_latency_ms(link, eff_load, packet_size_bytes)
            details.append(
                {
                    "hop": i + 1,
                    "device_id": node_id,
                    "device_name": getattr(dev, "name", node_id),
                    "ip": self._resolve_device_ip(node_id),
                    "rtt_ms": round(cumulative, 3),
                }
            )
        return details

    def _estimate_heavy_traffic_load(self) -> float:
        terminal_types = {"pc", "terminal", "host", "server"}
        online_terminals = 0
        for dev in self.topology.devices:
            d_type = str(dev.device_type or "").lower()
            role = str(dev.role or "").lower()
            status = str(dev.status or "up").lower()
            if status in ("down", "offline"):
                continue
            if d_type in terminal_types or role == "terminal":
                online_terminals += 1
        # 多终端大流量场景（平滑版）：避免终端稍多就全链路逼近 100%
        # 终端数用 sqrt 放缓增长，负载区间控制在 [0.22, 0.65]
        return min(0.65, 0.22 + 0.12 * math.sqrt(max(1, online_terminals)))


    # ==================== VLAN ====================

    def _compute_link_allowed_vlans(self, s, d):
        def get_allowed(i):
            if not i or "allowed_vlans" not in i:
                return None
            return set(i["allowed_vlans"])

        sm, dm = (s or {}).get("mode", "access"), (d or {}).get("mode", "access")
        sv, dv = int((s or {}).get("vlan", 1)), int((d or {}).get("vlan", 1))

        sa, da = get_allowed(s), get_allowed(d)

        if sm == dm == "access":
            return {sv} if sv == dv else set()

        if sm == dm == "trunk":
            if sa is None: return da
            if da is None: return sa
            return sa & da

        trunk, access = (sa, dv) if sm == "trunk" else (da, sv)
        return {access} if trunk is None or access in trunk else set()


    # ==================== OSPF ====================

    def _build_ospf_graph(self) -> nx.Graph:
        G = nx.Graph()

        for dev in self.topology.devices:
            if self._is_ospf_ready(dev):
                G.add_node(dev.id)

        for u, v, data in self.graph.edges(data=True):
            if u not in G or v not in G:
                continue

            if data.get("allowed_vlans") == set():
                continue

            uo = self._get_ospf_config(self.device_map[u])
            vo = self._get_ospf_config(self.device_map[v])

            if uo and vo and uo.get("area", 0) == vo.get("area", 0):
                G.add_edge(u, v, weight=data.get("weight", 1))

        return G

    def _get_ospf_config(self, device: Optional[Device]) -> Optional[Dict]:
        if not device:
            return None
        cfg = device.configuration or {}
        ospf = cfg.get("ospf")
        if not isinstance(ospf, dict):
            return None
        if "router_id" in ospf:
            return ospf
        if "routerId" in ospf:
            ospf["router_id"] = ospf["routerId"]
        return ospf

    def _is_ospf_ready(self, device: Device) -> bool:
        ospf = self._get_ospf_config(device)
        if not ospf:
            return False
        last_reset = float(ospf.get("last_reset_time", 0) or 0)
        return (time.time() - last_reset) > 2

    def _is_l3_device(self, device_id: str) -> bool:
        dev = self.device_map.get(device_id)
        if not dev:
            return False
        device_type = (dev.device_type or "").lower()
        if device_type in ("server", "host", "pc", "terminal"):
            return False
        if device_type in ("router", "l3_switch", "multilayer_switch"):
            return True
        if self._get_ospf_config(dev):
            return True
        return any(iface.get("ip") for iface in dev.interfaces)

    def _get_static_routes(self, device: Device) -> List[Dict]:
        cfg = device.configuration or {}
        return [
            {
                "prefix": r.get("prefix"),
                "protocol": "STATIC",
                "cost": 1,
                "next_hop": r.get("next_hop"),
                "out_interface": r.get("out_interface"),
            }
            for r in cfg.get("static_routes", [])
        ]

    def _save_routing_table_to_device(self, device: Device, routes: List[Dict]) -> None:
        device.configuration["routing_table"] = [
            {
                "destination": r["prefix"],
                "next_hop": r["next_hop"],
                "out_interface": r["out_interface"],
                "cost": r["cost"],
                "protocol": r["protocol"],
            }
            for r in routes
        ]


    # ==================== 路由表（重点修复） ====================

    def _build_routing_tables(self) -> Dict[str, List[Dict]]:
        tables = {}

        for src in self.graph.nodes:
            if not self._is_l3_device(src):
                continue

            route_map = {}

            # ===== 直连 =====
            for iface in self.device_map[src].interfaces:
                if iface.get("ip"):
                    net = str(ipaddress.ip_interface(iface["ip"]).network)
                    route_map[net] = {
                        "prefix": net,
                        "protocol": "CONNECTED",
                        "cost": 0,
                        "next_hop": None,
                        "out_interface": iface.get("name"),
                    }

            # ===== 静态 =====
            for r in self._get_static_routes(self.device_map[src]):
                route_map[r["prefix"]] = r

            # ===== OSPF =====
            if src in self.ospf_graph:
                try:
                    lengths, paths = nx.single_source_dijkstra(self.ospf_graph, src)

                    for dst, path in paths.items():
                        if src == dst:
                            continue

                        next_hop = path[1]
                        cost = lengths[dst]
                        out_if = self._get_local_interface_on_link(src, next_hop)

                        for iface in self.device_map[dst].interfaces:
                            if not iface.get("ip"):
                                continue

                            net = str(ipaddress.ip_interface(iface["ip"]).network)

                            # ✅ 关键：最优路径覆盖
                            if net not in route_map or route_map[net]["cost"] > cost:
                                route_map[net] = {
                                    "prefix": net,
                                    "protocol": "OSPF",
                                    "cost": cost,
                                    "next_hop": next_hop,
                                    "out_interface": out_if,
                                }

                except:
                    pass

            routes = list(route_map.values())
            tables[src] = routes
            self._save_routing_table_to_device(self.device_map[src], routes)

        return tables

    # ==================== 工具 ====================

    def _resolve_device_ip(self, device_id: str) -> Optional[str]:
        dev = self.device_map.get(device_id)
        if not dev:
            return None
        if dev.ip:
            return dev.ip.split("/")[0]
        for i in dev.interfaces:
            if i.get("ip"):
                return i["ip"].split("/")[0]
        return None

    def _find_l2_path(self, src: str, dst: str, vlan: int) -> Optional[List[str]]:
        def edge_ok(u, v):
            allowed = self.graph[u][v].get("allowed_vlans")
            return allowed is None or vlan in allowed

        if src not in self.graph or dst not in self.graph:
            return None
        view = nx.subgraph_view(self.graph, filter_edge=edge_ok)
        try:
            return nx.shortest_path(view, src, dst, weight="weight")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None

    def _get_access_vlan(self, device_id: str) -> Optional[int]:
        dev = self.device_map.get(device_id)
        if not dev:
            return None
        if dev.vlan:
            return int(dev.vlan)
        for iface in dev.interfaces:
            if iface.get("mode") != "trunk" and iface.get("vlan"):
                return int(iface["vlan"])
        return 1

    def _get_local_interface_on_link(self, device_id: str, peer_id: str) -> Optional[str]:
        for link in self.topology.links:
            if {link.src_device, link.dst_device} != {device_id, peer_id}:
                continue
            return link.src_interface if link.src_device == device_id else link.dst_interface
        return None


    # ==================== 核心路径计算 ====================

    def _compute_forwarding_path(self, src_id: str, dst_ip: str) -> Dict:
        if src_id not in self.graph:
            return {"success": False, "message": "Source device down"}

        dst_id = self.ip_map.get(dst_ip)
        if not dst_id:
            return {"success": False, "message": "Target IP unknown"}

        src_vlan = self._get_access_vlan(src_id)
        dst_vlan = self._get_access_vlan(dst_id)

        # ===== L2直达 =====
        if src_vlan == dst_vlan:
            path = self._find_l2_path(src_id, dst_id, src_vlan)
            if path:
                return {"success": True, "path": path, "mode": "L2"}

        # ===== 初始化 =====
        current = src_id
        path = [current]
        visited = {current}

        # ===== 非L3 → 先走网关 =====
        if not self._is_l3_device(current):
            gw = self._find_gateway_in_vlan(current, src_vlan)
            if not gw:
                return {"success": False, "message": "No Gateway found"}

            l2_path = self._find_l2_path(current, gw, src_vlan)
            if not l2_path:
                return {"success": False, "message": "Gateway unreachable"}

            for n in l2_path[1:]:
                path.append(n)
                visited.add(n)

            current = gw

        # ===== L3逐跳转发 =====
        for _ in range(30):  # TTL
            if current == dst_id:
                return {"success": True, "path": path, "mode": "L3"}

            routes = self.routing_tables.get(current, [])
            route = self._match_route(routes, dst_ip)

            if not route:
                return {"success": False, "message": f"No route at {current}"}

            # ===== 直连网络 =====
            if route["protocol"] == "CONNECTED":
                l2_path = self._find_l2_path(current, dst_id, dst_vlan or 1)
                if not l2_path:
                    return {"success": False, "message": "Destination unreachable"}

                for n in l2_path[1:]:
                    if n in visited:
                        return {"success": False, "message": "Loop detected"}
                    path.append(n)
                    visited.add(n)

                return {"success": True, "path": path, "mode": "L3"}

            # ===== 下一跳 =====
            next_hop = route.get("next_hop")

            if not next_hop:
                return {"success": False, "message": "Invalid route"}

            if not self.graph.has_edge(current, next_hop):
                return {"success": False, "message": "Next hop unreachable"}

            if next_hop in visited:
                return {"success": False, "message": "Routing loop"}

            path.append(next_hop)
            visited.add(next_hop)
            current = next_hop

        return {"success": False, "message": "TTL exceeded"}
    
   # ==================== 路由匹配 ====================

    def _match_route(self, routes: List[Dict], target_ip: str) -> Optional[Dict]:
        try:
            ip = ipaddress.ip_address(target_ip)
        except:
            return None

        best = None
        best_len = -1

        for r in routes:
            try:
                net = ipaddress.ip_network(r["prefix"], strict=False)
            except:
                continue

            if ip not in net:
                continue

            if net.prefixlen > best_len or (
                net.prefixlen == best_len and best and r["cost"] < best["cost"]
            ):
                best = r
                best_len = net.prefixlen

        return best


    # ==================== VLAN网关 ====================

    def _find_gateway_in_vlan(self, device_id: str, vlan: int) -> Optional[str]:
        def edge_ok(u, v):
            allowed = self.graph[u][v].get("allowed_vlans")
            return allowed is None or vlan in allowed

        if device_id not in self.graph:
            return None

        visited = {device_id}
        queue = [device_id]

        while queue:
            node = queue.pop(0)

            if node != device_id and self._is_l3_device(node):
                return node

            for nb in self.graph.neighbors(node):
                if nb in visited or not edge_ok(node, nb):
                    continue
                visited.add(nb)
                queue.append(nb)

        return None

    def _find_nearest_ospf_node_in_vlan(self, device_id: str, vlan: int) -> Optional[str]:
        def edge_ok(u, v):
            allowed = self.graph[u][v].get("allowed_vlans")
            return allowed is None or vlan in allowed

        if device_id not in self.graph:
            return None

        visited = {device_id}
        queue = [device_id]

        while queue:
            node = queue.pop(0)
            if node in self.ospf_graph:
                return node
            for nb in self.graph.neighbors(node):
                if nb in visited or not edge_ok(node, nb):
                    continue
                visited.add(nb)
                queue.append(nb)
        return None

    def _is_backbone_ospf_node(self, node_id: str) -> bool:
        if node_id not in self.ospf_graph:
            return False
        dev = self.device_map.get(node_id)
        ospf = self._get_ospf_config(dev) if dev else None
        return int((ospf or {}).get("area", -1)) == 0

    def _find_nearest_backbone_node_in_vlan(self, device_id: str, vlan: int) -> Optional[str]:
        def edge_ok(u, v):
            allowed = self.graph[u][v].get("allowed_vlans")
            return allowed is None or vlan in allowed

        if device_id not in self.graph:
            return None

        visited = {device_id}
        queue = [device_id]

        while queue:
            node = queue.pop(0)
            if self._is_backbone_ospf_node(node):
                return node
            for nb in self.graph.neighbors(node):
                if nb in visited or not edge_ok(node, nb):
                    continue
                visited.add(nb)
                queue.append(nb)
        return None

    def _ensure_ospf_dict(self, device: Device) -> Dict:
        if not device.configuration:
            device.configuration = {}
        return device.configuration.setdefault("ospf", {})

    # ==================== 业务函数 ====================

    def ping(self, src_id: str, target_id: str) -> Dict:
        target_ip = self._resolve_device_ip(target_id)
        if not target_ip:
            return {"success": False, "message": "Target device has no IP"}

        res = self._compute_forwarding_path(src_id, target_ip)
        if not res["success"]:
            return res

        path = res["path"]
        hops = len(path) - 1
        rtt = hops * 1.5 + random.uniform(0.5, 2.0)

        return {
            "success": True,
            "message": f"Reply from {target_ip}: time={rtt:.2f}ms TTL={64 - hops}",
            "rtt": rtt,
            "path": path,
            "hops": hops,
        }


    def traceroute(self, src_id: str, target_id: str) -> Dict:
        target_ip = self._resolve_device_ip(target_id)
        if not target_ip:
            return {"success": False, "message": "Target device has no IP", "hops": []}

        res = self._compute_forwarding_path(src_id, target_ip)
        if not res["success"]:
            return {"success": False, "message": res["message"], "hops": []}

        path = res["path"]

        hops = []
        for i, n in enumerate(path):
            dev = self.device_map.get(n)
            hops.append({
                "hop": i + 1,
                "device_id": n,
                "device_name": getattr(dev, "name", n),
                "ip": self._resolve_device_ip(n),
                "rtt": f"{(i+1)*1.2 + random.random():.2f} ms",
            })

        return {"success": True, "path": path, "hops": hops}

    def ospf_load_balance(
        self,
        src_id: str,
        target_id: str,
        packet_size_bytes: int = 1500,
        max_paths: int = 12,
    ) -> Dict:
        traffic_load = self._estimate_heavy_traffic_load()
        if src_id not in self.graph:
            return {"success": False, "message": "Source device down"}
        if target_id not in self.graph:
            return {"success": False, "message": "Target device down"}

        src_vlan = self._get_access_vlan(src_id) or 1
        dst_vlan = self._get_access_vlan(target_id) or 1
        l2_direct = None

        # 同 VLAN 的二层直达只作为兜底，不抢占负载均衡多路径逻辑
        if src_vlan == dst_vlan:
            l2_direct = self._find_l2_path(src_id, target_id, src_vlan)

        resolved_src = src_id
        resolved_dst = target_id
        src_prefix = [src_id]
        dst_suffix = [target_id]

        # 源端：优先走到最近骨干(Area 0)路由器，保证多 area 场景可达
        src_ospf = (
            self._find_nearest_backbone_node_in_vlan(src_id, src_vlan)
            or self._find_nearest_ospf_node_in_vlan(src_id, src_vlan)
        )
        src_l2 = self._find_l2_path(src_id, src_ospf, src_vlan) if src_ospf else None
        if src_ospf and src_l2:
            resolved_src = src_ospf
            src_prefix = src_l2

        # 目标端：优先从最近骨干(Area 0)路由器回落到终端
        dst_ospf = (
            self._find_nearest_backbone_node_in_vlan(target_id, dst_vlan)
            or self._find_nearest_ospf_node_in_vlan(target_id, dst_vlan)
        )
        dst_l2 = self._find_l2_path(dst_ospf, target_id, dst_vlan) if dst_ospf else None
        if dst_ospf and dst_l2:
            resolved_dst = dst_ospf
            dst_suffix = dst_l2

        if resolved_src not in self.ospf_graph or resolved_dst not in self.ospf_graph:
            if l2_direct:
                link_ids = self._path_link_ids(l2_direct)
                return {
                    "success": True,
                    "source_id": src_id,
                    "target_id": target_id,
                    "resolved_source_id": src_id,
                    "resolved_target_id": target_id,
                    "traffic_load": max(0.0, min(0.99, float(traffic_load))),
                    "packet_size_bytes": int(packet_size_bytes),
                    "paths": [
                        {
                            "index": 1,
                            "path": l2_direct,
                            "cost": self._path_cost(l2_direct),
                            "latency_ms": self._path_latency(l2_direct, traffic_load, packet_size_bytes),
                            "link_ids": link_ids,
                            "hop_details": self._build_hop_details(l2_direct, traffic_load, packet_size_bytes),
                            "traffic_share": round(traffic_load, 4),
                        }
                    ],
                    "selected_link_ids": sorted(set(link_ids)),
                    "link_metrics": [
                        {
                            "link_id": link.id,
                            "bandwidth": self._format_bandwidth(self._bandwidth_to_mbps(getattr(link, "bandwidth", None))),
                            "utilization": round(traffic_load, 4) if link.id in set(link_ids) else 0.0,
                            "active_in_lb": link.id in set(link_ids),
                        }
                        for link in self.topology.links
                    ],
                    "message": "No OSPF gateway path, fallback to L2 direct path",
                }
            return {"success": False, "message": "No OSPF gateway path for endpoint(s)"}

        if resolved_src == resolved_dst:
            all_core_paths = [[resolved_src]]
            core_path_costs = [0]
        else:
            try:
                # 负载均衡展示：枚举所有可达路径（非仅最短），cost 用于分流权重
                candidate_paths = list(
                    nx.all_simple_paths(
                        self.ospf_graph,
                        resolved_src,
                        resolved_dst,
                        cutoff=10,
                    )
                )
                if not candidate_paths:
                    all_core_paths = []
                    core_path_costs = []
                else:
                    path_with_cost = [
                        (p, self._path_cost(p))
                        for p in candidate_paths
                    ]
                    best_cost = min(c for _, c in path_with_cost)
                    ecmp_paths = [(p, c) for p, c in path_with_cost if c == best_cost]
                    all_core_paths = [p for p, _ in ecmp_paths]
                    core_path_costs = [c for _, c in ecmp_paths]
            except Exception:
                all_core_paths = []
                core_path_costs = []

        if not all_core_paths:
            return {"success": False, "message": "No OSPF path found"}

        # 多路径展示：默认打印全部路径；仅在显式传 max_paths 时限流
        if max_paths and int(max_paths) > 0:
            all_core_paths = all_core_paths[: int(max_paths)]
            core_path_costs = core_path_costs[: int(max_paths)]

        path_items: List[Dict[str, Any]] = []
        selected_link_ids: Set[str] = set()
        link_load_count: Dict[str, int] = {}

        # 按 cost 反比加权分流：cost 越低，分得流量越大
        weights = [1.0 / max(1.0, float(c)) for c in core_path_costs]
        weight_sum = sum(weights) if weights else 1.0

        for idx, core_path in enumerate(all_core_paths, start=1):
            full_path: List[str] = []
            full_path.extend(src_prefix)

            for n in core_path:
                if not full_path or full_path[-1] != n:
                    full_path.append(n)

            for n in dst_suffix:
                if not full_path or full_path[-1] != n:
                    full_path.append(n)

            link_ids = self._path_link_ids(full_path)
            for lid in link_ids:
                selected_link_ids.add(lid)
                link_load_count[lid] = link_load_count.get(lid, 0) + 1

            base_share = (weights[idx - 1] / weight_sum) if (idx - 1) < len(weights) else (1.0 / max(1, len(all_core_paths)))
            path_share = min(0.99, traffic_load * base_share)
            path_items.append(
                {
                    "index": idx,
                    "path": full_path,
                    "cost": self._path_cost(full_path),
                    "latency_ms": self._path_latency(full_path, path_share, packet_size_bytes),
                    "link_ids": link_ids,
                    "traffic_share": round(path_share, 4),
                }
            )

        # 链路总利用率口径：所有路径在该链路上的分流占比累加
        link_total_util: Dict[str, float] = {}
        for p in path_items:
            share = float(p.get("traffic_share", 0.0))
            for lid in p.get("link_ids", []):
                # 平滑叠加：u_total = 1 - (1-u_prev)(1-u_new)
                # 比线性相加更保守，避免轻易冲到 99%
                prev = link_total_util.get(lid, 0.0)
                link_total_util[lid] = min(0.95, 1 - (1 - prev) * (1 - share))

        for p in path_items:
            hop_details = self._build_hop_details(
                p["path"],
                p["traffic_share"],
                packet_size_bytes,
                link_load_count,
            )
            p["hop_details"] = hop_details

        link_metrics: List[Dict[str, Any]] = []
        for link in self.topology.links:
            mbps = self._bandwidth_to_mbps(getattr(link, "bandwidth", None))
            util = link_total_util.get(link.id, 0.0)
            link_metrics.append(
                {
                    "link_id": link.id,
                    "bandwidth": self._format_bandwidth(mbps),
                    "utilization": round(util, 4),
                    "active_in_lb": link.id in selected_link_ids,
                }
            )

        return {
            "success": True,
            "source_id": src_id,
            "target_id": target_id,
            "resolved_source_id": resolved_src,
            "resolved_target_id": resolved_dst,
            "ecmp_path_count": len(path_items),
            "traffic_load": max(0.0, min(0.99, float(traffic_load))),
            "packet_size_bytes": int(packet_size_bytes),
            "paths": path_items,
            "selected_link_ids": sorted(selected_link_ids),
            "link_metrics": link_metrics,
            "message": f"Found {len(path_items)} OSPF load-balance paths",
        }


    # ==================== 状态更新 ====================

    def update_device_status(self, device_id: str, status: str) -> TopologyData:
        dev = self.device_map.get(device_id)
        if dev:
            dev.status = status
            self._rebuild_runtime()
        return self.topology


    def update_link_status(self, link_id: str, status: str) -> TopologyData:
        for link in self.topology.links:
            if link.id == link_id:
                link.status = status
                break
        self._rebuild_runtime()
        return self.topology


    def find_and_update_link(self, src_id: str, dst_id: str, status: str) -> TopologyData:
        for link in self.topology.links:
            if {link.src_device, link.dst_device} == {src_id, dst_id}:
                link.status = status
                break
        self._rebuild_runtime()
        return self.topology


    def update_ospf_link_cost(self, link_id: str, cost: int) -> TopologyData:
        for link in self.topology.links:
            if link.id == link_id:
                link.ospf_cost = max(1, int(cost))
                break
        self._rebuild_runtime()
        return self.topology


    def update_interface_status(self, device_id: str, port_name: str, status: str) -> TopologyData:
        dev = self.device_map.get(device_id)
        iface = self._get_interface(dev, port_name) if dev else None
        if iface:
            iface["status"] = status
            self._rebuild_runtime()
        return self.topology


    # ==================== VLAN配置 ====================

    def configure_vlan(self, device_id: str, port: str, mode: str,
                    vlan_id: int = None, allowed_vlans: List[int] = None) -> TopologyData:
        dev = self.device_map.get(device_id)
        iface = self._get_interface(dev, port) if dev else None
        if not iface:
            return self.topology

        key = f"{device_id}:{port}"
        if key not in self.vlan_baseline:
            self.vlan_baseline[key] = {
                "mode": iface.get("mode", "access"),
                "vlan": iface.get("vlan"),
                "allowed_vlans": iface.get("allowed_vlans"),
            }

        iface["mode"] = mode

        if mode == "access":
            if vlan_id is not None:
                iface["vlan"] = vlan_id
            iface.pop("allowed_vlans", None)

        elif mode == "trunk" and allowed_vlans is not None:
            iface["allowed_vlans"] = allowed_vlans

        self._rebuild_runtime()
        return self.topology


    def assign_vlan(self, device_id: str, port: str, vlan_id: int) -> TopologyData:
        return self.configure_vlan(device_id, port, "access", vlan_id=vlan_id)


    def remove_vlan(self, device_id: str, port: str) -> TopologyData:
        key = f"{device_id}:{port}"
        base = self.vlan_baseline.get(key)

        if not base:
            return self.configure_vlan(device_id, port, "access", vlan_id=1)

        if base.get("mode") == "trunk":
            return self.configure_vlan(device_id, port, "trunk",
                                    allowed_vlans=base.get("allowed_vlans") or [])

        return self.configure_vlan(device_id, port, "access",
                                vlan_id=int(base.get("vlan") or 1))


    def update_ospf_config(self, device_id: str, area: int, router_id: str = None) -> TopologyData:
        dev = self.device_map.get(device_id)
        if not dev:
            return self.topology

        ospf = self._ensure_ospf_dict(dev)
        ospf["area"] = area

        if router_id:
            ospf["router_id"] = router_id
        else:
            ospf.setdefault("router_id", (dev.ip or "1.1.1.1").split("/")[0])

        ospf["last_reset_time"] = 0
        self._rebuild_runtime()
        return self.topology


    def get_ospf_neighbors(self, device_id: str) -> List[Dict]:
        dev = self.device_map.get(device_id)
        if not dev or not self._is_ospf_ready(dev):
            return []

        ospf = self._get_ospf_config(dev)
        if not ospf:
            return []

        t = time.time() - float(ospf.get("last_reset_time", 0) or 0)
        state = (
            "Init" if t < 5 else
            "2-Way" if t < 10 else
            "ExStart" if t < 15 else
            "Loading" if t < 20 else
            "Full"
        )

        res = []
        for n in self.ospf_graph.neighbors(device_id):
            n_dev = self.device_map[n]
            n_ospf = self._get_ospf_config(n_dev)
            res.append({
                "neighbor_id": n,
                "router_id": n_ospf.get("router_id") if n_ospf else "0.0.0.0",
                "address": n_dev.ip,
                "interface": self._get_local_interface_on_link(device_id, n),
                "state": state,
                "area": str((n_ospf or {}).get("area", 0)),
                "details": f"State is {state}",
            })

        return res
