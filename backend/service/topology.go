package service

import (
	"backend/model"
	"backend/repository"
	"backend/utils"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"

	"gopkg.in/yaml.v3"
)

func replenishOspfCost(topology *model.TopologyData) {
	for i := range topology.Links {
		link := &topology.Links[i]
		if link.OspfCost == nil {
			cost := utils.CalculateCost(topology.OspfReferenceBandwidth, link.Bandwidth)
			link.OspfCost = &cost
		}
	}
}
func UploadTopology(fileHeader *multipart.FileHeader) (*model.TopologyData, error) {
	file, err := fileHeader.Open()
	if err != nil {
		return nil, fmt.Errorf("文件打开失败")
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("文件读取失败")
	}

	var topology model.TopologyData
	if err := yaml.Unmarshal(content, &topology); err != nil {
		return nil, fmt.Errorf("YAML解析失败")
	}

	if err := utils.CheckTopology(topology); err != nil {
		return nil, err
	}

	replenishOspfCost(&topology)

	data, _ := json.Marshal(topology)
	_ = repository.CreateSnapshot(string(data))

	// 记录日志
	_ = repository.CreateLog(
		"TopologyUpload",
		fileHeader.Filename,
		"上传拓扑配置",
	)

	return &topology, nil
}
