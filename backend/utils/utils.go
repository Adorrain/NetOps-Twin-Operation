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

func normalizeVlans(value any) []int {
	switch v := value.(type) {
	case []int:
		return v
	case []any:
		vlans := make([]int, 0, len(v))
		for _, item := range v {
			switch n := item.(type) {
			case int:
				vlans = append(vlans, n)
			case float64:
				vlans = append(vlans, int(n))
			}
		}
		return vlans
	case int:
		return []int{v}
	case float64:
		return []int{int(v)}
	default:
		return nil
	}
}

func IsVlanAllowedOnLink(topology *model.TopologyData, a, b string) bool {
	var aVlans, bVlans []int
	for _, link := range topology.Links {
		var aIface, bIface string
		if link.SrcDevice == a && link.DstDevice == b {
			aIface = link.SrcInterface
			bIface = link.DstInterface
		} else if link.SrcDevice == b && link.DstDevice == a {
			aIface = link.DstInterface
			bIface = link.SrcInterface
		} else {
			continue
		}
		for _, d := range topology.Devices {
			if d.Id != a && d.Id != b {
				continue
			}
			for _, iface := range d.Interfaces {
				name, _ := iface["name"].(string)
				if d.Id == a && name == aIface {
					vlans := normalizeVlans(iface["vlans"])
					mode, _ := iface["mode"].(string)
					if strings.ToLower(mode) == "access" && len(vlans) > 0 {
						aVlans = vlans[:1]
					} else {
						aVlans = vlans
					}
				}
				if d.Id == b && name == bIface {
					vlans := normalizeVlans(iface["vlans"])
					mode, _ := iface["mode"].(string)
					if strings.ToLower(mode) == "access" && len(vlans) > 0 {
						bVlans = vlans[:1]
					} else {
						bVlans = vlans
					}
				}
			}
		}

		break
	}
	if len(aVlans) == 0 || len(bVlans) == 0 {
		return true
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

func PathSupportsVlan(topology *model.TopologyData, path []string) bool {
	for i := 0; i < len(path)-1; i++ {
		if !IsVlanAllowedOnLink(topology, path[i], path[i+1]) {
			return false
		}
	}
	return true
}

func GetLinkBandwidth(src string, dst string, topology *model.TopologyData) float64 {
	for _, link := range topology.Links {
		if (link.SrcDevice == src && link.DstDevice == dst) || (link.SrcDevice == dst && link.DstDevice == src) {
			bw := ParseBandwidth(link.Bandwidth)
			if bw > 0 {
				return bw
			}
			break
		}
	}
	return 0
}
func GetLinkCost(topology *model.TopologyData, src string, dst string) int {
	bw := GetLinkBandwidth(src, dst, topology)
	if bw <= 0 {
		return 0
	}
	reference := ParseBandwidth(topology.OspfReferenceBandwidth)
	if reference <= 0 {
		return 1
	}
	cost := int(reference / bw)
	if cost < 1 {
		return 1
	}
	return cost
}
