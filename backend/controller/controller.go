package controller

import (
	"backend/model"
	"backend/service"
	"backend/utils"
	"net/http"

	"github.com/gin-gonic/gin"
)

func UploadTopology(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
	}

	result, err := service.UploadTopology(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest(err.Error()))
		return
	}

	c.JSON(http.StatusOK, result)
}

func Ping(c *gin.Context) {
	var body model.PingBody

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest("参数错误"))
		return
	}

	result := service.Ping(&body)
	c.JSON(http.StatusOK, utils.Success(result.Message, result.Data))
}

func Traceroute(c *gin.Context) {
	var body model.TracerouteBody

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest("参数错误"))
		return
	}

	result := service.Traceroute(&body)
	c.JSON(http.StatusOK, utils.Success(result.Message, result.Data))
}

func UpdateDeviceStatus(c *gin.Context) {
	var body model.DeviceStatusBody

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest("参数错误"))
		return
	}

	result := service.UpdateDeviceStatus(&body)
	c.JSON(http.StatusOK, utils.Success(result.Message, result.Data))
}

func UpdateLinkStatus(c *gin.Context) {
	var body model.LinkStatusBody

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest("参数错误"))
		return
	}

	result := service.UpdateLinkStatus(&body)
	c.JSON(http.StatusOK, utils.Success(result.Message, result.Data))
}

func UpdateInterfaceStatus(c *gin.Context) {
	var body model.InterfaceStatusBody

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest("参数错误"))
		return
	}

	result := service.UpdateInterfaceStatus(&body)
	c.JSON(http.StatusOK, utils.Success(result.Message, result.Data))
}

func ConfigureVlan(c *gin.Context) {
	var body model.VlanBody

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest("参数错误"))
		return
	}

	result := service.ConfigureVlan(&body)
	c.JSON(http.StatusOK, result)
}

func LoadBalance(c *gin.Context) {
	var body model.LoadBalanceBody

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest("参数错误"))
		return
	}

	result := service.LoadBalance(&body)
	c.JSON(http.StatusOK, utils.Success(result.Message, result.Data))
}

func UpdateOspfCost(c *gin.Context) {
	var body model.OspfCostBody

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest("参数错误"))
		return
	}

	result := service.UpdateOspfCost(&body)
	c.JSON(http.StatusOK, utils.Success(result.Message, result.Data))
}

func PeakTraffic(c *gin.Context) {
	var body model.PeakTrafficBody

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest("参数错误"))
		return
	}

	result := service.PeakTraffic(&body)
	c.JSON(http.StatusOK, utils.Success(result.Message, result.Data))
}

func SmartRoute(c *gin.Context) {
	var body model.SmartRouteBody

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, utils.BadRequest("参数错误"))
		return
	}

	result := service.SmartRoute(&body)
	c.JSON(http.StatusOK, utils.Success(result.Message, result.Data))
}

func GetLogs(c *gin.Context) {
	result := service.GetLogs()
	c.JSON(http.StatusOK, utils.Success(result.Message, result.Data))
}
