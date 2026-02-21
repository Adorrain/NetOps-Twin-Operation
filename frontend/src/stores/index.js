/**
 * 全局状态管理（Zustand）。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import { create } from 'zustand';

/**
 * 创建初始 3D 场景状态。
 *
 * @returns {object} 3D 场景状态对象。
 */
const createInitialScene3D = () => ({
  cameraPosition: { x: 0, y: 10, z: 20 },
  cameraTarget: { x: 0, y: 0, z: 0 },
  selectedObjects: [],
  hoveredObject: undefined,
  showLabels: true,
  showConnections: true,
  animationSpeed: 1.0
});

/**
 * 创建初始 UI 状态。
 *
 * @returns {object} UI 状态对象。
 */
const createInitialUI = () => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  activePanel: 'topology',
  loadingStates: new Map(),
  notifications: []
});

/**
 * 创建设置拓扑数据的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {(topology:any)=>void} 动作函数。
 */
const createSetNetworkTopology = (set) => (topology) => {
  set({ networkTopology: topology });

  if (topology) {
    // 确保 devices 数组存在
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
 * 创建设置当前选中设备的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {(deviceId:any)=>void} 动作函数。
 */
const createSetSelectedDevice = (set) => (deviceId) => set({ selectedDeviceId: deviceId });

/**
 * 创建设置当前选中连接的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {(connectionId:any)=>void} 动作函数。
 */
const createSetSelectedConnection = (set) => (connectionId) => set({ selectedConnectionId: connectionId });

/**
 * 创建追加运维日志的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {(log:any)=>void} 动作函数。
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
 * 创建清空运维日志的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {()=>void} 动作函数。
 */
const createClearOpsLogs = (set) => () => set({ opsLogs: [] });

/**
 * 创建更新设备状态映射的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @param {Function} get Zustand get 方法。
 * @returns {(deviceId:string,status:any)=>void} 动作函数。
 */
const createUpdateDeviceStatus = (set, get) => (deviceId, status) => {
  const statuses = new Map(get().deviceStatuses);
  statuses.set(deviceId, status);
  set({ deviceStatuses: statuses });
};

/**
 * 创建更新 3D 场景状态的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {(updates:object)=>void} 动作函数。
 */
const createUpdateScene3D = (set) => (updates) => {
  set((state) => ({
    scene3D: { ...state.scene3D, ...updates }
  }));
};

/**
 * 创建更新 UI 状态的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {(updates:object)=>void} 动作函数。
 */
const createUpdateUI = (set) => (updates) => {
  set((state) => ({
    ui: { ...state.ui, ...updates }
  }));
};

/**
 * 创建添加通知的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {(notification:object)=>void} 动作函数。
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
 * 创建将通知标记为已读的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {(notificationId:string)=>void} 动作函数。
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
 * 创建清空通知的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {()=>void} 动作函数。
 */
const createClearNotifications = (set) => () => {
  set((state) => ({
    ui: {
      ...state.ui,
      notifications: []
    }
  }));
};

/**
 * 创建选择 3D 对象的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {(objectId:any)=>void} 动作函数。
 */
const createSelectObject = (set) => (objectId) => {
  set((state) => ({
    scene3D: {
      ...state.scene3D,
      selectedObjects: [...state.scene3D.selectedObjects, objectId]
    }
  }));
};

/**
 * 创建取消选择 3D 对象的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {(objectId:any)=>void} 动作函数。
 */
const createDeselectObject = (set) => (objectId) => {
  set((state) => ({
    scene3D: {
      ...state.scene3D,
      selectedObjects: state.scene3D.selectedObjects.filter((id) => id !== objectId)
    }
  }));
};

/**
 * 创建清空 3D 选择集的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {()=>void} 动作函数。
 */
const createClearSelection = (set) => () => {
  set((state) => ({
    scene3D: {
      ...state.scene3D,
      selectedObjects: []
    }
  }));
};

/**
 * 创建设置 3D 悬停对象的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {(objectId:any)=>void} 动作函数。
 */
const createSetHoveredObject = (set) => (objectId) => {
  set((state) => ({
    scene3D: {
      ...state.scene3D,
      hoveredObject: objectId
    }
  }));
};

/**
 * 创建设置加载状态的动作函数。
 *
 * @param {Function} set Zustand set 方法。
 * @returns {(key:string,loading:boolean)=>void} 动作函数。
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

/**
 * 创建处理设备状态更新事件的动作函数。
 *
 * @param {Function} get Zustand get 方法。
 * @returns {(update:{deviceId:string,status:any})=>void} 动作函数。
 */
const createHandleDeviceStatusUpdate = (get) => (update) => {
  const { deviceId, status } = update;
  get().updateDeviceStatus(deviceId, status);

  get().addNotification({
    type: status === 'online' ? 'success' : 'warning',
    title: '设备状态更新',
    message: `设备 ${deviceId} 状态变更为 ${status}`
  });
};

/**
 * 创建处理网络事件的动作函数。
 *
 * @param {Function} get Zustand get 方法。
 * @returns {(event:any)=>void} 动作函数。
 */
const createHandleNetworkEvent = (get) => (event) => {
  const notificationType =
    event.severity === 'critical'
      ? 'error'
      : event.severity === 'high'
        ? 'warning'
        : event.severity === 'medium'
          ? 'info'
          : 'info';

  get().addNotification({
    type: notificationType,
    title: `网络事件: ${event.type}`,
    message: event.message
  });
};

const useAppStore = create((set, get) => ({
  networkTopology: null,
  selectedDeviceId: null,
  deviceStatuses: new Map(),
  selectedConnectionId: undefined,
  opsLogs: [],
  scene3D: createInitialScene3D(),
  ui: createInitialUI(),
  setNetworkTopology: createSetNetworkTopology(set),
  setSelectedDevice: createSetSelectedDevice(set),
  setSelectedConnection: createSetSelectedConnection(set),
  addOpsLog: createAddOpsLog(set),
  clearOpsLogs: createClearOpsLogs(set),
  updateDeviceStatus: createUpdateDeviceStatus(set, get),
  updateScene3D: createUpdateScene3D(set),
  updateUI: createUpdateUI(set),
  addNotification: createAddNotification(set),
  markNotificationAsRead: createMarkNotificationAsRead(set),
  clearNotifications: createClearNotifications(set),
  selectObject: createSelectObject(set),
  deselectObject: createDeselectObject(set),
  clearSelection: createClearSelection(set),
  setHoveredObject: createSetHoveredObject(set),
  setLoading: createSetLoading(set),
  handleDeviceStatusUpdate: createHandleDeviceStatusUpdate(get),
  handleNetworkEvent: createHandleNetworkEvent(get)
}));

/**
 * 读取当前网络拓扑。
 *
 * @returns {any} 网络拓扑对象。
 */
export const useNetworkTopology = () => useAppStore((state) => state.networkTopology);

/**
 * 读取当前选中设备 ID。
 *
 * @returns {any} 设备 ID。
 */
export const useSelectedDevice = () => useAppStore((state) => state.selectedDeviceId);

/**
 * 读取设备状态映射。
 *
 * @returns {Map<any, any>} 设备状态映射。
 */
export const useDeviceStatuses = () => useAppStore((state) => state.deviceStatuses);

/**
 * 读取 3D 场景状态。
 *
 * @returns {object} 3D 场景状态对象。
 */
export const useScene3D = () => useAppStore((state) => state.scene3D);

/**
 * 读取 UI 状态。
 *
 * @returns {object} UI 状态对象。
 */
export const useUI = () => useAppStore((state) => state.ui);

export { useAppStore };
export default useAppStore;
