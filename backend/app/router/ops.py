"""网络运维与仿真接口路由（简化版）"""

from flask import Blueprint, request, jsonify, abort

from app.config.database import get_db
from app.model.api_schemas import OSPFConfigBody, OSPFNeighborsBody
from app.dao.snapshot_dao import save_new_state
from app.utils.serialization import dump_model
from app.config.service_session import get_simulation_service

bp = Blueprint("ops", __name__)


"""
获取 JSON 请求体
"""
def get_json():
    return request.get_json() or {}

"""
校验请求体是否包含必要字段
"""
def require_fields(data, *fields):
    for f in fields:
        if data.get(f) in (None, ""):
            abort(400, description=f"{f}字段不能为空")

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
    save_new_state(db, topology, desc, op_type, target)

    if device_id:
        device = next((d for d in topology.devices if d.id == device_id), None)
        if device:
            return dump_model(device, by_alias=True)
    return None

"""
关于连通性测试的操作
"""
@bp.route("/ping", methods=["POST"])
def simulate_ping():
    service = get_simulation_service()
    data = get_json()
    require_fields(data, "source_id", "target_ip")
    return jsonify(service.ping(data["source_id"], data["target_ip"]))

"""
关于路由跟踪的操作
"""
@bp.route("/traceroute", methods=["POST"])
def simulate_traceroute():
    service = get_simulation_service()
    data = get_json()
    require_fields(data, "source_id", "target_ip")
    return jsonify(service.traceroute(data["source_id"], data["target_ip"]))

"""
关于设备状态的操作
"""
@bp.route("/device/status", methods=["POST"])
def update_device_status():
    service = get_simulation_service()
    db = get_db()
    data = get_json()
    require_fields(data, "device_id", "status")

    device_id = data["device_id"]
    status = data["status"]

    updated = service.update_device_status(device_id, status)

    device_data = persist(
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
    data = get_json()
    require_fields(data, "status")

    link_id = data.get("link_id")
    src_id = data.get("src_id")
    dst_id = data.get("dst_id")
    status = data["status"]

    if link_id:
        updated = service.update_link_status(link_id, status)
        target = link_id
    elif src_id and dst_id:
        updated = service.find_and_update_link(src_id, dst_id, status)
        target = f"{src_id}<->{dst_id}"
    else:
        abort(400, description="Provide link_id OR (src_id and dst_id)")

    persist(db, updated, f"Set link {target} status to {status}", "LinkStatus", target)

    return success(f"Link {target} is now {status}")

"""
关于接口状态的操作
"""
@bp.route("/interface/status", methods=["POST"])
def update_interface_status():
    service = get_simulation_service()
    db = get_db()
    data = get_json()
    require_fields(data, "device_id", "iface_name", "status")

    device_id = data["device_id"]
    iface = data["iface_name"]
    status = data["status"]

    updated = service.update_interface_status(device_id, iface, status)

    device_data = persist(
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
    data = get_json()
    require_fields(data, "device_id", "port", "vlan_id")

    device_id = data["device_id"]
    port = data["port"]
    vlan_id = int(data["vlan_id"])

    updated = service.assign_vlan(device_id, port, vlan_id)

    device_data = persist(
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
    data = get_json()
    require_fields(data, "device_id", "port")

    device_id = data["device_id"]
    port = data["port"]

    updated = service.remove_vlan(device_id, port)

    device_data = persist(
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
    data = get_json()
    require_fields(data, "device_id", "port", "mode")

    device_id = data["device_id"]
    port = data["port"]

    updated = service.configure_vlan(
        device_id,
        port,
        data["mode"],
        data.get("vlan_id"),
        data.get("allowed_vlans"),
    )

    device_data = persist(
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
    body = OSPFConfigBody(**get_json())

    updated = service.update_ospf_config(body.device_id, body.area, body.router_id)

    device_data = persist(
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
    body = OSPFNeighborsBody(**get_json())
    neighbors = service.get_ospf_neighbors(body.device_id)
    return success(data=neighbors)