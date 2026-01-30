"""API 请求/响应数据结构定义。

使用 Pydantic 描述后端接口的请求体结构，并通过字段别名与前端字段风格保持兼容。

作者: Adorrain
创建时间: 2026-01-30
"""

from pydantic import BaseModel, Field
from typing import Optional


class OSPFConfigBody(BaseModel):
    """OSPF 配置更新请求体。"""
    device_id: str = Field(..., alias="deviceId")
    area: int
    router_id: Optional[str] = Field(None, alias="routerId")

    class Config:
        populate_by_name = True


class OSPFResetBody(BaseModel):
    """OSPF 进程重置请求体。"""
    device_id: str = Field(..., alias="deviceId")

    class Config:
        populate_by_name = True


class OSPFNeighborsBody(BaseModel):
    """OSPF 邻居查询请求体。"""
    device_id: str = Field(..., alias="deviceId")

    class Config:
        populate_by_name = True
