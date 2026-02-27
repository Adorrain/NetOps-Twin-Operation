import React, { useState } from 'react';
import { Layout, Menu, theme } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  CloudServerOutlined, 
  UploadOutlined, 
  DashboardOutlined,
  HomeOutlined,
  LeftOutlined,
  RightOutlined
} from '@ant-design/icons';
import { useAppStore } from '../../stores';

const { Sider } = Layout;

const Sidebar = () => {
  const { token } = theme.useToken();
  const { ui, updateUI } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const collapsed = ui.sidebarCollapsed;
  const [triggerHover, setTriggerHover] = useState(false);

  const menuItems = [
    { key: 'topology', label: '网络拓扑', icon: <CloudServerOutlined /> },
    { key: 'monitoring', label: '监控面板', icon: <DashboardOutlined /> },
    { key: 'upload', label: '配置上传', icon: <UploadOutlined /> },
  ];

  const handleMenuClick = ({ key }) => {
    updateUI({ activePanel: key });
    navigate(`/${key}`);
  };

  const pathKey = location.pathname.substring(1) || 'topology';
  const selectedKey = menuItems.some(i => i.key === pathKey) ? pathKey : 'topology';

  return (
    <Sider 
        collapsible 
        collapsed={collapsed} 
        onCollapse={(value) => updateUI({ sidebarCollapsed: value })}
        trigger={null}
        breakpoint="lg"
        width={260}
        collapsedWidth={84}
        style={{
            height: '100vh',
            position: 'sticky',
            left: 0,
            top: 0,
            bottom: 0,
            background: 'transparent',
            padding: 12
        }}
    >
      <div
        style={{
          height: '100%',
          borderRadius: 18,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(15, 23, 42, 0.65)',
          border: `1px solid ${token.colorBorderSecondary}`,
          backdropFilter: 'blur(12px)',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.35)'
        }}
      >
        <div style={{ 
            height: 64,
            margin: 12,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            background: token.colorFillTertiary,
            border: `1px solid ${token.colorBorderSecondary}`
        }}>
          <HomeOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
          {!collapsed && <span style={{ marginLeft: 10, color: token.colorText, fontWeight: 650, fontSize: 16, letterSpacing: 0.4 }}>NetOps Twin</span>}
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          <Menu
              theme="dark"
              mode="inline"
              selectedKeys={[selectedKey]}
              onClick={handleMenuClick}
              items={menuItems}
              inlineIndent={18}
              style={{ borderRight: 0, background: 'transparent' }}
          />
        </div>

        <div
          style={{ 
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            cursor: 'pointer',
            transition: 'background-color 160ms ease',
            backgroundColor: triggerHover ? 'rgba(255, 255, 255, 0.06)' : 'transparent'
          }} 
          onMouseEnter={() => setTriggerHover(true)}
          onMouseLeave={() => setTriggerHover(false)}
          onClick={() => updateUI({ sidebarCollapsed: !collapsed })}
        >
          {collapsed ? <RightOutlined style={{ color: token.colorText, fontSize: 16 }} /> : <LeftOutlined style={{ color: token.colorText, fontSize: 16 }} />}
        </div>
      </div>
    </Sider>
  );
};

export default Sidebar;
