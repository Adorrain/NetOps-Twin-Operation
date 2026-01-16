from pydantic import BaseModel, Field
from typing import Optional

# --- OSPF Request Models ---
class OSPFConfigBody(BaseModel):
    device_id: str = Field(..., alias="deviceId")
    area: int
    router_id: Optional[str] = Field(None, alias="routerId")
    
    class Config:
        populate_by_name = True

class OSPFResetBody(BaseModel):
    device_id: str = Field(..., alias="deviceId")
    
    class Config:
        populate_by_name = True

class OSPFNeighborsBody(BaseModel):
    device_id: str = Field(..., alias="deviceId")
    
    class Config:
        populate_by_name = True
