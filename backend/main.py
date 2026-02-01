"""后端服务入口。

本模块负责创建 FastAPI 应用、初始化数据库表结构，并注册各业务路由。

Author: Adorrain
Date: 2026-01-30
"""

import uvicorn
import os
from dotenv import load_dotenv

# 加载 .env 环境变量
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.router import topology, ops
from app.config.database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="NetOps API", description="Network Operations & Simulation Platform Backend API")

origins = [
    os.getenv("FRONTEND_URL"),
    os.getenv("FRONTEND_URL_SPARE"),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(topology.router, prefix="/api", tags=["Topology Management"])
app.include_router(ops.router, prefix="/api/ops", tags=["Network Operations"])

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
