import React from 'react';
import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  CloudServerOutlined, 
  UploadOutlined 
} from '@ant-design/icons';

const { Sider } = Layout;

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const items = [
    {
      key: '/topology',
      icon: <CloudServerOutlined />,
      label: '网络拓扑',
    },
    {
      key: '/upload',
      icon: <UploadOutlined />,
      label: '配置上传',
    },
  ];

  return (
    <Sider width={220} className="app-sider">
      <div className="sider-logo">
        NetOps Twin Operation
      </div>

      <Menu
        mode="inline"
        theme="dark"
        selectedKeys={[location.pathname]}
        items={items}
        onClick={({ key }) => navigate(key)}
        className="app-menu"
      />
    </Sider>
  );
}