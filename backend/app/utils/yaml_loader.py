"""YAML 拓扑配置加载与校验。

负责从 YAML 文件读取拓扑配置，并在构建业务模型前进行结构与字段合理性校验。

Author: Adorrain
Date: 2026-01-30
"""

import yaml
import os
from typing import Dict, Any
import ipaddress
from app.model.topology import TopologyData


class TopologyValidationError(ValueError):
    """拓扑配置校验失败时抛出的异常。"""
    pass


def _validate_topology_dict(data: Dict[str, Any]) -> None:
    """校验拓扑字典结构与关键字段。

    校验内容包含：devices/links 类型、设备/链路 ID 唯一性、接口名称唯一性、
    IP（含管理 IP 与接口 IP）唯一性，以及链路端点引用的设备与接口是否存在。

    Args:
        data: 从 YAML 解析得到的字典对象。

    Raises:
        TopologyValidationError: 任一校验规则不满足时抛出。
    """
    if not isinstance(data, dict):
        raise TopologyValidationError("Topology YAML root must be a mapping")

    devices = data.get("devices", [])
    links = data.get("links", [])

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
        dev_id = d.get("id")
        if not dev_id or not isinstance(dev_id, str):
            raise TopologyValidationError(f"devices[{idx}].id is required")
        if dev_id in device_ids:
            raise TopologyValidationError(f"Duplicate device id: {dev_id}")
        device_ids.add(dev_id)

        d_type = d.get("device_type") or d.get("deviceType")
        if not d_type:
            raise TopologyValidationError(f"devices[{idx}] missing device_type/deviceType")

        cfg = d.get("configuration")
        static_routes = None
        if isinstance(cfg, dict):
            static_routes = cfg.get("static_routes")
        if static_routes is None:
            static_routes = d.get("static_routes")
        if static_routes is not None:
            if not isinstance(static_routes, list):
                raise TopologyValidationError(f"devices[{idx}].static_routes must be a list")
            for k, r in enumerate(static_routes):
                if not isinstance(r, dict):
                    raise TopologyValidationError(f"devices[{idx}].static_routes[{k}] must be an object")
                prefix = r.get("prefix") or r.get("destination") or r.get("dst")
                next_hop = r.get("next_hop") or r.get("nextHop") or r.get("gateway")
                if not prefix or not next_hop:
                    raise TopologyValidationError(f"devices[{idx}].static_routes[{k}] requires prefix and next_hop")
                try:
                    ipaddress.ip_network(str(prefix), strict=False)
                except Exception:
                    raise TopologyValidationError(f"Invalid static route prefix on {dev_id}: {prefix}")

        host_vlan = d.get("vlan")
        if host_vlan is not None:
            try:
                host_vlan_int = int(host_vlan)
            except Exception:
                raise TopologyValidationError(f"Invalid devices[{idx}].vlan on {dev_id}: {host_vlan}")
            if host_vlan_int < 1 or host_vlan_int > 4094:
                raise TopologyValidationError(f"devices[{idx}].vlan out of range on {dev_id}: {host_vlan_int}")

        iface_names = set()
        raw_ifaces = d.get("interfaces", [])
        if raw_ifaces is None:
            raw_ifaces = []
        if not isinstance(raw_ifaces, list):
            raise TopologyValidationError(f"devices[{idx}].interfaces must be a list")
        for j, iface in enumerate(raw_ifaces):
            if not isinstance(iface, dict):
                continue
            name = iface.get("name")
            if name:
                if name in iface_names:
                    raise TopologyValidationError(f"Duplicate interface name on {dev_id}: {name}")
                iface_names.add(name)

            mode = str(iface.get("mode") or "access").lower()
            if mode not in ("access", "trunk"):
                raise TopologyValidationError(f"Invalid interface mode on {dev_id}:{name or f'iface[{j}]'}: {mode}")

            if mode == "access":
                if "allowed_vlans" in iface and iface.get("allowed_vlans") is not None:
                    raise TopologyValidationError(f"access interface must not set allowed_vlans on {dev_id}:{name or f'iface[{j}]'}")
                vlan_val = iface.get("vlan")
                if vlan_val is not None:
                    try:
                        vlan_int = int(vlan_val)
                    except Exception:
                        raise TopologyValidationError(f"Invalid access vlan on {dev_id}:{name or f'iface[{j}]'}: {vlan_val}")
                    if vlan_int < 1 or vlan_int > 4094:
                        raise TopologyValidationError(f"Access vlan out of range on {dev_id}:{name or f'iface[{j}]'}: {vlan_int}")
            else:
                if "vlan" in iface and iface.get("vlan") is not None:
                    raise TopologyValidationError(f"trunk interface must not set vlan on {dev_id}:{name or f'iface[{j}]'}")
                allowed = iface.get("allowed_vlans")
                if allowed is not None:
                    if not isinstance(allowed, list):
                        raise TopologyValidationError(f"allowed_vlans must be a list on {dev_id}:{name or f'iface[{j}]'}")
                    normalized = []
                    for v in allowed:
                        try:
                            vi = int(v)
                        except Exception:
                            raise TopologyValidationError(f"Invalid allowed_vlans value on {dev_id}:{name or f'iface[{j}]'}: {v}")
                        if vi < 1 or vi > 4094:
                            raise TopologyValidationError(f"allowed_vlans out of range on {dev_id}:{name or f'iface[{j}]'}: {vi}")
                        normalized.append(vi)
                    if len(set(normalized)) != len(normalized):
                        raise TopologyValidationError(f"Duplicate allowed_vlans on {dev_id}:{name or f'iface[{j}]'}")

            ip_val = iface.get("ip")
            if ip_val:
                try:
                    ip = str(ipaddress.ip_interface(str(ip_val)).ip)
                except Exception:
                    raise TopologyValidationError(f"Invalid interface ip on {dev_id}: {ip_val}")
                if ip in ip_owners:
                    raise TopologyValidationError(f"Duplicate IP {ip} on {dev_id} and {ip_owners[ip]}")
                ip_owners[ip] = f"{dev_id}:{name or f'iface[{j}]'}"

        interfaces_by_device[dev_id] = iface_names

        mgmt_ip = d.get("mgmt_ip") or d.get("mgmtIp") or d.get("ip_address") or d.get("ipAddress")
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
        link_id = l.get("id")
        if not link_id or not isinstance(link_id, str):
            raise TopologyValidationError(f"links[{idx}].id is required")
        if link_id in link_ids:
            raise TopologyValidationError(f"Duplicate link id: {link_id}")
        link_ids.add(link_id)

        src = l.get("src_device") or l.get("srcDevice")
        dst = l.get("dst_device") or l.get("dstDevice")
        if not src or not dst:
            raise TopologyValidationError(f"links[{idx}] missing src_device/dst_device")
        if src not in device_ids:
            raise TopologyValidationError(f"links[{idx}] references unknown src_device: {src}")
        if dst not in device_ids:
            raise TopologyValidationError(f"links[{idx}] references unknown dst_device: {dst}")

        src_if = l.get("src_interface") or l.get("srcInterface")
        dst_if = l.get("dst_interface") or l.get("dstInterface")
        if src_if and src_if not in interfaces_by_device.get(src, set()):
            raise TopologyValidationError(f"links[{idx}] unknown src_interface {src_if} on {src}")
        if dst_if and dst_if not in interfaces_by_device.get(dst, set()):
            raise TopologyValidationError(f"links[{idx}] unknown dst_interface {dst_if} on {dst}")


def load_topology_from_yaml(file_path: str) -> TopologyData:
    """从 YAML 文件加载拓扑并返回业务模型。

    Args:
        file_path: YAML 配置文件路径。

    Returns:
        解析得到的 TopologyData。

    Raises:
        FileNotFoundError: 文件不存在时抛出。
        TopologyValidationError: 文件为空或内容校验失败时抛出。
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Config file not found: {file_path}")

    with open(file_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if data is None:
        raise TopologyValidationError("Empty YAML file")

    _validate_topology_dict(data)

    devices = data.get("devices", [])
    links = data.get("links", [])
    topology_meta = data.get("topology", {})

    topology_data = TopologyData(topology=topology_meta, devices=devices, links=links)
    return topology_data
