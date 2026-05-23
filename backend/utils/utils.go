package utils

import (
	"backend/model"
	"fmt"
	"strconv"
	"strings"
)

/*
检查拓扑是否合法
*/
func CheckTopology(topology model.TopologyData) error {
	if len(topology.Devices) == 0 {
		return fmt.Errorf("设备为空")
	}

	deviceIDs := make(map[string]struct{}, len(topology.Devices))
	for _, d := range topology.Devices {
		if d.Id == "" {
			return fmt.Errorf("设备ID不能为空")
		}
		deviceIDs[d.Id] = struct{}{}
	}

	for _, link := range topology.Links {
		if link.Id == "" {
			return fmt.Errorf("链接ID不能为空")
		}
		if link.SrcDevice == "" || link.DstDevice == "" {
			return fmt.Errorf("链接 %s srcDevice或dstDevice不能为空", link.Id)
		}
		if _, ok := deviceIDs[link.SrcDevice]; !ok {
			return fmt.Errorf("链接 %s 源设备 %s 不存在", link.Id, link.SrcDevice)
		}
		if _, ok := deviceIDs[link.DstDevice]; !ok {
			return fmt.Errorf("链接 %s 目标设备 %s 不存在", link.Id, link.DstDevice)
		}
	}

	return nil
}

/*
解析带宽，将G或者M转换为Mbps
*/
func ParseBandwidth(bandwidth string) float64 {
	bandwidth = strings.ToUpper(strings.TrimSpace(bandwidth))
	if strings.HasSuffix(bandwidth, "G") {
		mbps, err := strconv.ParseFloat(strings.TrimSuffix(bandwidth, "G"), 64)
		if err != nil {
			return 0
		}
		return mbps * 1000
	}
	if strings.HasSuffix(bandwidth, "M") {
		mbps, err := strconv.ParseFloat(strings.TrimSuffix(bandwidth, "M"), 64)
		if err != nil {
			return 0
		}
		return mbps
	}
	mbps, _ := strconv.ParseFloat(bandwidth, 64)
	return mbps
}

/*
计算链路带宽，当cost<1时，cost为1
*/
func CalculateCost(referenceBandwidth string, linkBandwidth string) int {
	reference := ParseBandwidth(referenceBandwidth)
	actual := ParseBandwidth(linkBandwidth)
	// fmt.Println(reference, actual)
	if reference <= 0 || actual <= 0 {
		return 1
	}
	cost := int(reference / actual)
	if cost < 1 {
		return 1
	}
	return cost
}

func LinkVlanCompatible(topology *model.TopologyData, a, b string) bool {
	var ifaceAName, ifaceBName string
	for i := range topology.Links {
		l := topology.Links[i]
		if l.SrcDevice == a && l.DstDevice == b {
			ifaceAName = l.SrcInterface
			ifaceBName = l.DstInterface
			break
		}
		if l.SrcDevice == b && l.DstDevice == a {
			ifaceAName = l.DstInterface
			ifaceBName = l.SrcInterface
			break
		}
	}

	var ifaceA map[string]any
	var ifaceB map[string]any
	for _, d := range topology.Devices {
		if d.Id == a {
			for _, iface := range d.Interfaces {
				if iface["name"] == ifaceAName {
					ifaceA = iface
					break
				}
			}
		}
		if d.Id == b {
			for _, iface := range d.Interfaces {
				if iface["name"] == ifaceBName {
					ifaceB = iface
					break
				}
			}
		}
	}

	allowedVlans := func(iface map[string]any) []int {
		if iface == nil {
			return nil
		}
		modeVal, _ := iface["mode"].(string)
		mode := strings.ToLower(strings.TrimSpace(modeVal))
		vlans, _ := iface["vlans"].([]int)
		if mode == "access" {
			if len(vlans) > 0 {
				return vlans[:1]
			}
			return nil
		}
		return vlans
	}

	aVlans := allowedVlans(ifaceA)
	bVlans := allowedVlans(ifaceB)
	if len(aVlans) == 0 || len(bVlans) == 0 {
		return true
	}
	if len(aVlans) > len(bVlans) {
		aVlans, bVlans = bVlans, aVlans
	}
	for _, v := range aVlans {
		for _, w := range bVlans {
			if v == w {
				return true
			}
		}
	}
	return false
}

func PathVlanCompatible(topology *model.TopologyData, path []string) bool {
	for i := 0; i < len(path)-1; i++ {
		if !LinkVlanCompatible(topology, path[i], path[i+1]) {
			return false
		}
	}
	return true
}
