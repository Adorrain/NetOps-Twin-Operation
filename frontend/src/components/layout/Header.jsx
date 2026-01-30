/**
 * 顶部导航栏组件。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import React, { useState } from 'react';
import { 
  Menu,
  X,
  Bell,
  Search,
  User
} from 'lucide-react';
import { useAppStore } from '../../stores';

/**
 * Header：包含标题、通知入口与移动端侧边栏开关。
 *
 * @returns {JSX.Element} Header 组件。
 */
const Header = () => {
  const store = useAppStore();
  const { ui, updateUI } = store;
  const [showNotifications, setShowNotifications] = useState(false);
  
  /**
   * 切换移动端侧边栏显示状态。
   */
  const toggleSidebar = () => {
    updateUI({ sidebarOpen: !ui.sidebarOpen });
  };
  
  const unreadCount = ui.notifications.filter(n => !n.read).length;

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 px-6 flex items-center justify-between z-30 sticky top-0">
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          {ui.sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400 tracking-wide hidden sm:block">
           NetOps 数字孪生平台
        </h1>
      </div>
      
      <div className="flex items-center gap-4">
         <div className="relative">
           <button 
             className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors relative"
             onClick={() => setShowNotifications(!showNotifications)}
           >
             <Bell className="w-5 h-5" />
             {unreadCount > 0 && (
               <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
             )}
           </button>

           {showNotifications && (
             <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in origin-top-right">
               <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-900/95 backdrop-blur">
                 <span className="font-semibold text-sm text-white">系统通知</span>
                 <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{ui.notifications.length}</span>
               </div>
               <div className="max-h-96 overflow-y-auto custom-scrollbar">
                 {ui.notifications.length === 0 ? (
                   <div className="p-8 text-center text-slate-500 text-sm">暂无新通知</div>
                 ) : (
                   ui.notifications.map(notification => (
                     <div key={notification.id} className={`p-4 border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors ${!notification.read ? 'bg-blue-900/10' : ''}`}>
                       <div className="flex justify-between items-start mb-1">
                         <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                           notification.type === 'error' ? 'bg-red-500/20 text-red-400' :
                           notification.type === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                           notification.type === 'success' ? 'bg-green-500/20 text-green-400' :
                           'bg-blue-500/20 text-blue-400'
                         }`}>
                           {notification.type}
                         </span>
                         <span className="text-[10px] text-slate-500">{notification.timestamp.toLocaleTimeString()}</span>
                       </div>
                       <h4 className="text-sm font-medium text-slate-200 mb-0.5">{notification.title}</h4>
                       <p className="text-xs text-slate-400 leading-relaxed">{notification.message}</p>
                     </div>
                   ))
                 )}
               </div>
             </div>
           )}
         </div>

         <button className="p-1.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all">
            <User className="w-5 h-5" />
         </button>
      </div> 
    </header>
  );
};

export default Header;
