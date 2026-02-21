"""后端服务入口。

本模块负责创建 Flask 应用、初始化数据库表结构，并注册各业务路由。

Author: Adorrain
Date: 2026-01-30
"""

import os
from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from app.router import topology, ops
from app.config.database import engine, Base, close_db

# 加载 .env 环境变量
load_dotenv()

app = Flask(__name__)

# 配置 CORS
origins = [
    os.getenv("FRONTEND_URL"),
    os.getenv("FRONTEND_URL_SPARE"),
]
# 过滤掉 None 值
origins = [o for o in origins if o]

CORS(app, resources={r"/api/*": {"origins": origins}})

# 注册蓝图
app.register_blueprint(topology.bp, url_prefix="/api")
app.register_blueprint(ops.bp, url_prefix="/api/ops")

# 注册数据库会话清理
app.teardown_appcontext(close_db)

# 初始化数据库表结构
with app.app_context():
    Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
