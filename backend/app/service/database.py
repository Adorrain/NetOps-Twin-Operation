"""数据库连接与会话管理（PostgreSQL）"""

import os

from flask import g
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.model import db_models


class DatabaseService:
    """
    封装 PostgreSQL 的 SQLAlchemy engine / Session，并提供 Flask 请求上下文内的会话管理。

    兼容本项目现有用法：模块级 `init_db()` / `get_db()` / `close_db()` 会代理到本类单例。
    """

    def __init__(self):
        # 本项目在 `backend/main.py` 会调用 load_dotenv()
        self.db_host = os.getenv("DB_HOST")
        self.db_port = os.getenv("DB_PORT")
        self.db_name = os.getenv("DB_NAME")
        self.db_user = os.getenv("DB_USER")
        self.db_password = os.getenv("DB_PASSWORD")

        self.sqlalchemy_database_url = self._build_database_url(self.db_name)

        self.engine = create_engine(
            self.sqlalchemy_database_url,
            echo=True,
            pool_pre_ping=True,
        )
        self.SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=self.engine,
        )

    def _build_database_url(self, database: str) -> str:
        return (
            f"postgresql+psycopg2://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{database}"
        )

    def create_database_if_not_exists(self) -> None:
        """
        如果目标数据库不存在，则创建。
        """
        admin_url = self._build_database_url("postgres")
        admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")

        try:
            with admin_engine.connect() as conn:
                exists = conn.execute(
                    text("SELECT 1 FROM pg_database WHERE datname=:name"),
                    {"name": self.db_name},
                ).scalar()

                if not exists:
                    conn.execute(text(f'CREATE DATABASE "{self.db_name}"'))
        finally:
            admin_engine.dispose()

    def init_db(self) -> None:
        self.create_database_if_not_exists()
        db_models.Base.metadata.create_all(bind=self.engine)

    def get_db(self):
        if "db" not in g:
            g.db = self.SessionLocal()
        return g.db

    def close_db(self, e=None) -> None:
        db = g.pop("db", None)
        if db:
            db.close()


# 模块级单例：供兼容函数调用
db_service = DatabaseService()


def create_database_if_not_exists():
    db_service.create_database_if_not_exists()


def init_db():
    db_service.init_db()


def get_db():
    return db_service.get_db()


def close_db(e=None):
    db_service.close_db(e)
