import React, { useCallback, useMemo, useState } from 'react'
import { Button, ConfigProvider, Input, List, Select, Space, Table, Tag } from 'antd'
import {
  AimOutlined,
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../utils/appStore';
import { ConnectionStatus, DeviceStatus } from '../../types'
import { isLinkActive } from '../../utils/net'

const MonitoringPanel = () => {
  const { networkTopology, deviceStatuses, setSelectedDevice } = useAppStore()
  const navigate = useNavigate()

  const devices = useMemo(() => networkTopology?.devices || [], [networkTopology])
  const links = useMemo(() => networkTopology?.links || [], [networkTopology])

  // Data normalization
  const normalizeDeviceStatus = useCallback((status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'up' || s === 'active' || s === 'online') return DeviceStatus.ONLINE;
    if (s === 'down' || s === 'offline') return DeviceStatus.OFFLINE;
    if (s === 'warning') return DeviceStatus.WARNING;
    if (s === 'error') return DeviceStatus.ERROR;
    if (s === 'maintenance') return DeviceStatus.MAINTENANCE
    return DeviceStatus.ONLINE
  }, [])

  const statusCounts = useMemo(() => {
    const counts = {
      [DeviceStatus.ONLINE]: 0,
      [DeviceStatus.OFFLINE]: 0,
      [DeviceStatus.WARNING]: 0,
      [DeviceStatus.ERROR]: 0,
      [DeviceStatus.MAINTENANCE]: 0,
    };
    
    devices.forEach(device => {
      const status = normalizeDeviceStatus(deviceStatuses.get(device.id) || device.status || DeviceStatus.OFFLINE)
      if (counts[status] !== undefined) counts[status]++;
    })
    return counts
  }, [devices, deviceStatuses, normalizeDeviceStatus])

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const deviceRows = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    const filtered = statusFilter === 'all'
      ? devices
      : devices.filter((d) => normalizeDeviceStatus(deviceStatuses.get(d.id) || d.status || DeviceStatus.OFFLINE) === statusFilter)

    if (!q) return filtered

    return filtered.filter((d) => {
      const name = String(d.name || '').toLowerCase()
      const id = String(d.id || '').toLowerCase()
      const ip = String(d.ip ?? d.ipAddress ?? '').toLowerCase()
      const role = String(d.role ?? d.deviceType ?? '').toLowerCase()
      return name.includes(q) || id.includes(q) || ip.includes(q) || role.includes(q)
    })
  }, [query, statusFilter, devices, deviceStatuses, normalizeDeviceStatus])

  const ospfAreaOf = useCallback((device) => {
    const ospf = device.ospf || device.configuration?.ospf
    return ospf?.area
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

  const deviceAlarmItems = useMemo(() => {
    const items = []
    for (const d of devices) {
      const status = normalizeDeviceStatus(deviceStatuses.get(d.id) || d.status || DeviceStatus.OFFLINE)
      if (
        status !== DeviceStatus.WARNING &&
        status !== DeviceStatus.ERROR &&
        status !== DeviceStatus.OFFLINE
      ) continue

      const area = ospfAreaOf(d)
      const alarmLabel =
        status === DeviceStatus.WARNING
          ? '状态告警'
          : status === DeviceStatus.ERROR
            ? '状态故障'
            : '设备离线'
      const messageParts = [
        `${d.name || d.id} (${status})`,
        area !== undefined && area !== null ? `OSPF Area ${area}` : null,
      ].filter(Boolean)

      items.push({
        key: `dev-${d.id}`,
        kind: 'device',
        deviceId: d.id,
        severity: status,
        title: alarmLabel,
        message: messageParts.join(' / '),
      })
    }
    return items
  }, [devices, deviceStatuses, normalizeDeviceStatus, ospfAreaOf])

  const connectionAlarmItems = useMemo(() => {
    const items = []
    for (const link of links) {
      const status = String(link.status || '').toLowerCase()
      const isBad =
        status === ConnectionStatus.FAILED ||
        status === ConnectionStatus.DEGRADED ||
        status === 'down' ||
        status === 'failed' ||
        status === 'degraded'

      if (!isBad) continue

      const srcId = link.srcDevice || ''
      items.push({
        key: `link-${link.id || `${srcId}-${link.dstDevice || ''}`}`,
        kind: 'link',
        deviceId: srcId,
        severity: ConnectionStatus.FAILED,
        title: '链路告警',
        message: `${srcId || '-'} -> ${link.dstDevice || '-'} / 状态: ${link.status}`,
      })
    }
    return items
  }, [links])

  const alarmItems = useMemo(() => {
    // Data first: merge & keep device alarms above link alarms
    return [...deviceAlarmItems, ...connectionAlarmItems]
  }, [deviceAlarmItems, connectionAlarmItems])

  const activeLinkCount = useMemo(() => links.filter((link) => isLinkActive(link.status)).length, [links])
  const totalLinkCount = links.length

  const handleOpenDevice = useCallback(
    (deviceId) => {
      if (!deviceId) return
      setSelectedDevice(deviceId)
      navigate('/topology')
    },
    [setSelectedDevice, navigate]
  )

  const handleResetFilters = useCallback(() => {
    setQuery('')
    setStatusFilter('all')
  }, [])

  const openFirstAlarm = useCallback(() => {
    if (!alarmItems.length) return
    handleOpenDevice(alarmItems[0].deviceId)
  }, [alarmItems, handleOpenDevice])

  const deviceColumns = useMemo(() => {
    return [
      {
        title: '设备',
        dataIndex: 'name',
        key: 'name',
        width: 220,
        render: (_, record) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{record.name || '-'}</span>
            <span style={{ color: 'rgba(229,231,235,0.65)', fontFamily: 'monospace', fontSize: 12 }}>
              id: {record.id}
            </span>
          </div>
        ),
      },
      {
        title: 'IP',
        dataIndex: 'ip',
        key: 'ip',
        width: 160,
        render: (text) => <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{text || '-'}</span>,
      },
      {
        title: '角色',
        dataIndex: 'roleLabel',
        key: 'roleLabel',
        width: 140,
        render: (text) => <span style={{ color: '#cbd5e1' }}>{text || '-'}</span>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status) => (
          <Space size={0}>
            <Tag color={getStatusTagColor(status)} style={{ minWidth: 60, textAlign: 'center' }}>
              {getStatusText(status)}
            </Tag>
          </Space>
        ),
        filters: [
          { text: '在线', value: DeviceStatus.ONLINE },
          { text: '告警', value: DeviceStatus.WARNING },
          { text: '故障', value: DeviceStatus.ERROR },
          { text: '维护中', value: DeviceStatus.MAINTENANCE },
          { text: '离线', value: DeviceStatus.OFFLINE },
        ],
        onFilter: (value, record) => record.status === value,
      },
      {
        title: 'OSPF',
        dataIndex: 'ospfArea',
        key: 'ospfArea',
        width: 140,
        render: (area) => (area === undefined || area === null ? <span style={{ color: '#94a3b8' }}>-</span> : `Area ${area}`),
      },
      {
        title: '动作',
        key: 'actions',
        width: 180,
        render: (_, record) => (
          <Space>
            <Button size="small" onClick={() => handleOpenDevice(record.id)}>
              定位设备
            </Button>
          </Space>
        ),
      },
    ]
  }, [handleOpenDevice, getStatusTagColor, getStatusText])

  const tableData = useMemo(() => {
    return deviceRows.map((d) => {
      const status = normalizeDeviceStatus(deviceStatuses.get(d.id) || d.status || DeviceStatus.OFFLINE)
      const ospfArea = ospfAreaOf(d)
      const roleLabel = d.role || d.deviceType || 'unknown'
      const rawIp = d.ip ?? d.ipAddress ?? d.interfaces?.find((it) => it?.ip)?.ip
      const primaryIp = rawIp != null && rawIp !== '' ? String(rawIp).split('/')[0] : ''

      return {
        key: d.id,
        id: d.id,
        name: d.name,
        ip: primaryIp,
        roleLabel,
        status,
        ospfArea,
      }
    })
  }, [deviceRows, deviceStatuses, normalizeDeviceStatus, ospfAreaOf])

  const alarmSeveritySummary = useMemo(() => {
    const warn = alarmItems.filter((i) => i.kind === 'device' && i.severity === DeviceStatus.WARNING).length
    const err = alarmItems.filter((i) => i.kind === 'device' && i.severity === DeviceStatus.ERROR).length
    const link = alarmItems.filter((i) => i.kind === 'link').length
    return { warn, err, link }
  }, [alarmItems])

  return (
    <ConfigProvider
      theme={{
        token: {
          colorBgContainer: '#0b1220',
          colorBgElevated: '#0f172a',
          colorText: '#e5e7eb',
          colorTextSecondary: 'rgba(229,231,235,0.7)',
          colorBorderSecondary: '#1f2937',
        },
        components: {
          Table: {
            headerBg: '#0f172a',
            headerColor: '#e5e7eb',
            headerSplitColor: 'transparent',
            rowHoverBg: 'rgba(255,255,255,0.04)',
            borderColor: '#1f2937',
          },
        },
      }}
    >
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
                活跃链路 {activeLinkCount}/{totalLinkCount}
              </Tag>
            </Space>
            <div style={{ marginTop: 8, color: 'rgba(229,231,235,0.7)', fontSize: 12 }}>
              告警项 {alarmItems.length} 条 — 动作：点击右侧打开对应设备面板
            </div>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleResetFilters}>
              重置过滤
            </Button>
            <Button type="primary" icon={<AimOutlined />} onClick={openFirstAlarm} disabled={!alarmItems.length}>
              打开首条告警
            </Button>
          </Space>
        </div>

        <div style={{ display: 'flex', gap: 12, minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Space wrap>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索：设备名 / id / IP"
                  prefix={<SearchOutlined />}
                  style={{ width: 320 }}
                  allowClear
                />
                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  style={{ width: 180 }}
                  options={[
                    { value: 'all', label: '状态：全部' },
                    { value: DeviceStatus.ONLINE, label: '状态：在线' },
                    { value: DeviceStatus.WARNING, label: '状态：告警' },
                    { value: DeviceStatus.ERROR, label: '状态：故障' },
                    { value: DeviceStatus.MAINTENANCE, label: '状态：维护中' },
                    { value: DeviceStatus.OFFLINE, label: '状态：离线' },
                  ]}
                />
              </Space>
              <Tag>
                过滤结果 {tableData.length} 条 — 动作：使用“定位设备”
              </Tag>
            </div>

            <Table
              size="small"
              rowKey="id"
              dataSource={tableData}
              columns={deviceColumns}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              scroll={{ x: 980 }}
              style={{ background: '#0b1220' }}
            />
          </div>

          <div style={{ width: 380, minWidth: 380 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Space size={6}>
                <WarningOutlined />
                <span style={{ color: '#e5e7eb', fontWeight: 600 }}>
                  告警列表 {alarmItems.length} 条 — 动作：打开对应设备面板
                </span>
              </Space>
            </div>

            <Space wrap style={{ marginBottom: 10 }}>
              <Tag icon={<ExclamationCircleOutlined />} color="gold">设备告警 {alarmSeveritySummary.warn}</Tag>
              <Tag icon={<CloseCircleOutlined />} color="red">设备故障 {alarmSeveritySummary.err}</Tag>
              <Tag icon={<CheckCircleOutlined />} color="gray">链路告警 {alarmSeveritySummary.link}</Tag>
            </Space>

            <div style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 8, background: '#0b1220' }}>
              <List
                size="small"
                dataSource={alarmItems}
                locale={{ emptyText: '暂无告警项' }}
                renderItem={(item) => (
                  <List.Item style={{ padding: '8px 0', borderBottom: '1px solid rgba(31,41,55,0.8)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <Space size={8}>
                          {item.kind === 'device' ? (
                            <Tag color={getStatusTagColor(item.severity)}>{getStatusText(item.severity)}</Tag>
                          ) : (
                            <Tag color="red">链路</Tag>
                          )}
                          <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{item.title}</span>
                        </Space>
                      </div>
                      <div style={{ color: 'rgba(229,231,235,0.7)', fontSize: 12, lineHeight: 1.4 }}>
                        {item.message}
                      </div>
                      <div>
                        <Button size="small" onClick={() => handleOpenDevice(item.deviceId)} disabled={!item.deviceId}>
                          动作：打开面板
                        </Button>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </ConfigProvider>
  )
}

export default MonitoringPanel;
