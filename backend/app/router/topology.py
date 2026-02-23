"""拓扑相关接口路由。

提供拓扑 YAML 上传与读取能力，并在上传时可选地将快照写入数据库。

作者: Adorrain
创建时间: 2026-01-30
"""

from flask import Blueprint, request, jsonify, abort
from werkzeug.exceptions import HTTPException
from datetime import datetime
import os

from app.utils.yaml_loader import load_topology_from_yaml, TopologyValidationError
from app.config.database import get_db
from app.model.db_models import TopologySnapshot
from app.utils.serialization import dump_model

bp = Blueprint('topology', __name__)


def _get_config_path(filename: str) -> str:
    """获取配置文件绝对路径（兼容原 config_storage 逻辑）。"""
    # topology.py -> router -> app -> backend
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    config_dir = os.path.join(base_dir, "config")
    os.makedirs(config_dir, exist_ok=True)
    return os.path.join(config_dir, filename)


@bp.route("/network/topology/upload", methods=['POST'])
def upload_topology():
    """上传拓扑 YAML 文件并解析为拓扑数据。

    上传文件会落盘到后端 config/ 目录，然后解析为 TopologyData。
    解析成功后尝试写入一条 TopologySnapshot（写入失败不会影响接口返回）。

    Returns:
        解析后的拓扑数据（TopologyData）。

    Raises:
        400: 文件类型不支持、文件为空。
        413: 文件过大。
        500: 解析/内部错误。
    """
    db = get_db()
    try:
        if 'file' not in request.files:
             abort(400, description="No file part")
        
        file = request.files['file']
        if file.filename == '':
            abort(400, description="No selected file")

        original_name = os.path.basename(file.filename or "topology.yaml")
        _, ext = os.path.splitext(original_name)
        ext = ext.lower()
        if ext not in (".yaml", ".yml"):
            abort(400, description="Only .yaml/.yml files are supported")

        # Check content length if possible, or read and check size
        # Flask doesn't automatically limit size per route easily without reading
        # For simplicity, we read content
        content = file.read()
        
        if not content:
            abort(400, description="Empty upload")
        
        if len(content) > 2 * 1024 * 1024:
            abort(413, description="YAML file too large (max 2MB)")

        safe_name = original_name
        file_path = _get_config_path(safe_name)
        with open(file_path, "wb") as f:
            f.write(content)

        topology_data = load_topology_from_yaml(file_path)
        try:
            snapshot = TopologySnapshot(
                name=f"Upload: {safe_name}",
                description="Initial state from YAML upload",
                data=dump_model(topology_data),
                created_at=datetime.now(),
            )
            db.add(snapshot)
            db.commit()
        except Exception:
            # logging exception here would be good
            pass
        return jsonify(dump_model(topology_data))
    except HTTPException:
        raise
    except TopologyValidationError as e:
        abort(400, description=str(e))
    except Exception as e:
        abort(500, description=str(e))


@bp.route("/topology", methods=['GET'])
def get_topology():
    """获取当前拓扑配置。

    默认从 config/campus.yaml 读取并解析拓扑数据。

    Returns:
        拓扑数据（TopologyData）。

    Raises:
        404: 配置文件不存在。
        500: 解析/内部错误。
    """
    try:
        config_path = _get_config_path("campus.yaml")
        topology_data = load_topology_from_yaml(config_path)
        return jsonify(dump_model(topology_data))
    except FileNotFoundError:
        abort(404, description="Topology configuration not found")
    except Exception as e:
        print(f"Error loading topology: {e}")
        abort(500, description=str(e))
