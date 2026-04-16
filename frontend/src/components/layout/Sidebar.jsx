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
import { useAppActions, useAppState } from '../../utils/appStore';

const { Sider } = Layout;

const Sidebar = () => {
  const { ui } = useAppState();
  const { updateUI } = useAppActions();
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
        }}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            height: 64,
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <HomeOutlined style={{ fontSize: 22, color: '#3b82f6' }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
          <Menu
            theme="dark"
            mode="inline"
            itemHeight={48}
            selectedKeys={[selectedKey]}
            onClick={handleMenuClick}
            items={menuItems}
            inlineIndent={18}
            style={{
              borderRight: 0,
              background: 'transparent',
              color: '#e5e7eb',
              marginTop: 24,
            }}
          />
        </div>

        <div
          style={{
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
