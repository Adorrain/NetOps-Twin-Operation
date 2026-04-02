import React from 'react';
import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  CloudServerOutlined, 
  UploadOutlined, 
  DashboardOutlined,
  HomeOutlined,
  LeftOutlined,
  RightOutlined
} from '@ant-design/icons';
import { useAppStore } from '../../utils/appStore';

const { Sider } = Layout;

const Sidebar = () => {
  const { ui, updateUI } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const collapsed = ui.sidebarCollapsed;

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
          background: '#0b1220',
          padding: 12,
          borderRight: '1px solid #1f2937',
        }}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            height: 64,
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#0f172a',
          }}
        >
          <HomeOutlined style={{ fontSize: 22, color: '#3b82f6' }} />
          {!collapsed && (
            <span style={{ color: '#e5e7eb', fontWeight: 650, fontSize: 16, letterSpacing: 0.2 }}>
              网络数字孪生实验平台
            </span>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            onClick={handleMenuClick}
            items={menuItems}
            inlineIndent={18}
            style={{
              borderRight: 0,
              background: 'transparent',
              color: '#e5e7eb',
            }}
          />
        </div>

        <div
          style={{
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderTop: '1px solid #1f2937',
            cursor: 'pointer',
            background: 'transparent',
          }}
          onClick={() => updateUI({ sidebarCollapsed: !collapsed })}
        >
          {collapsed ? (
            <RightOutlined style={{ color: '#e5e7eb', fontSize: 16 }} />
          ) : (
            <LeftOutlined style={{ color: '#e5e7eb', fontSize: 16 }} />
          )}
        </div>
      </div>
    </Sider>
  );
};

export default Sidebar;
