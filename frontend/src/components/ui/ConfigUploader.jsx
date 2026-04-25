import React from 'react';
import { Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { uploadTopologyFile } from '../../api/topology/topologyApi';

const { Dragger } = Upload;

const withComputedPosition = (cfg) => {
  /*** 根据设备角色分层 */
  const roleGroups = {core: [], aggregation: [], access: [], edge: [], terminal: []};
  const devices = cfg.devices;
  devices.forEach((device) => {
    const role = String(device?.role || '').toLowerCase();
    if (role === 'core') roleGroups.core.push(device);
    else if (role === 'aggregation') roleGroups.aggregation.push(device);
    else if (role === 'access') roleGroups.access.push(device);
    else if (role === 'edge') roleGroups.edge.push(device);
    else roleGroups.terminal.push(device);
  });

  /*** 根据角色分层计算布局 */
  const layout = {};
  const layers = [
    { key: 'core', z: -6, spacing: 6 },
    { key: 'aggregation', z: 0, spacing: 6 },
    { key: 'access', z: 6, spacing: 6 },
    { key: 'edge', z: 12, spacing: 6 },
    { key: 'terminal', z: 18, spacing: 3 },
  ];
  layers.forEach(({ key, z, spacing }) => {
    const nodes = roleGroups[key] || [];
    nodes.forEach((device, i) => {
      layout[device.id] = { x: (i - (nodes.length - 1) / 2) * spacing, y: 0, z };
    });
  });

  /*** 构建前端拓扑数据 */
  const Devices = devices.map((device) => ({
    id: String(device.id),
    name: device.name,
    role: device.role,
    deviceType: device.deviceType,
    ip: device.ip,
    netmask: device.netmask,
    status: device.status,
    ospf: device.ospf,
    interfaces: device.interfaces,
    vlan: device.vlan,
    position: layout[device.id],
  }));

  const Links = (cfg.links).map((link) => ({
    id: String(link.id),
    srcDevice: String(link.srcDevice),
    dstDevice: String(link.dstDevice),
    srcInterface: link.srcInterface,
    dstInterface: link.dstInterface,
    status: link.status,
    bandwidth: link.bandwidth,
    ospfCost: link.ospfCost,
  }));

  return {
    ospfReferenceBandwidth: cfg.ospfReferenceBandwidth,
    devices: Devices,
    links: Links,
  };
};

const ConfigUploader = ({ onConfigLoaded, setNetworkTopology }) => {
  const handleUpload = async (file) => {
    const isYaml = file.name.endsWith('.yaml') || file.name.endsWith('.yml');
    if (!isYaml) {
      message.error('请上传 YAML 格式配置文件');
      return Upload.LIST_IGNORE;
    }
    try {
      const topology = await uploadTopologyFile(file);
      const frontendTopology = withComputedPosition(topology);
      setNetworkTopology(frontendTopology);
      if (onConfigLoaded) onConfigLoaded(frontendTopology);
      message.success('配置加载成功');
    } catch {
      message.error('配置加载失败');
    }
    return false;
  };

  const props = {
    name: 'file',
    multiple: false,
    showUploadList: false,
    beforeUpload: handleUpload,
    onDrop(e) {
      console.log('Dropped files', e.dataTransfer.files);
    },
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: '50%', height: '50%' }}>
        <Dragger
          name={props.name}
          multiple={props.multiple}
          showUploadList={props.showUploadList}
          beforeUpload={props.beforeUpload}
          onDrop={props.onDrop}
          style={{ padding: 40, height: '100%', minHeight: 360 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
          <p className="ant-upload-hint">仅支持 YAML (.yaml, .yml)</p>
        </Dragger>
      </div>
    </div>
  );
};

export default ConfigUploader;