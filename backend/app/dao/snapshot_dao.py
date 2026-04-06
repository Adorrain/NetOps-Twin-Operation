"""拓扑快照与运维日志的数据访问层

作者: Adorrain
创建时间: 2026-01-30
"""

from app.model.db_models import OperationLog, TopologySnapshot
from app.model.topology import TopologyData
from app.utils.serialization import dumpModel


def getLatestTopologyData(db):
    """获取最新拓扑数据"""
    snapshot = (
        db.query(TopologySnapshot)
        .order_by(TopologySnapshot.created_at.desc())
        .first()
    )

    if not snapshot:
        raise ValueError("快照不存在")

    return TopologyData(**snapshot.data), snapshot


def createSnapshot(db, topologyData, description, Type, target):
    """保存拓扑数据快照"""
    snapshot = TopologySnapshot(data=dumpModel(topologyData))
    db.add(snapshot)

    db.add(
        OperationLog( operation_type=Type, trigger_device=target, details=description,)
    )

    db.commit()
    return snapshot
