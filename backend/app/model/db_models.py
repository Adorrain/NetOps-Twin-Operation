"""数据库 ORM 模型定义
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
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql import func

class Base(DeclarativeBase):
    pass

class TopologySnapshot(Base):
    """网络运行态快照表（支持故障分析与回溯）"""
    __tablename__ = "TopologySnapshot"

    # 主键列，自增
    id = Column(Integer, primary_key=True, index=True)

    # 完整网络运行态数据快照，JSON 格式存储
    data = Column(JSON, nullable=False, comment="完整网络运行态数据快照")

    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class OperationLog(Base):
    """运维操作日志表"""
    __tablename__ = "OperationLog"

    # 主键列，自增
    id = Column(Integer, primary_key=True, index=True)

    # 操作类型
    operation_type = Column( String, index=True, comment="操作类型")

    # 触发设备
    trigger_device = Column( String, nullable=True, comment="操作对象ID")

    # 操作详细数据
    details = Column(Text, nullable=True, comment="操作详情描述")

    # 操作时间
    created_at = Column(DateTime(timezone=True), server_default=func.now())
