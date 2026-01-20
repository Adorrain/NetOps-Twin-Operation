from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from app.services.yaml_service import load_topology_from_yaml
from app.models.topology import TopologyData
from app.database import get_db
from app.models.db_models import TopologySnapshot
from sqlalchemy.orm import Session
from datetime import datetime
import os
from app.services.yaml_service import TopologyValidationError

router = APIRouter()

@router.post("/network/topology/upload")
async def upload_topology(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        # Determine the path to the config file
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        config_dir = os.path.join(base_dir, "config")
        os.makedirs(config_dir, exist_ok=True)

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
        file_path = os.path.join(config_dir, safe_name)

        with open(file_path, "wb") as buffer:
            buffer.write(content)

        topology_data = load_topology_from_yaml(file_path)
        try:
            snapshot = TopologySnapshot(
                name=f"Upload: {safe_name}",
                description="Initial state from YAML upload",
                data=topology_data.model_dump() if hasattr(topology_data, "model_dump") else topology_data.dict(),
                created_at=datetime.now()
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
        # Determine the path to the config file
        # Assuming we run from backend/ directory
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        config_path = os.path.join(base_dir, "config", "campus.yaml")
        
        topology_data = load_topology_from_yaml(config_path)
        return topology_data
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Topology configuration not found")
    except Exception as e:
        print(f"Error loading topology: {e}")
        raise HTTPException(status_code=500, detail=str(e))
