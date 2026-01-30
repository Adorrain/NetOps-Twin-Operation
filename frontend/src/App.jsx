/**
 * 前端应用根组件与路由配置。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import NetworkTopology3D from './components/3d/NetworkTopology3D';
import DevicePanel from './components/ui/DevicePanel';
import ConfigUploader from './components/ui/ConfigUploader';
import OpsConsole from './components/ui/OpsConsole';
import MonitoringPanel from './components/ui/MonitoringPanel';
import { useAppStore } from './stores';

/**
 * 路由内容组件：根据 URL 同步 UI 面板状态，并渲染各页面内容。
 *
 * @returns {JSX.Element} 页面内容。
 */
const AppContent = () => {
  const { networkTopology, selectedDeviceId, setSelectedDevice, setNetworkTopology, updateUI } = useAppStore();
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
        <div className="flex h-full relative overflow-hidden">
          <div className="relative flex-1 h-full bg-slate-900">
             {networkTopology && (
               <NetworkTopology3D 
                 key={networkTopology.id || 'default-topo'}
                 topology={networkTopology} 
                 onDeviceClick={(device) => setSelectedDevice(device?.id)}
               />
             )}
             
             {!networkTopology && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-600 select-none pointer-events-none">
                   <div className="text-center">
                      <p className="text-2xl font-light tracking-widest opacity-30">NO TOPOLOGY</p>
                      <p className="text-sm mt-2 opacity-20">Please upload configuration via /upload</p>
                   </div>
                </div>
             )}
          </div>

          <div className="w-[400px] h-full overflow-y-auto bg-slate-900/60 backdrop-blur-xl border-l border-slate-700/50 flex flex-col z-20 shadow-2xl">
             <div className="p-6 sticky top-0 bg-slate-900/90 backdrop-blur-xl z-30 border-b border-slate-700/50 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center tracking-wide">
                  <span className="w-1 h-6 bg-gradient-to-b from-blue-400 to-blue-600 rounded mr-3 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                  NetOps Console
                </h2>
             </div>
             <div className="p-4 flex-1">
               <OpsConsole />
             </div>
          </div>

          {selectedDeviceId && (
             <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-10 animate-fade-in" onClick={() => setSelectedDevice(null)}>
                <div className="w-[800px] max-h-[80vh] overflow-auto rounded-2xl shadow-2xl animate-float relative border border-slate-700/50 bg-slate-900/90" onClick={e => e.stopPropagation()}>
                   <DevicePanel 
                      device={networkTopology?.devices.find(d => d.id === selectedDeviceId)} 
                      onClose={() => setSelectedDevice(null)} 
                   />
                </div>
             </div>
          )}
        </div>
      } />
      <Route path="/upload" element={
        <div className="p-6 h-full flex items-center justify-center">
          <ConfigUploader onConfigLoaded={handleConfigLoaded} />
        </div>
      } />
      <Route path="/monitoring" element={
        <div className="p-6 h-full">
          <MonitoringPanel />
        </div>
      } />
      <Route path="/ops" element={ 
          <div className="p-6 h-full">
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
    <BrowserRouter>
      <MainLayout>
        <AppContent />
      </MainLayout>
    </BrowserRouter>
  );
}

export default App;
