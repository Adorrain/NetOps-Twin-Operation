"""
Flask 依赖注入定义

本模块提供仿真服务依赖的创建逻辑，
并将底层异常转换为 HTTP 错误响应。

作者: Adorrain
创建时间: 2026-01-30
"""

from flask import abort
from app.service.database import get_db
from app.controller.simulation_service import SimulationService
from app.dao.snapshot_dao import get_latest_topology_data

"""
    函数应该考虑多种情况，比如没有配置文件应该抛出异常404等其他的原因
    但是系统是手动上传配置文件，一般不存在没有配置文件的情况
"""
def get_simulation_service() -> SimulationService:
    """构建并返回 SimulationService 实例；同时注入 db 与最新快照。"""

    db = get_db()
    try:
        topology_data, snapshot = get_latest_topology_data(db)
        return SimulationService(topology_data, db=db, snapshot=snapshot)

    except Exception as e:
        abort(500, description=str(e))
