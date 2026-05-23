package service

import (
	"backend/model"
	"backend/utils"
)

func BuildForwardingGraph(t *model.TopologyData) map[string]map[string]int {
	graph := make(map[string]map[string]int)
	online := make(map[string]struct{})

	for _, device := range t.Devices {
		if device.Status == "up" || device.Status == "online" || device.Status == "active" {
			online[device.Id] = struct{}{}
		}
	}
	for _, link := range t.Links {
		if link.Status != "up" && link.Status != "active" {
			continue
		}
		if _, ok := online[link.SrcDevice]; !ok {
			continue
		}
		if _, ok := online[link.DstDevice]; !ok {
			continue
		}
		weight := utils.CalculateCost(t.OspfReferenceBandwidth, link.Bandwidth)
		if weight <= 0 {
			continue
		}
		if graph[link.SrcDevice] == nil {
			graph[link.SrcDevice] = make(map[string]int)
		}
		if graph[link.DstDevice] == nil {
			graph[link.DstDevice] = make(map[string]int)
		}
		if old, ok := graph[link.SrcDevice][link.DstDevice]; !ok || weight < old {
			graph[link.SrcDevice][link.DstDevice] = weight
		}
		if old, ok := graph[link.DstDevice][link.SrcDevice]; !ok || weight < old {
			graph[link.DstDevice][link.SrcDevice] = weight
		}
	}

	return graph
}
