"""数据库连接与会话管理（PostgreSQL）"""

from pathlib import Path

from dotenv import load_dotenv

# 仓库根目录 .env（先于 os.getenv 加载）
load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")

from app.model import db_models
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from flask import g
import os

DB_HOST = os.getenv("DB_HOST", "")
DB_PORT = os.getenv("DB_PORT", "")
DB_NAME = os.getenv("DB_NAME", "")
DB_USER = os.getenv("DB_USER", "")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")



SQLALCHEMY_DATABASE_URL = ( f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}" f"@{DB_HOST}:{DB_PORT}/{DB_NAME}" )

engine = create_engine( SQLALCHEMY_DATABASE_URL, echo=True, pool_pre_ping=True)

SessionLocal = sessionmaker( autocommit=False, autoflush=False, bind=engine )

def create_database_if_not_exists():
    url = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/postgres"
    engine = create_engine(url, isolation_level="AUTOCOMMIT")

    with engine.connect() as conn:
        exists = conn.execute( text("SELECT 1 FROM pg_database WHERE datname=:name"), {"name": DB_NAME}).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{DB_NAME}"'))

    engine.dispose()

def init_db():
    create_database_if_not_exists()
    db_models.Base.metadata.create_all(bind=engine)


def get_db():
    if 'db' not in g:
        g.db = SessionLocal()
    return g.db

def close_db(e=None):
    db = g.pop('db', None)
    if db:
        db.close()
