import networkx as nx
import random
import time
from typing import List, Dict, Any, Optional
from app.models.topology import TopologyData, Device, Link

class SimulationService:
    def __init__(self, topology_data: TopologyData):
        self.topology = topology_data
        self._rebuild_runtime()

    def _extra(self, obj) -> Dict[str, Any]:
        extra = getattr(obj, 'model_extra', None)
        return extra if isinstance(extra, dict) else {}

    def _get_field(self, obj, key: str, default=None):
        try:
            value = getattr(obj, key, None)
        except Exception:
            value = None
        if value is None:
            value = self._extra(obj).get(key)
        return default if value is None else value

    def _set_field(self, obj, key: str, value):
        try:
            setattr(obj, key, value)
        except Exception:
            pass
        extra = self._extra(obj)
        if extra:
            extra[key] = value
            try:
                obj.model_extra = extra
            except Exception:
                pass

    def _rebuild_runtime(self):
        self.device_map = {d.id: d for d in self.topology.devices}
        self.graph = self._build_graph()
        self.ip_map = self._build_ip_map()

    def _get_device_interfaces(self, device: Device) -> List[Any]:
        interfaces = self._get_field(device, 'interfaces')
        return interfaces if isinstance(interfaces, list) else []

    def _save_device_interfaces(self, device: Device, interfaces: List[Any]):
        self._set_field(device, 'interfaces', interfaces)

    def _get_configuration(self, device: Device) -> Dict[str, Any]:
        cfg = self._get_field(device, 'configuration')
        return cfg if isinstance(cfg, dict) else {}

    def _set_configuration(self, device: Device, cfg: Dict[str, Any]):
        self._set_field(device, 'configuration', cfg)

    def _get_ospf(self, device: Device) -> Dict[str, Any]:
        cfg = self._get_configuration(device)
        ospf = cfg.get('ospf')
        if not isinstance(ospf, dict) or len(ospf) == 0:
            extra = self._extra(device)
            extra_cfg = extra.get('configuration')
            if isinstance(extra_cfg, dict) and isinstance(extra_cfg.get('ospf'), dict):
                ospf = extra_cfg.get('ospf')
            else:
                ospf = extra.get('ospf')
        if not isinstance(ospf, dict):
            ospf = {}
        if 'routerId' not in ospf and 'router_id' in ospf:
            ospf['routerId'] = ospf.get('router_id')
        if 'router_id' not in ospf and 'routerId' in ospf:
            ospf['router_id'] = ospf.get('routerId')
        return ospf

    def _sync_ospf(self, device: Device, ospf: Dict[str, Any]):
        cfg = self._get_configuration(device)
        cfg['ospf'] = ospf
        self._set_configuration(device, cfg)
        self._set_field(device, 'ospf', ospf)

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
            if str(getattr(device, 'status', 'up')).lower() not in ('down', 'offline'):
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
            src_allowed = src_vlan_info.get('allowed_vlans')
            dst_allowed = dst_vlan_info.get('allowed_vlans')

            if src_mode == 'trunk' and dst_mode == 'trunk':
                if isinstance(src_allowed, list) and isinstance(dst_allowed, list):
                    is_connected = len(set(map(int, src_allowed)).intersection(set(map(int, dst_allowed)))) > 0
                else:
                    is_connected = True
            elif src_mode == 'trunk' and dst_mode != 'trunk':
                if isinstance(src_allowed, list):
                    is_connected = int(dst_vlan) in set(map(int, src_allowed))
                else:
                    is_connected = True
            elif dst_mode == 'trunk' and src_mode != 'trunk':
                if isinstance(dst_allowed, list):
                    is_connected = int(src_vlan) in set(map(int, dst_allowed))
                else:
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
            return {'vlan': 1, 'mode': 'access', 'allowed_vlans': None}
            
        device = self.device_map.get(device_id)
        if not device:
            return {'vlan': 1, 'mode': 'access', 'allowed_vlans': None}
            
        interfaces = self._get_device_interfaces(device)
        
        for iface in interfaces:
            if isinstance(iface, dict):
                name = iface.get('name')
                vlan = iface.get('vlan', 1)
                mode = iface.get('mode', 'access')
                allowed_vlans = iface.get('allowed_vlans')
            else:
                name = getattr(iface, 'name', None)
                vlan = getattr(iface, 'vlan', 1)
                mode = getattr(iface, 'mode', 'access')
                allowed_vlans = getattr(iface, 'allowed_vlans', None)
                
            if name == port_name:
                return {'vlan': vlan, 'mode': mode, 'allowed_vlans': allowed_vlans}
        
        return {'vlan': 1, 'mode': 'access', 'allowed_vlans': None}

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
            src_vlan = self._get_endpoint_access_vlan(src_device_id)
            dst_vlan = self._get_endpoint_access_vlan(dst_device_id)
            if src_vlan is not None and dst_vlan is not None and int(src_vlan) != int(dst_vlan):
                if not self._path_has_l3_gateway(path):
                    return {"success": False, "message": f"VLAN {src_vlan} -> VLAN {dst_vlan} requires L3 gateway/routing", "rtt": None, "path": path}

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
            src_vlan = self._get_endpoint_access_vlan(src_device_id)
            dst_vlan = self._get_endpoint_access_vlan(dst_device_id)
            if src_vlan is not None and dst_vlan is not None and int(src_vlan) != int(dst_vlan):
                if not self._path_has_l3_gateway(path):
                    return {"success": False, "hops": [], "message": f"VLAN {src_vlan} -> VLAN {dst_vlan} requires L3 gateway/routing", "path": path}

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

    def _get_endpoint_access_vlan(self, device_id: str) -> Optional[int]:
        device = self.device_map.get(device_id)
        if not device:
            return None

        direct = getattr(device, 'vlan', None)
        if direct is None and hasattr(device, 'model_extra') and isinstance(device.model_extra, dict):
            direct = device.model_extra.get('vlan')
        if direct is not None:
            try:
                return int(direct)
            except Exception:
                return None

        interfaces = self._get_device_interfaces(device)
        for iface in interfaces:
            if isinstance(iface, dict):
                mode = str(iface.get('mode') or 'access').lower()
                if mode == 'trunk':
                    continue
                vlan = iface.get('vlan')
            else:
                mode = str(getattr(iface, 'mode', 'access') or 'access').lower()
                if mode == 'trunk':
                    continue
                vlan = getattr(iface, 'vlan', None)
            if vlan is None:
                continue
            try:
                return int(vlan)
            except Exception:
                continue
        return None

    def _path_has_l3_gateway(self, path: List[str]) -> bool:
        for node_id in path[1:-1]:
            dev = self.device_map.get(node_id)
            if not dev:
                continue
            dev_type = str(getattr(dev, 'device_type', '') or '').lower()
            if dev_type == 'router':
                return True

            ospf = self._get_ospf(dev)
            if len(ospf) > 0:
                last_reset = ospf.get('last_reset_time', 0) or 0
                try:
                    if time.time() - float(last_reset) < 2:
                        continue
                except Exception:
                    pass
                return True
        return False

    def update_device_status(self, device_id: str, status: str) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                d.status = status
                break
        self._rebuild_runtime()
        return self.topology

    def update_link_status(self, link_id: str, status: str) -> TopologyData:
        for l in self.topology.links:
            if l.id == link_id:
                l.status = status
                break
        self._rebuild_runtime()
        return self.topology
        
    def find_and_update_link(self, src_id: str, dst_id: str, status: str) -> TopologyData:
        for l in self.topology.links:
            if (l.src_device == src_id and l.dst_device == dst_id) or \
               (l.src_device == dst_id and l.dst_device == src_id):
                l.status = status
        self._rebuild_runtime()
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
        self._rebuild_runtime()
        return self.topology

    def assign_vlan(self, device_id: str, port: str, vlan_id: int) -> TopologyData:
        if vlan_id < 1 or vlan_id > 4094:
            raise ValueError("vlan_id must be between 1 and 4094")
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
                            iface.pop('allowed_vlans', None)
                        else:
                            iface.vlan = vlan_id
                            iface.mode = 'access'
                            if hasattr(iface, 'allowed_vlans'):
                                delattr(iface, 'allowed_vlans')
                self._save_device_interfaces(d, interfaces)
                if not port_found:
                    raise ValueError(f"Port {port} not found on device {device_id}")
                
                # 2. Update Device Global VLANs
                current_vlans = getattr(d, 'vlans', None)
                if current_vlans is None and hasattr(d, 'model_extra') and d.model_extra:
                    current_vlans = d.model_extra.get('vlans')
                if not isinstance(current_vlans, list):
                    current_vlans = []

                if not any(v.get('vlan_id') == vlan_id for v in current_vlans if isinstance(v, dict)):
                     current_vlans.append({'vlan_id': vlan_id, 'name': f'VLAN{vlan_id}'})
                     
                try:
                    d.vlans = current_vlans  # type: ignore[attr-defined]
                except Exception:
                    setattr(d, 'vlans', current_vlans)
                if hasattr(d, 'model_extra') and isinstance(d.model_extra, dict):
                    d.model_extra['vlans'] = current_vlans
                break
        self._rebuild_runtime()
        return self.topology

    def remove_vlan(self, device_id: str, port: str) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                interfaces = self._get_device_interfaces(d)
                port_found = False
                removed_vlan: Optional[int] = None
                for iface in interfaces:
                    name = iface.get('name') if isinstance(iface, dict) else getattr(iface, 'name', '')
                    if name == port:
                        port_found = True
                        if isinstance(iface, dict):
                            removed_vlan = iface.get('vlan')
                            iface.pop('vlan', None)
                            iface['mode'] = 'access' # Revert to default access (vlan 1 implied)
                            iface.pop('allowed_vlans', None)
                        else:
                            removed_vlan = getattr(iface, 'vlan', None)
                            if hasattr(iface, 'vlan'): delattr(iface, 'vlan')
                            if hasattr(iface, 'mode'): iface.mode = 'access'
                            if hasattr(iface, 'allowed_vlans'):
                                delattr(iface, 'allowed_vlans')
                self._save_device_interfaces(d, interfaces)
                if not port_found:
                    raise ValueError(f"Port {port} not found on device {device_id}")

                if removed_vlan is not None:
                    vlan_still_used = False
                    for iface in interfaces:
                        vlan = iface.get('vlan') if isinstance(iface, dict) else getattr(iface, 'vlan', None)
                        if vlan == removed_vlan:
                            vlan_still_used = True
                            break

                    if not vlan_still_used:
                        current_vlans = getattr(d, 'vlans', None)
                        if current_vlans is None and hasattr(d, 'model_extra') and d.model_extra:
                            current_vlans = d.model_extra.get('vlans')
                        if not isinstance(current_vlans, list):
                            current_vlans = []

                        current_vlans = [
                            v for v in current_vlans
                            if not (isinstance(v, dict) and v.get('vlan_id') == removed_vlan)
                        ]
                        try:
                            d.vlans = current_vlans  # type: ignore[attr-defined]
                        except Exception:
                            setattr(d, 'vlans', current_vlans)
                        if hasattr(d, 'model_extra') and isinstance(d.model_extra, dict):
                            d.model_extra['vlans'] = current_vlans
                break
        self._rebuild_runtime()
        return self.topology

    def configure_vlan(self, device_id: str, port: str, mode: str, vlan_id: Optional[int] = None, allowed_vlans: Optional[List[int]] = None) -> TopologyData:
        mode = str(mode or '').lower()
        if mode not in ('access', 'trunk'):
            raise ValueError("mode must be 'access' or 'trunk'")
        if mode == 'access':
            if vlan_id is None:
                raise ValueError("vlan_id is required for access mode")
            return self.assign_vlan(device_id, port, int(vlan_id))

        for d in self.topology.devices:
            if d.id == device_id:
                interfaces = self._get_device_interfaces(d)
                port_found = False
                for iface in interfaces:
                    name = iface.get('name') if isinstance(iface, dict) else getattr(iface, 'name', '')
                    if name != port:
                        continue
                    port_found = True
                    if isinstance(iface, dict):
                        iface['mode'] = 'trunk'
                        iface.pop('vlan', None)
                        if allowed_vlans is not None:
                            iface['allowed_vlans'] = [int(v) for v in allowed_vlans]
                    else:
                        iface.mode = 'trunk'
                        if hasattr(iface, 'vlan'):
                            delattr(iface, 'vlan')
                        if allowed_vlans is not None:
                            iface.allowed_vlans = [int(v) for v in allowed_vlans]
                self._save_device_interfaces(d, interfaces)
                if not port_found:
                    raise ValueError(f"Port {port} not found on device {device_id}")
                break
        self._rebuild_runtime()
        return self.topology

    def update_ospf_config(self, device_id: str, area: int, router_id: Optional[str] = None) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                config = self._get_configuration(d)
                ospf = config.get('ospf')
                if not isinstance(ospf, dict):
                    ospf = {}
                
                ospf['area'] = area
                if router_id:
                    ospf['routerId'] = router_id
                    ospf['router_id'] = router_id
                elif 'routerId' not in ospf and 'router_id' not in ospf:
                    rid = d.mgmt_ip.split('/')[0] if d.mgmt_ip else "1.1.1.1"
                    ospf['routerId'] = rid
                    ospf['router_id'] = rid
                elif 'routerId' not in ospf and 'router_id' in ospf:
                    ospf['routerId'] = ospf.get('router_id')
                elif 'router_id' not in ospf and 'routerId' in ospf:
                    ospf['router_id'] = ospf.get('routerId')

                self._sync_ospf(d, ospf)
                
                self.reset_ospf(device_id)
                break
        self._rebuild_runtime()
        return self.topology

    def reset_ospf(self, device_id: str) -> TopologyData:
        for d in self.topology.devices:
            if d.id == device_id:
                config = self._get_configuration(d)
                ospf = config.get('ospf')
                if not isinstance(ospf, dict):
                    ospf = {}
                
                ts = time.time()
                ospf['last_reset_time'] = ts
                self._sync_ospf(d, ospf)
                break
        self._rebuild_runtime()
        return self.topology

    def get_ospf_neighbors(self, device_id: str) -> List[Dict[str, Any]]:
        neighbors = []
        src_dev = self.device_map.get(device_id)
        if not src_dev: return []

        src_ospf = self._get_ospf(src_dev)
        if not src_ospf: return []
            
        last_reset = src_ospf.get('last_reset_time', 0)
        time_since_reset = time.time() - last_reset
        
        if time_since_reset < 2: return []

        def get_neighbor_interface(local_id: str, remote_id: str) -> str:
            for link in self.topology.links:
                if link.src_device == local_id and link.dst_device == remote_id:
                    return getattr(link, 'src_interface', None) or link.dict().get('src_interface') or "Unknown"
                if link.src_device == remote_id and link.dst_device == local_id:
                    return getattr(link, 'dst_interface', None) or link.dict().get('dst_interface') or "Unknown"
            return "Unknown"
            
        if device_id in self.graph:
            for neighbor_id in self.graph.neighbors(device_id):
                dst_dev = self.device_map.get(neighbor_id)
                if not dst_dev: continue
                
                dst_ospf = self._get_ospf(dst_dev)
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
                    "router_id": dst_ospf.get('routerId') or dst_ospf.get('router_id') or '0.0.0.0',
                    "address": dst_dev.mgmt_ip,
                    "interface": get_neighbor_interface(device_id, neighbor_id),
                    "state": state,
                    "area": str(dst_area),
                    "details": details
                })
        return neighbors
