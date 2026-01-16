from sqlalchemy import Column, Integer, String, DateTime, JSON, Text
from sqlalchemy.sql import func
from app.database import Base

class TopologySnapshot(Base):
    """
    网络拓扑快照表
    用于实现'历史状态回溯'。每次重大变更（如设备下线、配置修改）都存一份快照。
    """
    __tablename__ = "topology_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, comment="快照名称，如：核心交换机故障模拟")
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 核心字段：存储整个拓扑的 JSON 数据 (Devices, Links, OSPF, VLANs)
    # 使用 JSON 类型在 SQLite 中会自动序列化/反序列化
    data = Column(JSON, nullable=False)

class OperationLog(Base):
    """
    运维操作日志表
    """
    __tablename__ = "operation_logs"

    id = Column(Integer, primary_key=True, index=True)
    operation_type = Column(String, index=True, comment="操作类型：Modify, Delete, OSPF_Calc")
    target_id = Column(String, nullable=True, comment="操作对象ID，如 device-1")
    details = Column(Text, nullable=True, comment="操作详情描述")
    status = Column(String, default="success")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

