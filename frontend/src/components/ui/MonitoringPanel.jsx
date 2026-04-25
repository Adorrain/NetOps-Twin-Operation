import React, { useCallback, useMemo } from 'react'
import { Space, Table, Tag } from 'antd'
import {  DeviceStatus } from '../../types'
import { getVlans, getTopologyHealth } from '../../utils/utils'
import { judgeDeviceStatus } from '../../utils/deviceUtils'

const { Column } = Table

const MonitoringPanel = ({ networkTopology }) => {
  const devices = useMemo(() => (Array.isArray(networkTopology?.devices) ? networkTopology.devices : []), [networkTopology])
  const status = useMemo(() => getTopologyHealth(networkTopology), [networkTopology])

  const statusCounts = useMemo(() => {
    return {
      [DeviceStatus.ONLINE]: status.activeDevices,
      [DeviceStatus.OFFLINE]: status.offlineDevices,
      [DeviceStatus.WARNING]: status.issueDevices,
      [DeviceStatus.ERROR]: status.issueLinks,
      [DeviceStatus.MAINTENANCE]: status.maintenanceDevices,
    }
  }, [status])

  const getDeviceStatusValue = useCallback(
    (device) => {
      return judgeDeviceStatus(device?.status) || DeviceStatus.ONLINE
    },
    []
  )

  const getOspfArea = useCallback((device) => { return device?.ospf?.area}, [])

  const getVlan = useCallback((device) => {
    const vlans = getVlans(device)
    if (!vlans.length) return '-'
    return vlans.join(', ')
  }, [])

  const getStatusTagColor = useCallback((status) => {
    switch (status) {
      case DeviceStatus.ONLINE:
        return 'green'
      case DeviceStatus.WARNING:
        return 'gold'
      case DeviceStatus.ERROR:
        return 'red'
      case DeviceStatus.MAINTENANCE:
        return 'orange'
      case DeviceStatus.OFFLINE:
      default:
        return 'gray'
    }
  }, [])

  const getStatusText = useCallback((status) => {
    switch (status) {
      case DeviceStatus.ONLINE:
        return '在线'
      case DeviceStatus.WARNING:
        return '告警'
      case DeviceStatus.ERROR:
        return '故障'
      case DeviceStatus.MAINTENANCE:
        return '维护中'
      case DeviceStatus.OFFLINE:
      default:
        return '离线'
    }
  }, [])

  const tableData = useMemo(() => {
    return devices.map((device) => ({
      key: device.id,
      id: device.id,
      name: device.name,
      ip: device?.ip,
      netmask: device?.netmask,
      roleLabel: device?.role,
      status: getDeviceStatusValue(device),
      ospfArea: getOspfArea(device),
      vlan: getVlan(device),
    }))
  }, [devices, getDeviceStatusValue, getOspfArea, getVlan])

  return (
    <div
      style={{
        padding: 16,
        height: '100%',
        overflowY: 'auto',
        background: '#0b1220',
        color: '#e5e7eb',
      }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div>
            <Space wrap>
              <Tag color="green">在线 {statusCounts[DeviceStatus.ONLINE]}</Tag>
              <Tag color="gold">告警 {statusCounts[DeviceStatus.WARNING]}</Tag>
              <Tag color="red">故障 {statusCounts[DeviceStatus.ERROR]}</Tag>
              <Tag color="gray">离线 {statusCounts[DeviceStatus.OFFLINE]}</Tag>
              <Tag color="orange">维护 {statusCounts[DeviceStatus.MAINTENANCE]}</Tag>
              <Tag>
                活跃链路 {status.activeLinks}/{status.linkTotal}
              </Tag>
            </Space>
          </div>
        </div>

        <div style={{ minHeight: 0 }}>
          <Tag style={{ marginBottom: 8 }}>过滤结果 {tableData.length} 条</Tag>

          <Table
            size="small"
            rowKey="id"
            dataSource={tableData}
            pagination={{ pageSize: 10, showSizeChanger: false, position: ['topRight'] }}
            scroll={{ x: 980 }}
            style={{ background: '#0b1220' }}
          >
            <Column
              title="设备"
              dataIndex="name"
              key="name"
              width={220}
              render={(_, record) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{record.name || '-'}</span>
                  <span style={{ color: 'rgba(229,231,235,0.65)', fontFamily: 'monospace', fontSize: 12 }}>
                    id: {record.id}
                  </span>
                </div>
              )}
            />
            <Column
              title="IP"
              dataIndex="ip"
              key="ip"
              width={160}
              render={(text) => <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{text || '-'}</span>}
            />
            <Column
              title="子网掩码"
              dataIndex="netmask"
              key="netmask"
              width={170}
              render={(text) => <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{text || '-'}</span>}
            />
            <Column
              title="角色"
              dataIndex="roleLabel"
              key="roleLabel"
              width={140}
              render={(text) => <span style={{ color: '#cbd5e1' }}>{text || '-'}</span>}
            />
            <Column
              title="状态"
              dataIndex="status"
              key="status"
              width={120}
              render={(itemStatus) => (
                <Space size={0}>
                  <Tag color={getStatusTagColor(itemStatus)} style={{ minWidth: 60, textAlign: 'center' }}>
                    {getStatusText(itemStatus)}
                  </Tag>
                </Space>
              )}
              filters={[
                { text: '在线', value: DeviceStatus.ONLINE },
                { text: '告警', value: DeviceStatus.WARNING },
                { text: '故障', value: DeviceStatus.ERROR },
                { text: '维护中', value: DeviceStatus.MAINTENANCE },
                { text: '离线', value: DeviceStatus.OFFLINE },
              ]}
              onFilter={(value, record) => record.status === value}
            />
            <Column
              title="OSPF"
              dataIndex="ospfArea"
              key="ospfArea"
              width={140}
              render={(area) => (area === undefined || area === null ? <span style={{ color: '#94a3b8' }}>-</span> : `Area ${area}`)}
            />
            <Column
              title="VLAN"
              dataIndex="vlan"
              key="vlan"
              width={180}
              render={(text) => <span style={{ color: '#c4b5fd' }}>{text || '-'}</span>}
            />
          </Table>
        </div>
    </div>
  )
}

export default MonitoringPanel;
