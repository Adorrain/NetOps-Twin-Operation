import {
  Card,
  Descriptions,
  Table,
  Tag,
  Button,
  Space,
} from 'antd';

import {
  ClusterOutlined,
  ApiOutlined,
  CloseOutlined,
} from '@ant-design/icons';

import {
  judgeDeviceStatus,
  getDeviceStatusLabel,
  getDeviceTypeLabel,
} from '../../utils/utils';

import { useTopology } from '../../utils/topologyContext';

const DevicePanel = ({ selectDeviceId, setSelectDevice }) => {
  const { networkTopology } = useTopology();

  const device = networkTopology?.devices?.find(d => d.id === selectDeviceId);
  if (!device) return null;
  const up = judgeDeviceStatus(device.status);
  const columns = [
    {
      title: '接口名',
      dataIndex: 'name',
    },
    {
      title: 'IP 地址',
      dataIndex: 'ip',
    },
    {
      title: '子网掩码',
      dataIndex: 'netmask',
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: status => {
        const up = !status || String(status).toLowerCase() === 'up';
        return (
          <Tag color={up ? 'green' : 'red'}>
            {up ? 'UP' : 'DOWN'}
          </Tag>
        );
      },
    },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 720,
        zIndex: 1000,
      }}
    >
      <Card
        title={
          <Space>
            <ClusterOutlined />
            {device.name}

            <Tag>
              {getDeviceTypeLabel(device.deviceType)}
            </Tag>

            <Tag color={up ? 'green' : 'red'}>
              {getDeviceStatusLabel(up)}
            </Tag>
          </Space>
        }
        extra={
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setSelectDevice(null)}
          />
        }
      >
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="IP 地址">
            {device.ip || '-'}
          </Descriptions.Item>

          <Descriptions.Item label="子网掩码">
            {device.netmask || '-'}
          </Descriptions.Item>

          <Descriptions.Item label="角色" span={2}>
            {device.role || '-'}
          </Descriptions.Item>

          {device.description && (
            <Descriptions.Item label="描述" span={2}>
              {device.description}
            </Descriptions.Item>
          )}
        </Descriptions>

        <Card
          size="small"
          title={
            <Space>
              <ApiOutlined />
              接口列表
            </Space>
          }
          style={{ marginTop: 16 }}
        >
          <Table
            rowKey="name"
            size="small"
            pagination={false}
            columns={columns}
            dataSource={device.interfaces }
          />
        </Card>
      </Card>
    </div>
  );
};

export default DevicePanel;
