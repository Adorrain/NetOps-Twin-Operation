"""序列化封装

    兼容序列化封装，接口返回

作者: Adorrain
创建时间: 2026-01-30
"""

from typing import Dict, Any

class TopologyValidationError(ValueError):
    """拓扑配置校验失败时抛出的异常"""
    pass


"""
  参数说明:
    obj: 待序列化对象
    by_alias: 是否使用字段别名进行序列化

  返回:
    序列化后的字典；若 obj 为 None 则返回 None
"""
def dump_model(obj, *, by_alias: bool = False):
    """
    将模型对象转换为可序列化的字典/JSON结构
    """
    if obj is None:
        return None
    if hasattr(obj, "model_dump"):
        return obj.model_dump(by_alias=by_alias)
    return obj.dict()

"""
  校验YAML文件合法性
"""
def check_topology(data):
    if not isinstance(data, dict):
        raise ValueError("拓扑数据必须是 JSON")

    devices = data.get("devices")
    links = data.get("links")
    device_list = {d.get("id") for d in devices if isinstance(d, dict)}

    # 校验设备
    if not device_list:
        raise ValueError("没有设备")

    # 校验链路
    for l in links:
        if not isinstance(l, dict):
            raise ValueError("链路格式错误")

        if l.get("src_device") not in device_list:
            raise ValueError(f"链路源设备不存在: {l.get('src_device')}")

        if l.get("dst_device") not in device_list:
            raise ValueError(f"链路目标设备不存在: {l.get('dst_device')}")