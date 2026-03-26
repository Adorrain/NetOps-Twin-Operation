"""Topology API 路由

提供网络拓扑的上传和解析功能

作者: Adorrain
修改时间: 2026-03-01
"""
import os
import yaml
from flask import Blueprint, request, jsonify

from app.utils.serialization import dump_model, check_topology
from app.controller.simulation_service import SimulationService
from app.service.database import get_db
from app.dao.snapshot_dao import create_snapshot
from app.model.topology import TopologyData

app= Blueprint('topology', __name__)


@app.route("/network/topology/upload", methods=['POST'])
def upload_topology():
    file = request.files.get('file')
    data = yaml.safe_load(request.files['file'].read())
    original_name = os.path.basename(file.filename)
    check_topology(data)

    topology_data = TopologyData(devices=data.get("devices", []), links=data.get("links", []))
    service = SimulationService(topology_data)
    db = get_db()
    create_snapshot( db, topology_data, f"上传拓扑配置: {original_name}", "TopologyUpload",)
    return jsonify(dump_model(service.topology))


