"""网络运维与仿真接口路由。

包含连通性探测（ping/traceroute）、设备/链路/接口状态变更、VLAN 配置、
OSPF 配置与邻居查询，以及攻击场景模拟等操作。

作者: Adorrain
创建时间: 2026-01-30
"""

from fastapi import APIRouter, HTTPException, Body, Depends
from typing import List, Optional
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.model.api_schemas import OSPFConfigBody, OSPFResetBody, OSPFNeighborsBody
from app.controller.simulation_service import SimulationService
from app.dao.snapshot_dao import save_new_state
from app.utils.serialization import dump_model
from app.config.dependencies import get_simulation_service

router = APIRouter()


@router.post("/ping")
async def simulate_ping(
    source_id: str = Body(...),
    target_ip: str = Body(...),
    service: SimulationService = Depends(get_simulation_service),
):
    """模拟从指定设备到目标 IP 的 ping。

    Args:
        source_id: 源设备 ID。
        target_ip: 目标 IP 地址。
        service: 仿真服务依赖。

    Returns:
        仿真服务返回的 ping 结果结构。
    """
    return service.ping(source_id, target_ip)


@router.post("/traceroute")
async def simulate_traceroute(
    source_id: str = Body(...),
    target_ip: str = Body(...),
    service: SimulationService = Depends(get_simulation_service),
):
    """模拟从指定设备到目标 IP 的 traceroute。

    Args:
        source_id: 源设备 ID。
        target_ip: 目标 IP 地址。
        service: 仿真服务依赖。

    Returns:
        仿真服务返回的 traceroute 结果结构。
    """
    return service.traceroute(source_id, target_ip)


@router.post("/device/status")
async def update_device_status(
    device_id: str = Body(...),
    status: str = Body(...),
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db),
):
    """更新设备运行状态并记录快照。

    Args:
        device_id: 设备 ID。
        status: 设备状态（由前端约定，如 up/down）。
        service: 仿真服务依赖。
        db: 数据库会话依赖，用于记录拓扑快照。

    Returns:
        标准响应结构，包含更新后的设备数据（若存在）。
    """
    updated_topology = service.update_device_status(device_id, status)
    save_new_state(db, updated_topology, f"Set device {device_id} status to {status}", "DeviceStatus", device_id)

    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"Device {device_id} is now {status}", "data": device}


@router.post("/link/status")
async def update_link_status(
    link_id: Optional[str] = Body(None),
    src_id: Optional[str] = Body(None),
    dst_id: Optional[str] = Body(None),
    status: str = Body(...),
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db),
):
    """更新链路状态并记录快照。

    支持两种定位方式：通过 link_id，或通过 (src_id, dst_id) 查找链路。

    Args:
        link_id: 链路 ID（可选）。
        src_id: 源设备 ID（可选）。
        dst_id: 目的设备 ID（可选）。
        status: 链路状态（由前端约定）。
        service: 仿真服务依赖。
        db: 数据库会话依赖，用于记录拓扑快照。

    Returns:
        标准响应结构，包含更新后的链路数据（若存在）。

    Raises:
        HTTPException: 未提供有效的链路定位参数时抛出 400。
    """
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
        raise HTTPException(status_code=400, detail="Provide link_id OR (src_id and dst_id)")

    save_new_state(db, updated_topology, f"Set link {target} status to {status}", "LinkStatus", target)

    link_data = None
    if link:
        link_data = link.dict()

    return {"success": True, "status": "success", "message": f"Link {target} is now {status}", "data": link_data}


@router.post("/interface/status")
async def update_interface_status(
    device_id: str = Body(...),
    iface_name: str = Body(...),
    status: str = Body(...),
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db),
):
    """更新设备接口状态并记录快照。

    Args:
        device_id: 设备 ID。
        iface_name: 接口名称。
        status: 接口状态（由前端约定）。
        service: 仿真服务依赖。
        db: 数据库会话依赖，用于记录拓扑快照。

    Returns:
        标准响应结构，包含更新后的设备数据（若存在）。
    """
    updated_topology = service.update_interface_status(device_id, iface_name, status)
    save_new_state(db, updated_topology, f"Set {device_id} interface {iface_name} to {status}", "InterfaceStatus", f"{device_id}:{iface_name}")

    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"Interface {iface_name} on {device_id} is now {status}", "data": device}


@router.post("/vlan/assign")
async def assign_vlan(
    device_id: str = Body(...),
    port: str = Body(...),
    vlan_id: int = Body(...),
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db),
):
    """为设备端口分配 VLAN 并记录快照。

    Args:
        device_id: 设备 ID。
        port: 端口名称。
        vlan_id: VLAN ID。
        service: 仿真服务依赖。
        db: 数据库会话依赖，用于记录拓扑快照。

    Returns:
        标准响应结构，包含更新后的设备数据（按别名序列化）。

    Raises:
        HTTPException: 仿真服务校验失败时抛出 400。
    """
    try:
        updated_topology = service.assign_vlan(device_id, port, vlan_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_new_state(db, updated_topology, f"Assigned VLAN {vlan_id} to {device_id} port {port}", "VLAN_Assign", f"{device_id}:{port}")

    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"VLAN {vlan_id} assigned to {device_id} port {port}", "data": dump_model(device, by_alias=True)}


@router.post("/vlan/remove")
async def remove_vlan(
    device_id: str = Body(...),
    port: str = Body(...),
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db),
):
    """移除设备端口 VLAN 配置并记录快照。

    Args:
        device_id: 设备 ID。
        port: 端口名称。
        service: 仿真服务依赖。
        db: 数据库会话依赖，用于记录拓扑快照。

    Returns:
        标准响应结构，包含更新后的设备数据（按别名序列化）。

    Raises:
        HTTPException: 仿真服务校验失败时抛出 400。
    """
    try:
        updated_topology = service.remove_vlan(device_id, port)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_new_state(db, updated_topology, f"Removed VLAN from {device_id} port {port}", "VLAN_Remove", f"{device_id}:{port}")

    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"VLAN removed from {device_id} port {port}", "data": dump_model(device, by_alias=True)}


@router.post("/vlan/configure")
async def configure_vlan(
    device_id: str = Body(...),
    port: str = Body(...),
    mode: str = Body(...),
    vlan_id: Optional[int] = Body(None),
    allowed_vlans: Optional[List[int]] = Body(None),
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db),
):
    """配置设备端口 VLAN 模式并记录快照。

    Args:
        device_id: 设备 ID。
        port: 端口名称。
        mode: 端口模式（如 access/trunk）。
        vlan_id: access 模式下的 VLAN ID（可选）。
        allowed_vlans: trunk 模式下允许的 VLAN 列表（可选）。
        service: 仿真服务依赖。
        db: 数据库会话依赖，用于记录拓扑快照。

    Returns:
        标准响应结构，包含更新后的设备数据（按别名序列化）。

    Raises:
        HTTPException: 仿真服务校验失败时抛出 400。
    """
    try:
        updated_topology = service.configure_vlan(device_id, port, mode, vlan_id, allowed_vlans)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_new_state(db, updated_topology, f"Configured VLAN on {device_id} port {port}: mode={mode}", "VLAN_Configure", f"{device_id}:{port}")
    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"VLAN configured on {device_id} port {port}", "data": dump_model(device, by_alias=True)}


@router.post("/ospf/config")
async def update_ospf_config(
    body: OSPFConfigBody,
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db),
):
    """更新设备 OSPF 配置并记录快照。

    Args:
        body: OSPF 配置请求体。
        service: 仿真服务依赖。
        db: 数据库会话依赖，用于记录拓扑快照。

    Returns:
        标准响应结构，包含更新后的设备数据（按别名序列化）。
    """
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
    return {"success": True, "status": "success", "message": f"OSPF config updated for {device_id}", "data": dump_model(device, by_alias=True)}


@router.post("/ospf/reset")
async def reset_ospf_process(
    body: OSPFResetBody,
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db),
):
    """重置设备 OSPF 进程并记录快照。

    Args:
        body: OSPF 重置请求体。
        service: 仿真服务依赖。
        db: 数据库会话依赖，用于记录拓扑快照。

    Returns:
        标准响应结构，包含更新后的设备数据（按别名序列化）。
    """
    device_id = body.device_id

    updated_topology = service.reset_ospf(device_id)
    save_new_state(db, updated_topology, f"Reset OSPF process on {device_id}", "OSPF_Reset", device_id)

    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"OSPF process reset for {device_id}", "data": dump_model(device, by_alias=True)}


@router.post("/ospf/neighbors")
async def get_ospf_neighbors(
    body: OSPFNeighborsBody,
    service: SimulationService = Depends(get_simulation_service),
):
    """查询设备 OSPF 邻居信息。

    Args:
        body: OSPF 邻居查询请求体。
        service: 仿真服务依赖。

    Returns:
        标准响应结构，data 字段为邻居列表/结构（由仿真服务定义）。
    """
    neighbors = service.get_ospf_neighbors(body.device_id)
    return {"success": True, "status": "success", "data": neighbors}


@router.post("/ddos/simulate")
async def simulate_ddos(
    target_id: str = Body(...),
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db),
):
    """模拟对指定设备发起 DDoS 攻击并记录快照。

    Args:
        target_id: 目标设备 ID。
        service: 仿真服务依赖。
        db: 数据库会话依赖，用于记录拓扑快照。

    Returns:
        标准响应结构，包含模拟启动结果信息。
    """
    updated_topology = service.simulate_ddos(target_id)
    save_new_state(db, updated_topology, f"Simulated DDoS attack on {target_id}", "DDoS_Simulation", target_id)
    return {"success": True, "status": "success", "message": f"DDoS simulation started on {target_id}"}
