package router

import (
	"backend/controller"

	"github.com/gin-gonic/gin"
)

func SetupRouter(r *gin.Engine) {
	topology := r.Group("/api")
	{
		topology.POST("/topology/upload", controller.UploadTopology)
	}
	simulation := r.Group("/api/ops")
	{
		simulation.POST("/ping", controller.Ping)
		simulation.POST("/traceroute", controller.Traceroute)
		simulation.POST("/device/status", controller.UpdateDeviceStatus)
		simulation.POST("/link/status", controller.UpdateLinkStatus)
		simulation.POST("/interface/status", controller.UpdateInterfaceStatus)
		simulation.POST("/vlan/configure", controller.ConfigureVlan)
		simulation.POST("/ospf/loadbalance", controller.LoadBalance)
		simulation.POST("/cost/update", controller.UpdateOspfCost)
		simulation.POST("/peak", controller.PeakTraffic)
		simulation.POST("/smart/route", controller.SmartRoute)
		simulation.GET("/logs", controller.GetLogs)
	}
}
