import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../stores';
import { DeviceStatus, DeviceType, ConnectionStatus } from '../../types';
import { Terminal, Network, Activity, Layers, Play, RefreshCw, CheckCircle, AlertCircle, ShieldAlert, Route, Zap, X, Trash2 } from 'lucide-react';
import SparkLine from './charts/SparkLine';
import { postJson } from '../../utils/http';
import { normalizeIp, isVlanCapableDevice } from '../../utils/net';

const api = {
  ping: (sourceId, targetIp) => postJson('/ops/ping', { source_id: sourceId, target_ip: targetIp }),
  traceroute: (sourceId, targetIp) => postJson('/ops/traceroute', { source_id: sourceId, target_ip: targetIp }),
  ddos: (data) => postJson('/ops/ddos/simulate', { target_id: data.target }),
  updateDevice: (id, data) => postJson('/ops/device/status', { device_id: id, status: data.status }),
  updateConnection: (id, data) => postJson('/ops/link/status', { link_id: id, status: data.status }),
  updateInterfaceStatus: (deviceId, ifaceName, status) => postJson('/ops/interface/status', { device_id: deviceId, iface_name: ifaceName, status }),
  updateOspf: (deviceId, data) => postJson('/ops/ospf/config', { device_id: deviceId, area: data.area, routerId: data.routerId }),
  resetOspf: (deviceId) => postJson('/ops/ospf/reset', { device_id: deviceId }),
  removeVlan: (deviceId, data) => postJson('/ops/vlan/remove', { device_id: deviceId, port: data.port }),
  configureVlan: (deviceId, data) => postJson('/ops/vlan/configure', { device_id: deviceId, port: data.port, mode: data.mode, vlan_id: data.vlanId, allowed_vlans: data.allowedVlans }),
  getOspfNeighbors: (deviceId) => postJson('/ops/ospf/neighbors', { device_id: deviceId })
};

const OpsConsole = () => {
  const { 
    networkTopology, 
    setNetworkTopology, 
    addNotification, 
    updateDeviceStatus,
    opsLogs: logs,
    addOpsLog
  } = useAppStore();

  const devices = useMemo(() => networkTopology?.devices || [], [networkTopology]);
  const connections = useMemo(() => networkTopology?.connections || [], [networkTopology]);

  // 网络诊断 (Ping & Traceroute)
  const [srcId, setSrcId] = useState('');
  const [dstId, setDstId] = useState('');
  const [pingResult, setPingResult] = useState('');
  const [pingHistory, setPingHistory] = useState([]);
  const [isPinging, setIsPinging] = useState(false);
  
  const [traceResult, setTraceResult] = useState([]);
  const [isTracing, setIsTracing] = useState(false);

  // 链路管理
  const [connId, setConnId] = useState('');
  const [connStatus, setConnStatus] = useState(ConnectionStatus.ACTIVE);

  // 设备状态
  const [deviceId, setDeviceId] = useState('');
  const [newDeviceStatus, setNewDeviceStatus] = useState(DeviceStatus.ONLINE);

  // 接口状态管理
  const [ifaceDeviceId, setIfaceDeviceId] = useState('');
  const [ifaceName, setIfaceName] = useState('');
  const [ifaceStatus, setIfaceStatus] = useState('up');

  // VLAN 管理
  const [vlanSwitchId, setVlanSwitchId] = useState('');
  const [vlanId, setVlanId] = useState(10);
  const [vlanPort, setVlanPort] = useState('');
  const [vlanMode, setVlanMode] = useState('access');
  const [vlanAllowedVlans, setVlanAllowedVlans] = useState('');
  const [vlanOriginalHint, setVlanOriginalHint] = useState('');
  const [vlanCurrentHint, setVlanCurrentHint] = useState('');

  // OSPF 管理
  const [ospfDeviceId, setOspfDeviceId] = useState('');
  const [ospfRouterId, setOspfRouterId] = useState('');
  const [ospfArea, setOspfArea] = useState(0);
  const [ospfNeighbors, setOspfNeighbors] = useState([]);
  const [showNeighborsModal, setShowNeighborsModal] = useState(false);

  // DDoS 模拟
  const [ddosTarget, setDdosTarget] = useState('');
  const [isDDoSing, setIsDDoSing] = useState(false);
  const [ddosIntensity, setDdosIntensity] = useState(50);
  const [ddosAlertVisible, setDdosAlertVisible] = useState(false);

  // 安全检查设备类型的辅助函数
  const checkDeviceType = (device, type) => {
      const dType = device.deviceType || device.device_type || '';
      if (dType === type) return true;
      if (type === DeviceType.SWITCH) {
          const role = String(device.role || '').toLowerCase();
          return role === 'access' || role === 'aggregation';
      }
      return false;
  };

  // 日志状态
  const [logsModalOpen, setLogsModalOpen] = useState(false);

  const getDeviceName = (id) => {
    const dev = devices.find(d => d.id === id);
    return dev ? dev.name : id;
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

  const getLinkName = (id) => {
    const conn = connections.find(c => c.id === id);
    if (!conn) return id;
    const src = getDeviceName(conn.sourceDeviceId);
    const dst = getDeviceName(conn.targetDeviceId);
    return `${src} <-> ${dst}`;
  };

  const explainLog = (log) => {
    const t = log.type;
    const msg = (log.message || '').toLowerCase();
    
    if (msg.includes('ospf')) {
      if (msg.includes('full') || msg.includes('恢复')) return 'OSPF 邻居状态机已达到 Full 状态，路由信息已完全同步';
      if (msg.includes('down') || msg.includes('重置')) return 'OSPF 进程重启或邻居关系中断，正在重新进行 Hello 报文交互';
      if (msg.includes('更新') || msg.includes('配置')) return 'OSPF 协议参数变更已应用，将触发链路状态更新 (LSU)';
    }

    if (msg.includes('ping') || msg.includes('traceroute') || msg.includes('路由追踪')) {
      if (t === 'success') {
         if (msg.includes('延迟')) return `ICMP 回显应答正常，往返时间 (RTT) 符合预期`;
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

  const addLog = (type, message) => {
    addOpsLog({ type, message });
  };

  const updateTopologyDevice = (id, patch) => {
    if (!networkTopology) return;
    const topo = { ...networkTopology };
    topo.devices = (topo.devices || []).map(d => d.id === id ? { ...d, ...patch, position: d.position } : d);
    topo.updatedAt = new Date();
    setNetworkTopology(topo);
  };

  useEffect(() => {
    setPingHistory([]);
    setPingResult('');
    setTraceResult([]);
  }, [srcId, dstId]);

  const getErrorMessage = (res) => {
      if (res && res.message) return res.message;
      if (res && res.detail) {
          if (Array.isArray(res.detail)) {
              return res.detail.map(e => `${e.loc.join('.')}: ${e.msg}`).join('; ');
          }
          return res.detail;
      }
      if (typeof res === 'string') return res;
      return '操作失败 (未定义错误)';
  };

  const execPing = async () => {
    if (!srcId || !dstId) {
      setPingResult('请选择源设备和目标设备');
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
        const data = await api.ping(srcId, targetIp);
        
        if (data.success) {
            const ms = data.rtt ? data.rtt.toFixed(2) : 0;
            setPingResult(`延迟: ${ms} ms`);
            setPingHistory(prev => [...prev.slice(-19), ms]);
            addNotification({ type: 'success', title: 'Ping 结果', message: `${srcName} 到 ${dstName} 延迟 ${ms} ms` });
            addLog('success', `Ping 成功: ${srcName} 到 ${dstName} (${targetIp}) 延迟 ${ms}ms`);
        } else {
             const errMsg = getErrorMessage(data);
             setPingResult('不可达');
             setPingHistory(prev => [...prev.slice(-19), 0]);
             addNotification({ type: 'warning', title: 'Ping 失败', message: errMsg });
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
      setTraceResult(['请选择源设备和目标设备']);
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
        const data = await api.traceroute(srcId, targetIp);
        
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

  const updateConnectionStatus = async () => {
    if (!connId || !networkTopology) return;
    try {
        const res = await api.updateConnection(connId, { status: connStatus });
        if (res.success) {
            const topo = { 
              ...networkTopology, 
              connections: (networkTopology.connections || []).map(c => c.id === connId ? { ...c, status: res.data?.status ?? connStatus } : c),
              updatedAt: new Date()
            };
            setNetworkTopology(topo);
            const linkName = getLinkName(connId);
            addNotification({ type: 'info', title: '链路状态', message: `${linkName} 更新为 ${connStatus}` });
            addLog('info', `连接 ${linkName} 状态更新为 ${connStatus}`);
        } else {
             const msg = getErrorMessage(res);
             addLog('error', `更新链路状态失败: ${msg}`);
             addNotification({ type: 'error', title: '更新失败', message: msg });
        }
    } catch (e) {
         addLog('error', `更新链路状态异常: ${e.message}`);
         addNotification({ type: 'error', title: '系统异常', message: e.message });
    }
  };

  const updateDeviceStatusAction = async () => {
    if (!deviceId || !networkTopology) return;
    try {
        const res = await api.updateDevice(deviceId, { status: newDeviceStatus });
        if (res.success) {
            updateTopologyDevice(deviceId, res.data || {});
             updateDeviceStatus(deviceId, newDeviceStatus);
             const devName = getDeviceName(deviceId);
             addNotification({ type: 'info', title: '设备状态', message: `${devName} 更新为 ${newDeviceStatus}` });
             addLog('info', `设备 ${devName} 状态更新为 ${newDeviceStatus}`);
        } else {
             const msg = getErrorMessage(res);
             addLog('error', `更新设备状态失败: ${msg}`);
             addNotification({ type: 'error', title: '更新失败', message: msg });
        }
    } catch (e) {
        addLog('error', `更新设备状态异常: ${e.message}`);
        addNotification({ type: 'error', title: '系统异常', message: e.message });
    }
  };

  const updateInterfaceStatusAction = async () => {
    if (!ifaceDeviceId || !ifaceName || !networkTopology) return;
    
    try {
        const res = await api.updateInterfaceStatus(ifaceDeviceId, ifaceName, ifaceStatus);
        
        if (res.success) {
             updateTopologyDevice(ifaceDeviceId, res.data || {});
             
             const devName = getDeviceName(ifaceDeviceId);
             const statusText = ifaceStatus === 'up' ? '启用 (UP)' : '禁用 (DOWN)';
             addNotification({ type: 'info', title: '接口状态更新', message: `${devName} - ${ifaceName} 已${statusText}` });
             addLog('info', `接口管理: ${devName} 端口 ${ifaceName} 状态变更为 ${ifaceStatus.toUpperCase()}`);
        } else {
             const msg = getErrorMessage(res);
             addLog('error', `更新接口状态失败: ${msg}`);
             addNotification({ type: 'error', title: '更新失败', message: msg });
        }
    } catch (e) {
        addLog('error', `更新接口状态异常: ${e.message}`);
        addNotification({ type: 'error', title: '系统异常', message: e.message });
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

  const updateOspfConfig = async () => {
    if (!ospfDeviceId || !networkTopology) return;
    
    try {
        const res = await api.updateOspf(ospfDeviceId, { routerId: ospfRouterId, area: ospfArea });
        
        if (res.success) {
            updateTopologyDevice(ospfDeviceId, res.data || {});
            
            const devName = getDeviceName(ospfDeviceId);
            addNotification({ type: 'success', title: 'OSPF 配置更新', message: `${devName} 配置已生效` });
            addLog('success', `更新 OSPF 配置 ${devName}: RID=${ospfRouterId}, Area=${ospfArea}`);
        } else {
             const msg = res.message;
             addLog('error', `OSPF 更新失败: ${msg}`);
             addNotification({ type: 'error', title: 'OSPF 更新失败', message: msg });
        }
    } catch (e) {
        addLog('error', `OSPF 更新异常: ${e.message}`);
        addNotification({ type: 'error', title: '系统异常', message: e.message });
    }
  };

  const resetOspfProcess = async () => {
    if (!ospfDeviceId) return;
    const devName = getDeviceName(ospfDeviceId);
    addLog('warning', `正在重置 ${devName} 的 OSPF 进程 1...`);
    
    try {
        const res = await api.resetOspf(ospfDeviceId);
        
        if (res.success) {
            addLog('warning', `OSPF 邻居状态改变: ${devName} 所有邻居 Down`);
            addNotification({ type: 'info', title: 'OSPF 进程重置', message: 'OSPF 进程已重启，邻居关系正在重新建立...' });
            
            setTimeout(() => {
                 addLog('info', `OSPF: ${devName} 状态进入 ExStart/Exchange...`);
            }, 5000);
            
            setTimeout(() => {
                 addLog('success', `OSPF 邻居状态改变: ${devName} 邻居关系恢复 Full`);
            }, 15000);
        } else {
            const msg = res.message;
            addLog('error', `OSPF 重置失败: ${msg}`);
            addNotification({ type: 'error', title: '重置失败', message: msg });
        }
    } catch (e) {
        addLog('error', `OSPF 重置异常: ${e.message}`);
        addNotification({ type: 'error', title: '系统异常', message: e.message });
    }
  };

  const handleGetNeighbors = async () => {
    if (!ospfDeviceId) return;
    try {
        const res = await api.getOspfNeighbors(ospfDeviceId);
        if (res.success) {
            setOspfNeighbors(res.data);
            setShowNeighborsModal(true);
            addLog('success', `获取 ${getDeviceName(ospfDeviceId)} 的 OSPF 邻居列表`);
        } else {
            addNotification({ type: 'error', title: '获取邻居失败', message: res.message });
        }
    } catch (e) {
        addNotification({ type: 'error', title: '系统异常', message: e.message });
    }
  };

  const applyVlanConfig = async () => {
    if (!vlanSwitchId || !vlanPort || !networkTopology) return;
    
    try {
        const payload = { port: vlanPort, mode: vlanMode };
        if (vlanMode === 'access') {
            payload.vlanId = vlanId;
        } else {
            const allowed = String(vlanAllowedVlans || '')
                .split(/[,\s]+/)
                .map(s => s.trim())
                .filter(Boolean)
                .map(v => Number(v))
                .filter(v => Number.isFinite(v) && v >= 1 && v <= 4094);
            payload.allowedVlans = Array.from(new Set(allowed));
        }

        const res = await api.configureVlan(vlanSwitchId, payload);
        
        if (res.success) {
             updateTopologyDevice(vlanSwitchId, res.data || {});
             
             const swName = getDeviceName(vlanSwitchId);
             const detail = vlanMode === 'access'
                ? `access vlan ${vlanId}`
                : `trunk${payload.allowedVlans?.length ? ` allowed ${payload.allowedVlans.join(',')}` : ''}`;
             addNotification({ type: 'success', title: 'VLAN 配置成功', message: `${swName} 端口 ${vlanPort} 已配置为 ${detail}` });
             addLog('success', `VLAN 配置: ${swName} 端口 ${vlanPort} -> ${detail}`);

             setVlanCurrentHint(formatVlanHint({ mode: vlanMode, vlan: vlanMode === 'access' ? vlanId : undefined, allowed_vlans: payload.allowedVlans }));
             setVlanOriginalHint(formatVlanHint(vlanBaselineRef.current.get(`${vlanSwitchId}:${vlanPort}`)));
        } else {
             const msg = res.message;
             addLog('error', `VLAN 配置失败: ${msg}`);
             addNotification({ type: 'error', title: 'VLAN 配置失败', message: msg });
        }
    } catch (e) {
        addLog('error', `VLAN 配置异常: ${e.message}`);
        addNotification({ type: 'error', title: '系统异常', message: e.message });
    }
  };

  const restoreVlanConfig = async () => {
    if (!vlanSwitchId || !vlanPort || !networkTopology) return;
    
    try {
        const res = await api.removeVlan(vlanSwitchId, { port: vlanPort });
        
        if (res.success) {
             updateTopologyDevice(vlanSwitchId, res.data || {});
             
             const swName = getDeviceName(vlanSwitchId);
             addNotification({ type: 'success', title: 'VLAN 恢复成功', message: `${swName} 端口 ${vlanPort} 已恢复为默认配置` });
             addLog('success', `VLAN 恢复: ${swName} 端口 ${vlanPort}`);

             setVlanMode('access');
             setVlanId(1);
             setVlanAllowedVlans('');
             setVlanCurrentHint(formatVlanHint({ mode: 'access', vlan: 1 }));
             setVlanOriginalHint(formatVlanHint(vlanBaselineRef.current.get(`${vlanSwitchId}:${vlanPort}`)));
        } else {
             const msg = res.message || 'Unknown error';
             addLog('error', `VLAN 恢复失败: ${msg}`);
             addNotification({ type: 'error', title: 'VLAN 恢复失败', message: msg });
        }
    } catch (e) {
        addLog('error', `VLAN 恢复异常: ${e.message}`);
        addNotification({ type: 'error', title: '系统异常', message: e.message });
    }
  };

  const toggleDDoS = async () => {
    if (!ddosTarget) return;
    
    if (isDDoSing) {
        setIsDDoSing(false);
        setDdosAlertVisible(false);
        addNotification({ type: 'success', title: 'DDoS 模拟结束', message: `针对 ${ddosTarget} 的攻击已停止` });
        addLog('info', `停止 DDoS 模拟: 目标 ${ddosTarget}`);
    } else {
        setIsDDoSing(true);
        addNotification({ type: 'warning', title: 'DDoS 模拟请求', message: `正在向后端发送 DDoS 请求...` });
        
        try {
            const data = await api.ddos({
                target: ddosTarget,
                type: 'udp_flood',
                intensity: ddosIntensity,
                duration: 60
            });
            
            if (data.success) {
                 setDdosAlertVisible(true);
                 addNotification({ type: 'warning', title: 'DDoS 模拟开始', message: `正在向 ${ddosTarget} 发送 ${ddosIntensity}Gbps 流量` });
                 addLog('warning', `开始 DDoS 模拟: 目标 ${ddosTarget}, 强度 ${ddosIntensity}Gbps (UDP Flood)`);
            } else {
                 setIsDDoSing(false);
                 setDdosAlertVisible(false);
                 const msg = data.message;
                 addLog('error', `DDoS 启动失败: ${msg}`);
                 addNotification({ type: 'error', title: 'DDoS 启动失败', message: msg });
            }
        } catch (e) {
             setIsDDoSing(false);
             setDdosAlertVisible(false);
             addLog('error', `DDoS 请求异常`,e);
             addNotification({ type: 'error', title: '系统异常', message: e.message });
        }
    }
  };

  // 可复用的表单组件
  const SectionHeader = ({ icon, title, colorClass = "text-blue-400" }) => {
    const Icon = icon;
    return (
    <div className="flex items-center gap-3 mb-4 pb-2 border-b border-slate-700/50">
      <div className={`p-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 ${colorClass}`}>
        <Icon className="w-4 h-4" />
      </div>
      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">{title}</h3>
    </div>
    );
  };

  const Select = ({ label, value, onChange, options, placeholder = "Select..." }) => (
    <div className="flex flex-col gap-1.5 mb-3">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</label>
      <select 
        className="bg-slate-800/50 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all appearance-none cursor-pointer hover:bg-slate-800"
        value={value} 
        onChange={onChange}
      >
        <option value="">{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );

  const Input = ({ label, value, onChange, type = "text", placeholder }) => (
    <div className="flex flex-col gap-1.5 mb-3">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</label>
      <input 
        type={type}
        className="bg-slate-800/50 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder-slate-600"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );

  const Button = ({ onClick, disabled, children, variant = "blue", className = "" }) => {
    const variants = {
      blue: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20",
      indigo: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20",
      cyan: "bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20",
      red: "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20",
      slate: "bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600",
      outline: "bg-transparent border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500"
    };

    return (
      <button 
        onClick={onClick} 
        disabled={disabled}
        className={`w-full py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full gap-6 relative">
      {ddosAlertVisible && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-500/90 text-white px-4 py-3 rounded-lg shadow-lg animate-pulse flex items-center justify-between backdrop-blur-sm border border-red-400">
           <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 animate-bounce" />
              <div>
                <div className="font-bold text-lg">DDoS 攻击告警</div>
                <div className="text-sm opacity-90">检测到针对 {getDeviceName(ddosTarget)} 的异常流量洪泛 ({ddosIntensity} Gbps)</div>
              </div>
           </div>
           <button 
             onClick={() => { setDdosAlertVisible(false); setIsDDoSing(false); }}
             className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors"
           >
             立即阻断
           </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
        
        {/* 网络诊断 */}
        <div className="bg-slate-800/20 rounded-xl p-4 border border-slate-700/30">
          <SectionHeader icon={Terminal} title="网络诊断" colorClass="text-blue-400" />
          
          <div className="grid grid-cols-1 gap-1">
            <Select 
              label="源设备" 
              value={srcId} 
              onChange={e => setSrcId(e.target.value)} 
              placeholder="选择源设备"
              options={devices.map(d => ({ value: d.id, label: d.name }))}
            />
            <Select 
              label="目标设备" 
              value={dstId} 
              onChange={e => setDstId(e.target.value)} 
              placeholder="选择目标设备"
              options={devices.map(d => ({ value: d.id, label: d.name }))}
            />
          </div>
          
          {/* Ping 图表 */}
          <div className="h-16 mb-4 bg-slate-900/50 rounded-lg border border-slate-700/50 relative overflow-hidden flex items-center justify-center">
             {pingHistory.length > 0 ? (
               <div className="absolute inset-0 p-1">
                 <SparkLine data={pingHistory} width={300} height={60} color="#3b82f6" fill={true} />
               </div>
             ) : (
               <span className="text-xs text-slate-600">延迟历史曲线</span>
             )}
          </div>

          <div className="grid grid-cols-2 gap-3">
             <Button onClick={execPing} disabled={isPinging || isTracing} variant="blue">
              <Play className={`w-4 h-4 ${isPinging ? 'animate-spin' : ''}`} />
              {isPinging ? '正在 Ping...' : 'Ping 测试'}
            </Button>
            <Button onClick={execTraceroute} disabled={isPinging || isTracing} variant="indigo">
              <Route className={`w-4 h-4 ${isTracing ? 'animate-pulse' : ''}`} />
              {isTracing ? '正在追踪...' : '路由追踪'}
            </Button>
          </div>

          {/* 结果显示 */}
          <div className="mt-4 bg-slate-900 rounded-lg border border-slate-800 p-3 min-h-[60px] text-xs font-mono">
            {pingResult && (
                <div className={`flex items-center gap-2 mb-2 ${pingResult.includes('不可达') || pingResult.includes('失败') ? 'text-red-400' : 'text-green-400'}`}>
                    {pingResult.includes('不可达') || pingResult.includes('失败') ? <AlertCircle className="w-3 h-3"/> : <CheckCircle className="w-3 h-3"/>}
                    PING: {pingResult}
                </div>
            )}
            {traceResult.length > 0 && (
                <div className="space-y-1">
                    <div className="text-slate-500 border-b border-slate-800 pb-1 mb-1">路由追踪路径:</div>
                    {traceResult.map((hop, i) => <div key={i} className="text-slate-300 pl-2 border-l border-slate-700 ml-1">{hop}</div>)}
                </div>
            )}
            {!pingResult && traceResult.length === 0 && <div className="text-slate-600 text-center italic py-2">准备就绪...</div>}
          </div>
        </div>

        {/* 链路管理 */}
        <div className="bg-slate-800/20 rounded-xl p-4 border border-slate-700/30">
          <SectionHeader icon={Network} title="链路管理" colorClass="text-purple-400" />

          <Select 
            label="选择链路" 
            value={connId} 
            onChange={e => setConnId(e.target.value)} 
            placeholder="-- 选择链路 --"
            options={connections.map(c => {
                const src = devices.find(d => d.id === c.sourceDeviceId)?.name || c.sourceDeviceId;
                const dst = devices.find(d => d.id === c.targetDeviceId)?.name || c.targetDeviceId;
                return { value: c.id, label: `${src} -> ${dst}` };
            })}
          />
          <Select 
            label="设置状态" 
            value={connStatus} 
            onChange={e => setConnStatus(e.target.value)} 
            options={Object.values(ConnectionStatus).map(s => ({ value: s, label: s }))}
          />
          <Button onClick={updateConnectionStatus} variant="slate" className="mt-2">
            更新状态
          </Button>
        </div>

        {/* OSPF 管理 */}
        <div className="bg-slate-800/20 rounded-xl p-4 border border-slate-700/30">
           <SectionHeader icon={Activity} title="OSPF 操作" colorClass="text-green-400" />
          
          <Select 
            label="选择路由器" 
            value={ospfDeviceId} 
            onChange={e => handleOspfSelect(e.target.value)} 
            placeholder="-- 选择设备 --"
            options={devices.filter(d => (d.configuration && d.configuration.ospf) || checkDeviceType(d, DeviceType.ROUTER)).map(d => ({ 
                value: d.id, 
                label: (d.configuration?.ospf?.routerId) ? `${d.name} (${d.configuration.ospf.routerId})` : d.name 
            }))}
          />

          {ospfDeviceId ? (
            <div className="animate-fade-in space-y-3">
                <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                    <div className="grid grid-cols-2 gap-3">
                        <Input 
                            label="Router ID" 
                            value={ospfRouterId}
                            onChange={e => setOspfRouterId(e.target.value)}
                        />
                        <Input 
                            label="Area ID" 
                            type="number"
                            value={ospfArea}
                            onChange={e => setOspfArea(Number(e.target.value))}
                        />
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                     <Button onClick={updateOspfConfig} variant="blue">
                       <RefreshCw className="w-4 h-4" />
                       更新配置
                     </Button>
                     <Button onClick={resetOspfProcess} variant="red">
                       <RefreshCw className="w-4 h-4" />
                       重置进程
                     </Button>
                     <Button onClick={handleGetNeighbors} variant="indigo" className="col-span-2">
                       <Network className="w-4 h-4" />
                       查看邻居表
                     </Button>
                </div>
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-slate-500 border border-dashed border-slate-700 rounded-lg">
                请选择设备以管理 OSPF
            </div>
          )}
        </div>

        {/* VLAN 管理 */}
        <div className="bg-slate-800/20 rounded-xl p-4 border border-slate-700/30">
           <SectionHeader icon={Layers} title="VLAN 管理" colorClass="text-indigo-400" />

             <Select 
                label="选择交换机" 
                value={vlanSwitchId} 
                onChange={e => {
                    setVlanSwitchId(e.target.value);
                    setVlanPort('');
                }} 
                placeholder="-- 选择交换机 --"
                options={devices.filter(isVlanCapableDevice).map(d => ({ value: d.id, label: d.name }))}
             />
             
             {vlanSwitchId && (
                 <div className="space-y-3 animate-fade-in mb-3">
                     <div className="grid grid-cols-2 gap-3">
                     <Select 
                        label="端口" 
                        value={vlanPort} 
                        onChange={e => {
                            const port = e.target.value;
                            setVlanPort(port);
                            const sw = devices.find(d => d.id === vlanSwitchId);
                            const iface = sw?.interfaces?.find(i => i.name === port);
                            if (iface?.mode) setVlanMode(iface.mode);
                            if (iface?.vlan) setVlanId(Number(iface.vlan));
                            if (Array.isArray(iface?.allowed_vlans)) setVlanAllowedVlans(iface.allowed_vlans.join(','));
                            if (Array.isArray(iface?.allowedVlans)) setVlanAllowedVlans(iface.allowedVlans.join(','));
                            if (iface?.allowed_vlans == null && iface?.allowedVlans == null) setVlanAllowedVlans('');

                            setVlanCurrentHint(formatVlanHint({
                              mode: iface?.mode || 'access',
                              vlan: iface?.vlan,
                              allowed_vlans: Array.isArray(iface?.allowed_vlans) ? iface.allowed_vlans : (Array.isArray(iface?.allowedVlans) ? iface.allowedVlans : undefined)
                            }));
                            setVlanOriginalHint(formatVlanHint(vlanBaselineRef.current.get(`${vlanSwitchId}:${port}`)));
                        }} 
                        placeholder="选择端口"
                        options={devices.find(d => d.id === vlanSwitchId)?.interfaces?.map((iface) => ({ value: iface.name, label: iface.name })) || []}
                     />
                     <Select
                        label="模式"
                        value={vlanMode}
                        onChange={e => setVlanMode(e.target.value)}
                        options={[{ value: 'access', label: 'access' }, { value: 'trunk', label: 'trunk' }]}
                     />
                     </div>
                     {vlanMode === 'access' ? (
                        <Input 
                           label="Access VLAN" 
                           type="number" 
                           value={vlanId} 
                           onChange={e => setVlanId(Number(e.target.value))} 
                           placeholder="1-4094"
                        />
                     ) : (
                        <Input
                           label="Trunk 允许 VLAN"
                           value={vlanAllowedVlans}
                           onChange={e => setVlanAllowedVlans(e.target.value)}
                           placeholder="10,20,30"
                        />
                     )}
                     {vlanPort && (
                        <div className="px-3 py-2 rounded-lg border border-slate-700/40 bg-slate-900/30 text-xs text-slate-400">
                          <div className="flex justify-between">
                            <span className="uppercase tracking-wider">当前</span>
                            <span className="font-mono text-slate-300">{vlanCurrentHint || '-'}</span>
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="uppercase tracking-wider">原始</span>
                            <span className="font-mono text-slate-500">{vlanOriginalHint || '-'}</span>
                          </div>
                        </div>
                     )}
                 </div>
             )}
             <div className="grid grid-cols-2 gap-3">
                 <Button 
                    onClick={applyVlanConfig} 
                    disabled={!vlanSwitchId || !vlanPort || (vlanMode === 'access' && (!vlanId || vlanId < 1))}
                    variant="indigo"
                 >
                    <CheckCircle className="w-4 h-4" />
                    应用配置
                 </Button>
                 <Button 
                    onClick={restoreVlanConfig} 
                    disabled={!vlanSwitchId || !vlanPort}
                    variant="red"
                 >
                    <Trash2 className="w-4 h-4" />
                    恢复默认配置
                 </Button>
             </div>
        </div>

        {/* DDoS 模拟 */}
        <div className="bg-slate-800/20 rounded-xl p-4 border border-slate-700/30">
          <SectionHeader icon={ShieldAlert} title="DDoS 模拟" colorClass="text-red-400" />

             <Select 
                label="攻击目标" 
                value={ddosTarget} 
                onChange={e => setDdosTarget(e.target.value)} 
                placeholder="选择目标"
                options={devices.filter(d => checkDeviceType(d, DeviceType.SERVER) || checkDeviceType(d, DeviceType.ROUTER)).map(d => ({ value: d.ipAddress || d.name, label: `${d.name} (${d.ipAddress})` }))}
             />
             
             <div className="mb-4">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">攻击强度: {ddosIntensity} Gbps</label>
                <input 
                    type="range" 
                    min="1" 
                    max="100" 
                    value={ddosIntensity} 
                    onChange={e => setDdosIntensity(Number(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
             </div>

             <Button 
                onClick={toggleDDoS} 
                disabled={!ddosTarget}
                variant={isDDoSing ? "red" : "slate"}
                className={isDDoSing ? "animate-pulse" : ""}
             >
                <Zap className="w-4 h-4" />
                {isDDoSing ? '停止攻击' : '开始攻击'}
             </Button>
        </div>
        
        {/* 设备状态 */}
        <div className="bg-slate-800/20 rounded-xl p-4 border border-slate-700/30">
          <SectionHeader icon={Layers} title="设备状态" colorClass="text-slate-400" />

          <Select 
            label="选择设备" 
            value={deviceId} 
            onChange={e => setDeviceId(e.target.value)} 
            placeholder="选择设备"
            options={devices.map(d => ({ value: d.id, label: d.name }))}
          />
          <Select 
            label="新状态" 
            value={newDeviceStatus} 
            onChange={e => setNewDeviceStatus(e.target.value)} 
            options={Object.values(DeviceStatus).map(s => ({ value: s, label: s }))}
          />
          <Button onClick={updateDeviceStatusAction} variant="slate" className="mt-2">
            更新状态
          </Button>
        </div>

        {/* 接口状态管理 */}
        <div className="bg-slate-800/20 rounded-xl p-4 border border-slate-700/30">
          <SectionHeader icon={Network} title="接口状态" colorClass="text-cyan-400" />

             <Select 
                label="选择设备" 
                value={ifaceDeviceId} 
                onChange={e => {
                    setIfaceDeviceId(e.target.value);
                    setIfaceName(''); 
                }}
                placeholder="选择设备"
                options={devices.filter(d => d.interfaces && d.interfaces.length > 0).map(d => ({ value: d.id, label: d.name }))}
             />
             
             {ifaceDeviceId && (
                 <div className="grid grid-cols-2 gap-3 animate-fade-in mb-3">
                     <Select 
                        label="接口" 
                        value={ifaceName} 
                        onChange={e => setIfaceName(e.target.value)} 
                        placeholder="选择接口"
                        options={devices.find(d => d.id === ifaceDeviceId)?.interfaces?.map((iface) => ({ value: iface.name, label: iface.name })) || []}
                     />
                     <Select 
                        label="状态" 
                        value={ifaceStatus} 
                        onChange={e => setIfaceStatus(e.target.value)} 
                        options={[{ value: 'up', label: 'UP' }, { value: 'down', label: 'DOWN' }]}
                     />
                 </div>
             )}
             
             <Button 
                onClick={updateInterfaceStatusAction} 
                disabled={!ifaceDeviceId || !ifaceName}
                variant="cyan"
             >
                <RefreshCw className="w-4 h-4" />
                更新接口
             </Button>
        </div>
      </div>

      {/* 操作日志 */}
      <div className="border-t border-slate-700/50 pt-4 mt-auto">
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-sm font-bold text-slate-300">操作日志</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{logs.length} 条事件</span>
            <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => setLogsModalOpen(true)}>查看全部</button>
          </div>
        </div>
        <div className="h-32 overflow-y-auto bg-slate-900/50 rounded-lg border border-slate-800 p-2 custom-scrollbar space-y-1">
           {logs.length === 0 ? (
             <div className="text-center text-slate-600 text-xs py-8">暂无日志</div>
           ) : (
            logs.slice(0, 20).map(log => (
              <button key={log.id} className="w-full text-left text-xs p-1.5 hover:bg-slate-800 rounded flex items-start gap-2 transition-colors" onClick={() => setLogsModalOpen(true)}>
                <span className="text-slate-500 whitespace-nowrap font-mono text-[10px]">{log.timestamp.toLocaleTimeString()}</span>
                <span className={`px-1 rounded text-[9px] font-bold uppercase tracking-wider ${
                  log.type === 'error' ? 'bg-red-900/30 text-red-400' : 
                  log.type === 'warning' ? 'bg-yellow-900/30 text-yellow-400' : 
                  log.type === 'success' ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'
                }`}>
                  {log.type.slice(0,3)}
                </span>
                <span className="text-slate-300 truncate">{log.message}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {logsModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-[800px] h-[600px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-float">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
              <h4 className="font-bold text-white">系统日志</h4>
              <button className="text-slate-400 hover:text-white" onClick={() => setLogsModalOpen(false)}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
              {logs.length === 0 ? (
                <div className="text-center text-slate-500 py-10">暂无记录</div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="grid grid-cols-[140px_80px_1fr] gap-4 p-3 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors text-sm">
                    <span className="text-slate-500 font-mono text-xs">{log.timestamp.toLocaleString()}</span>
                    <span className={`text-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider h-fit w-fit ${
                      log.type === 'error' ? 'bg-red-500/20 text-red-400' : 
                      log.type === 'warning' ? 'bg-yellow-500/20 text-yellow-400' : 
                      log.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>{log.type}</span>
                    <div>
                        <div className="text-slate-200 mb-1">{log.message}</div>
                        <div className="text-xs text-slate-500 italic border-l-2 border-slate-700 pl-2">{explainLog(log)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* OSPF 邻居模态框 */}
      {showNeighborsModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowNeighborsModal(false)}>
           <div className="w-[600px] bg-slate-800 rounded-xl border border-slate-700 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-900/50">
                 <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-green-400" />
                    OSPF 邻居表 - {getDeviceName(ospfDeviceId)}
                 </h3>
                 <button onClick={() => setShowNeighborsModal(false)} className="p-1 hover:bg-slate-700 rounded transition-colors">
                    <X className="w-5 h-5 text-slate-400" />
                 </button>
              </div>
              <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                 {ospfNeighbors.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                       暂无邻居信息或 OSPF 未建立连接
                    </div>
                 ) : (
                    <table className="w-full text-sm text-left">
                       <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 sticky top-0">
                          <tr>
                             <th className="px-3 py-2">Neighbor ID</th>
                             <th className="px-3 py-2">State</th>
                             <th className="px-3 py-2">Address</th>
                             <th className="px-3 py-2">Interface</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-700/50">
                          {ospfNeighbors.map((nb, idx) => (
                             <tr key={idx} className="hover:bg-slate-700/30">
                                <td className="px-3 py-2 font-mono text-white">{nb.router_id}</td>
                                <td className="px-3 py-2">
                                   <span className={`px-2 py-0.5 rounded text-xs font-bold ${nb.state === 'Full' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                      {nb.state}
                                   </span>
                                </td>
                                <td className="px-3 py-2 text-slate-300">{nb.address}</td>
                                <td className="px-3 py-2 text-slate-400">{nb.interface}</td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 )}
              </div>
              <div className="p-3 bg-slate-900/50 border-t border-slate-700 flex justify-end">
                 <Button onClick={() => setShowNeighborsModal(false)} variant="slate" className="w-auto px-6">
                    关闭
                 </Button>
              </div>
           </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default OpsConsole;
