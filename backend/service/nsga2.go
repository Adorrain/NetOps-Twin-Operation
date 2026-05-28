package service

import (
	"backend/model"
	"backend/utils"
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
	case "delay":
		delayWeight = delaySceneDelayWeight
		costWeight = delaySceneCostWeight
		utilWeight = delaySceneUtilWeight
	case "cost":
		delayWeight = costSceneDelayWeight
		costWeight = costSceneCostWeight
		utilWeight = costSceneUtilWeight
	case "utilization":
		delayWeight = utilSceneDelayWeight
		costWeight = utilSceneCostWeight
		utilWeight = utilSceneUtilWeight
	}

	const populationSize = 100
	const generations = 50
	const mutationRate = 0.1
	population := generatePopulation(populationSize, body.SourceId, body.TargetId, topology, routingGraph)
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
			}
			sort.Slice(front, func(i, j int) bool { return front[i].CrowdingDistance > front[j].CrowdingDistance })
			remain := populationSize - len(newPop)
			newPop = append(newPop, front[:remain]...)
			break
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

func (a *Individual) Dominates(b *Individual) bool {
	if a.Delay > b.Delay || a.Cost > b.Cost || a.Utilization > b.Utilization {
		return false
	}
	return a.Delay < b.Delay || a.Cost < b.Cost || a.Utilization < b.Utilization
}

func generatePopulation(size int, start, end string, topology *model.TopologyData, routingGraph map[string]map[string]int) Population {
	paths := PathDFS(routingGraph, start, end, size*6)
	rand.Shuffle(len(paths), func(i, j int) {
		paths[i], paths[j] = paths[j], paths[i]
	})

	pop := make(Population, 0, size)
	for _, path := range paths {
		if !utils.PathSupportsVlan(topology, path) {
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
		return &Individual{Path: append([]string{}, p1.Path...)}, &Individual{Path: append([]string{}, p2.Path...)}
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
	alternativePaths := PathDFS(graph, ind.Path[i1], ind.Path[i2], 12)
	if len(alternativePaths) == 0 {
		return
	}
	rand.Shuffle(len(alternativePaths), func(i, j int) {
		alternativePaths[i], alternativePaths[j] = alternativePaths[j], alternativePaths[i]
	})
	for _, sub := range alternativePaths {
		newPath := append(append([]string{}, ind.Path[:i1]...), sub...)
		newPath = append(newPath, ind.Path[i2+1:]...)
		if utils.PathSupportsVlan(topology, newPath) && isSimplePath(newPath) {
			ind.Path = newPath
			return
		}
	}
}

func PathDFS(graph map[string]map[string]int, start string, end string, limit int) [][]string {
	var paths [][]string
	var dfs func(node string, path []string, visited map[string]bool)
	dfs = func(node string, path []string, visited map[string]bool) {
		if len(paths) >= limit {
			return
		}
		if node == end {
			paths = append(paths, append([]string{}, path...))
			return
		}
		visited[node] = true
		neighbors := make([]string, 0, len(graph[node]))
		for next := range graph[node] {
			neighbors = append(neighbors, next)
		}
		sort.Strings(neighbors)
		for _, next := range neighbors {
			if visited[next] {
				continue
			}
			dfs(next, append(path, next), visited)
		}
		visited[node] = false
	}
	dfs(start, []string{start}, map[string]bool{})
	return paths
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

func fastNonDominatedSort(pop Population) []Population {
	var fronts []Population
	// 支配集合 Sp
	sp := make(map[*Individual]Population)
	// 被支配数量 np
	np := make(map[*Individual]int)
	var firstFront Population
	// 第一阶段：计算支配关系
	for _, p := range pop {
		sp[p] = Population{}
		np[p] = 0
		for _, q := range pop {
			if p == q {
				continue
			}
			if p.Dominates(q) {
				sp[p] = append(sp[p], q)
			} else if q.Dominates(p) {
				np[p]++
			}
		}
		// 不被任何个体支配
		if np[p] == 0 {
			p.Rank = 0
			firstFront = append(firstFront, p)
		}
	}
	fronts = append(fronts, firstFront)
	// 第二阶段：生成后续 Pareto Front
	i := 0
	for i < len(fronts) {
		var nextFront Population
		for _, p := range fronts[i] {
			for _, q := range sp[p] {
				np[q]--
				if np[q] == 0 {
					q.Rank = i + 1
					nextFront = append(nextFront, q)
				}
			}
		}
		if len(nextFront) > 0 {
			fronts = append(fronts, nextFront)
		}
		i++
	}
	return fronts
}

func crowdingCalculation(front Population, w1, w2, w3 float64) {

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

func calculateObjective(ind *Individual, topology *model.TopologyData) {
	ind.Delay = calculatePathDelay(ind.Path, topology)
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
