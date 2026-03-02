import React, { useMemo, useState } from 'react';
import { Table, Typography, Button, ConfigProvider, theme, Modal, Input } from 'antd';
import { 
  LaptopOutlined, 
  ClusterOutlined, 
  ApartmentOutlined,
  PartitionOutlined, 
  SettingOutlined,
  CloseOutlined,
  CloudServerOutlined,
  GatewayOutlined,
  SafetyCertificateOutlined,
  ArrowUpOutlined,
  ApiOutlined
} from '@ant-design/icons';
import { useAppStore } from '../../stores';
import { DeviceStatus } from '../../types';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { getAllVlans } from '../../utils/net';

const { Text, Title } = Typography;

const DevicePanel = () => {
  const { selectedDeviceId, setSelectedDevice, networkTopology, deviceStatuses } = useAppStore();
  const [routingModalOpen, setRoutingModalOpen] = useState(false);
  const [routingFilter, setRoutingFilter] = useState('');

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
    if (t.includes('firewall')) return <SafetyCertificateOutlined style={style} />;
    return <LaptopOutlined style={style} />;
  };

  const typeLabel = (deviceType) => {
    const type = (deviceType || '').toLowerCase();
    if (type.includes('pc') || type.includes('host') || type.includes('terminal')) return '终端主机';
    if (type.includes('router')) return '路由器';
    if (type.includes('switch')) return '交换机';
    if (type.includes('server')) return '服务器';
    if (type.includes('firewall')) return '防火墙';
    if (type.includes('access_point')) return '无线 AP';
    return '通用设备';
  };

  const normalizeStatus = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'up' || s === 'active' || s === 'online') return DeviceStatus.ONLINE;
    if (s === 'down' || s === 'offline') return DeviceStatus.OFFLINE;
    if (s === 'warning') return DeviceStatus.WARNING;
    if (s === 'error') return DeviceStatus.ERROR;
    if (s === 'maintenance') return DeviceStatus.MAINTENANCE;
    return status;
  };

  const effectiveStatus = deviceStatuses.get(device.id) || normalizeStatus(device.status);

  const getStatusColor = (status) => {
    switch (status) {
      case DeviceStatus.ONLINE: return '#22c55e'; // green-500
      case DeviceStatus.WARNING: return '#eab308'; // yellow-500
      case DeviceStatus.ERROR: return '#ef4444'; // red-500
      case DeviceStatus.OFFLINE: return '#64748b'; // slate-500
      default: return '#64748b';
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case DeviceStatus.ONLINE: return 'rgba(34, 197, 94, 0.1)';
      case DeviceStatus.WARNING: return 'rgba(234, 179, 8, 0.1)';
      case DeviceStatus.ERROR: return 'rgba(239, 68, 68, 0.1)';
      case DeviceStatus.OFFLINE: return 'rgba(100, 116, 139, 0.1)';
      default: return 'rgba(100, 116, 139, 0.1)';
    }
  };

  const getStatusBorder = (status) => {
      switch (status) {
        case DeviceStatus.ONLINE: return 'rgba(34, 197, 94, 0.3)';
        case DeviceStatus.WARNING: return 'rgba(234, 179, 8, 0.3)';
        case DeviceStatus.ERROR: return 'rgba(239, 68, 68, 0.3)';
        case DeviceStatus.OFFLINE: return 'rgba(100, 116, 139, 0.3)';
        default: return 'rgba(100, 116, 139, 0.3)';
      }
  };

  const statusLabel = (status) => {
    switch (status) {
      case DeviceStatus.ONLINE: return '在线 (Online)';
      case DeviceStatus.WARNING: return '警告 (Warning)';
      case DeviceStatus.ERROR: return '故障 (Error)';
      case DeviceStatus.OFFLINE: return '离线 (Offline)';
      case DeviceStatus.MAINTENANCE: return '维护中';
      default: return '未知';
    }
  };

  const getOspfConfig = (device) => {
    return device.ospf || device.configuration?.ospf;
  };

  const getRoutingTable = (device) => {
    const rt = device.routing_table || device.configuration?.routing_table;
    return Array.isArray(rt) ? rt : [];
  };

  const getVlanInfo = (device) => {
    const nameMap = new Map();
    const list = device.vlans || device.configuration?.vlans;
    if (Array.isArray(list)) {
      list.forEach(v => {
        if (v && typeof v === 'object' && v.vlan_id != null) nameMap.set(Number(v.vlan_id), v.name);
      });
    }
    return getAllVlans(device).map(id => ({ id, name: nameMap.get(id) || `VLAN ${id}` }));
  };

  const ospfConfig = getOspfConfig(device);
  const routingTable = getRoutingTable(device);
  const vlanList = getVlanInfo(device);
  const dType = device.role || device.device_type;
  const statusColor = getStatusColor(effectiveStatus);
  const rawIp = device.ip ?? device.ipAddress ?? device.interfaces?.find(i => i?.ip)?.ip;
  const primaryIp = rawIp != null && rawIp !== '' ? (typeof rawIp === 'string' && rawIp.includes('/') ? rawIp.split('/')[0] : rawIp) : '-';
  const primaryNetmask = device.netmask ?? device.interfaces?.find(i => i?.ip)?.netmask ?? device.interfaces?.[0]?.netmask ?? (typeof rawIp === 'string' && rawIp.includes('/') ? `/${rawIp.split('/')[1]}` : undefined);

  const q = String(routingFilter || '').trim().toLowerCase();
  const filteredRoutingTable = !q
    ? routingTable
    : routingTable.filter((r) => {
        const destination = String(r?.destination ?? '').toLowerCase();
        const nextHop = String(r?.next_hop ?? '').toLowerCase();
        const outIf = String(r?.out_interface ?? '').toLowerCase();
        const cost = String(r?.cost ?? '').toLowerCase();
        return destination.includes(q) || nextHop.includes(q) || outIf.includes(q) || cost.includes(q);
      });

  const routingColumns = [
    {
      title: '目的地',
      dataIndex: 'destination',
      key: 'destination',
      width: 140,
      render: (text) => <span style={{ fontWeight: 500, color: '#e2e8f0', fontFamily: 'monospace' }}>{text || '-'}</span>,
      sorter: (a, b) => String(a?.destination ?? '').localeCompare(String(b?.destination ?? ''))
    },
    {
      title: '下一跳',
      key: 'next_hop',
      width: 120,
      render: (_, record) => {
        const v = record?.next_hop;
        return <span style={{ fontFamily: 'monospace', color: '#93c5fd' }}>{v || '-'}</span>;
      },
      sorter: (a, b) => String(a?.next_hop ?? '').localeCompare(String(b?.next_hop ?? ''))
    },
    {
      title: '出接口',
      key: 'out_interface',
      width: 120,
      render: (_, record) => {
        const v = record?.out_interface;
        return <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{v || '-'}</span>;
      },
      sorter: (a, b) => String(a?.out_interface ?? '').localeCompare(String(b?.out_interface ?? ''))
    },
    {
      title: 'Cost',
      dataIndex: 'cost',
      key: 'cost',
      width: 80,
      render: (v) => <span style={{ fontFamily: 'monospace', color: '#4ade80', fontWeight: 700 }}>{v ?? '-'}</span>,
      sorter: (a, b) => Number(a?.cost ?? 0) - Number(b?.cost ?? 0)
    }
  ];

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
    <AnimatePresence>
        <Motion.div
          initial={{ y: -50, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -50, opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute',
            top: 24,
            left: '50%',
            x: '-50%',
            zIndex: 1000,
            width: 700,
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(15, 23, 42, 0.9)', // Slate-900
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(56, 189, 248, 0.2)', // Sky-400 border
            borderRadius: 16,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
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
                    background: getStatusBg(effectiveStatus),
                    border: `1px solid ${getStatusBorder(effectiveStatus)}`,
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
                            {typeLabel(dType)}
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
                            {statusLabel(effectiveStatus)}
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
                                    <span style={{ fontFamily: 'monospace', color: '#e2e8f0', fontWeight: 700 }}>{ospfConfig.router_id}</span>
                                </div>
                                <div style={{ background: 'rgba(15, 23, 42, 0.3)', padding: 12, borderRadius: 8, border: '1px solid rgba(51, 65, 85, 0.3)' }}>
                                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>区域 (Area)</span>
                                    <span style={{ fontFamily: 'monospace', color: '#4ade80', fontWeight: 700, fontSize: 16 }}>{ospfConfig.area}</span>
                                </div>
                             </div>
                        </div>
                    )}

                    {routingTable.length > 0 && (
                        <div style={{ marginBottom: 16, background: 'rgba(30, 41, 59, 0.3)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, overflow: 'hidden' }}>
                            <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '8px 16px', borderBottom: '1px solid rgba(51, 65, 85, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 11, fontWeight: 600, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <ApartmentOutlined style={{ color: '#60a5fa' }} /> 路由表 ({routingTable.length})
                                </span>
                                <Button size="small" onClick={() => setRoutingModalOpen(true)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}>
                                    查看全部
                                </Button>
                             </div>
                             <div style={{ padding: 16 }}>
                                <Table
                                    dataSource={routingTable.slice(0, 8)}
                                    columns={routingColumns}
                                    pagination={false}
                                    size="small"
                                    rowKey={(r, idx) => `${r?.destination ?? 'dst'}-${r?.next_hop ?? r?.nextHop ?? 'nh'}-${r?.out_interface ?? r?.outInterface ?? 'oi'}-${idx}`}
                                />
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
        </Motion.div>

        <Modal
            title={`路由表 - ${device.name}`}
            open={routingModalOpen}
            onCancel={() => setRoutingModalOpen(false)}
            footer={null}
            width={760}
            styles={{
                body: { background: 'rgba(15, 23, 42, 0.98)' },
                header: { background: 'rgba(15, 23, 42, 0.98)' },
                content: { background: 'rgba(15, 23, 42, 0.98)', border: '1px solid rgba(56, 189, 248, 0.2)' }
            }}
        >
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <Input
                    value={routingFilter}
                    onChange={(e) => setRoutingFilter(e.target.value)}
                    placeholder="搜索：目的地 / 下一跳 / 出接口 / cost"
                    allowClear
                />
                <Button onClick={() => setRoutingFilter('')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}>
                    清空
                </Button>
            </div>
            <Table
                dataSource={filteredRoutingTable}
                columns={routingColumns}
                size="small"
                rowKey={(r, idx) => `${r?.destination ?? 'dst'}-${r?.next_hop ?? 'nh'}-${r?.out_interface ?? 'oi'}-${idx}`}
                pagination={{ pageSize: 10, showSizeChanger: false }}
            />
        </Modal>
    </AnimatePresence>
  );
};

export default DevicePanel;
