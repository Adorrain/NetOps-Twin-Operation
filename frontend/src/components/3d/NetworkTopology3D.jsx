import React, { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Text, RoundedBox, Line, Float } from '@react-three/drei';
import * as THREE from 'three';
import { DEVICE_SIZE, VLAN_COLOR } from '../../types';
import { getVlans } from '../../utils/utils';

const getLinkpoints = (link, devices) => {
  const src = devices.find((device) => String(device.id) === String(link.srcDevice));
  const dst = devices.find((device) => String(device.id) === String(link.dstDevice));
  if (!src?.position || !dst?.position) {
    return null;
  }
  return {
    src,
    dst,
    points: [
      [src.position.x, 0.5, src.position.z],
      [dst.position.x, 0.5, dst.position.z],
    ],
  };
};

const ServerDevice = ({ size, statusColor = '#22c55e' }) => {
  return (
    <group>
      <RoundedBox args={size} radius={0.05}>
        <meshStandardMaterial color="#475569" />
      </RoundedBox>

      <mesh position={[0, size[1] / 2 - 0.12, size[2] / 2 + 0.01]}>
        <boxGeometry args={[size[0] * 0.96, 0.06, 0.02]} />
        <meshStandardMaterial color={statusColor} />
      </mesh>

      <group position={[0, 0, size[2] / 2 + 0.02]}>
        <mesh position={[size[0] / 3, size[1] / 5, 0]}>
          <circleGeometry args={[0.07, 24]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1.5} />
        </mesh>

        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, -size[1] / 6 - i * 0.11, 0]}>
            <boxGeometry args={[size[0] * 0.88, 0.024, 0.01]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

const SwitchDevice = ({ size, color = '#38bdf8', statusColor = '#22c55e' }) => {
  return (
    <group position={[0, ((size[1] * 1.28) - size[1]) / 2, 0]}>
      <RoundedBox args={[size[0], size[1] * 1.36, size[2]]} radius={0.08}>
        <meshStandardMaterial color="#475569" />
      </RoundedBox>

      <mesh position={[0, (size[1] * 1.28) / 2 - 0.06, 0]}>
        <boxGeometry args={[size[0] * 0.94, 0.04, size[2] * 0.9]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
      </mesh>

      <group position={[0, 0.36, size[2] / 2 + 0.03]}>
        {Array.from({ length: 3 }).map((_, row) => {
          const y = (size[1] * 1.28) / 2 - ((size[1] * 1.28) / 3) / 2 - row * ((size[1] * 1.28) / 3);

          return (
            <group key={row} position={[0, y - (size[1] * 1.28) / 2, 0]}>
              {row !== 0 && (
                <mesh position={[0, (size[1] * 1.28) / 6, 0]}>
                  <boxGeometry args={[size[0] * 0.96, 0.01, 0.01]} />
                  <meshStandardMaterial color="#64748b" />
                </mesh>
              )}
              
              {Array.from({ length: 5 }).map((_, i) => {
                const x =
                  -size[0] * 0.33 +
                  (i * (size[0] * 0.42)) / 7;

                return (
                  <mesh key={i} position={[x, 0, 0]}>
                    <boxGeometry args={[0.08, 0.05, 0.02]} />
                    <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
                  </mesh>
                );
              })}

              <mesh position={[size[0] * 0.12, 0.01, 0.01]}>
                <boxGeometry args={[size[0] * 0.28, 0.03, 0.02]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.15} />
              </mesh>

              <mesh position={[size[0] * 0.38, 0, 0]}>
                <circleGeometry args={[0.045, 20]} />
                <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={1.1} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
};

const RouterDevice = ({ size }) => {
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[Math.max(size[0], size[2]) * 0.4, Math.max(size[0], size[2]) * 0.4, size[1] * 0.8, 48]} />
        <meshStandardMaterial color="#475569" roughness={0.4} metalness={0.3} />
      </mesh>

      <group position={[0, (size[1] * 0.8) / 2 + 0.03, 0]}>
        {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle, i) => (
          <group key={i} rotation={[0, angle, 0]}>
            <mesh position={[0, 0, Math.max(size[0], size[2]) * 0.4 * 0.18]}>
              <boxGeometry args={[0.16, 0.03, Math.max(size[0], size[2]) * 0.4 * 0.58]} />
              <meshBasicMaterial color="#e2e8f0" toneMapped={false} />
            </mesh>

            <mesh position={[0, 0, Math.max(size[0], size[2]) * 0.4 * 0.58]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.15, 0.28, 3]} />
              <meshBasicMaterial color="#e2e8f0" toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
};

const TerminalDevice = ({ size }) => {
  return (
    <group scale={[1.35, 1.35, 1.35]}>
      <RoundedBox args={[size[0], size[1]*0.8, 0.1]} radius={0.05} position={[0, size[1]/2, 0]}>
        <meshPhysicalMaterial color="#475569" roughness={0.3} metalness={0.2} />
      </RoundedBox>
      <mesh position={[0, size[1]/2, 0.06]}>
        <planeGeometry args={[size[0], size[1]*0.8]} />
        <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.05} opacity={0.8} transparent />
      </mesh>
      <mesh position={[0, 0, -0.2]}>
        <cylinderGeometry args={[0.05, 0.1, 0.5]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[0, -0.25, -0.2]}>
        <boxGeometry args={[0.4, 0.05, 0.4]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
    </group>
  );
};

function DeviceMesh({ device, onClick }) {
  const size = DEVICE_SIZE[device?.deviceType].size;
  const vlanId = getVlans(device)[0];
  const  vlanColor = vlanId ? VLAN_COLOR[vlanId % VLAN_COLOR.length]: '#334155';
  console.log(vlanId, vlanColor);
  const renderModel = () => {
    switch (device?.deviceType) {
      case 'switch':
        return <SwitchDevice size={size} />;
      case 'server':
        return <ServerDevice size={size} />;
      case 'router':
        return <RouterDevice size={size} />;
      case 'pc':
        return <TerminalDevice size={size} />;
      default:
        return <ServerDevice size={size} />;
    }
  };

  return (
    <group
      position={[device?.position?.x,device?.position?.y + size?.[1] / 2,device?.position?.z,]}
      onClick={(e) => {e.stopPropagation();onClick?.(e);}}
    >
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        {renderModel()}
      </Float>

    <Text
      position={[0, size?.[1] + 0.5, 0]}
      fontSize={0.4}
      color="white"
      outlineWidth={0.02}
      outlineColor="#000"
    >
      {device?.name}
    </Text>

    <mesh
      position={[0, -(size?.[1] / 2) + 0.02, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[size?.[0] / 2 || 1, (size?.[0] / 2 || 1) + 0.15, 32]} />
      <meshBasicMaterial
        color={vlanColor}
        transparent
        opacity={vlanId ? 0.6 : 0.3}
        side={THREE.DoubleSide}
      />
    </mesh>

    {vlanId && (
      <Text
        position={[0, -(size?.[1] / 2) + 0.02, (size?.[0] / 2) + 0.4]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.25}
        color={vlanColor}
      >
        VLAN {vlanId}
      </Text>
    )}
  </group>
)};



function LinkMesh({ link, devices, ecmpPaths = [] }) {
  const endpoints = getLinkpoints(link, devices);
  const particlesRef = useRef();
  const linkEnabled = link?.status !== 'inactive' && link?.status !== 'failed';
  const ecmpHighlight = ecmpPaths.some((path) =>
    Array.isArray(path) &&
    path.some((nodeId, index) => {
      if (index >= path.length - 1) return false;
      const current = String(nodeId);
      const next = String(path[index + 1]);
      return (
        (String(link?.srcDevice) === current && String(link?.dstDevice) === next) ||
        (String(link?.srcDevice) === next && String(link?.dstDevice) === current)
      );
    })
  );

  const particlesGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 3), 3));
    return g;
  }, []);

  useFrame(({ clock }) => {
    if (!linkEnabled || !endpoints?.src?.position || !endpoints?.dst?.position) return;
    if (!particlesRef.current || !endpoints?.src?.position || !endpoints?.dst?.position) return;

    const start = new THREE.Vector3(endpoints.src.position.x, 0.5, endpoints.src.position.z);
    const end = new THREE.Vector3(endpoints.dst.position.x, 0.5, endpoints.dst.position.z);

    const pos = particlesRef.current.geometry.attributes.position;

    for (let i = 0; i < 5; i++) {
      const p = new THREE.Vector3().lerpVectors(start, end, (clock.getElapsedTime() + i / 5) % 1);
      pos.setXYZ(i, p.x, p.y, p.z);
    }

    pos.needsUpdate = true;
  });

  const utils = typeof link?.utilization === 'number' ? link.utilization : null;
  const linkColor = !linkEnabled
    ? '#6b7280'
    : ecmpHighlight
      ? '#f97316'
    : utils === null
      ? '#3b82f6'
      : utils >= 0.8
        ? '#ef4444'
        : utils >= 0.5
          ? '#f59e0b'
          : '#22c55e';

  return (
    <group>
      <Line points={endpoints.points} color={linkColor} opacity={ecmpHighlight ? 1 : 0.7} transparent lineWidth={ecmpHighlight ? 4 : 1} />

      {linkEnabled && (
        <points ref={particlesRef}>
          <bufferGeometry attach="geometry" {...particlesGeometry} />
          <pointsMaterial color={linkColor} size={0.15} transparent opacity={1} />
        </points>
      )}
    </group>
  );
}

function Scene({ networkTopology, onDeviceClick }) {
  const devices = networkTopology?.devices || [];
  const links = networkTopology?.links || [];
  const ecmpPaths = networkTopology?.ecmpPaths || [];

  return (
    <>
      <Grid
        args={[100, 100]}
        cellSize={1}
        cellThickness={0.5}
        sectionSize={5}
        sectionThickness={1}
        fadeDistance={50}
        cellColor="#1e293b"
        sectionColor="#334155"
      />

      {devices.map((device) => (
        <DeviceMesh
          key={device.id}
          device={device}
          onClick={(e) => {
            e.stopPropagation();
            onDeviceClick?.(device);
          }}
        />
      ))}

      {links.map((link) => (
        <LinkMesh key={link.id} link={link} devices={devices} ecmpPaths={ecmpPaths} />
      ))}
    </>
  );
}

export default function NetworkTopology3D({ networkTopology, onDeviceClick }) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#111217' }}>
      <Canvas shadows camera={{ position: [15, 12, 15], fov: 45 }} dpr={[1, 2]}>
        <ambientLight intensity={1.5} />
        <hemisphereLight intensity={1} groundColor="#1e293b" skyColor="#fff" />
        <directionalLight position={[10, 10, 5]} intensity={2.5} castShadow />
        <pointLight position={[-10, 10, -10]} intensity={2} />

        <Suspense fallback={null}>
          <Scene networkTopology={networkTopology} onDeviceClick={onDeviceClick} />
        </Suspense>

        <OrbitControls
          minDistance={5}
          maxDistance={50}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
    </div>
  );
}
