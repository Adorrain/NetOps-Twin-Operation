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

func NSGA2Service(body *model.SmartRouteBody) model.ApiResponse {
	topology, err := getLatestTopology()
	if err != nil {
		return utils.ServerError(err.Error())
	}
	graph := BuildForwardingGraph(topology)

	const popSize = 100
	const generations = 50
	const mutationRate = 0.1
	population := generatePopulation(popSize, body.SourceId, body.TargetId, topology, graph)
	if len(population) == 0 {
		return utils.NotFound("无法生成初始种群")
	}

	for gen := 0; gen < generations; gen++ {
		fronts := fastNonDominatedSort(population)
		for _, front := range fronts {
			crowdingCalculation(front)
		}
		offspring := make(Population, 0, popSize)
		for len(offspring) < popSize {
			parents := selection(population, 2)
			c1, c2 := crossover(parents[0], parents[1])
			mutate(c1, graph, mutationRate)
			mutate(c2, graph, mutationRate)
			calculateObjective(c1, topology)
			calculateObjective(c2, topology)
			offspring = append(offspring, c1)
			if len(offspring) < popSize {
				offspring = append(offspring, c2)
			}
		}
		combined := append(population, offspring...)
		fronts = fastNonDominatedSort(combined)
		for _, front := range fronts {
			crowdingCalculation(front)
		}
		newPop := make(Population, 0, popSize)
		for _, front := range fronts {
			if len(newPop)+len(front) <= popSize {
				newPop = append(newPop, front...)
			} else {
				sort.Slice(front, func(i, j int) bool { return front[i].CrowdingDistance > front[j].CrowdingDistance })
				newPop = append(newPop, front[:popSize-len(newPop)]...)
				break
			}
		}
		population = newPop
	}
	fronts := fastNonDominatedSort(population)
	if len(fronts) == 0 {
		return utils.NotFound("无结果")
	}
	front := fronts[0]
	seen := map[string]bool{}
	result := []map[string]interface{}{}
	for _, ind := range front {
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

	scene := strings.ToLower(strings.TrimSpace(body.Scene))
	if scene != "" && len(result) > 0 {
		best := result[0]
		bestValue := math.Inf(1)
		for _, item := range result {
			if v, ok := item[scene].(float64); ok && v < bestValue {
				bestValue = v
				best = item
			}
		}
		if bestValue != math.Inf(1) {
			result = []map[string]interface{}{best}
		}
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

func generatePopulation(size int, start, end string, topology *model.TopologyData, graph map[string]map[string]int) Population {
	paths := PathDFS(graph, start, end, size*6)
	rand.Shuffle(len(paths), func(i, j int) {
		paths[i], paths[j] = paths[j], paths[i]
	})

	pop := make(Population, 0, size)
	for _, path := range paths {
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

func mutate(ind *Individual, graph map[string]map[string]int, rate float64) {
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
	altPaths := PathDFS(graph, ind.Path[i1], ind.Path[i2], 12)
	if len(altPaths) == 0 {
		return
	}
	rand.Shuffle(len(altPaths), func(i, j int) {
		altPaths[i], altPaths[j] = altPaths[j], altPaths[i]
	})
	for _, sub := range altPaths {
		newPath := append(append([]string{}, ind.Path[:i1]...), sub...)
		newPath = append(newPath, ind.Path[i2+1:]...)
		if isSimplePath(newPath) {
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
	sp := make(map[*Individual]Population)
	np := make(map[*Individual]int)
	var firstFront Population
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
		if np[p] == 0 {
			p.Rank = 0
			firstFront = append(firstFront, p)
		}
	}
	fronts = append(fronts, firstFront)
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

func crowdingCalculation(front Population) {
	n := len(front)
	for _, ind := range front {
		ind.CrowdingDistance = 0
	}

	sort.Slice(front, func(i, j int) bool { return front[i].Delay < front[j].Delay })
	delayMin := front[0].Delay
	delayMax := front[n-1].Delay
	front[0].CrowdingDistance = math.Inf(1)
	front[n-1].CrowdingDistance = math.Inf(1)
	if delayMax > delayMin {
		for i := 1; i < n-1; i++ {
			front[i].CrowdingDistance += (front[i+1].Delay - front[i-1].Delay) / (delayMax - delayMin)
		}
	}

	sort.Slice(front, func(i, j int) bool { return front[i].Cost < front[j].Cost })
	costMin := front[0].Cost
	costMax := front[n-1].Cost
	front[0].CrowdingDistance = math.Inf(1)
	front[n-1].CrowdingDistance = math.Inf(1)
	if costMax > costMin {
		for i := 1; i < n-1; i++ {
			front[i].CrowdingDistance += (front[i+1].Cost - front[i-1].Cost) / (costMax - costMin)
		}
	}

	sort.Slice(front, func(i, j int) bool { return front[i].Utilization < front[j].Utilization })
	utilMin := front[0].Utilization
	utilMax := front[n-1].Utilization
	front[0].CrowdingDistance = math.Inf(1)
	front[n-1].CrowdingDistance = math.Inf(1)
	if utilMax > utilMin {
		for i := 1; i < n-1; i++ {
			front[i].CrowdingDistance += (front[i+1].Utilization - front[i-1].Utilization) / (utilMax - utilMin)
		}
	}
}

func calculateObjective(ind *Individual, topology *model.TopologyData) {
	ind.Delay = calculateRouteTotalDelay(ind.Path, topology)
	ind.Cost = calculatePathCost(ind.Path, topology)
	ind.Utilization = calculateRouteMaxUtilization(ind.Path)
}

func calculatePathCost(path []string, topology *model.TopologyData) float64 {
	sum := 0.0
	for i := 0; i < len(path)-1; i++ {
		sum += float64(utils.GetLinkCost(topology, path[i], path[i+1]))
	}
	return sum
}
