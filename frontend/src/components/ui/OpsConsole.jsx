import React, { useMemo, useState, useEffect } from 'react';
import { 
  Select, Input, Button,
  Modal, Tag, Alert, message, Collapse, Space, 
  Typography, Row, Col, Divider, List, Empty, Card, Form
} from 'antd';
import { 
  CodeOutlined, 
  ShareAltOutlined, 
  ThunderboltOutlined, 
  ApartmentOutlined, 
  DesktopOutlined, 
  PlayCircleOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { DeviceStatus, ConnectionStatus } from '../../types';
import { isVlanCapableDevice } from '../../utils/utils';
import { opsApi } from '../../api/ops/opsApi';

const getResponseMessage = (res, fallback = '操作失败') => res?.message || fallback;

const { Text } = Typography;

const OpsConsole = ({ networkTopology, setNetworkTopology, logs, setOpsLogs }) => {

    // (Ping/Traceroute)
    const [srcId, setSrcId] = useState('');
    const [dstId, setDstId] = useState('');
    const [pingResult, setPingResult] = useState('');
    const [isPinging, setIsPinging] = useState(false);
    const [traceResult, setTraceResult] = useState([]);
    const [isTracing, setIsTracing] = useState(false);
    const [smartSrcId, setSmartSrcId] = useState('');
    const [smartDstId, setSmartDstId] = useState('');
    const [smartRouteResult, setSmartRouteResult] = useState(null);
    const [isSmartRouting, setIsSmartRouting] = useState(false);
  
    // States (Link)
    const [connId, setConnId] = useState('');
    const [connStatus, setConnStatus] = useState(ConnectionStatus.ACTIVE);
  
    // States (Device)
    const [deviceId, setDeviceId] = useState('');
    const [newDeviceStatus, setNewDeviceStatus] = useState(DeviceStatus.ONLINE);
  
    // States (Interface)
    const [ifaceDeviceId, setIfaceDeviceId] = useState('');
    const [ifaceName, setIfaceName] = useState('');
    const [ifaceStatus, setIfaceStatus] = useState('up');
  
    // VLAN
    const [vlanSwitchId, setVlanSwitchId] = useState('');
    const [vlanId, setVlanId] = useState(10);
    const [vlanPort, setVlanPort] = useState('');
    const [vlanMode, setVlanMode] = useState('access');
    const [vlanAllowedVlans, setVlanAllowedVlans] = useState('');
  
    // Logs
    const [logsModalOpen, setLogsModalOpen] = useState(false);

  const devices = useMemo(() => networkTopology?.devices ?? [], [networkTopology]);
  const links = useMemo(() => networkTopology?.links ?? [], [networkTopology]);
  const deviceOptions = useMemo(
    () => devices.map((d) => ({ value: d.id, label: d.name })),
    [devices]
  );
  const devicesWithInterfaces = useMemo(
    () => devices.filter((d) => d.interfaces?.length),
    [devices]
  );
  const devicesWithInterfacesOptions = useMemo(
    () => devicesWithInterfaces.map((d) => ({ value: d.id, label: d.name })),
    [devicesWithInterfaces]
  );
  const vlanSwitchOptions = useMemo(
    () => devices.filter(isVlanCapableDevice).map((d) => ({ value: d.id, label: d.name })),
    [devices]
  );
  const linkOptions = useMemo(
    () =>
      links.map((c) => {
        const src = devices.find((d) => d.id === c.srcDevice)?.name || c.srcDevice;
        const dst = devices.find((d) => d.id === c.dstDevice)?.name || c.dstDevice;
        return { value: c.id, label: `${src} -> ${dst}` };
      }),
    [devices, links]
  );

  // Helpers
  const getDeviceName = (id) => devices.find(d => d.id === id)?.name || id;

  const addLog = (type, messageText) => {
    const newLog = {
      type,
      message: messageText,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      timestamp: new Date(),
    };
    setOpsLogs((prev) => [newLog, ...prev].slice(0, 100));
  };

  useEffect(() => {
    if (!networkTopology) {
      setOpsLogs([]);
    }
  }, [networkTopology, setOpsLogs]);
  const getLogTagColor = (type) => (
    type === 'error' ? 'red' : type === 'warning' ? 'yellow' : type === 'success' ? 'green' : 'blue'
  );
  const getInterfaceOptions = (id) =>
    (devices.find((d) => d.id === id)?.interfaces || []).map((iface) => ({ value: iface.name, label: iface.name }));

  const updateTopologyDevice = (id, patch) => {
    if (!networkTopology) return;
    const topo = { ...networkTopology };
    topo.devices = (topo.devices || []).map(d => d.id === id ? { ...d, ...patch, position: d.position } : d);
    topo.updatedAt = new Date();
    setNetworkTopology(topo);
  };

  useEffect(() => {
    setPingResult('');
    setTraceResult([]);
  }, [srcId, dstId]);

  useEffect(() => {
    setSmartRouteResult(null);
  }, [smartSrcId, smartDstId]);

  const execPing = async () => {
    if (!srcId || !dstId) {
      message.warning('请选择源设备和目标设备');
      return;
    }
    
    setIsPinging(true);
    const srcName = getDeviceName(srcId);
    const dstName = getDeviceName(dstId);
    addLog('info', `开始 Ping: ${srcName} -> ${dstName}...`);
    
    try {
        const data = await opsApi.ping(srcId, dstId);
        if (data.success) {
            const pingData = data.data ?? {};
            const rttVal = pingData.rtt ?? data.rtt;
            const ms = rttVal != null ? Number(rttVal).toFixed(2) : '0';
            setPingResult(`延迟: ${ms} ms`);
            message.success(getResponseMessage(data, 'Ping 成功'));
            addLog('success', getResponseMessage(data, 'Ping 成功'));
        } else {
             const errMsg = getResponseMessage(data);
             setPingResult('不可达');
             message.warning(errMsg);
             addLog('error', errMsg);
        }
    } catch (err) {
        setPingResult('系统错误');
        addLog('error', `Ping 请求异常: ${err.message || 'Unknown error'}`);
    } finally {
        setIsPinging(false);
    }
  };

  const execTraceroute = async () => {
    if (!srcId || !dstId) {
      message.warning('请选择源设备和目标设备');
      return;
    }

    setIsTracing(true);
    setTraceResult([]);
    const srcName = getDeviceName(srcId);
    const dstName = getDeviceName(dstId);
    addLog('info', `开始路由追踪: ${srcName} -> ${dstName}...`);

    try {
        const data = await opsApi.traceroute(srcId, dstId);
        if (data.success) {
            const hops = data.data?.hops ?? data.hops ?? [];
            const formattedHops = hops.map(h => `${h.hop}. ${h.deviceName ?? h.device_name} (${h.ip})`);
            setTraceResult(formattedHops);
            message.success(getResponseMessage(data, '路由追踪完成'));
            addLog('success', getResponseMessage(data, '路由追踪完成'));
        } else {
            const errMsg = getResponseMessage(data);
            setTraceResult(['追踪失败', errMsg]);
            message.warning(errMsg);
            addLog('error', errMsg);
        }
    } catch (err) {
        setTraceResult(['系统错误']);
        addLog('error', `Traceroute 请求异常: ${err.message || 'Unknown error'}`);
    } finally {
        setIsTracing(false);
    }
  };

  const execSmartRoute = async () => {
    if (!smartSrcId || !smartDstId) {
      message.warning('请选择源设备和目标设备');
      return;
    }

    setIsSmartRouting(true);
    setSmartRouteResult(null);
    const srcName = getDeviceName(smartSrcId);
    const dstName = getDeviceName(smartDstId);
    addLog('info', `开始智能路由决策: ${srcName} -> ${dstName}...`);

    try {
      const data = await opsApi.smartRoute(smartSrcId, smartDstId);
      if (data.success) {
        const routeData = data.data || {};
        const selectedPath = Array.isArray(routeData.selectedPath) ? routeData.selectedPath : [];
        const bestCost = routeData.selectedCost;
        const bestScore = routeData.selectedScore;
        const allPaths = Array.isArray(routeData.allPaths) ? routeData.allPaths : [];
        const bestPathText = selectedPath.map(getDeviceName).join(' -> ');
        setSmartRouteResult({
          bestPathText,
          bestCost,
          bestScore,
          allPaths,
        });
        message.success(getResponseMessage(data, '智能路由完成'));
        addLog('success', getResponseMessage(data, '智能路由完成'));
      } else {
        const errMsg = getResponseMessage(data);
        message.warning(errMsg);
        addLog('error', errMsg);
      }
    } catch (err) {
      addLog('error', `智能路由请求异常: ${err.message || 'Unknown error'}`);
      message.error(err.message || '智能路由请求失败');
    } finally {
      setIsSmartRouting(false);
    }
  };

  const updateConnectionStatusAction = async () => {
    if (!connId || !networkTopology) return;
    try {
        const res = await opsApi.updateConnection(connId, { status: connStatus });
        if (res.success) {
            const topo = { 
              ...networkTopology, 
              links: (networkTopology.links || []).map(c => c.id === connId ? { ...c, status: res.data?.status ?? connStatus } : c),
              updatedAt: new Date()
            };
            setNetworkTopology(topo);
            message.success(getResponseMessage(res, '链路状态更新成功'));
            addLog('success', getResponseMessage(res, '链路状态更新成功'));
        } else {
             const msg = getResponseMessage(res);
             addLog('error', msg);
             message.error(msg);
        }
    } catch (e) {
         addLog('error', `更新链路状态异常: ${e.message}`);
         message.error(e.message);
    }
  };

  const updateDeviceStatusAction = async () => {
    if (!deviceId || !networkTopology) return;
    try {
        const res = await opsApi.updateDevice(deviceId, { status: newDeviceStatus });
        if (res.success) {
            updateTopologyDevice(deviceId, res.data || {});
             message.success(getResponseMessage(res, '设备状态更新成功'));
             addLog('success', getResponseMessage(res, '设备状态更新成功'));
        } else {
             const msg = getResponseMessage(res);
             addLog('error', msg);
             message.error(msg);
        }
    } catch (e) {
        addLog('error', `更新设备状态异常: ${e.message}`);
        message.error(e.message);
    }
  };

  const updateInterfaceStatusAction = async () => {
    if (!ifaceDeviceId || !ifaceName || !networkTopology) return;
    try {
        const res = await opsApi.updateInterfaceStatus(ifaceDeviceId, ifaceName, ifaceStatus);
        if (res.success) {
             updateTopologyDevice(ifaceDeviceId, res.data || {});
             message.success(getResponseMessage(res, '接口状态更新成功'));
             addLog('success', getResponseMessage(res, '接口状态更新成功'));
        } else {
             const msg = getResponseMessage(res);
             addLog('error', msg);
             message.error(msg);
        }
    } catch (e) {
        addLog('error', `更新接口状态异常: ${e.message}`);
        message.error(e.message);
    }
  };

  const applyVlanConfigAction = async () => {
    if (!vlanSwitchId || !vlanPort || !networkTopology) return;
    try {
        const payload = { port: vlanPort, mode: vlanMode };
        if (vlanMode === 'access') {
            payload.vlanId = vlanId;
        } else {
            const allowed = String(vlanAllowedVlans || '')
                .split(/[,\s]+/)
                .map(s => s.trim()).filter(Boolean).map(v => Number(v)).filter(v => Number.isFinite(v) && v >= 1 && v <= 4094);
            payload.allowedVlans = Array.from(new Set(allowed));
        }

        const res = await opsApi.configureVlan(vlanSwitchId, payload);
        if (res.success) {
             updateTopologyDevice(vlanSwitchId, res.data || {});
             message.success(getResponseMessage(res, 'VLAN 配置成功'));
             addLog('success', getResponseMessage(res, 'VLAN 配置成功'));
        } else {
             const msg = getResponseMessage(res);
             addLog('error', msg);
             message.error(msg);
        }
    } catch (e) {
        addLog('error', `VLAN 配置异常: ${e.message}`);
        message.error(e.message);
    }
  };

  const restoreVlanConfigAction = async () => {
    if (!vlanSwitchId || !vlanPort || !networkTopology) return;
    try {
        const res = await opsApi.recoverVlan(vlanSwitchId, { port: vlanPort });
        if (res.success) {
             updateTopologyDevice(vlanSwitchId, res.data || {});
             message.success(getResponseMessage(res, 'VLAN 恢复成功'));
             addLog('success', getResponseMessage(res, 'VLAN 恢复成功'));
             const iface = (res.data?.interfaces || []).find((it) => it?.name === vlanPort);
             const restoredMode = iface?.mode || 'access';
             const restoredVlan = Number(iface?.vlan || 1);
             const restoredAllowed = Array.isArray(iface?.allowedVlans) ? iface.allowedVlans : [];
             setVlanMode(restoredMode);
             setVlanId(restoredVlan);
             setVlanAllowedVlans(restoredAllowed.join(','));
        } else {
             const msg = getResponseMessage(res);
             addLog('error', msg);
             message.error(msg);
        }
    } catch (e) {
        addLog('error', `VLAN 恢复异常: ${e.message}`);
        message.error(e.message);
    }
  };

  const handleVlanPortChange = (val) => {
    setVlanPort(val);
    const sw = devices.find((d) => d.id === vlanSwitchId);
    const iface = sw?.interfaces?.find((i) => i.name === val);
    if (iface?.mode) setVlanMode(iface.mode);
    if (iface?.vlan) setVlanId(Number(iface.vlan));
    if (Array.isArray(iface?.allowedVlans)) setVlanAllowedVlans(iface.allowedVlans.join(','));
    else setVlanAllowedVlans('');

  };

  const collapseItems = [
    {
      key: 'net-diag',
      label: <Space><CodeOutlined style={{ color: '#1890ff' }} />网络诊断</Space>,
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Form layout="vertical">
              <Form.Item label="源设备">
                <Select
                  placeholder="请选择源设备"
                  value={srcId}
                  onChange={setSrcId}
                  options={deviceOptions}
                />
              </Form.Item>
              <Form.Item label="目标设备" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="请选择目标设备"
                  value={dstId}
                  onChange={setDstId}
                  options={deviceOptions}
                />
              </Form.Item>
            </Form>
            <Row gutter={8}>
                <Col span={12}><Button type="primary" block icon={<PlayCircleOutlined />} loading={isPinging} onClick={execPing}>Ping</Button></Col>
                <Col span={12}><Button block icon={<ShareAltOutlined />} loading={isTracing} onClick={execTraceroute}>Traceroute</Button></Col>
            </Row>

            {pingResult && (
                <Alert message={pingResult} type={pingResult.includes('失败') || pingResult.includes('不可达') ? 'error' : 'success'} showIcon />
            )}
            {traceResult.length > 0 && (
              <Card
                size="small"
                title={<Text style={{ fontSize: 12 }}>路由追踪路径</Text>}
                styles={{ body: { padding: 8 } }}
              >
                {traceResult.map((hop, i) => (
                  <div key={`${hop}-${i}`} style={{ fontSize: 12, lineHeight: 1.4 }}>
                    {hop}
                  </div>
                ))}
              </Card>
            )}
         </Space>
      )
    },
    {
      key: 'smart-route',
      label: <Space><ApartmentOutlined style={{ color: '#13c2c2' }} />智能路由</Space>,
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Form layout="vertical">
            <Form.Item label="源设备">
              <Select
                placeholder="请选择源设备"
                value={smartSrcId}
                onChange={setSmartSrcId}
                options={deviceOptions}
              />
            </Form.Item>
            <Form.Item label="目标设备" style={{ marginBottom: 0 }}>
              <Select
                placeholder="请选择目标设备"
                value={smartDstId}
                onChange={setSmartDstId}
                options={deviceOptions}
              />
            </Form.Item>
          </Form>
          <Button block icon={<ApartmentOutlined />} loading={isSmartRouting} onClick={execSmartRoute}>
            计算智能路由
          </Button>
          {smartRouteResult && (
            <Card size="small" title="智能路由结果">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Alert
                  type="info"
                  showIcon
                  message={`最优路径: ${smartRouteResult.bestPathText || '-'}`}
                  description={`cost: ${smartRouteResult.bestCost ?? '-'}，score: ${smartRouteResult.bestScore ?? '-'}`}
                />
                <List
                  size="small"
                  header="全部可达路径"
                  dataSource={smartRouteResult.allPaths || []}
                  renderItem={(item, idx) => (
                    <List.Item>
                      <Space direction="vertical" size={0}>
                        <Text>#{idx + 1} cost={item.cost} hops={item.hops}</Text>
                        <Text type="secondary">{(item.path || []).map(getDeviceName).join(' -> ')}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </Space>
            </Card>
          )}
        </Space>
      )
    },
    {
      key: 'link-mgmt',
      label: <Space><ThunderboltOutlined style={{ color: '#722ed1' }} />链路管理</Space>,
      children: (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Form layout="vertical">
              <Form.Item label="选择链路">
                <Select
                  placeholder="请选择链路"
                  value={connId}
                  onChange={setConnId}
                  options={linkOptions}
                />
              </Form.Item>
              <Form.Item label="设置状态" style={{ marginBottom: 0 }}>
                <Select
                  value={connStatus}
                  onChange={setConnStatus}
                  options={Object.values(ConnectionStatus).map(s => ({ value: s, label: s }))}
                />
              </Form.Item>
            </Form>
            <Button block onClick={updateConnectionStatusAction}>更新状态</Button>
          </Space>
      )
    },
    {
      key: 'device-mgmt',
      label: <Space><DesktopOutlined style={{ color: '#faad14' }} />设备状态</Space>,
      children: (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Form layout="vertical">
              <Form.Item label="选择设备">
                <Select
                  placeholder="请选择设备"
                  value={deviceId}
                  onChange={setDeviceId}
                  options={deviceOptions}
                />
              </Form.Item>
              <Form.Item label="新状态" style={{ marginBottom: 0 }}>
                <Select
                  value={newDeviceStatus}
                  onChange={setNewDeviceStatus}
                  options={Object.values(DeviceStatus).map(s => ({ value: s, label: s }))}
                />
              </Form.Item>
            </Form>
            <Button block onClick={updateDeviceStatusAction}>更新状态</Button>
          </Space>
      )
    },
    {
      key: 'iface-mgmt',
      label: <Space><ApartmentOutlined style={{ color: '#52c41a' }} />接口状态</Space>,
      children: (
         <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Form layout="vertical">
              <Form.Item label="选择设备" style={{ marginBottom: 12 }}>
                <Select
                  placeholder="请选择设备"
                  value={ifaceDeviceId}
                  onChange={(val) => { setIfaceDeviceId(val); setIfaceName(''); }}
                  options={devicesWithInterfacesOptions}
                />
              </Form.Item>
            </Form>
            <Row gutter={8}>
                <Col span={12}>
                    <Form layout="vertical">
                      <Form.Item label="接口" style={{ marginBottom: 0 }}>
                        <Select
                          placeholder="请选择接口"
                          value={ifaceName}
                          onChange={setIfaceName}
                          options={getInterfaceOptions(ifaceDeviceId)}
                        />
                      </Form.Item>
                    </Form>
                </Col>
                <Col span={12}>
                    <Form layout="vertical">
                      <Form.Item label="状态" style={{ marginBottom: 0 }}>
                        <Select
                          value={ifaceStatus}
                          onChange={setIfaceStatus}
                          options={[{ value: 'up', label: 'UP' }, { value: 'down', label: 'DOWN' }]}
                        />
                      </Form.Item>
                    </Form>
                </Col>
            </Row>
            <Button block onClick={updateInterfaceStatusAction} disabled={!ifaceDeviceId || !ifaceName}>更新接口</Button>
         </Space>
      )
    },
    {
      key: 'vlan-mgmt',
      label: <Space><ApartmentOutlined style={{ color: '#eb2f96' }} />VLAN 管理</Space>,
      children: (
         <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Form layout="vertical">
              <Form.Item label="选择交换机" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="请选择交换机"
                  value={vlanSwitchId}
                  onChange={(val) => { setVlanSwitchId(val); setVlanPort(''); }}
                  options={vlanSwitchOptions}
                />
              </Form.Item>
            </Form>
            {vlanSwitchId && (
                <>
                    <Row gutter={8}>
                        <Col span={12}>
                            <Form layout="vertical">
                              <Form.Item label="端口" style={{ marginBottom: 0 }}>
                                <Select
                                  placeholder="请选择端口"
                                  value={vlanPort}
                                  onChange={handleVlanPortChange}
                                  options={getInterfaceOptions(vlanSwitchId)}
                                />
                              </Form.Item>
                            </Form>
                        </Col>
                        <Col span={12}>
                            <Form layout="vertical">
                              <Form.Item label="模式" style={{ marginBottom: 0 }}>
                                <Select
                                  value={vlanMode}
                                  onChange={setVlanMode}
                                  options={[{ value: 'access', label: 'Access' }, { value: 'trunk', label: 'Trunk' }]}
                                />
                              </Form.Item>
                            </Form>
                        </Col>
                    </Row>
                    {vlanMode === 'access' ? (
                        <Form layout="vertical">
                          <Form.Item label="VLAN ID" style={{ marginBottom: 0 }}>
                            <Input type="number" placeholder="1-4094" value={vlanId} onChange={e => setVlanId(Number(e.target.value))} />
                          </Form.Item>
                        </Form>
                    ) : (
                        <Form layout="vertical">
                          <Form.Item label="Allowed VLANs" style={{ marginBottom: 0 }}>
                            <Input placeholder="例如: 10,20" value={vlanAllowedVlans} onChange={e => setVlanAllowedVlans(e.target.value)} />
                          </Form.Item>
                        </Form>
                    )}
                    <Row gutter={8}>
                        <Col span={12}><Button type="primary" block onClick={applyVlanConfigAction} disabled={!vlanPort}>应用</Button></Col>
                        <Col span={12}><Button danger block icon={<DeleteOutlined />} onClick={restoreVlanConfigAction} disabled={!vlanPort}>恢复</Button></Col>
                    </Row>
                </>
            )}
         </Space>
      )
    },
  ];

  // UI Render
  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Collapse defaultActiveKey={['net-diag']} ghost items={collapseItems} />
      </div>

      <Divider style={{ margin: '12px 0' }} />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
         <Text strong>操作日志</Text>
         <Space>
            <Tag>{logs.length} 条事件</Tag>
            <Button type="link" size="small" onClick={() => setLogsModalOpen(true)}>查看全部</Button>
         </Space>
      </div>
      <Card size="small" style={{ flexShrink: 0, height: 200, overflowY: 'auto' }} styles={{ body: { padding: 4 } }}>
         {logs.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无日志" /> : (
            <List
                size="small"
                dataSource={logs.slice(0, 20)}
                renderItem={log => (
                    <List.Item style={{ padding: '4px 8px', border: 'none', cursor: 'pointer' }} onClick={() => setLogsModalOpen(true)}>
                        <Text type="secondary" style={{ fontSize: 10, marginRight: 8 }}>{log.timestamp.toLocaleTimeString()}</Text>
                        <Tag color={getLogTagColor(log.type)}>
                            {log.type.toUpperCase().slice(0,3)}
                        </Tag>
                        <Text ellipsis style={{ color: '#ccc', fontSize: 12 }}>{log.message}</Text>
                    </List.Item>
                )}
            />
         )}
      </Card>

      {/* Logs Modal */}
      <Modal 
        title="系统日志" 
        open={logsModalOpen} 
        onCancel={() => setLogsModalOpen(false)} 
        footer={null} 
        width={800}
        styles={{ body: { maxHeight: '60vh', overflowY: 'auto' } }}
      >
        <List
            dataSource={logs}
            renderItem={log => (
                <List.Item>
                    <List.Item.Meta
                        avatar={<Tag color={getLogTagColor(log.type)}>{log.type.toUpperCase()}</Tag>}
                        title={<Space><Text type="secondary">{log.timestamp.toLocaleString()}</Text><Text>{log.message}</Text></Space>}
                    />
                </List.Item>
            )}
        />
      </Modal>

    </div>
  );
};

export default OpsConsole;
