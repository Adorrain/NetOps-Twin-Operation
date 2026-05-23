package service

import (
	"backend/model"
	"backend/utils"
	"fmt"
	"hash/fnv"
	"math"
	"math/rand/v2"
	"strconv"
	"strings"
	"sync"
	"time"
)

// metricSaltWindowSeconds 控制非高峰指标的慢变窗口。
const metricSaltWindowSeconds int64 = 30

// stableUnitFloat01 将字符串稳定映射到 [0,1) 浮点数。
func stableUnitFloat01(s string) float64 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return float64(h.Sum32()%1_000_000) / 1_000_000.0
}

// stableUnitFloat01Salted 在稳定哈希上叠加一个时间窗口盐值。
func stableUnitFloat01Salted(s string) float64 {
	salt := strconv.FormatInt(time.Now().Unix()/metricSaltWindowSeconds, 10)
	return stableUnitFloat01(s + "|" + salt)
}

// edgeStableKey 生成无向链路的稳定 key。
func edgeStableKey(a, b string) string {
	if a < b {
		return a + "|" + b
	}
	return b + "|" + a
}

// calculatePathDelay 计算路径 RTT，基础时延叠加高峰排队时延。
func calculatePathDelay(path []string) float64 {
	var totalBaseDelay float64
	for i := 0; i < len(path)-1; i++ {
		linkDelay := 0.1 + stableUnitFloat01(edgeStableKey(path[i], path[i+1]))*0.4
		totalBaseDelay += linkDelay
	}

	noise := stableUnitFloat01Salted(strings.Join(path, "->")) * 0.05
	extraOneWay := getPeakUtilizationDelayMsForPath(path)
	rtt := (totalBaseDelay + 0.6 + noise + extraOneWay) * 2
	return math.Round(rtt*100) / 100
}

// calculatePathUtilization 计算路径的瓶颈链路利用率。
func calculatePathUtilization(path []string, topology *model.TopologyData) float64 {
	if len(path) < 2 {
		return 0
	}

	var maxRho float64
	foundPeak := false
	for i := 0; i < len(path)-1; i++ {
		m, ok := getPeakEdgeData(path[i], path[i+1])
		if !ok {
			continue
		}
		foundPeak = true
		if m.Utilization > maxRho {
			maxRho = m.Utilization
		}
	}
	if foundPeak {
		return math.Round(maxRho*10000) / 100
	}

	roleByDevice := make(map[string]string, len(topology.Devices))
	for i := range topology.Devices {
		d := topology.Devices[i]
		roleByDevice[d.Id] = strings.ToLower(strings.TrimSpace(d.Role))
	}
	capMbpsByEdge := make(map[string]float64, len(topology.Links))
	for i := range topology.Links {
		l := topology.Links[i]
		capMbpsByEdge[edgeStableKey(l.SrcDevice, l.DstDevice)] = utils.ParseBandwidth(l.Bandwidth)
	}

	for i := 0; i < len(path)-1; i++ {
		a := path[i]
		b := path[i+1]
		key := edgeStableKey(a, b)

		roleA := roleByDevice[a]
		roleB := roleByDevice[b]
		role := roleA
		if roleA == "core" || roleB == "core" {
			role = "core"
		} else if roleA == "aggregation" || roleB == "aggregation" {
			role = "aggregation"
		} else if roleA == "terminal" || roleB == "terminal" {
			role = "terminal"
		} else {
			role = "access"
		}

		minBase, maxBase := 0.10, 0.20
		switch role {
		case "core":
			minBase, maxBase = 0.25, 0.45
		case "aggregation":
			minBase, maxBase = 0.18, 0.32
		case "terminal":
			minBase, maxBase = 0.03, 0.10
		}

		u := stableUnitFloat01(key)
		base := minBase + (maxBase-minBase)*u

		refCapMbps := 10_000.0
		cap := capMbpsByEdge[key]
		if cap <= 0 {
			cap = refCapMbps
		}
		f := math.Pow(refCapMbps/cap, 0.2)
		if f < 0.8 {
			f = 0.8
		}
		if f > 1.3 {
			f = 1.3
		}
		base *= f

		jitter := (stableUnitFloat01Salted(key) - 0.5) * 0.006
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

// peakLinkState 表示高峰流量模拟中的单条链路状态。
type peakLinkState struct {
	LinkId       string
	From         string
	To           string
	CapacityMbps float64
	Utilization  float64
}

// peakTrafficSimulator 保存当前高峰流量模拟的运行状态。
type peakTrafficSimulator struct {
	mu sync.RWMutex

	running       bool
	sourceId      string
	targetId      string
	intensityMbps float64
	path          []string

	linkStates []*peakLinkState
	byEdgeKey  map[string]*peakLinkState

	stopCh chan struct{}
}

// peakSim 是全局唯一的高峰流量模拟器。
var peakSim = &peakTrafficSimulator{}

const (
	peakPacketSizeBytes       = 1500
	peakPropagationDelayMs    = 0.2
	peakUtilizationDelayMs    = 2.0
	peakSimulationStep        = 1 * time.Second
	peakPoissonKnuthMaxLambda = 30
)

// peakEdgeKey 生成高峰模拟里使用的无向链路 key。
func peakEdgeKey(a, b string) string {
	if a < b {
		return a + "|" + b
	}
	return b + "|" + a
}

// buildPeakLinkStates 为路径上的每一跳构造高峰模拟链路状态。
func buildPeakLinkStates(topology *model.TopologyData, path []string) ([]*peakLinkState, error) {
	if len(path) < 2 {
		return nil, fmt.Errorf("路径长度不足")
	}

	states := make([]*peakLinkState, 0, len(path)-1)
	for i := 0; i < len(path)-1; i++ {
		from := path[i]
		to := path[i+1]
		var linkID string
		var capMbps float64

		for _, link := range topology.Links {
			if (link.SrcDevice == from && link.DstDevice == to) || (link.SrcDevice == to && link.DstDevice == from) {
				linkID = link.Id
				capMbps = utils.ParseBandwidth(link.Bandwidth)
				break
			}
		}

		if linkID == "" || capMbps <= 0 {
			return nil, fmt.Errorf("无法获取链路带宽: %s <-> %s", from, to)
		}

		states = append(states, &peakLinkState{
			LinkId:       linkID,
			From:         from,
			To:           to,
			CapacityMbps: capMbps,
			Utilization:  0,
		})
	}
	return states, nil
}

// start 启动一轮新的高峰流量模拟。
func (s *peakTrafficSimulator) start(sourceId, targetId string, intensityMbps float64, path []string, linkStates []*peakLinkState) {
	s.mu.Lock()
	defer s.mu.Unlock()

	stopCh := make(chan struct{})
	s.running = true
	s.sourceId = sourceId
	s.targetId = targetId
	s.intensityMbps = intensityMbps
	s.path = append([]string{}, path...)
	s.linkStates = linkStates
	s.byEdgeKey = make(map[string]*peakLinkState, len(linkStates))
	s.stopCh = stopCh

	for _, ls := range linkStates {
		s.byEdgeKey[peakEdgeKey(ls.From, ls.To)] = ls
	}

	go func() {
		ticker := time.NewTicker(peakSimulationStep)
		defer ticker.Stop()

		for {
			select {
			case <-stopCh:
				return
			case <-ticker.C:
				s.step()
			}
		}
	}()
}

// step 推进一个时间片并更新每条链路利用率。
func (s *peakTrafficSimulator) step() {
	dtSeconds := peakSimulationStep.Seconds()

	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running || len(s.linkStates) == 0 {
		return
	}

	incomingBits := generatePoissonArrivalBits(s.intensityMbps, dtSeconds)
	for _, ls := range s.linkStates {
		serviceBits := ls.CapacityMbps * 1_000_000 * dtSeconds
		servedBits := math.Min(serviceBits, incomingBits)
		ls.Utilization = servedBits / serviceBits
		incomingBits = servedBits
	}
}

// stop 停止当前高峰流量模拟。
func (s *peakTrafficSimulator) stop() bool {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return false
	}
	stopCh := s.stopCh
	s.running = false
	s.sourceId = ""
	s.targetId = ""
	s.intensityMbps = 0
	s.path = nil
	s.linkStates = nil
	s.byEdgeKey = nil
	s.stopCh = nil
	s.mu.Unlock()

	close(stopCh)
	return true
}

// Data 返回当前高峰模拟的聚合数据。
func (s *peakTrafficSimulator) Data() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if !s.running {
		return map[string]interface{}{
			"running": false,
		}
	}

	links := make([]map[string]interface{}, 0, len(s.linkStates))
	var bottleneck float64 = -1
	var maxRho float64
	var totalDelayMs float64

	for _, ls := range s.linkStates {
		if bottleneck < 0 || ls.CapacityMbps < bottleneck {
			bottleneck = ls.CapacityMbps
		}
		if ls.Utilization > maxRho {
			maxRho = ls.Utilization
		}
		linkDelayMs := peakPropagationDelayMs + (ls.Utilization * peakUtilizationDelayMs)
		totalDelayMs += linkDelayMs

		links = append(links, map[string]interface{}{
			"linkId":      ls.LinkId,
			"from":        ls.From,
			"to":          ls.To,
			"capacity":    ls.CapacityMbps,
			"utilization": ls.Utilization,
			"linkDelay":   linkDelayMs,
		})
	}

	return map[string]interface{}{
		"running":          true,
		"sourceId":         s.sourceId,
		"targetId":         s.targetId,
		"trafficIntensity": s.intensityMbps,
		"path":             append([]string{}, s.path...),
		"capacity":         bottleneck,
		"utilization":      maxRho,
		"linkDelay":        totalDelayMs,
		"links":            links,
	}
}

// peakEdgeData 是路径查询时使用的高峰链路简化视图。
type peakEdgeData struct {
	Utilization float64
}

// getPeakEdgeData 返回指定链路当前的高峰利用率。
func getPeakEdgeData(a, b string) (peakEdgeData, bool) {
	peakSim.mu.RLock()
	defer peakSim.mu.RUnlock()
	if !peakSim.running {
		return peakEdgeData{}, false
	}
	ls, ok := peakSim.byEdgeKey[peakEdgeKey(a, b)]
	if !ok {
		return peakEdgeData{}, false
	}
	return peakEdgeData{Utilization: ls.Utilization}, true
}

// getPeakUtilizationDelayMsForPath 计算路径在高峰状态下的排队时延增量。
func getPeakUtilizationDelayMsForPath(path []string) float64 {
	if len(path) < 2 {
		return 0
	}
	var total float64
	for i := 0; i < len(path)-1; i++ {
		m, ok := getPeakEdgeData(path[i], path[i+1])
		if !ok {
			continue
		}
		total += m.Utilization * peakUtilizationDelayMs
	}
	return total
}

// generatePoissonArrivalBits 按泊松分布生成一个时间片内的到达比特数。
func generatePoissonArrivalBits(intensityMbps float64, dtSeconds float64) float64 {
	meanBits := intensityMbps * 1_000_000 * dtSeconds
	meanPackets := meanBits / float64(peakPacketSizeBytes*8)
	packets := samplePoisson(meanPackets)
	return float64(packets) * float64(peakPacketSizeBytes*8)
}

// samplePoisson 采样一个泊松随机数。
func samplePoisson(lambda float64) int {
	if lambda <= peakPoissonKnuthMaxLambda {
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
