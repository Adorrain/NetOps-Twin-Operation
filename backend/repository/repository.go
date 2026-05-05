package repository

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

type TopologySnapshot struct {
	ID        uint   `gorm:"primaryKey"`
	Data      string `gorm:"type:json"`
	CreatedAt time.Time
}

type OperationLog struct {
	ID            uint   `gorm:"primaryKey"`
	OperationType string `gorm:"type:varchar(128)"`
	TriggerDevice string `gorm:"type:varchar(128)"`
	Details       string `gorm:"type:text"`
	CreatedAt     time.Time
}

var db *gorm.DB

func SetDB(d *gorm.DB) {
	db = d

	err := db.AutoMigrate(&TopologySnapshot{}, &OperationLog{})
	if err != nil {
		panic(err)
	}
}

func checkDB() error {
	if db == nil {
		return errors.New("数据库连接未初始化")
	}
	return nil
}

func CreateSnapshot(data string) error {
	if err := checkDB(); err != nil {
		return err
	}

	return db.Create(&TopologySnapshot{Data: data}).Error
}

func CreateLog(operationType, trigger, detail string) error {
	if err := checkDB(); err != nil {
		return err
	}

	return db.Create(&OperationLog{
		OperationType: operationType,
		TriggerDevice: trigger,
		Details:       detail,
	}).Error
}

func GetLatestSnapshot() (*TopologySnapshot, error) {
	if err := checkDB(); err != nil {
		return nil, err
	}

	var snapshot TopologySnapshot

	err := db.Order("created_at DESC").First(&snapshot).Error

	if err != nil {
		return nil, err
	}

	return &snapshot, nil
}

func GetLatestLog() (*OperationLog, error) {
	if err := checkDB(); err != nil {
		return nil, err
	}

	var log OperationLog

	err := db.Order("created_at DESC").First(&log).Error

	if err != nil {
		return nil, err
	}

	return &log, nil
}
