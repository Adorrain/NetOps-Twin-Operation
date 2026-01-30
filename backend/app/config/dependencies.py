"""FastAPI 依赖注入定义。

本模块提供仿真服务等依赖项的创建逻辑，并将底层异常转换为 HTTP 错误响应。

作者: Adorrain
创建时间: 2026-01-30
"""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.controller.simulation_service import SimulationService
from app.dao.snapshot_dao import SnapshotNotFoundError, SnapshotParseError, get_latest_topology_data


def get_simulation_service(db: Session = Depends(get_db)) -> SimulationService:
    """获取 SimulationService 实例的依赖函数。

    从数据库读取最新拓扑快照并构建仿真服务；若不存在快照或解析失败则返回对应 HTTP 错误。

    Args:
        db: 数据库会话依赖。

    Returns:
        SimulationService 实例。

    Raises:
        HTTPException: 无快照时抛出 404；解析失败时抛出 500。
    """
    try:
        result = get_latest_topology_data(db)
    except SnapshotNotFoundError:
        raise HTTPException(status_code=404, detail="No topology snapshot found. Please upload a config first.")
    except SnapshotParseError as e:
        raise HTTPException(status_code=500, detail=e.message)
    return SimulationService(result.topology_data)
