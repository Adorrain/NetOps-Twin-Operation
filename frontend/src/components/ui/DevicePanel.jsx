import React, { useMemo } from 'react';
import { Table, Button, ConfigProvider, theme } from 'antd';
import { 
  LaptopOutlined, 
  ClusterOutlined, 
  PartitionOutlined, 
  SettingOutlined,
  CloseOutlined,
  CloudServerOutlined,
  GatewayOutlined,
  ArrowUpOutlined,
  ApiOutlined
} from '@ant-design/icons';
import { getAllVlans } from '../../utils/utils';
import {
  normalizeDeviceStatus,
  getDeviceStatusColor,
  getDeviceStatusBg,
  getDeviceStatusBorder,
  getDeviceStatusLabel,
  getDeviceTypeLabel,
  getDeviceOspfConfig,
  getDevicePrimaryIpInfo
} from '../../utils/deviceUtils';

const DevicePanel = ({ selectedDeviceId, networkTopology, setSelectedDevice }) => {

  const device = useMemo(() => {
    if (!selectedDeviceId || !networkTopology || !Array.isArray(networkTopology.devices)) return null;
    return networkTopology.devices.find(d => d.id === selectedDeviceId);
  }, [selectedDeviceId, networkTopology]);

  const onClose = () => {
    setSelectedDevice(null);
  };

  if (!selectedDeviceId || !device) return null;

  // Helpers
  const getDeviceIcon = (type) => {
    const t = (type || '').toLowerCase();
    const style = { fontSize: 24, color: '#fff' };
    if (t.includes('router')) return <ClusterOutlined style={style} />;
    if (t.includes('switch')) return <GatewayOutlined style={style} />;
    if (t.includes('server')) return <CloudServerOutlined style={style} />;
    return <LaptopOutlined style={style} />;
  };

  const effectiveStatus = normalizeDeviceStatus(device.status);

  const getVlanInfo = (device) => {
    return getAllVlans(device).map(id => ({ id, name: `VLAN ${id}` }));
  };

  const ospfConfig = getDeviceOspfConfig(device);
  const vlanList = getVlanInfo(device);
  const dType = device.role || device.deviceType;
  const statusColor = getDeviceStatusColor(effectiveStatus);
  const { primaryIp, primaryNetmask } = getDevicePrimaryIpInfo(device);

  const interfaceColumns = [
    { 
        title: '名称', 
        dataIndex: 'name', 
        key: 'name', 
        width: 100,
        render: text => <span style={{ fontWeight: 500, color: '#e2e8f0', fontFamily: 'monospace' }}>{text}</span>
    },
    { 
        title: 'IP 地址', 
        dataIndex: 'ip', 
        key: 'ip', 
        width: 140,
        render: text => <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{text || '-'}</span>
    },
    { 
        title: 'VLAN', 
        key: 'vlan', 
        render: (_, record) => {
            if (record.mode === 'trunk') return <span style={{ fontSize: 11, color: '#fdba74', background: 'rgba(249, 115, 22, 0.1)', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(249, 115, 22, 0.2)' }}>TRUNK</span>;
            return record.vlan ? <span style={{ fontSize: 11, color: '#d8b4fe', background: 'rgba(168, 85, 247, 0.1)', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(168, 85, 247, 0.2)' }}>{record.vlan}</span> : '-';
        } 
    },
    { 
        title: '模式', 
        dataIndex: 'mode',
        key: 'mode',
        render: text => <span style={{ color: '#94a3b8', fontSize: 12 }}>{text || '-'}</span>
    },
    { 
        title: '状态', 
        dataIndex: 'status', 
        key: 'status', 
        render: s => {
            const isUp = (s === 'up' || !s);
            return (
                <span style={{ 
                    fontSize: 11, 
                    fontWeight: 'bold',
                    color: isUp ? '#4ade80' : '#f87171',
                    background: isUp ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: isUp ? '1px solid rgba(74, 222, 128, 0.2)' : '1px solid rgba(248, 113, 113, 0.2)'
                }}>
                    {isUp ? 'UP' : 'DOWN'}
                </span>
            );
        } 
    }
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        width: 700,
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 16,
        color: '#f8fafc',
        overflow: 'hidden'
      }}
    >
          {/* Header */}
          <div style={{ 
              padding: '16px 24px', 
              borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(90deg, rgba(56, 189, 248, 0.1) 0%, rgba(15, 23, 42, 0) 100%)',
              position: 'sticky',
              top: 0,
              zIndex: 10
          }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ 
                    padding: 16, 
                    borderRadius: 12, 
                    background: getDeviceStatusBg(effectiveStatus),
                    border: `1px solid ${getDeviceStatusBorder(effectiveStatus)}`,
                    backdropFilter: 'blur(4px)',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                   {getDeviceIcon(dType)}
                </div>
                <div>
                    <h2 style={{ margin: '0 0 4px 0', color: '#fff', fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em' }}>{device.name}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ 
                            fontSize: 11, 
                            fontWeight: 600, 
                            padding: '2px 8px', 
                            borderRadius: 4, 
                            background: '#1e293b', 
                            border: '1px solid #334155',
                            color: '#93c5fd',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            {getDeviceTypeLabel(dType)}
                        </span>
                        <span style={{ 
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 11, 
                            fontWeight: 600, 
                            padding: '2px 8px', 
                            borderRadius: 4, 
                            background: '#1e293b', 
                            border: '1px solid #334155',
                            color: '#cbd5e1'
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
                            {getDeviceStatusLabel(effectiveStatus)}
                        </span>
                    </div>
                </div>
             </div>
             <Button 
                type="text" 
                icon={<CloseOutlined style={{ fontSize: 16, color: '#94a3b8' }} />} 
                onClick={onClose}
                style={{ 
                    borderRadius: 8, 
                    width: 36, 
                    height: 36, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.05)'
                }}
             />
          </div>

          {/* Body */}
          <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
             <ConfigProvider
                theme={{
                    algorithm: theme.darkAlgorithm,
                    token: {
                        colorBgContainer: 'transparent',
                        colorBorderSecondary: 'rgba(51, 65, 85, 0.5)', 
                        colorText: '#e2e8f0',
                        colorTextSecondary: '#94a3b8',
                        colorPrimary: '#38bdf8'
                    },
                    components: {
                        Table: {
                            headerBg: 'rgba(30, 41, 59, 0.5)', 
                            headerColor: '#94a3b8',
                            headerSplitColor: 'transparent',
                            borderColor: 'rgba(51, 65, 85, 0.3)',
                            rowHoverBg: 'rgba(56, 189, 248, 0.05)',
                            cellPaddingBlockSM: 12
                        }
                    }
                }}
             >
                {/* Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                    <div style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, padding: 16 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 4, letterSpacing: '0.05em' }}>IP 地址</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontFamily: 'monospace', color: '#93c5fd', fontSize: 16 }}>{primaryIp}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 500 }}>子网掩码</span>
                                <span style={{ fontSize: 13, color: '#93c5fd', fontFamily: 'monospace', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }} title={String(primaryNetmask || '-')}>
                                    {primaryNetmask || '-'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, padding: 16 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 4, letterSpacing: '0.05em' }}>角色 (Role)</span>
                        <span style={{ color: '#e2e8f0', fontSize: 16, textTransform: 'capitalize' }}>{device.role || '-'}</span>
                    </div>
                    {device.description && (
                        <div style={{ gridColumn: 'span 2', background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, padding: 16 }}>
                            <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 4, letterSpacing: '0.05em' }}>描述</span>
                            <span style={{ color: '#cbd5e1', lineHeight: 1.5 }}>{device.description}</span>
                        </div>
                    )}
                </div>

                {/* Details Section */}
                <div>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 16, marginTop: 8 }}>
                        <SettingOutlined style={{ color: '#c084fc' }} />
                        详细配置
                    </h3>

                    {/* VLANs */}
                    {vlanList.length > 0 && (
                        <div style={{ marginBottom: 16, background: 'rgba(30, 41, 59, 0.3)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, overflow: 'hidden' }}>
                             <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '8px 16px', borderBottom: '1px solid rgba(51, 65, 85, 0.5)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <PartitionOutlined style={{ color: '#c084fc' }} /> VLAN 配置
                             </div>
                             <div style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {vlanList.map((v, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.2)', padding: '6px 12px', borderRadius: 8 }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#c084fc', boxShadow: '0 0 5px #a855f7' }} />
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: 11, color: '#e9d5ff', fontWeight: 700, lineHeight: 1 }}>ID: {v.id}</span>
                                            {v.name && <span style={{ fontSize: 10, color: 'rgba(192, 132, 252, 0.7)', lineHeight: 1, marginTop: 2 }}>{v.name}</span>}
                                        </div>
                                    </div>
                                ))}
                             </div>
                        </div>
                    )}

                    {/* OSPF */}
                    {ospfConfig && (
                        <div style={{ marginBottom: 16, background: 'rgba(30, 41, 59, 0.3)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, overflow: 'hidden' }}>
                            <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '8px 16px', borderBottom: '1px solid rgba(51, 65, 85, 0.5)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <ArrowUpOutlined style={{ color: '#4ade80' }} /> OSPF 协议
                             </div>
                             <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div style={{ background: 'rgba(15, 23, 42, 0.3)', padding: 12, borderRadius: 8, border: '1px solid rgba(51, 65, 85, 0.3)' }}>
                                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>路由器 ID</span>
                                    <span style={{ fontFamily: 'monospace', color: '#e2e8f0', fontWeight: 700 }}>{ospfConfig.routerId}</span>
                                </div>
                                <div style={{ background: 'rgba(15, 23, 42, 0.3)', padding: 12, borderRadius: 8, border: '1px solid rgba(51, 65, 85, 0.3)' }}>
                                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>区域 (Area)</span>
                                    <span style={{ fontFamily: 'monospace', color: '#4ade80', fontWeight: 700, fontSize: 16 }}>{ospfConfig.area}</span>
                                </div>
                             </div>
                        </div>
                    )}

                    {/* Interfaces */}
                    <div style={{ background: 'rgba(30, 41, 59, 0.3)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '8px 16px', borderBottom: '1px solid rgba(51, 65, 85, 0.5)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <ApiOutlined style={{ color: '#38bdf8' }} /> 接口列表 ({device.interfaces?.length || 0})
                        </div>
                        {device.interfaces && device.interfaces.length > 0 ? (
                            <Table 
                                dataSource={device.interfaces} 
                                columns={interfaceColumns} 
                                pagination={false} 
                                size="small"
                                rowKey="name"
                            />
                        ) : (
                            <div style={{ textAlign: 'center', padding: 24, color: '#64748b', borderTop: '1px dashed rgba(51, 65, 85, 0.5)', fontSize: 13 }}>
                                暂无接口信息
                            </div>
                        )}
                    </div>
                </div>
             </ConfigProvider>
          </div>
    </div>
  );
};

export default DevicePanel;
