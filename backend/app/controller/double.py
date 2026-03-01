"""网络仿真与运维行为的核心服务。

本模块基于拓扑数据构建运行时图结构（NetworkX），并提供 ping、traceroute、
链路/设备/接口状态变更、VLAN 与 OSPF 配置等仿真能力。

Author: Adorrain
Date: 2026-01-30
"""

import networkx as nx
import random
import time
import ipaddress
from typing import List, Dict, Any, Optional
from app.model.topology import TopologyData, Device, Link


class SimulationService:
    """基于拓扑数据的仿真服务。

    维护设备映射、连通图与 IP 映射等运行时结构，支持多类运维操作的仿真计算。
    """

    def __init__(self, topology_data: TopologyData):
        """初始化仿真服务并构建运行时结构。

        Args:
            topology_data: 初始拓扑数据。
        """
        self.topology = topology_data
        self._rebuild_runtime()

    def _extra(self, obj) -> Dict[str, Any]:
        """读取对象的扩展字段字典。

        兼容 Pydantic v2 的 model_extra；当不存在或类型不匹配时返回空字典。

        Args:
            obj: 任意对象（通常为 Pydantic 模型实例）。

        Returns:
            扩展字段字典。
        """
        extra = getattr(obj, "model_extra", None)
        return extra if isinstance(extra, dict) else {}

    def _get_field(self, obj, key: str, default=None):
        """从对象或扩展字段中读取指定键的值。

        Args:
            obj: 目标对象。
            key: 字段名。
            default: 当字段不存在时的默认值。

        Returns:
            字段值或默认值。
        """
        try:
            value = getattr(obj, key, None)
        except Exception:
            value = None
        if value is None:
            value = self._extra(obj).get(key)
        return default if value is None else value

    def _set_field(self, obj, key: str, value):
        """为对象设置字段，并同步写入扩展字段。

        Args:
            obj: 目标对象。
            key: 字段名。
            value: 需要设置的值。
        """
        try:
            setattr(obj, key, value)
        except Exception:
            pass
        extra = getattr(obj, "model_extra", None)
        if not isinstance(extra, dict):
            extra = {}
        extra[key] = value
        try:
            obj.model_extra = extra
        except Exception:
            pass

    def _rebuild_runtime(self):
        """重建运行时索引与图结构。

        在拓扑数据发生变化（设备/链路/接口配置调整）后调用，以刷新 device_map、
        graph 与 ip_map。
        """
        self.device_map = {d.id: d for d in self.topology.devices}
        self.graph = self._build_graph()
        self.ip_map = self._build_ip_map()
        self.ospf_graph = self._build_ospf_graph()
        self.routing_tables = self._build_routing_tables()

    def _get_device_interfaces(self, device: Device) -> List[Any]:
        """获取设备接口列表（兼容不同数据结构）。"""
        interfaces = self._get_field(device, "interfaces")
        return interfaces if isinstance(interfaces, list) else []

    def _save_device_interfaces(self, device: Device, interfaces: List[Any]):
        """保存设备接口列表到设备对象。"""
        self._set_field(device, "interfaces", interfaces)

    def _get_configuration(self, device: Device) -> Dict[str, Any]:
        """获取设备 configuration 配置字典（不存在则返回空字典）。"""
        cfg = self._get_field(device, "configuration")
        return cfg if isinstance(cfg, dict) else {}

    def _set_configuration(self, device: Device, cfg: Dict[str, Any]):
        """设置设备 configuration 配置字典。"""
        self._set_field(device, "configuration", cfg)

    def _get_ospf(self, device: Device) -> Dict[str, Any]:
        """获取设备 OSPF 配置并规范化字段名。

        Returns:
            OSPF 配置字典，确保 routerId 与 router_id 两种写法均被兼容。
        """
        cfg = self._get_configuration(device)
        ospf = cfg.get("ospf")
        if not isinstance(ospf, dict) or len(ospf) == 0:
            extra = self._extra(device)
            extra_cfg = extra.get("configuration")
            if isinstance(extra_cfg, dict) and isinstance(extra_cfg.get("ospf"), dict):
                ospf = extra_cfg.get("ospf")
            else:
                ospf = extra.get("ospf")
        if not isinstance(ospf, dict):
            ospf = {}
        if "routerId" not in ospf and "router_id" in ospf:
            ospf["routerId"] = ospf.get("router_id")
        if "router_id" not in ospf and "routerId" in ospf:
            ospf["router_id"] = ospf.get("routerId")
        return ospf

    def _sync_ospf(self, device: Device, ospf: Dict[str, Any]):
        """将 OSPF 配置同步到设备对象的多个存储位置。"""
        cfg = self._get_configuration(device)
        cfg["ospf"] = ospf
        self._set_configuration(device, cfg)
        self._set_field(device, "ospf", ospf)

    def _build_graph(self) -> nx.Graph:
        """基于当前拓扑与状态构建连通图。

        图中仅包含处于可用状态的设备与链路，并考虑接口 up/down 及 VLAN 可达性。

        Returns:
            NetworkX 无向图实例。
        """
        G = nx.Graph()

        for device in self.topology.devices:
            if str(getattr(device, "status", "up")).lower() not in ("down", "offline"):
                G.add_node(device.id, **device.dict())

        for link in self.topology.links:
            if link.src_device not in G or link.dst_device not in G:
                continue
            if str(link.status).lower() not in ("up", "active"):
                continue

            src_port = getattr(link, "src_interface", None) or link.dict().get("src_interface")
            dst_port = getattr(link, "dst_interface", None) or link.dict().get("dst_interface")

            src_iface_up = self._is_interface_up(link.src_device, src_port)
            dst_iface_up = self._is_interface_up(link.dst_device, dst_port)

            if not (src_iface_up and dst_iface_up):
                continue

            src_vlan_info = self._get_interface_vlan_info(link.src_device, src_port)
            dst_vlan_info = self._get_interface_vlan_info(link.dst_device, dst_port)
            allowed_vlans = self._compute_link_allowed_vlans(src_vlan_info, dst_vlan_info)

            weight = 1
            if link.bandwidth:
                if "10G" in link.bandwidth:
                    weight = 1
                elif "1G" in link.bandwidth:
                    weight = 10
                elif "100M" in link.bandwidth:
                    weight = 100

            G.add_edge(
                link.src_device,
                link.dst_device,
                weight=weight,
                allowed_vlans=allowed_vlans,
                **link.dict(),
            )

        return G

    def _normalize_allowed_vlans(self, allowed) -> Optional[set]:
        if allowed is None:
            return None
        if isinstance(allowed, list):
            s = set()
            for v in allowed:
                try:
                    vi = int(v)
                except Exception:
                    continue
                if 1 <= vi <= 4094:
                    s.add(vi)
            return s
        return None

    def _compute_link_allowed_vlans(self, src_info: Dict[str, Any], dst_info: Dict[str, Any]):
        src_mode = str(src_info.get("mode") or "access").lower()
        dst_mode = str(dst_info.get("mode") or "access").lower()

        src_vlan = src_info.get("vlan", 1)
        dst_vlan = dst_info.get("vlan", 1)
        try:
            src_vlan = int(src_vlan)
        except Exception:
            src_vlan = 1
        try:
            dst_vlan = int(dst_vlan)
        except Exception:
            dst_vlan = 1

        src_allowed = self._normalize_allowed_vlans(src_info.get("allowed_vlans"))
        dst_allowed = self._normalize_allowed_vlans(dst_info.get("allowed_vlans"))

        if src_mode == "trunk" and dst_mode == "trunk":
            if src_allowed is None and dst_allowed is None:
                return None
            if src_allowed is None:
                return set() if dst_allowed is None else set(dst_allowed)
            if dst_allowed is None:
                return set(src_allowed)
            return set(src_allowed).intersection(set(dst_allowed))

        if src_mode == "trunk" and dst_mode != "trunk":
            if src_allowed is None:
                return {dst_vlan}
            return {dst_vlan} if dst_vlan in src_allowed else set()

        if dst_mode == "trunk" and src_mode != "trunk":
            if dst_allowed is None:
                return {src_vlan}
            return {src_vlan} if src_vlan in dst_allowed else set()

        return {src_vlan} if src_vlan == dst_vlan else set()

    def _edge_allows_vlan(self, edge_data: Dict[str, Any], vlan: int) -> bool:
        allowed = edge_data.get("allowed_vlans")
        if allowed is None:
            return True
        if isinstance(allowed, set):
            return vlan in allowed
        if isinstance(allowed, list):
            try:
                return int(vlan) in set(map(int, allowed))
            except Exception:
                return False
        return False

    def _build_vlan_graph(self, vlan: int) -> nx.Graph:
        G = nx.Graph()
        for node_id in self.graph.nodes:
            G.add_node(node_id, **self.graph.nodes[node_id])
        for u, v, data in self.graph.edges(data=True):
            if self._edge_allows_vlan(data, vlan):
                G.add_edge(u, v, **data)
        return G

    def _is_ospf_active(self, device_id: str) -> bool:
        dev = self.device_map.get(device_id)
        if not dev:
            return False
        ospf = self._get_ospf(dev)
        if not ospf:
            return False
        last_reset = ospf.get("last_reset_time", 0) or 0
        try:
            if time.time() - float(last_reset) < 2:
                return False
        except Exception:
            return False
        return True

    def _is_l3_device(self, device_id: str) -> bool:
        dev = self.device_map.get(device_id)
        if not dev:
            return False
        dev_type = str(getattr(dev, "device_type", "") or "").lower()
        if dev_type in ("router", "l3_switch", "l3switch", "multilayer_switch"):
            return True
        if self._device_has_l3_interface(device_id):
            return True
        return self._is_ospf_active(device_id)

    def _build_ospf_graph(self) -> nx.Graph:
        G = nx.Graph()
        for dev_id, dev in self.device_map.items():
            if dev_id not in self.graph:
                continue
            if self._is_ospf_active(dev_id) or str(getattr(dev, "device_type", "") or "").lower() == "router":
                G.add_node(dev_id)

        for u, v, data in self.graph.edges(data=True):
            if u not in G or v not in G:
                continue
            if data.get("allowed_vlans") is not None:
                allowed = data.get("allowed_vlans")
                if isinstance(allowed, set) and len(allowed) == 0:
                    continue
                if isinstance(allowed, list) and len(allowed) == 0:
                    continue
            u_dev = self.device_map.get(u)
            v_dev = self.device_map.get(v)
            if not u_dev or not v_dev:
                continue
            u_ospf = self._get_ospf(u_dev)
            v_ospf = self._get_ospf(v_dev)
            if not u_ospf or not v_ospf:
                continue
            try:
                if int(u_ospf.get("area", 0)) != int(v_ospf.get("area", 0)):
                    continue
            except Exception:
                continue
            G.add_edge(u, v, weight=data.get("weight", 1))
        return G

    def _edge_local_interface(self, edge_data: Dict[str, Any], local_id: str) -> Optional[str]:
        if edge_data.get("src_device") == local_id:
            return edge_data.get("src_interface")
        if edge_data.get("dst_device") == local_id:
            return edge_data.get("dst_interface")
        return None

    def _device_has_l3_interface(self, device_id: str) -> bool:
        dev = self.device_map.get(device_id)
        if not dev:
            return False
        dev_type = str(getattr(dev, "device_type", "") or "").lower()
        if dev_type in ("pc", "host", "terminal", "server"):
            return False
        interfaces = self._get_device_interfaces(dev)
        for iface in interfaces:
            ip_val = iface.get("ip") if isinstance(iface, dict) else getattr(iface, "ip", None)
            if not ip_val:
                continue
            try:
                ipaddress.ip_interface(str(ip_val))
            except Exception:
                continue
            return True
        return False

    def _get_device_primary_ip(self, device_id: str) -> Optional[str]:
        dev = self.device_map.get(device_id)
        if not dev:
            return None
        ip_val = getattr(dev, "ip", None) or self._get_field(dev, "ip")
        if ip_val:
            return str(ip_val).split("/")[0]
        interfaces = self._get_device_interfaces(dev)
        for iface in interfaces:
            ip2 = iface.get("ip") if isinstance(iface, dict) else getattr(iface, "ip", None)
            if not ip2:
                continue
            return str(ip2).split("/")[0]
        if getattr(dev, "mgmt_ip", None):
            return str(getattr(dev, "mgmt_ip")).split("/")[0]
        return None

    def _is_ip_like(self, s: str) -> bool:
        try:
            ipaddress.ip_address(str(s))
            return True
        except Exception:
            return False

    def _get_device_l3_interfaces(self, device_id: str) -> List[Dict[str, Any]]:
        dev = self.device_map.get(device_id)
        if not dev:
            return []
        res = []
        interfaces = self._get_device_interfaces(dev)
        for iface in interfaces:
            if isinstance(iface, dict):
                name = iface.get("name")
                ip_val = iface.get("ip")
                vlan = iface.get("vlan")
            else:
                name = getattr(iface, "name", None)
                ip_val = getattr(iface, "ip", None)
                vlan = getattr(iface, "vlan", None)
            if not ip_val:
                continue
            try:
                ipif = ipaddress.ip_interface(str(ip_val))
            except Exception:
                continue
            res.append({"name": name, "ip_interface": ipif, "vlan": vlan})
        return res

    def _get_device_connected_routes(self, router_id: str) -> List[Dict[str, Any]]:
        routes = []
        for it in self._get_device_l3_interfaces(router_id):
            ipif = it.get("ip_interface")
            if not ipif:
                continue
            prefix = str(ipif.network)
            routes.append(
                {
                    "prefix": prefix,
                    "protocol": "CONNECTED",
                    "admin_distance": 0,
                    "metric": 0,
                    "next_hop": None,
                    "out_interface": it.get("name"),
                }
            )
        return routes

    def _get_device_static_routes(self, router_id: str) -> List[Dict[str, Any]]:
        dev = self.device_map.get(router_id)
        if not dev:
            return []
        cfg = self._get_configuration(dev)
        static_list = cfg.get("static_routes")
        if not isinstance(static_list, list) or len(static_list) == 0:
            extra = self._extra(dev)
            static_list = extra.get("static_routes")
            if not isinstance(static_list, list):
                static_list = []
        routes = []
        for r in static_list:
            if not isinstance(r, dict):
                continue
            prefix = r.get("prefix") or r.get("destination") or r.get("dst")
            next_hop = r.get("next_hop") or r.get("nextHop") or r.get("gateway")
            out_interface = r.get("out_interface") or r.get("outInterface")
            if not prefix or not next_hop:
                continue
            try:
                net = ipaddress.ip_network(str(prefix), strict=False)
            except Exception:
                continue
            routes.append(
                {
                    "prefix": str(net),
                    "protocol": "STATIC",
                    "admin_distance": 1,
                    "metric": 0,
                    "next_hop": str(next_hop),
                    "out_interface": out_interface,
                }
            )
        return routes

    def _route_match_score(self, route: Dict[str, Any], dst_ip: str) -> Optional[Dict[str, Any]]:
        prefix = route.get("prefix")
        if not prefix:
            return None
        try:
            net = ipaddress.ip_network(str(prefix), strict=False)
            ip = ipaddress.ip_address(str(dst_ip))
        except Exception:
            return None
        if ip not in net:
            return None
        return {
            "prefixlen": int(net.prefixlen),
            "admin_distance": int(route.get("admin_distance", 255)),
            "metric": float(route.get("metric", 0) or 0),
        }

    def _lookup_route(self, router_id: str, dst_ip: str) -> Optional[Dict[str, Any]]:
        table = self.routing_tables.get(router_id)
        if not isinstance(table, list) or len(table) == 0:
            return None
        best = None
        best_score = None
        for r in table:
            if not isinstance(r, dict):
                continue
            score = self._route_match_score(r, dst_ip)
            if not score:
                continue
            if best is None:
                best = r
                best_score = score
                continue
            if score["prefixlen"] > best_score["prefixlen"]:
                best = r
                best_score = score
                continue
            if score["prefixlen"] < best_score["prefixlen"]:
                continue
            if score["admin_distance"] < best_score["admin_distance"]:
                best = r
                best_score = score
                continue
            if score["admin_distance"] > best_score["admin_distance"]:
                continue
            if score["metric"] < best_score["metric"]:
                best = r
                best_score = score
        return best

    def _resolve_next_hop_device(self, next_hop: Optional[str]) -> Optional[str]:
        if not next_hop:
            return None
        nh = str(next_hop)
        if self._is_ip_like(nh):
            return self.ip_map.get(nh)
        return nh

    def _build_routing_tables(self) -> Dict[str, List[Dict[str, Any]]]:
        tables: Dict[str, List[Dict[str, Any]]] = {}

        connected_by_router: Dict[str, List[Dict[str, Any]]] = {}
        prefixes_by_router: Dict[str, List[str]] = {}
        for router_id in self.ospf_graph.nodes:
            connected = self._get_device_connected_routes(router_id)
            connected_by_router[router_id] = connected
            prefixes_by_router[router_id] = [r.get("prefix") for r in connected if r.get("prefix")]

        for router_id in self.ospf_graph.nodes:
            routes: List[Dict[str, Any]] = []
            routes.extend(connected_by_router.get(router_id, []))
            routes.extend(self._get_device_static_routes(router_id))

            for dest_router in self.ospf_graph.nodes:
                if dest_router == router_id:
                    continue
                dest_prefixes = prefixes_by_router.get(dest_router, [])
                if not dest_prefixes:
                    continue
                try:
                    path = nx.dijkstra_path(self.ospf_graph, router_id, dest_router, weight="weight")
                except Exception:
                    continue
                if len(path) < 2:
                    continue
                next_hop_router = path[1]
                cost = 0.0
                try:
                    for i in range(len(path) - 1):
                        cost += float(self.ospf_graph.edges[path[i], path[i + 1]].get("weight", 1))
                except Exception:
                    cost = 0.0
                edge_data = self.graph.get_edge_data(router_id, next_hop_router) or {}
                out_iface = self._edge_local_interface(edge_data, router_id)
                for prefix in dest_prefixes:
                    if not prefix:
                        continue
                    routes.append(
                        {
                            "prefix": prefix,
                            "protocol": "OSPF",
                            "admin_distance": 110,
                            "metric": cost,
                            "next_hop": next_hop_router,
                            "out_interface": out_iface,
                        }
                    )

            tables[router_id] = routes

        for router_id, routes in tables.items():
            dev = self.device_map.get(router_id)
            if not dev:
                continue
            entries = []
            for r in routes:
                entries.append(
                    {
                        "destination": r.get("prefix"),
                        "next_hop": r.get("next_hop"),
                        "out_interface": r.get("out_interface"),
                        "cost": r.get("metric"),
                        "protocol": r.get("protocol"),
                        "admin_distance": r.get("admin_distance"),
                    }
                )
            self._set_field(dev, "routing_table", entries)
        return tables

    def _l2_shortest_path(self, vlan: int, src: str, dst: str) -> Optional[List[str]]:
        if src == dst:
            return [src]
        try:
            vlan_graph = self._build_vlan_graph(int(vlan))
            return nx.shortest_path(vlan_graph, source=src, target=dst)
        except Exception:
            return None

    def _nearest_l3_gateway(self, device_id: str, vlan: Optional[int]) -> Optional[str]:
        if self._is_l3_device(device_id):
            return device_id
        if vlan is None:
            return None
        vlan_graph = self._build_vlan_graph(int(vlan))
        if device_id not in vlan_graph:
            return None
        dev = self.device_map.get(device_id)
        gw_ip = getattr(dev, "gateway", None) or self._get_field(dev, "gateway")
        if gw_ip:
            gw_dev = self.ip_map.get(str(gw_ip).split("/")[0])
            if gw_dev and gw_dev in vlan_graph and self._is_l3_device(gw_dev):
                try:
                    _ = nx.shortest_path(vlan_graph, source=device_id, target=gw_dev)
                    return gw_dev
                except Exception:
                    pass

        src_ip = self._get_device_primary_ip(device_id)
        for cand in vlan_graph.nodes:
            if not self._is_l3_device(cand):
                continue
            if src_ip:
                for it in self._get_device_l3_interfaces(cand):
                    ipif = it.get("ip_interface")
                    if not ipif:
                        continue
                    try:
                        if ipaddress.ip_address(src_ip) in ipif.network:
                            try:
                                _ = nx.shortest_path(vlan_graph, source=device_id, target=cand)
                                return cand
                            except Exception:
                                break
                    except Exception:
                        continue

        best = None
        best_len = None
        for cand in vlan_graph.nodes:
            if not self._is_l3_device(cand):
                continue
            try:
                plen = nx.shortest_path_length(vlan_graph, source=device_id, target=cand)
            except Exception:
                continue
            if best is None or (best_len is not None and plen < best_len):
                best = cand
                best_len = plen
        return best

    def _compute_forwarding_path(self, src_device_id: str, dst_device_id: str, dst_ip: str) -> Dict[str, Any]:
        if src_device_id not in self.graph:
            return {"success": False, "message": f"Source device {src_device_id} is down", "path": None}
        if dst_device_id not in self.graph:
            return {"success": False, "message": f"Target device {dst_device_id} is down", "path": None}

        src_vlan = self._get_endpoint_access_vlan(src_device_id)
        dst_vlan = self._get_endpoint_access_vlan(dst_device_id)

        if src_vlan is not None and dst_vlan is not None and int(src_vlan) == int(dst_vlan):
            p = self._l2_shortest_path(int(src_vlan), src_device_id, dst_device_id)
            if not p:
                return {"success": False, "message": "Request timed out (No L2 path)", "path": None}
            return {"success": True, "message": "OK", "path": p, "mode": "l2"}

        ingress = self._nearest_l3_gateway(src_device_id, src_vlan)
        if not ingress:
            return {
                "success": False,
                "message": f"VLAN {src_vlan} -> VLAN {dst_vlan} requires L3 gateway/routing",
                "path": None,
            }

        left = [ingress] if src_device_id == ingress else self._l2_shortest_path(int(src_vlan), src_device_id, ingress) if src_vlan is not None else None
        if src_device_id != ingress and not left:
            return {"success": False, "message": "No ingress L3 gateway reachable", "path": None}

        combined = list(left or [])
        current = ingress
        visited = {current}
        for _ in range(len(self.graph.nodes) + 1):
            if current == dst_device_id:
                return {"success": True, "message": "OK", "path": combined, "mode": "l3"}

            route = self._lookup_route(current, dst_ip)
            if not route:
                return {"success": False, "message": "No route to destination (routing table miss)", "path": combined}

            if route.get("protocol") == "CONNECTED":
                if dst_vlan is None:
                    return {"success": False, "message": "Connected route found but VLAN unknown", "path": combined}
                l2 = self._l2_shortest_path(int(dst_vlan), current, dst_device_id)
                if not l2:
                    return {"success": False, "message": "Connected route found but no L2 path", "path": combined}
                combined.extend(l2[1:])
                return {"success": True, "message": "OK", "path": combined, "mode": "l3"}

            nh_dev = self._resolve_next_hop_device(route.get("next_hop"))
            if not nh_dev:
                return {"success": False, "message": "No next-hop resolved", "path": combined}

            if not self.graph.has_edge(current, nh_dev):
                return {"success": False, "message": f"Next-hop {nh_dev} not directly reachable", "path": combined}

            combined.append(nh_dev)
            if nh_dev in visited:
                return {"success": False, "message": "Routing loop detected", "path": combined}
            visited.add(nh_dev)
            current = nh_dev

        return {"success": False, "message": "TTL exceeded", "path": combined}

    def _get_interface_vlan_info(self, device_id: str, port_name: str) -> Dict[str, Any]:
        """获取指定设备端口的 VLAN 配置摘要。

        Args:
            device_id: 设备 ID。
            port_name: 端口名称。

        Returns:
            包含 vlan、mode、allowed_vlans 的字典；未找到时返回默认 access VLAN1。
        """
        if not port_name:
            return {"vlan": 1, "mode": "access", "allowed_vlans": None}

        device = self.device_map.get(device_id)
        if not device:
            return {"vlan": 1, "mode": "access", "allowed_vlans": None}

        interfaces = self._get_device_interfaces(device)

        for iface in interfaces:
            if isinstance(iface, dict):
                name = iface.get("name")
                vlan = iface.get("vlan", 1)
                mode = iface.get("mode", "access")
                allowed_vlans = iface.get("allowed_vlans")
            else:
                name = getattr(iface, "name", None)
                vlan = getattr(iface, "vlan", 1)
                mode = getattr(iface, "mode", "access")
                allowed_vlans = getattr(iface, "allowed_vlans", None)

            if name == port_name:
                return {"vlan": vlan, "mode": mode, "allowed_vlans": allowed_vlans}

        return {"vlan": 1, "mode": "access", "allowed_vlans": None}

    def _is_interface_up(self, device_id: str, port_name: str) -> bool:
        """判断指定设备端口是否处于 up 状态。"""
        if not port_name:
            return True
        device = self.device_map.get(device_id)
        if not device:
            return False

        interfaces = self._get_device_interfaces(device)
        for iface in interfaces:
            name = iface.get("name") if isinstance(iface, dict) else getattr(iface, "name", None)
            status = iface.get("status", "up") if isinstance(iface, dict) else getattr(iface, "status", "up")

            if name == port_name:
                return str(status).lower() == "up"
        return True

    def _build_ip_map(self) -> Dict[str, str]:
        """构建 IP 到设备 ID 的映射表。

        Returns:
            key 为 IP（不含掩码），value 为设备 ID。
        """
        ip_map = {}
        for device in self.topology.devices:
            if device.mgmt_ip:
                ip = device.mgmt_ip.split("/")[0]
                ip_map[ip] = device.id

            interfaces = self._get_device_interfaces(device)
            for iface in interfaces:
                if isinstance(iface, dict) and iface.get("ip"):
                    ip = iface["ip"].split("/")[0]
                    ip_map[ip] = device.id
                elif hasattr(iface, "ip") and iface.ip:
                    ip = iface.ip.split("/")[0]
                    ip_map[ip] = device.id
        return ip_map

    def get_device_by_ip(self, ip: str) -> Optional[str]:
        """根据 IP 查找对应设备 ID。"""
        return self.ip_map.get(ip)

    def ping(self, src_device_id: str, target_ip: str) -> Dict[str, Any]:
        """模拟 ping 目标 IP 并返回结果。

        Args:
            src_device_id: 源设备 ID。
            target_ip: 目标 IP。

        Returns:
            包含 success、message、rtt 等字段的结果字典；可能包含 path/hops。
        """
        dst_device_id = self.get_device_by_ip(target_ip)

        if not dst_device_id:
            return {"success": False, "message": f"Target IP {target_ip} not reachable", "rtt": None}
        if src_device_id not in self.graph:
            return {"success": False, "message": f"Source device {src_device_id} is down", "rtt": None}
        if dst_device_id not in self.graph:
            return {"success": False, "message": f"Target device {dst_device_id} is down", "rtt": None}

        result = self._compute_forwarding_path(src_device_id, dst_device_id, target_ip)
        if not result.get("success"):
            return {"success": False, "message": result.get("message"), "rtt": None, "path": result.get("path")}

        path = result.get("path") or []
        hops = max(0, len(path) - 1)
        base_rtt = 2 + hops * 1 + random.uniform(0, 2)
        return {
            "success": True,
            "message": f"Reply from {target_ip}: bytes=32 time={base_rtt:.2f}ms TTL={64-hops}",
            "rtt": base_rtt,
            "path": path,
            "hops": hops,
        }

    def traceroute(self, src_device_id: str, target_ip: str) -> Dict[str, Any]:
        """模拟 traceroute 并返回逐跳路径信息。"""
        dst_device_id = self.get_device_by_ip(target_ip)
        if not dst_device_id:
            return {"success": False, "hops": [], "message": f"Target IP {target_ip} unknown"}
        if src_device_id not in self.graph or dst_device_id not in self.graph:
            return {"success": False, "hops": [], "message": "Source or Target device is down"}

        result = self._compute_forwarding_path(src_device_id, dst_device_id, target_ip)
        if not result.get("success"):
            return {"success": False, "hops": [], "message": result.get("message"), "path": result.get("path")}

        path = result.get("path") or []
        hops_data = []
        for i, node_id in enumerate(path):
            device = self.device_map.get(node_id)
            rtt = (i + 1) * 1.5
            hops_data.append(
                {
                    "hop": i + 1,
                    "device_id": node_id,
                    "device_name": device.name if device else node_id,
                    "ip": device.mgmt_ip if device else "unknown",
                    "rtt": f"{rtt:.2f} ms",
                }
            )
        return {"success": True, "hops": hops_data, "path": path}

    def _get_endpoint_access_vlan(self, device_id: str) -> Optional[int]:
        """获取端点设备的 access VLAN（用于二层隔离判断）。"""
        device = self.device_map.get(device_id)
        if not device:
            return None

        direct = getattr(device, "vlan", None)
        if direct is None and hasattr(device, "model_extra") and isinstance(device.model_extra, dict):
            direct = device.model_extra.get("vlan")
        if direct is not None:
            try:
                return int(direct)
            except Exception:
                return None

        interfaces = self._get_device_interfaces(device)
        for iface in interfaces:
            if isinstance(iface, dict):
                mode = str(iface.get("mode") or "access").lower()
                if mode == "trunk":
                    continue
                vlan = iface.get("vlan")
            else:
                mode = str(getattr(iface, "mode", "access") or "access").lower()
                if mode == "trunk":
                    continue
                vlan = getattr(iface, "vlan", None)
            if vlan is None:
                continue
            try:
                return int(vlan)
            except Exception:
                continue
        return None

    def _path_has_l3_gateway(self, path: List[str]) -> bool:
        """判断路径中是否存在可作为三层网关/路由的设备。"""
        for node_id in path[1:-1]:
            dev = self.device_map.get(node_id)
            if not dev:
                continue
            dev_type = str(getattr(dev, "device_type", "") or "").lower()
            if dev_type == "router":
                return True

            ospf = self._get_ospf(dev)
            if len(ospf) > 0:
                last_reset = ospf.get("last_reset_time", 0) or 0
                try:
                    if time.time() - float(last_reset) < 2:
                        continue
                except Exception:
                    pass
                return True
        return False

    def update_device_status(self, device_id: str, status: str) -> TopologyData:
        """更新设备状态并刷新运行时结构。"""
        for d in self.topology.devices:
            if d.id == device_id:
                d.status = status
                break
        self._rebuild_runtime()
        return self.topology

    def update_link_status(self, link_id: str, status: str) -> TopologyData:
        """更新链路状态并刷新运行时结构。"""
        for l in self.topology.links:
            if l.id == link_id:
                l.status = status
                break
        self._rebuild_runtime()
        return self.topology

    def find_and_update_link(self, src_id: str, dst_id: str, status: str) -> TopologyData:
        """按端点查找链路并更新其状态。"""
        for l in self.topology.links:
            if (l.src_device == src_id and l.dst_device == dst_id) or (l.src_device == dst_id and l.dst_device == src_id):
                l.status = status
        self._rebuild_runtime()
        return self.topology

    def update_interface_status(self, device_id: str, iface_name: str, status: str) -> TopologyData:
        """更新设备指定接口的状态并刷新运行时结构。"""
        for d in self.topology.devices:
            if d.id == device_id:
                interfaces = self._get_device_interfaces(d)
                for iface in interfaces:
                    name = iface.get("name") if isinstance(iface, dict) else getattr(iface, "name", "")
                    if name == iface_name:
                        if isinstance(iface, dict):
                            iface["status"] = status
                        else:
                            iface.status = status
                        break
                self._save_device_interfaces(d, interfaces)
                break
        self._rebuild_runtime()
        return self.topology

    def assign_vlan(self, device_id: str, port: str, vlan_id: int) -> TopologyData:
        """为设备端口设置 access VLAN，并维护设备 VLAN 列表。"""
        if vlan_id < 1 or vlan_id > 4094:
            raise ValueError("vlan_id must be between 1 and 4094")
        for d in self.topology.devices:
            if d.id == device_id:
                interfaces = self._get_device_interfaces(d)
                port_found = False
                for iface in interfaces:
                    name = iface.get("name") if isinstance(iface, dict) else getattr(iface, "name", "")
                    if name == port:
                        port_found = True
                        if isinstance(iface, dict):
                            iface["vlan"] = vlan_id
                            iface["mode"] = "access"
                            iface.pop("allowed_vlans", None)
                        else:
                            iface.vlan = vlan_id
                            iface.mode = "access"
                            if hasattr(iface, "allowed_vlans"):
                                delattr(iface, "allowed_vlans")
                self._save_device_interfaces(d, interfaces)
                if not port_found:
                    raise ValueError(f"Port {port} not found on device {device_id}")

                current_vlans = getattr(d, "vlans", None)
                if current_vlans is None and hasattr(d, "model_extra") and d.model_extra:
                    current_vlans = d.model_extra.get("vlans")
                if not isinstance(current_vlans, list):
                    current_vlans = []

                if not any(v.get("vlan_id") == vlan_id for v in current_vlans if isinstance(v, dict)):
                    current_vlans.append({"vlan_id": vlan_id, "name": f"VLAN{vlan_id}"})

                try:
                    d.vlans = current_vlans
                except Exception:
                    setattr(d, "vlans", current_vlans)
                if hasattr(d, "model_extra") and isinstance(d.model_extra, dict):
                    d.model_extra["vlans"] = current_vlans
                break
        self._rebuild_runtime()
        return self.topology

    def remove_vlan(self, device_id: str, port: str) -> TopologyData:
        """移除设备端口 VLAN 配置，并在无引用时从 VLAN 列表移除。"""
        for d in self.topology.devices:
            if d.id == device_id:
                interfaces = self._get_device_interfaces(d)
                port_found = False
                removed_vlan: Optional[int] = None
                for iface in interfaces:
                    name = iface.get("name") if isinstance(iface, dict) else getattr(iface, "name", "")
                    if name == port:
                        port_found = True
                        if isinstance(iface, dict):
                            removed_vlan = iface.get("vlan")
                            iface.pop("vlan", None)
                            iface["mode"] = "access"
                            iface.pop("allowed_vlans", None)
                        else:
                            removed_vlan = getattr(iface, "vlan", None)
                            if hasattr(iface, "vlan"):
                                delattr(iface, "vlan")
                            if hasattr(iface, "mode"):
                                iface.mode = "access"
                            if hasattr(iface, "allowed_vlans"):
                                delattr(iface, "allowed_vlans")
                self._save_device_interfaces(d, interfaces)
                if not port_found:
                    raise ValueError(f"Port {port} not found on device {device_id}")

                if removed_vlan is not None:
                    vlan_still_used = False
                    for iface in interfaces:
                        vlan = iface.get("vlan") if isinstance(iface, dict) else getattr(iface, "vlan", None)
                        if vlan == removed_vlan:
                            vlan_still_used = True
                            break

                    if not vlan_still_used:
                        current_vlans = getattr(d, "vlans", None)
                        if current_vlans is None and hasattr(d, "model_extra") and d.model_extra:
                            current_vlans = d.model_extra.get("vlans")
                        if not isinstance(current_vlans, list):
                            current_vlans = []

                        current_vlans = [v for v in current_vlans if not (isinstance(v, dict) and v.get("vlan_id") == removed_vlan)]
                        try:
                            d.vlans = current_vlans
                        except Exception:
                            setattr(d, "vlans", current_vlans)
                        if hasattr(d, "model_extra") and isinstance(d.model_extra, dict):
                            d.model_extra["vlans"] = current_vlans
                break
        self._rebuild_runtime()
        return self.topology

    def configure_vlan(self, device_id: str, port: str, mode: str, vlan_id: Optional[int] = None, allowed_vlans: Optional[List[int]] = None) -> TopologyData:
        """配置端口 VLAN 模式（access/trunk）并刷新运行时结构。

        Raises:
            ValueError: 参数不合法或端口不存在。
        """
        mode = str(mode or "").lower()
        if mode not in ("access", "trunk"):
            raise ValueError("mode must be 'access' or 'trunk'")
        if mode == "access":
            if vlan_id is None:
                raise ValueError("vlan_id is required for access mode")
            return self.assign_vlan(device_id, port, int(vlan_id))

        for d in self.topology.devices:
            if d.id == device_id:
                interfaces = self._get_device_interfaces(d)
                port_found = False
                for iface in interfaces:
                    name = iface.get("name") if isinstance(iface, dict) else getattr(iface, "name", "")
                    if name != port:
                        continue
                    port_found = True
                    if isinstance(iface, dict):
                        iface["mode"] = "trunk"
                        iface.pop("vlan", None)
                        if allowed_vlans is not None:
                            normalized = []
                            for v in allowed_vlans:
                                vi = int(v)
                                if vi < 1 or vi > 4094:
                                    raise ValueError("allowed_vlans values must be between 1 and 4094")
                                normalized.append(vi)
                            iface["allowed_vlans"] = sorted(set(normalized))
                    else:
                        iface.mode = "trunk"
                        if hasattr(iface, "vlan"):
                            delattr(iface, "vlan")
                        if allowed_vlans is not None:
                            normalized = []
                            for v in allowed_vlans:
                                vi = int(v)
                                if vi < 1 or vi > 4094:
                                    raise ValueError("allowed_vlans values must be between 1 and 4094")
                                normalized.append(vi)
                            iface.allowed_vlans = sorted(set(normalized))
                self._save_device_interfaces(d, interfaces)
                if not port_found:
                    raise ValueError(f"Port {port} not found on device {device_id}")
                break
        self._rebuild_runtime()
        return self.topology

    def update_ospf_config(self, device_id: str, area: int, router_id: Optional[str] = None) -> TopologyData:
        """更新设备 OSPF 配置，并触发一次 OSPF 重置。"""
        for d in self.topology.devices:
            if d.id == device_id:
                config = self._get_configuration(d)
                ospf = config.get("ospf")
                if not isinstance(ospf, dict):
                    ospf = {}

                ospf["area"] = area
                if router_id:
                    ospf["routerId"] = router_id
                    ospf["router_id"] = router_id
                elif "routerId" not in ospf and "router_id" not in ospf:
                    rid = d.mgmt_ip.split("/")[0] if d.mgmt_ip else "1.1.1.1"
                    ospf["routerId"] = rid
                    ospf["router_id"] = rid
                elif "routerId" not in ospf and "router_id" in ospf:
                    ospf["routerId"] = ospf.get("router_id")
                elif "router_id" not in ospf and "routerId" in ospf:
                    ospf["router_id"] = ospf.get("routerId")

                self._sync_ospf(d, ospf)

                self.reset_ospf(device_id)
                break
        self._rebuild_runtime()
        return self.topology

    def reset_ospf(self, device_id: str) -> TopologyData:
        """记录设备 OSPF 重置时间并刷新运行时结构。"""
        for d in self.topology.devices:
            if d.id == device_id:
                config = self._get_configuration(d)
                ospf = config.get("ospf")
                if not isinstance(ospf, dict):
                    ospf = {}

                ts = time.time()
                ospf["last_reset_time"] = ts
                self._sync_ospf(d, ospf)
                break
        self._rebuild_runtime()
        return self.topology

    def get_ospf_neighbors(self, device_id: str) -> List[Dict[str, Any]]:
        """基于连通图与 OSPF 配置模拟邻居关系与状态。"""
        neighbors = []
        src_dev = self.device_map.get(device_id)
        if not src_dev:
            return []

        src_ospf = self._get_ospf(src_dev)
        if not src_ospf:
            return []

        last_reset = src_ospf.get("last_reset_time", 0)
        time_since_reset = time.time() - last_reset

        if time_since_reset < 2:
            return []

        def get_neighbor_interface(local_id: str, remote_id: str) -> str:
            """获取两端设备间链路在本端对应的接口名称。"""
            for link in self.topology.links:
                if link.src_device == local_id and link.dst_device == remote_id:
                    return getattr(link, "src_interface", None) or link.dict().get("src_interface") or "Unknown"
                if link.src_device == remote_id and link.dst_device == local_id:
                    return getattr(link, "dst_interface", None) or link.dict().get("dst_interface") or "Unknown"
            return "Unknown"

        if device_id in self.graph:
            for neighbor_id in self.graph.neighbors(device_id):
                dst_dev = self.device_map.get(neighbor_id)
                if not dst_dev:
                    continue

                edge_data = self.graph.get_edge_data(device_id, neighbor_id) or {}
                allowed = edge_data.get("allowed_vlans")
                if isinstance(allowed, set) and len(allowed) == 0:
                    continue
                if isinstance(allowed, list) and len(allowed) == 0:
                    continue

                dst_ospf = self._get_ospf(dst_dev)
                if not dst_ospf:
                    continue

                src_area = int(src_ospf.get("area", 0))
                dst_area = int(dst_ospf.get("area", 0))

                state = "Full"
                details = "Adjacency established"

                if src_area != dst_area:
                    state = "Init (Area Mismatch)"
                    details = f"Local Area {src_area} != Remote Area {dst_area}"
                else:
                    if time_since_reset < 5:
                        state = "Init"
                    elif time_since_reset < 8:
                        state = "2-Way"
                    elif time_since_reset < 12:
                        state = "ExStart"
                    elif time_since_reset < 15:
                        state = "Exchange"
                    elif time_since_reset < 18:
                        state = "Loading"
                    else:
                        state = "Full"

                neighbors.append(
                    {
                        "neighbor_id": neighbor_id,
                        "router_id": dst_ospf.get("routerId") or dst_ospf.get("router_id") or "0.0.0.0",
                        "address": dst_dev.mgmt_ip,
                        "interface": get_neighbor_interface(device_id, neighbor_id),
                        "state": state,
                        "area": str(dst_area),
                        "details": details,
                    }
                )
        return neighbors
