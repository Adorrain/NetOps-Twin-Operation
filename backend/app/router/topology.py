"""Topology API 路由

提供网络拓扑的上传和解析功能

作者: Adorrain
修改时间: 2026-03-01
"""
import os
import yaml
from flask import Blueprint, request, jsonify, abort
from werkzeug.exceptions import HTTPException

from app.utils.serialization import dump_model, validate_topology_dict, TopologyValidationError
from app.controller.simulation_service import SimulationService
from app.config.database import get_db
from app.dao.snapshot_dao import save_new_state
from app.model.topology import TopologyData

bp = Blueprint('topology', __name__)


@bp.route("/network/topology/upload", methods=['POST'])
def upload_topology():
    try:
        file = request.files.get('file')
        if not file:
            abort(400, description="文件不存在")
        original_name = os.path.basename(file.filename )
        ext = os.path.splitext(original_name)[1].lower()
        if ext not in (".yaml", ".yml"):
            abort(400, description="仅支持 .yaml/.yml 文件")
        content = file.read()
        if not content:
            abort(400, description="文件为空")
        try:
            text = content.decode("utf-8")
        except Exception:
            text = content.decode("utf-8", errors="ignore")
        data = yaml.safe_load(text)
        validate_topology_dict(data)
        devices = data.get("devices", [])
        links = data.get("links", [])
        topology_meta = data.get("topology", {})
        topology_data = TopologyData(topology=topology_meta, devices=devices, links=links)
        service = SimulationService(topology_data)
        db = get_db()
        save_new_state(
            db,
            topology_data,
            f"上传拓扑配置: {original_name}",
            "TopologyUpload",
            snapshot_type="topology_only",
            trigger_event="manual",
            event_trigger="user_action",
        )
        return jsonify(dump_model(service.topology))
    except HTTPException:
        raise
    except TopologyValidationError as e:
        abort(400, description=str(e))
    except Exception as e:
        abort(500, description=str(e))


