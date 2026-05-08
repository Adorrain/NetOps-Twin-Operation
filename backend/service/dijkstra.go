package service

import (
	"container/heap"
	"math"
)

type Item struct {
	node string
	dist int
}

type PriorityQueue []*Item

func (pq PriorityQueue) Len() int { return len(pq) }

func (pq PriorityQueue) Less(i, j int) bool {
	return pq[i].dist < pq[j].dist
}

func (pq PriorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
}

func (pq *PriorityQueue) Push(x interface{}) {
	*pq = append(*pq, x.(*Item))
}

func (pq *PriorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	*pq = old[0 : n-1]
	return item
}

func dijkstra(graph map[string]map[string]int, start, end string) ([]string, int) {
	if _, ok := graph[start]; !ok {
		return nil, -1
	}
	dist := make(map[string]int)
	prev := make(map[string]string)
	visited := make(map[string]bool)
	for node := range graph {
		dist[node] = math.MaxInt
	}
	pq := &PriorityQueue{{node: start, dist: 0}}
	dist[start] = 0
	for pq.Len() > 0 {
		cur := heap.Pop(pq).(*Item)
		u := cur.node
		if visited[u] {
			continue
		}
		visited[u] = true
		if u == end {
			break
		}
		for v, w := range graph[u] {
			if !visited[v] && dist[u]+w < dist[v] {
				dist[v] = dist[u] + w
				prev[v] = u
				heap.Push(pq, &Item{node: v, dist: dist[v]})
			}
		}
	}
	if dist[end] == math.MaxInt {
		return nil, -1
	}
	var path []string
	for curr := end; curr != ""; curr = prev[curr] {
		path = append(path, curr)
		if curr == start {
			break
		}
	}
	for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
		path[i], path[j] = path[j], path[i]
	}
	return path, dist[end]
}
