def dump_model(obj, *, by_alias: bool = False):
    if obj is None:
        return None
    if hasattr(obj, "model_dump"):
        return obj.model_dump(by_alias=by_alias)
    return obj.dict()

