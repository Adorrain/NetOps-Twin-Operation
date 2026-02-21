import React from 'react';
import { Layout, Button, Badge, Popover, List, Avatar, Space, Typography } from 'antd';
import { 
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  UserOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import { useAppStore } from '../../stores';

const { Header: AntHeader } = Layout;
const { Text } = Typography;

const Header = () => {
  const { ui, updateUI, markNotificationAsRead } = useAppStore();
  const collapsed = ui.sidebarCollapsed;

  const getIcon = (type) => {
    switch (type) {
      case 'success': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'warning': return <WarningOutlined style={{ color: '#faad14' }} />;
      case 'error': return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
      default: return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
    }
  };

  const notificationContent = (
    <List
      dataSource={ui.notifications}
      renderItem={(item) => (
        <List.Item 
            onClick={() => markNotificationAsRead(item.id)} 
            style={{ 
                cursor: 'pointer', 
                opacity: item.read ? 0.5 : 1,
                backgroundColor: item.read ? 'transparent' : 'rgba(24, 144, 255, 0.1)'
            }}
        >
          <List.Item.Meta
            avatar={getIcon(item.type)}
            title={<Text strong={!item.read}>{item.title}</Text>}
            description={<Text type="secondary" style={{ fontSize: '12px' }}>{item.message}</Text>}
          />
        </List.Item>
      )}
      style={{ width: 320, maxHeight: 400, overflow: 'auto' }}
      locale={{ emptyText: '暂无通知' }}
    />
  );

  return (
    <AntHeader style={{ padding: '0 24px', background: '#001529', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #303030' }}>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <h1 style={{ color: '#fff', margin: 0, fontSize: '18px', fontWeight: 600, letterSpacing: '1px' }}>
           NetOps 数字孪生平台
        </h1>
      </div>

      <Space size="large">
        <Popover 
            content={notificationContent} 
            title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>系统通知</span>
                    <Badge count={ui.notifications.filter(n => !n.read).length} overflowCount={99} />
                </div>
            } 
            trigger="click" 
            placement="bottomRight"
        >
            <Badge count={ui.notifications.filter(n => !n.read).length} size="small" offset={[-5, 5]}>
                <Button type="text" icon={<BellOutlined style={{ color: '#fff', fontSize: '20px' }} />} />
            </Badge>
        </Popover>
        <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff', cursor: 'pointer' }} />
      </Space>
    </AntHeader>
  );
};

export default Header;
