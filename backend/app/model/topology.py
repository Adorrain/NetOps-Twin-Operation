"""拓扑业务模型定义。

定义设备、链路与拓扑元信息等数据结构，供 YAML 解析、仿真服务与 API 返回使用。

作者: Adorrain
创建时间: 2026-01-30
"""

from pydantic import BaseModel, Field, computed_field
from typing import List, Optional, Any, Dict


class Device(BaseModel):
    """网络设备/主机模型。"""
    id: str
    name: str
    role: str
    device_type: str = Field(..., alias="deviceType", description="Device type like router, switch, etc.")
    mgmt_ip: Optional[str] = Field(None, description="Management IP address")
    status: str = "up"
    configuration: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Device configuration including OSPF, etc.")
    interfaces: List[Dict[str, Any]] = Field(default_factory=list, description="Device interfaces")
    vlans: List[Dict[str, Any]] = Field(default_factory=list, description="Device VLANs")
    vlan: Optional[int] = Field(None, description="Single VLAN for end host devices")
    ip: Optional[str] = Field(None, description="End-host IP address")
    gateway: Optional[str] = Field(None, description="End-host gateway")

    class Config:
        populate_by_name = True
        extra = "allow"


class Link(BaseModel):
    """网络链路模型。"""
    id: str
    src_device: str
    dst_device: str
    src_interface: Optional[str] = None
    dst_interface: Optional[str] = None
    status: str = "up"
    bandwidth: Optional[str] = None

    @computed_field
    @property
    def src_device_id(self) -> str:
        """兼容字段：返回源设备 ID。"""
        return self.src_device

    @computed_field
    @property
    def dst_device_id(self) -> str:
        """兼容字段：返回目的设备 ID。"""
        return self.dst_device

    class Config:
        populate_by_name = True
        extra = "allow"


class TopologyMetadata(BaseModel):
    """拓扑元信息。"""
    name: str
    type: str


class TopologyData(BaseModel):
    """拓扑数据集合，包含元信息、设备列表与链路列表。"""
    topology: Optional[TopologyMetadata] = None
    devices: List[Device]
    links: List[Link]

    class Config:
        populate_by_name = True
