"""OSPF的API 请求/响应数据结构定义

使用 Pydantic 描述后端接口的请求体结构，并通过字段别名与前端字段风格保持兼容

作者: Adorrain
创建时间: 2026-01-30
"""

from typing import List, Optional

from pydantic import BaseModel


class PingBody(BaseModel):
    source_id: str
    target_ip: str


class TracerouteBody(BaseModel):
    source_id: str
    target_ip: str


class DeviceStatusBody(BaseModel):
    device_id: str
    status: str


class LinkStatusBody(BaseModel):
    status: str
    link_id: Optional[str] = None
    src_id: Optional[str] = None
    dst_id: Optional[str] = None


class InterfaceStatusBody(BaseModel):
    device_id: str
    iface_name: str
    status: str


class VlanAssignBody(BaseModel):
    device_id: str
    port: str
    vlan_id: int


class VlanRemoveBody(BaseModel):
    device_id: str
    port: str


class VlanConfigureBody(BaseModel):
    device_id: str
    port: str
    mode: str
    vlan_id: Optional[int] = None
    allowed_vlans: Optional[List[int]] = None


class OSPFConfigBody(BaseModel):
    device_id: str
    area: int
    router_id: Optional[str] = None


class OSPFNeighborsBody(BaseModel):
    device_id: str
