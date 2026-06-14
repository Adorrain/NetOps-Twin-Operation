package service

import (
	"backend/model"
	"backend/utils"
	"math"
	"math/rand/v2"
)

const (
	standardPacketByteSize = 1500
	fullLoadBaseDelayMs    = 2.0
)

var peakTrafficState = &model.PeakTrafficState{}

var linkCurrentUtilizationMap = make(map[string]float64)

func getLinkFixedSeed(deviceA, deviceB string) float64 {
	if deviceA > deviceB {
		deviceA, deviceB = deviceB, deviceA
	}
	return float64(len(deviceA+deviceB)%10) / 10
}

func generateLinkUniqueKey(deviceA, deviceB string) string {
	if deviceA > deviceB {
		deviceA, deviceB = deviceB, deviceA
	}
	return deviceA + "|" + deviceB
}

func StartPeakTraffic(sourceDevice string, targetDevice string, trafficIntensity float64, routePath []string) {
	peakTrafficState.Running = true
	peakTrafficState.SourceId = sourceDevice
	peakTrafficState.TargetId = targetDevice
	peakTrafficState.Intensity = trafficIntensity
	peakTrafficState.Path = append([]string{}, routePath...)
}

func StopPeakTraffic() {
	peakTrafficState = &model.PeakTrafficState{}
}

func updatePeakTrafficMetrics(topology *model.TopologyData) {
	peakTrafficState.Capacity = 0
	peakTrafficState.Utilization = 0
	peakTrafficState.LinkDelay = 0
	peakTrafficState.Links = nil
	linkCurrentUtilizationMap = make(map[string]float64)

	if !peakTrafficState.Running {
		return
	}
	for pathIndex := 1; pathIndex < len(peakTrafficState.Path); pathIndex++ {
		prevDevice := peakTrafficState.Path[pathIndex-1]
		currDevice := peakTrafficState.Path[pathIndex]
		linkUniqueKey := generateLinkUniqueKey(prevDevice, currDevice)
		for _, link := range topology.Links {
			linkKey := generateLinkUniqueKey(link.SrcDevice, link.DstDevice)
			if linkKey != linkUniqueKey {
				continue
			}
			linkBandwidthMbps := utils.ParseBandwidth(link.Bandwidth)
			if linkBandwidthMbps <= 0 {
				linkBandwidthMbps = 10000
			}
			linkUtilization := generatePoissonDistributionUtilization(peakTrafficState.Intensity, linkBandwidthMbps)
			linkCurrentUtilizationMap[linkUniqueKey] = linkUtilization
			linkQueueDelay := math.Round((linkUtilization/(1-linkUtilization+0.5))*fullLoadBaseDelayMs*100) / 100
			if peakTrafficState.Capacity == 0 || linkBandwidthMbps < peakTrafficState.Capacity {
				peakTrafficState.Capacity = linkBandwidthMbps
			}
			if linkUtilization > peakTrafficState.Utilization {
				peakTrafficState.Utilization = linkUtilization
			}
			peakTrafficState.LinkDelay += linkQueueDelay
			peakTrafficState.Links = append(
				peakTrafficState.Links,
				map[string]any{
					"linkId":      link.Id,
					"utilization": math.Round(linkUtilization*10000) / 10000,
					"capacity":    math.Round(linkBandwidthMbps*100) / 100,
					"linkDelay":   linkQueueDelay,
				},
			)
			break
		}
	}

	peakTrafficState.Capacity = math.Round(peakTrafficState.Capacity*100) / 100
	peakTrafficState.Utilization = math.Round(peakTrafficState.Utilization*10000) / 10000
	peakTrafficState.LinkDelay = math.Round(peakTrafficState.LinkDelay*100) / 100
}

func calculateRouteTotalDelay(routePath []string, topology *model.TopologyData) float64 {
	if len(routePath) < 2 {
		return 0
	}

	var propagationDelay float64
	var transmissionDelay float64
	var deviceProcessDelay float64

	for pathIndex := 1; pathIndex < len(routePath); pathIndex++ {
		srcDevice := routePath[pathIndex-1]
		dstDevice := routePath[pathIndex]
		propagationDelay += 0.1 + getLinkFixedSeed(srcDevice, dstDevice)*0.4
		linkBandwidth := utils.GetLinkBandwidth(srcDevice, dstDevice, topology)
		if linkBandwidth <= 0 {
			linkBandwidth = 1000
		}
		transmissionDelay += (float64(standardPacketByteSize) * 8) / (linkBandwidth * 1e6) * 1000
		deviceProcessDelay += 0.08 + rand.Float64()*0.02
	}
	queueCongestionDelay := getRoutePeakQueueDelay(routePath)
	delayJitter := rand.Float64() * 0.05
	totalDelay := propagationDelay + transmissionDelay + deviceProcessDelay + queueCongestionDelay + delayJitter
	return math.Round(totalDelay*100) / 100
}

func calculateRouteMaxUtilization(routePath []string) float64 {
	if len(routePath) < 2 {
		return 0
	}
	maxLinkUtilization := -1.0
	for pathIndex := 1; pathIndex < len(routePath); pathIndex++ {
		utilization, exists := getSingleLinkPeakUtilization(routePath[pathIndex-1], routePath[pathIndex])
		if exists && utilization > maxLinkUtilization {
			maxLinkUtilization = utilization
		}
	}
	if maxLinkUtilization >= 0 {
		return math.Round(maxLinkUtilization*10000) / 100
	}
	return 0
}

func getSingleLinkPeakUtilization(deviceA, deviceB string) (float64, bool) {
	if !peakTrafficState.Running {
		return 0, false
	}
	linkKey := generateLinkUniqueKey(deviceA, deviceB)
	utilization, exists := linkCurrentUtilizationMap[linkKey]
	return utilization, exists
}

func generatePoissonDistributionUtilization(trafficIntensity float64, linkBandwidth float64) float64 {
	averagePacketCount := trafficIntensity * 1_000_000 / float64(standardPacketByteSize*8)
	actualPacketCount := samplePoissonDistribution(averagePacketCount)
	totalTrafficBits := float64(actualPacketCount) * float64(standardPacketByteSize*8)
	utilizationRatio := totalTrafficBits / (linkBandwidth * 1_000_000)
	randomJitter := (rand.Float64() - 0.5) * 0.05
	utilizationRatio += randomJitter
	if utilizationRatio < 0.01 {
		utilizationRatio = 0.01
	}
	if utilizationRatio > 0.95 {
		utilizationRatio = 0.95
	}
	return utilizationRatio
}

func getRoutePeakQueueDelay(routePath []string) float64 {
	if len(routePath) < 2 {
		return 0
	}
	var totalQueueDelay float64
	for pathIndex := 1; pathIndex < len(routePath); pathIndex++ {
		utilization, exists := getSingleLinkPeakUtilization(routePath[pathIndex-1], routePath[pathIndex])
		if !exists {
			continue
		}
		totalQueueDelay += (utilization / (1 - utilization + 0.5)) * fullLoadBaseDelayMs
	}
	return totalQueueDelay
}

func samplePoissonDistribution(lambda float64) int {
	if lambda <= 30 {
		expLambda := math.Exp(-lambda)
		count := 0
		prob := 1.0
		for prob > expLambda {
			count++
			prob *= rand.Float64()
		}
		return count - 1
	}
	approxValue := lambda + math.Sqrt(lambda)*rand.NormFloat64()
	if approxValue < 0 {
		return 0
	}
	return int(math.Round(approxValue))
}
