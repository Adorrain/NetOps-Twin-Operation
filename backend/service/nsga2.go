package service

import (
	"backend/model"
	"backend/utils"
	"math"
	"math/rand"
	"sort"
	"strings"
)

type Individual struct {
	Path             []string
	Delay            float64
	Cost             float64
	Utilization      float64
	Rank             int
	CrowdingDistance float64
}

type Population []*Individual

const (
	defaultDelayWeight = 0.33
	defaultCostWeight  = 0.33
	defaultUtilWeight  = 0.33

	delaySceneDelayWeight = 0.5
	delaySceneCostWeight  = 0.25
	delaySceneUtilWeight  = 0.25

	costSceneDelayWeight = 0.25
	costSceneCostWeight  = 0.5
	costSceneUtilWeight  = 0.25

	utilSceneDelayWeight = 0.25
	utilSceneCostWeight  = 0.25
	utilSceneUtilWeight  = 0.5
)

// =========================
// 主函数
// =========================

func NSGA2Service(body *model.SmartRouteBody) model.ApiResponse {

	topology, err := getLatestTopology()
	if err != nil {
		return utils.ServerError(err.Error())
	}

	routingGraph := BuildForwardingGraph(topology)

	delayWeight := defaultDelayWeight
	costWeight := defaultCostWeight
	utilWeight := defaultUtilWeight

	switch strings.ToLower(strings.TrimSpace(body.Scene)) {
	case "delay", "latency":
		delayWeight = delaySceneDelayWeight
		costWeight = delaySceneCostWeight
		utilWeight = delaySceneUtilWeight
	case "cost":
		delayWeight = costSceneDelayWeight
		costWeight = costSceneCostWeight
		utilWeight = costSceneUtilWeight
	case "utilization", "load":
		delayWeight = utilSceneDelayWeight
		costWeight = utilSceneCostWeight
		utilWeight = utilSceneUtilWeight
	}

	const populationSize = 100
	const generations = 50
	const mutationRate = 0.1

	population := generateInitialPopulation(populationSize, body.SourceId, body.TargetId, topology, routingGraph)

	if len(population) == 0 {
		return utils.NotFound("无法生成初始种群")
	}

	for gen := 0; gen < generations; gen++ {

		fronts := fastNonDominatedSort(population)

		for _, front := range fronts {
			crowdingCalculation(front, delayWeight, costWeight, utilWeight)
		}

		offspring := make(Population, 0, populationSize)

		for len(offspring) < populationSize {

			parents := selection(population, 2)

			c1, c2 := crossover(parents[0], parents[1])

			mutate(c1, topology, routingGraph, mutationRate)
			mutate(c2, topology, routingGraph, mutationRate)

			calculateObjective(c1, topology)
			calculateObjective(c2, topology)

			offspring = append(offspring, c1)

			if len(offspring) < populationSize {
				offspring = append(offspring, c2)
			}
		}

		combined := append(population, offspring...)

		fronts = fastNonDominatedSort(combined)

		for _, front := range fronts {
			crowdingCalculation(front, delayWeight, costWeight, utilWeight)
		}

		newPop := make(Population, 0, populationSize)

		for _, front := range fronts {

			if len(newPop)+len(front) <= populationSize {
				newPop = append(newPop, front...)
			} else {

				sort.Slice(front, func(i, j int) bool {
					return front[i].CrowdingDistance > front[j].CrowdingDistance
				})

				remain := populationSize - len(newPop)
				newPop = append(newPop, front[:remain]...)
				break
			}
		}

		population = newPop
	}

	finalFronts := fastNonDominatedSort(population)
	if len(finalFronts) == 0 {
		return utils.NotFound("无结果")
	}

	finalFront := finalFronts[0]

	seen := map[string]bool{}
	result := []map[string]interface{}{}

	for _, ind := range finalFront {

		key := strings.Join(ind.Path, "->")
		if seen[key] {
			continue
		}
		seen[key] = true

		result = append(result, map[string]interface{}{
			"path":        ind.Path,
			"delay":       ind.Delay,
			"cost":        ind.Cost,
			"utilization": ind.Utilization,
		})
	}

	return utils.Success("OK", map[string]interface{}{
		"solutions": result,
	})
}

// =========================
// 支配关系
// =========================

func (a *Individual) Dominates(b *Individual) bool {
	flag := false
	if a.Delay > b.Delay || a.Cost > b.Cost || a.Utilization > b.Utilization {
		return false
	}

	if a.Delay < b.Delay {
		flag = true
	}
	if a.Cost < b.Cost {
		flag = true
	}
	if a.Utilization < b.Utilization {
		flag = true
	}

	return flag
}

// =========================
// 初始化种群（极简版）
// =========================

func generateInitialPopulation(size int, start, end string, topology *model.TopologyData, routingGraph map[string]map[string]int) Population {
	paths := collectPathsDFS(routingGraph, start, end, size*6)
	rand.Shuffle(len(paths), func(i, j int) {
		paths[i], paths[j] = paths[j], paths[i]
	})

	pop := make(Population, 0, size)
	for _, path := range paths {
		if !utils.PathVlanCompatible(topology, path) {
			continue
		}
		ind := &Individual{Path: path}
		calculateObjective(ind, topology)
		pop = append(pop, ind)
		if len(pop) == size {
			break
		}
	}
	return pop
}

// =========================
// 选择
// =========================

func selection(pop Population, k int) Population {

	res := make(Population, k)

	for i := 0; i < k; i++ {

		a := pop[rand.Intn(len(pop))]
		b := pop[rand.Intn(len(pop))]

		if a.Rank < b.Rank {
			res[i] = a
		} else if b.Rank < a.Rank {
			res[i] = b
		} else if a.CrowdingDistance > b.CrowdingDistance {
			res[i] = a
		} else {
			res[i] = b
		}
	}

	return res
}

// =========================
// crossover（已简化）
// =========================

func crossover(p1, p2 *Individual) (*Individual, *Individual) {

	common := map[string]bool{}

	for i := 1; i < len(p1.Path)-1; i++ {
		common[p1.Path[i]] = true
	}

	var nodes []string

	for i := 1; i < len(p2.Path)-1; i++ {
		if common[p2.Path[i]] {
			nodes = append(nodes, p2.Path[i])
		}
	}

	if len(nodes) == 0 {
		return &Individual{Path: append([]string{}, p1.Path...)},
			&Individual{Path: append([]string{}, p2.Path...)}
	}

	node := nodes[rand.Intn(len(nodes))]

	i1, i2 := 0, 0

	for i, n := range p1.Path {
		if n == node {
			i1 = i
			break
		}
	}

	for i, n := range p2.Path {
		if n == node {
			i2 = i
			break
		}
	}

	c1 := append(append([]string{}, p1.Path[:i1+1]...), p2.Path[i2+1:]...)
	c2 := append(append([]string{}, p2.Path[:i2+1]...), p1.Path[i1+1:]...)

	return &Individual{Path: c1}, &Individual{Path: c2}
}

// =========================
// mutate（极简版）
// =========================

func mutate(ind *Individual, topology *model.TopologyData, graph map[string]map[string]int, rate float64) {

	if rand.Float64() > rate || len(ind.Path) < 4 {
		return
	}

	i1 := rand.Intn(len(ind.Path)-2) + 1
	i2 := rand.Intn(len(ind.Path)-2) + 1

	if i1 > i2 {
		i1, i2 = i2, i1
	}

	if i1 == i2 {
		return
	}

	oldSub := append([]string{}, ind.Path[i1:i2+1]...)
	subPaths := collectPathsDFS(graph, ind.Path[i1], ind.Path[i2], 12)
	if len(subPaths) == 0 {
		return
	}

	rand.Shuffle(len(subPaths), func(i, j int) {
		subPaths[i], subPaths[j] = subPaths[j], subPaths[i]
	})

	for _, sub := range subPaths {
		if samePath(sub, oldSub) {
			continue
		}

		newPath := append(append([]string{}, ind.Path[:i1]...), sub...)
		newPath = append(newPath, ind.Path[i2+1:]...)

		if utils.PathVlanCompatible(topology, newPath) && isSimplePath(newPath) {
			ind.Path = newPath
			return
		}
	}
}

func collectPathsDFS(graph map[string]map[string]int, start, end string, limit int) [][]string {
	var paths [][]string
	type state struct {
		node    string
		path    []string
		visited map[string]bool
	}

	stack := []state{
		{
			node:    start,
			path:    []string{start},
			visited: map[string]bool{start: true},
		},
	}

	for len(stack) > 0 && len(paths) < limit {
		cur := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		if cur.node == end {
			paths = append(paths, cur.path)
			continue
		}

		next := sortedNeighbors(graph, cur.node)
		for i := len(next) - 1; i >= 0; i-- {
			neighbor := next[i]
			if cur.visited[neighbor] {
				continue
			}

			nextPath := append(append([]string{}, cur.path...), neighbor)
			nextVisited := make(map[string]bool, len(cur.visited)+1)
			for node := range cur.visited {
				nextVisited[node] = true
			}
			nextVisited[neighbor] = true

			stack = append(stack, state{
				node:    neighbor,
				path:    nextPath,
				visited: nextVisited,
			})
		}
	}

	return paths
}

func sortedNeighbors(graph map[string]map[string]int, node string) []string {
	neighbors := make([]string, 0, len(graph[node]))
	for neighbor := range graph[node] {
		neighbors = append(neighbors, neighbor)
	}
	sort.Strings(neighbors)
	return neighbors
}

func samePath(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func isSimplePath(path []string) bool {
	seen := make(map[string]bool, len(path))
	for _, node := range path {
		if seen[node] {
			return false
		}
		seen[node] = true
	}
	return true
}

// =========================
// 非支配排序（不变）
// =========================

func fastNonDominatedSort(pop Population) []Population {

	indMap := map[*Individual]int{}

	for i, v := range pop {
		indMap[v] = i
	}

	var fronts []Population
	dom := make([]int, len(pop))
	dominated := make([][]int, len(pop))

	for i := range pop {
		for j := i + 1; j < len(pop); j++ {

			if pop[i].Dominates(pop[j]) {
				dominated[i] = append(dominated[i], j)
				dom[j]++
			} else if pop[j].Dominates(pop[i]) {
				dominated[j] = append(dominated[j], i)
				dom[i]++
			}
		}

		if dom[i] == 0 {
			pop[i].Rank = 0
			if len(fronts) == 0 {
				fronts = append(fronts, Population{})
			}
			fronts[0] = append(fronts[0], pop[i])
		}
	}

	k := 0

	for k < len(fronts) {

		var next Population

		for _, p := range fronts[k] {

			pIdx := indMap[p]

			for _, q := range dominated[pIdx] {

				dom[q]--

				if dom[q] == 0 {
					pop[q].Rank = k + 1
					next = append(next, pop[q])
				}
			}
		}

		if len(next) > 0 {
			fronts = append(fronts, next)
		}

		k++
	}

	return fronts
}

// =========================
// 拥挤度（简化版）
// =========================

func crowdingCalculation(front Population, w1, w2, w3 float64) {

	if len(front) <= 2 {
		for _, i := range front {
			i.CrowdingDistance = math.Inf(1)
		}
		return
	}

	for _, i := range front {
		i.CrowdingDistance = 0
	}

	sort.Slice(front, func(i, j int) bool { return front[i].Delay < front[j].Delay })
	for i := 1; i < len(front)-1; i++ {
		front[i].CrowdingDistance += w1 * (front[i+1].Delay - front[i-1].Delay)
	}

	sort.Slice(front, func(i, j int) bool { return front[i].Cost < front[j].Cost })
	for i := 1; i < len(front)-1; i++ {
		front[i].CrowdingDistance += w2 * (front[i+1].Cost - front[i-1].Cost)
	}

	sort.Slice(front, func(i, j int) bool { return front[i].Utilization < front[j].Utilization })
	for i := 1; i < len(front)-1; i++ {
		front[i].CrowdingDistance += w3 * (front[i+1].Utilization - front[i-1].Utilization)
	}
}

// =========================
// 目标函数
// =========================

func calculateObjective(ind *Individual, topology *model.TopologyData) {
	ind.Delay = calculatePathDelay(ind.Path)
	ind.Cost = calculatePathCost(ind.Path, topology)
	ind.Utilization = calculatePathUtilization(ind.Path, topology)
}

func calculatePathCost(path []string, topology *model.TopologyData) float64 {
	sum := 0.0
	for i := 0; i < len(path)-1; i++ {
		sum += float64(getLinkCost(topology, path[i], path[i+1]))
	}
	return sum
}

func getLinkCost(topology *model.TopologyData, from, to string) int {
	for i := range topology.Links {
		link := topology.Links[i]
		if link.Status != "up" && link.Status != "active" {
			continue
		}
		if (link.SrcDevice == from && link.DstDevice == to) || (link.SrcDevice == to && link.DstDevice == from) {
			if link.OspfCost != nil {
				return *link.OspfCost
			}
			return utils.CalculateCost(topology.OspfReferenceBandwidth, link.Bandwidth)
		}
	}
	return 0
}
