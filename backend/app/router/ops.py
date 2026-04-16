"""注册路由

作者: Adorrain
修改时间: 2026-04-06
"""

from flask import Blueprint, abort, jsonify, request
from pydantic import ValidationError

from app.model.api_schemas import (
    DeviceStatusBody,
    InterfaceStatusBody,
    LinkStatusBody,
    OSPFCostUpdateBody,
    PingBody,
    SmartRouteBody,
    TracerouteBody,
    VlanBody,
)
from app.service.service_session import getSimulationService

app = Blueprint("ops", __name__)


def getJson():
    return request.get_json() or {}


def parseBody(modelCls):
    try:
        return modelCls(**getJson())
    except ValidationError as e:
        abort(400, description=str(e))


def ping():
    service = getSimulationService()
    body = parseBody(PingBody)
    return jsonify(service.ping(body))


def Traceroute():
    service = getSimulationService()
    body = parseBody(TracerouteBody)
    return jsonify(service.traceroute(body))


def smartRoute():
    service = getSimulationService()
    body = parseBody(SmartRouteBody)
    return jsonify(service.smartRoute(body))


def updateDeviceStatus():
    service = getSimulationService()
    body = parseBody(DeviceStatusBody)
    return jsonify(service.UpdateDeviceStatus(body))


def updateLinkStatus():
    service = getSimulationService()
    body = parseBody(LinkStatusBody)
    return jsonify(service.UpdateLinkStatus(body))


def updateInterfaceStatus():
    service = getSimulationService()
    body = parseBody(InterfaceStatusBody)
    return jsonify(service.UpdateInterfaceStatus(body))


def recoverVlan():
    service = getSimulationService()
    body = parseBody(VlanBody)
    return jsonify(service.RecoverVlan(body))


def configureVlan():
    service = getSimulationService()
    body = parseBody(VlanBody)
    return jsonify(service.ConfigureVlan(body))


def updateOspfCost():
    service = getSimulationService()
    body = parseBody(OSPFCostUpdateBody)
    return jsonify(service.UpdateOspfCost(body))


def setupRouter(bp: Blueprint) -> None:
    """集中注册 ops 路由"""
    bp.add_url_rule("/ping", "ping", ping, methods=["POST"])
    bp.add_url_rule("/traceroute", "Traceroute", Traceroute, methods=["POST"])
    bp.add_url_rule("/smartroute", "smartRoute", smartRoute, methods=["POST"])
    bp.add_url_rule("/device/status", "updateDeviceStatus", updateDeviceStatus, methods=["POST"])
    bp.add_url_rule("/link/status", "updateLinkStatus", updateLinkStatus, methods=["POST"])
    bp.add_url_rule("/interface/status", "updateInterfaceStatus", updateInterfaceStatus, methods=["POST"])
    bp.add_url_rule("/vlan/recover", "recoverVlan", recoverVlan, methods=["POST"])
    bp.add_url_rule("/vlan/configure", "configureVlan", configureVlan, methods=["POST"])
    bp.add_url_rule("/ospf/cost/update", "updateOspfCost", updateOspfCost, methods=["POST"])


setupRouter(app)
