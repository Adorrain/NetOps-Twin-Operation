from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.controller.simulation_service import SimulationService
from app.dao.snapshot_dao import SnapshotNotFoundError, SnapshotParseError, get_latest_topology_data


def get_simulation_service(db: Session = Depends(get_db)) -> SimulationService:
    try:
        result = get_latest_topology_data(db)
    except SnapshotNotFoundError:
        raise HTTPException(status_code=404, detail="No topology snapshot found. Please upload a config first.")
    except SnapshotParseError as e:
        raise HTTPException(status_code=500, detail=e.message)
    return SimulationService(result.topology_data)

