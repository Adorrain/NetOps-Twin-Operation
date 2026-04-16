"""API 请求体

作者: Adorrain
创建时间: 2026-01-30
"""

from typing import List, Optional

from pydantic import BaseModel


class PingBody(BaseModel):
    sourceId: str
    targetId: str


class TracerouteBody(BaseModel):
    sourceId: str
    targetId: str


class SmartRouteBody(BaseModel):
    sourceId: str
    targetId: str


class DeviceStatusBody(BaseModel):
    deviceId: str
    status: str


class LinkStatusBody(BaseModel):
    status: str
    linkId: Optional[str] = None
    srcId: Optional[str] = None
    dstId: Optional[str] = None


class InterfaceStatusBody(BaseModel):
    deviceId: str
    ifaceName: str
    status: str


class VlanBody(BaseModel):
    """VLAN 配置与恢复共用请求体。

    恢复：仅需 deviceId、port。
    配置：需 mode，access 时填 vlanId，trunk 时填 allowedVlans。
    """

    deviceId: str
    port: str
    mode: Optional[str] = None
    vlanId: Optional[int] = None
    allowedVlans: Optional[List[int]] = None


class OSPFCostUpdateBody(BaseModel):
    linkId: str
    newCost: int
