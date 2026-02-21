import React, { useState } from 'react';
import { Upload, message, Typography, Card, List } from 'antd';
import { InboxOutlined, FileTextOutlined } from '@ant-design/icons';
import { useAppStore } from '../../stores';
import { uploadTopologyFile } from '../../features/topology/topologyApi';
import { buildFrontendTopology } from '../../features/topology/topologyTransform';

const { Dragger } = Upload;
const { Title, Text } = Typography;

const ConfigUploader = ({ onConfigLoaded }) => {
  const { setLoading, addNotification, setNetworkTopology } = useAppStore();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file) => {
    const isYamlOrJson = file.name.endsWith('.yaml') || file.name.endsWith('.yml') || file.name.endsWith('.json');
    if (!isYamlOrJson) {
      message.error('请上传 YAML 或 JSON 配置文件');
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
    return false; // Prevent automatic upload by Antd
  };

  const uploadProps = {
    name: 'file',
    multiple: false,
    showUploadList: false,
    beforeUpload: handleUpload,
    onDrop(e) {
      console.log('Dropped files', e.dataTransfer.files);
    },
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
              background: 'rgba(30, 41, 59, 0.8)', // slate-800 with opacity
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
            <Dragger 
                {...uploadProps} 
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
                    支持 YAML (.yaml, .yml) 和 JSON (.json) 格式
                </p>
            </Dragger>
        </div>

        <div style={{ padding: 24, background: 'rgba(15, 23, 42, 0.6)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
          <Title level={5} style={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: 12, marginBottom: 16, letterSpacing: '0.05em', marginTop: 0 }}>
             配置格式指南
          </Title>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'topology', desc: '拓扑信息 (name, type)' },
              { label: 'devices', desc: '设备列表 (id, name, role, device_type, mgmt_ip 等)' },
              { label: 'links', desc: '链路列表 (id, src_device, dst_device 等)' }
            ].map((item, index) => (
              <div key={item.label} style={{ padding: '6px 0', borderBottom: index < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <Text style={{ color: '#cbd5e1', fontSize: 14 }}>
                  <span style={{ color: '#3b82f6', marginRight: 10 }}>•</span>
                  <Text code style={{ color: '#bae6fd', background: 'rgba(56, 189, 248, 0.1)', borderColor: 'transparent', fontSize: 13, marginRight: 8 }}>{item.label}</Text>
                  <span style={{ color: '#64748b' }}>:</span> {item.desc}
                </Text>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ConfigUploader;
