import { Upload, message,Empty,Typography } from 'antd';
import { opsApi } from '../../api/api';

const { Dragger } = Upload;
const { Title, Text } = Typography;

const buildTopologyData = (cfg) => {
  const devices = cfg?.devices;
  const links = cfg?.links;
  const roleGroups = {
    core: [],
    aggregation: [],
    access: [],
    edge: [],
    terminal: [],
  };
  devices.forEach((device) => {
    const role = (device?.role || '').toLowerCase();
    if (roleGroups[role]){
      roleGroups[role].push(device);
    } 
    else {
      roleGroups.terminal.push(device);
    }
  });
  const layout = {};
  const layers = [
    { key: 'core', z: -6, spacing: 6 },
    { key: 'aggregation', z: 0, spacing: 6 },
    { key: 'access', z: 6, spacing: 6 },
    { key: 'edge', z: 12, spacing: 6 },
    { key: 'terminal', z: 18, spacing: 3 },
  ];
  layers.forEach(({ key, z, spacing }) => {
    const nodes = roleGroups[key];
    nodes.forEach((device, i) => {
      layout[device.id] = {
        x: (i - (nodes.length - 1) / 2) * spacing,
        y: 0,
        z,
      };
    });
  });

  const Devices = devices.map((device) => ({...device, id: String(device.id), position: layout[device.id] || { x: 0, y: 0, z: 0 },}));
  const Links = links.map((link) => ({...link, id: String(link.id), srcDevice: String(link.srcDevice), dstDevice: String(link.dstDevice),}));
  return {
    ospfReferenceBandwidth: cfg?.ospfReferenceBandwidth,
    devices: Devices,
    links: Links,
  };
};

const ConfigUploader = ({ onConfigLoaded }) => {
  const handleUpload = async (file) => {
    if (!file.name.endsWith('.yaml') && !file.name.endsWith('.yml')) {
      message.error('请上传 YAML 文件');
      return Upload.LIST_IGNORE;
    }

    try {
      const res = await opsApi.uploadTopologyFile(file);
      const topology = buildTopologyData(res);

      onConfigLoaded?.(topology);
      message.success('配置加载成功');
    } catch (e) {
      message.error(`配置加载失败: ${e.message}`);
    }
    return false;
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: '50%', height: '50%' }}>
        <Dragger
          beforeUpload={handleUpload}
          showUploadList={false}
          style={{ padding: 40, height: '100%', minHeight: 360 }}
        >
            <Empty
              description={
                <>
                <Title level={4}>暂无配置文件</Title>
                <Text type="secondary">点击或拖拽文件到此处上传（仅支持.yaml文件）</Text>
                </>
              }
            />
        </Dragger>
      </div>
    </div>
  );
};
export default ConfigUploader;