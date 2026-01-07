import yaml
import os
from typing import Dict, Any
from app.models.topology import TopologyData

def load_topology_from_yaml(file_path: str) -> TopologyData:
    """
    Load topology data from a YAML file and convert it to the Pydantic model.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Config file not found: {file_path}")

    with open(file_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)

    # Transform data if necessary
    devices = data.get('devices', [])
    links = data.get('links', [])
    topology_meta = data.get('topology', {})

    # Create model
    # Note: Pydantic aliases (src_device -> src_device_id) handle the renaming
    
    topology_data = TopologyData(
        topology=topology_meta,
        devices=devices,
        links=links 
    )
    
    return topology_data
