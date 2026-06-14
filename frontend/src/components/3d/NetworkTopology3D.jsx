import { Suspense, useRef, useFrame } from 'react';
import { Canvas, useFrame as r3fUseFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Text, RoundedBox, Line, Float } from '@react-three/drei';
import * as THREE from 'three';
import { DEVICE_SIZE, VLAN_COLOR } from '../../types';
import { getVlans } from '../../utils/utils';

const GRID_CONFIG = {
  size: 100,
  cell: 1,
  section: 5,
  cellColor: '#1e293b',
  sectionColor: '#334155',
  fadeDistance: 50,
};

const CAMERA_CONFIG = {
  position: [15, 12, 15],
  fov: 45,
};

const CONTROLS_CONFIG = {
  minDistance: 5,
  maxDistance: 50,
  maxPolarAngle: Math.PI / 2.1,
};

const LINK_PARTICLE_COUNT = 5;
const BASE_LINK_HEIGHT = 0.5;
const DEFAULT_LINE_OPACITY = 0.7;
const HIGHLIGHT_LINE_WIDTH = 4;
const NORMAL_LINE_WIDTH = 1;
const PARTICLE_SIZE = 0.15;

const getLinkColor = (isActive, isEcmp, utilization) => {
  if (!isActive) return '#6b7280';
  if (isEcmp) return '#f97316';
  if (utilization >= 0.8) return '#ef4444';
  if (utilization >= 0.5) return '#f59e0b';
  if (utilization != null) return '#22c55e';
  return '#3b82f6';
};

function getLinkEndpoints(link, devices) {
  const srcDev = devices.find(d => String(d.id) === String(link.srcDevice));
  const dstDev = devices.find(d => String(d.id) === String(link.dstDevice));

  if (!srcDev?.position || !dstDev?.position) return null;

  return {
    src: srcDev,
    dst: dstDev,
    points: [
      [srcDev.position.x, BASE_LINK_HEIGHT, srcDev.position.z],
      [dstDev.position.x, BASE_LINK_HEIGHT, dstDev.position.z],
    ],
  };
}

function Server({ size, statusColor = '#22c55e' }) {
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
        {[0, 1, 2].map(i => (
          <mesh key={i} position={[0, -size[1] / 6 - i * 0.11, 0]}>
            <boxGeometry args={[size[0] * 0.88, 0.024, 0.01]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Switch({ size, mainColor = '#38bdf8', statusColor = '#22c55e' }) {
  const bodyHeight = size[1] * 1.36;
  const bodyOffset = (bodyHeight - size[1]) / 2;

  return (
    <group position={[0, bodyOffset, 0]}>
      <RoundedBox args={[size[0], bodyHeight, size[2]]} radius={0.08}>
        <meshStandardMaterial color="#475569" />
      </RoundedBox>

      <mesh position={[0, bodyHeight / 2 - 0.06, 0]}>
        <boxGeometry args={[size[0] * 0.94, 0.04, size[2] * 0.9]} />
        <meshStandardMaterial color={mainColor} emissive={mainColor} emissiveIntensity={0.15} />
      </mesh>

      <group position={[0, 0.36, size[2] / 2 + 0.03]}>
        {[0, 1, 2].map(row => {
          const rowY = bodyHeight / 2 - (bodyHeight / 3) / 2 - row * (bodyHeight / 3);
          return (
            <group key={row} position={[0, rowY - bodyHeight / 2, 0]}>
              {row !== 0 && (
                <mesh position={[0, bodyHeight / 6, 0]}>
                  <boxGeometry args={[size[0] * 0.96, 0.01, 0.01]} />
                  <meshStandardMaterial color="#64748b" />
                </mesh>
              )}
              {[0, 1, 2, 3, 4].map(i => {
                const x = -size[0] * 0.33 + (i * (size[0] * 0.42)) / 7;
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
}

function Router({ size }) {
  const r = Math.max(size[0], size[2]) * 0.4;
  const h = size[1] * 0.8;
  const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];

  return (
    <group>
      <mesh>
        <cylinderGeometry args={[r, r, h, 48]} />
        <meshStandardMaterial color="#475569" roughness={0.4} metalness={0.3} />
      </mesh>
      <group position={[0, h / 2 + 0.03, 0]}>
        {angles.map((angle, idx) => (
          <group key={idx} rotation={[0, angle, 0]}>
            <mesh position={[0, 0, r * 0.18]}>
              <boxGeometry args={[0.16, 0.03, r * 0.58]} />
              <meshBasicMaterial color="#e2e8f0" toneMapped={false} />
            </mesh>
            <mesh position={[0, 0, r * 0.58]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.15, 0.28, 3]} />
              <meshBasicMaterial color="#e2e8f0" toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function Terminal({ size }) {
  return (
    <group scale={[1.35, 1.35, 1.35]}>
      <RoundedBox args={[size[0], size[1] * 0.8, 0.1]} radius={0.05} position={[0, size[1] / 2, 0]}>
        <meshPhysicalMaterial color="#475569" roughness={0.3} metalness={0.2} />
      </RoundedBox>
      <mesh position={[0, size[1] / 2, 0.06]}>
        <planeGeometry args={[size[0], size[1] * 0.8]} />
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
}

function DeviceItem({ device, onClick }) {
  const size = DEVICE_SIZE[device.deviceType].size;
  const vlanList = getVlans(device);
  const vlanId = vlanList[0];
  const vlanColor = vlanId ? VLAN_COLOR[vlanId % VLAN_COLOR.length] : '#334155';

  let DeviceModel;
  switch (device.deviceType) {
    case 'switch':
      DeviceModel = Switch;
      break;
    case 'server':
      DeviceModel = Server;
      break;
    case 'router':
      DeviceModel = Router;
      break;
    case 'pc':
      DeviceModel = Terminal;
      break;
    default:
      DeviceModel = Server;
  }

  return (
    <group
      position={[device.position.x, device.position.y + size[1] / 2, device.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick(device);
      }}
    >
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        <DeviceModel size={size} />
      </Float>
      <Text
        position={[0, size[1] + 0.5, 0]}
        fontSize={0.4}
        color="#fff"
        outlineWidth={0.02}
        outlineColor="#000"
      >
        {device.name}
      </Text>
      <mesh
        position={[0, -(size[1] / 2) + 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[size[0] / 2, size[0] / 2 + 0.15, 32]} />
        <meshBasicMaterial
          color={vlanColor}
          transparent
          opacity={vlanId ? 0.6 : 0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {vlanId && (
        <Text
          position={[0, -(size[1] / 2) + 0.02, size[0] / 2 + 0.4]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.25}
          color={vlanColor}
        >
          VLAN {vlanId}
        </Text>
      )}
    </group>
  );
}

function LinkItem({ link, devices, ecmpPaths }) {
  const endpoints = getLinkEndpoints(link, devices);
  const particleRef = useRef(null);
  const isActive = link.status !== 'inactive' && link.status !== 'failed';
  const util = typeof link.utilization === 'number' ? link.utilization : null;
  const isEcmpLink = ecmpPaths.some(path => {
    if (!Array.isArray(path)) return false;
    for (let i = 0; i < path.length - 1; i++) {
      const curr = String(path[i]);
      const next = String(path[i + 1]);
      const linkSrc = String(link.srcDevice);
      const linkDst = String(link.dstDevice);
      if ((linkSrc === curr && linkDst === next) || (linkSrc === next && linkDst === curr)) {
        return true;
      }
    }
    return false;
  });

  const particleGeo = new THREE.BufferGeometry();
  const posArr = new Float32Array(LINK_PARTICLE_COUNT * 3);
  particleGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));

  r3fUseFrame(({ clock }) => {
    if (!isActive || !endpoints || !particleRef.current) return;

    const start = new THREE.Vector3(...endpoints.points[0]);
    const end = new THREE.Vector3(...endpoints.points[1]);
    const posAttr = particleRef.current.geometry.attributes.position;

    for (let i = 0; i < LINK_PARTICLE_COUNT; i++) {
      const t = (clock.getElapsedTime() + i / LINK_PARTICLE_COUNT) % 1;
      const point = new THREE.Vector3().lerpVectors(start, end, t);
      posAttr.setXYZ(i, point.x, point.y, point.z);
    }
    posAttr.needsUpdate = true;
  });

  const lineColor = getLinkColor(isActive, isEcmpLink, util);
  const lineWidth = isEcmpLink ? HIGHLIGHT_LINE_WIDTH : NORMAL_LINE_WIDTH;

  return (
    <group>
      <Line
        points={endpoints?.points || []}
        color={lineColor}
        opacity={DEFAULT_LINE_OPACITY}
        transparent
        lineWidth={lineWidth}
      />

      {isActive && (
        <points ref={particleRef} geometry={particleGeo}>
          <pointsMaterial color={lineColor} size={PARTICLE_SIZE} transparent />
        </points>
      )}
    </group>
  );
}

function TopologyScene({ networkTopology, onDeviceClick }) {
  const { devices = [], links = [], ecmpPaths = [] } = networkTopology || {};

  return (
    <>
      <Grid
        args={[GRID_CONFIG.size, GRID_CONFIG.size]}
        cellSize={GRID_CONFIG.cell}
        cellThickness={0.5}
        sectionSize={GRID_CONFIG.section}
        sectionThickness={1}
        fadeDistance={GRID_CONFIG.fadeDistance}
        cellColor={GRID_CONFIG.cellColor}
        sectionColor={GRID_CONFIG.sectionColor}
      />

      {devices.map(dev => (
        <DeviceItem key={dev.id} device={dev} onClick={onDeviceClick} />
      ))}

      {links.map(link => (
        <LinkItem key={link.id} link={link} devices={devices} ecmpPaths={ecmpPaths} />
      ))}
    </>
  );
}

export default function NetworkTopology3D({ networkTopology, onDeviceClick }) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#111217' }}>
      <Canvas
        shadows
        camera={CAMERA_CONFIG}
        dpr={[1, 2]}
      >
        <ambientLight intensity={1.5} />
        <hemisphereLight intensity={1} groundColor="#1e293b" skyColor="#ffffff" />
        <directionalLight position={[10, 10, 5]} intensity={2.5} castShadow />
        <pointLight position={[-10, 10, -10]} intensity={2} />

        <Suspense fallback={null}>
          <TopologyScene networkTopology={networkTopology} onDeviceClick={onDeviceClick} />
        </Suspense>

        <OrbitControls {...CONTROLS_CONFIG} />
      </Canvas>
    </div>
  );
}