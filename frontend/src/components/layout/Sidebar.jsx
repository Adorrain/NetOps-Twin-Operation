import React from 'react';
import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { 
  CloudServerOutlined, 
  UploadOutlined
} from '@ant-design/icons';
import { isLinkActive } from '../../utils/utils';

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

  const pathKey = location.pathname.substring(1) || 'topology';
  const selectedKey = menuItems.some(i => i.key === pathKey) ? pathKey : 'topology';

  const stats = useMemo(() => {
    const devices = Array.isArray(networkTopology?.devices) ? networkTopology.devices : [];
    const links = Array.isArray(networkTopology?.links) ? networkTopology.links : [];
    const normalizeStatus = (status) => String(status || '').toLowerCase();

    const activeDevices = devices.filter((device) => {
      const s = normalizeStatus(device?.status);
      return s !== 'offline' && s !== 'down';
    }).length;
    const activeLinks = links.filter((link) => isLinkActive(link?.status)).length;
    const offlineDevices = devices.filter((device) => {
      const s = normalizeStatus(device?.status);
      return s === 'offline' || s === 'down';
    }).length;
    const issueDevices = devices.filter((device) => {
      const s = normalizeStatus(device?.status);
      return s === 'offline' || s === 'down' || s === 'warning' || s === 'error';
    }).length;
    const issueLinks = links.filter((link) => {
      const s = normalizeStatus(link?.status);
      return s === 'down' || s === 'degraded' || s === 'failed';
    }).length;

    const deviceTotal = devices.length;
    const linkTotal = links.length;
    const deviceRatio = deviceTotal ? Math.round((activeDevices / deviceTotal) * 100) : 0;
    const linkRatio = linkTotal ? Math.round((activeLinks / linkTotal) * 100) : 0;
    const healthScore = Math.round(deviceRatio * 0.65 + linkRatio * 0.35);

    return {
      activeDevices,
      deviceTotal,
      deviceRatio,
      activeLinks,
      linkTotal,
      linkRatio,
      offlineDevices,
      issueDevices,
      issueLinks,
      totalAlarms: issueDevices + issueLinks,
      healthScore,
    };
  }, [networkTopology]);

  const menuDisplayItems = useMemo(() => {
    return menuItems.map((item) => ({
      ...item,
      icon: React.cloneElement(item.icon, { style: { fontSize: 18 } }),
      label: <span style={{ fontSize: 16, fontWeight: 500 }}>{item.label}</span>,
    }));
  }, []);

  return (
    <Sider 
        breakpoint="lg"
        width={260}
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
              marginTop: 200,
              padding: '14px 10px 0',
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
                    width: `${stats.deviceRatio}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                    transition: 'width 220ms ease',
                  }}
                />
              </div>
              <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                {stats.activeDevices} / {stats.deviceTotal}
              </div>

              <div style={{ color: 'rgba(148,163,184,0.95)', fontSize: 13, fontWeight: 600 }}>
                链路活跃数
              </div>
              <div style={{ height: 8, borderRadius: 6, background: 'rgba(148,163,184,0.2)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${stats.linkRatio}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #38bdf8, #0ea5e9)',
                    transition: 'width 220ms ease',
                  }}
                />
              </div>
              <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                {stats.activeLinks} / {stats.linkTotal}
              </div>

              <div style={{ marginTop: 2 }}>
                <div style={{ color: 'rgba(148,163,184,0.95)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  健康度评分
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ color: '#22d3ee', fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{stats.healthScore}</span>
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
                  <div style={{ color: '#f87171', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{stats.offlineDevices}</div>
                  <div style={{ color: 'rgba(148,163,184,0.95)', fontSize: 12, marginTop: 4 }}>离线设备</div>
                </div>
                <div style={{ background: 'rgba(15,23,42,0.78)', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ color: '#fb923c', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{stats.issueDevices}</div>
                  <div style={{ color: 'rgba(148,163,184,0.95)', fontSize: 12, marginTop: 4 }}>异常设备</div>
                </div>
                <div style={{ background: 'rgba(15,23,42,0.78)', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ color: '#38bdf8', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{stats.issueLinks}</div>
                  <div style={{ color: 'rgba(148,163,184,0.95)', fontSize: 12, marginTop: 4 }}>异常链路</div>
                </div>
                <div style={{ background: 'rgba(15,23,42,0.78)', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ color: '#facc15', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{stats.totalAlarms}</div>
                  <div style={{ color: 'rgba(148,163,184,0.95)', fontSize: 12, marginTop: 4 }}>告警总数</div>
                </div>
              </div>
          </div>
        </div>
      </div>
    </Sider>
  );
};

export default Sidebar;
