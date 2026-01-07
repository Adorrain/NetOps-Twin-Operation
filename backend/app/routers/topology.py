from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from app.services.yaml_service import load_topology_from_yaml
from app.models.topology import TopologyData
from app.database import get_db
from app.models.db_models import TopologySnapshot
from sqlalchemy.orm import Session
from datetime import datetime
import os
import shutil

router = APIRouter()

@router.post("/network/topology/upload")
async def upload_topology(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        print(f"Starting upload for file: {file.filename}")
        # Determine the path to the config file
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        config_dir = os.path.join(base_dir, "config")
        os.makedirs(config_dir, exist_ok=True)
        
        file_path = os.path.join(config_dir, file.filename)
        print(f"Saving file to: {file_path}")
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        print(f"File saved. Parsing YAML...")    
        # Verify it can be parsed and return the parsed data
        topology_data = load_topology_from_yaml(file_path)
        print(f"YAML parsed successfully. Saving snapshot...")
        
        # Auto-save initial snapshot to DB
        try:
            snapshot = TopologySnapshot(
                name=f"Upload: {file.filename}",
                description="Initial state from YAML upload",
                data=topology_data.dict(), # Convert Pydantic model to dict
                created_at=datetime.now()
            )
            db.add(snapshot)
            db.commit()
            print(f"Snapshot saved to DB.")
        except Exception as db_err:
            print(f"Warning: Failed to save snapshot to DB: {db_err}")
            # Don't block the response if DB fails, but log it
        
        return topology_data
    except Exception as e:
        print(f"Error in upload_topology: {str(e)}")
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
