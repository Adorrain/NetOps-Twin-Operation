from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict

class Device(BaseModel):
    id: str
    name: str
    role: str
    device_type: str = Field(..., description="Device type like router, switch, etc.")
    mgmt_ip: Optional[str] = Field(None, description="Management IP address")
    status: str = "up"
    
    class Config:
        populate_by_name = True
        extra = "allow" 

class Link(BaseModel):
    id: str
    # Use validation_alias so we can read 'src_device' from YAML, but output 'src_device_id' to JSON
    src_device_id: str = Field(validation_alias="src_device")
    dst_device_id: str = Field(validation_alias="dst_device")
    status: str = "up"
    bandwidth: Optional[str] = None
    
    class Config:
        populate_by_name = True
        extra = "allow"

class TopologyMetadata(BaseModel):
    name: str
    type: str

class TopologyData(BaseModel):
    topology: Optional[TopologyMetadata] = None
    devices: List[Device]
    links: List[Link]
    
    class Config:
        populate_by_name = True
