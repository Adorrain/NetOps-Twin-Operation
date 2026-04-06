"""数据库连接与会话管理（PostgreSQL）"""

import os

import psycopg2
from flask import g
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.model import db_models


class DatabaseService:
    def __init__(self):
        self.dbName = os.getenv("DB_NAME")

        dbUrl = (
            f"postgresql+psycopg2://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
            f"@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{self.dbName}"
        )

        self.engine = create_engine(dbUrl, pool_pre_ping=True)
        self.sessionLocal = sessionmaker(bind=self.engine)

    def initDb(self):
        self._createDbIfNotExists()
        db_models.Base.metadata.create_all(self.engine)

    def _createDbIfNotExists(self):
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT"),
            database="postgres",
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
        )

        conn.autocommit = True
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM pg_database WHERE datname=%s", (self.dbName,))
        exists = cur.fetchone()

        if not exists:
            cur.execute(f'CREATE DATABASE "{self.dbName}"')

        cur.close()
        conn.close()

    def getDb(self):
        if "db" not in g:
            g.db = self.sessionLocal()
        return g.db

    def closeDb(self, e=None):
        db = g.pop("db", None)
        if db:
            db.close()


databaseService = DatabaseService()
