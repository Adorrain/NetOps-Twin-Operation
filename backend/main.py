"""后端服务入口

创建 Flask 应用、初始化数据库表结构，注册路由

作者: Adorrain
创建时间: 2026-01-30
"""

from flask import Flask
from flask_cors import CORS
import os
from app.router import topology, ops
from app.service.database import close_db, init_db

# 创建 Flask 实例
app = Flask(__name__)

# 配置 CORS：支持本地开发和生产域名，可由环境变量 CORS_ORIGINS 覆盖（逗号分隔）
_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://demo.zfank.site",
]
_cors_origins_env = os.getenv("CORS_ORIGINS", "").strip()
_cors_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()] if _cors_origins_env else _default_origins
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
