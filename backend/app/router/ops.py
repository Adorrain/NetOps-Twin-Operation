"""网络运维与仿真接口路由。

包含连通性探测（ping/traceroute）、设备/链路/接口状态变更、VLAN 配置、
OSPF 配置与邻居查询，以及攻击场景模拟等操作。

作者: Adorrain
创建时间: 2026-01-30
"""

from flask import Blueprint, request, jsonify, abort
from typing import List, Optional

from app.config.database import get_db
from app.model.api_schemas import OSPFConfigBody, OSPFResetBody, OSPFNeighborsBody
from app.controller.simulation_service import SimulationService
from app.dao.snapshot_dao import save_new_state
from app.utils.serialization import dump_model
from app.config.dependencies import get_simulation_service

bp = Blueprint('ops', __name__)


@bp.route("/ping", methods=['POST'])
def simulate_ping():
    """模拟从指定设备到目标 IP 的 ping。

    Returns:
        仿真服务返回的 ping 结果结构。
    """
    service = get_simulation_service()
    data = request.get_json() or {}
    source_id = data.get('source_id')
    target_ip = data.get('target_ip')

    if not source_id or not target_ip:
        abort(400, description="Missing source_id or target_ip")

    return jsonify(service.ping(source_id, target_ip))


@bp.route("/traceroute", methods=['POST'])
def simulate_traceroute():
    """模拟从指定设备到目标 IP 的 traceroute。

    Returns:
        仿真服务返回的 traceroute 结果结构。
    """
    service = get_simulation_service()
    data = request.get_json() or {}
    source_id = data.get('source_id')
    target_ip = data.get('target_ip')

    if not source_id or not target_ip:
        abort(400, description="Missing source_id or target_ip")

    return jsonify(service.traceroute(source_id, target_ip))


@bp.route("/device/status", methods=['POST'])
def update_device_status():
    """更新设备运行状态并记录快照。

    Returns:
        标准响应结构，包含更新后的设备数据（若存在）。
    """
    service = get_simulation_service()
    db = get_db()
    data = request.get_json() or {}
    device_id = data.get('device_id')
    status = data.get('status')

    if not device_id or not status:
        abort(400, description="Missing device_id or status")

    updated_topology = service.update_device_status(device_id, status)
    save_new_state(db, updated_topology, f"Set device {device_id} status to {status}", "DeviceStatus", device_id)

    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return jsonify({"success": True, "status": "success", "message": f"Device {device_id} is now {status}", "data": dump_model(device)})


@bp.route("/link/status", methods=['POST'])
def update_link_status():
    """更新链路状态并记录快照。

    支持两种定位方式：通过 link_id，或通过 (src_id, dst_id) 查找链路。

    Returns:
        标准响应结构，包含更新后的链路数据（若存在）。

    Raises:
        400: 未提供有效的链路定位参数。
    """
    service = get_simulation_service()
    db = get_db()
    data = request.get_json() or {}
    
    link_id = data.get('link_id')
    src_id = data.get('src_id')
    dst_id = data.get('dst_id')
    status = data.get('status')

    if not status:
        abort(400, description="Missing status")

    if link_id:
        updated_topology = service.update_link_status(link_id, status)
        target = link_id
        link = next((l for l in updated_topology.links if l.id == link_id), None)
    elif src_id and dst_id:
        updated_topology = service.find_and_update_link(src_id, dst_id, status)
        target = f"{src_id}<->{dst_id}"
        link = next(
            (
                l
                for l in updated_topology.links
                if (l.src_device == src_id and l.dst_device == dst_id) or (l.src_device == dst_id and l.dst_device == src_id)
            ),
            None,
        )
    else:
        abort(400, description="Provide link_id OR (src_id and dst_id)")

    save_new_state(db, updated_topology, f"Set link {target} status to {status}", "LinkStatus", target)

    link_data = None
    if link:
        link_data = dump_model(link)

    return jsonify({"success": True, "status": "success", "message": f"Link {target} is now {status}", "data": link_data})


@bp.route("/interface/status", methods=['POST'])
def update_interface_status():
    """更新设备接口状态并记录快照。

    Returns:
        标准响应结构，包含更新后的设备数据（若存在）。
    """
    service = get_simulation_service()
    db = get_db()
    data = request.get_json() or {}
    device_id = data.get('device_id')
    iface_name = data.get('iface_name')
    status = data.get('status')

    if not device_id or not iface_name or not status:
        abort(400, description="Missing device_id, iface_name, or status")

    updated_topology = service.update_interface_status(device_id, iface_name, status)
    save_new_state(db, updated_topology, f"Set {device_id} interface {iface_name} to {status}", "InterfaceStatus", f"{device_id}:{iface_name}")

    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return jsonify({"success": True, "status": "success", "message": f"Interface {iface_name} on {device_id} is now {status}", "data": dump_model(device)})


@bp.route("/vlan/assign", methods=['POST'])
def assign_vlan():
    """为设备端口分配 VLAN 并记录快照。

    Returns:
        标准响应结构，包含更新后的设备数据（按别名序列化）。
    """
    service = get_simulation_service()
    db = get_db()
    data = request.get_json() or {}
    device_id = data.get('device_id')
    port = data.get('port')
    vlan_id = data.get('vlan_id')

    if not device_id or not port or vlan_id is None:
        abort(400, description="Missing device_id, port, or vlan_id")

    try:
        updated_topology = service.assign_vlan(device_id, port, int(vlan_id))
    except ValueError as e:
        abort(400, description=str(e))
    save_new_state(db, updated_topology, f"Assigned VLAN {vlan_id} to {device_id} port {port}", "VLAN_Assign", f"{device_id}:{port}")

    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return jsonify({"success": True, "status": "success", "message": f"VLAN {vlan_id} assigned to {device_id} port {port}", "data": dump_model(device, by_alias=True)})


@bp.route("/vlan/remove", methods=['POST'])
def remove_vlan():
    """移除设备端口 VLAN 配置并记录快照。

    Returns:
        标准响应结构，包含更新后的设备数据（按别名序列化）。
    """
    service = get_simulation_service()
    db = get_db()
    data = request.get_json() or {}
    device_id = data.get('device_id')
    port = data.get('port')

    if not device_id or not port:
        abort(400, description="Missing device_id or port")

    try:
        updated_topology = service.remove_vlan(device_id, port)
    except ValueError as e:
        abort(400, description=str(e))
    save_new_state(db, updated_topology, f"Removed VLAN from {device_id} port {port}", "VLAN_Remove", f"{device_id}:{port}")

    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return jsonify({"success": True, "status": "success", "message": f"VLAN removed from {device_id} port {port}", "data": dump_model(device, by_alias=True)})


@bp.route("/vlan/configure", methods=['POST'])
def configure_vlan():
    """配置设备端口 VLAN 模式并记录快照。

    Returns:
        标准响应结构，包含更新后的设备数据（按别名序列化）。
    """
    service = get_simulation_service()
    db = get_db()
    data = request.get_json() or {}
    device_id = data.get('device_id')
    port = data.get('port')
    mode = data.get('mode')
    vlan_id = data.get('vlan_id')
    allowed_vlans = data.get('allowed_vlans')

    if not device_id or not port or not mode:
        abort(400, description="Missing device_id, port, or mode")

    try:
        updated_topology = service.configure_vlan(device_id, port, mode, vlan_id, allowed_vlans)
    except ValueError as e:
        abort(400, description=str(e))
    save_new_state(db, updated_topology, f"Configured VLAN on {device_id} port {port}: mode={mode}", "VLAN_Configure", f"{device_id}:{port}")
    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return jsonify({"success": True, "status": "success", "message": f"VLAN configured on {device_id} port {port}", "data": dump_model(device, by_alias=True)})


@bp.route("/ospf/config", methods=['POST'])
def update_ospf_config():
    """更新设备 OSPF 配置并记录快照。

    Returns:
        标准响应结构，包含更新后的设备数据（按别名序列化）。
    """
    service = get_simulation_service()
    db = get_db()
    data = request.get_json() or {}
    
    try:
        body = OSPFConfigBody(**data)
    except Exception as e:
        abort(400, description=str(e))

    device_id = body.device_id
    area = body.area
    router_id = body.router_id

    updated_topology = service.update_ospf_config(device_id, area, router_id)
    msg = f"Updated OSPF Area to {area}"
    if router_id:
        msg += f", Router ID to {router_id}"
    msg += f" for {device_id}"

    save_new_state(db, updated_topology, msg, "OSPF_Config", device_id)

    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return jsonify({"success": True, "status": "success", "message": f"OSPF config updated for {device_id}", "data": dump_model(device, by_alias=True)})


@bp.route("/ospf/reset", methods=['POST'])
def reset_ospf_process():
    """重置设备 OSPF 进程并记录快照。

    Returns:
        标准响应结构，包含更新后的设备数据（按别名序列化）。
    """
    service = get_simulation_service()
    db = get_db()
    data = request.get_json() or {}

    try:
        body = OSPFResetBody(**data)
    except Exception as e:
        abort(400, description=str(e))

    device_id = body.device_id

    updated_topology = service.reset_ospf(device_id)
    save_new_state(db, updated_topology, f"Reset OSPF process on {device_id}", "OSPF_Reset", device_id)

    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return jsonify({"success": True, "status": "success", "message": f"OSPF process reset for {device_id}", "data": dump_model(device, by_alias=True)})


@bp.route("/ospf/neighbors", methods=['POST'])
def get_ospf_neighbors():
    """查询设备 OSPF 邻居信息。

    Returns:
        标准响应结构，data 字段为邻居列表/结构（由仿真服务定义）。
    """
    service = get_simulation_service()
    data = request.get_json() or {}
    
    try:
        body = OSPFNeighborsBody(**data)
    except Exception as e:
        abort(400, description=str(e))

    neighbors = service.get_ospf_neighbors(body.device_id)
    return jsonify({"success": True, "status": "success", "data": neighbors})


@bp.route("/ddos/simulate", methods=['POST'])
def simulate_ddos():
    """模拟对指定设备发起 DDoS 攻击并记录快照。

    Returns:
        标准响应结构，包含模拟启动结果信息。
    """
    service = get_simulation_service()
    db = get_db()
    data = request.get_json() or {}
    target_id = data.get('target_id')

    if not target_id:
        abort(400, description="Missing target_id")

    updated_topology = service.simulate_ddos(target_id)
    save_new_state(db, updated_topology, f"Simulated DDoS attack on {target_id}", "DDoS_Simulation", target_id)
    return jsonify({"success": True, "status": "success", "message": f"DDoS simulation started on {target_id}"})
