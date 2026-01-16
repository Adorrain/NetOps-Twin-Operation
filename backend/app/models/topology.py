from pydantic import BaseModel, Field, computed_field
from typing import List, Optional, Any, Dict

class Device(BaseModel):
    id: str
    name: str
    role: str
    device_type: str = Field(..., description="Device type like router, switch, etc.")
    mgmt_ip: Optional[str] = Field(None, description="Management IP address")
    status: str = "up"
    configuration: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Device configuration including OSPF, etc.")
    
    class Config:
        populate_by_name = True
        extra = "allow" 

class Link(BaseModel):
    id: str
    src_device: str 
    dst_device: str 
    src_interface: Optional[str] = None
    dst_interface: Optional[str] = None
    status: str = "up"
    bandwidth: Optional[str] = None
    
    @computed_field
    @property
    def src_device_id(self) -> str:
        return self.src_device

    @computed_field
    @property
    def dst_device_id(self) -> str:
        return self.dst_device

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
