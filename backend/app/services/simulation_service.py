import networkx as nx
import time
from typing import List, Dict, Any, Optional
from app.models.topology import TopologyData, Device, Link

class SimulationService:
    def __init__(self, topology_data: TopologyData):
        self.topology = topology_data
        self.device_map = {d.id: d for d in self.topology.devices}
        self.graph = self._build_graph()
        self.ip_map = self._build_ip_map()

    def _get_device_interfaces(self, device: Device) -> List[Any]:
        """Helper to safely get interfaces list"""
        interfaces = getattr(device, 'interfaces', None)
        if interfaces is None and hasattr(device, 'model_extra') and device.model_extra:
            interfaces = device.model_extra.get('interfaces')
        return interfaces or []

    def _save_device_interfaces(self, device: Device, interfaces: List[Any]):
        """Helper to safely save interfaces list"""
        if hasattr(device, 'interfaces'):
             setattr(device, 'interfaces', interfaces)
        
        if hasattr(device, 'model_extra') and isinstance(device.model_extra, dict):
            device.model_extra['interfaces'] = interfaces
            
        setattr(device, 'interfaces', interfaces)

    def _build_graph(self) -> nx.Graph:
        """
        构建网络图 (无向图)
        仅添加状态为 'up' 的设备和链路
        并且检查链路两端的接口状态是否为 'up'
        以及检查两端 VLAN 是否一致
        """
        G = nx.Graph()
        
        # 添加节点 (设备)
        for device in self.topology.devices:
            if device.status == 'up':
                G.add_node(device.id, **device.dict())

        # 添加边 (链路)
        for link in self.topology.links:
            # 1. 检查两端设备是否都在图中 (即都为 up)
            if link.src_device not in G or link.dst_device not in G:
                continue

            # 2. 检查链路本身状态
            if str(link.status).lower() not in ('up', 'active'):
                continue

            # 3. 检查两端接口状态
            src_port = getattr(link, 'src_interface', None) or link.dict().get('src_interface')
            dst_port = getattr(link, 'dst_interface', None) or link.dict().get('dst_interface')

            src_iface_up = self._is_interface_up(link.src_device, src_port)
            dst_iface_up = self._is_interface_up(link.dst_device, dst_port)

            if not (src_iface_up and dst_iface_up):
                continue

            # 4. 检查 VLAN 一致性
            src_vlan_info = self._get_interface_vlan_info(link.src_device, src_port)
            dst_vlan_info = self._get_interface_vlan_info(link.dst_device, dst_port)
            
            is_connected = False
            
            src_mode = src_vlan_info.get('mode', 'access')
            dst_mode = dst_vlan_info.get('mode', 'access')
            
            src_vlan = src_vlan_info.get('vlan', 1)
            dst_vlan = dst_vlan_info.get('vlan', 1)

            # 优化逻辑：如果任意一端是 Trunk，默认允许通过（除非未来做更细的 allowed vlan 检查）
            if src_mode == 'trunk' or dst_mode == 'trunk':
                is_connected = True
            else:
                # 都是 Access，必须 VLAN ID 一致
                if str(src_vlan) == str(dst_vlan):
                    is_connected = True
            
            if is_connected:
                # 权重默认为1，可根据带宽调整
                weight = 1
                if link.bandwidth:
                    if '10G' in link.bandwidth: weight = 1
                    elif '1G' in link.bandwidth: weight = 10
                    elif '100M' in link.bandwidth: weight = 100
                
                G.add_edge(link.src_device, link.dst_device, weight=weight, **link.dict())
        
        return G

    def _get_interface_vlan_info(self, device_id: str, port_name: str) -> Dict[str, Any]:
        """获取接口的 VLAN 详细信息"""
        if not port_name:
            return {'vlan': 1, 'mode': 'access'}
            
        device = self.device_map.get(device_id)
        if not device:
            return {'vlan': 1, 'mode': 'access'}
            
        interfaces = self._get_device_interfaces(device)
        
        for iface in interfaces:
            if isinstance(iface, dict):
                name = iface.get('name')
                vlan = iface.get('vlan', 1)
                mode = iface.get('mode', 'access')
            else:
                name = getattr(iface, 'name', None)
                vlan = getattr(iface, 'vlan', 1)
                mode = getattr(iface, 'mode', 'access')
                
            if name == port_name:
                return {'vlan': vlan, 'mode': mode}
        
        return {'vlan': 1, 'mode': 'access'}

    def _is_interface_up(self, device_id: str, port_name: str) -> bool:
        """检查接口状态"""
        if not port_name: return True
        device = self.device_map.get(device_id)
        if not device: return False
        
        interfaces = self._get_device_interfaces(device)
        for iface in interfaces:
            name = iface.get('name') if isinstance(iface, dict) else getattr(iface, 'name', None)
            status = iface.get('status', 'up') if isinstance(iface, dict) else getattr(iface, 'status', 'up')
            
            if name == port_name:
                return str(status).lower() == 'up'
        return True

    def _build_ip_map(self) -> Dict[str, str]:
        """构建 IP -> DeviceID 映射"""
        ip_map = {}
        for device in self.topology.devices:
            if device.mgmt_ip:
                ip = device.mgmt_ip.split('/')[0]
                ip_map[ip] = device.id
            
            interfaces = self._get_device_interfaces(device)
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
        """模拟 Ping"""
        dst_device_id = self.get_device_by_ip(target_ip)
        
        if not dst_device_id:
            return {"success": False, "message": f"Target IP {target_ip} not reachable", "rtt": None}
        if src_device_id not in self.graph:
            return {"success": False, "message": f"Source device {src_device_id} is down", "rtt": None}
        if dst_device_id not in self.graph:
             return {"success": False, "message": f"Target device {dst_device_id} is down", "rtt": None}

        try:
            path = nx.shortest_path(self.graph, source=src_device_id, target=dst_device_id)
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
            return {"success": False, "message": "Request timed out (No path to host)", "rtt": None}

    def traceroute(self, src_device_id: str, target_ip: str) -> Dict[str, Any]:
        """模拟 Traceroute"""
        dst_device_id = self.get_device_by_ip(target_ip)
        if not dst_device_id: return {"success": False, "hops": [], "message": f"Target IP {target_ip} unknown"}
        if src_device_id not in self.graph or dst_device_id not in self.graph:
             return {"success": False, "hops": [], "message": "Source or Target device is down"}

        try:
            path = nx.dijkstra_path(self.graph, source=src_device_id, target=dst_device_id)
            hops_data = []
            for i, node_id in enumerate(path):
                device = self.device_map.get(node_id)
                rtt = (i + 1) * 1.5
                hops_data.append({
                    "hop": i + 1,
                    "device_id": node_id,
                    "device_name": device.name if device else node_id,
                    "ip": device.mgmt_ip if device else "unknown",
                    "rtt": f"{rtt:.2f} ms"
                })
            return {"success": True, "hops": hops_data, "path": path}
        except nx.NetworkXNoPath:
            return {"success": False, "hops": [], "message": "Destination unreachable"}

    def update_device_status(self, device_id: str, status: str) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                d.status = status
                break
        return self.topology

    def update_link_status(self, link_id: str, status: str) -> TopologyData:
        for l in self.topology.links:
            if l.id == link_id:
                l.status = status
                break
        return self.topology
        
    def find_and_update_link(self, src_id: str, dst_id: str, status: str) -> TopologyData:
        for l in self.topology.links:
            if (l.src_device == src_id and l.dst_device == dst_id) or \
               (l.src_device == dst_id and l.dst_device == src_id):
                l.status = status
        return self.topology

    def update_interface_status(self, device_id: str, iface_name: str, status: str) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                interfaces = self._get_device_interfaces(d)
                for iface in interfaces:
                    name = iface.get('name') if isinstance(iface, dict) else getattr(iface, 'name', '')
                    if name == iface_name:
                        if isinstance(iface, dict): iface['status'] = status
                        else: iface.status = status
                        break
                self._save_device_interfaces(d, interfaces)
                break
        return self.topology

    def assign_vlan(self, device_id: str, port: str, vlan_id: int) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                # 1. Update Interface
                interfaces = self._get_device_interfaces(d)
                port_found = False
                for iface in interfaces:
                    name = iface.get('name') if isinstance(iface, dict) else getattr(iface, 'name', '')
                    if name == port:
                        port_found = True
                        if isinstance(iface, dict):
                            iface['vlan'] = vlan_id
                            iface['mode'] = 'access' # Force Access when assigning specific ID
                        else:
                            iface.vlan = vlan_id
                            iface.mode = 'access'
                self._save_device_interfaces(d, interfaces)
                
                # 2. Update Device Global VLANs
                current_vlans = getattr(d, 'vlans', None)
                if current_vlans is None and hasattr(d, 'model_extra') and d.model_extra:
                    current_vlans = d.model_extra.get('vlans')
                if not isinstance(current_vlans, list): current_vlans = []

                if not any(v.get('vlan_id') == vlan_id for v in current_vlans if isinstance(v, dict)):
                     current_vlans.append({'vlan_id': vlan_id, 'name': f'VLAN{vlan_id}'})
                     
                setattr(d, 'vlans', current_vlans)
                if hasattr(d, 'model_extra') and isinstance(d.model_extra, dict):
                    d.model_extra['vlans'] = current_vlans
                break
        return self.topology

    def remove_vlan(self, device_id: str, port: str) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                interfaces = self._get_device_interfaces(d)
                for iface in interfaces:
                    name = iface.get('name') if isinstance(iface, dict) else getattr(iface, 'name', '')
                    if name == port:
                        if isinstance(iface, dict):
                            iface.pop('vlan', None)
                            iface['mode'] = 'access' # Revert to default access (vlan 1 implied)
                        else:
                            if hasattr(iface, 'vlan'): delattr(iface, 'vlan')
                            if hasattr(iface, 'mode'): iface.mode = 'access'
                self._save_device_interfaces(d, interfaces)
                break
        return self.topology

    def update_ospf_config(self, device_id: str, area: int, router_id: Optional[str] = None) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                config = d.configuration or {}
                ospf = config.get('ospf', {})
                if not isinstance(ospf, dict): ospf = {}
                
                ospf['area'] = area
                if router_id:
                    ospf['routerId'] = router_id
                elif 'routerId' not in ospf:
                     rid = d.mgmt_ip.split('/')[0] if d.mgmt_ip else "1.1.1.1"
                     ospf['routerId'] = rid

                config['ospf'] = ospf
                d.configuration = config
                
                self.reset_ospf(device_id)
                break
        return self.topology

    def reset_ospf(self, device_id: str) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                config = d.configuration or {}
                ospf = config.get('ospf', {})
                if not isinstance(ospf, dict): ospf = {}
                
                ospf['last_reset_time'] = time.time()
                config['ospf'] = ospf
                d.configuration = config
                break
        return self.topology

    def get_ospf_neighbors(self, device_id: str) -> List[Dict[str, Any]]:
        neighbors = []
        src_dev = self.device_map.get(device_id)
        if not src_dev: return []

        def get_ospf_data(d):
            if d.configuration and isinstance(d.configuration.get('ospf'), dict):
                return d.configuration['ospf']
            if hasattr(d, 'model_extra') and d.model_extra:
                if isinstance(d.model_extra.get('configuration'), dict):
                     return d.model_extra['configuration'].get('ospf', {})
                return d.model_extra.get('ospf', {})
            return {}

        src_ospf = get_ospf_data(src_dev)
        if not src_ospf: return []
            
        last_reset = src_ospf.get('last_reset_time', 0)
        time_since_reset = time.time() - last_reset
        
        if time_since_reset < 2: return []
            
        if device_id in self.graph:
            for neighbor_id in self.graph.neighbors(device_id):
                dst_dev = self.device_map.get(neighbor_id)
                if not dst_dev: continue
                
                dst_ospf = get_ospf_data(dst_dev)
                if not dst_ospf: continue
                
                src_area = int(src_ospf.get('area', 0))
                dst_area = int(dst_ospf.get('area', 0))

                state = "Full"
                details = "Adjacency established"
                
                if src_area != dst_area:
                     state = "Init (Area Mismatch)"
                     details = f"Local Area {src_area} != Remote Area {dst_area}"
                else:
                    if time_since_reset < 5: state = "Init"
                    elif time_since_reset < 8: state = "2-Way"
                    elif time_since_reset < 12: state = "ExStart"
                    elif time_since_reset < 15: state = "Exchange"
                    elif time_since_reset < 18: state = "Loading"
                    else: state = "Full"

                neighbors.append({
                    "neighbor_id": neighbor_id,
                    "router_id": dst_ospf.get('routerId', '0.0.0.0'),
                    "address": dst_dev.mgmt_ip,
                    "interface": "Unknown",
                    "state": state,
                    "area": str(dst_area),
                    "details": details
                })
        return neighbors
