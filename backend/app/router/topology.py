from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy.orm import Session
from datetime import datetime
import os

from app.utils.yaml_loader import load_topology_from_yaml, TopologyValidationError
from app.model.topology import TopologyData
from app.config.database import get_db
from app.model.db_models import TopologySnapshot
from app.utils.config_storage import get_config_path, write_bytes
from app.utils.serialization import dump_model

router = APIRouter()


@router.post("/network/topology/upload")
async def upload_topology(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        original_name = os.path.basename(file.filename or "topology.yaml")
        _, ext = os.path.splitext(original_name)
        ext = ext.lower()
        if ext not in (".yaml", ".yml"):
            raise HTTPException(status_code=400, detail="Only .yaml/.yml files are supported")

        content = await file.read()
        if content is None:
            raise HTTPException(status_code=400, detail="Empty upload")
        if len(content) > 2 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="YAML file too large (max 2MB)")

        safe_name = original_name
        file_path = get_config_path(safe_name)
        write_bytes(file_path, content)

        topology_data = load_topology_from_yaml(file_path)
        try:
            snapshot = TopologySnapshot(
                name=f"Upload: {safe_name}",
                description="Initial state from YAML upload",
                data=dump_model(topology_data),
                created_at=datetime.now(),
            )
            db.add(snapshot)
            db.commit()
        except Exception:
            pass
        return topology_data
    except TopologyValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/topology", response_model=TopologyData)
async def get_topology():
    try:
        config_path = get_config_path("campus.yaml")
        topology_data = load_topology_from_yaml(config_path)
        return topology_data
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Topology configuration not found")
    except Exception as e:
        print(f"Error loading topology: {e}")
        raise HTTPException(status_code=500, detail=str(e))

