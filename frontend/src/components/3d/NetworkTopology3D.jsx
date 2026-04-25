/**
 * 3D 网络拓扑可视化组件。
 *
 * 基于 React Three Fiber 渲染设备、链路与标签，并提供交互（选择/悬停/轨道控制等）。
 *
 * 作者: Adorrain
 * 创建时间: 2026-01-30
 */

import React, { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Text, RoundedBox, Line, Float } from '@react-three/drei';
import * as THREE from 'three';
import { DEVICE_SIZE_CONFIG, VLAN_PALETTE } from '../../types';
import { getVlans } from '../../utils/utils';

const getDeviceKind = (device) => {
  const text = `${device?.name || ''} ${device?.role || ''} ${device?.deviceType || ''}`.toLowerCase();
  if (text.includes('router')) return 'router';
  if (text.includes('server')) return 'server';
  if (text.includes('pc') || text.includes('terminal') || text.includes('host')) return 'pc';
  if (text.includes('core')) return 'core';
  if (text.includes('agg') || text.includes('aggregation')) return 'aggregation';
  if (text.includes('edge')) return 'edge';
  return 'access';
};

const getDeviceSize = (kind) => DEVICE_SIZE_CONFIG[kind]?.size || DEVICE_SIZE_CONFIG.access.size;

/** 获取设备底部环形指示器颜色。 */
const getRingColor = (device) => {
  const vlanId = getVlans(device)[0];
  return vlanId ? VLAN_PALETTE[parseInt(vlanId, 10) % VLAN_PALETTE.length] : '#334155';
};

const isLinkActiveLoose = (status) => {
  if (status == null || status === '') return true;
  const s = String(status || '').toLowerCase();
  return s === 'up' || s === 'active' || s === 'online';
};

/**
 * ===========================
 * 设备模型组件
 * ===========================
 */
/** 渲染服务器设备模型。 */
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

/** 渲染交换机设备模型 */
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

/** 渲染路由器设备模型。 */
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
/** 渲染终端/PC设备模型（显示器风格）。 */
const TerminalDevice = ({ size }) => {
  return (
    <group scale={[1.35, 1.35, 1.35]}>
      {/* 屏幕 */}
      <RoundedBox args={[size[0], size[1]*0.8, 0.1]} radius={0.05} position={[0, size[1]/2, 0]}>
        <meshPhysicalMaterial color="#475569" roughness={0.3} metalness={0.2} />
      </RoundedBox>
      {/* 屏幕内容 */}
      <mesh position={[0, size[1]/2, 0.06]}>
        <planeGeometry args={[size[0], size[1]*0.8]} />
        <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.05} opacity={0.8} transparent />
      </mesh>

      {/* 支架 */}
      <mesh position={[0, 0, -0.2]}>
        <cylinderGeometry args={[0.05, 0.1, 0.5]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      {/* 底座 */}
      <mesh position={[0, -0.25, -0.2]}>
        <boxGeometry args={[0.4, 0.05, 0.4]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
    </group>
  );
};

function DeviceMesh({ device, onClick }) {
  const { position = { x: 0, y: 0, z: 0 }, name } = device;
  const kind = getDeviceKind(device);
  const
    size = getDeviceSize(kind),
    vlanId = getVlans(device)[0],
    ringColor = getRingColor(device);
  const meshRef = useRef();

  const renderModel = () => {
    switch (kind) {
      case 'core':
      case 'aggregation':
      case 'access':
      case 'edge':
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
      ref={meshRef}
      position={[position.x ?? 0, (position.y ?? 0) + size[1] / 2, position.z ?? 0]} 
      onClick={(e) => { e.stopPropagation(); onClick && onClick(e); }}
    >
      {/* 设备主体（悬浮动画容器） */}
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        {renderModel()}
      </Float>

      {/* 设备名称 (公告牌效果) */}
      <Text
        position={[0, size[1] + 0.5, 0]}
        fontSize={0.4}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {name}
      </Text>

      {/* 底部环形指示器（含 VLAN 颜色语义） */}
      <mesh position={[0, -size[1]/2 + 0.02, 0]} rotation={[-Math.PI/2, 0, 0]}>
        <ringGeometry args={[size[0]/2, size[0]/2 + 0.15, 32]} />
        <meshBasicMaterial 
            color={ringColor} 
            opacity={vlanId ? 0.6 : 0.3}
            transparent 
            side={THREE.DoubleSide} 
            toneMapped={false}
        />
      </mesh>

      {/* 可选：VLAN 文字标签 (仅当有VLAN时显示在脚下) */}
      {vlanId && (
        <Text
          position={[0, -size[1]/2 + 0.02, size[0]/2 + 0.4]}
          rotation={[-Math.PI/2, 0, 0]}
          fontSize={0.25}
          color={ringColor}
          anchorX="center"
          anchorY="middle"
        >
          {`VLAN ${vlanId}`}
        </Text>
      )}
    </group>
  );
}

/**
 * ===========================
 * 链路（光束效果）
 * ===========================
 */
const getLinkEndpoints = (link, devices) => {
  const from = devices.find((d) => String(d.id) === String(link.srcDevice));
  const to = devices.find((d) => String(d.id) === String(link.dstDevice));
  if (!from?.position || !to?.position) return null;
  return {
    from,
    to,
    points: [
      [from.position.x, 0.5, from.position.z],
      [to.position.x, 0.5, to.position.z],
    ],
  };
};

function LinkEffects({ link, devices }) {
  const endpoints = getLinkEndpoints(link, devices);
  const particlesRef = useRef();
  const status = String(link.status || '').toLowerCase();
  const isActive = isLinkActiveLoose(status);
  const isDown = status === 'down';
  const isPeak =
    Boolean(link.is_peak) ||
    Number(link.utilization ?? 0) >= 0.75 ||
    ['high', 'critical'].includes(String(link.peak_level || '').toLowerCase());
  const lineColor = isActive ? '#3b82f6' : '#334155';
  const particleCount = 5;
  const particleColor = '#38bdf8';

  const particlesGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [particleCount]);

  useFrame(({ clock }) => {
    if (!particlesRef.current || !endpoints) return;

    const start = new THREE.Vector3(endpoints.from.position.x, 0.5, endpoints.from.position.z);
    const end = new THREE.Vector3(endpoints.to.position.x, 0.5, endpoints.to.position.z);
    const elapsed = clock.getElapsedTime();
    const positions = particlesRef.current.geometry.attributes.position;

    for (let i = 0; i < particleCount; i++) {
      const t = (elapsed + i / particleCount) % 1;
      const pos = new THREE.Vector3().lerpVectors(start, end, t);
      positions.setXYZ(i, pos.x, pos.y, pos.z);
    }
    positions.needsUpdate = true;
  });

  if (!endpoints) return null;
  return (
    <group>
      <Line points={endpoints.points} color={lineColor} lineWidth={2} opacity={isPeak ? 0.9 : 0.6} transparent />
      {isActive && !isDown && (
        <>
          <Line points={endpoints.points} color={lineColor} lineWidth={5} opacity={isPeak ? 0.18 : 0.1} transparent />
          <points ref={particlesRef}>
            <bufferGeometry attach="geometry" {...particlesGeometry} />
            <pointsMaterial color={particleColor} size={0.15} transparent opacity={1} toneMapped={false} />
          </points>
        </>
      )}
    </group>
  );
}

/** 渲染拓扑场景中的网格、设备、链路与流粒子。 */
function Scene({ topology, onDeviceClick }) {
  const devices = topology?.devices || [];
  const links = topology?.links || [];

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
        <DeviceMesh key={device.id} device={device} onClick={(e) => { e.stopPropagation(); onDeviceClick && onDeviceClick(device); }} />
      ))}
      {links.map((link) => <LinkEffects key={link.id} link={link} devices={devices} />)}
    </>
  );
}

/** 3D拓扑视图主组件，负责构建 Canvas 与相机/光照控制。 */
export default function NetworkTopology3D({ topology, onDeviceClick }) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#0b1220' }}>
        <Canvas
          shadows
          camera={{ position: [15, 12, 15], fov: 45 }}
          dpr={[1, 2]}
        >
          {/* 环境与光照 - 均衡亮度版 */}
          <ambientLight intensity={1.5} />
          <hemisphereLight intensity={1.0} groundColor="#1e293b" skyColor="#ffffff" />
          <directionalLight position={[10, 10, 5]} intensity={2.5} castShadow />
          <pointLight position={[-10, 10, -10]} intensity={2.0} />
          {/* <Environment preset="city" /> */} 

          <Suspense fallback={null}>
            <Scene topology={topology} onDeviceClick={onDeviceClick} />
          </Suspense>

          <OrbitControls 
            minDistance={5} 
            maxDistance={50} 
            maxPolarAngle={Math.PI / 2.1} 
            autoRotate={false}
            autoRotateSpeed={0.5}
          />
        </Canvas>
    </div>
  );
}
