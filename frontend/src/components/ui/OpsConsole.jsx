import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  Select, Input, Button, Slider, Table, 
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
  BugOutlined,
  DeleteOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { useAppStore } from '../../stores';
import { DeviceStatus, ConnectionStatus, DeviceType } from '../../types';
import { normalizeIp, isVlanCapableDevice } from '../../utils/net';
import { opsApi } from '../../features/ops/opsApi';
import { checkDeviceType, explainLog, formatVlanHint, getErrorMessage } from '../../features/ops/opsConsoleUtils';

const { Text } = Typography;

const OpsConsole = () => {
  const { 
    networkTopology, 
    setNetworkTopology, 
    updateDeviceStatus,
    opsLogs: logs,
    addOpsLog
  } = useAppStore();

  const devices = useMemo(() => networkTopology?.devices || [], [networkTopology]);
  const connections = useMemo(() => networkTopology?.links || networkTopology?.connections || [], [networkTopology]);

  // States (Ping/Trace)
  const [srcId, setSrcId] = useState('');
  const [dstId, setDstId] = useState('');
  const [pingResult, setPingResult] = useState('');
  const [isPinging, setIsPinging] = useState(false);
  const [traceResult, setTraceResult] = useState([]);
  const [isTracing, setIsTracing] = useState(false);

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

  // States (OSPF)
  const [ospfDeviceId, setOspfDeviceId] = useState('');
  const [ospfRouterId, setOspfRouterId] = useState('');
  const [ospfArea, setOspfArea] = useState(0);
  const [ospfNeighbors, setOspfNeighbors] = useState([]);
  const [showNeighborsModal, setShowNeighborsModal] = useState(false);

  // States (DDoS)
  const [ddosTarget, setDdosTarget] = useState('');
  const [isDDoSing, setIsDDoSing] = useState(false);
  const [ddosIntensity, setDdosIntensity] = useState(50);
  const [ddosAlertVisible, setDdosAlertVisible] = useState(false);

  // States (Logs)
  const [logsModalOpen, setLogsModalOpen] = useState(false);

  // Helpers
  const getDeviceName = (id) => devices.find(d => d.id === id)?.name || id;
  const getLinkName = (id) => {
    const conn = connections.find(c => c.id === id);
    if (!conn) return id;
    const src = getDeviceName(conn.sourceDeviceId);
    const dst = getDeviceName(conn.targetDeviceId);
    return `${src} <-> ${dst}`;
  };

  const addLog = (type, messageText) => {
    addOpsLog({ type, message: messageText });
  };

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
          allowed_vlans: Array.isArray(it.allowed_vlans) ? it.allowed_vlans : (Array.isArray(it.allowedVlans) ? it.allowedVlans : undefined)
        });
      });
    });
  }, [networkTopology]);

  useEffect(() => {
    setPingResult('');
    setTraceResult([]);
  }, [srcId, dstId]);

  // Actions
  const execPing = async () => {
    if (!srcId || !dstId) {
      message.warning('请选择源设备和目标设备');
      return;
    }
    
    setIsPinging(true);
    const srcName = getDeviceName(srcId);
    const dstName = getDeviceName(dstId);
    const dstDev = devices.find(d => d.id === dstId);
    const targetIp = normalizeIp(dstDev?.mgmt_ip) || normalizeIp(dstDev?.ipAddress) || normalizeIp(dstDev?.interfaces?.[0]?.ip);

    if (!targetIp) {
         setPingResult('目标设备无 IP 地址');
         addLog('error', `Ping 失败: 目标设备 ${dstName} 未配置 IP 地址`);
         setIsPinging(false);
         return;
    }

    addLog('info', `开始 Ping: ${srcName} -> ${dstName} (${targetIp})...`);
    
    try {
        const data = await opsApi.ping(srcId, targetIp);
        if (data.success) {
            const ms = data.rtt ? data.rtt.toFixed(2) : 0;
            setPingResult(`延迟: ${ms} ms`);
            message.success(`${srcName} 到 ${dstName} 延迟 ${ms} ms`);
            addLog('success', `Ping 成功: ${srcName} 到 ${dstName} (${targetIp}) 延迟 ${ms}ms`);
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
    const dstDev = devices.find(d => d.id === dstId);
    const targetIp = normalizeIp(dstDev?.mgmt_ip) || normalizeIp(dstDev?.ipAddress) || normalizeIp(dstDev?.interfaces?.[0]?.ip);

    if (!targetIp) {
         setTraceResult(['目标设备无 IP 地址']);
         addLog('error', `Traceroute 失败: 目标设备 ${dstName} 未配置 IP 地址`);
         setIsTracing(false);
         return;
    }

    addLog('info', `开始路由追踪: ${srcName} -> ${dstName} (${targetIp})...`);

    try {
        const data = await opsApi.traceroute(srcId, targetIp);
        if (data.success) {
            const formattedHops = data.hops.map(h => `${h.hop}. ${h.device_name} (${h.ip}) - ${h.rtt}`);
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

  const updateConnectionStatusAction = async () => {
    if (!connId || !networkTopology) return;
    try {
        const res = await opsApi.updateConnection(connId, { status: connStatus });
        if (res.success) {
            const topo = { 
              ...networkTopology, 
              connections: (networkTopology.connections || []).map(c => c.id === connId ? { ...c, status: res.data?.status ?? connStatus } : c),
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

  const handleOspfSelect = (devId) => {
    setOspfDeviceId(devId);
    const dev = devices.find(d => d.id === devId);
    if (dev && dev.configuration?.ospf) {
        setOspfRouterId(dev.configuration.ospf.routerId || dev.configuration.ospf.router_id || '');
        setOspfArea(dev.configuration.ospf.area ?? 0);
    } else {
        setOspfRouterId('');
        setOspfArea(0);
    }
  };

  const updateOspfConfigAction = async () => {
    if (!ospfDeviceId || !networkTopology) return;
    try {
        const res = await opsApi.updateOspf(ospfDeviceId, { routerId: ospfRouterId, area: ospfArea });
        if (res.success) {
            updateTopologyDevice(ospfDeviceId, res.data || {});
            const devName = getDeviceName(ospfDeviceId);
            message.success(`${devName} 配置已生效`);
            addLog('success', `更新 OSPF 配置 ${devName}: RID=${ospfRouterId}, Area=${ospfArea}`);
        } else {
             const msg = res.message;
             addLog('error', `OSPF 更新失败: ${msg}`);
             message.error(msg);
        }
    } catch (e) {
        addLog('error', `OSPF 更新异常: ${e.message}`);
        message.error(e.message);
    }
  };

  const resetOspfProcessAction = async () => {
    if (!ospfDeviceId) return;
    const devName = getDeviceName(ospfDeviceId);
    addLog('warning', `正在重置 ${devName} 的 OSPF 进程 1...`);
    try {
        const res = await opsApi.resetOspf(ospfDeviceId);
        if (res.success) {
            addLog('warning', `OSPF 邻居状态改变: ${devName} 所有邻居 Down`);
            message.info('OSPF 进程已重启，邻居关系正在重新建立...');
            setTimeout(() => addLog('info', `OSPF: ${devName} 状态进入 ExStart/Exchange...`), 5000);
            setTimeout(() => addLog('success', `OSPF 邻居状态改变: ${devName} 邻居关系恢复 Full`), 15000);
        } else {
            const msg = res.message;
            addLog('error', `OSPF 重置失败: ${msg}`);
            message.error(msg);
        }
    } catch (e) {
        addLog('error', `OSPF 重置异常: ${e.message}`);
        message.error(e.message);
    }
  };

  const handleGetNeighbors = async () => {
    if (!ospfDeviceId) return;
    try {
        const res = await opsApi.getOspfNeighbors(ospfDeviceId);
        if (res.success) {
            setOspfNeighbors(res.data);
            setShowNeighborsModal(true);
            addLog('success', `获取 ${getDeviceName(ospfDeviceId)} 的 OSPF 邻居列表`);
        } else {
            message.error(res.message);
        }
    } catch (e) {
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
             setVlanCurrentHint(formatVlanHint({ mode: vlanMode, vlan: vlanMode === 'access' ? vlanId : undefined, allowed_vlans: payload.allowedVlans }));
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
        const res = await opsApi.removeVlan(vlanSwitchId, { port: vlanPort });
        if (res.success) {
             updateTopologyDevice(vlanSwitchId, res.data || {});
             const swName = getDeviceName(vlanSwitchId);
             message.success(`${swName} 端口 ${vlanPort} 已恢复为默认配置`);
             addLog('success', `VLAN 恢复: ${swName} 端口 ${vlanPort}`);
             setVlanMode('access');
             setVlanId(1);
             setVlanAllowedVlans('');
             setVlanCurrentHint(formatVlanHint({ mode: 'access', vlan: 1 }));
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

  const toggleDDoS = async () => {
    if (!ddosTarget) return;
    if (isDDoSing) {
        setIsDDoSing(false);
        setDdosAlertVisible(false);
        message.success(`针对 ${ddosTarget} 的攻击已停止`);
        addLog('info', `停止 DDoS 模拟: 目标 ${ddosTarget}`);
    } else {
        setIsDDoSing(true);
        message.warning(`正在向后端发送 DDoS 请求...`);
        try {
            const data = await opsApi.ddos({
                target: ddosTarget,
                type: 'udp_flood',
                intensity: ddosIntensity,
                duration: 60
            });
            if (data.success) {
                 setDdosAlertVisible(true);
                 message.warning(`正在向 ${ddosTarget} 发送 ${ddosIntensity}Gbps 流量`);
                 addLog('warning', `开始 DDoS 模拟: 目标 ${ddosTarget}, 强度 ${ddosIntensity}Gbps (UDP Flood)`);
            } else {
                 setIsDDoSing(false);
                 setDdosAlertVisible(false);
                 const msg = data.message;
                 addLog('error', `DDoS 启动失败: ${msg}`);
                 message.error(msg);
            }
        } catch (e) {
             setIsDDoSing(false);
             setDdosAlertVisible(false);
             addLog('error', `DDoS 请求异常`,e);
             message.error(e.message);
        }
    }
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
                    options={devices.map(d => ({ value: d.id, label: d.name }))}
                />
                <Select 
                    style={{ width: '100%' }} 
                    placeholder="目标设备" 
                    value={dstId}
                    onChange={setDstId}
                    options={devices.map(d => ({ value: d.id, label: d.name }))}
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
      key: 'link-mgmt',
      label: <Space><ThunderboltOutlined style={{ color: '#722ed1' }} />链路管理</Space>,
      children: (
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Select 
                style={{ width: '100%' }} 
                placeholder="选择链路" 
                value={connId}
                onChange={setConnId}
                options={connections.map(c => {
                    const src = devices.find(d => d.id === c.sourceDeviceId)?.name || c.sourceDeviceId;
                    const dst = devices.find(d => d.id === c.targetDeviceId)?.name || c.targetDeviceId;
                    return { value: c.id, label: `${src} -> ${dst}` };
                })}
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
                options={devices.map(d => ({ value: d.id, label: d.name }))}
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
                options={devices.filter(d => d.interfaces && d.interfaces.length > 0).map(d => ({ value: d.id, label: d.name }))}
            />
            <Row gutter={8}>
                <Col span={12}>
                    <Select 
                        style={{ width: '100%' }} 
                        placeholder="接口" 
                        value={ifaceName}
                        onChange={setIfaceName}
                        options={devices.find(d => d.id === ifaceDeviceId)?.interfaces?.map((iface) => ({ value: iface.name, label: iface.name })) || []}
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
                options={devices.filter(isVlanCapableDevice).map(d => ({ value: d.id, label: d.name }))}
            />
            {vlanSwitchId && (
                <>
                    <Row gutter={8}>
                        <Col span={12}>
                            <Select 
                                style={{ width: '100%' }} 
                                placeholder="端口" 
                                value={vlanPort}
                                onChange={(val) => {
                                    setVlanPort(val);
                                    const sw = devices.find(d => d.id === vlanSwitchId);
                                    const iface = sw?.interfaces?.find(i => i.name === val);
                                    if (iface?.mode) setVlanMode(iface.mode);
                                    if (iface?.vlan) setVlanId(Number(iface.vlan));
                                    if (Array.isArray(iface?.allowed_vlans)) setVlanAllowedVlans(iface.allowed_vlans.join(','));
                                    else if (Array.isArray(iface?.allowedVlans)) setVlanAllowedVlans(iface.allowedVlans.join(','));
                                    else setVlanAllowedVlans('');
                                    
                                    setVlanCurrentHint(formatVlanHint({
                                      mode: iface?.mode || 'access',
                                      vlan: iface?.vlan,
                                      allowed_vlans: Array.isArray(iface?.allowed_vlans) ? iface.allowed_vlans : (Array.isArray(iface?.allowedVlans) ? iface.allowedVlans : undefined)
                                    }));
                                    setVlanOriginalHint(formatVlanHint(vlanBaselineRef.current.get(`${vlanSwitchId}:${val}`)));
                                }}
                                options={devices.find(d => d.id === vlanSwitchId)?.interfaces?.map((iface) => ({ value: iface.name, label: iface.name })) || []}
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
    {
      key: 'ospf-ops',
      label: <Space><ApartmentOutlined style={{ color: '#52c41a' }} />OSPF 操作</Space>,
      children: (
          <Space orientation="vertical" style={{ width: '100%' }}>
              <Select 
                    style={{ width: '100%' }} 
                    placeholder="选择路由器" 
                    value={ospfDeviceId}
                    onChange={handleOspfSelect}
                    options={devices.filter(d => (d.configuration && d.configuration.ospf) || checkDeviceType(d, DeviceType.ROUTER)).map(d => ({ 
                        value: d.id, 
                        label: (d.configuration?.ospf?.routerId) ? `${d.name} (${d.configuration.ospf.routerId})` : d.name 
                    }))}
              />
              {ospfDeviceId && (
                  <>
                    <Row gutter={8}>
                        <Col span={12}><Input placeholder="Router ID" value={ospfRouterId} onChange={e => setOspfRouterId(e.target.value)} /></Col>
                        <Col span={12}><Input type="number" placeholder="Area ID" value={ospfArea} onChange={e => setOspfArea(Number(e.target.value))} /></Col>
                    </Row>
                    <Row gutter={8}>
                        <Col span={12}><Button type="primary" block onClick={updateOspfConfigAction}>更新</Button></Col>
                        <Col span={12}><Button danger block onClick={resetOspfProcessAction}>重置进程</Button></Col>
                    </Row>
                    <Button block onClick={handleGetNeighbors}>查看邻居表</Button>
                  </>
              )}
          </Space>
      )
    },
    {
      key: 'ddos-sim',
      label: <Space><BugOutlined style={{ color: '#f5222d' }} />DDoS 模拟</Space>,
      children: (
         <Space orientation="vertical" style={{ width: '100%' }}>
             <Select 
                style={{ width: '100%' }} 
                placeholder="攻击目标" 
                value={ddosTarget}
                onChange={setDdosTarget}
                options={devices.filter(d => checkDeviceType(d, DeviceType.SERVER) || checkDeviceType(d, DeviceType.ROUTER)).map(d => ({ value: d.ipAddress || d.name, label: `${d.name} (${d.ipAddress})` }))}
             />
             <Text type="secondary">攻击强度: {ddosIntensity} Gbps</Text>
             <Slider min={1} max={100} value={ddosIntensity} onChange={setDdosIntensity} />
             <Button 
                type="primary" 
                danger={!isDDoSing} 
                block 
                onClick={toggleDDoS} 
                disabled={!ddosTarget}
                style={isDDoSing ? { background: '#f5222d', borderColor: '#f5222d', animation: 'pulse 1s infinite' } : {}}
             >
                {isDDoSing ? '停止攻击' : '开始攻击'}
             </Button>
         </Space>
      )
    }
  ];

  // UI Render
  return (
    <div style={{ paddingBottom: 24, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {ddosAlertVisible && (
        <Alert
          message="DDoS 攻击告警"
          description={`检测到针对 ${getDeviceName(ddosTarget)} 的异常流量洪泛 (${ddosIntensity} Gbps)`}
          type="error"
          showIcon
          action={
            <Button size="small" danger type="primary" onClick={() => { setDdosAlertVisible(false); setIsDDoSing(false); }}>
              立即阻断
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}

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
                        <Tag color={log.type === 'error' ? 'red' : log.type === 'warning' ? 'gold' : log.type === 'success' ? 'green' : 'blue'}>
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
                        avatar={<Tag color={log.type === 'error' ? 'red' : log.type === 'warning' ? 'gold' : log.type === 'success' ? 'green' : 'blue'}>{log.type.toUpperCase()}</Tag>}
                        title={<Space><Text type="secondary">{log.timestamp.toLocaleString()}</Text><Text>{log.message}</Text></Space>}
                        description={<Text type="secondary" italic>{explainLog(log)}</Text>}
                    />
                </List.Item>
            )}
        />
      </Modal>

      {/* OSPF Neighbors Modal */}
      <Modal
        title={`OSPF 邻居表 - ${getDeviceName(ospfDeviceId)}`}
        open={showNeighborsModal}
        onCancel={() => setShowNeighborsModal(false)}
        footer={[<Button key="close" onClick={() => setShowNeighborsModal(false)}>关闭</Button>]}
        width={700}
      >
        <Table 
            dataSource={ospfNeighbors}
            columns={[
                { title: 'Neighbor ID', dataIndex: 'router_id', key: 'router_id' },
                { title: 'State', dataIndex: 'state', key: 'state', render: (text) => <Tag color={text === 'Full' ? 'green' : 'red'}>{text}</Tag> },
                { title: 'Address', dataIndex: 'address', key: 'address' },
                { title: 'Interface', dataIndex: 'interface', key: 'interface' }
            ]}
            pagination={false}
            rowKey="router_id"
            size="small"
        />
      </Modal>
    </div>
  );
};

export default OpsConsole;
