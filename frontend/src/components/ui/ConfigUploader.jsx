import React, { useState } from 'react';
import { Upload, message, Card, Spin } from 'antd';
import { InboxOutlined, FileTextOutlined } from '@ant-design/icons';
import { uploadTopologyFile } from '../../api/topology/topologyApi';
import { getEndpointAccessVlan } from '../../utils/utils';
import { inferDeviceRole, getDeviceOspfConfig } from '../../utils/deviceUtils';

const { Dragger } = Upload;

const calculateLayout = (devices) => {
  const grouped = {
    core: [],
    aggregation: [],
    access: [],
    edge: [],
    terminal: [],
  };

  devices.forEach((d) => {
    const role = inferDeviceRole(d);
    if (role === 'core') grouped.core.push(d);
    else if (role === 'aggregation') grouped.aggregation.push(d);
    else if (role === 'access') grouped.access.push(d);
    else if (role === 'edge') grouped.edge.push(d);
    else grouped.terminal.push(d);
  });

  const layout = {};
  const spacingX = 6;
  const layers = [
    { key: 'core', z: -5, spacing: spacingX },
    { key: 'aggregation', z: 2, spacing: spacingX },
    { key: 'access', z: 9, spacing: spacingX },
    { key: 'edge', z: 15, spacing: spacingX },
    { key: 'terminal', z: 21, spacing: spacingX / 2 },
  ];

  layers.forEach(({ key, z, spacing }) => {
    const nodes = grouped[key] || [];
    nodes.forEach((d, i) => {
      layout[d.id] = { x: (i - (nodes.length - 1) / 2) * spacing, y: 0, z };
    });
  });
  return layout;
};

const buildFrontendTopology = (cfg) => {
  const computedLayout = calculateLayout(cfg.devices);
  const devices = cfg.devices.map((d) => {
    const routingTable = d.routingTable || d.configuration?.routingTable || [];
    const ospfConfig = getDeviceOspfConfig(d);
    const primaryInterface = d.interfaces?.[0];
    return {
      id: String(d.id),
      name: d.name,
      role: inferDeviceRole(d),
      deviceType: d.deviceType || 'unknown',
      position: d.position || computedLayout[d.id] || { x: Math.random() * 20 - 10, y: 0, z: Math.random() * 20 - 10 },
      status: d.status === 'down' || d.status === 'offline' ? 'offline' : 'online',
      vlan: getEndpointAccessVlan(d) ?? undefined,
      configuration: {
        ...d.configuration,
        ospf: ospfConfig,
        routingTable
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
      ip: d.ip || primaryInterface?.ip?.split('/')?.[0],
      netmask: d.netmask || primaryInterface?.netmask,
      ipAddress: d.ip || primaryInterface?.ip,
      macAddress: d.macAddress,
      description: d.description,
      interfaces: d.interfaces,
      ospf: ospfConfig,
      routingTable
    };
  });
  const links = cfg.links.map((c) => ({
    id: c.id,
    srcDevice: String(c.srcDevice),
    dstDevice: String(c.dstDevice),
    srcInterface: c.srcInterface,
    dstInterface: c.dstInterface,
    status: c.status || 'up',
    bandwidth: c.bandwidth,
    ospfCost: c.ospfCost,
  }));
  return {
    id: 'imported-topology',
    name: cfg.topology?.name || cfg.name || '导入的拓扑',
    description: cfg.description,
    ospfReferenceBandwidth: cfg.ospfReferenceBandwidth,
    devices,
    links,
    createdAt: new Date(),
    updatedAt: new Date()
  };
};

const ConfigUploader = ({ onConfigLoaded, setNetworkTopology }) => {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file) => {
    const isYaml = file.name.endsWith('.yaml') || file.name.endsWith('.yml');
    if (!isYaml) {
      message.error('请上传 YAML 格式配置文件');
      return Upload.LIST_IGNORE;
    }

    setUploading(true);

    try {
      let cfg;
      try {
        cfg = await uploadTopologyFile(file);
      } catch (err) {
        throw new Error('后端处理失败: ' + err.message);
      }

      const topo = buildFrontendTopology(cfg);
      setNetworkTopology(topo);
      if (onConfigLoaded) onConfigLoaded(topo);
      
      message.success(`配置加载成功: ${topo.name}`);
    } catch (error) {
      message.error(`加载失败: ${error.message}`);
    } finally {
      setUploading(false);
    }
    return false;
  };

  return (
    <div style={{ width: '100%', height: '100%', padding: 48, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <Card 
          title={<span style={{ fontSize: 18 }}><FileTextOutlined /> 上传拓扑配置文件</span>} 
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