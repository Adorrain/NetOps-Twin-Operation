"""
数据库 ORM 模型定义。

包含：
- 拓扑运行态快照（TopologySnapshot）
- 运维操作日志（OperationLog）

作者: Adorrain
修改时间: 2026-03-01
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    JSON,
    Text
)
from sqlalchemy.sql import func
from app.service.database import Base

"""
拓扑运行态快照业务模型
"""
class TopologySnapshot(Base):
    """网络运行态快照表（支持故障分析与回溯）"""
    __tablename__ = "topology_snapshots"

    id = Column(Integer, primary_key=True, index=True)

    # 运行态完整数据
    data = Column(JSON, nullable=False, comment="完整网络运行态数据快照")

    created_at = Column(DateTime(timezone=True), server_default=func.now())

"""
运维操作日志业务模型
"""
class OperationLog(Base):
    """运维操作日志表"""
    __tablename__ = "operation_logs"

    id = Column(Integer, primary_key=True, index=True)

    operation_type = Column(
        String,
        index=True,
        comment="操作类型：Modify | Delete | OSPF_Calc | Interface_Shutdown"
    )

    target_id = Column(
        String,
        nullable=True,
        comment="操作对象ID，如 device-1"
    )

    details = Column(
        Text,
        nullable=True,
        comment="操作详情描述"
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
