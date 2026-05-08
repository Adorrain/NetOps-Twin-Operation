package service

import (
	"backend/model"
	"backend/utils"
)

func BuildForwardingGraph(t *model.TopologyData) map[string]map[string]int {
	graph := make(map[string]map[string]int)
	online := make(map[string]struct{})

	for _, d := range t.Devices {
		if d.Status == "up" || d.Status == "online" || d.Status == "active" {
			online[d.Id] = struct{}{}
		}
	}
	for _, l := range t.Links {
		if l.Status != "up" {
			continue
		}
		if _, ok := online[l.SrcDevice]; !ok {
			continue
		}
		if _, ok := online[l.DstDevice]; !ok {
			continue
		}
		w := utils.CalculateCost(t.OspfReferenceBandwidth, l.Bandwidth)
		if w <= 0 {
			continue
		}
		if graph[l.SrcDevice] == nil {
			graph[l.SrcDevice] = make(map[string]int)
		}
		if graph[l.DstDevice] == nil {
			graph[l.DstDevice] = make(map[string]int)
		}
		if old, ok := graph[l.SrcDevice][l.DstDevice]; !ok || w < old {
			graph[l.SrcDevice][l.DstDevice] = w
		}
		if old, ok := graph[l.DstDevice][l.SrcDevice]; !ok || w < old {
			graph[l.DstDevice][l.SrcDevice] = w
		}
	}

	return graph
}
