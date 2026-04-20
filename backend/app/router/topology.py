"""Topology API 路由

作者: Adorrain
修改时间: 2026-03-01
"""

import os

import yaml
from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from app.controller.simulation_service import SimulationService
from app.dao.snapshot_dao import createSnapshot, getLatestTopologyData
from app.model.topology import TopologyData
from app.service.database import databaseService
from app.utils.serialization import checkTopology, dumpModel

app = Blueprint("topology", __name__)


@app.route("/topology/upload", methods=["POST"])
def uploadTopology():
    f = request.files.get("file")
    try:
        data = yaml.safe_load(f.read())
        checkTopology(data)
        topologyData = TopologyData.model_validate(data)
        service = SimulationService(topologyData)
    except yaml.YAMLError as e:
        return jsonify(detail=f"YAML 解析失败：{e}"), 400
    except ValidationError as e:
        return jsonify(detail=f"拓扑字段校验失败：{e.errors()}"), 400
    except Exception as e:
        return jsonify(detail=f"后端处理失败：{e}"), 400

    session = databaseService.getDb()
    try:
        createSnapshot(
            session,
            topologyData,
            f"上传拓扑配置: {os.path.basename(f.filename or '')}",
            "TopologyUpload",
            "",
        )
    except Exception:
        pass

    return jsonify(dumpModel(service.topologyData))
