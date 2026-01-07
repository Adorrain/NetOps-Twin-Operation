import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Home, 
  Network, 
  Upload, 
  Activity,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAppStore } from '../../stores';

const Sidebar = () => {
  const { ui, updateUI } = useAppStore();
  const navigate = useNavigate();
  const collapsed = ui.sidebarCollapsed;
  
  const menuItems = [
    { id: 'topology', label: '网络拓扑', icon: Network },
    { id: 'monitoring', label: '监控面板', icon: Activity },
    { id: 'upload', label: '配置上传', icon: Upload },
  ];
  
  const handleMenuClick = (menuId) => {
    updateUI({ activePanel: menuId });
    navigate(`/${menuId}`);
  };
  
  return (
    <div className="h-full bg-slate-900/80 backdrop-blur-xl border-r border-slate-700/50 flex flex-col">
      {/* Logo (标识) */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700/50 shrink-0">
        <div className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-full opacity-100'}`}>
          <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/30">
            <Home className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-none tracking-tight text-white">NetOps</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">数字孪生</p>
          </div>
        </div>
        
        {collapsed && (
           <div className="w-full flex justify-center">
             <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/30">
                <Home className="w-5 h-5 text-white" />
             </div>
           </div>
        )}
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = ui.activePanel === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => handleMenuClick(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/20"></div>
              )}
              
              <Icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
              
              {!collapsed && (
                <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${isActive ? 'translate-x-1' : ''}`}>
                  {item.label}
                </span>
              )}
              
              {/* 折叠状态下的工具提示 */}
              {collapsed && (
                <div className="absolute left-full ml-4 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl border border-slate-700">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* 底部切换按钮 */}
      <div className="p-4 border-t border-slate-700/50 flex justify-end shrink-0">
        <button 
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors" 
          onClick={() => updateUI({ sidebarCollapsed: !ui.sidebarCollapsed })}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
