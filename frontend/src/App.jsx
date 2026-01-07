import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import NetworkTopology3D from './components/3d/NetworkTopology3D';
import DevicePanel from './components/ui/DevicePanel';
import ConfigUploader from './components/ui/ConfigUploader';
import OpsConsole from './components/ui/OpsConsole';
import MonitoringPanel from './components/ui/MonitoringPanel';
import { useAppStore } from './stores';

// Create a wrapper component to handle the "active panel" logic sync with store
const AppContent = () => {
  const { networkTopology, selectedDevice, setSelectedDevice, setNetworkTopology, updateUI } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Sync URL path to store's activePanel if needed, or just rely on URL
    const path = location.pathname.substring(1) || 'topology';
    updateUI({ activePanel: path });
  }, [location, updateUI]);

  const handleConfigLoaded = (topology) => {
    setNetworkTopology(topology);
    navigate('/topology'); // Upload complete, jump to simulation page
  };

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/topology" replace />} />
      <Route path="/topology" element={
        <div className="flex h-full relative overflow-hidden">
          {/* Left: Simulation (3D View) */}
          <div className="relative flex-1 h-full bg-slate-900">
             {/* 
                Update: Pass click handler to 3D View 
                When a device is clicked in 3D, it sets 'selectedDevice' in store
                Added key to force re-render when topology changes
             */}
             {networkTopology && (
               <NetworkTopology3D 
                 key={networkTopology.id || 'default-topo'}
                 topology={networkTopology} 
                 onDeviceClick={(device) => setSelectedDevice(device)}
               />
             )}
             
             {/* Config Uploader Overlay REMOVED as per user request */}
             {!networkTopology && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-600 select-none pointer-events-none">
                   <div className="text-center">
                      <p className="text-2xl font-light tracking-widest opacity-30">NO TOPOLOGY</p>
                      <p className="text-sm mt-2 opacity-20">Please upload configuration via /upload</p>
                   </div>
                </div>
             )}
          </div>

          {/* Right: System Operations */}
          <div className="w-[400px] h-full overflow-y-auto bg-slate-900/60 backdrop-blur-xl border-l border-slate-700/50 flex flex-col z-20 shadow-2xl">
             <div className="p-6 sticky top-0 bg-slate-900/90 backdrop-blur-xl z-30 border-b border-slate-700/50 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center tracking-wide">
                  <span className="w-1 h-6 bg-gradient-to-b from-blue-400 to-blue-600 rounded mr-3 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                  NetOps Console
                </h2>
                {/* Removed compact ConfigUploader from header as requested */}
             </div>
             <div className="p-4 flex-1">
               <OpsConsole />
             </div>
          </div>

          {/* Device Details Modal */}
          {selectedDevice && (
             <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-10 animate-fade-in" onClick={() => setSelectedDevice(null)}>
                <div className="w-[800px] max-h-[80vh] overflow-auto rounded-2xl shadow-2xl animate-float relative border border-slate-700/50 bg-slate-900/90" onClick={e => e.stopPropagation()}>
                   <DevicePanel 
                      device={typeof selectedDevice === 'string' ? networkTopology?.devices.find(d => d.id === selectedDevice) : selectedDevice} 
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
