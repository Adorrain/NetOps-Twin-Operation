import React from 'react';
import { Layout, Button, Badge, Popover, List, Avatar, Space, Typography, theme } from 'antd';
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
  const { token } = theme.useToken();
  const { ui, markNotificationAsRead } = useAppStore();

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
                backgroundColor: item.read ? 'transparent' : token.colorFillSecondary
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
    <AntHeader style={{ padding: 0, background: 'transparent', height: 72, lineHeight: '72px' }}>
      <div className="app-glass" style={{ position: 'relative', height: '100%', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 16px' }}>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <Text strong style={{ color: token.colorText, fontSize: 16, letterSpacing: 0.2 }}>
            NetOps 数字孪生平台
          </Text>
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
                  <Button type="text" icon={<BellOutlined style={{ color: token.colorText, fontSize: 20 }} />} />
              </Badge>
          </Popover>
        </Space>
      </div>
    </AntHeader>
  );
};

export default Header;
