/**
 * 全局状态管理（useContext + useState）
 * 
 * Author: Adorrain
 * Date: 2026-04-16
 */

import React, { createContext, useContext, useMemo, useState } from 'react';

const initState = {
  networkTopology: null,
  selectedDeviceId: null,
  deviceStatuses: new Map(),
  opsLogs: [],
  ui: {
  sidebarCollapsed: false,
  activePanel: 'topology',
  loadingStates: new Map(),
  },
};

const AppStoreContext = createContext(null);

function AppStoreProvider({ children }) {
  const [state, setState] = useState(initState);

  const actions = useMemo(
    () => ({
      setNetworkTopology: (topology) => {
        setState((prev) => {
          if (topology && Array.isArray(topology.devices)) {
            const deviceStatuses = new Map();
            topology.devices.forEach((device) => {
              deviceStatuses.set(device.id, device.status);
            });
            return { ...prev, networkTopology: topology, deviceStatuses };
          }

          return { ...prev, networkTopology: topology };
        });
      },
      setSelectedDevice: (deviceId) => {
        setState((prev) => ({ ...prev, selectedDeviceId: deviceId }));
      },
      updateDeviceStatus: (deviceId, status) => {
        setState((prev) => {
          const deviceStatuses = new Map(prev.deviceStatuses);
          deviceStatuses.set(deviceId, status);
          return { ...prev, deviceStatuses };
        });
      },
      addOpsLog: (log) => {
        setState((prev) => {
          const newLog = {
            ...log,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            timestamp: new Date(),
          };
          return { ...prev, opsLogs: [newLog, ...prev.opsLogs].slice(0, 100) };
        });
      },
      updateUI: (updates) => {
        setState((prev) => ({ ...prev, ui: { ...prev.ui, ...updates } }));
      },
      setLoading: (key, loading) => {
        setState((prev) => {
          const loadingStates = new Map(prev.ui.loadingStates);
          if (loading) loadingStates.set(key, true);
          else loadingStates.delete(key);

          return { ...prev, ui: { ...prev.ui, loadingStates } };
        });
      },
    }),
    [],
  );

  return React.createElement(AppStoreContext.Provider, { value: { state, actions } }, children);
}

function useAppContext() {
  const context = useContext(AppStoreContext);
  if (!context) throw new Error('App store hooks must be used within AppStoreProvider');
  return context;
}

function useAppActions() {
  return useAppContext().actions;
}

const useAppState = () => useAppContext().state;

export { AppStoreProvider, useAppState, useAppActions };

