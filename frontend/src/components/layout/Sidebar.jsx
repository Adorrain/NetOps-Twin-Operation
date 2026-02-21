import React from 'react';
import { Layout, Menu, Button } from 'antd';
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
  const { ui, updateUI } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const collapsed = ui.sidebarCollapsed;

  const menuItems = [
    { key: 'topology', label: <span style={{ fontSize: '18px', fontWeight: 500, marginLeft: 10 }}>网络拓扑</span>, icon: <CloudServerOutlined style={{ fontSize: '20px' }} />, style: { marginTop: 20, marginBottom: 20 } },
    { key: 'monitoring', label: <span style={{ fontSize: '18px', fontWeight: 500, marginLeft: 10 }}>监控面板</span>, icon: <DashboardOutlined style={{ fontSize: '20px' }} />, style: { marginBottom: 20 } },
    { key: 'upload', label: <span style={{ fontSize: '18px', fontWeight: 500, marginLeft: 10 }}>配置上传</span>, icon: <UploadOutlined style={{ fontSize: '20px' }} />, style: { marginBottom: 20 } },
  ];

  const handleMenuClick = ({ key }) => {
    updateUI({ activePanel: key });
    navigate(`/${key}`);
  };

  const selectedKey = location.pathname.substring(1) || 'topology';

  return (
    <Sider 
        collapsible 
        collapsed={collapsed} 
        onCollapse={(value) => updateUI({ sidebarCollapsed: value })}
        trigger={null}
        breakpoint="lg"
        width={260}
        style={{
            overflow: 'hidden',
            height: '100vh',
            position: 'sticky',
            left: 0,
            top: 0,
            bottom: 0,
            borderRight: '1px solid #303030', // Match dark theme border
            display: 'flex',
            flexDirection: 'column'
        }}
    >
      <div style={{ 
          height: 64, 
          margin: 16, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          flexShrink: 0
      }}>
         <HomeOutlined style={{ fontSize: '28px', color: '#1890ff' }} />
         {!collapsed && <span style={{ marginLeft: 12, color: '#fff', fontWeight: 'bold', fontSize: '20px' }}>NetOps Twin</span>}
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 48 }}>
        <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            onClick={handleMenuClick}
            items={menuItems}
            style={{ borderRight: 0, fontSize: '16px' }}
        />
      </div>

      <div style={{ 
          height: 48, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          background: '#001529',
          cursor: 'pointer',
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          transition: 'background-color 0.3s',
          zIndex: 10
      }} 
        onClick={() => updateUI({ sidebarCollapsed: !collapsed })}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#002140'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#001529'}
      >
          {collapsed ? <RightOutlined style={{ color: '#fff', fontSize: '16px' }} /> : <LeftOutlined style={{ color: '#fff', fontSize: '16px' }} />}
      </div>
    </Sider>
  );
};

export default Sidebar;
