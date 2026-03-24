import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  Select, Input, Button, Table, 
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
import { useAppStore } from '../../stores';
import { DeviceStatus, ConnectionStatus, DeviceType } from '../../types';
import { isVlanCapableDevice } from '../../utils/net';
import { opsApi } from '../../api/ops/opsApi';
import SparkLine from './charts/SparkLine';
const checkDeviceType = (device, type) => {
  const dType = device?.deviceType || device?.device_type || '';
  if (dType === type) return true;
  if (type === DeviceType.SWITCH) {
    const role = String(device?.role || '').toLowerCase();
    return role === 'access' || role === 'aggregation';
  }
  return false;
};

const formatVlanHint = (cfg) => {
  if (!cfg) return '-';
  const mode = String(cfg.mode || 'access').toLowerCase();
  if (mode === 'trunk') {
    const allowed = Array.isArray(cfg.allowed_vlans) ? cfg.allowed_vlans : [];
    return allowed.length ? `trunk · allowed ${allowed.join(',')}` : 'trunk';
  }
  const vlan = cfg.vlan ?? 1;
  return `access · vlan ${vlan}`;
};

const explainLog = (log) => {
  const t = log.type;
  const msg = String(log.message || '').toLowerCase();

  if (msg.includes('ospf')) {
    if (msg.includes('full') || msg.includes('恢复')) return 'OSPF 邻居状态机已达到 Full 状态，路由信息已完全同步';
    if (msg.includes('down') || msg.includes('重置')) return 'OSPF 进程重启或邻居关系中断，正在重新进行 Hello 报文交互';
    if (msg.includes('更新') || msg.includes('配置')) return 'OSPF 协议参数变更已应用，将触发链路状态更新 (LSU)';
  }

  if (msg.includes('ping') || msg.includes('traceroute') || msg.includes('路由追踪')) {
    if (t === 'success') {
      if (msg.includes('延迟')) return 'ICMP 回显应答正常，往返时间 (RTT) 符合预期';
      return 'ICMP Echo Request 已收到对应的 Echo Reply';
    }
    if (t === 'error' || t === 'warning') {
      if (msg.includes('不可达')) return '目标主机未响应 ICMP 请求，可能是路由不可达、防火墙拦截或设备离线';
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

  const [peakModalOpen, setPeakModalOpen] = useState(false);
  const [peakLoading, setPeakLoading] = useState(false);
  const [peakLinkId, setPeakLinkId] = useState('');
  const [peakSeries, setPeakSeries] = useState([]);
  const [peakCurrentCost, setPeakCurrentCost] = useState(1);
  const [peakRecommendedCost, setPeakRecommendedCost] = useState(null);
  const [peakNewCost, setPeakNewCost] = useState(1);
  const [peakCurrentMbps, setPeakCurrentMbps] = useState(0);
  const peakPollingRef = useRef(null);

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

  const updateTopologyLink = (id, patch) => {
    if (!networkTopology) return;
    const mergeLink = (item) => {
      if (String(item.id) !== String(id)) return item;
      return { ...item, ...patch };
    };
    const topo = { ...networkTopology };
    if (Array.isArray(topo.links)) {
      topo.links = topo.links.map(mergeLink);
    }
    if (Array.isArray(topo.connections)) {
      topo.connections = topo.connections.map(mergeLink);
    }
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

  useEffect(() => () => {
    stopPeakPolling();
  }, []);

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
            const ms = data.rtt ? data.rtt.toFixed(2) : 0;
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
    const ospf = dev && (dev.configuration?.ospf || dev.ospf);
    if (ospf) {
      setOspfRouterId(ospf.router_id || '');
      setOspfArea(ospf.area ?? 0);
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
             const iface = (res.data?.interfaces || []).find((it) => it?.name === vlanPort);
             const restoredMode = iface?.mode || 'access';
             const restoredVlan = Number(iface?.vlan || 1);
             const restoredAllowed = Array.isArray(iface?.allowed_vlans) ? iface.allowed_vlans : [];
             setVlanMode(restoredMode);
             setVlanId(restoredVlan);
             setVlanAllowedVlans(restoredAllowed.join(','));
             setVlanCurrentHint(formatVlanHint({ mode: restoredMode, vlan: restoredMode === 'access' ? restoredVlan : undefined, allowed_vlans: restoredAllowed }));
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

  const stopPeakPolling = () => {
    if (peakPollingRef.current) {
      clearInterval(peakPollingRef.current);
      peakPollingRef.current = null;
    }
  };

  const closePeakModal = () => {
    stopPeakPolling();
    setPeakModalOpen(false);
  };

  const syncPeakRealtime = async (linkId) => {
    const res = await opsApi.suggestOspfCost(linkId);
    if (!res.success) return;
    const row = res.data || {};
    setPeakCurrentMbps(Number(row.current_mbps || 0));
    setPeakSeries((prev) => {
      const next = [...prev, Number(row.current_mbps || 0)];
      return next.slice(-30);
    });
    updateTopologyLink(linkId, {
      utilization: Number(row.current_utilization || 0),
      is_peak: Number(row.current_utilization || 0) >= 0.75,
      peak_level: Number(row.current_utilization || 0) >= 0.75 ? 'high' : 'normal',
      current_mbps: Number(row.current_mbps || 0),
      current_cost: Number(row.current_cost || peakCurrentCost),
      optimization_state: Number(row.current_utilization || 0) >= 0.75 ? 'none' : 'optimized',
    });
    setPeakCurrentCost(Number(row.current_cost || peakCurrentCost));
    setPeakRecommendedCost(Number(row.recommended_cost || peakCurrentCost));
  };

  const openPeakModal = async () => {
    if (!connId) {
      message.warning('请选择链路');
      return;
    }
    try {
      setPeakLoading(true);
      const res = await opsApi.simulateSingleLinkPeak(connId);
      if (!res.success) {
        message.error(getErrorMessage(res));
        return;
      }
      const data = res.data || {};
      const series = Array.isArray(data.series_mbps) ? data.series_mbps : [];
      const currentCost = Number(data.current_cost || 1);
      const realtime = data.realtime_link || {};
      const currentMbps = Number(realtime.current_mbps ?? (series.length ? series[series.length - 1] : 0));
      setPeakLinkId(connId);
      setPeakSeries(series);
      setPeakCurrentCost(currentCost);
      setPeakRecommendedCost(null);
      setPeakNewCost(currentCost);
      setPeakCurrentMbps(currentMbps);
      updateTopologyLink(connId, {
        utilization: Number(realtime.utilization || 0.88),
        is_peak: true,
        peak_level: realtime.peak_level || 'high',
        current_mbps: currentMbps,
        current_cost: currentCost,
        optimization_state: 'none',
      });
      setPeakModalOpen(true);
      stopPeakPolling();
      peakPollingRef.current = setInterval(() => {
        syncPeakRealtime(connId);
      }, 2000);
      addLog('warning', `链路 ${getLinkName(connId)} 已模拟为高峰流量`);
    } catch (e) {
      message.error(e.message);
      addLog('error', `高峰模拟失败: ${e.message}`);
    } finally {
      setPeakLoading(false);
    }
  };

  const generatePeakSuggestion = async () => {
    if (!peakLinkId) return;
    try {
      setPeakLoading(true);
      await syncPeakRealtime(peakLinkId);
      const res = await opsApi.suggestOspfCost(peakLinkId);
      if (!res.success) {
        message.error(getErrorMessage(res));
        return;
      }
      const recommended = Number(res.data?.recommended_cost || peakCurrentCost);
      setPeakRecommendedCost(recommended);
      setPeakNewCost(recommended);
      addLog('info', `链路 ${getLinkName(peakLinkId)} 已生成基于实时流量的Cost建议`);
    } catch (e) {
      message.error(e.message);
      addLog('error', `生成建议失败: ${e.message}`);
    } finally {
      setPeakLoading(false);
    }
  };

  const applyPeakCostUpdate = async () => {
    if (!peakLinkId) return;
    try {
      setPeakLoading(true);
      const res = await opsApi.updateOspfCost(peakLinkId, Number(peakNewCost));
      if (!res.success) {
        message.error(getErrorMessage(res));
        return;
      }
      setPeakCurrentCost(Number(res.data?.new_cost || peakNewCost));
      updateTopologyLink(peakLinkId, {
        current_cost: Number(res.data?.new_cost || peakNewCost),
        utilization: 0.35,
        is_peak: false,
        peak_level: 'normal',
        optimization_state: 'optimized',
      });
      addLog('success', `链路 ${getLinkName(peakLinkId)} Cost 已更新为 ${res.data?.new_cost || peakNewCost}`);
      message.success('Cost 更新成功');
      closePeakModal();
    } catch (e) {
      message.error(e.message);
      addLog('error', `更新 Cost 异常: ${e.message}`);
    } finally {
      setPeakLoading(false);
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
      key: 'peak-sim',
      label: <Space><ThunderboltOutlined style={{ color: '#f5222d' }} />高峰流量模拟</Space>,
      children: (
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Select 
                style={{ width: '100%' }} 
                placeholder="选择链路（复用链路管理）" 
                value={connId}
                onChange={setConnId}
                options={connections.map(c => {
                    const src = devices.find(d => d.id === c.sourceDeviceId)?.name || c.sourceDeviceId;
                    const dst = devices.find(d => d.id === c.targetDeviceId)?.name || c.targetDeviceId;
                    return { value: c.id, label: `${src} -> ${dst}` };
                })}
            />
            <Button block onClick={openPeakModal} loading={peakLoading}>模拟高峰并打开弹窗</Button>
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
options={devices.filter(d => (d.configuration?.ospf || d.ospf) || checkDeviceType(d, DeviceType.ROUTER)).map(d => {
                        const ospf = d.configuration?.ospf || d.ospf;
                        return { value: d.id, label: ospf?.router_id ? `${d.name} (${ospf.router_id})` : d.name };
                    })}
              />
              {ospfDeviceId && (
                  <>
                    <Row gutter={8}>
                        <Col span={12}><Input placeholder="Router ID" value={ospfRouterId} onChange={e => setOspfRouterId(e.target.value)} /></Col>
                        <Col span={12}><Input type="number" placeholder="Area ID" value={ospfArea} onChange={e => setOspfArea(Number(e.target.value))} /></Col>
                    </Row>
                    <Row gutter={8}>
                        <Col span={12}><Button type="primary" block onClick={updateOspfConfigAction}>更新</Button></Col>
                        <Col span={12}><Button danger block onClick={handleGetNeighbors}>查看邻居表</Button></Col>
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

      <Modal
        title={`高峰流量模拟 - ${getLinkName(peakLinkId)}`}
        open={peakModalOpen}
        onCancel={closePeakModal}
        onOk={applyPeakCostUpdate}
        okText="更新Cost"
        confirmLoading={peakLoading}
        width={760}
      >
        <Row gutter={16}>
          <Col span={14}>
            <div style={{ height: 140, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 8 }}>
              <Text type="secondary">实时流量(Mbps)</Text>
              <div style={{ height: 96 }}>
                <SparkLine data={peakSeries} width={300} height={96} color="#ef4444" fill />
              </div>
            </div>
          </Col>
          <Col span={10}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                type="warning"
                showIcon
                message={`当前流量 ${peakCurrentMbps.toFixed(2)} Mbps`}
                description="固定强度高峰已注入当前链路"
              />
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text type="secondary">当前Cost</Text>
                  <Text>{peakCurrentCost}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text type="secondary">建议Cost</Text>
                  <Text strong>{peakRecommendedCost ?? '-'}</Text>
                </div>
                <Button block style={{ marginBottom: 8 }} onClick={generatePeakSuggestion} loading={peakLoading}>基于实时流量生成建议</Button>
                <Input
                  type="number"
                  value={peakNewCost}
                  onChange={(e) => setPeakNewCost(Number(e.target.value) || 1)}
                  placeholder="输入新Cost"
                />
              </div>
            </Space>
          </Col>
        </Row>
      </Modal>
    </div>
  );
};

export default OpsConsole;
