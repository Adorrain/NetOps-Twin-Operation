import React from 'react';
import { useNavigate } from 'react-router-dom';
import ConfigUploader from '../components/ui/ConfigUploader';
import { useTopology } from '../utils/topologyContext';

export default function UploadPage() {
  const navigate = useNavigate();
  const { setNetworkTopology } = useTopology();

  const handleSuccess = (topology) => {
    setNetworkTopology(topology);
    navigate('/topology');
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <ConfigUploader onConfigLoaded={handleSuccess} setNetworkTopology={setNetworkTopology} />
    </div>
  );
}