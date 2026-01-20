from fastapi import APIRouter, HTTPException, Body, Depends
from typing import Any, List, Optional
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.models.db_models import TopologySnapshot, OperationLog
from app.models.topology import TopologyData
from app.models.api_schemas import OSPFConfigBody, OSPFResetBody, OSPFNeighborsBody
from app.services.simulation_service import SimulationService

router = APIRouter()

def get_simulation_service(db: Session = Depends(get_db)):
    latest_snapshot = db.query(TopologySnapshot).order_by(TopologySnapshot.created_at.desc()).first()
    
    if not latest_snapshot:
        raise HTTPException(status_code=404, detail="No topology snapshot found. Please upload a config first.")
    
    try:
        topology_data = TopologyData(**latest_snapshot.data)
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Failed to parse snapshot data: {str(e)}")
         
    return SimulationService(topology_data)

def _dump(obj, by_alias: bool = False):
    if obj is None:
        return None
    if hasattr(obj, "model_dump"):
        return obj.model_dump(by_alias=by_alias)
    return obj.dict()

def save_new_state(db: Session, topology_data: TopologyData, description: str, op_type: str, target: Optional[str] = None):
    snapshot = TopologySnapshot(
        name=f"Auto-Save: {op_type}",
        description=description,
        data=_dump(topology_data),
        created_at=datetime.now()
    )
    db.add(snapshot)
    
    log = OperationLog(
        operation_type=op_type,
        target_id=target,
        details=description,
        status="success"
    )
    db.add(log)
    
    db.commit()
    return snapshot

# --- 1. 网络诊断 (Ping/Traceroute) ---
@router.post("/ping")
async def simulate_ping(
    source_id: str = Body(...),
    target_ip: str = Body(...),
    service: SimulationService = Depends(get_simulation_service)
):
    return service.ping(source_id, target_ip)

@router.post("/traceroute")
async def simulate_traceroute(
    source_id: str = Body(...),
    target_ip: str = Body(...),
    service: SimulationService = Depends(get_simulation_service)
):
    return service.traceroute(source_id, target_ip)

# --- 2. 设备状态管理 ---
@router.post("/device/status")
async def update_device_status(
    device_id: str = Body(...),
    status: str = Body(...), # 'up' or 'down'
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db)
):
    updated_topology = service.update_device_status(device_id, status)
    save_new_state(db, updated_topology, f"Set device {device_id} status to {status}", "DeviceStatus", device_id)
    
    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"Device {device_id} is now {status}", "data": device}

# --- 3. 链路管理 ---
@router.post("/link/status")
async def update_link_status(
    link_id: Optional[str] = Body(None),
    src_id: Optional[str] = Body(None),
    dst_id: Optional[str] = Body(None),
    status: str = Body(...), # 'up' or 'down'
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db)
):
    if link_id:
        updated_topology = service.update_link_status(link_id, status)
        target = link_id
        link = next((l for l in updated_topology.links if l.id == link_id), None)
    elif src_id and dst_id:
        updated_topology = service.find_and_update_link(src_id, dst_id, status)
        target = f"{src_id}<->{dst_id}"
        link = next((l for l in updated_topology.links if (l.src_device == src_id and l.dst_device == dst_id) or (l.src_device == dst_id and l.dst_device == src_id)), None)
    else:
        raise HTTPException(status_code=400, detail="Provide link_id OR (src_id and dst_id)")
        
    save_new_state(db, updated_topology, f"Set link {target} status to {status}", "LinkStatus", target)
    
    link_data = None
    if link:
        link_data = link.dict()

    return {"success": True, "status": "success", "message": f"Link {target} is now {status}", "data": link_data}

# --- 4. 接口状态管理 ---
@router.post("/interface/status")
async def update_interface_status(
    device_id: str = Body(...),
    iface_name: str = Body(...),
    status: str = Body(...), # 'up' or 'down'
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db)
):
    updated_topology = service.update_interface_status(device_id, iface_name, status)
    save_new_state(db, updated_topology, f"Set {device_id} interface {iface_name} to {status}", "InterfaceStatus", f"{device_id}:{iface_name}")
    
    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"Interface {iface_name} on {device_id} is now {status}", "data": device}

# --- 5. VLAN 管理 ---
@router.post("/vlan/assign")
async def assign_vlan(
    device_id: str = Body(...),
    port: str = Body(...),
    vlan_id: int = Body(...),
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db)
):
    try:
        updated_topology = service.assign_vlan(device_id, port, vlan_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_new_state(db, updated_topology, f"Assigned VLAN {vlan_id} to {device_id} port {port}", "VLAN_Assign", f"{device_id}:{port}")
    
    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"VLAN {vlan_id} assigned to {device_id} port {port}", "data": _dump(device, by_alias=True)}

@router.post("/vlan/remove")
async def remove_vlan(
    device_id: str = Body(...),
    port: str = Body(...),
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db)
):
    try:
        updated_topology = service.remove_vlan(device_id, port)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_new_state(db, updated_topology, f"Removed VLAN from {device_id} port {port}", "VLAN_Remove", f"{device_id}:{port}")
    
    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"VLAN removed from {device_id} port {port}", "data": _dump(device, by_alias=True)}

@router.post("/vlan/configure")
async def configure_vlan(
    device_id: str = Body(...),
    port: str = Body(...),
    mode: str = Body(...),
    vlan_id: Optional[int] = Body(None),
    allowed_vlans: Optional[List[int]] = Body(None),
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db)
):
    try:
        updated_topology = service.configure_vlan(device_id, port, mode, vlan_id, allowed_vlans)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_new_state(db, updated_topology, f"Configured VLAN on {device_id} port {port}: mode={mode}", "VLAN_Configure", f"{device_id}:{port}")
    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"VLAN configured on {device_id} port {port}", "data": _dump(device, by_alias=True)}



# --- 6. OSPF 操作 ---
@router.post("/ospf/config")
async def update_ospf_config(
    body: OSPFConfigBody,
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db)
):
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
    return {"success": True, "status": "success", "message": f"OSPF config updated for {device_id}", "data": _dump(device, by_alias=True)}

@router.post("/ospf/reset")
async def reset_ospf_process(
    body: OSPFResetBody,
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db)
):
    device_id = body.device_id
    
    updated_topology = service.reset_ospf(device_id)
    save_new_state(db, updated_topology, f"Reset OSPF process on {device_id}", "OSPF_Reset", device_id)
    
    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"OSPF process reset for {device_id}", "data": _dump(device, by_alias=True)}

@router.post("/ospf/neighbors")
async def get_ospf_neighbors(
    body: OSPFNeighborsBody,
    service: SimulationService = Depends(get_simulation_service)
):
    neighbors = service.get_ospf_neighbors(body.device_id)
    return {"success": True, "status": "success", "data": neighbors}

# --- 7. DDoS 模拟 ---
@router.post("/ddos/simulate")
async def simulate_ddos(
    target_id: str = Body(...),
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db)
):
    updated_topology = service.simulate_ddos(target_id)
    save_new_state(db, updated_topology, f"Simulated DDoS attack on {target_id}", "DDoS_Simulation", target_id)
    return {"success": True, "status": "success", "message": f"DDoS simulation started on {target_id}"}
