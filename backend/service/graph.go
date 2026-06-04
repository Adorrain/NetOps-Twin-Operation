package service

import (
	"backend/model"
	"backend/utils"
)

func BuildForwardingGraph(topology *model.TopologyData) map[string]map[string]int {
	graph := make(map[string]map[string]int)
	online := make(map[string]struct{})

	for _, device := range topology.Devices {
		if device.Status == "up" || device.Status == "online" || device.Status == "active" {
			online[device.Id] = struct{}{}
		}
	}
	for _, link := range topology.Links {
		if link.Status != "up" && link.Status != "active" {
			continue
		}
		if _, ok := online[link.SrcDevice]; !ok {
			continue
		}
		if _, ok := online[link.DstDevice]; !ok {
			continue
		}
		srcInterfaceUp := false
		dstInterfaceUp := false
		for _, device := range topology.Devices {
			if device.Id == link.SrcDevice {
				for _, iface := range device.Interfaces {
					name, _ := iface["name"].(string)
					status, _ := iface["status"].(string)
					if name == link.SrcInterface && (status == "up") {
						srcInterfaceUp = true
						break
					}
				}
			}
			if device.Id == link.DstDevice {
				for _, iface := range device.Interfaces {
					name, _ := iface["name"].(string)
					status, _ := iface["status"].(string)
					if name == link.DstInterface && (status == "up") {
						dstInterfaceUp = true
						break
					}
				}
			}
		}
		if !srcInterfaceUp || !dstInterfaceUp {
			continue
		}
		weight := 0
		if link.OspfCost != nil && *link.OspfCost > 0 {
			weight = *link.OspfCost
		} else {
			weight = utils.CalculateCost(topology.OspfReferenceBandwidth, link.Bandwidth)
		}
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

// graph := map[string]map[string]int{
// 	"A": {"B": 2, "C": 5},
// 	"B": {"A": 2, "C": 1, "D": 4},
// 	"C": {"A": 5, "B": 1, "D": 1},
// 	"D": {"B": 4, "C": 1},
// }
