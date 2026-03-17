"""拓扑快照与运维日志的数据访问层

提供读取最新拓扑快照、解析为业务模型，以及在运维操作后自动保存新快照与日志的能力

作者: Adorrain
创建时间: 2026-01-30
"""

from typing import Optional
from sqlalchemy.orm import Session
from app.model.db_models import OperationLog, TopologySnapshot
from app.model.topology import TopologyData
from app.utils.serialization import dump_model

# 快照不存在异常
class SnapshotNotFoundError(Exception):
    pass

# 快照解析异常
class SnapshotParseError(Exception):
    pass



# 读取最新快照
def get_latest_snapshot(db: Session) -> TopologySnapshot:
    """
      读取第一条记录，获取最新快照数据
    """
    snapshot = (
        db.query(TopologySnapshot)
        .order_by(TopologySnapshot.created_at.desc())
        .first()
    )

    if snapshot is None:
        raise SnapshotNotFoundError("快照不存在")

    return snapshot

# 读取最新拓扑数据
def get_latest_topology_data(db: Session) -> tuple[TopologyData, TopologySnapshot]:
    snapshot = get_latest_snapshot(db)

    try:
        topology_data = TopologyData(**snapshot.data)
    except Exception as e:
        raise SnapshotParseError(f"Invalid snapshot data: {e}")

    return topology_data, snapshot

# 保存新状态
def create_snapshot(
    db: Session,
    topology_data: TopologyData,
    description: str,
    op_type: str,
    target: Optional[str] = None,
) -> TopologySnapshot:

    snapshot = TopologySnapshot(
        data=dump_model(topology_data),
    )
    db.add(snapshot)
    db.flush()

    log = OperationLog(
        operation_type=op_type,
        target_id=target,
        details=description,
    )
    db.add(log)
    db.commit()
    return snapshot
