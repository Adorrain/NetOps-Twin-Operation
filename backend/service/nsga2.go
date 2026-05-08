package service

import (
	"backend/model"
	"backend/utils"
	"math"
	"math/rand"
	"sort"
)

// NSGA2Service 实现了用于网络优化的 NSGA-II 算法。
// 该函数接收一个 SmartRouteBody，其中包含源和目标 ID，然后返回一组在延迟、成本和利用率之间取得平衡的非支配解。
func NSGA2Service(body *model.SmartRouteBody) model.ApiResponse {
	topology, err := getLatestTopology()
	if err != nil {
		return utils.ServerError("获取最新拓扑数据失败: " + err.Error())
	}
	graph := BuildForwardingGraph(topology)

	const populationSize = 100 // 种群大小
	const generations = 50     // 迭代次数
	const mutationRate = 0.1   // 变异率

	// 1. 初始化种群
	population := generateInitialPopulation(populationSize, body.SourceId, body.TargetId, topology, graph)
	if len(population) == 0 {
		return utils.NotFound("无法生成初始种群，可能是因为源和目标之间没有路径")
	}

	// --- 主进化循环 ---
	for gen := 0; gen < generations; gen++ {
		// 2. 创建子代种群
		offspringPopulation := make(Population, 0, populationSize)
		for len(offspringPopulation) < populationSize {
			// a. 选择
			parents := tournamentSelection(population, 2)
			// b. 交叉
			offspring1, offspring2 := crossover(parents[0], parents[1])
			// c. 变异
			mutate(offspring1, graph, mutationRate)
			mutate(offspring2, graph, mutationRate)

			// d. 评估子代
			evaluateIndividual(offspring1, topology, graph)
			evaluateIndividual(offspring2, topology, graph)

			offspringPopulation = append(offspringPopulation, offspring1, offspring2)
		}

		// 3. 合并父代和子代种群
		combinedPopulation := append(population, offspringPopulation...)

		// 4. 执行非支配排序和拥挤度计算
		fronts := fastNonDominatedSort(combinedPopulation)
		for _, front := range fronts {
			crowdingDistanceAssignment(front)
		}

		// 5. 选择下一代种群
		newPopulation := make(Population, 0, populationSize)
		for _, front := range fronts {
			if len(newPopulation)+len(front) <= populationSize {
				newPopulation = append(newPopulation, front...)
			} else {
				// 按拥挤度降序排序
				sort.Slice(front, func(i, j int) bool {
					return front[i].CrowdingDistance > front[j].CrowdingDistance
				})
				remaining := populationSize - len(newPopulation)
				newPopulation = append(newPopulation, front[:remaining]...)
				break
			}
		}
		population = newPopulation
	}

	// --- 结果处理 ---
	// 迭代结束后，提取第一前沿（最终的非支配解集）
	finalFront := fastNonDominatedSort(population)[0]

	// 准备 API 响应
	resultPaths := make([]map[string]interface{}, len(finalFront))
	for i, ind := range finalFront {
		resultPaths[i] = map[string]interface{}{
			"path":        ind.Path,
			"delay":       ind.Delay,
			"cost":        ind.Cost,
			"utilization": ind.Utilization,
		}
	}

	return utils.Success("NSGA-II 算法执行成功", map[string]interface{}{
		"solutions": resultPaths,
	})
}

// Individual 代表 NSGA-II 算法中的一个个体，即一条网络路径及其性能指标。
type Individual struct {
	Path             []string // 路径节点列表
	Delay            float64  // 延迟
	Cost             float64  // 成本
	Utilization      float64  // 利用率
	Rank             int      // 非支配排序的等级
	CrowdingDistance float64  // 拥挤度
}

// Population 代表个体的集合。
type Population []*Individual

// Dominates 检查一个个体是否支配另一个个体。
// 如果个体 A 在至少一个目标上严格优于个体 B，且在其他目标上不差于 B，则 A 支配 B。
func (indA *Individual) Dominates(indB *Individual) bool {
	isBetterInAtLeastOne := indA.Delay < indB.Delay || indA.Cost < indB.Cost || indA.Utilization < indB.Utilization
	isNotWorseInAny := indA.Delay <= indB.Delay && indA.Cost <= indB.Cost && indA.Utilization <= indB.Utilization
	return isBetterInAtLeastOne && isNotWorseInAny
}

// Clone 创建并返回个体的深拷贝，确保路径切片是独立的。
func (ind *Individual) Clone() *Individual {
	clone := *ind
	clone.Path = make([]string, len(ind.Path))
	copy(clone.Path, ind.Path)
	return &clone
}

// --- 遗传算子 ---

// generateInitialPopulation 创建一个随机的初始种群。
// 为了多样性，这里可以采用 k-最短路径等方法，但为简化，我们重复使用 Dijkstra 算法。
func generateInitialPopulation(size int, start, end string, topology *model.TopologyData, graph map[string]map[string]int) Population {
	population := make(Population, 0, size)
	for i := 0; i < size; i++ {
		path, _ := dijkstra(graph, start, end)
		if path == nil {
			continue // 如果找不到路径，则跳过
		}

		individual := &Individual{Path: path}
		evaluateIndividual(individual, topology, graph)
		population = append(population, individual)
	}
	return population
}

// tournamentSelection 通过锦标赛方式从种群中选择优胜者。
func tournamentSelection(population Population, k int) Population {
	selected := make(Population, k)
	for i := 0; i < k; i++ {
		p1 := population[rand.Intn(len(population))]
		p2 := population[rand.Intn(len(population))]

		if p1.Rank < p2.Rank {
			selected[i] = p1
		} else if p2.Rank < p1.Rank {
			selected[i] = p2
		} else if p1.CrowdingDistance > p2.CrowdingDistance {
			selected[i] = p1
		} else {
			selected[i] = p2
		}
	}
	return selected
}

// crossover 执行两个父代路径的单点交叉，生成两个子代。
func crossover(parent1, parent2 *Individual) (*Individual, *Individual) {
	// 寻找共同的中间节点用于交叉
	commonNodes := findCommonIntermediateNodes(parent1.Path, parent2.Path)
	if len(commonNodes) == 0 {
		return parent1.Clone(), parent2.Clone() // 没有共同节点，无法交叉，返回克隆体
	}

	crossoverPoint := commonNodes[rand.Intn(len(commonNodes))]
	idx1 := findNodeIndex(parent1.Path, crossoverPoint)
	idx2 := findNodeIndex(parent2.Path, crossoverPoint)

	// 创建子代路径
	offspring1Path := append(parent1.Path[:idx1+1], parent2.Path[idx2+1:]...)
	offspring2Path := append(parent2.Path[:idx2+1], parent1.Path[idx1+1:]...)

	return &Individual{Path: offspring1Path}, &Individual{Path: offspring2Path}
}

// mutate 对个体的路径进行变异操作。
func mutate(individual *Individual, graph map[string]map[string]int, mutationRate float64) {
	if rand.Float64() > mutationRate || len(individual.Path) < 3 {
		return
	}

	// 随机选择两个不同的中间节点进行变异
	pathLen := len(individual.Path)
	idx1 := rand.Intn(pathLen-2) + 1
	idx2 := rand.Intn(pathLen-2) + 1
	for idx1 == idx2 {
		idx2 = rand.Intn(pathLen-2) + 1
	}
	if idx1 > idx2 {
		idx1, idx2 = idx2, idx1
	}

	mutStartNode := individual.Path[idx1]
	mutEndNode := individual.Path[idx2]

	// 在变异点之间寻找新的子路径
	if newSubPath, _ := dijkstra(graph, mutStartNode, mutEndNode); newSubPath != nil {
		// 拼接成新的完整路径
		newPath := append(individual.Path[:idx1], newSubPath...)
		newPath = append(newPath, individual.Path[idx2+1:]...)
		individual.Path = newPath
	}
}

// --- 排序和评估函数 ---

// fastNonDominatedSort 执行种群的非支配排序，返回分层的前沿列表。
func fastNonDominatedSort(population Population) []Population {
	// individualIndexMap 用于快速查找个体在种群中的索引，避免在循环中进行线性搜索。
	individualIndexMap := make(map[*Individual]int, len(population))
	for i, ind := range population {
		individualIndexMap[ind] = i
	}

	var fronts []Population
	dominationCount := make([]int, len(population))
	dominatedSet := make([][]int, len(population))

	// 遍历所有个体对，计算支配关系
	for i := 0; i < len(population); i++ {
		dominatedSet[i] = []int{}
		for j := i + 1; j < len(population); j++ {
			p := population[i]
			q := population[j]

			if p.Dominates(q) {
				dominatedSet[i] = append(dominatedSet[i], j)
				dominationCount[j]++
			} else if q.Dominates(p) {
				dominatedSet[j] = append(dominatedSet[j], i)
				dominationCount[i]++
			}
		}

		// 如果没有个体支配个体 i，则它属于第一前沿
		if dominationCount[i] == 0 {
			population[i].Rank = 0
			if len(fronts) == 0 {
				fronts = append(fronts, Population{})
			}
			fronts[0] = append(fronts[0], population[i])
		}
	}

	// 构建后续的前沿
	k := 0
	for k < len(fronts) {
		var nextFront Population
		// 遍历当前前沿中的每个个体 p
		for _, p := range fronts[k] {
			// 遍历 p 支配的每个个体 q
			p_idx := individualIndexMap[p] // O(1) 查找
			for _, q_idx := range dominatedSet[p_idx] {
				dominationCount[q_idx]--
				// 如果 q 的支配计数降为 0，则将其放入下一个前沿
				if dominationCount[q_idx] == 0 {
					q := population[q_idx]
					q.Rank = k + 1
					nextFront = append(nextFront, q)
				}
			}
		}
		k++
		if len(nextFront) > 0 {
			fronts = append(fronts, nextFront)
		}
	}

	return fronts
}

// crowdingDistanceAssignment 为一个前沿中的每个个体计算拥挤度。
func crowdingDistanceAssignment(front Population) {
	if len(front) <= 2 {
		for _, ind := range front {
			ind.CrowdingDistance = math.Inf(1)
		}
		return
	}

	for _, ind := range front {
		ind.CrowdingDistance = 0
	}

	objectives := []string{"delay", "cost", "utilization"}
	for _, obj := range objectives {
		sort.Slice(front, func(i, j int) bool {
			return getObjectiveValue(front[i], obj) < getObjectiveValue(front[j], obj)
		})

		front[0].CrowdingDistance = math.Inf(1)
		front[len(front)-1].CrowdingDistance = math.Inf(1)

		minVal := getObjectiveValue(front[0], obj)
		maxVal := getObjectiveValue(front[len(front)-1], obj)
		rangeVal := maxVal - minVal
		if rangeVal == 0 {
			continue
		}

		for i := 1; i < len(front)-1; i++ {
			front[i].CrowdingDistance += (getObjectiveValue(front[i+1], obj) - getObjectiveValue(front[i-1], obj)) / rangeVal
		}
	}
}

// --- 辅助函数 ---

// evaluateIndividual 计算并设置单个个体的所有目标函数值。
func evaluateIndividual(individual *Individual, topology *model.TopologyData, graph map[string]map[string]int) {
	individual.Delay = calculatePathDelay(individual.Path)
	individual.Cost = calculatePathCost(individual.Path, graph)
	individual.Utilization = calculatePathUtilization(individual.Path, topology)
}

// calculatePathCost 计算给定路径的总成本。
func calculatePathCost(path []string, graph map[string]map[string]int) float64 {
	var totalCost float64
	for i := 0; i < len(path)-1; i++ {
		totalCost += float64(graph[path[i]][path[i+1]])
	}
	return totalCost
}

// calculatePathDelay 根据跳数估算给定路径的总延迟。
func calculatePathDelay(path []string) float64 {
	return float64(len(path)-1) * 0.2 // 每跳 0.2 单位延迟
}

// calculatePathUtilization 估算给定路径的最大链路利用率。
func calculatePathUtilization(path []string, topology *model.TopologyData) float64 {
	var maxUtilization float64
	for i := 0; i < len(path)-1; i++ {
		for _, link := range topology.Links {
			if (link.SrcDevice == path[i] && link.DstDevice == path[i+1]) || (link.SrcDevice == path[i+1] && link.DstDevice == path[i]) {
				bw := utils.ParseBandwidth(link.Bandwidth)
				if bw > 0 {
					randomLoadFactor := 0.1 + rand.Float64()*0.6 // 模拟 10% 到 70% 的随机负载
					util := (bw * randomLoadFactor / bw) * 100
					if util > maxUtilization {
						maxUtilization = util
					}
				}
				break
			}
		}
	}
	return maxUtilization
}

// getObjectiveValue 根据目标名称返回个体的目标值。
func getObjectiveValue(ind *Individual, objective string) float64 {
	switch objective {
	case "delay":
		return ind.Delay
	case "cost":
		return ind.Cost
	case "utilization":
		return ind.Utilization
	default:
		return 0
	}
}

// findCommonIntermediateNodes 返回两个路径共有的中间节点列表。
func findCommonIntermediateNodes(path1, path2 []string) []string {
	commonNodes := []string{}
	nodesInPath1 := make(map[string]bool)
	if len(path1) > 2 {
		for _, node := range path1[1 : len(path1)-1] {
			nodesInPath1[node] = true
		}
	}
	if len(path2) > 2 {
		for _, node := range path2[1 : len(path2)-1] {
			if nodesInPath1[node] {
				commonNodes = append(commonNodes, node)
			}
		}
	}
	return commonNodes
}

// findNodeIndex 在路径中查找节点的索引。
func findNodeIndex(path []string, nodeToFind string) int {
	for i, node := range path {
		if node == nodeToFind {
			return i
		}
	}
	return -1
}
