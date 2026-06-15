import { useState } from 'react';
import { Layout, Typography, Empty, Button, Modal } from 'antd';
import NetworkTopology3D from '../components/3d/NetworkTopology3D';
import DevicePanel from '../components/ui/DevicePanel';
import OpsConsole from '../components/ui/OpsConsole';
import MonitoringPanel from '../components/ui/MonitoringPanel';
import { useTopology } from '../utils/topologyContext';

const { Content, Sider } = Layout;
const { Title, Text } = Typography;

export default function TopologyPage() {
  const { networkTopology } = useTopology();

  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [monitorModalOpen, setMonitorModalOpen] = useState(false);

  const handleDeviceClick = (device) => {
    setSelectedDeviceId(device?.id);
  };

  return (
    <Layout style={{ height: '100%', overflow: 'hidden' }}>
      <Content style={{ position: 'relative', background: '#111217' }}>
        {networkTopology ? (
          <NetworkTopology3D
            networkTopology={networkTopology}
            onDeviceClick={handleDeviceClick}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Empty
              description={
                <>
                  <Title level={4}>暂无拓扑</Title>
                  <Text type="secondary">请先上传配置</Text>
                </>
              }
            />
          </div>
        )}

        <DevicePanel
          selectDeviceId={selectedDeviceId}
          setSelectDevice={setSelectedDeviceId}
        />
      </Content>

      <Sider
        width={400}
        style={{
          background: '#111217',
          display: 'flex',
          overflowY: 'auto',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '32px 24px 16px', height: 140 }}>
          <Title level={5} style={{ color: '#fff', marginBottom: 12 }}>
            运维控制台
          </Title>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <Text type="secondary">参考带宽：</Text>
              <Text style={{ color: '#fff', marginLeft: 6 }}>
                {networkTopology?.ospfReferenceBandwidth ?? '-'}
              </Text>
            </div>

            <Button size="small" onClick={() => setMonitorModalOpen(true)}>
              监控面板
            </Button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          <OpsConsole />
        </div>
      </Sider>

      <Modal
        title="监控面板"
        open={monitorModalOpen}
        footer={null}
        onCancel={() => setMonitorModalOpen(false)}
        width="80%"
      >
        <MonitoringPanel />
      </Modal>
    </Layout>
  );
}