/**
 * 全局状态管理（Zustand）。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import { create } from 'zustand';

/**
 * 创建初始 UI 状态
 */
const createInitialUI = () => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  activePanel: 'topology',
  loadingStates: new Map(),
  notifications: []
});

/**
 * 创建设置拓扑数据的动作函数
 */
const createSetNetworkTopology = (set) => (topology) => {
  set({ networkTopology: topology });

  if (topology) {
    if (Array.isArray(topology.devices)) {
        const deviceStatuses = new Map();
        topology.devices.forEach((device) => {
          deviceStatuses.set(device.id, device.status);
        });
        set({ deviceStatuses });
    }
  }
};

/**
 * 创建设置当前选中设备的动作函数
 */
const createSetSelectedDevice = (set) => (deviceId) => set({ selectedDeviceId: deviceId });

/**
 * 创建追加运维日志的动作函数
 */
const createAddOpsLog = (set) => (log) => {
  const newLog = {
    ...log,
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date()
  };
  set((state) => ({ opsLogs: [newLog, ...state.opsLogs].slice(0, 100) }));
};

/**
 * 创建更新设备状态映射的动作函数
 */
const createUpdateDeviceStatus = (set, get) => (deviceId, status) => {
  const statuses = new Map(get().deviceStatuses);
  statuses.set(deviceId, status);
  set({ deviceStatuses: statuses });
};

/**
 * 创建更新 UI 状态的动作函数
 */
const createUpdateUI = (set) => (updates) => {
  set((state) => ({
    ui: { ...state.ui, ...updates }
  }));
};

/**
 * 创建添加通知的动作函数
 */
const createAddNotification = (set) => (notification) => {
  const newNotification = {
    ...notification,
    id: Date.now().toString(),
    timestamp: new Date(),
    read: false
  };

  set((state) => ({
    ui: {
      ...state.ui,
      notifications: [newNotification, ...state.ui.notifications]
    }
  }));
};

/**
 * 创建将通知标记为已读的动作函数
 */
const createMarkNotificationAsRead = (set) => (notificationId) => {
  set((state) => ({
    ui: {
      ...state.ui,
      notifications: state.ui.notifications.map((notification) =>
        notification.id === notificationId ? { ...notification, read: true } : notification
      )
    }
  }));
};

/**
 * 创建设置加载状态的动作函数
 */
const createSetLoading = (set) => (key, loading) => {
  set((state) => {
    const loadingStates = new Map(state.ui.loadingStates);
    if (loading) {
      loadingStates.set(key, true);
    } else {
      loadingStates.delete(key);
    }

    return {
      ui: {
        ...state.ui,
        loadingStates
      }
    };
  });
};

const useAppStore = create((set, get) => ({
  networkTopology: null,
  selectedDeviceId: null,
  deviceStatuses: new Map(),
  opsLogs: [],
  ui: createInitialUI(),
  setNetworkTopology: createSetNetworkTopology(set),
  setSelectedDevice: createSetSelectedDevice(set),
  addOpsLog: createAddOpsLog(set),
  updateDeviceStatus: createUpdateDeviceStatus(set, get),
  updateUI: createUpdateUI(set),
  addNotification: createAddNotification(set),
  markNotificationAsRead: createMarkNotificationAsRead(set),
  setLoading: createSetLoading(set)
}));

export { useAppStore };
export default useAppStore;
