"""序列化封装

作者: Adorrain
创建时间: 2026-01-30
"""

from typing import Any


def dumpModel(obj, *, byAlias: bool = False):
    """将模型对象转换为可序列化的字典/JSON 结构（字段名为驼峰）。"""
    if obj is None:
        return None
    if hasattr(obj, "model_dump"):
        return obj.model_dump(by_alias=byAlias)
    return obj.dict()


def checkTopology(data):
    """
    校验YAML配置文件
    """
    if not isinstance(data, dict):
        raise ValueError("拓扑数据必须是 JSON")

    devices = data.get("devices") or []
    links = data.get("links") or []
    device_list = {item.get("id") for item in devices if isinstance(item, dict) and item.get("id")}

    # 校验设备
    if not device_list:
        raise ValueError("没有设备")

    # 校验链路
    for l in links:
        if not isinstance(l, dict):
            raise ValueError("链路格式错误")

        if l.get("srcDevice") not in device_list:
            raise ValueError(f"链路源设备不存在: {l.get('srcDevice')}")

        if l.get("dstDevice") not in device_list:
            raise ValueError(f"链路目标设备不存在: {l.get('dstDevice')}")