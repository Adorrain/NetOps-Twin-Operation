"""网络运维与真实接口路由"""

from flask import Blueprint, request, jsonify, abort
from pydantic import ValidationError

from app.service.database import get_db
from app.model.api_schemas import (
    DeviceStatusBody,
    InterfaceStatusBody,
    LinkStatusBody,
    OSPFConfigBody,
    OSPFNeighborsBody,
    PingBody,
    TracerouteBody,
    VlanAssignBody,
    VlanConfigureBody,
    VlanRemoveBody,
)
from app.dao.snapshot_dao import create_snapshot
from app.utils.serialization import dump_model
from app.service.service_session import get_simulation_service

bp = Blueprint("ops", __name__)


"""
获取 JSON 请求体
"""
def get_json():
    return request.get_json() or {}

def parse_body(model_cls):
    try:
        return model_cls(**get_json())
    except ValidationError as e:
        abort(400, description=str(e))

"""
构造成功响应体
"""
def success(message=None, data=None):
    return jsonify({
        "success": True,
        "status": "success",
        "message": message,
        "data": data
    })

"""
关于状态变更的操作
"""
def persist(db, topology, desc, op_type, target, device_id=None):
    snapshot = create_snapshot(db, topology, desc, op_type, target)

    if device_id:
        device = next((d for d in topology.devices if d.id == device_id), None)
        if device:
            return snapshot, dump_model(device, by_alias=True)
    return snapshot, None

"""
关于连通性测试的操作
"""
@bp.route("/ping", methods=["POST"])
def simulate_ping():
    service = get_simulation_service()
    body = parse_body(PingBody)
    
    result = service.ping(body.source_id, body.target_id)

    return jsonify(result)

"""
关于路由跟踪的操作
"""
@bp.route("/traceroute", methods=["POST"])
def simulate_traceroute():
    service = get_simulation_service()
    body = parse_body(TracerouteBody)
    
    result = service.traceroute(body.source_id, body.target_id)

    return jsonify(result)

"""
关于设备状态的操作
"""
@bp.route("/device/status", methods=["POST"])
def update_device_status():
    service = get_simulation_service()
    db = get_db()
    body = parse_body(DeviceStatusBody)

    device_id = body.device_id
    status = body.status

    updated = service.update_device_status(device_id, status)

    snapshot, device_data = persist(
        db,
        updated,
        f"Set device {device_id} status to {status}",
        "DeviceStatus",
        device_id,
        device_id,
    )

    return success(f"Device {device_id} is now {status}", device_data)

"""
关于链路状态的操作
"""
@bp.route("/link/status", methods=["POST"])
def update_link_status():
    service = get_simulation_service()
    db = get_db()
    body = parse_body(LinkStatusBody)

    link_id = body.link_id
    src_id = body.src_id
    dst_id = body.dst_id
    status = body.status

    if link_id:
        updated = service.update_link_status(link_id, status)
        target = link_id
    elif src_id and dst_id:
        updated = service.find_and_update_link(src_id, dst_id, status)
        target = f"{src_id}<->{dst_id}"
    else:
        abort(400, description="Provide link_id OR (src_id and dst_id)")

    snapshot, _ = persist(db, updated, f"Set link {target} status to {status}", "LinkStatus", target)

    return success(f"Link {target} is now {status}")

"""
关于接口状态的操作
"""
@bp.route("/interface/status", methods=["POST"])
def update_interface_status():
    service = get_simulation_service()
    db = get_db()
    body = parse_body(InterfaceStatusBody)

    device_id = body.device_id
    iface = body.iface_name
    status = body.status

    updated = service.update_interface_status(device_id, iface, status)

    snapshot, device_data = persist(
        db,
        updated,
        f"Set {device_id} interface {iface} to {status}",
        "InterfaceStatus",
        f"{device_id}:{iface}",
        device_id,
    )

    return success(f"Interface {iface} on {device_id} is now {status}", device_data)

"""
关于VLAN的操作，包括分配、移除和配置
"""
@bp.route("/vlan/assign", methods=["POST"])
def assign_vlan():
    service = get_simulation_service()
    db = get_db()
    body = parse_body(VlanAssignBody)

    device_id = body.device_id
    port = body.port
    vlan_id = body.vlan_id

    updated = service.assign_vlan(device_id, port, vlan_id)

    snapshot, device_data = persist(
        db,
        updated,
        f"Assigned VLAN {vlan_id} to {device_id}:{port}",
        "VLAN_Assign",
        f"{device_id}:{port}",
        device_id,
    )

    return success("VLAN assigned", device_data)


@bp.route("/vlan/remove", methods=["POST"])
def remove_vlan():
    service = get_simulation_service()
    db = get_db()
    body = parse_body(VlanRemoveBody)

    device_id = body.device_id
    port = body.port

    updated = service.remove_vlan(device_id, port)

    snapshot, device_data = persist(
        db,
        updated,
        f"Removed VLAN from {device_id}:{port}",
        "VLAN_Remove",
        f"{device_id}:{port}",
        device_id,
    )

    return success("VLAN removed", device_data)


@bp.route("/vlan/configure", methods=["POST"])
def configure_vlan():
    service = get_simulation_service()
    db = get_db()
    body = parse_body(VlanConfigureBody)

    device_id = body.device_id
    port = body.port

    updated = service.configure_vlan(
        device_id,
        port,
        body.mode,
        body.vlan_id,
        body.allowed_vlans,
    )

    snapshot, device_data = persist(
        db,
        updated,
        f"Configured VLAN on {device_id}:{port}",
        "VLAN_Configure",
        f"{device_id}:{port}",
        device_id,
    )

    return success("VLAN configured", device_data)

"""
关于OSPF配置的操作
"""
@bp.route("/ospf/config", methods=["POST"])
def update_ospf_config():
    service = get_simulation_service()
    db = get_db()
    body = parse_body(OSPFConfigBody)

    updated = service.update_ospf_config(body.device_id, body.area, body.router_id)

    snapshot, device_data = persist(
        db,
        updated,
        f"Updated OSPF config for {body.device_id}",
        "OSPF_Config",
        body.device_id,
        body.device_id,
    )

    return success("OSPF config updated", device_data)


@bp.route("/ospf/neighbors", methods=["POST"])
def get_ospf_neighbors():
    service = get_simulation_service()
    body = parse_body(OSPFNeighborsBody)
    neighbors = service.get_ospf_neighbors(body.device_id)
    return success(data=neighbors)
