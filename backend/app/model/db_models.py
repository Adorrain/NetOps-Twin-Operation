from sqlalchemy import Column, Integer, String, DateTime, JSON, Text
from sqlalchemy.sql import func
from app.config.database import Base


class TopologySnapshot(Base):
    __tablename__ = "topology_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, comment="快照名称，如：核心交换机故障模拟")
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    data = Column(JSON, nullable=False)


class OperationLog(Base):
    __tablename__ = "operation_logs"

    id = Column(Integer, primary_key=True, index=True)
    operation_type = Column(String, index=True, comment="操作类型：Modify, Delete, OSPF_Calc")
    target_id = Column(String, nullable=True, comment="操作对象ID，如 device-1")
    details = Column(Text, nullable=True, comment="操作详情描述")
    status = Column(String, default="success")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

