package model

type PingBody struct {
	SourceId string `json:"sourceId" binding:"required"`
	TargetId string `json:"targetId" binding:"required"`
}

type TracerouteBody struct {
	SourceId string `json:"sourceId" binding:"required"`
	TargetId string `json:"targetId" binding:"required"`
}

type SmartRouteBody struct {
	SourceId string `json:"sourceId" binding:"required"`
	TargetId string `json:"targetId" binding:"required"`
}

type DeviceStatusBody struct {
	DeviceId string `json:"deviceId" binding:"required"`
	Status   string `json:"status" binding:"required"`
}

type LinkStatusBody struct {
	Status string `json:"status" binding:"required"`
	LinkId string `json:"linkId" binding:"required"`
}

type InterfaceStatusBody struct {
	DeviceId string `json:"deviceId" binding:"required"`
	Port     string `json:"port" binding:"required"`
	Status   string `json:"status" binding:"required"`
}

type VlanBody struct {
	DeviceId string `json:"deviceId" binding:"required"`
	Port     string `json:"port" binding:"required"`
	Mode     string `json:"mode" binding:"required"`
	Vlans    []int  `json:"vlans" `
}
type LoadBalanceBody struct {
	SourceId string `json:"sourceId" binding:"required"`
	TargetId string `json:"targetId" binding:"required"`
}

type OspfCostBody struct {
	LinkId string `json:"linkId" binding:"required"`
	Cost   int    `json:"cost" binding:"required"`
}

type PeakTrafficBody struct {
	SourceIds    []string `json:"sourceIds" binding:"required"`
	TargetId     string   `json:"targetId" binding:"required"`
	TotalTraffic float64  `json:"totalTraffic" binding:"required"`
}

type Log struct {
	Operation string `json:"operation_type" yaml:"operation"`
	CreatedAt string `json:"createdAt" yaml:"createdAt"`
	Details   string `json:"details" yaml:"details"`
}

type Device struct {
	Id         string           `json:"id" yaml:"id"`
	Name       string           `json:"name" yaml:"name"`
	Role       string           `json:"role" yaml:"role"`
	DeviceType string           `json:"deviceType" yaml:"deviceType"`
	Ip         string           `json:"ip" yaml:"ip"`
	Netmask    string           `json:"netmask" yaml:"netmask"`
	Status     string           `json:"status" yaml:"status"`
	Ospf       map[string]any   `json:"ospf" yaml:"ospf"`
	Interfaces []map[string]any `json:"interfaces" yaml:"interfaces"`
}

type Link struct {
	Id           string `json:"id" yaml:"id"`
	SrcDevice    string `json:"srcDevice" yaml:"srcDevice"`
	DstDevice    string `json:"dstDevice" yaml:"dstDevice"`
	SrcInterface string `json:"srcInterface" yaml:"srcInterface"`
	DstInterface string `json:"dstInterface" yaml:"dstInterface"`
	Status       string `json:"status" yaml:"status"`
	Bandwidth    string `json:"bandwidth" yaml:"bandwidth"`
	OspfCost     *int   `json:"ospfCost" yaml:"ospfCost"`
}

type TopologyData struct {
	OspfReferenceBandwidth string   `json:"ospfReferenceBandwidth" yaml:"ospfReferenceBandwidth"`
	MaxCapacity            float64  `json:"maxCapacity" yaml:"maxCapacity"`
	Devices                []Device `json:"devices" yaml:"devices"`
	Links                  []Link   `json:"links" yaml:"links"`
}

type ApiResponse struct {
	Code    int    `json:"code"`
	Data    any    `json:"data"`
	Message string `json:"message"`
}
