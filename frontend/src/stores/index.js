import { create } from 'zustand';

const useAppStore = create((set, get) => ({
  // 初始状态
  networkTopology: null,
  selectedDeviceId: null,
  deviceStatuses: new Map(),
  selectedConnectionId: undefined,
  opsLogs: [],
  
  scene3D: {
    cameraPosition: { x: 0, y: 10, z: 20 },
    cameraTarget: { x: 0, y: 0, z: 0 },
    selectedObjects: [],
    hoveredObject: undefined,
    showLabels: true,
    showConnections: true,
    animationSpeed: 1.0,
  },
  
  ui: {
    sidebarOpen: true,
    sidebarCollapsed: false,
    activePanel: 'topology',
    loadingStates: new Map(),
    notifications: [],
  },
  
  // 网络拓扑管理
  setNetworkTopology: (topology) => {
    set({ networkTopology: topology });
    
    // 初始化设备状态映射
    if (topology) {
      const deviceStatuses = new Map();
      topology.devices.forEach(device => {
        deviceStatuses.set(device.id, device.status);
      });
      set({ deviceStatuses });
    }
  },
  
  setSelectedDevice: (deviceId) => set({ selectedDeviceId: deviceId }),
  setSelectedConnection: (connectionId) => set({ selectedConnectionId: connectionId }),
  addOpsLog: (log) => {
    const newLog = { ...log, id: Date.now().toString() + Math.random().toString(36).substr(2, 5), timestamp: new Date() };
    set(state => ({ opsLogs: [newLog, ...state.opsLogs].slice(0, 100) }));
  },
  clearOpsLogs: () => set({ opsLogs: [] }),
  
  updateDeviceStatus: (deviceId, status) => {
    const statuses = new Map(get().deviceStatuses);
    statuses.set(deviceId, status);
    set({ deviceStatuses: statuses });
  },
  
  // 3D场景控制
  updateScene3D: (updates) => {
    set(state => ({
      scene3D: { ...state.scene3D, ...updates }
    }));
  },
  
  // UI控制
  updateUI: (updates) => {
    set(state => ({
      ui: { ...state.ui, ...updates }
    }));
  },
  
  // 通知管理
  addNotification: (notification) => {
    const newNotification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
      read: false,
    };
    
    set(state => ({
      ui: {
        ...state.ui,
        notifications: [newNotification, ...state.ui.notifications]
      }
    }));
  },
  
  markNotificationAsRead: (notificationId) => {
    set(state => ({
      ui: {
        ...state.ui,
        notifications: state.ui.notifications.map(notification =>
          notification.id === notificationId
            ? { ...notification, read: true }
            : notification
        )
      }
    }));
  },
  
  clearNotifications: () => {
    set(state => ({
      ui: {
        ...state.ui,
        notifications: []
      }
    }));
  },
  
  // 3D对象选择
  selectObject: (objectId) => {
    set(state => ({
      scene3D: {
        ...state.scene3D,
        selectedObjects: [...state.scene3D.selectedObjects, objectId]
      }
    }));
  },
  
  deselectObject: (objectId) => {
    set(state => ({
      scene3D: {
        ...state.scene3D,
        selectedObjects: state.scene3D.selectedObjects.filter(id => id !== objectId)
      }
    }));
  },
  
  clearSelection: () => {
    set(state => ({
      scene3D: {
        ...state.scene3D,
        selectedObjects: []
      }
    }));
  },
  
  setHoveredObject: (objectId) => {
    set(state => ({
      scene3D: {
        ...state.scene3D,
        hoveredObject: objectId
      }
    }));
  },
  
  // 加载状态
  setLoading: (key, loading) => {
    set(state => {
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
  },
  
  // WebSocket事件处理
  handleDeviceStatusUpdate: (update) => {
    const { deviceId, status } = update;
    get().updateDeviceStatus(deviceId, status);
    
    // 添加状态变更通知
    get().addNotification({
      type: status === 'online' ? 'success' : 'warning',
      title: '设备状态更新',
      message: `设备 ${deviceId} 状态变更为 ${status}`,
    });
  },
  
  handleNetworkEvent: (event) => {
    // 根据事件类型添加通知
    const notificationType = 
      event.severity === 'critical' ? 'error' :
      event.severity === 'high' ? 'warning' :
      event.severity === 'medium' ? 'info' : 'info';
    
    get().addNotification({
      type: notificationType,
      title: `网络事件: ${event.type}`,
      message: event.message,
    });
  },
}));

// 选择器
export const useNetworkTopology = () => useAppStore(state => state.networkTopology);
export const useSelectedDevice = () => useAppStore(state => state.selectedDeviceId);
export const useDeviceStatuses = () => useAppStore(state => state.deviceStatuses);
export const useScene3D = () => useAppStore(state => state.scene3D);
export const useUI = () => useAppStore(state => state.ui);

export { useAppStore };
export default useAppStore;
