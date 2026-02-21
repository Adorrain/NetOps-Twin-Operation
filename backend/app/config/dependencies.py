"""Flask 依赖注入定义。

本模块提供仿真服务等依赖项的创建逻辑，并将底层异常转换为 HTTP 错误响应。

作者: Adorrain
创建时间: 2026-01-30
"""

from flask import abort
from app.config.database import get_db
from app.controller.simulation_service import SimulationService
from app.dao.snapshot_dao import SnapshotNotFoundError, SnapshotParseError, get_latest_topology_data


def get_simulation_service() -> SimulationService:
    """获取 SimulationService 实例的依赖函数。

    从数据库读取最新拓扑快照并构建仿真服务；若不存在快照或解析失败则返回对应 HTTP 错误。

    Returns:
        SimulationService 实例。

    Raises:
        404: 无快照。
        500: 解析失败。
    """
    db = get_db()
    try:
        result = get_latest_topology_data(db)
    except SnapshotNotFoundError:
        abort(404, description="No topology snapshot found. Please upload a config first.")
    except SnapshotParseError as e:
        abort(500, description=e.message)
    return SimulationService(result.topology_data)
