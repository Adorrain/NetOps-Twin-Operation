"""数据库连接与会话管理。

当前使用 SQLite 作为默认数据库，提供 SQLAlchemy Engine、SessionLocal 以及 FastAPI 依赖 get_db。

Author: Adorrain
Date: 2026-01-30
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "netops.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """获取数据库会话的 FastAPI 依赖生成器。

    Yields:
        SQLAlchemy Session 实例。
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
