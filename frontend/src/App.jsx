/**
 * 前端应用根组件与路由配置。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
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
 * 路由内容组件：根据 URL 同步 UI 面板状态，并渲染各页面内容
 */
const AppContent = ({ networkTopology, setNetworkTopology }) => {
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [opsLogs, setOpsLogs] = useState([]);
  const [monitorPanelOpen, setMonitorPanelOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleDeviceClick = (device) => {
    setSelectedDeviceId(device?.id ?? null);
  };

/**
  * 脚本配置成功上传后跳转拓扑页
  */
  const handleConfigLoaded = () => {
    navigate('/topology');
  };

  useEffect(() => {
    if (location.pathname !== '/topology') {
      setSelectedDeviceId(null);
      setMonitorPanelOpen(false);
    }
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/topology" replace />} />
      <Route path="/topology" element={
        <Layout className="app-route-layout">
          <Content className="app-topology-content">
            {networkTopology ? (
              <NetworkTopology3D
                key={networkTopology.id ?? 'default-topo'}
                topology={networkTopology}
                onDeviceClick={handleDeviceClick}
              />
            ) : (
              <div className="app-empty-wrapper">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <div className="app-empty-description">
                      <Title level={3} className="app-empty-title">NO TOPOLOGY</Title>
                      <Text type="secondary">请先前往「配置上传」加载拓扑</Text>
                    </div>
                  }
                />
              </div>
            )}
             <DevicePanel
               selectedDeviceId={selectedDeviceId}
               setSelectedDevice={setSelectedDeviceId}
               networkTopology={networkTopology}
             />
          </Content>

          <Sider width={400} theme="dark" className="app-console-sider">
             <div className="app-console-header">
                <div className="app-console-header-row">
                  <div className="app-console-header-title-wrap">
                  <div className="app-console-header-bar" />
                  <Title level={4} className="app-console-title">运维控制台</Title>
                  </div>
                  <div className="app-console-refbw">
                    <Text className="app-console-refbw-label">参考带宽</Text>
                    <Text className="app-console-refbw-value">{networkTopology?.ospfReferenceBandwidth || '-'}</Text>
                  </div>
                  <Button type="default" size="small" onClick={() => setMonitorPanelOpen(true)}>
                    监控面板
                  </Button>
                </div>
             </div>
             <div className="app-console-body">
               <OpsConsole
                 networkTopology={networkTopology}
                 setNetworkTopology={setNetworkTopology}
                 logs={opsLogs}
                 setOpsLogs={setOpsLogs}
               />
             </div>
          </Sider>
          <Modal
            title="监控面板"
            open={monitorPanelOpen}
            onCancel={() => setMonitorPanelOpen(false)}
            footer={null}
            width="80vw"
            style={{ top: 24 }}
            destroyOnHidden
          >
            <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
              <MonitoringPanel
                networkTopology={networkTopology}
                onOpenDevice={setSelectedDeviceId}
              />
            </div>
          </Modal>
        </Layout>
      } />
      <Route path="/upload" element={
        <div className="app-upload-page">
          <ConfigUploader
            onConfigLoaded={handleConfigLoaded}
            setNetworkTopology={setNetworkTopology}
          />
        </div>
      } />
      <Route path="/monitoring" element={
        <Navigate to="/topology" replace />
      } />
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
