package service

import (
	"container/heap"
	"math"
)

func dijkstraEcmp(graph map[string]map[string]int, start, end string) ([][]string, int) {
	if _, ok := graph[start]; !ok {
		return nil, -1
	}
	dist := make(map[string]int)
	paths := make(map[string][][]string)
	visited := make(map[string]bool)
	for node := range graph {
		dist[node] = math.MaxInt
	}
	pq := &PriorityQueue{{node: start, dist: 0}}
	dist[start] = 0
	paths[start] = [][]string{{start}}
	for pq.Len() > 0 {
		cur := heap.Pop(pq).(*Item)
		u := cur.node
		if visited[u] {
			continue
		}
		visited[u] = true
		for v, w := range graph[u] {
			newDist := dist[u] + w
			if newDist < dist[v] {
				dist[v] = newDist
				paths[v] = make([][]string, 0)
				for _, p := range paths[u] {
					newPath := append([]string{}, p...)
					newPath = append(newPath, v)
					paths[v] = append(paths[v], newPath)
				}
				heap.Push(pq, &Item{node: v, dist: newDist})
			} else if newDist == dist[v] {
				for _, p := range paths[u] {
					newPath := append([]string{}, p...)
					newPath = append(newPath, v)
					paths[v] = append(paths[v], newPath)
				}
			}
		}
	}

	if dist[end] == math.MaxInt {
		return nil, -1
	}

	return paths[end], dist[end]
}
