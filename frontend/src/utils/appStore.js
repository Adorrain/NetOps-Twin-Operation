/**
 * 全局状态管理（Context + useReducer）。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';

/**
 * 创建初始 UI 状态
 */
const createInitialUI = () => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  activePanel: 'topology',
  loadingStates: new Map(),
  notifications: [],
});

const initialState = {
  networkTopology: null,
  selectedDeviceId: null,
  deviceStatuses: new Map(),
  opsLogs: [],
  ui: createInitialUI(),
};

const ACTIONS = {
  SET_NETWORK_TOPOLOGY: 'SET_NETWORK_TOPOLOGY',
  SET_SELECTED_DEVICE: 'SET_SELECTED_DEVICE',
  UPDATE_DEVICE_STATUS: 'UPDATE_DEVICE_STATUS',
  ADD_OPS_LOG: 'ADD_OPS_LOG',
  UPDATE_UI: 'UPDATE_UI',
  ADD_NOTIFICATION: 'ADD_NOTIFICATION',
  MARK_NOTIFICATION_AS_READ: 'MARK_NOTIFICATION_AS_READ',
  SET_LOADING: 'SET_LOADING',
};

function appReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_NETWORK_TOPOLOGY: {
      const topology = action.payload;
      if (topology && Array.isArray(topology.devices)) {
        const deviceStatuses = new Map();
        topology.devices.forEach((device) => {
          deviceStatuses.set(device.id, device.status);
        });
        return { ...state, networkTopology: topology, deviceStatuses };
      }

      return { ...state, networkTopology: topology };
    }

    case ACTIONS.SET_SELECTED_DEVICE:
      return { ...state, selectedDeviceId: action.payload };

    case ACTIONS.UPDATE_DEVICE_STATUS: {
      const { deviceId, status } = action.payload;
      const statuses = new Map(state.deviceStatuses);
      statuses.set(deviceId, status);
      return { ...state, deviceStatuses: statuses };
    }

    case ACTIONS.ADD_OPS_LOG: {
      const log = action.payload;
      const newLog = {
        ...log,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        timestamp: new Date(),
      };
      return { ...state, opsLogs: [newLog, ...state.opsLogs].slice(0, 100) };
    }

    case ACTIONS.UPDATE_UI: {
      return { ...state, ui: { ...state.ui, ...action.payload } };
    }

    case ACTIONS.ADD_NOTIFICATION: {
      const notification = action.payload;
      const newNotification = {
        ...notification,
        id: Date.now().toString(),
        timestamp: new Date(),
        read: false,
      };

      return {
        ...state,
        ui: {
          ...state.ui,
          notifications: [newNotification, ...state.ui.notifications],
        },
      };
    }

    case ACTIONS.MARK_NOTIFICATION_AS_READ: {
      const notificationId = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          notifications: state.ui.notifications.map((notification) =>
            notification.id === notificationId ? { ...notification, read: true } : notification,
          ),
        },
      };
    }

    case ACTIONS.SET_LOADING: {
      const { key, loading } = action.payload;
      const loadingStates = new Map(state.ui.loadingStates);

      if (loading) loadingStates.set(key, true);
      else loadingStates.delete(key);

      return { ...state, ui: { ...state.ui, loadingStates } };
    }

    default:
      return state;
  }
}

const AppStoreContext = createContext(null);

function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const setNetworkTopology = useCallback(
    (topology) => dispatch({ type: ACTIONS.SET_NETWORK_TOPOLOGY, payload: topology }),
    [dispatch],
  );

  const setSelectedDevice = useCallback(
    (deviceId) => dispatch({ type: ACTIONS.SET_SELECTED_DEVICE, payload: deviceId }),
    [dispatch],
  );

  const updateDeviceStatus = useCallback(
    (deviceId, status) =>
      dispatch({ type: ACTIONS.UPDATE_DEVICE_STATUS, payload: { deviceId, status } }),
    [dispatch],
  );

  const addOpsLog = useCallback(
    (log) => dispatch({ type: ACTIONS.ADD_OPS_LOG, payload: log }),
    [dispatch],
  );

  const updateUI = useCallback(
    (updates) => dispatch({ type: ACTIONS.UPDATE_UI, payload: updates }),
    [dispatch],
  );

  const addNotification = useCallback(
    (notification) => dispatch({ type: ACTIONS.ADD_NOTIFICATION, payload: notification }),
    [dispatch],
  );

  const markNotificationAsRead = useCallback(
    (notificationId) =>
      dispatch({ type: ACTIONS.MARK_NOTIFICATION_AS_READ, payload: notificationId }),
    [dispatch],
  );

  const setLoading = useCallback(
    (key, loading) => dispatch({ type: ACTIONS.SET_LOADING, payload: { key, loading } }),
    [dispatch],
  );

  const actions = useMemo(
    () => ({
      setNetworkTopology,
      setSelectedDevice,
      updateDeviceStatus,
      addOpsLog,
      updateUI,
      addNotification,
      markNotificationAsRead,
      setLoading,
    }),
    [
      setNetworkTopology,
      setSelectedDevice,
      updateDeviceStatus,
      addOpsLog,
      updateUI,
      addNotification,
      markNotificationAsRead,
      setLoading,
    ],
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);

  // 用 createElement 避免 JSX 语法在 .js 文件下的解析差异
  return React.createElement(AppStoreContext.Provider, { value }, children);
}

function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error('useAppStore must be used within AppStoreProvider');

  const { state, actions } = ctx;
  return { ...state, ...actions };
}

export { useAppStore, AppStoreProvider };

