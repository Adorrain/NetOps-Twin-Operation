package utils

import (
	"backend/model"
	"fmt"
	"strconv"
	"strings"
)

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
