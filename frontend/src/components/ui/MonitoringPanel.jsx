import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic, Progress, Empty, Tag } from 'antd';
import { 
  DashboardOutlined, 
  CloudServerOutlined, 
  WarningOutlined, 
  ThunderboltOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { useAppStore } from '../../stores';
import { DeviceStatus } from '../../types';
import SparkLine from './charts/SparkLine';
import { isLinkActive, getAllVlans, getEndpointAccessVlan } from '../../utils/net';

const MonitoringPanel = () => {
  const { networkTopology, deviceStatuses } = useAppStore();

  const devices = useMemo(() => networkTopology?.devices || [], [networkTopology]);
  const connections = useMemo(() => networkTopology?.links || networkTopology?.connections || [], [networkTopology]);

  const normalizeStatus = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'up' || s === 'active' || s === 'online') return DeviceStatus.ONLINE;
    if (s === 'down' || s === 'offline') return DeviceStatus.OFFLINE;
    if (s === 'warning') return DeviceStatus.WARNING;
    if (s === 'error') return DeviceStatus.ERROR;
    return DeviceStatus.ONLINE;
  };

  const statusCounts = useMemo(() => {
    const counts = {
      [DeviceStatus.ONLINE]: 0,
      [DeviceStatus.OFFLINE]: 0,
      [DeviceStatus.WARNING]: 0,
      [DeviceStatus.ERROR]: 0,
    };
    
    devices.forEach(device => {
      const status = normalizeStatus(deviceStatuses.get(device.id) || device.status || DeviceStatus.OFFLINE);
      if (counts[status] !== undefined) counts[status]++;
    });
    return counts;
  }, [devices, deviceStatuses]);

  const systemHealth = useMemo(() => {
    if (devices.length === 0) return 100;
    const totalScore = devices.reduce((acc, device) => {
        const status = normalizeStatus(deviceStatuses.get(device.id) || device.status || DeviceStatus.ONLINE);
        if (status === DeviceStatus.ONLINE) return acc + 100;
        if (status === DeviceStatus.WARNING) return acc + 70;
        if (status === DeviceStatus.ERROR) return acc + 40;
        return acc + 0;
    }, 0);
    return Math.round(totalScore / devices.length);
  }, [devices, deviceStatuses]);

  const getOspfArea = (device) => {
    const ospf = device.ospf || device.configuration?.ospf;
    return ospf?.area;
  };

  const getRandomData = () => Array.from({ length: 10 }, () => Math.floor(Math.random() * 40) + 60);
  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
      <h2 style={{ color: '#fff', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <DashboardOutlined style={{ color: '#1890ff' }} /> 系统监控
      </h2>

      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} xl={6}>
          <Card bordered={false} hoverable style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(8px)', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            <Statistic 
              title={<span style={{ color: '#94a3b8' }}>系统健康度</span>}
              value={systemHealth} 
              suffix="%" 
              valueStyle={{ color: systemHealth > 80 ? '#52c41a' : systemHealth > 50 ? '#faad14' : '#f5222d', fontWeight: 'bold' }}
              prefix={<DashboardOutlined style={{ marginRight: 8 }} />}
            />
            <div style={{ height: 40, marginTop: 16 }}>
               <SparkLine data={[65, 70, 68, 72, 75, 80, 85, 82, 88, systemHealth]} width={200} height={40} color="#1890ff" fill />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card bordered={false} hoverable style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(8px)', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            <Statistic 
              title={<span style={{ color: '#94a3b8' }}>在线设备</span>}
              value={statusCounts[DeviceStatus.ONLINE]} 
              suffix={`/ ${devices.length}`}
              valueStyle={{ color: '#52c41a', fontWeight: 'bold' }}
              prefix={<CloudServerOutlined style={{ marginRight: 8 }} />}
            />
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#52c41a', background: 'rgba(82,196,26,0.1)', padding: '4px 8px', borderRadius: 4, width: 'fit-content' }}>
              <CheckCircleOutlined /> 系统运行正常
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card bordered={false} hoverable style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(8px)', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            <Statistic 
              title={<span style={{ color: '#94a3b8' }}>活跃告警</span>}
              value={statusCounts[DeviceStatus.WARNING] + statusCounts[DeviceStatus.ERROR]} 
              valueStyle={{ color: '#faad14', fontWeight: 'bold' }}
              prefix={<WarningOutlined style={{ marginRight: 8 }} />}
            />
            <div style={{ height: 40, marginTop: 16 }}>
              <SparkLine data={getRandomData()} width={200} height={40} color="#faad14" fill />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card bordered={false} hoverable style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(8px)', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            <Statistic 
              title={<span style={{ color: '#94a3b8' }}>活跃链路</span>}
              value={connections.filter(c => isLinkActive(c.status)).length} 
              suffix={`/ ${connections.length}`}
              valueStyle={{ color: '#722ed1', fontWeight: 'bold' }}
              prefix={<ThunderboltOutlined style={{ marginRight: 8 }} />}
            />
            <Progress percent={100} showInfo={false} strokeColor={{ from: '#722ed1', to: '#c084fc' }} trailColor="rgba(255,255,255,0.05)" style={{ marginTop: 24 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={8}>
          <Card title={<span style={{ color: '#e2e8f0' }}>设备分布</span>} bordered={false} hoverable style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(8px)', borderRadius: 12, height: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} headStyle={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
             {Object.entries(devices.reduce((acc, curr) => {
               const type = (curr.role || curr.deviceType || curr.device_type || 'unknown').toLowerCase();
               acc[type] = (acc[type] || 0) + 1;
               return acc;
             }, {})).map(([type, count]) => {
                const percentage = (count / devices.length) * 100;
                return (
                  <div key={type} style={{ marginBottom: 16 }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ textTransform: 'capitalize', color: '#cbd5e1' }}>{type}</span>
                        <span style={{ color: '#94a3b8' }}>{count}</span>
                     </div>
                     <Progress percent={percentage} showInfo={false} strokeColor={{ from: '#108ee9', to: '#87d068' }} trailColor="rgba(255,255,255,0.05)" />
                  </div>
                );
             })}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={<span style={{ color: '#e2e8f0' }}>VLAN 配置</span>} bordered={false} hoverable style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(8px)', borderRadius: 12, height: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} headStyle={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
             {(() => {
                const allVlans = new Set();
                devices.forEach(d => getAllVlans(d).forEach(v => allVlans.add(v)));
                const sortedVlans = Array.from(allVlans).sort((a,b) => a-b).slice(0, 10);
                
                if (sortedVlans.length === 0) return <Empty description={<span style={{ color: '#64748b' }}>未发现 VLAN 配置</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />;

                return sortedVlans.map(vlanId => {
                   const count = devices.filter(d => getEndpointAccessVlan(d) === vlanId).length;
                   return (
                       <div key={vlanId} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                         <span><Tag color="purple" style={{ borderRadius: 4, border: 'none', background: 'rgba(114, 46, 209, 0.2)' }}>VLAN {vlanId}</Tag></span>
                         <span style={{ color: '#94a3b8' }}>{count} 设备</span>
                       </div>
                   );
                });
             })()}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={<span style={{ color: '#e2e8f0' }}>OSPF 区域</span>} bordered={false} hoverable style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(8px)', borderRadius: 12, height: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} headStyle={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
             {(() => {
                const areas = new Set();
                devices.forEach(d => {
                    const area = getOspfArea(d);
                    if (area !== undefined) areas.add(area);
                });
                const sortedAreas = Array.from(areas).sort();

                if (sortedAreas.length === 0) return <Empty description={<span style={{ color: '#64748b' }}>未发现 OSPF 配置</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />;

                return sortedAreas.map(areaId => (
                    <Card key={areaId} size="small" bordered={false} style={{ marginBottom: 12, background: 'linear-gradient(135deg, rgba(82, 196, 26, 0.1) 0%, rgba(82, 196, 26, 0.05) 100%)', borderRadius: 8 }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                             <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Area ID</div>
                             <div style={{ fontSize: 20, fontWeight: 'bold', color: '#e2e8f0' }}>{areaId}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                             <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
                               {devices.filter(d => getOspfArea(d) === areaId).length}
                             </div>
                             <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>路由器</div>
                          </div>
                       </div>
                    </Card>
                 ));
             })()}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MonitoringPanel;
