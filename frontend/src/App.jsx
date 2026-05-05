import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import MainLayout from './components/layout/MainLayout';
import TopologyPage from './routes/topologyPage';
import UploadPage from './routes/uploadPage';
import { TopologyProvider } from './utils/topologyContext';

function App() {
  return (
    <TopologyProvider>
      <BrowserRouter>
        <MainLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/topology" replace />} />
            <Route path="/topology" element={<TopologyPage />} />
            <Route path="/upload" element={<UploadPage />} />
          </Routes>
        </MainLayout>
      </BrowserRouter>
    </TopologyProvider>
  );
}

export default App;