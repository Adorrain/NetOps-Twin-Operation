/**
 * 应用整体布局组件。
 *
 * 作者: Adorrain
 * 创建时间: 2026-01-30
 */

import React, { useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { useAppStore } from '../../stores';

/**
 * 主布局：包含 Header、Sidebar、内容区与通知区域。
 *
 * @param {{children: any}} props 组件属性。
 * @returns {JSX.Element} 布局组件。
 */
const MainLayout = ({ children }) => {
  const { ui, markNotificationAsRead } = useAppStore();
  
  useEffect(() => {
    const timers = {};
    ui.notifications.forEach(n => {
      if (!n.read && !timers[n.id]) {
        timers[n.id] = setTimeout(() => markNotificationAsRead(n.id), 5000);
      }
    });
    return () => { Object.values(timers).forEach(t => clearTimeout(t)); };
  }, [ui.notifications, markNotificationAsRead]);
  
  return (
    <div className="h-screen bg-slate-950 flex flex-col font-sans text-slate-100 selection:bg-blue-500/30 overflow-hidden">
      <Header />
      
      <div className="flex flex-1 overflow-hidden relative">
        <div className={`transition-all duration-300 ease-in-out z-40 h-full ${ui.sidebarCollapsed ? 'w-20' : 'w-64'} hidden lg:block`}>
          <Sidebar />
        </div>
        
        {ui.sidebarOpen && (
           <div className="lg:hidden absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm" onClick={() => useAppStore.getState().updateUI({sidebarOpen: false})}>
              <div className="w-64 h-full" onClick={e => e.stopPropagation()}>
                <Sidebar />
              </div>
           </div>
        )}

        <main className="flex-1 overflow-hidden relative bg-slate-900/50">
          {children}
        </main>

        <div className="absolute top-4 right-4 z-50 flex flex-col gap-3 w-80 pointer-events-none">
          {ui.notifications.filter(n=>!n.read).slice(0,4).map(n => (
            <div key={n.id} className={`pointer-events-auto rounded-lg shadow-xl backdrop-blur-md border p-4 transition-all duration-300 animate-fade-in ${
              n.type === 'success' ? 'bg-green-500/20 border-green-500/50 text-green-100' : 
              n.type === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-100' : 
              n.type === 'warning' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-100' : 
              'bg-slate-800/80 border-slate-700 text-slate-100'
            }`}>
              <div className="font-semibold mb-1 text-sm">{n.title}</div>
              <div className="text-xs opacity-90">{n.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
