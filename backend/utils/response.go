package utils

import (
	"backend/model"
	"net/http"
)

func Success(msg string, data any) model.ApiResponse {
	return model.ApiResponse{
		Code:    http.StatusOK,
		Message: msg,
		Data:    data,
	}
}

func BadRequest(msg string) model.ApiResponse {
	return model.ApiResponse{
		Code:    http.StatusBadRequest,
		Message: msg,
	}
}

func NotFound(msg string) model.ApiResponse {
	return model.ApiResponse{
		Code:    http.StatusNotFound,
		Message: msg,
	}
}

func ServerError(msg string) model.ApiResponse {
	return model.ApiResponse{
		Code:    http.StatusInternalServerError,
		Message: msg,
	}
}
