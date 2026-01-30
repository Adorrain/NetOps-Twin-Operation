"""拓扑快照与运维日志的数据访问层。

提供读取最新拓扑快照、解析为业务模型，以及在运维操作后自动保存新快照与日志的能力。

作者: Adorrain
创建时间: 2026-01-30
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.model.db_models import OperationLog, TopologySnapshot
from app.model.topology import TopologyData
from app.utils.serialization import dump_model


@dataclass(frozen=True)
class LatestSnapshotResult:
    """获取最新拓扑快照时的组合返回结果。"""
    topology_data: TopologyData
    snapshot: TopologySnapshot


class SnapshotNotFoundError(Exception):
    """未找到拓扑快照时抛出的异常。"""
    pass


class SnapshotParseError(Exception):
    """快照数据解析失败时抛出的异常。"""

    def __init__(self, message: str):
        """初始化解析异常并保留错误信息。"""
        super().__init__(message)
        self.message = message


def get_latest_snapshot(db: Session) -> TopologySnapshot:
    """获取数据库中最新的一条拓扑快照。

    Args:
        db: 数据库会话。

    Returns:
        最新的 TopologySnapshot 记录。

    Raises:
        SnapshotNotFoundError: 当数据库中不存在快照记录时抛出。
    """
    snapshot = db.query(TopologySnapshot).order_by(TopologySnapshot.created_at.desc()).first()
    if not snapshot:
        raise SnapshotNotFoundError()
    return snapshot


def get_latest_topology_data(db: Session) -> LatestSnapshotResult:
    """读取并解析最新拓扑快照为业务拓扑模型。

    Args:
        db: 数据库会话。

    Returns:
        包含 topology_data 与 snapshot 的组合结果。

    Raises:
        SnapshotNotFoundError: 不存在快照时抛出。
        SnapshotParseError: 快照 data 字段无法解析为 TopologyData 时抛出。
    """
    snapshot = get_latest_snapshot(db)
    try:
        topology_data = TopologyData(**snapshot.data)
    except Exception as e:
        raise SnapshotParseError(f"Failed to parse snapshot data: {str(e)}")
    return LatestSnapshotResult(topology_data=topology_data, snapshot=snapshot)


def save_new_state(
    db: Session,
    topology_data: TopologyData,
    description: str,
    op_type: str,
    target: Optional[str] = None,
) -> TopologySnapshot:
    """保存新的拓扑快照并写入运维操作日志。

    Args:
        db: 数据库会话。
        topology_data: 当前拓扑状态。
        description: 操作描述（写入快照与日志）。
        op_type: 操作类型标识（写入快照名与日志 operation_type）。
        target: 操作目标标识（可选，写入日志 target_id）。

    Returns:
        新创建并已提交的 TopologySnapshot 记录。
    """
    snapshot = TopologySnapshot(
        name=f"Auto-Save: {op_type}",
        description=description,
        data=dump_model(topology_data),
        created_at=datetime.now(),
    )
    db.add(snapshot)

    log = OperationLog(
        operation_type=op_type,
        target_id=target,
        details=description,
        status="success",
    )
    db.add(log)

    db.commit()
    return snapshot
