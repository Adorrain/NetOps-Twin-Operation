"""Topology API 路由

提供网络拓扑的上传和解析功能

作者: Adorrain
修改时间: 2026-03-01
"""
import os
import yaml
from flask import Blueprint, request, jsonify, abort

from app.utils.serialization import dump_model, check_topology
from app.controller.simulation_service import SimulationService
from app.service.database import get_db
from app.dao.snapshot_dao import create_snapshot
from app.model.topology import TopologyData

bp = Blueprint('topology', __name__)


@bp.route("/network/topology/upload", methods=['POST'])
def upload_topology():
    file = request.files.get('file')
    if not file:
        abort(400, description="文件不存在")

    original_name = os.path.basename(file.filename)
    text = file.read().decode("utf-8", errors="ignore")
    data = yaml.safe_load(text)
    check_topology(data)

    devices = data.get("devices", [])
    links = data.get("links", [])
    topology_meta = data.get("topology", {})
    topology_data = TopologyData(topology=topology_meta, devices=devices, links=links)
    service = SimulationService(topology_data)
    db = get_db()
    create_snapshot(
        db,
        topology_data,
        f"上传拓扑配置: {original_name}",
        "TopologyUpload",
    )
    return jsonify(dump_model(service.topology))


