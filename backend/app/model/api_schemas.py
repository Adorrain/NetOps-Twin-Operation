"""OSPF的API 请求/响应数据结构定义

使用 Pydantic 描述后端接口的请求体结构，并通过字段别名与前端字段风格保持兼容

作者: Adorrain
创建时间: 2026-01-30
"""

from pydantic import BaseModel, Field
from typing import Optional


class OSPFConfigBody(BaseModel):
    device_id: str = Field(..., alias="deviceId")
    area: int
    router_id: Optional[str] = Field(None, alias="routerId")


class OSPFResetBody(BaseModel):
    device_id: str = Field(..., alias="deviceId")


class OSPFNeighborsBody(BaseModel):
    device_id: str = Field(..., alias="deviceId")