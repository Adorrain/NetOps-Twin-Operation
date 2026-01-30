"""序列化工具函数。

提供对 Pydantic v1/v2 模型的兼容序列化封装，便于持久化与接口返回。

作者: Adorrain
创建时间: 2026-01-30
"""

def dump_model(obj, *, by_alias: bool = False):
    """将模型对象转换为可序列化的字典结构。

    Args:
        obj: 待序列化对象，支持 Pydantic v2（model_dump）与 v1（dict）。
        by_alias: 是否使用字段别名进行序列化。

    Returns:
        序列化后的字典；若 obj 为 None 则返回 None。
    """
    if obj is None:
        return None
    if hasattr(obj, "model_dump"):
        return obj.model_dump(by_alias=by_alias)
    return obj.dict()
