import React, { useMemo } from 'react';
import { Space, Table, Tag } from 'antd';
import { getVlans, countDeviceStatus, judgeDeviceStatus, getDeviceStatusLabel } from '../../utils/utils';
import { useTopology } from '../../utils/topologyContext';

const { Column } = Table;

export default function MonitoringPanel() {
  const { networkTopology } = useTopology();
  const devices = useMemo(() => { return networkTopology?.devices || []}, [networkTopology?.devices]);
  const counts =  countDeviceStatus(networkTopology);

  const tableData = useMemo(() => {
    return devices.map((device) => {
      const s = judgeDeviceStatus(device.status) || 'online';
      return {
        key: device.id,
        id: device.id,
        name: device.name,
        ip: device.ip,
        netmask: device.netmask,
        role: device.role,
        status: s,
        ospf: device?.ospf?.area,
        vlan: [...new Set(getVlans(device))].filter(v => Number(v) > 0).join(','),
      };
    });
  }, [devices]);

  const getColor = (s) => {
    if (s === 'online') return 'green';
    if (s === 'warning') return 'gold';
    if (s === 'error') return 'red';
    if (s === 'maintenance') return 'orange';
    return 'gray';
  };

  return (
    <div
      style={{
        padding: 16,
        height: '100%',
        overflowY: 'auto',
        color: '#e5e7eb',
      }}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Tag color="green">在线 {counts.activeDevices}</Tag>
        <Tag color="gold">告警 {counts.issueDevices}</Tag>
        <Tag color="red">故障 {counts.issueLinks}</Tag>
        <Tag color="gray">离线 {counts.offlineDevices}</Tag>
        <Tag color="orange">维护 {counts.maintenanceDevices}</Tag>
        <Tag>
          链路 {counts.activeLinks}/{counts.linkTotal}
        </Tag>
      </Space>

      <Tag style={{ marginBottom: 8 }}>
        共 {counts.deviceTotal} 台设备
      </Tag>

      <Table
        size="small"
        rowKey="id"
        dataSource={tableData}
        pagination={{ pageSize: 10 }}
      >
        <Column
          title="设备"
          dataIndex="name"
          render={(_, r) => (
            <div>
              <div style={{ color: '#e5e7eb', fontWeight: 600 }}>{r.name}</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>{r.id}</div>
            </div>
          )}
        />

        <Column title="IP" dataIndex="ip" />

        <Column title="子网" dataIndex="netmask" />

        <Column title="角色" dataIndex="role" />

        <Column
          title="状态"
          dataIndex="status"
          filters={[
            { text: '在线', value: 'online' },
            { text: '告警', value: 'warning' },
            { text: '故障', value: 'error' },
            { text: '维护', value: 'maintenance' },
            { text: '离线', value: 'offline' },
          ]}
          onFilter={(v, r) => r.status === v}
          render={(s) => <Tag color={getColor(s)}>{getDeviceStatusLabel(s)}</Tag>}
        />

        <Column
          title="OSPF"
          dataIndex="ospf"
          render={(a) => (a === undefined ? '-' : `Area ${a}`)}
        />

        <Column
          title="VLAN"
          dataIndex="vlan"
          render={(v) => v || '-'}
        />
      </Table>
    </div>
  );
}