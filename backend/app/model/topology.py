"""拓扑业务模型

作者: Adorrain
创建时间: 2026-01-30
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Device(BaseModel):
    """设备业务模型"""
    id: str
    name: str
    role: str
    deviceType: str
    ip: Optional[str] = None
    netmask: Optional[str] = None
    status: str = "up"
    ospf: Optional[Dict[str, Any]] = None
    configuration: Dict[str, Any] = Field(default_factory=dict)
    interfaces: List[Dict[str, Any]] = Field(default_factory=list)
    vlan: Optional[int] = None


class Link(BaseModel):
    """链路业务模型"""
    id: str
    srcDevice: str
    dstDevice: str
    srcInterface: Optional[str] = None
    dstInterface: Optional[str] = None
    status: str = "up"
    bandwidth: Optional[str] = None
    ospfCost: Optional[int] = None


class TopologyData(BaseModel):
    """拓扑数据业务模型"""
    ospfReferenceBandwidth: Optional[str] = None
    devices: List[Device] = Field(default_factory=list)
    links: List[Link] = Field(default_factory=list)
