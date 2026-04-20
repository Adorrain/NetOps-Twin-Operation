import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  Select, Input, Button,
  Modal, Tag, Alert, message, Collapse, Space, 
  Typography, Row, Col, Divider, List, Empty
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
import { useAppActions, useAppState } from '../../utils/appStore';
import { DeviceStatus, ConnectionStatus } from '../../types';
import { isVlanCapableDevice } from '../../utils/utils';
import { opsApi } from '../../api/ops/opsApi';

const formatVlanHint = (cfg) => {
  if (!cfg) return '-';
  const mode = String(cfg.mode || 'access').toLowerCase();
  if (mode === 'trunk') {
    const allowed = Array.isArray(cfg.allowedVlans)
      ? cfg.allowedVlans
      : [];
    return allowed.length ? `trunk · allowed ${allowed.join(',')}` : 'trunk';
  }
  const vlan = cfg.vlan ?? 1;
  return `access · vlan ${vlan}`;
};

const explainLog = (log) => {
  const t = log.type;
  const msg = String(log.message || '').toLowerCase();

  if (msg.includes('ping') || msg.includes('traceroute') || msg.includes('路由追踪')) {
    if (t === 'success') {
      if (msg.includes('延迟')) return 'ICMP 回显应答正常，往返时间 (RTT) 符合预期';
      return 'ICMP Echo Request 已收到对应的 Echo Reply';
    }
    if (t === 'error' || t === 'warning') {
      if (msg.includes('不可达')) return '目标主机未响应 ICMP 请求，可能是路由不可达或设备离线';
      return '网络诊断工具执行失败';
    }
  }

  if (t === 'success' || t === 'info') {
    if (msg.includes('状态更新') || msg.includes('status')) return '管理操作已下发并被设备确认';
    return '操作成功执行';
  }

  if (t === 'error' || t === 'warning') {
    if (msg.includes('失败')) return '操作未能完成，请检查设备连接状态或配置权限';
    return '系统检测到异常情况';
  }

  return '系统信息通知';
};

const getErrorMessage = (res) => {
  if (res && res.message) return res.message;
  if (res && res.detail) {
    if (Array.isArray(res.detail)) {
      return res.detail.map((e) => `${e.loc.join('.')}: ${e.msg}`).join('; ');
    }
    return res.detail;
  }
  if (typeof res === 'string') return res;
  return '操作失败 (未定义错误)';
};

const { Text } = Typography;

const OpsConsole = () => {
  const { networkTopology, opsLogs: logs } = useAppState();
  const { setNetworkTopology, updateDeviceStatus, addOpsLog } = useAppActions();

  const devices = useMemo(() => networkTopology?.devices || [], [networkTopology]);
  const links = useMemo(() => networkTopology?.links || [], [networkTopology]);
  const deviceOptions = useMemo(
    () => devices.map((d) => ({ value: d.id, label: d.name })),
    [devices]
  );
  const devicesWithInterfaces = useMemo(
    () => devices.filter((d) => d.interfaces && d.interfaces.length > 0),
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

  // States (Ping/Trace)
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

  // States (VLAN)
  const [vlanSwitchId, setVlanSwitchId] = useState('');
  const [vlanId, setVlanId] = useState(10);
  const [vlanPort, setVlanPort] = useState('');
  const [vlanMode, setVlanMode] = useState('access');
  const [vlanAllowedVlans, setVlanAllowedVlans] = useState('');
  const [vlanOriginalHint, setVlanOriginalHint] = useState('');
  const [vlanCurrentHint, setVlanCurrentHint] = useState('');

  // States (Logs)
  const [logsModalOpen, setLogsModalOpen] = useState(false);

  // Helpers
  const getDeviceName = (id) => devices.find(d => d.id === id)?.name || id;
  const getLinkName = (id) => {
    const conn = links.find(c => c.id === id);
    if (!conn) return id;
    const src = getDeviceName(conn.srcDevice);
    const dst = getDeviceName(conn.dstDevice);
    return `${src} <-> ${dst}`;
  };

  const addLog = (type, messageText) => {
    addOpsLog({ type, message: messageText });
  };
  const getLogTagColor = (type) => (
    type === 'error' ? 'red' : type === 'warning' ? 'gold' : type === 'success' ? 'green' : 'blue'
  );
  const getInterfaceOptions = (id) =>
    devices.find((d) => d.id === id)?.interfaces?.map((iface) => ({ value: iface.name, label: iface.name })) || [];

  const updateTopologyDevice = (id, patch) => {
    if (!networkTopology) return;
    const topo = { ...networkTopology };
    topo.devices = (topo.devices || []).map(d => d.id === id ? { ...d, ...patch, position: d.position } : d);
    topo.updatedAt = new Date();
    setNetworkTopology(topo);
  };

  const vlanBaselineRef = useRef(new Map());

  useEffect(() => {
    if (!networkTopology || !Array.isArray(networkTopology.devices) || vlanBaselineRef.current.size > 0) return;
    networkTopology.devices.forEach(d => {
      const ifaces = Array.isArray(d.interfaces) ? d.interfaces : [];
      ifaces.forEach(it => {
        if (!it?.name) return;
        vlanBaselineRef.current.set(`${d.id}:${it.name}`, {
          mode: it.mode || 'access',
          vlan: it.vlan,
          allowedVlans: Array.isArray(it.allowedVlans) ? it.allowedVlans : undefined
        });
      });
    });
  }, [networkTopology]);

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
            message.success(`${srcName} 到 ${dstName} 延迟 ${ms} ms`);
            addLog('success', `Ping 成功: ${srcName} 到 ${dstName} 延迟 ${ms}ms`);
        } else {
             const errMsg = getErrorMessage(data);
             setPingResult('不可达');
             message.warning(errMsg);
             addLog('error', `Ping 失败: ${errMsg}`);
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
            addLog('success', `路由追踪完成`);
        } else {
            const errMsg = getErrorMessage(data);
            setTraceResult(['追踪失败', errMsg]);
            addLog('error', `路由追踪失败: ${errMsg}`);
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
        const candidates = Array.isArray(routeData.candidates) ? routeData.candidates : [];
        const bestPathText = selectedPath.map(getDeviceName).join(' -> ');
        setSmartRouteResult({
          bestPathText,
          bestCost,
          bestScore,
          allPaths,
          candidates,
        });
        message.success(`智能路由完成：${srcName} -> ${dstName}`);
        addLog('success', `智能路由完成: 最优路径 ${bestPathText || '(空)'}，cost=${bestCost}, score=${bestScore}`);
      } else {
        const errMsg = getErrorMessage(data);
        message.warning(errMsg);
        addLog('error', `智能路由失败: ${errMsg}`);
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
            const linkName = getLinkName(connId);
            message.info(`${linkName} 更新为 ${connStatus}`);
            addLog('info', `连接 ${linkName} 状态更新为 ${connStatus}`);
        } else {
             const msg = getErrorMessage(res);
             addLog('error', `更新链路状态失败: ${msg}`);
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
             updateDeviceStatus(deviceId, newDeviceStatus);
             const devName = getDeviceName(deviceId);
             message.info(`${devName} 更新为 ${newDeviceStatus}`);
             addLog('info', `设备 ${devName} 状态更新为 ${newDeviceStatus}`);
        } else {
             const msg = getErrorMessage(res);
             addLog('error', `更新设备状态失败: ${msg}`);
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
             const devName = getDeviceName(ifaceDeviceId);
             const statusText = ifaceStatus === 'up' ? '启用 (UP)' : '禁用 (DOWN)';
             message.info(`${devName} - ${ifaceName} 已${statusText}`);
             addLog('info', `接口管理: ${devName} 端口 ${ifaceName} 状态变更为 ${ifaceStatus.toUpperCase()}`);
        } else {
             const msg = getErrorMessage(res);
             addLog('error', `更新接口状态失败: ${msg}`);
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
             const swName = getDeviceName(vlanSwitchId);
             const detail = vlanMode === 'access' ? `access vlan ${vlanId}` : `trunk${payload.allowedVlans?.length ? ` allowed ${payload.allowedVlans.join(',')}` : ''}`;
             message.success(`${swName} 端口 ${vlanPort} 已配置为 ${detail}`);
             addLog('success', `VLAN 配置: ${swName} 端口 ${vlanPort} -> ${detail}`);
             setVlanCurrentHint(formatVlanHint({ mode: vlanMode, vlan: vlanMode === 'access' ? vlanId : undefined, allowedVlans: payload.allowedVlans }));
        } else {
             const msg = res.message;
             addLog('error', `VLAN 配置失败: ${msg}`);
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
             const swName = getDeviceName(vlanSwitchId);
             message.success(`${swName} 端口 ${vlanPort} 已恢复为默认配置`);
             addLog('success', `VLAN 恢复: ${swName} 端口 ${vlanPort}`);
             const iface = (res.data?.interfaces || []).find((it) => it?.name === vlanPort);
             const restoredMode = iface?.mode || 'access';
             const restoredVlan = Number(iface?.vlan || 1);
             const restoredAllowed = Array.isArray(iface?.allowedVlans) ? iface.allowedVlans : [];
             setVlanMode(restoredMode);
             setVlanId(restoredVlan);
             setVlanAllowedVlans(restoredAllowed.join(','));
             setVlanCurrentHint(formatVlanHint({ mode: restoredMode, vlan: restoredMode === 'access' ? restoredVlan : undefined, allowedVlans: restoredAllowed }));
             setVlanOriginalHint(formatVlanHint(vlanBaselineRef.current.get(`${vlanSwitchId}:${vlanPort}`)));
        } else {
             const msg = res.message || 'Unknown error';
             addLog('error', `VLAN 恢复失败: ${msg}`);
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

    setVlanCurrentHint(formatVlanHint({
      mode: iface?.mode || 'access',
      vlan: iface?.vlan,
      allowedVlans: Array.isArray(iface?.allowedVlans) ? iface.allowedVlans : undefined
    }));
    setVlanOriginalHint(formatVlanHint(vlanBaselineRef.current.get(`${vlanSwitchId}:${val}`)));
  };

  const collapseItems = [
    {
      key: 'net-diag',
      label: <Space><CodeOutlined style={{ color: '#1890ff' }} />网络诊断</Space>,
      children: (
        <Space orientation="vertical" style={{ width: '100%' }}>
            <Space style={{ width: '100%' }} orientation="vertical">
                <Select 
                    style={{ width: '100%' }} 
                    placeholder="源设备" 
                    value={srcId}
                    onChange={setSrcId}
                    options={deviceOptions}
                />
                <Select 
                    style={{ width: '100%' }} 
                    placeholder="目标设备" 
                    value={dstId}
                    onChange={setDstId}
                    options={deviceOptions}
                />
            </Space>
            
            <Row gutter={8}>
                <Col span={12}><Button type="primary" block icon={<PlayCircleOutlined />} loading={isPinging} onClick={execPing}>Ping</Button></Col>
                <Col span={12}><Button block icon={<ShareAltOutlined />} loading={isTracing} onClick={execTraceroute}>Traceroute</Button></Col>
            </Row>

            {pingResult && (
                <Alert message={pingResult} type={pingResult.includes('失败') || pingResult.includes('不可达') ? 'error' : 'success'} showIcon />
            )}
            {traceResult.length > 0 && (
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>路由追踪路径:</Text>
                    {traceResult.map((hop, i) => <div key={i} style={{ fontSize: 12, color: '#ccc', marginLeft: 8 }}>{hop}</div>)}
                </div>
            )}
         </Space>
      )
    },
    {
      key: 'smart-route',
      label: <Space><ApartmentOutlined style={{ color: '#13c2c2' }} />智能路由</Space>,
      children: (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Space style={{ width: '100%' }} orientation="vertical">
            <Select
              style={{ width: '100%' }}
              placeholder="源设备"
              value={smartSrcId}
              onChange={setSmartSrcId}
              options={deviceOptions}
            />
            <Select
              style={{ width: '100%' }}
              placeholder="目标设备"
              value={smartDstId}
              onChange={setSmartDstId}
              options={deviceOptions}
            />
          </Space>
          <Button block icon={<ApartmentOutlined />} loading={isSmartRouting} onClick={execSmartRoute}>
            计算智能路由
          </Button>
          {smartRouteResult && (
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>最优路径:</Text>
              <div style={{ fontSize: 12, color: '#ccc', marginLeft: 8 }}>{smartRouteResult.bestPathText || '-'}</div>
              <div style={{ fontSize: 12, color: '#ccc', marginLeft: 8 }}>
                cost: {smartRouteResult.bestCost ?? '-'}，score: {smartRouteResult.bestScore ?? '-'}
              </div>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
                全部可达路径:
              </Text>
              {(smartRouteResult.allPaths || []).map((item, idx) => (
                <div key={`path-${idx}`} style={{ fontSize: 12, color: '#ccc', marginLeft: 8, marginBottom: 4 }}>
                  <div>
                    #{idx + 1} cost={item.cost} hops={item.hops}
                  </div>
                  <div style={{ color: '#aaa' }}>
                    {(item.path || []).map(getDeviceName).join(' -> ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Space>
      )
    },
    {
      key: 'link-mgmt',
      label: <Space><ThunderboltOutlined style={{ color: '#722ed1' }} />链路管理</Space>,
      children: (
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Select 
                style={{ width: '100%' }} 
                placeholder="选择链路" 
                value={connId}
                onChange={setConnId}
                options={linkOptions}
            />
            <Select 
                style={{ width: '100%' }}
                placeholder="设置状态"
                value={connStatus}
                onChange={setConnStatus}
                options={Object.values(ConnectionStatus).map(s => ({ value: s, label: s }))}
            />
            <Button block onClick={updateConnectionStatusAction}>更新状态</Button>
          </Space>
      )
    },
    {
      key: 'device-mgmt',
      label: <Space><DesktopOutlined style={{ color: '#faad14' }} />设备状态</Space>,
      children: (
          <Space orientation="vertical" style={{ width: '100%' }}>
             <Select 
                style={{ width: '100%' }} 
                placeholder="选择设备" 
                value={deviceId}
                onChange={setDeviceId}
                options={deviceOptions}
            />
            <Select 
                style={{ width: '100%' }}
                placeholder="新状态"
                value={newDeviceStatus}
                onChange={setNewDeviceStatus}
                options={Object.values(DeviceStatus).map(s => ({ value: s, label: s }))}
            />
            <Button block onClick={updateDeviceStatusAction}>更新状态</Button>
          </Space>
      )
    },
    {
      key: 'iface-mgmt',
      label: <Space><ApartmentOutlined style={{ color: '#52c41a' }} />接口状态</Space>,
      children: (
         <Space orientation="vertical" style={{ width: '100%' }}>
            <Select 
                style={{ width: '100%' }} 
                placeholder="选择设备" 
                value={ifaceDeviceId}
                onChange={(val) => { setIfaceDeviceId(val); setIfaceName(''); }}
                options={devicesWithInterfacesOptions}
            />
            <Row gutter={8}>
                <Col span={12}>
                    <Select 
                        style={{ width: '100%' }} 
                        placeholder="接口" 
                        value={ifaceName}
                        onChange={setIfaceName}
                        options={getInterfaceOptions(ifaceDeviceId)}
                    />
                </Col>
                <Col span={12}>
                    <Select 
                        style={{ width: '100%' }}
                        value={ifaceStatus}
                        onChange={setIfaceStatus}
                        options={[{ value: 'up', label: 'UP' }, { value: 'down', label: 'DOWN' }]}
                    />
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
         <Space orientation="vertical" style={{ width: '100%' }}>
            <Select 
                style={{ width: '100%' }} 
                placeholder="选择交换机" 
                value={vlanSwitchId}
                onChange={(val) => { setVlanSwitchId(val); setVlanPort(''); }}
                options={vlanSwitchOptions}
            />
            {vlanSwitchId && (
                <>
                    <Row gutter={8}>
                        <Col span={12}>
                            <Select 
                                style={{ width: '100%' }} 
                                placeholder="端口" 
                                value={vlanPort}
                                onChange={handleVlanPortChange}
                                options={getInterfaceOptions(vlanSwitchId)}
                            />
                        </Col>
                        <Col span={12}>
                            <Select 
                                style={{ width: '100%' }}
                                value={vlanMode}
                                onChange={setVlanMode}
                                options={[{ value: 'access', label: 'Access' }, { value: 'trunk', label: 'Trunk' }]}
                            />
                        </Col>
                    </Row>
                    {vlanMode === 'access' ? (
                        <Input type="number" placeholder="VLAN ID (1-4094)" value={vlanId} onChange={e => setVlanId(Number(e.target.value))} />
                    ) : (
                        <Input placeholder="Allowed VLANs (e.g. 10,20)" value={vlanAllowedVlans} onChange={e => setVlanAllowedVlans(e.target.value)} />
                    )}
                    {vlanPort && (
                        <div style={{ padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 4, fontSize: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary">当前:</Text> <Text code>{vlanCurrentHint || '-'}</Text></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary">原始:</Text> <Text type="secondary">{vlanOriginalHint || '-'}</Text></div>
                        </div>
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
    <div style={{ paddingBottom: 24, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
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
      <div style={{ height: 120, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 4, padding: 4 }}>
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
      </div>

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
                        description={<Text type="secondary" italic>{explainLog(log)}</Text>}
                    />
                </List.Item>
            )}
        />
      </Modal>

    </div>
  );
};

export default OpsConsole;
