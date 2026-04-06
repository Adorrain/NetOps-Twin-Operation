"""Flask 注册服务实例

作者: Adorrain
创建时间: 2026-01-30
"""

from flask import abort

from app.controller.simulation_service import SimulationService
from app.dao.snapshot_dao import getLatestTopologyData
from app.service.database import databaseService


def getSimulationService():
    """构建并返回 SimulationService 实例，同时注入 db 与最新快照"""
    session = databaseService.getDb()
    try:
        topologyData, snapshot = getLatestTopologyData(session)
        return SimulationService(topologyData, db=session, snapshot=snapshot)
    except Exception as e:
        abort(500, description=str(e))
