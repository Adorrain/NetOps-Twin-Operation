import React, { useEffect } from 'react';
import { Layout, notification, theme, Spin, Typography } from 'antd';
import Header from './Header';
import Sidebar from './Sidebar';
import { useAppStore } from '../../stores';

const { Content } = Layout;
const { Text } = Typography;

/**
 * 主布局：包含 Header、Sidebar、内容区与通知区域。
 *
 * @param {{children: any}} props 组件属性。
 * @returns {JSX.Element} 布局组件。
 */
const MainLayout = ({ children }) => {
  const { token } = theme.useToken();
  const { ui, markNotificationAsRead } = useAppStore();
  const [, contextHolder] = notification.useNotification();
  const globalLoading = ui.loadingStates && ui.loadingStates.size > 0;

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
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <style>{`
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
      {contextHolder}
      <Sidebar />
      <Layout style={{ height: '100vh', overflow: 'hidden', background: 'transparent', padding: 12, gap: 12 }}>
        <Header />
        <Content style={{ 
            position: 'relative', 
            overflow: 'hidden', 
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 18,
            display: 'flex',
            flexDirection: 'column'
        }}>
          {children}
          {globalLoading && (
            <div style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(2, 6, 23, 0.55)',
              backdropFilter: 'blur(6px)'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <Spin size="large" />
                <Text style={{ color: token.colorTextSecondary, letterSpacing: 0.4 }}>正在加载…</Text>
              </div>
            </div>
          )}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
