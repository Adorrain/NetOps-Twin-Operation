import React, { useMemo } from 'react';
import { useAppStore } from '../../stores';
import { DeviceStatus, ConnectionStatus } from '../../types';
import SparkLine from './charts/SparkLine';
import { Activity, Server, Zap, AlertTriangle, CheckCircle } from 'lucide-react';

const StatCard = ({ title, value, subValue, icon, color, data, footer }) => {
  const Icon = icon;
  return (
  <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 relative overflow-hidden group hover:bg-slate-800/60 transition-colors">
     <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10 blur-xl bg-${color}-500 group-hover:opacity-20 transition-opacity`}></div>
     
     <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{title}</p>
          <div className="flex items-baseline gap-2">
             <h3 className="text-3xl font-bold text-white tracking-tight">{value}</h3>
             {subValue && <span className="text-sm text-slate-500 font-medium">{subValue}</span>}
          </div>
        </div>
        <div className={`p-3 rounded-xl bg-${color}-500/10 text-${color}-400 border border-${color}-500/20 shadow-[0_0_15px_rgba(0,0,0,0.2)]`}>
          <Icon className="w-6 h-6" />
        </div>
     </div>
     
     {data && (
       <div className="h-10 mt-2 relative opacity-80">
          <SparkLine data={data} width={200} height={40} color={color === 'blue' ? '#3b82f6' : color === 'yellow' ? '#eab308' : '#10b981'} fill={true} />
       </div>
     )}
     
     {footer && (
       <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center gap-2 text-xs font-medium">
          {footer}
       </div>
     )}
  </div>
  );
};

const MonitoringPanel = () => {
  const networkTopology = useAppStore(state => state.networkTopology);
  const deviceStatuses = useAppStore(state => state.deviceStatuses);

  const devices = useMemo(() => networkTopology?.devices || [], [networkTopology]);
  // 修复：同时支持 'links' (后端标准) 和 'connections' (旧版/前端)
  const connections = useMemo(() => networkTopology?.links || networkTopology?.connections || [], [networkTopology]);

  // 移除未使用的 connectionCounts 逻辑
  const statusCounts = useMemo(() => {
    const counts = {
      [DeviceStatus.ONLINE]: 0,
      [DeviceStatus.OFFLINE]: 0,
      [DeviceStatus.WARNING]: 0,
      [DeviceStatus.ERROR]: 0,
    };
    
    devices.forEach(device => {
      const status = deviceStatuses.get(device.id) || device.status || DeviceStatus.OFFLINE;
      if (counts[status] !== undefined) {
        counts[status]++;
      }
    });
    
    return counts;
  }, [devices, deviceStatuses]);

  const systemHealth = useMemo(() => {
    if (devices.length === 0) return 100;
    const totalScore = devices.reduce((acc, device) => {
        // 如果未定义则回退到 'online'，假设系统默认正常，除非另有说明
        const status = deviceStatuses.get(device.id) || device.status || DeviceStatus.ONLINE;
        if (status === DeviceStatus.ONLINE) return acc + 100;
        if (status === DeviceStatus.WARNING) return acc + 70;
        if (status === DeviceStatus.ERROR) return acc + 40;
        if (status === DeviceStatus.OFFLINE) return acc + 0;
        return acc + 100; // 默认正常
    }, 0);
    return Math.round(totalScore / devices.length);
  }, [devices, deviceStatuses]);

  // 安全提取 VLAN 的辅助函数
  const getDeviceVlans = (device) => {
    const vlans = new Set();
    // 1. 单个 VLAN 属性 (例如 PC)
    if (device.vlan) vlans.add(Number(device.vlan));
    
    // 2. VLANs 数组 (例如交换机)
    const list = device.vlans || device.configuration?.vlans;
    if (Array.isArray(list)) {
      list.forEach(v => {
        if (typeof v === 'number') vlans.add(v);
        else if (typeof v === 'object' && v.vlan_id) vlans.add(Number(v.vlan_id));
      });
    }
    return Array.from(vlans);
  };

  // 安全提取 OSPF 区域的辅助函数
  const getOspfArea = (device) => {
    const ospf = device.ospf || device.configuration?.ospf;
    return ospf?.area; // 可能是 0，所以严格检查 undefined
  };

  const getRandomData = () => Array.from({ length: 10 }, () => Math.floor(Math.random() * 40) + 60);

  return (
    <div className="p-6 h-full overflow-y-auto custom-scrollbar">
      <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
        <Activity className="w-6 h-6 text-blue-400" />
        系统监控
      </h2>

      {/* 概览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <StatCard 
          title="系统健康度" 
          value={`${systemHealth}%`} 
          icon={Activity} 
          color="blue" 
          data={[65, 70, 68, 72, 75, 80, 85, 82, 88, systemHealth]}
        />

        <StatCard 
          title="在线设备" 
          value={statusCounts[DeviceStatus.ONLINE]} 
          subValue={`/ ${devices.length}`}
          icon={Server} 
          color="green" 
          footer={
            <>
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-green-400">系统运行正常</span>
            </>
          }
        />

        <StatCard 
          title="活跃告警" 
          value={statusCounts[DeviceStatus.WARNING] + statusCounts[DeviceStatus.ERROR]} 
          icon={AlertTriangle} 
          color="yellow" 
          data={getRandomData()}
        />

        <StatCard 
          title="活跃链路" 
          // value={connectionCounts[ConnectionStatus.ACTIVE] + 1} 
          value={connections.length}
          icon={Zap} 
          color="purple" 
          footer={
             <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 rounded-full" 
                  style={{ width: `100%` }}
                ></div>
             </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 设备分布 */}
        <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white mb-6">
            <div className="w-1 h-5 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></div>
            设备分布
          </h3>
          <div className="space-y-4">
             {Object.entries(devices.reduce((acc, curr) => {
               const type = (curr.role || curr.deviceType || curr.device_type || 'unknown').toLowerCase();
               acc[type] = (acc[type] || 0) + 1;
               return acc;
             }, {})).map(([type, count]) => {
                const typeMap = { 
                  pc: '终端 PC', 
                  host: '主机',
                  terminal: '终端',
                  router: '路由器', 
                  switch: '交换机', 
                  server: '服务器', 
                  firewall: '防火墙', 
                  access_point: '无线 AP',
                  core: '核心设备',
                  aggregation: '汇聚设备',
                  access: '接入设备'
                };
                const percentage = (count / devices.length) * 100;
                return (
                <div key={type} className="group">
                   <div className="flex justify-between items-center mb-1.5 text-sm">
                      <span className="text-slate-300 font-medium capitalize">{typeMap[type] || type}</span>
                      <span className="text-slate-400 font-mono text-xs bg-slate-800 px-2 py-0.5 rounded">{count}</span>
                   </div>
                   <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 group-hover:bg-blue-400 transition-colors relative" 
                        style={{ width: `${percentage}%` }}
                      >
                         <div className="absolute inset-0 bg-white/20"></div>
                      </div>
                   </div>
                </div>
                );
             })}
          </div>
        </div>

        {/* VLAN 汇总 */}
        <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white mb-6">
             <div className="w-1 h-5 bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7]"></div>
            VLAN 配置
          </h3>
          <div className="grid grid-cols-2 gap-3">
             {/* 聚合所有设备的 VLAN */}
             {(() => {
                const allVlans = new Set();
                devices.forEach(d => {
                    getDeviceVlans(d).forEach(v => allVlans.add(v));
                });
                const sortedVlans = Array.from(allVlans).sort((a,b) => a-b).slice(0, 10);
                
                if (sortedVlans.length === 0) {
                    return (
                        <div className="col-span-2 py-10 text-center text-slate-500 text-sm border-2 border-dashed border-slate-800 rounded-xl">
                          未发现 VLAN 配置
                        </div>
                    );
                }

                return sortedVlans.map(vlanId => {
                   const count = devices.filter(d => getDeviceVlans(d).includes(vlanId)).length;
                   return (
                       <div key={vlanId} className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-3 flex justify-between items-center hover:bg-slate-800/60 transition-colors">
                         <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                           <span className="text-sm font-medium text-slate-300">VLAN {vlanId}</span>
                         </div>
                         <span className="text-xs bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20">
                           {count} 设备
                         </span>
                       </div>
                   );
                });
             })()}
          </div>
        </div>

        {/* OSPF 区域 */}
        <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6">
           <h3 className="flex items-center gap-2 text-lg font-bold text-white mb-6">
             <div className="w-1 h-5 bg-green-500 rounded-full shadow-[0_0_10px_#22c55e]"></div>
            OSPF 区域
          </h3>
          <div className="space-y-3">
             {(() => {
                const areas = new Set();
                devices.forEach(d => {
                    const area = getOspfArea(d);
                    if (area !== undefined) areas.add(area);
                });
                const sortedAreas = Array.from(areas).sort();

                if (sortedAreas.length === 0) {
                    return (
                        <div className="py-10 text-center text-slate-500 text-sm border-2 border-dashed border-slate-800 rounded-xl">
                           未发现 OSPF 配置
                        </div>
                    );
                }

                return sortedAreas.map(areaId => (
                    <div key={areaId} className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 flex justify-between items-center hover:bg-slate-800/60 transition-colors relative overflow-hidden">
                       <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500/50"></div>
                       <div>
                          <span className="text-xs text-slate-500 uppercase tracking-wider font-bold block mb-0.5">区域 ID (Area)</span>
                          <span className="text-xl font-mono text-white font-bold">{areaId}</span>
                       </div>
                       <div className="text-right">
                         <span className="text-2xl font-bold text-green-400 block leading-none">
                           {devices.filter(d => getOspfArea(d) === areaId).length}
                         </span>
                         <span className="text-xs text-slate-500 uppercase font-semibold">路由器</span>
                       </div>
                    </div>
                 ));
             })()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonitoringPanel;
