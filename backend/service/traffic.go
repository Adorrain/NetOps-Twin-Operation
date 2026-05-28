package service

import (
	"backend/model"
	"backend/utils"
	"math"
	"math/rand/v2"
	"strings"
)

const (
	peakPacketSizeBytes    = 1500
	peakUtilizationDelayMs = 2.0
)

var peakTraffic = &model.PeakTrafficState{}

func linkSeed(a, b string) float64 {
	if a > b {
		a, b = b, a
	}
	return float64(len(a+b)%10) / 10
}

func linkStableKey(a, b string) string {
	if a > b {
		a, b = b, a
	}
	return a + "|" + b
}

func StartPeakTraffic(sourceId string, targetId string, intensityMbps float64, path []string) {
	peakTraffic.Running = true
	peakTraffic.SourceId = sourceId
	peakTraffic.TargetId = targetId
	peakTraffic.Intensity = intensityMbps
	peakTraffic.Path = append([]string{}, path...)
}

func StopPeakTraffic() {
	peakTraffic = &model.PeakTrafficState{}
}

func updatePeakTrafficMetrics(topology *model.TopologyData) {
	peakTraffic.Capacity = 0
	peakTraffic.Utilization = 0
	peakTraffic.LinkDelay = 0
	peakTraffic.Links = nil
	if !peakTraffic.Running {
		return
	}

	for i := 1; i < len(peakTraffic.Path); i++ {
		key := linkStableKey(peakTraffic.Path[i-1], peakTraffic.Path[i])
		for _, link := range topology.Links {
			if linkStableKey(link.SrcDevice, link.DstDevice) != key {
				continue
			}
			capacityMbps := utils.ParseBandwidth(link.Bandwidth)
			if capacityMbps <= 0 {
				capacityMbps = 10_000
			}
			rho := generatePoissonUtilization(peakTraffic.Intensity, capacityMbps)
			delay := math.Round(rho*peakUtilizationDelayMs*100) / 100
			if peakTraffic.Capacity == 0 || capacityMbps < peakTraffic.Capacity {
				peakTraffic.Capacity = capacityMbps
			}
			if rho > peakTraffic.Utilization {
				peakTraffic.Utilization = rho
			}
			peakTraffic.LinkDelay += delay
			peakTraffic.Links = append(peakTraffic.Links, map[string]any{
				"linkId":      link.Id,
				"utilization": math.Round(rho*10000) / 10000,
				"capacity":    math.Round(capacityMbps*100) / 100,
				"linkDelay":   delay,
			})
			break
		}
	}
	peakTraffic.Capacity = math.Round(peakTraffic.Capacity*100) / 100
	peakTraffic.Utilization = math.Round(peakTraffic.Utilization*10000) / 10000
	peakTraffic.LinkDelay = math.Round(peakTraffic.LinkDelay*100) / 100
}

func calculatePathDelay(path []string, topology *model.TopologyData) float64 {
	var totalBaseDelay float64
	for i := 1; i < len(path); i++ {
		linkDelay := 0.1 + linkSeed(path[i-1], path[i])*0.4
		totalBaseDelay += linkDelay
	}
	noise := rand.Float64() * 0.05
	extraDelay := getPeakUtilizationDelay(path, topology)
	rtt := (totalBaseDelay + 0.6 + noise + extraDelay)
	return math.Round(rtt*100) / 100
}

func calculatePathUtilization(path []string, topology *model.TopologyData) float64 {
	if len(path) < 2 {
		return 0
	}
	peakMaxRho := -1.0
	for i := 1; i < len(path); i++ {
		rho, ok := getPeakEdgeUtilization(path[i-1], path[i], topology)
		if ok && rho > peakMaxRho {
			peakMaxRho = rho
		}
	}
	if peakMaxRho >= 0 {
		return math.Round(peakMaxRho*10000) / 100
	}
	// 普通模式
	maxRho := 0.0
	roleByDevice := make(map[string]string)
	for _, d := range topology.Devices {
		roleByDevice[d.Id] = strings.ToLower(strings.TrimSpace(d.Role))
	}
	capMbpsByEdge := make(map[string]float64)
	for _, l := range topology.Links {
		capMbpsByEdge[linkStableKey(l.SrcDevice, l.DstDevice)] = utils.ParseBandwidth(l.Bandwidth)
	}
	for i := 1; i < len(path); i++ {
		a := path[i-1]
		b := path[i]
		key := linkStableKey(a, b)
		roleA := roleByDevice[a]
		roleB := roleByDevice[b]
		role := "access"
		if roleA == "core" || roleB == "core" {
			role = "core"
		} else if roleA == "aggregation" || roleB == "aggregation" {
			role = "aggregation"
		} else if roleA == "terminal" || roleB == "terminal" {
			role = "terminal"
		}
		minBase := 0.10
		maxBase := 0.20
		switch role {
		case "core":
			minBase = 0.25
			maxBase = 0.45
		case "aggregation":
			minBase = 0.18
			maxBase = 0.32
		case "terminal":
			minBase = 0.03
			maxBase = 0.10
		}

		base := minBase + (maxBase-minBase)*linkSeed(a, b)
		capMbps := capMbpsByEdge[key]
		if capMbps <= 0 {
			capMbps = 10_000
		}
		base *= math.Pow(10_000/capMbps, 0.2)
		jitter := (rand.Float64() - 0.5) * 0.05
		rho := base + jitter
		if rho < 0.01 {
			rho = 0.01
		}
		if rho > 0.85 {
			rho = 0.85
		}
		if rho > maxRho {
			maxRho = rho
		}
	}
	return math.Round(maxRho*10000) / 100
}

func getPeakEdgeUtilization(a string, b string, topology *model.TopologyData) (float64, bool) {
	if !peakTraffic.Running {
		return 0, false
	}
	key := linkStableKey(a, b)
	for i := 1; i < len(peakTraffic.Path); i++ {
		if linkStableKey(peakTraffic.Path[i-1], peakTraffic.Path[i]) == key {
			for _, link := range topology.Links {
				if linkStableKey(link.SrcDevice, link.DstDevice) != key {
					continue
				}
				capacityMbps := utils.ParseBandwidth(link.Bandwidth)
				if capacityMbps <= 0 {
					return 0, false
				}
				return generatePoissonUtilization(peakTraffic.Intensity, capacityMbps), true
			}
			return 0, false
		}
	}
	return 0, false
}

func generatePoissonUtilization(intensityMbps float64, capacityMbps float64) float64 {
	meanPackets := intensityMbps * 1_000_000 / float64(peakPacketSizeBytes*8)
	packets := samplePoisson(meanPackets)
	bits := float64(packets) * float64(peakPacketSizeBytes*8)
	rho := bits / (capacityMbps * 1_000_000)
	jitter := (rand.Float64() - 0.5) * 0.05
	rho += jitter
	if rho < 0.01 {
		rho = 0.01
	}
	if rho > 0.95 {
		rho = 0.95
	}
	return rho
}

func getPeakUtilizationDelay(path []string, topology *model.TopologyData) float64 {
	if len(path) < 2 {
		return 0
	}
	var total float64
	for i := 1; i < len(path); i++ {
		rho, ok := getPeakEdgeUtilization(path[i-1], path[i], topology)
		if !ok {
			continue
		}
		total += rho * peakUtilizationDelayMs
	}
	return total
}

func samplePoisson(lambda float64) int {
	if lambda <= 30 {
		l := math.Exp(-lambda)
		k := 0
		p := 1.0
		for p > l {
			k++
			p *= rand.Float64()
		}
		return k - 1
	}
	n := lambda + math.Sqrt(lambda)*rand.NormFloat64()
	if n < 0 {
		return 0
	}
	return int(math.Round(n))
}
