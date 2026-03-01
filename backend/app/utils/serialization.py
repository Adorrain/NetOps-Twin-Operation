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
def validate_topology_dict(data: Dict[str, Any]) -> None:
    """
    判断文件的数据格式是否为JSON格式
    """
    if not isinstance(data, dict):
        raise TopologyValidationError("数据格式错误")
    
    """
    判断设备和链路字段合法性
    """
    devices = data.get("devices", [])
    links = data.get("links", [])
    if not isinstance(devices, list) or not isinstance(links, list):
        raise TopologyValidationError("设备和链路应该为列表格式")

    """
    判断设备 ID 合法性
    """
    device_ids = []
    for d in devices:
        dev_id = d.get("id")
        if not isinstance(dev_id, str):
            raise TopologyValidationError("设备 ID 必须为字符串")
        device_ids.append(dev_id)
    if len(device_ids) != len(set(device_ids)):
        raise TopologyValidationError("设备 ID 不能重复")
    device_id_set = set(device_ids)
    
    """
    判断链路 ID 合法性
    """
    link_ids = []
    for l in links:
        link_id = l.get("id")
        if not isinstance(link_id, str):
            raise TopologyValidationError("链路 ID 必须为字符串")
        link_ids.append(link_id)
        if l.get("src_device") not in device_id_set:
            raise TopologyValidationError(f"未知的源设备: {l.get('src_device')}")
        if l.get("dst_device") not in device_id_set:
            raise TopologyValidationError(f"未知的目标设备: {l.get('dst_device')}")
    if len(link_ids) != len(set(link_ids)):
        raise TopologyValidationError("链路 ID 不能重复")