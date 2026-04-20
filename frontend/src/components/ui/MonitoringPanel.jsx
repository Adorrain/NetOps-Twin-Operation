import React, { useCallback, useMemo, useState } from 'react'
import { ConfigProvider, Input, Select, Space, Table, Tag } from 'antd'
import {
  SearchOutlined,
} from '@ant-design/icons'
import { ConnectionStatus, DeviceStatus } from '../../types'
import { getAllVlans, isLinkActive } from '../../utils/utils'
import { normalizeDeviceStatus, getDeviceOspfConfig, getDevicePrimaryIpInfo } from '../../utils/deviceUtils'

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: '状态：全部' },
  { value: DeviceStatus.ONLINE, label: '状态：在线' },
  { value: DeviceStatus.WARNING, label: '状态：告警' },
  { value: DeviceStatus.ERROR, label: '状态：故障' },
  { value: DeviceStatus.MAINTENANCE, label: '状态：维护中' },
  { value: DeviceStatus.OFFLINE, label: '状态：离线' },
]

const MonitoringPanel = ({ networkTopology }) => {
  const devices = useMemo(() => networkTopology?.devices || [], [networkTopology])
  const links = useMemo(() => networkTopology?.links || [], [networkTopology])

  const DEVICE_STATUS_SET = useMemo(() => new Set(Object.values(DeviceStatus)), [])

  const statusCounts = useMemo(() => {
    const counts = {
      [DeviceStatus.ONLINE]: 0,
      [DeviceStatus.OFFLINE]: 0,
      [DeviceStatus.WARNING]: 0,
      [DeviceStatus.ERROR]: 0,
      [DeviceStatus.MAINTENANCE]: 0,
    };
    
    devices.forEach(device => {
      const status = normalizeDeviceStatus(device.status || DeviceStatus.OFFLINE)
      if (counts[status] !== undefined) counts[status]++;
    })
    return counts
  }, [devices, normalizeDeviceStatus])

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const getDeviceStatusValue = useCallback(
    (device) => {
      const normalized = normalizeDeviceStatus(device.status || DeviceStatus.OFFLINE)
      return DEVICE_STATUS_SET.has(normalized) ? normalized : DeviceStatus.ONLINE
    },
    [DEVICE_STATUS_SET]
  )

  const deviceRows = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    const filtered = statusFilter === 'all'
      ? devices
      : devices.filter((d) => getDeviceStatusValue(d) === statusFilter)

    if (!q) return filtered

    return filtered.filter((d) => {
      const name = String(d.name || '').toLowerCase()
      const id = String(d.id || '').toLowerCase()
      const ip = String(d.ip ?? d.ipAddress ?? '').toLowerCase()
      const role = String(d.role ?? d.deviceType ?? '').toLowerCase()
      return name.includes(q) || id.includes(q) || ip.includes(q) || role.includes(q)
    })
  }, [query, statusFilter, devices, getDeviceStatusValue])

  const ospfAreaOf = useCallback((device) => {
    const ospf = getDeviceOspfConfig(device)
    return ospf?.area
  }, [])

  const vlanTextOf = useCallback((device) => {
    const vlans = getAllVlans(device)
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

  const deviceAlarmItems = useMemo(() => {
    const items = []
    for (const d of devices) {
      const status = getDeviceStatusValue(d)
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
  }, [devices, getDeviceStatusValue, ospfAreaOf])

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
    return [...deviceAlarmItems, ...connectionAlarmItems]
  }, [deviceAlarmItems, connectionAlarmItems])

  const activeLinkCount = useMemo(() => links.filter((link) => isLinkActive(link.status)).length, [links])
  const totalLinkCount = links.length

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
        title: 'VLAN',
        dataIndex: 'vlan',
        key: 'vlan',
        width: 180,
        render: (text) => <span style={{ color: '#c4b5fd' }}>{text || '-'}</span>,
      },
    ]
  }, [getStatusTagColor, getStatusText])

  const tableData = useMemo(() => {
    return deviceRows.map((d) => {
      const status = getDeviceStatusValue(d)
      const ospfArea = ospfAreaOf(d)
      const vlan = vlanTextOf(d)
      const roleLabel = d.role || d.deviceType || 'unknown'
      const { primaryIp: normalizedPrimaryIp } = getDevicePrimaryIpInfo(d)

      return {
        key: d.id,
        id: d.id,
        name: d.name,
        ip: normalizedPrimaryIp === '-' ? '' : String(normalizedPrimaryIp),
        roleLabel,
        status,
        ospfArea,
        vlan,
      }
    })
  }, [deviceRows, getDeviceStatusValue, ospfAreaOf, vlanTextOf])

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
              告警项 {alarmItems.length} 条
            </div>
          </div>
        </div>

        <div style={{ minHeight: 0 }}>
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
                options={STATUS_FILTER_OPTIONS}
              />
            </Space>
            <Tag>过滤结果 {tableData.length} 条</Tag>
          </div>

          <Table
            size="small"
            rowKey="id"
            dataSource={tableData}
            columns={deviceColumns}
            pagination={{ pageSize: 10, showSizeChanger: false, position: ['topRight'] }}
            scroll={{ x: 980 }}
            style={{ background: '#0b1220' }}
          />
        </div>
      </div>
    </ConfigProvider>
  )
}

export default MonitoringPanel;
