import yaml
import os
from typing import Dict, Any
import ipaddress
from app.models.topology import TopologyData

class TopologyValidationError(ValueError):
    pass

def _validate_topology_dict(data: Dict[str, Any]) -> None:
    if not isinstance(data, dict):
        raise TopologyValidationError("Topology YAML root must be a mapping")

    devices = data.get('devices', [])
    links = data.get('links', [])

    if not isinstance(devices, list):
        raise TopologyValidationError("'devices' must be a list")
    if not isinstance(links, list):
        raise TopologyValidationError("'links' must be a list")

    device_ids = set()
    link_ids = set()
    interfaces_by_device: Dict[str, set] = {}
    ip_owners: Dict[str, str] = {}

    for idx, d in enumerate(devices):
        if not isinstance(d, dict):
            raise TopologyValidationError(f"devices[{idx}] must be an object")
        dev_id = d.get('id')
        if not dev_id or not isinstance(dev_id, str):
            raise TopologyValidationError(f"devices[{idx}].id is required")
        if dev_id in device_ids:
            raise TopologyValidationError(f"Duplicate device id: {dev_id}")
        device_ids.add(dev_id)

        d_type = d.get('device_type') or d.get('deviceType')
        if not d_type:
            raise TopologyValidationError(f"devices[{idx}] missing device_type/deviceType")

        iface_names = set()
        raw_ifaces = d.get('interfaces', [])
        if raw_ifaces is None:
            raw_ifaces = []
        if not isinstance(raw_ifaces, list):
            raise TopologyValidationError(f"devices[{idx}].interfaces must be a list")
        for j, iface in enumerate(raw_ifaces):
            if not isinstance(iface, dict):
                continue
            name = iface.get('name')
            if name:
                if name in iface_names:
                    raise TopologyValidationError(f"Duplicate interface name on {dev_id}: {name}")
                iface_names.add(name)

            ip_val = iface.get('ip')
            if ip_val:
                try:
                    ip = str(ipaddress.ip_interface(str(ip_val)).ip)
                except Exception:
                    raise TopologyValidationError(f"Invalid interface ip on {dev_id}: {ip_val}")
                if ip in ip_owners:
                    raise TopologyValidationError(f"Duplicate IP {ip} on {dev_id} and {ip_owners[ip]}")
                ip_owners[ip] = f"{dev_id}:{name or f'iface[{j}]'}"

        interfaces_by_device[dev_id] = iface_names

        mgmt_ip = d.get('mgmt_ip') or d.get('mgmtIp') or d.get('ip_address') or d.get('ipAddress')
        if mgmt_ip:
            try:
                ip = str(ipaddress.ip_interface(str(mgmt_ip)).ip)
            except Exception:
                raise TopologyValidationError(f"Invalid mgmt_ip on {dev_id}: {mgmt_ip}")
            if ip in ip_owners:
                raise TopologyValidationError(f"Duplicate IP {ip} on {dev_id} and {ip_owners[ip]}")
            ip_owners[ip] = f"{dev_id}:mgmt_ip"

    for idx, l in enumerate(links):
        if not isinstance(l, dict):
            raise TopologyValidationError(f"links[{idx}] must be an object")
        link_id = l.get('id')
        if not link_id or not isinstance(link_id, str):
            raise TopologyValidationError(f"links[{idx}].id is required")
        if link_id in link_ids:
            raise TopologyValidationError(f"Duplicate link id: {link_id}")
        link_ids.add(link_id)

        src = l.get('src_device') or l.get('srcDevice')
        dst = l.get('dst_device') or l.get('dstDevice')
        if not src or not dst:
            raise TopologyValidationError(f"links[{idx}] missing src_device/dst_device")
        if src not in device_ids:
            raise TopologyValidationError(f"links[{idx}] references unknown src_device: {src}")
        if dst not in device_ids:
            raise TopologyValidationError(f"links[{idx}] references unknown dst_device: {dst}")

        src_if = l.get('src_interface') or l.get('srcInterface')
        dst_if = l.get('dst_interface') or l.get('dstInterface')
        if src_if and src_if not in interfaces_by_device.get(src, set()):
            raise TopologyValidationError(f"links[{idx}] unknown src_interface {src_if} on {src}")
        if dst_if and dst_if not in interfaces_by_device.get(dst, set()):
            raise TopologyValidationError(f"links[{idx}] unknown dst_interface {dst_if} on {dst}")

def load_topology_from_yaml(file_path: str) -> TopologyData:
    """
    Load topology data from a YAML file and convert it to the Pydantic model.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Config file not found: {file_path}")

    with open(file_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)

    if data is None:
        raise TopologyValidationError("Empty YAML file")

    _validate_topology_dict(data)

    # Transform data if necessary
    devices = data.get('devices', [])
    links = data.get('links', [])
    topology_meta = data.get('topology', {})

    # Create model
    # Note: Fields match exactly now (src_device, dst_device)
    
    topology_data = TopologyData(
        topology=topology_meta,
        devices=devices,
        links=links 
    )
    
    return topology_data
