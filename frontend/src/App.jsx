/**
 * 前端应用根组件与路由配置。
 *
 * 作者: Adorrain
 * 创建时间: 2026-01-30
 */

import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout, Typography, Empty, Button, Modal } from 'antd';
import MainLayout from './components/layout/MainLayout';
import NetworkTopology3D from './components/3d/NetworkTopology3D';
import DevicePanel from './components/ui/DevicePanel';
import ConfigUploader from './components/ui/ConfigUploader';
import OpsConsole from './components/ui/OpsConsole';
import MonitoringPanel from './components/ui/MonitoringPanel';

const { Content, Sider } = Layout;
const { Title, Text } = Typography;

/**
 * 路由内容组件，渲染各页面内容
 */
const AppContent = ({ networkTopology, setNetworkTopology }) => {
  const [selectDeviceId, setSelectDeviceId] = useState(null);
  const [opsLogs, setOpsLogs] = useState([]);
  const [monitorPanelOpen, setMonitorPanelOpen] = useState(false);
  const navigate = useNavigate();

  const handleDeviceClick = (device) => {
    setSelectDeviceId(device?.id);
  };

  /**
  * 脚本配置成功上传后跳转拓扑页
  */
  const handleConfigLoad = () => {
    navigate('/topology');
  };

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/topology" replace />} />
      <Route
        path="/topology"
        element={
          <Layout style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
            <Content style={{ position: 'relative', height: '100%', minHeight: 0, background: '#0b1220' }}>
              {networkTopology ? (
                <NetworkTopology3D
                  key={networkTopology.id}
                  topology={networkTopology}
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
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <div>
                        <Title level={3}>NO TOPOLOGY</Title>
                        <Text type="secondary">请先前往「配置上传」加载拓扑</Text>
                      </div>
                    }
                  />
                </div>
              )}
              <DevicePanel
                selectDeviceId={selectDeviceId}
                setSelectDevice={setSelectDeviceId}
                networkTopology={networkTopology}
              />
            </Content>

            <Sider width={400} style={{ background: '#0b1220', height: '100%', minHeight: 0 }}>
              <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '48px 32px 24px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div />
                      <Title level={4} style={{ margin: 0, color: '#fff' }}>
                        运维控制台
                      </Title>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 8px',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    >
                      <Text style={{ color: '#94a3b8' }}>参考带宽</Text>
                      <Text style={{ color: '#e2e8f0' }}>
                        {networkTopology?.ospfReferenceBandwidth || '-'}
                      </Text>
                    </div>
                    <Button type="default" onClick={() => setMonitorPanelOpen(true)}>
                      监控面板
                    </Button>
                  </div>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 12 }}>
                  <OpsConsole
                    networkTopology={networkTopology}
                    setNetworkTopology={setNetworkTopology}
                    logs={opsLogs}
                    setOpsLogs={setOpsLogs}
                  />
                </div>
              </div>
            </Sider>

            <Modal
              title="监控面板"
              open={monitorPanelOpen}
              onCancel={() => setMonitorPanelOpen(false)}
              footer={null}
              width="80%"
            >
              <div style={{ overflowY: 'auto' }}>
                <MonitoringPanel
                  networkTopology={networkTopology}
                />
              </div>
            </Modal>
          </Layout>
        }
      />
      <Route
        path="/upload"
        element={
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <ConfigUploader
              onConfigLoaded={handleConfigLoad}
              setNetworkTopology={setNetworkTopology}
            />
          </div>
        }
      />
    </Routes>
  );
};

/**
 * 应用根组件：提供路由与整体布局
 */
function App() {
  const [networkTopology, setNetworkTopology] = useState(null);

  return (
    <BrowserRouter>
      <MainLayout networkTopology={networkTopology}>
        <AppContent networkTopology={networkTopology} setNetworkTopology={setNetworkTopology} />
      </MainLayout>
    </BrowserRouter>
  );
}

export default App;
