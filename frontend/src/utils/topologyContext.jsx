/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useContext } from 'react';

const TopologyContext = createContext();

export function TopologyProvider({ children }) {
  const [networkTopology, setNetworkTopology] = useState(null);

  return (
    <TopologyContext.Provider value={{ networkTopology, setNetworkTopology }}>
      {children}
    </TopologyContext.Provider>
  );
}

export function useTopology() {
  return useContext(TopologyContext);
}
