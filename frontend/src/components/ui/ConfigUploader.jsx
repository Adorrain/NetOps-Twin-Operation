import React, { useState } from 'react';
import { Upload, message, Card, Spin } from 'antd';
import { InboxOutlined, FileTextOutlined } from '@ant-design/icons';
import { useAppStore } from '../../stores';
import { uploadTopologyFile } from '../../api/topology/topologyApi';
import { getEndpointAccessVlan } from '../../utils/net';

const { Dragger } = Upload;

const inferRole = (device) => {
  const name = String(device?.name || '').toLowerCase();
  if (device?.role) return String(device.role).toLowerCase();
  if (name.includes('核心') || name.includes('core')) return 'core';
  if (name.includes('汇聚') || name.includes('agg') || name.includes('distribution')) return 'aggregation';
  if (name.includes('接入') || name.includes('access') || name.includes('edge')) return 'access';
  if (name.includes('防火墙') || name.includes('firewall') || name.includes('fw')) return 'firewall';
  const t = String(device?.deviceType || device?.device_type || device?.type || '').toLowerCase();
  if (t === 'router') return 'core';
  if (t === 'switch' || t === 'l2_switch') return 'access';
  if (t === 'l3_switch') return 'aggregation';
  if (t === 'firewall') return 'firewall';
  return 'terminal';
};

const calculateLayout = (devices) => {
  const core = devices.filter((d) => inferRole(d) === 'core');
  const agg = devices.filter((d) => inferRole(d) === 'aggregation');
  const access = devices.filter((d) => inferRole(d) === 'access');
  const others = devices.filter((d) => !['core', 'aggregation', 'access'].includes(inferRole(d)));
  const layout = {};
  const spacingX = 6;
  core.forEach((d, i) => {
    layout[d.id] = { x: (i - (core.length - 1) / 2) * spacingX, y: 0, z: -5 };
  });
  agg.forEach((d, i) => {
    layout[d.id] = { x: (i - (agg.length - 1) / 2) * spacingX, y: 0, z: 2 };
  });
  access.forEach((d, i) => {
    layout[d.id] = { x: (i - (access.length - 1) / 2) * spacingX, y: 0, z: 9 };
  });
  others.forEach((d, i) => {
    layout[d.id] = { x: (i - (others.length - 1) / 2) * (spacingX / 2), y: 0, z: 15 };
  });
  return layout;
};

const buildFrontendTopology = (cfg) => {
  const computedLayout = calculateLayout(cfg.devices || []);
  const devices = (cfg.devices || []).map((d) => {
    const routingTableRaw = d.routing_table || d.routingTable || d.configuration?.routing_table || d.configuration?.routingTable;
    const routingTable = Array.isArray(routingTableRaw) ? routingTableRaw : [];
    // 后端 normalize 后 OSPF 在 configuration.ospf，保留两者以便 OSPF 操作与系统监控都能拿到
    const ospfConfig = d.ospf ?? d.configuration?.ospf;
    return {
      id: String(d.id),
      name: d.name,
      role: inferRole(d),
      deviceType: d.deviceType || d.device_type || d.type || 'unknown',
      position: d.position || computedLayout[d.id] || { x: Math.random() * 20 - 10, y: 0, z: Math.random() * 20 - 10 },
      status: d.status === 'down' || d.status === 'offline' ? 'offline' : 'online',
      vlan: getEndpointAccessVlan(d) ?? undefined,
      configuration: {
        ...d.configuration,
        ospf: ospfConfig,
        routing_table: routingTable
      },
      metrics: d.metrics || {
        cpuUsage: Math.floor(Math.random() * 30),
        memoryUsage: Math.floor(Math.random() * 40),
        diskUsage: 20,
        networkIn: 0,
        networkOut: 0,
        uptime: 0,
        lastUpdated: new Date()
      },
      ip: d.ip ?? (Array.isArray(d.interfaces) && d.interfaces.length > 0 ? d.interfaces.find(it => it?.ip)?.ip?.split?.('/')?.[0] ?? d.interfaces[0]?.ip : undefined),
      netmask: d.netmask ?? (Array.isArray(d.interfaces) && d.interfaces.length > 0 ? d.interfaces.find(it => it?.ip)?.netmask ?? d.interfaces[0]?.netmask : undefined),
      ipAddress: d.ip ?? (Array.isArray(d.interfaces) && d.interfaces.length > 0 ? d.interfaces.find(it => it?.ip)?.ip : undefined),
      macAddress: d.mac_address,
      description: d.description,
      interfaces: d.interfaces || [],
      ospf: ospfConfig,
      routing_table: routingTable
    };
  });
  const connections = (cfg.links || cfg.connections || []).map((c) => ({
    id: c.id,
    sourceDeviceId: String(c.src_device_id || c.src_device || c.source || c.sourceDeviceId),
    targetDeviceId: String(c.dst_device_id || c.dst_device || c.target || c.targetDeviceId),
    connectionType: c.type || 'ethernet',
    status: c.status || 'up',
    from: String(c.src_device_id || c.src_device || c.source || c.sourceDeviceId),
    to: String(c.dst_device_id || c.dst_device || c.target || c.targetDeviceId),
    bandwidth: c.bandwidth || 1000,
    latency: c.latency || 1,
    packetLoss: c.packet_loss || 0
  }));
  return {
    id: 'imported-topology',
    name: cfg.topology?.name || cfg.name || '导入的拓扑',
    description: cfg.description,
    devices,
    connections,
    createdAt: new Date(),
    updatedAt: new Date()
  };
};

const ConfigUploader = ({ onConfigLoaded }) => {
  const { setLoading, addNotification, setNetworkTopology } = useAppStore();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file) => {
    const isYamlOrJson = file.name.endsWith('.yaml') || file.name.endsWith('.yml');
    if (!isYamlOrJson) {
      message.error('请上传 YAML 配置文件');
      return Upload.LIST_IGNORE;
    }

    setUploading(true);
    setLoading('config-upload', true);

    try {
      let cfg;
      try {
        cfg = await uploadTopologyFile(file, 300000);
      } catch (err) {
        throw new Error('后端处理失败: ' + err.message);
      }

      const topo = buildFrontendTopology(cfg);
      setNetworkTopology(topo);
      if (onConfigLoaded) onConfigLoaded(topo);
      
      message.success(`配置加载成功: ${topo.name}`);
      addNotification({ type: 'success', title: '配置已加载', message: `拓扑就绪: ${topo.name}` });
    } catch (error) {
      message.error(`加载失败: ${error.message}`);
      addNotification({ type: 'error', title: '加载失败', message: error.message });
    } finally {
      setLoading('config-upload', false);
      setUploading(false);
    }
    return false;
  };

  return (
    <div style={{ width: '100%', height: '100%', padding: 48, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <Card 
          title={<span style={{ fontSize: 18 }}><FileTextOutlined /> 上传网络配置</span>} 
          variant="borderless"
          style={{ 
              width: '100%',
              maxWidth: 800,
              borderRadius: 16, 
              background: 'rgba(30, 41, 59, 0.8)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
              display: 'flex',
              flexDirection: 'column'
          }}
          styles={{ 
            header: { borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '24px', color: '#fff' },
            body: { padding: '32px', display: 'flex', flexDirection: 'column', gap: 32 }
          }}
      >
        <div style={{ height: 360 }}>
            <div style={{ height: '100%', position: 'relative' }}>
            <Dragger 
                name="file"
                multiple={false}
                showUploadList={false}
                beforeUpload={handleUpload}
                disabled={uploading} 
                style={{ 
                    padding: 40, 
                    background: 'rgba(255,255,255,0.02)', 
                    borderColor: '#3b82f6', 
                    height: '100%',
                    borderRadius: 12
                }}
            >
                <p className="ant-upload-drag-icon">
                    <InboxOutlined style={{ color: '#3b82f6', fontSize: 64 }} />
                </p>
                <p className="ant-upload-text" style={{ fontSize: 20, color: '#e2e8f0', marginTop: 24 }}>
                    点击或拖拽文件到此处上传
                </p>
                <p className="ant-upload-hint" style={{ color: '#94a3b8', fontSize: 14, marginTop: 12 }}>
                    仅支持 YAML (.yaml, .yml)
                </p>
            </Dragger>
            {uploading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2, 6, 23, 0.55)', backdropFilter: 'blur(6px)', borderRadius: 12 }}>
                <Spin size="large" tip="正在解析配置…" />
              </div>
            )}
            </div>
        </div>
      </Card>
    </div>
  );
};

export default ConfigUploader;
