"""网络运维与真实接口路由"""

from flask import Blueprint, request, jsonify, abort
from pydantic import ValidationError

from app.service.database import get_db
from app.model.api_schemas import (
    DeviceStatusBody,
    InterfaceStatusBody,
    LinkStatusBody,
    OSPFCostUpdateBody,
    OSPFConfigBody,
    OSPFNeighborsBody,
    PingBody,
    TracerouteBody,
    VlanConfigureBody,
    VlanPortBody,
)
from app.dao.snapshot_dao import create_snapshot
from app.utils.serialization import dump_model
from app.service.service_session import get_simulation_service

app = Blueprint("ops", __name__)

# ==================== 通用工具 ====================

def get_json():
    return request.get_json() or {}


def parse_body(model_cls):
    try:
        return model_cls(**get_json())
    except ValidationError as e:
        abort(400, description=str(e))


def success(message=None, data=None):
    return jsonify({
        "success": True,
        "message": message,
        "data": data
    })


def persist(db, topology, desc, op_type, target, device_id=None):
    snapshot = create_snapshot(db, topology, desc, op_type, target)

    if device_id:
        device = next((d for d in topology.devices if d.id == device_id), None)
        if device:
            return snapshot, dump_model(device, by_alias=True)

    return snapshot, None


def get_ctx():
    """统一获取 service + db"""
    return get_simulation_service(), get_db()


def _find_link(topology, link_id):
    for link in topology.links:
        if link.id == link_id:
            return link
    return None


# ==================== 连通性 ====================

@app.route("/ping", methods=["POST"])
def simulate_ping():
    service, _ = get_ctx()
    body = parse_body(PingBody)
    return jsonify(service.ping(body.source_id, body.target_id))


@app.route("/traceroute", methods=["POST"])
def simulate_traceroute():
    service, _ = get_ctx()
    body = parse_body(TracerouteBody)
    return jsonify(service.traceroute(body.source_id, body.target_id))


# ==================== 设备 ====================

@app.route("/device/status", methods=["POST"])
def update_device_status():
    service, db = get_ctx()
    body = parse_body(DeviceStatusBody)

    updated = service.update_device_status(body.device_id, body.status)

    _, device_data = persist(
        db, updated,
        f"Set device {body.device_id} status to {body.status}",
        "DeviceStatus",
        body.device_id,
        body.device_id,
    )

    return success(f"Device {body.device_id} is now {body.status}", device_data)


# ==================== 链路 ====================

@app.route("/link/status", methods=["POST"])
def update_link_status():
    service, db = get_ctx()
    body = parse_body(LinkStatusBody)

    if body.link_id:
        updated = service.update_link_status(body.link_id, body.status)
        target = body.link_id
    elif body.src_id and body.dst_id:
        updated = service.find_and_update_link(body.src_id, body.dst_id, body.status)
        target = f"{body.src_id}<->{body.dst_id}"
    else:
        abort(400, description="Provide link_id OR (src_id and dst_id)")

    persist(db, updated,
            f"Set link {target} status to {body.status}",
            "LinkStatus",
            target)

    return success(f"Link {target} is now {body.status}")


# ==================== 接口 ====================

@app.route("/interface/status", methods=["POST"])
def update_interface_status():
    service, db = get_ctx()
    body = parse_body(InterfaceStatusBody)

    updated = service.update_interface_status(
        body.device_id, body.iface_name, body.status
    )

    _, device_data = persist(
        db, updated,
        f"Set {body.device_id} interface {body.iface_name} to {body.status}",
        "InterfaceStatus",
        f"{body.device_id}:{body.iface_name}",
        body.device_id,
    )

    return success(
        f"Interface {body.iface_name} on {body.device_id} is now {body.status}",
        device_data
    )


# ==================== VLAN ====================

@app.route("/vlan/remove", methods=["POST"])    
def remove_vlan():
    service, db = get_ctx()
    body = parse_body(VlanPortBody)

    updated = service.remove_vlan(body.device_id, body.port)

    _, device_data = persist(
        db, updated,
        f"Removed VLAN from {body.device_id}:{body.port}",
        "VLAN_Remove",
        f"{body.device_id}:{body.port}",
        body.device_id,
    )

    return success("VLAN removed", device_data)



@app.route("/vlan/configure", methods=["POST"])
def configure_vlan():
    service, db = get_ctx()
    body = parse_body(VlanConfigureBody)

    updated = service.configure_vlan(
        body.device_id,
        body.port,
        body.mode,
        body.vlan_id,
        body.allowed_vlans,
    )

    _, device_data = persist(
        db, updated,
        f"Configured VLAN on {body.device_id}:{body.port}",
        "VLAN_Configure",
        f"{body.device_id}:{body.port}",
        body.device_id,
    )

    return success("VLAN configured", device_data)


# ==================== OSPF ====================
@app.route("/ospf/config", methods=["POST"])
def update_ospf_config():
    service, db = get_ctx()
    body = parse_body(OSPFConfigBody)

    updated = service.update_ospf_config(
        body.device_id, body.area, body.router_id
    )

    _, device_data = persist(
        db, updated,
        f"Updated OSPF config for {body.device_id}",
        "OSPF_Config",
        body.device_id,
        body.device_id,
    )

    return success("OSPF config updated", device_data)


@app.route("/ospf/neighbors", methods=["POST"])
def get_ospf_neighbors():
    service, _ = get_ctx()
    body = parse_body(OSPFNeighborsBody)

    return success(data=service.get_ospf_neighbors(body.device_id))


@app.route("/ospf/cost/update", methods=["POST"])
def update_ospf_cost():
    service, db = get_ctx()
    body = parse_body(OSPFCostUpdateBody)
    link = _find_link(service.topology, body.link_id)
    if not link:
        abort(404, description=f"Link {body.link_id} not found in current topology")
    new_cost = int(max(1, body.new_cost))
    updated = service.update_ospf_link_cost(body.link_id, new_cost)
    persist(
        db,
        updated,
        f"Updated OSPF cost for link {body.link_id} to {new_cost}",
        "OSPF_Link_Cost",
        body.link_id,
    )
    return success("cost updated", {"link_id": body.link_id, "new_cost": new_cost})
