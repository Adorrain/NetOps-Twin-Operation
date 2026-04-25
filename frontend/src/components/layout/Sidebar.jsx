import React from 'react';
import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { 
  CloudServerOutlined, 
  UploadOutlined
} from '@ant-design/icons';
import { getTopologyHealth } from '../../utils/utils';

const { Sider } = Layout;

const Sidebar = ({ networkTopology }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const menuItems = [
    { key: 'topology', label: '网络拓扑', icon: <CloudServerOutlined /> },
    { key: 'upload', label: '配置上传', icon: <UploadOutlined /> },
  ];
  const handleMenuClick = ({ key }) => {
    navigate(`/${key}`);
  };
  const pathKey = location.pathname.slice(1) || 'topology';
  const selectedKey = menuItems.some((item) => item.key === pathKey) ? pathKey : 'topology';

  const status = useMemo(() => getTopologyHealth(networkTopology), [networkTopology]);

  const menuDisplayItems = menuItems.map((item) => ({
    key: item.key,
    icon: React.cloneElement(item.icon, { style: { fontSize: 18 } }),
    label: <span style={{ fontSize: 18, fontWeight: 500 }}>{item.label}</span>,
  }));

  return (
    <Sider 
        width={260}
        style={{
            height: '100vh',
            background: '#0b1220',
        }}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', marginLeft: 12 }}>
        <div
          style={{
            height: 64,
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 10,
            borderBottom: '1px solid rgba(148,163,184,0.15)',
          }}
        >
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 10 }}>
          <Menu
            theme="dark"
            mode="inline"
            itemHeight={56}
            selectedKeys={[selectedKey]}
            onClick={handleMenuClick}
            items={menuDisplayItems}
            inlineIndent={18}
            style={{
              borderRight: 0,
              background: 'transparent',
              color: '#e5e7eb',
              marginTop: 10,
            }}
          />

          <div
            style={{
              marginTop: 450,
              padding: '14px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              borderTop: '1px solid rgba(148,163,184,0.2)',
            }}  
          >
              <div style={{ color: 'rgba(148,163,184,0.95)', fontSize: 13, fontWeight: 600 }}>
                设备活跃数
              </div>
              <div style={{ height: 8, borderRadius: 6, background: 'rgba(148,163,184,0.2)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                  }}
                />
              </div>
              <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                {status.activeDevices} / {status.deviceTotal}
              </div>

              <div style={{ color: 'rgba(148,163,184,0.95)', fontSize: 13, fontWeight: 600 }}>
                链路活跃数
              </div>
              <div style={{ height: 8, borderRadius: 6, background: 'rgba(148,163,184,0.2)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, #38bdf8, #0ea5e9)',
                  }}
                />
              </div>
              <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                {status.activeLinks} / {status.linkTotal}
              </div>

              <div style={{ marginTop: 2 }}>
                <div style={{ color: 'rgba(148,163,184,0.95)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  健康度评分
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ color: '#22d3ee', fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{status.healthScore}</span>
                  <span style={{ color: 'rgba(148,163,184,0.95)', fontSize: 12 }}>/ 100</span>
                </div>
              </div>

              <div
                style={{
                  marginTop: 4,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                <div style={{ background: 'rgba(15,23,42,0.78)', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ color: '#fb923c', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{status.issueDevices}</div>
                  <div style={{ color: 'rgba(148,163,184,0.95)', fontSize: 12, marginTop: 4 }}>异常设备</div>
                </div>
                <div style={{ background: 'rgba(15,23,42,0.78)', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ color: '#38bdf8', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{status.issueLinks}</div>
                  <div style={{ color: 'rgba(148,163,184,0.95)', fontSize: 12, marginTop: 4 }}>异常链路</div>
                </div>
              </div>
          </div>
        </div>
      </div>
    </Sider>
  );
};

export default Sidebar;
