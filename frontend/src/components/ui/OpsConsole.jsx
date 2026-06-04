import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Select, Button, Modal, Tag, message, Collapse,
  Space, Typography, Row, Col, Divider, List, Empty,
  Card, Form, Alert, Input, InputNumber
} from 'antd';

import { opsApi } from '../../api/api';
import { useTopology } from '../../utils/topologyContext';

const { Text } = Typography;

const OpsConsole = () => {
  const { networkTopology, setNetworkTopology } = useTopology();

  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [pingResult, setPingResult] = useState('');
  const [traceResult, setTraceResult] = useState([]);
  const [traceUtilization, setTraceUtilization] = useState('');
  const [deviceStatus, setDeviceStatus] = useState('');
  const [linkId, setLinkId] = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [interfaceId, setInterfaceId] = useState('');
  const [interfaceStatus, setInterfaceStatus] = useState('');
  const [mode, setMode] = useState('');
  const [vlans, setVlans] = useState([]);
  const [ecmpSourceId, setEcmpSourceId] = useState('');
  const [ecmpTargetId, setEcmpTargetId] = useState('');
  const [ecmpLinkId, setEcmpLinkId] = useState('');
  const [ecmpCost, setEcmpCost] = useState(0);
  const [ecmpResultCost, setEcmpResultCost] = useState(null);
  const [smartDeviceId, setSmartDeviceId] = useState('');
  const [smartTargetDeviceId, setSmartTargetDeviceId] = useState('');
  const [smartScene, setSmartScene] = useState('');
  const [smartRouteSummary, setSmartRouteSummary] = useState('');
  const [smartRouteResult, setSmartRouteResult] = useState([]);
  const [peakSourceId, setPeakSourceId] = useState('');
  const [peakTargetId, setPeakTargetId] = useState('');
  const [peakFlowIntensity, setPeakFlowIntensity] = useState(0);
  const [peakRunning, setPeakRunning] = useState(false);
  const [peakData, setPeakData] = useState(null);
  const peakTimerRef = useRef(null);
  const [logs, setLogs] = useState([]);
  const [logsOpen, setLogsOpen] = useState(false);

  const devices = useMemo(() => networkTopology?.devices || [], [networkTopology]);
  const links = useMemo(() => networkTopology?.links || [], [networkTopology]);

  const getDeviceInterfaces = (deviceId) => {
    const device = devices.find(d => d.id === deviceId);
    return device?.interfaces || [];
  };

  const fetchLogs = async () => {
    try {
      const res = await opsApi.getLogs();
      if (res.code === 200) setLogs(prev => [...prev, res.data]);
    } catch {
      message.error('获取日志失败');
    }
  };

  const stopPeakPolling = () => {
    if (peakTimerRef.current) {
      clearInterval(peakTimerRef.current);
      peakTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopPeakPolling();
    };
  }, []);

  const applyPeakMetricsToLinks = (data) => {
    const linkData = Array.isArray(data?.links) ? data.links : [];
    const m = new Map(linkData.map(item => [String(item.linkId), item]));

    setNetworkTopology(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        links: (prev.links || []).map(link => {
          const Data = m.get(String(link.id));
          if (!Data) {
            return {
              ...link,
              utilization: undefined,
              capacity: undefined,
              linkDelay: undefined,
            };
          }
          return {
            ...link,
            utilization: Data.utilization,
            capacity: Data.capacity,
            linkDelay: Data.linkDelay,
          };
        }),
      };
    });
  };

  const fetchPeakData = async () => {
    try {
      const res = await opsApi.getPeakTrafficData();
      if (res.code === 200) {
        const running = Boolean(res.data?.running);
        setPeakRunning(running);
        setPeakData(res.data);
        applyPeakMetricsToLinks(running ? res.data : null);
      }
    } catch {
      message.error('获取峰值流量指标失败');
    }
  };

  const ping = async () => {
    if (!sourceId || !targetId) {
      message.warning('请选择源设备和目标设备');
      return;
    }
    setPingResult('');
    try {
      const res = await opsApi.ping(sourceId, targetId);

      if (res.code === 200) {
        message.success('Ping 成功');
        setPingResult(`延迟: ${res.data?.rtt ?? '-'} ms`);
      } else {
        message.warning(res.message || '操作失败');
        setPingResult(res.message || '操作失败');
      }
    } catch {
      message.error('系统错误');
      setPingResult('系统错误');
    } finally {
      fetchLogs();
    }
  };

  const traceroute = async () => {
    if (!sourceId || !targetId) {
      message.warning('请选择源设备和目标设备');
      return;
    }
    try {
      const res = await opsApi.traceroute(sourceId, targetId);
      if (res.code === 200) {
        const data = res.data;
        setTraceResult((data.path || []).map((n, i) => `${i + 1}. ${n} (${data.ip?.[i] ?? '-'})`));
        setTraceUtilization(
          typeof data.utilization === 'number' ? `链路利用率: ${data.utilization.toFixed(2)}%` : ''
        );
        message.success('路由追踪完成');
      } else {
        message.warning(res.message || '操作失败');
        setTraceResult(['追踪失败']);
        setTraceUtilization('');
      }
    } catch {
      message.error('系统错误');
      setTraceResult(['系统错误']);
      setTraceUtilization('');
    } finally {
      fetchLogs();
    }
  };

  const updateDeviceStatus = async () => {
    if (!sourceId) {
      message.warning('请选择设备');
      return;
    }
    try {
      const res = await opsApi.updateDeviceStatus(sourceId, deviceStatus);
      if (res.code === 200) {
        message.success('状态更新成功');
        setNetworkTopology(prev => ({ ...prev, devices: devices.map(device => (device.id === sourceId ? { ...device, status: deviceStatus } : device)) }));
      } else {
        message.warning(res.message || '操作失败');
      }
    } catch {
      message.error('更新失败');
    }
    fetchLogs();
  };
  const updateLinkStatus = async () => {
    if (!linkId) {
      message.warning('请选择链路');
      return;
    }
    try {
      const res = await opsApi.updateLinkStatus(linkId, linkStatus);
      if (res.code === 200) {
        message.success('状态更新成功');
        setNetworkTopology(prev => ({ ...prev, links: links.map(link => (link.id === linkId ? { ...link, status: linkStatus } : link)) }));
      } else {
        message.warning(res.message || '操作失败');
      }
    } catch {
      message.error('更新失败');
    }
    fetchLogs();
  };
  const updateInterfaceStatus = async () => {
    if (!interfaceId) {
      message.warning('请选择接口');
      return;
    }
    try {
      const res = await opsApi.updateInterfaceStatus(deviceId,interfaceId,interfaceStatus);
      if (res.code === 200) {
        message.success('状态更新成功');
        setNetworkTopology(prev => ({
          ...prev,
          devices: prev.devices.map(device =>
            device.id === deviceId
              ? {
                  ...device,
                  interfaces: device.interfaces.map(connector =>
                    connector.name === interfaceId
                      ? { ...connector, status: interfaceStatus }
                      : connector
                  )
                }
              : device
          )
        }));
      } else {
        message.warning(res.message || '操作失败');
      }
    } catch {
      message.error('更新失败');
    }
    fetchLogs();
  };
  const updateVlan = async () => {
    if (!deviceId || !interfaceId || !mode || !vlans.length) {
      message.warning('请选择设备、接口、模式和VLAN ID');
      return;
    }
    try {
      const res = await opsApi.configureVlan(deviceId,interfaceId,mode,vlans);
      if (res.code === 200) {
        message.success('VLAN更新成功');
        setNetworkTopology(prev => ({
          ...prev,
          devices: prev.devices.map(device =>
            device.id === deviceId
              ? {
                  ...device,
                  interfaces: device.interfaces.map(connector =>
                    connector.name === interfaceId
                      ? { ...connector, mode: mode, vlans: vlans }
                      : connector
                  )
                }
              : device
            )
          }));
      } else {
        message.warning(res.message || '操作失败');
      }
    } catch {
      message.error('更新失败');
    }
    fetchLogs();
  };
  const ecmp = async () => {
    if (!ecmpSourceId || !ecmpTargetId ) {
      message.warning('请选择源设备、目标设备');
      return;
    }
    try {
      setEcmpResultCost(null);
      const res = await opsApi.ospfLoadBalance(ecmpSourceId, ecmpTargetId);
      if (res.code === 200) {
        const cost = res.data?.cost;
        const raw = res.data?.path;
        let paths = raw;
        if (Array.isArray(paths) && paths.length > 0 && typeof paths[0] === 'string') {
          paths = [paths];
        }
        if (!Array.isArray(paths)) paths = [];
        setEcmpResultCost(typeof cost === 'number' ? cost : null);
        setNetworkTopology(prev => ({ ...prev, ecmpPaths: paths }));
        message.success('更新成功');
      } else {
        message.warning(res.message || '操作失败');
        setNetworkTopology(prev => ({ ...prev, ecmpPaths: [] }));
      }
    } catch {
      message.error('系统错误');
      setNetworkTopology(prev => ({ ...prev, ecmpPaths: [] }));
    }
    fetchLogs();
  };
  const updateCost = async () => {
    if (!ecmpLinkId || !ecmpCost) {
      message.warning('请选择链路和成本');
      return;
    }
    try {
      const res = await opsApi.updateOspfCost(ecmpLinkId, ecmpCost);
      if (res.code === 200) {
        message.success('更新成功');
        setNetworkTopology(prev => ({ ...prev, links: links.map(link => (link.id === ecmpLinkId ? { ...link, cost: ecmpCost } : link)) }));
      } else {
        message.warning(res.message || '操作失败');
      }
    } catch {
      message.error('更新失败');
    }
    fetchLogs();
  };
  const traceSmartRoute = async () => {
    if (!smartDeviceId || !smartTargetDeviceId) {
      message.warning('请选择源设备、目标设备');
      return;
    }
    const resetResult = (msg) => { setSmartRouteSummary(''); setSmartRouteResult([msg]); };
    try {
      const res = await opsApi.traceSmartRoute(smartDeviceId, smartTargetDeviceId, smartScene);
      if (res.code !== 200) {
        message.warning(res.message || '操作失败');
        resetResult('操作失败');
        return;
      }
      const chosen = res.data?.solutions?.[0] || {};
      const path = Array.isArray(chosen.path) ? chosen.path : [];
      if (!path.length) { resetResult('未找到路径'); return; }
      const fmt = (v, s) => typeof v === 'number' ? `${v}${s}` : '-';
      setSmartRouteSummary(`Delay: ${fmt(chosen.delay, ' ms')} | Utilization: ${fmt(chosen.utilization?.toFixed?.(2), '%')} | Cost: ${fmt(chosen.cost, '')}`);
      setSmartRouteResult(path.map((n, i) => `${i + 1}. ${n}`));
      message.success('路由更新成功');
    } catch {
      message.error('系统错误');
      resetResult('系统错误');
    }
    fetchLogs();
  };
  const startPeakTraffic = async () => {
    if (!peakSourceId || !peakTargetId || !peakFlowIntensity) {
      message.warning('请选择源设备、目标设备和流量强度');
      return;
    }
    stopPeakPolling();
    applyPeakMetricsToLinks(null);
    try {
      const res = await opsApi.startPeakTraffic(peakSourceId, peakTargetId, peakFlowIntensity);
      if (res.code === 200) {
        message.success('高峰流量模拟已开启');
        setPeakRunning(true);
        setPeakData(res.data);
        applyPeakMetricsToLinks(res.data);
        peakTimerRef.current = setInterval(fetchPeakData, 5000);
      } else {
        message.warning(res.message || '操作失败');
      }
    } catch {
      message.error('系统错误');
    }
    fetchLogs();
  };

  const stopPeakTraffic = async () => {
    stopPeakPolling();
    try {
      const res = await opsApi.stopPeakTraffic();
      if (res.code === 200) {
        message.success('高峰流量模拟已关闭');
        setPeakRunning(false);
        setPeakData(null);
        applyPeakMetricsToLinks(null);
      } else {
        message.warning(res.message || '操作失败');
      }
    } catch {
      message.error('系统错误');
    }
    fetchLogs();
  };
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      <Collapse
        ghost
        items={[
          {
            key: '1',
            label: '网络诊断',
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>

                <Form layout="vertical">
                  <Form.Item label="源设备">
                    <Select value={sourceId} onChange={setSourceId}
                      options={devices.map(device => ({ label: device.name, value: device.id }))} />
                  </Form.Item>

                  <Form.Item label="目标设备">
                    <Select value={targetId} onChange={setTargetId}
                      options={devices.map(device => ({ label: device.name, value: device.id }))} />
                  </Form.Item>
                </Form>

                <Row gutter={8}>
                  <Col span={12}>
                    <Button type="primary" block onClick={ping}>Ping</Button>
                  </Col>

                  <Col span={12}>
                    <Button block onClick={traceroute}>Traceroute</Button>
                  </Col>
                </Row>

                {pingResult && <Alert message={pingResult} showIcon />}
                {traceResult.length > 0 && (
                  <div>
                    {traceUtilization && (
                      <div style={{ fontSize: 12 }}>
                        {traceUtilization}
                      </div>
                    )}
                    {traceResult.map((t, i) => (
                      <div key={i} style={{ fontSize: 12 }}>{t}</div>
                    ))}
                  </div>
                )}
              </Space>
            )
          },
          {
            key: '2',
            label: '设备状态',
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Form layout="vertical">
                  <Form.Item label="设备">
                    <Select value={sourceId} onChange={setSourceId}
                      options={devices.map(device => ({ label: device.name, value: device.id }))} />
                  </Form.Item>
                  <Form.Item label="状态">
                    <Select value={deviceStatus} onChange={setDeviceStatus}
                      options={[{ label: '在线', value: 'online' }, { label: '离线', value: 'offline' },{label:'警告',value:'warning'},{label:'故障',value:'error'},{label:'维修中',value:'maintenance'}]} />
                  </Form.Item>
                </Form>
                <Button type="primary" block onClick={updateDeviceStatus}>更新设备状态</Button>
              </Space>
            )
          },
          {
            key: '3',
            label: '链路状态',
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Form layout="vertical">
                  <Form.Item label="链路">
                    <Select value={linkId} onChange={setLinkId}
                      options={links.map(link => ({ label: `${link.srcDevice} -> ${link.dstDevice}`, value: link.id }))} />
                  </Form.Item>
                  <Form.Item label="状态">
                    <Select value={linkStatus} onChange={setLinkStatus}
                      options={[{ label: '活跃', value: 'active' }, { label: '不活跃', value: 'inactive' },{label:'异常',value:'failed'}]} />
                  </Form.Item>
                </Form>
                <Button type="primary" block onClick={updateLinkStatus}>更新链路状态</Button>
              </Space>
            )
          },
          {
            key: '4',
            label: '接口状态',
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Form layout="vertical">
                  <Form.Item label="设备">
                    <Select value={deviceId} onChange={setDeviceId}
                      options={devices.map(device => ({ label: device.name, value: device.id }))} />
                  </Form.Item>
                  <Form.Item label="接口">
                    <Select value={interfaceId} onChange={setInterfaceId}
                      options={getDeviceInterfaces(deviceId).map(connector => ({ label: connector.name, value: connector.name })) || []} />
                  </Form.Item>
                  <Form.Item label="状态">
                    <Select value={interfaceStatus} onChange={setInterfaceStatus}
                      options={[{ label: '活跃', value: 'up' }, { label: '不活跃', value: 'down' }]} />
                  </Form.Item>
                </Form>
                <Button type="primary" block onClick={updateInterfaceStatus}>更新接口状态</Button>
              </Space>
            )
          },
          {
            key: '5',
            label: 'vlan设置',
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Form layout="vertical">
                  <Form.Item label="设备">
                    <Select value={deviceId} onChange={setDeviceId}
                      options={devices.map(device => ({ label: device.name, value: device.id }))} />
                  </Form.Item>
                  <Form.Item label="端口">
                    <Select value={interfaceId} onChange={setInterfaceId}
                      options={getDeviceInterfaces(deviceId).map(connector => ({ label: connector.name, value: connector.name })) || []} />
                  </Form.Item>
                  <Form.Item label="模式">
                    <Select value={mode} onChange={setMode}
                      options={[{ label: 'access', value: 'access' }, { label: 'trunk', value: 'trunk' }]} />
                  </Form.Item>
                  <Form.Item label="VLAN">
                    <Input
                      value={vlans.join(',')}
                      onChange={(e) =>
                        setVlans(e.target.value.split(',').map(Number))
                      }
                      placeholder="例如：10,20,30"
                    />
                  </Form.Item>
                </Form>
                <Button type="primary" block onClick={updateVlan}>更新vlan设置</Button>   
              </Space>
            )
          },
          {
            key: '6',
            label: 'ECMP',
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Form layout="vertical">
                  <Form.Item label="源设备">
                    <Select value={ecmpSourceId} onChange={setEcmpSourceId}
                      options={devices.map(device => ({ label: device.name, value: device.id }))} />
                  </Form.Item>
                  <Form.Item label="目的设备">
                    <Select value={ecmpTargetId} onChange={setEcmpTargetId}
                      options={devices.map(device => ({ label: device.name, value: device.id }))} />
                  </Form.Item>
                  <Button type="primary" block onClick={ecmp}>展示ECMP路径</Button>
                  <Button
                    block
                    style={{ marginTop: 8 }}
                    disabled={!networkTopology?.ecmpPaths?.length}
                    onClick={() => setNetworkTopology(prev => ({ ...prev, ecmpPaths: [] }))}
                  >
                    取消显示路径
                  </Button>
                  <Form.Item label="链路" style={{ marginTop: 8 }}>
                    <Select value={ecmpLinkId} onChange={setEcmpLinkId}
                      options={links.map(link => ({ label: `${link.srcDevice+'->'+link.dstDevice}` , value:link.id }))} />
                  </Form.Item>
                  <Form.Item label="cost">
                    <InputNumber value={ecmpCost} onChange={setEcmpCost} style={{ width: '100%'}}/>
                  </Form.Item>
                </Form>
                <Button type="primary" block onClick={updateCost}>手动更新Cost</Button>
                {ecmpResultCost !== null && <Alert showIcon message={`Cost: ${ecmpResultCost}`} type="info" />}
              </Space>
            )
          },
          {
            key: '7',
            label: '智能路由',
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Form layout="vertical">
                  <Form.Item label="源设备">
                    <Select value={smartDeviceId} onChange={setSmartDeviceId}
                      options={devices.map(device => ({ label: device.name, value: device.id }))} />
                  </Form.Item>
                  <Form.Item label="目的设备">
                    <Select value={smartTargetDeviceId} onChange={setSmartTargetDeviceId}
                      options={devices.map(device => ({ label: device.name, value: device.id }))} />
                  </Form.Item>
                  <Form.Item label="场景">
                    <Select
                      value={smartScene}
                      onChange={setSmartScene}
                      options={[
                        { label: '默认', value: '' },
                        { label: '时延', value: 'delay' },
                        { label: 'Cost', value: 'cost' },
                        { label: '链路利用率', value: 'utilization' },
                      ]}
                    />
                  </Form.Item>
                </Form>
                <Button type="primary" block onClick={traceSmartRoute}>智能路由</Button>   
                {smartRouteResult.length > 0 && (
                  <div>
                    {smartRouteSummary && (
                      <div style={{ fontSize: 12, wordBreak: 'break-word' }}>
                        {smartRouteSummary}
                      </div>
                    )}
                    <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                      {smartRouteResult.map((t, i) => (
                        <div key={i} style={{ fontSize: 12 }}>{t}</div>
                      ))}
                    </div>
                  </div>
                )}
              </Space>
            )
          },
          {
            key: '8',
            label: '高峰流量模拟',
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Form layout="vertical">
                  <Form.Item label="源设备">
                    <Select value={peakSourceId} onChange={setPeakSourceId}
                      options={devices.map(device => ({ label: device.name, value: device.id }))} />
                  </Form.Item>
                  <Form.Item label="目的设备">
                    <Select value={peakTargetId} onChange={setPeakTargetId}
                      options={devices.map(device => ({ label: device.name, value: device.id }))} />
                  </Form.Item>
                  <Form.Item label="流量强度（Mbps）">
                    <InputNumber value={peakFlowIntensity} onChange={setPeakFlowIntensity} style={{width: '100%'}}/>
                  </Form.Item>
                </Form>
                <Row gutter={8}>
                  <Col span={12}>
                    <Button type="primary" block onClick={startPeakTraffic}>开启</Button>
                  </Col>
                  <Col span={12}>
                    <Button danger block onClick={stopPeakTraffic} disabled={!peakRunning}>关闭</Button>
                  </Col>
                </Row>

                <Space>
                  <Tag color={peakRunning ? 'green' : 'default'}>
                    {peakRunning ? '运行中' : '已停止'}
                  </Tag>
                  {typeof peakData?.utilization === 'number' && (
                    <Tag
                      color={
                        peakData.utilization >= 0.8 ? 'red' : peakData.utilization >= 0.5 ? 'gold' : 'green'
                      }
                    >
                      ρ={peakData.utilization.toFixed(2)}
                    </Tag>
                  )}
                </Space>

                {peakRunning && peakData && (
                  <Alert
                    message={
                      <Space wrap>
                        <Text>Capacity: {peakData.capacity ?? '-'} Mbps</Text>
                        <Text>Utilization: {typeof peakData.utilization === 'number' ? `${(peakData.utilization * 100).toFixed(1)}%` : '-'}</Text>
                        <Text>链路时延: {typeof peakData.linkDelay === 'number' ? `${peakData.linkDelay.toFixed(2)} ms` : '-'}</Text>
                      </Space>
                    }
                    type={peakData.utilization >= 0.8 ? 'error' : peakData.utilization >= 0.5 ? 'warning' : 'success'}
                  />
                )}
              </Space>
            )
          },
          ]}
      />

      <Divider />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Text strong>操作日志</Text>
        <Button type="link" onClick={() => setLogsOpen(true)}>查看全部</Button>
      </div>

      <Card size="small" style={{ height: 200, overflowY: 'auto' }}
        styles={{ body: { padding: 6 } }}
      >
        {logs.length === 0 ? (
          <Empty description="暂无日志" />
        ) : (
          <List
            split={false}
            size="small"
            dataSource={logs.slice(0, 50)}
            renderItem={(log, i) => (
              <List.Item key={i}>
                <Tag color="green">{log.operationType}</Tag>
                <Text style={{ fontSize: 12 }}>{log.details}</Text>
              </List.Item>
            )}
          />
        )}
      </Card>

      <Modal
        title="系统日志"
        open={logsOpen}
        onCancel={() => setLogsOpen(false)}
        footer={null}
        width={1000}
      >
        <List
          dataSource={logs}
          renderItem={(log, i) => (
            <List.Item key={i}>
              <Tag>{log.operationType}</Tag>
              <Text>{log.details}</Text>
              <Text type="secondary">
                {log.createdAt ? new Date(log.createdAt).toLocaleString() : '-'}
              </Text>
            </List.Item>
          )}
        />
      </Modal>

    </div>
  );
};

export default OpsConsole;
