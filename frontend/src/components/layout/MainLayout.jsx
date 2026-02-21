import React, { useEffect } from 'react';
import { Layout, notification } from 'antd';
import Header from './Header';
import Sidebar from './Sidebar';
import { useAppStore } from '../../stores';

const { Content } = Layout;

/**
 * 主布局：包含 Header、Sidebar、内容区与通知区域。
 *
 * @param {{children: any}} props 组件属性。
 * @returns {JSX.Element} 布局组件。
 */
const MainLayout = ({ children }) => {
  const { ui, markNotificationAsRead } = useAppStore();
  const [api, contextHolder] = notification.useNotification();

  useEffect(() => {
    // 自动标记已读逻辑
    const timers = {};
    ui.notifications.forEach(n => {
      if (!n.read && !timers[n.id]) {
        timers[n.id] = setTimeout(() => markNotificationAsRead(n.id), 5000);
      }
    });
    return () => { Object.values(timers).forEach(t => clearTimeout(t)); };
  }, [ui.notifications, markNotificationAsRead]);

  useEffect(() => {
     // 监听新通知并弹窗
     // 注意：这里简单实现，实际上应该对比旧数据或者增加一个 'shown' 标记
     // 由于 store 里没有 shown，我们依赖 markNotificationAsRead 会在5秒后清除未读状态
     // 为了避免重复弹窗，我们只弹未读的，且假设 5秒内不会重复渲染导致重复弹窗（或者 Antd 会去重）
     // 更好的做法是 Store 里维护一个 queue，这里消费 queue。
     // 鉴于现有架构，我们仅依赖 UI 列表展示，或者在这里简单处理。
     // 实际上原来的 MainLayout 是渲染了一个 div list。现在我们用 Antd notification。
     
     // 只有当有新的未读消息时才处理（比较困难，简化为展示所有未读，但 Antd notification 会堆叠）
     // 为了防止无限弹窗，我们这里只处理最近的一条，或者暂时不自动弹窗，只在 Header 的 Bell 里显示红点。
     // 原来的实现是右侧悬浮卡片。我们可以用 Antd notification 替代。
     
     // 为了避免复杂状态同步，这里暂不自动弹出 Antd notification，而是依赖 Header 的 Badge 和 Popover。
     // 如果用户希望保留右侧弹出气泡，可以使用 api.open
     
     const unread = ui.notifications.filter(n => !n.read);
     if (unread.length > 0) {
         const latest = unread[unread.length - 1];
         // 简单的去重逻辑：如果距离上次弹窗时间很短且 ID 相同（这里没法存状态）
         // 决定：保留 Header 的通知中心，移除自动弹出的气泡，以免干扰（或者只在添加通知的瞬间弹出，这需要修改 Store 或增加监听器）
     }
  }, [ui.notifications]);
  
  return (
    <Layout style={{ minHeight: '100vh', background: '#000' }}>
      {contextHolder}
      <Sidebar />
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
        <Header />
        <Content style={{ 
            position: 'relative', 
            overflow: 'hidden', 
            background: '#0f172a', // slate-900
            display: 'flex',
            flexDirection: 'column'
        }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
