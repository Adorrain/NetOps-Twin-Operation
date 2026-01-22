import { DeviceType } from '../../types';

export const checkDeviceType = (device, type) => {
  const dType = device?.deviceType || device?.device_type || '';
  if (dType === type) return true;
  if (type === DeviceType.SWITCH) {
    const role = String(device?.role || '').toLowerCase();
    return role === 'access' || role === 'aggregation';
  }
  return false;
};

export const formatVlanHint = (cfg) => {
  if (!cfg) return '-';
  const mode = String(cfg.mode || 'access').toLowerCase();
  if (mode === 'trunk') {
    const allowed = Array.isArray(cfg.allowed_vlans) ? cfg.allowed_vlans : [];
    return allowed.length ? `trunk · allowed ${allowed.join(',')}` : 'trunk';
  }
  const vlan = cfg.vlan ?? 1;
  return `access · vlan ${vlan}`;
};

export const explainLog = (log) => {
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

export const getErrorMessage = (res) => {
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

