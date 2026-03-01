"""数据库连接与会话管理。

当前使用 SQLite 作为默认数据库，提供 SQLAlchemy Engine、SessionLocal 以及 FastAPI 依赖 get_db。

作者: Adorrain
创建时间: 2026-01-30
"""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

# 数据库配置
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
db_path = os.path.join(BASE_DIR, "netops.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{db_path}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 声明数据库模型基类
class Base(DeclarativeBase):
    pass

# flask数据库会话依赖
from flask import g

# 获取 SQLite 表的列名
def _get_sqlite_columns(conn, table_name: str):
    rows = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    return {row[1] for row in rows}


def ensure_sqlite_schema():
    schema = {
        "topology_snapshots": {
            "snapshot_type": "TEXT",
            "trigger_event": "TEXT",
            "related_entity": "TEXT",
        },
        "operation_logs": {
            "event_trigger": "TEXT",
            "snapshot_id": "INTEGER",
        },
        "analysis_reports": {
            "event_type": "TEXT",
            "severity": "TEXT",
            "root_cause": "TEXT",
            "impact_scope": "TEXT",
            "suggestion": "TEXT",
            "raw_agent_output": "TEXT",
        },
    }
    # 如果列名不存在，则添加列
    with engine.connect() as conn:
        for table_name, columns in schema.items():
            existing = _get_sqlite_columns(conn, table_name)
            if not existing:
                continue
            for col_name, col_type in columns.items():
                if col_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))
        if hasattr(conn, "commit"):
            conn.commit()

def get_db():
    """获取数据库会话
        SQLAlchemy Session 实例
    """
    if 'db' not in g:
        g.db = SessionLocal()
    return g.db

def close_db(e=None):
    """关闭数据库会话"""
    db = g.pop('db', None)
    if db:
        db.close()
