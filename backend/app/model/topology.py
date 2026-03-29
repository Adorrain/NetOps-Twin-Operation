"""
拓扑业务模型

作者: Adorrain
创建时间: 2026-01-30
"""

from pydantic import BaseModel,Field
from typing import List, Optional, Dict, Any

"""
设备业务模型
"""
class Device(BaseModel):
    id: str
    name: str
    role: str
    device_type: str
    ip: Optional[str] = None
    netmask: Optional[str] = None
    status: str = "up"
    ospf: Optional[Dict[str, Any]] = None
    configuration: Dict[str, Any] = Field(default_factory=dict)
    interfaces: List[Dict[str, Any]] = Field(default_factory=list)
    vlan: Optional[int] = None

"""
链路业务模型
"""
class Link(BaseModel):
    id: str
    src_device: str
    dst_device: str

    src_interface: Optional[str] = None
    dst_interface: Optional[str] = None

    status: str = "up"
    bandwidth: Optional[str] = None

    ospf_cost: Optional[int] = None

"""
拓扑数据业务模型
"""
class TopologyData(BaseModel):
    devices: List[Device] = Field(default_factory=list)
    links: List[Link] = Field(default_factory=list)
    ospf_reference_bandwidth: str = Field(default="1G")
