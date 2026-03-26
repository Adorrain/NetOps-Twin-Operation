/**
 * 前端应用根组件与路由配置。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Typography, Empty } from 'antd';
import MainLayout from './components/layout/MainLayout';
import NetworkTopology3D from './components/3d/NetworkTopology3D';
import DevicePanel from './components/ui/DevicePanel';
import ConfigUploader from './components/ui/ConfigUploader';
import OpsConsole from './components/ui/OpsConsole';
import MonitoringPanel from './components/ui/MonitoringPanel';
import { useAppStore } from './stores';

const { Content, Sider } = Layout;
const { Title, Text } = Typography;

/**
 * 路由内容组件：根据 URL 同步 UI 面板状态，并渲染各页面内容
 */
const AppContent = () => {
  const { networkTopology, setSelectedDevice, updateUI } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const path = location.pathname.substring(1) || 'topology';
    updateUI({ activePanel: path });
  }, [location, updateUI]);

  /**
   * 脚本配置成功上传后跳转拓扑页
   */
  const handleConfigLoaded = () => {
    navigate('/topology');
  };

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/topology" replace />} />
      <Route path="/topology" element={
        <Layout className="app-route-layout">
          <Content className="app-topology-content">
             {networkTopology ? (
               <NetworkTopology3D 
                 key={networkTopology.id || 'default-topo'}
                 topology={networkTopology} 
                 onDeviceClick={(device) => setSelectedDevice(device?.id)}
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
             <DevicePanel />
          </Content>

          <Sider width={400} theme="dark" className="app-console-sider">
             <div className="app-console-header">
                <div className="app-console-header-title-wrap">
                  <div className="app-console-header-bar" />
                  <Title level={4} className="app-console-title">NetOps Console</Title>
                </div>
             </div>
             <div className="app-console-body">
               <OpsConsole />
             </div>
          </Sider>
        </Layout>
      } />
      <Route path="/upload" element={
        <div className="app-upload-page">
          <ConfigUploader onConfigLoaded={handleConfigLoaded} />
        </div>
      } />
      <Route path="/monitoring" element={
        <div className="app-monitoring-page">
          <MonitoringPanel />
        </div>
      } />
    </Routes>
  );
};

/**
 * 应用根组件：提供路由与整体布局
 */
function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <AppContent />
      </MainLayout>
    </BrowserRouter>
  );
}

export default App;
