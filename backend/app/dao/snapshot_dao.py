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
    topology_data: TopologyData
    snapshot: TopologySnapshot


class SnapshotNotFoundError(Exception):
    pass


class SnapshotParseError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def get_latest_snapshot(db: Session) -> TopologySnapshot:
    snapshot = db.query(TopologySnapshot).order_by(TopologySnapshot.created_at.desc()).first()
    if not snapshot:
        raise SnapshotNotFoundError()
    return snapshot


def get_latest_topology_data(db: Session) -> LatestSnapshotResult:
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

