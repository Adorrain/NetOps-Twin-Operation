/** 全局状态管理（单一 Context + useReducer） */

import React, { createContext, useContext, useMemo, useReducer } from 'react';

const initialState = {
  networkTopology: null,
  selectedDeviceId: null,
  deviceStatuses: new Map(),
  opsLogs: [],
  ui: {
  sidebarOpen: true,
  sidebarCollapsed: false,
  activePanel: 'topology',
  loadingStates: new Map(),
  notifications: [],
  },
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_NETWORK_TOPOLOGY': {
      const topology = action.topology;
      if (topology && Array.isArray(topology.devices)) {
        const deviceStatuses = new Map();
        topology.devices.forEach((device) => {
          deviceStatuses.set(device.id, device.status);
        });
        return { ...state, networkTopology: topology, deviceStatuses };
      }

      return { ...state, networkTopology: topology };
    }

    case 'SET_SELECTED_DEVICE':
      return { ...state, selectedDeviceId: action.deviceId };

    case 'UPDATE_DEVICE_STATUS': {
      const { deviceId, status } = action;
      const statuses = new Map(state.deviceStatuses);
      statuses.set(deviceId, status);
      return { ...state, deviceStatuses: statuses };
    }

    case 'ADD_OPS_LOG': {
      const log = action.log;
      const newLog = {
        ...log,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        timestamp: new Date(),
      };
      return { ...state, opsLogs: [newLog, ...state.opsLogs].slice(0, 100) };
    }

    case 'UPDATE_UI': {
      return { ...state, ui: { ...state.ui, ...action.updates } };
    }

    case 'ADD_NOTIFICATION': {
      const notification = action.notification;
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

    case 'MARK_NOTIFICATION_AS_READ': {
      const notificationId = action.notificationId;
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

    case 'SET_LOADING': {
      const { key, loading } = action;
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
  const [state, dispatch] = useReducer(reducer, initialState);

  // 用 createElement 避免 JSX 在 .js 文件下的解析差异
  return React.createElement(AppStoreContext.Provider, { value: { state, dispatch } }, children);
}

function useAppContext() {
  const context = useContext(AppStoreContext);
  if (!context) throw new Error('App store hooks must be used within AppStoreProvider');
  return context;
}

function useAppActions() {
  const { dispatch } = useAppContext();

  return useMemo(
    () => ({
      setNetworkTopology: (topology) => dispatch({ type: 'SET_NETWORK_TOPOLOGY', topology }),
      setSelectedDevice: (deviceId) => dispatch({ type: 'SET_SELECTED_DEVICE', deviceId }),
      updateDeviceStatus: (deviceId, status) =>
        dispatch({ type: 'UPDATE_DEVICE_STATUS', deviceId, status }),
      addOpsLog: (log) => dispatch({ type: 'ADD_OPS_LOG', log }),
      updateUI: (updates) => dispatch({ type: 'UPDATE_UI', updates }),
      addNotification: (notification) => dispatch({ type: 'ADD_NOTIFICATION', notification }),
      markNotificationAsRead: (notificationId) =>
        dispatch({ type: 'MARK_NOTIFICATION_AS_READ', notificationId }),
      setLoading: (key, loading) => dispatch({ type: 'SET_LOADING', key, loading }),
    }),
    [dispatch],
  );
}

const useAppState = () => useAppContext().state;

export { AppStoreProvider, useAppState, useAppActions };

