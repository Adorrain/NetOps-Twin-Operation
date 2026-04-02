"""后端服务入口

创建 Flask 应用、初始化数据库表结构，注册路由

作者: Adorrain
创建时间: 2026-01-30
"""

import os
from dotenv import load_dotenv

# IMPORTANT:
# `app.service.database` instantiates the SQLAlchemy engine at import time.
# Make sure `.env` is loaded before importing routers / database service.
load_dotenv()

from flask import Flask
from flask_cors import CORS
from app.router import topology, ops
from app.service.database import close_db, init_db

# 创建 Flask 实例
app = Flask(__name__)

# 配置 CORS：允许前端开发地址访问 /api 下所有接口
_cors_origins = os.getenv("cors_origins")
CORS(app, resources={r"/api.*": {"origins": _cors_origins}})

# 注册蓝图
app.register_blueprint(topology.app, url_prefix="/api")
app.register_blueprint(ops.app, url_prefix="/api/ops")

# 注册数据库会话清理（请求结束时自动关闭数据库会话）
app.teardown_appcontext(close_db)

# 初始化数据库表结构（如果不存在）
with app.app_context():
    init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
