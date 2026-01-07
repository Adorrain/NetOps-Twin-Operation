from fastapi import APIRouter, HTTPException, Body, Depends
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import json

from app.database import get_db
from app.models.db_models import TopologySnapshot, OperationLog
from app.models.topology import TopologyData
from app.services.simulation_service import SimulationService

router = APIRouter()

# --- 依赖注入：获取最新的仿真状态 ---
def get_simulation_service(db: Session = Depends(get_db)):
    """
    从数据库加载最新的拓扑快照，构建仿真服务
    """
    latest_snapshot = db.query(TopologySnapshot).order_by(TopologySnapshot.created_at.desc()).first()
    
    if not latest_snapshot:
        # Fallback: 如果没有快照，尝试加载默认配置 (这里简化处理，直接抛错提示上传)
        raise HTTPException(status_code=404, detail="No topology snapshot found. Please upload a config first.")
    
    # 将 JSON 数据转换为 Pydantic 模型
    try:
        topology_data = TopologyData(**latest_snapshot.data)
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Failed to parse snapshot data: {str(e)}")
         
    return SimulationService(topology_data)

# --- 辅助函数：保存新状态 ---
def save_new_state(db: Session, topology_data: TopologyData, description: str, op_type: str, target: str = None):
    # 1. 保存快照
    snapshot = TopologySnapshot(
        name=f"Auto-Save: {op_type}",
        description=description,
        data=topology_data.dict(),
        created_at=datetime.now()
    )
    db.add(snapshot)
    
    # 2. 记录操作日志
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
        link = next((l for l in updated_topology.links if (l.src_device_id == src_id and l.dst_device_id == dst_id) or (l.src_device_id == dst_id and l.dst_device_id == src_id)), None)
    else:
        raise HTTPException(status_code=400, detail="Provide link_id OR (src_id and dst_id)")
        
    save_new_state(db, updated_topology, f"Set link {target} status to {status}", "LinkStatus", target)
    return {"success": True, "status": "success", "message": f"Link {target} is now {status}", "data": link}

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
    updated_topology = service.assign_vlan(device_id, port, vlan_id)
    save_new_state(db, updated_topology, f"Assigned VLAN {vlan_id} to {device_id} port {port}", "VLAN_Assign", f"{device_id}:{port}")
    
    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"VLAN {vlan_id} assigned to {device_id} port {port}", "data": device}

# --- 6. OSPF 操作 ---
@router.post("/ospf/config")
async def update_ospf_config(
    device_id: str = Body(...),
    area: int = Body(...),
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db)
):
    updated_topology = service.update_ospf_config(device_id, area)
    save_new_state(db, updated_topology, f"Updated OSPF Area to {area} for {device_id}", "OSPF_Config", device_id)
    
    device = next((d for d in updated_topology.devices if d.id == device_id), None)
    return {"success": True, "status": "success", "message": f"OSPF config updated for {device_id}", "data": device}

@router.post("/ospf/reset")
async def reset_ospf_process(
    device_id: str = Body(..., embed=True), # Expect {"device_id": "..."}
    service: SimulationService = Depends(get_simulation_service),
    db: Session = Depends(get_db)
):
    # Notice: frontend sends {device_id} or just url param?
    # Frontend: fetch(`${API_BASE}/network/devices/${deviceId}/ospf/reset`, method: POST)
    # But I am changing frontend to call /ops/ospf/reset with body {device_id: ...}
    
    updated_topology = service.reset_ospf(device_id)
    save_new_state(db, updated_topology, f"Reset OSPF process on {device_id}", "OSPF_Reset", device_id)
    
    return {"success": True, "status": "success", "message": f"OSPF process reset for {device_id}"}

@router.post("/ospf/neighbors")
async def get_ospf_neighbors(
    device_id: str = Body(..., embed=True),
    service: SimulationService = Depends(get_simulation_service)
):
    neighbors = service.get_ospf_neighbors(device_id)
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
