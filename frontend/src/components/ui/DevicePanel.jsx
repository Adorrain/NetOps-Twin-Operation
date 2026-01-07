import React from 'react';
import { DeviceStatus } from '../../types';
import { 
  Computer, 
  Router, 
  ToggleRight as SwitchIcon, 
  Server, 
  Shield, 
  Wifi,
  Settings,
  ArrowUp,
  ArrowDown,
  Network,
  Cpu,
  Layers,
  FileText,
  Info
} from 'lucide-react';

const DevicePanel = ({ device, onClose }) => {
  if (!device) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8">
        <div className="text-6xl mb-4 opacity-50 animate-pulse">📱</div>
        <p className="text-sm">选择设备以查看详情</p>
      </div>
    );
  }
  
  // 获取设备图标
  const getDeviceIcon = (deviceType) => {
    const props = { className: "w-8 h-8 text-white" };
    const type = (deviceType || '').toLowerCase();
    
    if (type.includes('pc') || type.includes('host') || type.includes('terminal')) return <Computer {...props} />;
    if (type.includes('router')) return <Router {...props} />;
    if (type.includes('switch')) return <SwitchIcon {...props} />;
    if (type.includes('server')) return <Server {...props} />;
    if (type.includes('firewall')) return <Shield {...props} />;
    if (type.includes('access_point')) return <Wifi {...props} />;
    return <Computer {...props} />;
  };
  
  // 获取设备类型标签
  const typeLabel = (deviceType) => {
    const type = (deviceType || '').toLowerCase();
    if (type.includes('pc') || type.includes('host') || type.includes('terminal')) return '终端主机';
    if (type.includes('router')) return '路由器';
    if (type.includes('switch')) return '交换机';
    if (type.includes('server')) return '服务器';
    if (type.includes('firewall')) return '防火墙';
    if (type.includes('access_point')) return '无线 AP';
    return '通用设备';
  };
  
  // 获取状态颜色类名
  const getStatusColor = (status) => {
    switch (status) {
      case DeviceStatus.ONLINE: return 'bg-green-500 shadow-[0_0_10px_#22c55e]';
      case DeviceStatus.WARNING: return 'bg-yellow-500 shadow-[0_0_10px_#eab308]';
      case DeviceStatus.ERROR: return 'bg-red-500 shadow-[0_0_10px_#ef4444]';
      case DeviceStatus.OFFLINE: return 'bg-slate-500 shadow-[0_0_10px_#64748b]';
      default: return 'bg-slate-500';
    }
  };

  const getStatusBg = (status) => {
     switch (status) {
      case DeviceStatus.ONLINE: return 'bg-green-500/10 border-green-500/30';
      case DeviceStatus.WARNING: return 'bg-yellow-500/10 border-yellow-500/30';
      case DeviceStatus.ERROR: return 'bg-red-500/10 border-red-500/30';
      case DeviceStatus.OFFLINE: return 'bg-slate-500/10 border-slate-500/30';
      default: return 'bg-slate-500/10 border-slate-500/30';
    }
  };
  
  // 获取状态标签
  const statusLabel = (status) => {
    switch (status) {
      case DeviceStatus.ONLINE: return '在线 (Online)';
      case DeviceStatus.WARNING: return '警告 (Warning)';
      case DeviceStatus.ERROR: return '故障 (Error)';
      case DeviceStatus.OFFLINE: return '离线 (Offline)';
      case DeviceStatus.MAINTENANCE: return '维护中';
      default: return '未知';
    }
  };
  
  // 优先使用 deviceType，如果不可用则回退到 device_type
  const dType = device.role || device.deviceType || device.device_type;

  // 获取 OSPF 配置 (兼容不同数据结构)
  const getOspfConfig = (device) => {
    return device.ospf || device.ospf_config || device.configuration?.ospf;
  };

  // 获取 VLAN 信息
  const getVlanInfo = (device) => {
    const vlans = [];
    if (device.vlan) vlans.push({ id: device.vlan, name: 'Main VLAN' });
    
    const list = device.vlans || device.configuration?.vlans;
    if (Array.isArray(list)) {
      list.forEach(v => {
        if (typeof v === 'number') vlans.push({ id: v, name: `VLAN ${v}` });
        else if (typeof v === 'object' && v.vlan_id) vlans.push({ id: v.vlan_id, name: v.name || `VLAN ${v.vlan_id}` });
      });
    }
    return vlans;
  };

  // 提取额外属性 (动态提取脚本中的其他字段)
  const getExtraAttributes = (device) => {
    const ignoredKeys = new Set([
        'id', 'name', 'role', 'type', 'deviceType', 'device_type', 'status', 
        'position', 'interfaces', 'ospf', 'ospf_config', 'vlan', 'vlans', 
        'configuration', 'metrics', 'description'
    ]);

    const extras = [];
    Object.entries(device).forEach(([key, value]) => {
        if (!ignoredKeys.has(key) && typeof value !== 'object' && value !== null && value !== undefined) {
            extras.push({ key, value });
        }
    });
    return extras;
  };

  const ospfConfig = getOspfConfig(device);
  const vlanList = getVlanInfo(device);
  const extraAttributes = getExtraAttributes(device);
  
  return (
    <div className="flex flex-col h-full text-slate-200">

      {/* 头部信息 */}
      <div className="p-6 border-b border-slate-700/50 flex items-start justify-between bg-slate-900/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-5">
          <div className={`p-4 rounded-xl shadow-lg border backdrop-blur-sm ${getStatusBg(device.status)}`}>
             {getDeviceIcon(dType)}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight mb-1">{device.name}</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-blue-300 uppercase tracking-wide">
                {typeLabel(dType)}
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                <span className={`w-2 h-2 rounded-full ${getStatusColor(device.status)}`}></span>
                {statusLabel(device.status)}
              </span>
            </div>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-700/50 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>
      
      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* 基本信息 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-800/60 transition-colors">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold block mb-1">IP 地址</span>
            {/* 优先显示 extraAttributes 列表，如果为空则显示单个 IP */}
            {extraAttributes.length > 0 ? (
                <div className="space-y-2">
                    {extraAttributes.map((attr, idx) => (
                        <div key={idx} className="flex justify-between items-center border-b border-slate-700/30 pb-1 last:border-0">
                            <span className="text-xs text-slate-500 uppercase font-medium">{attr.key.replace(/_/g, ' ')}</span>
                            <span className="text-sm text-blue-300 font-mono text-right truncate pl-2" title={String(attr.value)}>
                                {String(attr.value)}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <span className="font-mono text-blue-300 text-lg block">{device.ip_address || device.mgmt_ip || device.ip || '-'}</span>
            )}
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-800/60 transition-colors">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold block mb-1">角色 (Role)</span>
            <span className="text-slate-200 text-lg capitalize">{device.role || '-'}</span>
          </div>
          {device.description && (
            <div className="col-span-1 md:col-span-2 bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-800/60 transition-colors">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold block mb-1">描述</span>
              <span className="text-slate-300 leading-relaxed">{device.description}</span>
            </div>
          )}
        </div>

        {/* 扩展属性 (来自脚本的动态属性) - 已移除，因为现在在 IP 块中 */}

        {/* 详细配置 */}
        <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
              <Settings className="w-5 h-5 text-purple-400" />
              详细配置
            </h3>
            
            {/* VLAN 配置 */}
            {vlanList.length > 0 && (
              <div className="mb-4 bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="bg-slate-800/80 px-4 py-2 border-b border-slate-700/50 flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                   <Layers className="w-3.5 h-3.5 text-purple-400" />
                   VLAN 配置
                </div>
                <div className="p-4 flex flex-wrap gap-2">
                   {vlanList.map((v, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-lg">
                         <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_5px_#a855f7]"></div>
                         <div className="flex flex-col">
                            <span className="text-xs text-purple-200 font-bold leading-none">ID: {v.id}</span>
                            <span className="text-[10px] text-purple-400/70 leading-none mt-0.5">{v.name}</span>
                         </div>
                      </div>
                   ))}
                </div>
              </div>
            )}

            {/* OSPF 配置详情 */}
            {ospfConfig && (
              <div className="mb-4 bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="bg-slate-800/80 px-4 py-2 border-b border-slate-700/50 flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                   <ArrowUp className="w-3.5 h-3.5 text-green-400" />
                   OSPF 协议
                </div>
                <div className="p-4 grid grid-cols-2 gap-4">
                     <div className="bg-slate-900/30 p-3 rounded-lg border border-slate-700/30">
                       <span className="text-xs text-slate-500 block mb-1">路由器 ID</span>
                       <span className="font-mono text-slate-200 font-bold">
                         {ospfConfig.router_id || ospfConfig.routerId}
                       </span>
                     </div>
                     <div className="bg-slate-900/30 p-3 rounded-lg border border-slate-700/30">
                       <span className="text-xs text-slate-500 block mb-1">区域 (Area)</span>
                       <span className="font-mono text-green-400 font-bold text-lg">
                         {ospfConfig.area}
                       </span>
                     </div>
                </div>
              </div>
            )}

            {/* 接口表 */}
            {device.interfaces && device.interfaces.length > 0 ? (
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="bg-slate-800/80 px-4 py-2 border-b border-slate-700/50 flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                   <Network className="w-3.5 h-3.5 text-blue-400" />
                   接口列表 ({device.interfaces.length})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase bg-slate-800/50">
                        <th className="p-3 font-semibold">名称</th>
                        <th className="p-3 font-semibold">IP 地址</th>
                        <th className="p-3 font-semibold">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {device.interfaces.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-700/20 transition-colors">
                            <td className="p-3 text-sm font-medium text-slate-200 font-mono">{it.name}</td>
                            <td className="p-3 text-sm font-mono text-slate-400">{it.ip || it.ip_address || '-'}</td>
                            <td className="p-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase ${
                                (it.status === 'up' || !it.status) 
                                  ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
                              }`}>
                                {it.status || 'UP'}
                              </span>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
                <div className="text-center py-6 border border-dashed border-slate-700 rounded-xl text-slate-500 text-sm">
                    暂无接口信息
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default DevicePanel;
