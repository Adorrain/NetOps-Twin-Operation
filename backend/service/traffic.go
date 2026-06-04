package service

import (
	"backend/model"
	"backend/utils"
	"math"
	"math/rand/v2"
)

const (
	peakPacketSizeBytes    = 1500
	peakUtilizationDelayMs = 2.0
)

var peakTraffic = &model.PeakTrafficState{}

var peakLinkUtilization = make(map[string]float64)

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
	peakLinkUtilization = make(map[string]float64)
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
				capacityMbps = 10000
			}
			rho := generatePoissonUtilization(peakTraffic.Intensity, capacityMbps)
			peakLinkUtilization[key] = rho
			delay := math.Round((rho/(1-rho+0.5))*peakUtilizationDelayMs*100) / 100
			if peakTraffic.Capacity == 0 || capacityMbps < peakTraffic.Capacity {
				peakTraffic.Capacity = capacityMbps
			}
			if rho > peakTraffic.Utilization {
				peakTraffic.Utilization = rho
			}
			peakTraffic.LinkDelay += delay
			peakTraffic.Links = append(
				peakTraffic.Links,
				map[string]any{
					"linkId":      link.Id,
					"utilization": math.Round(rho*10000) / 10000,
					"capacity":    math.Round(capacityMbps*100) / 100,
					"linkDelay":   delay,
				},
			)
			break
		}
	}
	peakTraffic.Capacity =
		math.Round(peakTraffic.Capacity*100) / 100
	peakTraffic.Utilization =
		math.Round(peakTraffic.Utilization*10000) / 10000
	peakTraffic.LinkDelay =
		math.Round(peakTraffic.LinkDelay*100) / 100
}
func calculatePathDelay(path []string, topology *model.TopologyData) float64 {
	if len(path) < 2 {
		return 0
	}

	var propagationDelay float64
	var transmissionDelay float64
	var processingDelay float64

	for i := 1; i < len(path); i++ {
		src := path[i-1]
		dst := path[i]
		propagationDelay += 0.1 + linkSeed(src, dst)*0.4
		bw := utils.GetLinkBandwidth(src, dst, topology)
		if bw <= 0 {
			bw = 1000
		}
		transmissionDelay += (float64(peakPacketSizeBytes) * 8) / (bw * 1e6) * 1000
		processingDelay += 0.08 + rand.Float64()*0.02
	}
	queueDelay := getPeakUtilizationDelay(path)
	jitter := rand.Float64() * 0.05
	totalDelay := propagationDelay + transmissionDelay + processingDelay + queueDelay + jitter
	return math.Round(totalDelay*100) / 100
}
func calculatePathUtilization(path []string) float64 {
	if len(path) < 2 {
		return 0
	}
	peakMaxRho := -1.0
	for i := 1; i < len(path); i++ {
		rho, ok := getPeakEdgeUtilization(path[i-1], path[i])
		if ok && rho > peakMaxRho {
			peakMaxRho = rho
		}
	}
	if peakMaxRho >= 0 {
		return math.Round(peakMaxRho*10000) / 100
	}
	return 0
}

func getPeakEdgeUtilization(a string, b string) (float64, bool) {

	if !peakTraffic.Running {
		return 0, false
	}
	key := linkStableKey(a, b)
	rho, ok := peakLinkUtilization[key]
	if !ok {
		return 0, false
	}
	return rho, true
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

func getPeakUtilizationDelay(path []string) float64 {
	if len(path) < 2 {
		return 0
	}
	var total float64
	for i := 1; i < len(path); i++ {
		rho, ok := getPeakEdgeUtilization(path[i-1], path[i])
		if !ok {
			continue
		}
		total += (rho / (1 - rho + 0.5)) * peakUtilizationDelayMs
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
