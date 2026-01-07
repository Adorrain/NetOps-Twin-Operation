import networkx as nx
from typing import List, Dict, Any, Optional
from app.models.topology import TopologyData, Device, Link

class SimulationService:
    def __init__(self, topology_data: TopologyData):
        self.topology = topology_data
        self.graph = self._build_graph()
        self.device_map = {d.id: d for d in self.topology.devices}
        self.ip_map = self._build_ip_map()

    def _build_graph(self) -> nx.Graph:
        """
        构建网络图 (无向图)
        仅添加状态为 'up' 的设备和链路
        并且检查链路两端的接口状态是否为 'up'
        """
        G = nx.Graph()
        
        # 添加节点 (设备)
        for device in self.topology.devices:
            if device.status == 'up':
                G.add_node(device.id, **device.dict())

        # 添加边 (链路)
        for link in self.topology.links:
            # 1. 检查两端设备是否都在图中 (即都为 up)
            if link.src_device_id not in G or link.dst_device_id not in G:
                continue

            # 2. 检查链路本身状态
            if link.status != 'up':
                continue

            # 3. 检查两端接口状态
            # 获取端口名称 (兼容 extra 字段)
            src_port = getattr(link, 'src_port', None) or link.dict().get('src_port')
            dst_port = getattr(link, 'dst_port', None) or link.dict().get('dst_port')

            src_iface_up = self._is_interface_up(link.src_device_id, src_port)
            dst_iface_up = self._is_interface_up(link.dst_device_id, dst_port)

            if src_iface_up and dst_iface_up:
                # 权重默认为1，可根据带宽调整 (带宽越大权重越小)
                weight = 1
                if link.bandwidth:
                    # 简单逻辑：10G -> 1, 1G -> 10, 100M -> 100
                    if '10G' in link.bandwidth: weight = 1
                    elif '1G' in link.bandwidth: weight = 10
                    elif '100M' in link.bandwidth: weight = 100
                
                G.add_edge(link.src_device_id, link.dst_device_id, weight=weight, **link.dict())
        
        return G

    def _is_interface_up(self, device_id: str, port_name: str) -> bool:
        """
        检查指定设备的接口状态是否为 'up'
        如果接口不存在，默认视为 'up' (简化逻辑)
        """
        if not port_name:
            return True

        device = self.device_map.get(device_id)
        if not device:
            return False
        
        # interfaces 可能是 dict 列表或对象列表
        interfaces = getattr(device, 'interfaces', []) or device.dict().get('interfaces', [])
        
        for iface in interfaces:
            # 统一获取 name 和 status
            if isinstance(iface, dict):
                i_name = iface.get('name')
                i_status = iface.get('status', 'up')
            else:
                i_name = getattr(iface, 'name', None)
                i_status = getattr(iface, 'status', 'up')

            if i_name == port_name:
                return i_status == 'up'
        
        return True

    def _build_ip_map(self) -> Dict[str, str]:
        """
        构建 IP -> DeviceID 的映射表
        包括管理 IP 和接口 IP
        """
        ip_map = {}
        for device in self.topology.devices:
            # 1. 管理 IP
            if device.mgmt_ip:
                # 简单处理 CIDR，只取 IP 部分 (e.g., 192.168.1.1/24 -> 192.168.1.1)
                ip = device.mgmt_ip.split('/')[0]
                ip_map[ip] = device.id
            
            # 2. 接口 IP (如果有 interfaces 字段)
            # Device model extra="allow", so interfaces might be in __dict__ or extra fields
            interfaces = getattr(device, 'interfaces', []) or device.dict().get('interfaces', [])
            for iface in interfaces:
                if isinstance(iface, dict) and iface.get('ip'):
                    ip = iface['ip'].split('/')[0]
                    ip_map[ip] = device.id
                elif hasattr(iface, 'ip') and iface.ip:
                     ip = iface.ip.split('/')[0]
                     ip_map[ip] = device.id
        
        return ip_map

    def get_device_by_ip(self, ip: str) -> Optional[str]:
        return self.ip_map.get(ip)

    def ping(self, src_device_id: str, target_ip: str) -> Dict[str, Any]:
        """
        模拟 Ping 操作
        """
        # 1. 解析目标 IP
        dst_device_id = self.get_device_by_ip(target_ip)
        
        if not dst_device_id:
            return {
                "success": False,
                "message": f"Target IP {target_ip} not reachable (IP not found in topology)",
                "rtt": None
            }
            
        if src_device_id not in self.graph:
            return {
                "success": False,
                "message": f"Source device {src_device_id} is down or not found",
                "rtt": None
            }

        if dst_device_id not in self.graph:
             return {
                "success": False,
                "message": f"Target device {dst_device_id} is down",
                "rtt": None
            }

        # 2. 计算最短路径
        try:
            path = nx.shortest_path(self.graph, source=src_device_id, target=dst_device_id)
            
            # 3. 模拟 RTT
            # 基础延迟 2ms + 每跳 1ms + 随机抖动
            import random
            hops = len(path) - 1
            base_rtt = 2 + hops * 1 + random.uniform(0, 2)
            
            return {
                "success": True,
                "message": f"Reply from {target_ip}: bytes=32 time={base_rtt:.2f}ms TTL={64-hops}",
                "rtt": base_rtt,
                "path": path,
                "hops": hops
            }
            
        except nx.NetworkXNoPath:
            return {
                "success": False,
                "message": "Request timed out (No path to host)",
                "rtt": None
            }

    def traceroute(self, src_device_id: str, target_ip: str) -> Dict[str, Any]:
        """
        模拟 Traceroute
        """
        dst_device_id = self.get_device_by_ip(target_ip)
        
        if not dst_device_id:
             return {"success": False, "hops": [], "message": f"Target IP {target_ip} unknown"}

        if src_device_id not in self.graph or dst_device_id not in self.graph:
             return {"success": False, "hops": [], "message": "Source or Target device is down"}

        try:
            # 使用 Dijkstra 算法找到带权重的最短路径
            path = nx.dijkstra_path(self.graph, source=src_device_id, target=dst_device_id)
            
            hops_data = []
            for i, node_id in enumerate(path):
                device = self.device_map.get(node_id)
                # 模拟每跳延迟
                rtt = (i + 1) * 1.5  # 简单累加
                
                hops_data.append({
                    "hop": i + 1,
                    "device_id": node_id,
                    "device_name": device.name if device else node_id,
                    "ip": device.mgmt_ip if device else "unknown",
                    "rtt": f"{rtt:.2f} ms"
                })
                
            return {
                "success": True, 
                "hops": hops_data,
                "path": path
            }
            
        except nx.NetworkXNoPath:
            return {"success": False, "hops": [], "message": "Destination unreachable"}

    # --- 状态修改方法 (返回修改后的 TopologyData) ---

    def update_device_status(self, device_id: str, status: str) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                d.status = status
                break
        return self.topology

    def update_link_status(self, link_id: str, status: str) -> TopologyData:
        # 如果提供了 ID 直接匹配
        for l in self.topology.links:
            if l.id == link_id:
                l.status = status
                break
        return self.topology
        
    def find_and_update_link(self, src_id: str, dst_id: str, status: str) -> TopologyData:
        # 查找连接两端的链路 (无向)
        for l in self.topology.links:
            if (l.src_device_id == src_id and l.dst_device_id == dst_id) or \
               (l.src_device_id == dst_id and l.dst_device_id == src_id):
                l.status = status
        return self.topology

    def update_interface_status(self, device_id: str, iface_name: str, status: str) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                # 查找接口
                interfaces = getattr(d, 'interfaces', []) or []
                found = False
                for iface in interfaces:
                    # interfaces 可能是 dict 或 object
                    name = iface.get('name') if isinstance(iface, dict) else getattr(iface, 'name', '')
                    if name == iface_name:
                        if isinstance(iface, dict):
                            iface['status'] = status
                        else:
                            iface.status = status
                        found = True
                        break
                
                # 如果没找到且 interfaces 是空的，可能需要初始化结构 (简化处理: 暂时只处理已有接口)
                if not found:
                    pass # Interface not found
                break
        return self.topology

    def assign_vlan(self, device_id: str, port: str, vlan_id: int) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                # 1. 更新接口的 VLAN
                interfaces = getattr(d, 'interfaces', []) or []
                for iface in interfaces:
                    name = iface.get('name') if isinstance(iface, dict) else getattr(iface, 'name', '')
                    if name == port:
                        if isinstance(iface, dict):
                            iface['vlan'] = vlan_id
                        else:
                            iface.vlan = vlan_id
                
                # 2. 确保设备配置里有这个 VLAN (Access/Trunk)
                # 简化逻辑：直接在 extra 字段里记录 vlans 列表
                current_vlans = getattr(d, 'vlans', []) or []
                if isinstance(current_vlans, list):
                     # 检查是否已存在
                     if not any(v.get('vlan_id') == vlan_id for v in current_vlans if isinstance(v, dict)):
                         current_vlans.append({'vlan_id': vlan_id, 'name': f'VLAN{vlan_id}'})
                         # Pydantic model update
                         if hasattr(d, 'vlans'):
                             d.vlans = current_vlans
                         else:
                             # 如果是 extra field，可能在 __dict__
                             d.__dict__['vlans'] = current_vlans
                break
        return self.topology

    def update_ospf_config(self, device_id: str, area: int) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                # 假设 ospf 配置存储在 ospf 字段或 configuration.ospf
                # 统一更新顶层 ospf 字段
                if not hasattr(d, 'ospf') or d.ospf is None:
                    d.ospf = {}
                
                if isinstance(d.ospf, dict):
                    d.ospf['area'] = area
                else:
                    # 如果是对象模型，视具体定义而定，这里假设是 Dict
                    d.ospf = {'area': area}
                break
        return self.topology

    def reset_ospf(self, device_id: str) -> TopologyData:
        """
        模拟 OSPF 进程重置
        实际上只是触发一个状态变更事件，不修改持久化配置
        """
        # 实际逻辑可能涉及短暂将邻居状态置为 Init/2-Way，这里简化为无操作，仅返回当前拓扑
        # 前端/日志会记录这个操作
        return self.topology

    def get_ospf_neighbors(self, device_id: str) -> List[Dict[str, Any]]:
        """
        获取 OSPF 邻居列表 (模拟)
        """
        neighbors = []
        
        # 1. 检查本端是否启用了 OSPF
        source_device = self.device_map.get(device_id)
        if not source_device:
            return []
            
        # 检查 ospf 配置
        src_ospf = getattr(source_device, 'ospf', None) or source_device.dict().get('ospf')
        if not src_ospf:
            # 尝试从 configuration 中获取
            config = getattr(source_device, 'configuration', {}) or {}
            src_ospf = config.get('ospf')
            
        if not src_ospf:
            return [] # 本端未启用 OSPF

        # 2. 遍历所有连接
        for link in self.topology.links:
            neighbor_id = None
            if link.src_device_id == device_id:
                neighbor_id = link.dst_device_id
            elif link.dst_device_id == device_id:
                neighbor_id = link.src_device_id
            
            if neighbor_id:
                neighbor_dev = self.device_map.get(neighbor_id)
                if not neighbor_dev:
                    continue
                    
                # 检查对端是否启用 OSPF
                dst_ospf = getattr(neighbor_dev, 'ospf', None) or neighbor_dev.dict().get('ospf')
                if not dst_ospf:
                    config = getattr(neighbor_dev, 'configuration', {}) or {}
                    dst_ospf = config.get('ospf')
                
                if dst_ospf:
                    # 确定邻居状态
                    state = "Full"
                    if source_device.status != 'up' or neighbor_dev.status != 'up' or link.status != 'up':
                        state = "Down"
                    
                    # 获取对端 Router ID (模拟)
                    router_id = dst_ospf.get('router_id') or dst_ospf.get('routerId') or neighbor_dev.mgmt_ip or "0.0.0.0"
                    
                    neighbors.append({
                        "neighbor_id": neighbor_id,
                        "neighbor_name": neighbor_dev.name,
                        "address": neighbor_dev.mgmt_ip,
                        "router_id": router_id,
                        "state": state,
                        "interface": getattr(link, 'src_port', 'eth0') if link.src_device_id == device_id else getattr(link, 'dst_port', 'eth0'),
                        "area": dst_ospf.get('area', 0),
                        "priority": dst_ospf.get('priority', 1)
                    })
        
        return neighbors

    def simulate_ddos(self, target_id: str) -> TopologyData:
        for d in self.topology.devices:
            if d.id == target_id:
                # 设置高负载指标
                if not hasattr(d, 'metrics') or d.metrics is None:
                    d.metrics = {}
                
                # 更新 metrics (这里只是更新数据模型，前端收到后渲染红色/高负载)
                d.metrics = {
                    'cpuUsage': 99,       # camelCase for frontend consistency
                    'memoryUsage': 95,
                    'networkIn': 10000, 
                    'networkOut': 10000
                }
                break
        return self.topology
