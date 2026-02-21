/**
 * 前端应用根组件与路由配置。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ConfigProvider, theme, Layout, Typography, Empty } from 'antd';
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
 * 路由内容组件：根据 URL 同步 UI 面板状态，并渲染各页面内容。
 *
 * @returns {JSX.Element} 页面内容。
 */
const AppContent = () => {
  const { networkTopology, setSelectedDevice, setNetworkTopology, updateUI } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const path = location.pathname.substring(1) || 'topology';
    updateUI({ activePanel: path });
  }, [location, updateUI]);

  /**
   * 处理拓扑配置上传成功回调。
   *
   * @param {any} topology 上传并解析后的拓扑数据。
   */
  const handleConfigLoaded = (topology) => {
    setNetworkTopology(topology);
    navigate('/topology');
  };

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/topology" replace />} />
      <Route path="/topology" element={
        <Layout style={{ height: '100%' }}>
          <Content style={{ position: 'relative', background: '#0f172a' }}>
             {networkTopology ? (
               <NetworkTopology3D 
                 key={networkTopology.id || 'default-topo'}
                 topology={networkTopology} 
                 onDeviceClick={(device) => setSelectedDevice(device?.id)}
               />
             ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                   <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        <div style={{ color: 'rgba(255,255,255,0.4)' }}>
                          <Title level={3} style={{ color: 'rgba(255,255,255,0.3)', margin: 0 }}>NO TOPOLOGY</Title>
                          <Text type="secondary">Please upload configuration via /upload</Text>
                        </div>
                      }
                   />
                </div>
             )}
             <DevicePanel />
          </Content>

          <Sider 
            width={400} 
            theme="dark" 
            style={{ 
              borderLeft: '1px solid rgba(255,255,255,0.1)', 
              background: 'rgba(15, 23, 42, 0.8)', 
              backdropFilter: 'blur(10px)'
            }}
          >
             <div style={{ 
               padding: '16px 24px', 
               borderBottom: '1px solid rgba(255,255,255,0.1)',
               background: 'rgba(15, 23, 42, 0.95)'
             }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 4, height: 24, background: 'linear-gradient(to bottom, #1890ff, #096dd9)', borderRadius: 2 }} />
                  <Title level={4} style={{ margin: 0, color: '#fff', fontSize: 18 }}>NetOps Console</Title>
                </div>
             </div>
             <div style={{ height: 'calc(100% - 65px)', overflowY: 'auto', padding: 16 }}>
               <OpsConsole />
             </div>
          </Sider>
        </Layout>
      } />
      <Route path="/upload" element={
        <div style={{ padding: 24, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ConfigUploader onConfigLoaded={handleConfigLoaded} />
        </div>
      } />
      <Route path="/monitoring" element={
        <div style={{ height: '100%', overflow: 'hidden' }}>
          <MonitoringPanel />
        </div>
      } />
      <Route path="/ops" element={ 
          <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
             <OpsConsole />
          </div>
      } />
    </Routes>
  );
};

/**
 * 应用根组件：提供路由与整体布局。
 *
 * @returns {JSX.Element} 根组件。
 */
function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <BrowserRouter>
        <MainLayout>
          <AppContent />
        </MainLayout>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
