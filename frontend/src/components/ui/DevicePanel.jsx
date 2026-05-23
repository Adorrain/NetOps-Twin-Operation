import React, { useMemo } from 'react';
import {
  Table,
  Button,
  Card,
  ConfigProvider,
  Descriptions,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  ClusterOutlined,
  CloseOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import {
  judgeDeviceStatus,
  getDeviceStatusLabel,
  getDeviceTypeLabel,
} from '../../utils/utils';

import { useTopology } from '../../utils/topologyContext';

const DevicePanel = ({ selectDeviceId, setSelectDevice }) => {
  const { networkTopology } = useTopology();

  const device = useMemo(() => {
    return networkTopology?.devices?.find(device => device.id === selectDeviceId);
  }, [selectDeviceId, networkTopology?.devices]);

  if (!selectDeviceId || !device) return null;

  const onClose = () => setSelectDevice?.(null);

  const deviceStatus = judgeDeviceStatus(device.status);

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
        title={
          <Space>
            <ClusterOutlined style={{ fontSize: 24, color: '#fff' }} />

            <Typography.Text strong style={{ color: '#e2e8f0' }}>
              {device.name}
            </Typography.Text>

            <Tag color="blue">{getDeviceTypeLabel(device.deviceType)}</Tag>
            <Tag>{getDeviceStatusLabel(deviceStatus)}</Tag>
          </Space>
        }
        extra={<Button type="text" icon={<CloseOutlined />} onClick={onClose} />}
      >
        <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="IP 地址">{device.ip || '-'}</Descriptions.Item>
          <Descriptions.Item label="子网掩码">{device.netmask || '-'}</Descriptions.Item>
          <Descriptions.Item label="角色">{device.role}</Descriptions.Item>
          <Descriptions.Item label="设备类型">
            {getDeviceTypeLabel(device.deviceType)}
          </Descriptions.Item>

          {device.description && (
            <Descriptions.Item label="描述" span={2}>
              {device.description}
            </Descriptions.Item>
          )}
        </Descriptions>

        <Card
          type="inner"
          title={
            <Space>
              <ApiOutlined />
              接口列表 ({device.interfaces?.length || 0})
            </Space>
          }
          styles={{
            body: { background: '#0b1220' },
            header: { background: '#0f172a', color: '#cbd5e1' },
          }}
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
              dataSource={device.interfaces}
              pagination={false}
              size="small"
              rowKey="name"
              locale={{ emptyText: '暂无接口信息' }}
              style={{ background: '#0b1220' }}
            >
              <Table.Column title="接口名" dataIndex="name" />
              <Table.Column title="IP 地址" dataIndex="ip" />
              <Table.Column title="子网掩码" dataIndex="netmask" />
              <Table.Column
                title="状态"
                dataIndex="status"
                render={(s) => {
                  const ok = (s || '').toLowerCase() === 'up' || !s;
                  return <Tag color={ok ? 'green' : 'red'}>{ok ? 'UP' : 'DOWN'}</Tag>;
                }}
              />
            </Table>
          </ConfigProvider>
        </Card>
      </Card>
    </div>
  );
};

export default DevicePanel;