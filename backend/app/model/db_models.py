"""
数据库 ORM 模型定义。

包含：
- 拓扑运行态快照（TopologySnapshot）
- 运维操作日志（OperationLog）
- Agent 故障分析报告（AnalysisReport）

作者: Adorrain
修改时间: 2026-03-01
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    JSON,
    Text,
    ForeignKey
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.config.database import Base

"""
拓扑运行态快照业务模型
"""
class TopologySnapshot(Base):
    """网络运行态快照表（支持故障分析与回溯）"""
    __tablename__ = "topology_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    # 基本信息
    name = Column(String, index=True, comment="快照名称，如：核心交换机故障模拟")
    description = Column(String, nullable=True)

    # 快照类型
    snapshot_type = Column(
        String,
        index=True,
        comment="topology_only | runtime_state | reachability | failure_analysis"
    )

    # 触发来源
    trigger_event = Column(
        String,
        index=True,
        nullable=True,
        comment="manual | ping_failed | device_down | interface_down | auto_recompute"
    )

    # 关联对象（如 device-1 / SW1:g0/1 / PC1->Server1）
    related_entity = Column(
        String,
        nullable=True,
        comment="触发分析的关联对象"
    )

    # 运行态完整数据
    data = Column(JSON, nullable=False, comment="完整网络运行态数据快照")

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关联分析报告
    analysis_reports = relationship(
        "AnalysisReport",
        back_populates="snapshot",
        cascade="all, delete-orphan"
    )

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

    status = Column(
        String,
        default="success",
        comment="success | failed"
    )

    # 操作触发来源
    event_trigger = Column(
        String,
        index=True,
        comment="user_action | system_auto | agent_analysis"
    )

    # 关联生成的快照
    snapshot_id = Column(
        Integer,
        ForeignKey("topology_snapshots.id"),
        nullable=True
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())

"""
Agent 故障分析报告业务模型
"""
class AnalysisReport(Base):
    """Agent 故障分析报告表（仅辅助决策，不参与控制）"""
    __tablename__ = "analysis_reports"

    id = Column(Integer, primary_key=True, index=True)

    snapshot_id = Column(
        Integer,
        ForeignKey("topology_snapshots.id"),
        nullable=False
    )

    event_type = Column(
        String,
        index=True,
        comment="ping_failed | device_down | interface_down"
    )

    severity = Column(
        String,
        comment="low | medium | high | critical"
    )

    root_cause = Column(
        Text,
        comment="根因分析"
    )

    impact_scope = Column(
        Text,
        comment="影响范围"
    )

    suggestion = Column(
        Text,
        comment="辅助建议（不自动执行）"
    )

    raw_agent_output = Column(
        JSON,
        nullable=True,
        comment="原始Agent返回数据"
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    snapshot = relationship("TopologySnapshot", back_populates="analysis_reports")