"""后端服务入口

创建 Flask 应用、初始化数据库表结构，注册路由

作者: Adorrain
创建时间: 2026-01-30
"""

import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 导入 Flask 和 CORS
from flask import Flask
from flask_cors import CORS
# 导入路由和数据库服务
from app.router import ops, topology
from app.service.database import databaseService
# 创建 Flask 应用
app = Flask(__name__)

# 配置 CORS, 允许跨域请求
_corsOrigins = os.getenv("cors_origins")
CORS(app, resources={r"/api.*": {"origins": _corsOrigins}})

# 注册路由
app.register_blueprint(topology.app, url_prefix="/api")
app.register_blueprint(ops.app, url_prefix="/api/ops")

# 清理数据库会话
app.teardown_appcontext(databaseService.closeDb)

# 初始化数据库表结构
with app.app_context():
    databaseService.initDb()

# 启动 Flask 应用
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
