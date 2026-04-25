import React, { useMemo } from 'react';
import { Table, Button, Card, ConfigProvider, Descriptions, Space, Tag, Typography } from 'antd';
import { 
  LaptopOutlined, 
  ClusterOutlined, 
  PartitionOutlined, 
  CloseOutlined,
  CloudServerOutlined,
  GatewayOutlined,
  ApiOutlined
} from '@ant-design/icons';
import { getVlans } from '../../utils/utils';
import {
  judgeDeviceStatus,
  getDeviceStatusLabel,
  getDeviceTypeLabel
} from '../../utils/deviceUtils';

const DevicePanel = ({ selectDeviceId, setSelectDevice, networkTopology }) => {

  const device = useMemo(() => {
    return (networkTopology?.devices || []).find((d) => d.id === selectDeviceId);
  }, [selectDeviceId, networkTopology]);

  const onClose = () => {
    if (typeof setSelectDevice === 'function') {
      setSelectDevice(null);
    }
  };

  if (!selectDeviceId || !device) return null;

  // Helpers
  const getDeviceIcon = (type) => {
    const t = (type || '').toLowerCase();
    const style = { fontSize: 24, color: '#fff' };
    if (t.includes('router')) return <ClusterOutlined style={style} />;
    if (t.includes('switch')) return <GatewayOutlined style={style} />;
    if (t.includes('server')) return <CloudServerOutlined style={style} />;
    return <LaptopOutlined style={style} />;
  };

  const effectiveStatus = judgeDeviceStatus(device.status);

  const getVlanInfo = (device) => {
    return getVlans(device)
      .filter((vlan) => Number(vlan) > 0)
      .map((vlan) => ({ id: vlan, name: `VLAN ${vlan}` }));
  };

  const ospfConfig = device?.ospf;
  const vlanList = getVlanInfo(device);
  const okVlan = vlanList.length > 0;
  const deviceType = device.deviceType;
  const deviceIp = device?.ip;
  const deviceNetmask = device?.netmask;

  const interfaceColumns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 120 },
    { title: 'IP 地址', dataIndex: 'ip', key: 'ip', width: 180, render: (text) => text || '-' },
    {
      title: 'VLAN',
      key: 'vlan',
      width: 120,
      render: (_, record) => {
        if (record.mode === 'trunk') return <Tag>TRUNK</Tag>;
        return record.vlan ? <Tag>{record.vlan}</Tag> : '-';
      },
    },
    { title: '模式', dataIndex: 'mode', key: 'mode', width: 100, render: (text) => text || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s) => ((s === 'up' || !s) ? <Tag color="green">UP</Tag> : <Tag color="red">DOWN</Tag>),
    },  
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        width: 760,
        maxHeight: '85vh',
        overflowY: 'auto',
      }}
    >
      <Card
        style={{ background: '#0f172a', borderColor: '#334155' }}
        styles={{ body: { background: '#0f172a' }, header: { color: '#e2e8f0', borderBottomColor: '#334155' } }}
        title={
          <Space>
            {getDeviceIcon(deviceType)}
            <Typography.Text strong style={{ color: '#e2e8f0' }}>{device.name}</Typography.Text>
            <Tag color="blue">{getDeviceTypeLabel(deviceType)}</Tag>
            <Tag>{getDeviceStatusLabel(effectiveStatus)}</Tag>
          </Space>
        }
        extra={<Button type="text" icon={<CloseOutlined />} onClick={onClose} />}
      >
        <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="IP 地址">{deviceIp}</Descriptions.Item>
          <Descriptions.Item label="子网掩码">{deviceNetmask}</Descriptions.Item>
          <Descriptions.Item label="角色">{device.role}</Descriptions.Item>
          <Descriptions.Item label="设备类型">{getDeviceTypeLabel(deviceType)}</Descriptions.Item>
          {device.description ? (
            <Descriptions.Item label="描述" span={2}>
              {device.description}
            </Descriptions.Item>
          ) : null}
        </Descriptions>

        {okVlan ? (
          <Card
            type="inner"
            title={
              <Space>
                <PartitionOutlined />
                VLAN 配置
              </Space>
            }
            style={{ marginBottom: 16 }}
            styles={{ body: { background: '#0b1220' }, header: { background: '#0f172a', color: '#cbd5e1' } }}
          >
            <Space wrap>
              {vlanList.map((v) => (
                <Tag key={v.id} color="blue">{v.name}</Tag>
              ))}
            </Space>
          </Card>
        ) : null}

        {ospfConfig ? (
          <Card
            type="inner"
            title="OSPF 协议"
            style={{ marginBottom: 16 }}
            styles={{ body: { background: '#0b1220' }, header: { background: '#0f172a', color: '#cbd5e1' } }}
          >
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="路由器 ID">{ospfConfig.routerId || '-'}</Descriptions.Item>
              <Descriptions.Item label="区域">{ospfConfig.area ?? '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        ) : null}

        <Card
          type="inner"
          title={
            <Space>
              <ApiOutlined />
              接口列表 ({device.interfaces?.length || 0})
            </Space>
          }
          styles={{ body: { background: '#0b1220' }, header: { background: '#0f172a', color: '#cbd5e1' } }}
        >
          <ConfigProvider
            theme={{
              components: {
                Table: {
                  headerBg: '#0f172a',
                  headerColor: '#cbd5e1',
                  borderColor: '#334155',
                  rowHoverBg: 'rgba(59,130,246,0.08)',
                },
              },
            }}
          >
            <Table
              dataSource={device?.interfaces}
              columns={interfaceColumns}
              pagination={false}
              size="small"
              rowKey="name"
              locale={{ emptyText: '暂无接口信息' }}
              style={{ background: '#0b1220' }}
            />
          </ConfigProvider>
        </Card>
      </Card>
    </div>
  );
};

export default DevicePanel;
