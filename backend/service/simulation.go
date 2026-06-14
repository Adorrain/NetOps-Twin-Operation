package service

import (
	"backend/model"
	"backend/repository"
	"backend/utils"
	"encoding/json"
	"fmt"
)

func getLatestTopology() (*model.TopologyData, error) {
	snapshot, err := repository.GetLatestSnapshot()
	if err != nil {
		return nil, fmt.Errorf("获取最新拓扑数据失败")
	}
	var topology model.TopologyData
	err = json.Unmarshal([]byte(snapshot.Data), &topology)
	if err != nil {
		return nil, fmt.Errorf("解析最新拓扑数据失败")
	}
	return &topology, nil
}

func GetLogs() model.ApiResponse {
	log, err := repository.GetLatestLog()
	if err != nil {
		return utils.ServerError(err.Error())
	}
	return utils.Success("success", map[string]interface{}{
		"operationType": log.OperationType,
		"details":       log.Details,
		"createdAt":     log.CreatedAt,
	})
}

func updateDataBase(topology *model.TopologyData, logType, target, message, detail string) model.ApiResponse {
	data, _ := json.Marshal(topology)
	err := repository.CreateSnapshot(string(data))
	if err != nil {
		return utils.ServerError("保存拓扑快照失败")
	}
	repository.CreateLog(logType, target, detail)
	return utils.Success(message, topology)
}

func getDeviceMap(devices []model.Device) map[string]*model.Device {
	deviceMap := make(map[string]*model.Device)
	for _, device := range devices {
		deviceMap[device.Id] = &device
	}
	return deviceMap
}

func Ping(body *model.PingBody) model.ApiResponse {
	topology, err := getLatestTopology()
	if err != nil {
		return utils.ServerError(err.Error())
	}
	graph := BuildForwardingGraph(topology)
	path, _ := dijkstra(graph, body.SourceId, body.TargetId)
	if path == nil {
		return utils.NotFound("路径不可达")
	}
	rtt := calculateRouteTotalDelay(path, topology) * 2
	_ = updateDataBase(topology, "ping", body.TargetId, "Ping 测试", fmt.Sprintf("Ping 测试: %s -> %s", body.SourceId, body.TargetId))
	return utils.Success("success", map[string]interface{}{
		"rtt": rtt,
	})
}

func Traceroute(body *model.TracerouteBody) model.ApiResponse {
	topology, err := getLatestTopology()
	if err != nil {
		return utils.ServerError(err.Error())
	}
	graph := BuildForwardingGraph(topology)
	path, _ := dijkstra(graph, body.SourceId, body.TargetId)
	if path == nil {
		return utils.NotFound("路径不可达")
	}
	deviceMap := getDeviceMap(topology.Devices)
	ip := []string{}
	for _, id := range path {
		ip = append(ip, deviceMap[id].Ip)
	}
	hops := len(path) - 1
	utilization := calculateRouteMaxUtilization(path)
	_ = updateDataBase(topology, "traceroute", body.TargetId, "Traceroute 测试", fmt.Sprintf("Traceroute 测试: %s -> %s", body.SourceId, body.TargetId))
	return utils.Success("success", map[string]interface{}{
		"sourceId":    body.SourceId,
		"targetId":    body.TargetId,
		"ip":          ip,
		"path":        path,
		"hops":        hops,
		"utilization": utilization,
	})
}

func UpdateDeviceStatus(body *model.DeviceStatusBody) model.ApiResponse {
	topology, err := getLatestTopology()
	if err != nil {
		return utils.ServerError(err.Error())
	}
	for i := range topology.Devices {
		if topology.Devices[i].Id == body.DeviceId {
			topology.Devices[i].Status = body.Status
			return updateDataBase(topology, "device_status", body.DeviceId, "设备状态更新成功",
				fmt.Sprintf("设备状态更新: %s -> %s", body.DeviceId, body.Status))
		}
	}
	return utils.NotFound(fmt.Sprintf("设备不存在: %s", body.DeviceId))
}

func UpdateLinkStatus(body *model.LinkStatusBody) model.ApiResponse {
	topology, err := getLatestTopology()
	if err != nil {
		return utils.ServerError(err.Error())
	}
	for i := range topology.Links {
		if topology.Links[i].Id == body.LinkId {
			topology.Links[i].Status = body.Status
			return updateDataBase(topology, "link_status", body.LinkId, "链路状态更新成功",
				fmt.Sprintf("链路状态更新: %s -> %s", body.LinkId, body.Status))
		}
	}
	return utils.NotFound(fmt.Sprintf("链路不存在: %s", body.LinkId))
}

func UpdateInterfaceStatus(body *model.InterfaceStatusBody) model.ApiResponse {
	topology, err := getLatestTopology()
	if err != nil {
		return utils.ServerError(err.Error())
	}
	for i := range topology.Devices {
		if topology.Devices[i].Id != body.DeviceId {
			continue
		}
		for j := range topology.Devices[i].Interfaces {
			if topology.Devices[i].Interfaces[j]["name"] == body.Port {
				topology.Devices[i].Interfaces[j]["status"] = body.Status
				return updateDataBase(topology, "interface_status", body.DeviceId, "接口状态更新成功",
					fmt.Sprintf("接口状态更新: %s -> %s", body.DeviceId, body.Status))
			}
		}
	}
	return utils.NotFound(fmt.Sprintf("接口不存在: %s", body.Port))
}

func ConfigureVlan(body *model.VlanBody) model.ApiResponse {
	topology, err := getLatestTopology()
	if err != nil {
		return utils.ServerError(err.Error())
	}
	for i := range topology.Devices {
		if topology.Devices[i].Id != body.DeviceId {
			continue
		}
		for j := range topology.Devices[i].Interfaces {
			if topology.Devices[i].Interfaces[j]["name"] != body.Port {
				continue
			}
			interfaceConfig := topology.Devices[i].Interfaces[j]
			interfaceConfig["mode"] = body.Mode
			if body.Mode == "access" {
				interfaceConfig["vlans"] = body.Vlans[0]
			}
			if body.Mode == "trunk" {
				interfaceConfig["vlans"] = body.Vlans
			}
			return updateDataBase(topology, "vlan_configure", body.DeviceId, "VLAN 配置成功", "VLAN 已更新")
		}
	}
	return utils.NotFound("接口不存在")
}

func LoadBalance(body *model.LoadBalanceBody) model.ApiResponse {
	topology, err := getLatestTopology()
	if err != nil {
		return utils.ServerError(err.Error())
	}
	graph := BuildForwardingGraph(topology)
	path, cost := dijkstraEcmp(graph, body.SourceId, body.TargetId)

	if path == nil {
		return utils.NotFound("路径不可达")
	}
	return utils.Success("success", map[string]interface{}{
		"path": path,
		"cost": cost,
	})
}

func UpdateOspfCost(body *model.OspfCostBody) model.ApiResponse {
	topology, err := getLatestTopology()
	if err != nil {
		return utils.ServerError(err.Error())
	}
	for i := range topology.Links {
		if topology.Links[i].Id != body.LinkId {
			continue
		}
		topology.Links[i].OspfCost = &body.Cost
		return updateDataBase(topology, "ospf_cost", body.LinkId, "OSPF Cost 更新成功",
			fmt.Sprintf("OSPF Cost 更新: %s -> %d", body.LinkId, body.Cost))
	}
	return utils.NotFound(fmt.Sprintf("链路不存在: %s", body.LinkId))
}

func PeakTrafficStart(body *model.PeakTrafficStartBody) model.ApiResponse {
	topology, err := getLatestTopology()
	if err != nil {
		return utils.ServerError(err.Error())
	}
	intensityMbps := body.FlowIntensity
	if intensityMbps <= 0 {
		intensityMbps = 1000
	}

	graph := BuildForwardingGraph(topology)
	path, _ := dijkstra(graph, body.SourceId, body.TargetId)
	if path == nil {
		return utils.NotFound("路径不可达")
	}
	StartPeakTraffic(body.SourceId, body.TargetId, intensityMbps, path)
	_ = repository.CreateLog("peak_start", body.SourceId, fmt.Sprintf("高峰流量模拟开启: %s -> %s, 强度 %.2f Mbps", body.SourceId, body.TargetId, intensityMbps))

	return PeakTrafficData()
}

func PeakTrafficStop() model.ApiResponse {
	StopPeakTraffic()
	_ = repository.CreateLog("peak_stop", "-", "高峰流量模拟关闭")
	return utils.Success("success", map[string]interface{}{
		"running": false,
	})
}

func PeakTrafficData() model.ApiResponse {
	topology, _ := getLatestTopology()
	updatePeakTrafficMetrics(topology)
	return utils.Success("success", peakTrafficState)
}

func SmartRoute(body *model.SmartRouteBody) model.ApiResponse {
	nsga2Response := NSGA2Service(body)

	if nsga2Response.Code != 200 {
		return nsga2Response
	}

	solutions, ok := nsga2Response.Data.(map[string]interface{})["solutions"].([]map[string]interface{})
	if !ok || len(solutions) == 0 {
		return utils.NotFound("未能找到 NSGA-II 算法的解决方案")
	}
	_ = repository.CreateLog("smart_route", "-", fmt.Sprintf("NSGA-II 算法路由完成: %s -> %s", body.SourceId, body.TargetId))
	return utils.Success("success", map[string]interface{}{
		"solutions": solutions,
	})
}
