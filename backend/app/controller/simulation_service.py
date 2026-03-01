"""网络仿真与运维行为的核心服务。

本模块基于拓扑数据构建运行时图结构（NetworkX），并提供 ping、traceroute、
链路/设备/接口状态变更、VLAN 与 OSPF 配置等仿真能力。

Author: Adorrain
Date: 2026-03-01
"""

import networkx as nx
import random
import time
import ipaddress
from typing import List, Dict, Any, Optional, Set, Tuple
from app.model.topology import TopologyData, Device, Link

class SimulationService:
    """基于拓扑数据的仿真服务。
    
    核心功能：
    1. 运行时拓扑构建 (Runtime Build)
    2. L2/VLAN 可达性计算 (L2 Reachability)
    3. L3/路由仿真 (L3 Routing)
    4. 转发路径仿真 (Ping/Traceroute)
    5. 状态与配置管理 (Mutation API)
    """

    def __init__(self, topology_data: TopologyData):
        self.topology = topology_data
        self._rebuild_runtime()

    # =========================================================================
    # 1. 运行时构建 (Runtime Build)
    # =========================================================================

    def _normalize_config(self):
        """规范化设备配置，处理兼容性字段。"""
        for dev in self.topology.devices:
            # 将 device.ospf 迁移到 device.configuration["ospf"]
            if dev.ospf:
                if "ospf" not in dev.configuration:
                    dev.configuration["ospf"] = {}
                if isinstance(dev.ospf, dict):
                    # 仅在 configuration 中没有相应配置时才覆盖，或者合并
                    # 这里选择合并，以 device.ospf 为初始值
                    for k, v in dev.ospf.items():
                        if k not in dev.configuration["ospf"]:
                            dev.configuration["ospf"][k] = v
                dev.ospf = None

    def _rebuild_runtime(self):
        """重建运行时索引与图结构。"""
        # 0. 规范化配置
        self._normalize_config()

        # 1. 设备索引
        self.device_map = {d.id: d for d in self.topology.devices}
        
        # 2. IP索引 (用于反查设备ID)
        self.ip_map = self._build_ip_map()
        
        # 3. 物理拓扑图 (L1/L2 连通性)
        self.graph = self._build_physical_graph()
        
        # 4. OSPF 邻居图 (L3 邻接关系)
        self.ospf_graph = self._build_ospf_graph()
        
        # 5. 路由表计算
        self.routing_tables = self._build_routing_tables()

    def _build_ip_map(self) -> Dict[str, str]:
        """构建 IP -> Device ID 映射。"""
        ip_map = {}
        for dev in self.topology.devices:
            # 设备主 IP (Management IP)
            if dev.ip:
                ip_map[dev.ip.split("/")[0]] = dev.id
            
            # 接口 IP
            for iface in dev.interfaces:
                ip = iface.get("ip")
                if ip:
                    ip_map[str(ip).split("/")[0]] = dev.id
        return ip_map

    def _build_physical_graph(self) -> nx.Graph:
        """构建物理连通图 (L1/L2)，仅包含 Up 状态的设备和链路。"""
        G = nx.Graph()
        
        # 添加节点
        for dev in self.topology.devices:
            if dev.status.lower() not in ("down", "offline"):
                # 显式添加需要的属性，避免 model_extra 问题
                G.add_node(dev.id, 
                           name=dev.name, 
                           device_type=dev.device_type, 
                           ip=dev.ip)

        # 添加链路
        for link in self.topology.links:
            # 检查节点是否存在
            if link.src_device not in G or link.dst_device not in G:
                continue
            # 检查链路状态
            if link.status.lower() not in ("up", "active"):
                continue

            src_dev = self.device_map[link.src_device]
            dst_dev = self.device_map[link.dst_device]
            
            src_iface = self._get_interface(src_dev, link.src_interface)
            dst_iface = self._get_interface(dst_dev, link.dst_interface)

            # 检查接口状态
            if not self._is_interface_up(src_iface) or not self._is_interface_up(dst_iface):
                continue

            # 计算 VLAN 允许列表 (L2 核心逻辑)
            allowed_vlans = self._compute_link_allowed_vlans(src_iface, dst_iface)
            
            # 计算权重 (Bandwidth -> Cost)
            weight = self._get_link_cost(link.bandwidth)

            G.add_edge(
                link.src_device, 
                link.dst_device, 
                weight=weight, 
                allowed_vlans=allowed_vlans,
                src_interface=link.src_interface,
                dst_interface=link.dst_interface,
                bandwidth=link.bandwidth
            )
        return G

    # =========================================================================
    # 2. L2与VLAN逻辑 (L2 & VLAN Reachability)
    # =========================================================================

    def _get_interface(self, device: Device, port_name: str) -> Optional[Dict[str, Any]]:
        """查找设备的接口配置。"""
        if not port_name: return None
        for iface in device.interfaces:
            if iface.get("name") == port_name:
                return iface
        return None

    def _is_interface_up(self, iface: Optional[Dict[str, Any]]) -> bool:
        """判断接口是否 Up。"""
        if not iface: return True # 默认视为 Up
        return iface.get("status", "up").lower() == "up"

    def _get_link_cost(self, bandwidth: Optional[str]) -> int:
        """根据带宽计算开销 (Cost)。"""
        if not bandwidth: return 1
        bw = bandwidth.lower()
        if "100m" in bw: return 10
        if "1g" in bw: return 1
        if "10g" in bw: return 1
        return 1

    def _compute_link_allowed_vlans(self, src_iface: Dict, dst_iface: Dict) -> Set[int]:
        """计算链路允许通过的 VLAN ID 集合。
        
        Returns:
            Set[int]: 允许的 VLAN ID 集合。
            None: 表示允许所有 VLAN (通常用于两个 Trunk 且未配置 allowed_vlans 的情况)。
        """
        # 默认 Access VLAN 1
        s_mode = src_iface.get("mode", "access") if src_iface else "access"
        d_mode = dst_iface.get("mode", "access") if dst_iface else "access"
        
        s_vlan = int(src_iface.get("vlan", 1)) if src_iface else 1
        d_vlan = int(dst_iface.get("vlan", 1)) if dst_iface else 1

        def parse_allowed(iface):
            if not iface or "allowed_vlans" not in iface: return None # None = All
            val = iface["allowed_vlans"]
            if isinstance(val, list): return set(map(int, val))
            return set()

        s_allowed = parse_allowed(src_iface)
        d_allowed = parse_allowed(dst_iface)

        # Case 1: Access - Access (必须相同 VLAN)
        if s_mode == "access" and d_mode == "access":
            return {s_vlan} if s_vlan == d_vlan else set()
        
        # Case 2: Trunk - Trunk (取交集)
        if s_mode == "trunk" and d_mode == "trunk":
            if s_allowed is None and d_allowed is None: return None 
            if s_allowed is None: return d_allowed
            if d_allowed is None: return s_allowed
            return s_allowed & d_allowed

        # Case 3: Hybrid / Mixed (Access <-> Trunk)
        # Trunk 端允许 Access 端的 PVID 通过
        trunk_allowed = s_allowed if s_mode == "trunk" else d_allowed
        access_vlan = d_vlan if s_mode == "trunk" else s_vlan
        
        if trunk_allowed is None or access_vlan in trunk_allowed:
            return {access_vlan}
        return set()

    def _find_l2_path(self, src: str, dst: str, vlan: int) -> Optional[List[str]]:
        """在指定 VLAN 内查找 L2 路径。"""
        # 构建仅包含允许该 VLAN 的边的子图
        # 优化：不显式构建全图，直接使用 BFS/Dijkstra 过滤边
        try:
            return nx.shortest_path(
                self.graph, 
                source=src, 
                target=dst, 
                weight="weight",
                method="dijkstra"
            )
            # 注意：上面的 shortest_path 没有过滤 VLAN。
            # 为了准确性，必须过滤边。这里使用自定义 BFS 或过滤后的视图。
        except:
            return None
            
        # 正确做法：构建临时视图
        def filter_edge(u, v, k):
            data = self.graph[u][v]
            allowed = data.get("allowed_vlans")
            return allowed is None or vlan in allowed

        view = nx.subgraph_view(self.graph, filter_edge=filter_edge)
        try:
            return nx.shortest_path(view, src, dst)
        except:
            return None

    def _get_access_vlan(self, device_id: str) -> Optional[int]:
        """获取设备的接入 VLAN (主要用于终端/PC)。"""
        dev = self.device_map.get(device_id)
        if not dev: return None
        if dev.vlan: return dev.vlan # 优先使用设备级 VLAN 配置
        # 检查第一个 Access 接口
        for iface in dev.interfaces:
            if iface.get("mode") != "trunk" and iface.get("vlan"):
                return int(iface["vlan"])
        return 1 # 默认 VLAN 1

    # =========================================================================
    # 3. 三层与路由仿真 (L3 & Routing)
    # =========================================================================

    def _is_l3_device(self, device_id: str) -> bool:
        """判断是否为三层设备。"""
        dev = self.device_map.get(device_id)
        if not dev: return False
        
        if dev.device_type.lower() in ("router", "l3_switch", "multilayer_switch"):
            return True
        if self._get_ospf_config(dev):
            return True
        for iface in dev.interfaces:
            if iface.get("ip"): return True
        return False

    def _get_ospf_config(self, device: Device) -> Optional[Dict]:
        """获取 OSPF 配置。"""
        if not device:
            return None
        cfg = device.configuration or {}
        ospf = cfg.get("ospf")
        if not isinstance(ospf, dict):
            return None
        if "routerId" not in ospf and "router_id" in ospf:
            ospf["routerId"] = ospf.get("router_id")
        if "router_id" not in ospf and "routerId" in ospf:
            ospf["router_id"] = ospf.get("routerId")
        return ospf

    def _build_ospf_graph(self) -> nx.Graph:
        """构建 OSPF 逻辑拓扑图。"""
        G = nx.Graph()
        
        # 1. 节点：启用 OSPF 的设备
        for dev in self.topology.devices:
            if self._is_ospf_ready(dev):
                G.add_node(dev.id)

        # 2. 边：物理连通且区域匹配
        for u, v, data in self.graph.edges(data=True):
            if u not in G or v not in G: continue
            
            # 必须允许 VLAN 通行 (L2 可达)
            allowed = data.get("allowed_vlans")
            if allowed is not None and len(allowed) == 0: continue

            u_dev = self.device_map[u]
            v_dev = self.device_map[v]
            
            u_ospf = self._get_ospf_config(u_dev)
            v_ospf = self._get_ospf_config(v_dev)
            
            # 检查 Area ID 是否一致
            if str(u_ospf.get("area", 0)) == str(v_ospf.get("area", 0)):
                G.add_edge(u, v, weight=data.get("weight", 1))
        return G

    def _is_ospf_ready(self, device: Device) -> bool:
        """判断 OSPF 进程是否就绪 (模拟启动延迟)。"""
        ospf = self._get_ospf_config(device)
        if not ospf: return False
        last_reset = float(ospf.get("last_reset_time", 0) or 0)
        return (time.time() - last_reset) > 2

    def _build_routing_tables(self) -> Dict[str, List[Dict]]:
        """计算全网路由表。"""
        tables = {}
        
        # 1. 生成直连路由 (Connected)
        connected_routes = {}
        for dev in self.topology.devices:
            routes = []
            for iface in dev.interfaces:
                if iface.get("ip"):
                    try:
                        net = ipaddress.ip_interface(iface["ip"]).network
                        routes.append({
                            "prefix": str(net), 
                            "protocol": "CONNECTED", 
                            "cost": 0, 
                            "next_hop": None, 
                            "out_interface": iface.get("name")
                        })
                    except: pass
            connected_routes[dev.id] = routes

        # 2. 计算 OSPF 路由 (使用 Dijkstra)
        for src in self.ospf_graph.nodes:
            my_routes = list(connected_routes.get(src, []))
            # 添加静态路由
            my_routes.extend(self._get_static_routes(self.device_map[src]))

            # 计算到其他节点的最短路径
            try:
                paths = nx.single_source_dijkstra_path(self.ospf_graph, src, weight="weight")
                for dst, path in paths.items():
                    if src == dst: continue
                    
                    next_hop = path[1] # 路径中第二个节点即为下一跳
                    
                    # 计算总 Cost
                    cost = 0 
                    for i in range(len(path)-1):
                        cost += self.ospf_graph[path[i]][path[i+1]].get("weight", 1)
                    
                    # 确定出接口
                    edge = self.graph.get_edge_data(src, next_hop)
                    out_iface = edge.get("src_interface") if edge.get("src_device") == src else edge.get("dst_interface")

                    # 学习目标设备的所有直连网段
                    for remote_route in connected_routes.get(dst, []):
                        # 避免重复学习本地直连
                        is_local = any(r["prefix"] == remote_route["prefix"] for r in my_routes)
                        if not is_local:
                            my_routes.append({
                                "prefix": remote_route["prefix"],
                                "protocol": "OSPF",
                                "cost": cost,
                                "next_hop": next_hop,
                                "out_interface": out_iface
                            })
            except Exception:
                pass
            
            tables[src] = my_routes
            # 同步回设备配置 (供前端展示)
            self._save_routing_table_to_device(self.device_map[src], my_routes)
            
        return tables

    def _get_static_routes(self, device: Device) -> List[Dict]:
        """获取静态路由配置。"""
        routes = []
        statics = device.configuration.get("static_routes", [])
        for r in statics:
            routes.append({
                "prefix": r.get("prefix"),
                "protocol": "STATIC",
                "cost": 1,
                "next_hop": r.get("next_hop"),
                "out_interface": r.get("out_interface")
            })
        return routes

    def _save_routing_table_to_device(self, device: Device, routes: List[Dict]):
        """将计算出的路由表保存到设备配置中。"""
        formatted = []
        for r in routes:
            formatted.append({
                "destination": r["prefix"],
                "next_hop": r["next_hop"],
                "out_interface": r["out_interface"],
                "cost": r["cost"],
                "protocol": r["protocol"]
            })
        device.configuration['routing_table'] = formatted

    # =========================================================================
    # 4. 转发仿真 (Forwarding / Ping / Trace)
    # =========================================================================

    def ping(self, src_id: str, target_ip: str) -> Dict:
        """模拟 Ping 操作。"""
        path_res = self._compute_forwarding_path(src_id, target_ip)
        if not path_res["success"]:
            return path_res
        
        hops = len(path_res["path"]) - 1
        rtt = hops * 1.5 + random.uniform(0.5, 2.0)
        return {
            "success": True,
            "message": f"Reply from {target_ip}: bytes=32 time={rtt:.2f}ms TTL={64-hops}",
            "rtt": rtt,
            "path": path_res["path"],
            "hops": hops
        }

    def traceroute(self, src_id: str, target_ip: str) -> Dict:
        """模拟 Traceroute 操作。"""
        path_res = self._compute_forwarding_path(src_id, target_ip)
        if not path_res["success"]:
            return {"success": False, "message": path_res["message"], "hops": []}
        
        path = path_res["path"]
        hops_data = []
        for i, node_id in enumerate(path):
            dev = self.device_map.get(node_id)
            rtt = (i+1) * 1.2 + random.random()
            hops_data.append({
                "hop": i+1,
                "ip": dev.ip if dev else "Unknown",
                "device_id": node_id,
                "device_name": dev.name if dev else node_id,
                "rtt": f"{rtt:.2f} ms"
            })
        return {"success": True, "path": path, "hops": hops_data}

    def _compute_forwarding_path(self, src_id: str, dst_ip: str) -> Dict:
        """计算端到端的转发路径 (核心逻辑)。"""
        if src_id not in self.graph:
            return {"success": False, "message": "Source device down"}
        
        dst_id = self.ip_map.get(dst_ip)
        if not dst_id:
            return {"success": False, "message": "Target IP unknown"}
        
        # 1. 尝试 L2 直通 (同一 VLAN/子网)
        src_vlan = self._get_access_vlan(src_id)
        dst_vlan = self._get_access_vlan(dst_id)
        
        if src_vlan and dst_vlan and src_vlan == dst_vlan:
            l2_path = self._find_l2_path(src_id, dst_id, src_vlan)
            if l2_path:
                return {"success": True, "path": l2_path, "mode": "L2"}

        # 2. L3 路由转发
        current = src_id
        path = [current]
        visited = {current}
        
        # Step 2.1: Access 设备寻找网关
        if not self._is_l3_device(current) and src_vlan:
            gateway = self._find_gateway_in_vlan(current, src_vlan)
            if not gateway:
                return {"success": False, "message": "No Gateway found"}
            
            l2_to_gw = self._find_l2_path(current, gateway, src_vlan)
            if not l2_to_gw:
                return {"success": False, "message": "Gateway unreachable (L2)"}
            
            # 更新路径
            # l2_to_gw 包含 [current, ..., gateway]
            # 避免重复添加 current
            for node in l2_to_gw[1:]:
                path.append(node)
                visited.add(node)
            current = gateway

        # Step 2.2: 逐跳查表转发
        while current != dst_id:
            if len(path) > 30: return {"success": False, "message": "TTL Exceeded"}
            
            routes = self.routing_tables.get(current, [])
            best_route = self._match_route(routes, dst_ip)
            
            if not best_route:
                return {"success": False, "message": f"No route to host at {current}"}
            
            next_hop = best_route["next_hop"]
            protocol = best_route["protocol"]
            
            if protocol == "CONNECTED":
                # 目标在直连网段，尝试 L2 到达
                # 注意：此时 dst_vlan 可能未知 (如果 dst 不是 Access 设备)，假设 VLAN 1 或接口 VLAN
                # 简单起见，尝试物理路径
                if self.graph.has_edge(current, dst_id):
                    path.append(dst_id)
                    return {"success": True, "path": path, "mode": "L3"}
                
                l2_final = self._find_l2_path(current, dst_id, dst_vlan or 1)
                if l2_final:
                    for node in l2_final[1:]:
                        if node in visited: return {"success": False, "message": "Loop detected"}
                        path.append(node)
                    return {"success": True, "path": path, "mode": "L3"}
                
                return {"success": False, "message": "Destination unreachable on connected network"}
            
            elif next_hop:
                if next_hop in visited:
                    return {"success": False, "message": "Routing Loop"}
                
                if not self.graph.has_edge(current, next_hop):
                     return {"success": False, "message": "Next hop unreachable"}
                
                path.append(next_hop)
                visited.add(next_hop)
                current = next_hop
            else:
                return {"success": False, "message": "Invalid Route"}

        return {"success": True, "path": path, "mode": "L3"}

    def _match_route(self, routes: List[Dict], target_ip: str) -> Optional[Dict]:
        """最长前缀匹配 (LPM)。"""
        try:
            ip = ipaddress.ip_address(target_ip)
        except: return None
        
        best = None
        best_len = -1
        
        for r in routes:
            try:
                net = ipaddress.ip_network(r["prefix"], strict=False)
                if ip in net:
                    if net.prefixlen > best_len:
                        best = r
                        best_len = net.prefixlen
                    elif net.prefixlen == best_len:
                        # 相同前缀长度，选 Cost 小的
                        if r["cost"] < best["cost"]:
                            best = r
            except: continue
        return best

    def _find_gateway_in_vlan(self, device_id: str, vlan: int) -> Optional[str]:
        """在 VLAN 内寻找最近的三层网关。"""
        # 构建 VLAN 视图
        def filter_edge(u, v, k):
            data = self.graph[u][v]
            allowed = data.get("allowed_vlans")
            return allowed is None or vlan in allowed
        
        vlan_view = nx.subgraph_view(self.graph, filter_edge=filter_edge)
        
        if device_id not in vlan_view: return None
        
        try:
            # 寻找该连通分量内的所有 L3 设备
            # BFS 搜索最近的 L3 节点
            visited = {device_id}
            queue = [(device_id, 0)]
            
            while queue:
                node, dist = queue.pop(0)
                if node != device_id and self._is_l3_device(node):
                    return node
                
                for neighbor in vlan_view.neighbors(node):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append((neighbor, dist + 1))
            return None
        except: return None

    # =========================================================================
    # 5. 状态与配置管理 (Mutation API)
    # =========================================================================

    def update_device_status(self, device_id: str, status: str) -> TopologyData:
        if device_id in self.device_map:
            self.device_map[device_id].status = status
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
        self._rebuild_runtime()
        return self.topology

    def update_interface_status(self, device_id: str, port_name: str, status: str) -> TopologyData:
        dev = self.device_map.get(device_id)
        if dev:
            iface = self._find_interface(dev, port_name)
            if iface:
                iface["status"] = status
                self._rebuild_runtime()
        return self.topology
    
    def _find_interface(self, dev: Device, port_name: str) -> Optional[Dict]:
        for iface in dev.interfaces:
            if iface.get("name") == port_name:
                return iface
        return None

    def configure_vlan(self, device_id: str, port: str, mode: str, vlan_id: int = None, allowed_vlans: List[int] = None) -> TopologyData:
        dev = self.device_map.get(device_id)
        if dev:
            iface = self._find_interface(dev, port)
            if iface:
                iface["mode"] = mode
                if mode == "access":
                    if vlan_id: iface["vlan"] = vlan_id
                    if "allowed_vlans" in iface: del iface["allowed_vlans"]
                elif mode == "trunk":
                    if allowed_vlans: iface["allowed_vlans"] = allowed_vlans
                self._rebuild_runtime()
        return self.topology
    
    def assign_vlan(self, device_id: str, port: str, vlan_id: int) -> TopologyData:
        return self.configure_vlan(device_id, port, "access", vlan_id=vlan_id)
        
    def remove_vlan(self, device_id: str, port: str) -> TopologyData:
        return self.configure_vlan(device_id, port, "access", vlan_id=1)

    def update_ospf_config(self, device_id: str, area: int, router_id: str = None) -> TopologyData:
        dev = self.device_map.get(device_id)
        if dev:
            if not dev.configuration:
                dev.configuration = {}
            if "ospf" not in dev.configuration or not isinstance(dev.configuration.get("ospf"), dict):
                dev.configuration["ospf"] = {}
            ospf = dev.configuration["ospf"]
            ospf["area"] = area
            if router_id:
                ospf["router_id"] = router_id
                ospf["routerId"] = router_id
            elif "router_id" not in ospf and "routerId" not in ospf:
                rid = dev.ip.split("/")[0] if dev.ip else "1.1.1.1"
                ospf["router_id"] = rid
                ospf["routerId"] = rid
            elif "routerId" not in ospf and "router_id" in ospf:
                ospf["routerId"] = ospf.get("router_id")
            elif "router_id" not in ospf and "routerId" in ospf:
                ospf["router_id"] = ospf.get("routerId")
            ospf["last_reset_time"] = time.time()
            self._rebuild_runtime()
        return self.topology

    def reset_ospf(self, device_id: str) -> TopologyData:
        dev = self.device_map.get(device_id)
        if dev:
            ospf = self._get_ospf_config(dev)
            if not ospf:
                dev.configuration["ospf"] = {}
                ospf = dev.configuration["ospf"]
            ospf["last_reset_time"] = time.time()
            self._rebuild_runtime()
        return self.topology

    def get_ospf_neighbors(self, device_id: str) -> List[Dict]:
        """获取 OSPF 邻居状态。"""
        dev = self.device_map.get(device_id)
        if not dev:
            return []
        if not self._is_ospf_ready(dev):
            return []
        my_ospf = self._get_ospf_config(dev)
        if not my_ospf:
            return []
        last_reset = float(my_ospf.get("last_reset_time", 0) or 0)
        time_diff = time.time() - last_reset

        neighbors = []
        for n_id in self.ospf_graph.neighbors(device_id):
            n_dev = self.device_map[n_id]
            n_ospf = self._get_ospf_config(n_dev)
            
            # State Machine Simulation
            state = "Full"
            if time_diff < 5: state = "Init"
            elif time_diff < 10: state = "2-Way"
            elif time_diff < 15: state = "ExStart"
            elif time_diff < 20: state = "Loading"

            edge = self.graph.get_edge_data(device_id, n_id)
            iface = edge.get("src_interface") if edge.get("src_device") == device_id else edge.get("dst_interface")
            
            neighbors.append({
                "neighbor_id": n_id,
                "router_id": n_ospf.get("router_id", "0.0.0.0"), # Snake Case
                "address": n_dev.ip,
                "interface": iface,
                "state": state,
                "area": str(n_ospf.get("area", 0)),
                "details": f"State is {state}"
            })
        return neighbors
