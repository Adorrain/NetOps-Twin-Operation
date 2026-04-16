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
import { getDisplayVlanId } from '../../utils/utils';

/**
 * ===========================
 * 工具：标准化拓扑数据（防炸核心）
 * ===========================
 */
/**
 * 标准化拓扑数据结构，兼容不同字段命名与缺省情况。
 *
 */
function normalizeTopology(raw) {
  return {
    devices: Array.isArray(raw?.devices) ? raw.devices : [],
    links: Array.isArray(raw?.links) ? raw.links : [],
    flows: Array.isArray(raw?.flows) ? raw.flows : [],
    alerts: Array.isArray(raw?.alerts) ? raw.alerts : [],
  };
}

/**
 * ===========================
 * 标准化：渲染常量与派生函数
 * ===========================
 * 先定义“数据/规则”，组件只负责渲染，避免阅读时在 JSX 前后跳来跳去。
 */
const DEVICE_SIZE_CONFIG = {
  core: { size: [3, 0.8, 2] },
  aggregation: { size: [2.5, 0.6, 1.8] },
  access: { size: [2, 0.5, 1.5] },
  edge: { size: [2.3, 0.7, 1.7] },
  server: { size: [1.2, 2.5, 1.2] },
  router: { size: [2, 0.5, 1.5] },
  pc: { size: [0.8, 0.6, 0.1] },
};

const BASE_COLOR_BY_TYPE = {
  core: '#00ffff',
  aggregation: '#38bdf8',
  access: '#3b82f6',
  edge: '#f97316',
  router: '#4ade80',
  server: '#a855f7',
  pc: '#94a3b8',
  unknown: '#64748b',
};

const VLAN_PALETTE = [
  '#f472b6',
  '#22d3ee',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#60a5fa',
  '#c084fc',
];

const getStatusColor = (status) => {
  let statusColor = '#22c55e';
  const s = String(status || '').toLowerCase();
  if (s === 'offline' || s === 'down') statusColor = '#64748b';
  if (s === 'warning') statusColor = '#eab308';
  if (s === 'error') statusColor = '#ef4444';
  if (s === 'offline' || s === 'down') statusColor = '#64748b';
  return statusColor;
};

const isHighLoad = (metrics) => {
  return Boolean(metrics && (metrics.cpuUsage > 90 || metrics.networkIn > 8000));
};

const getDeviceTypeStrings = (device) => {
  const name = device?.name || '';
  const role = device?.role || '';
  const deviceType = device?.deviceType || '';
  return {
    name: String(name),
    role: String(role),
    deviceType: String(deviceType),
  };
};

const getDeviceRenderType = (device) => {
  const { role, deviceType } = getDeviceTypeStrings(device);
  return String(role || deviceType || 'access').toLowerCase();
};

const inferEffectiveDeviceType = (device) => {
  const { name, deviceType } = getDeviceTypeStrings(device);
  const renderType = getDeviceRenderType(device);

  const lowerName = String(name || '').toLowerCase();
  const lowerDeviceType = String(deviceType || '').toLowerCase();

  if (lowerDeviceType.includes('router') || renderType.includes('router')) return 'router';
  if (lowerName.includes('core')) return 'core';
  if (lowerName.includes('agg')) return 'aggregation';
  if (renderType.includes('edge')) return 'edge';
  if (lowerDeviceType.includes('server') || renderType.includes('server')) return 'server';
  if (renderType.includes('pc') || renderType.includes('terminal')) return 'pc';
  if (renderType.includes('switch')) return 'access';
  return renderType;
};

const resolveSizeType = (device) => {
  const renderType = getDeviceRenderType(device);
  const effectiveType = inferEffectiveDeviceType(device);

  if (effectiveType !== 'router') return effectiveType;

  if (renderType.includes('core')) return 'core';
  if (renderType.includes('aggregation') || renderType.includes('agg')) return 'aggregation';
  if (renderType.includes('edge')) return 'edge';
  return 'access';
};

const getDeviceSize = (device) => {
  const sizeType = resolveSizeType(device);
  return DEVICE_SIZE_CONFIG[sizeType]?.size || DEVICE_SIZE_CONFIG.access.size;
};

const getDeviceBaseColor = (device) => {
  const effectiveType = inferEffectiveDeviceType(device);
  return BASE_COLOR_BY_TYPE[effectiveType] || BASE_COLOR_BY_TYPE.access;
};

const getRingColor = (device, baseColor) => {
  const vlanId = getDisplayVlanId(device);
  return vlanId ? VLAN_PALETTE[parseInt(vlanId, 10) % VLAN_PALETTE.length] : baseColor;
};

const isLinkActiveLoose = (status) => {
  if (status == null || status === '') return true;
  const s = String(status || '').toLowerCase();
  return s === 'up' || s === 'active' || s === 'online';
};

/**
 * ===========================
 * 3D 几何组件库 (更好的模型)
 * ===========================
 */

// 1. 机架式交换机/服务器 (机架式风格)
const RackDevice = ({ size, color, ports = false, isServer = false, statusColor }) => {
  return (
    <group>
      {/* 机箱主体 - 金属质感 (降低金属度以适应本地光照) */}
      <RoundedBox args={size} radius={0.05} smoothness={4}>
        <meshStandardMaterial 
          color="#475569" // 提亮颜色 (Slate-600)
          roughness={0.4}
          metalness={0.3} // 降低金属度，避免在无 HDR 环境下变黑
        />
      </RoundedBox>
      
      {/* 前面板状态条 */}
      <mesh position={[0, size[1]/2 - 0.05, size[2]/2 + 0.01]}>
        <boxGeometry args={[size[0] * 0.9, 0.05, 0.02]} />
        <meshStandardMaterial color={statusColor} roughness={0.6} metalness={0.1} />
      </mesh>

      {/* 端口面板 */}
      {ports && (
        <group position={[0, 0, size[2]/2 + 0.01]}>
          {Array.from({ length: 8 }).map((_, i) => (
             <mesh key={i} position={[(i - 3.5) * (size[0]/10), 0, 0]}>
               <boxGeometry args={[size[0]/14, size[1]/3, 0.02]} />
               <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.05} />
             </mesh>
          ))}
        </group>
      )}

      {/* 服务器特有的闪烁灯 */}
      {isServer && (
        <group position={[size[0]/3, size[1]/4, size[2]/2 + 0.01]}>
           {[0, 1, 2].map(i => (
             <mesh key={i} position={[0, -i * 0.15, 0]}>
               <circleGeometry args={[0.04, 16]} />
               <meshStandardMaterial color={color} roughness={0.4} metalness={0.2} />
             </mesh>
           ))}
        </group>
      )}
    </group>
  );
};

const RouterDevice = ({ size, color = "#38bdf8", statusColor = "#22c55e" }) => {
  const radius = Math.max(size[0], size[2]) * 0.4;
  // 让路由器在视觉上更接近机架交换机高度比例
  const thickness = size[1] * 0.5;

  return (
    <group>
      {/* 主体（圆盘） */}
      <mesh>
        <cylinderGeometry args={[radius, radius, thickness, 48]} />
        <meshStandardMaterial
          color="#475569"
          roughness={0.45}
          metalness={0.25}
        />
      </mesh>

      {/* 顶部图标（经典路由器“交叉箭头”） */}
      <group position={[0, thickness / 2 + 0.02, 0]}>
        {/* 横线 */}
        <mesh>
          <boxGeometry args={[radius * 1.2, 0.03, 0.06]} />
          <meshBasicMaterial color="#e2e8f0" toneMapped={false} />
        </mesh>

        {/* 竖线 */}
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[radius * 1.2, 0.03, 0.06]} />
          <meshBasicMaterial color="#e2e8f0" toneMapped={false} />
        </mesh>

        {/* 四个方向箭头 */}
        {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle, i) => (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * radius * 0.65,
              0,
              Math.sin(angle) * radius * 0.65
            ]}
            rotation={[Math.PI / 2, 0, -angle]}
          >
            <coneGeometry args={[0.05, 0.12, 3]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        ))}
      </group>

      {/* 状态环（简化但保留高级感） */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.95, radius * 1.05, 48]} />
        <meshBasicMaterial
          color={statusColor}
          transparent
          opacity={0.6}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};


// 4. 终端/PC (显示器风格)
const TerminalDevice = ({ size, color, statusColor }) => {
  return (
    <group>
      {/* 屏幕 */}
      <RoundedBox args={[size[0], size[1]*0.8, 0.1]} radius={0.05} position={[0, size[1]/2, 0]}>
        <meshPhysicalMaterial color="#0f172a" roughness={0.2} metalness={0.8} />
      </RoundedBox>
      {/* 屏幕内容 */}
      <mesh position={[0, size[1]/2, 0.06]}>
        <planeGeometry args={[size[0] - 0.1, size[1]*0.8 - 0.1]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} opacity={0.8} transparent />
      </mesh>
      
      {/* 状态灯 (状态指示器) */}
      <mesh position={[size[0]/2 - 0.05, size[1]/2 - 0.25, 0.06]}>
        <circleGeometry args={[0.02, 16]} />
        <meshStandardMaterial color={statusColor} roughness={0.4} metalness={0.05} />
      </mesh>

      {/* 支架 */}
      <mesh position={[0, 0, -0.2]}>
        <cylinderGeometry args={[0.05, 0.1, 0.5]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {/* 底座 */}
      <mesh position={[0, -0.25, -0.2]}>
        <boxGeometry args={[0.4, 0.05, 0.4]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
    </group>
  );
};

/**
 * ===========================
 * 设备 Mesh（主入口）
 * ===========================
 */
function DeviceMesh({ device, onClick }) {
  const { position = { x: 0, y: 0, z: 0 }, name, status, metrics } = device;
  const effectiveType = inferEffectiveDeviceType(device);
  const size = getDeviceSize(device);
  const baseColor = getDeviceBaseColor(device);
  const vlanId = getDisplayVlanId(device);
  const ringColor = getRingColor(device, baseColor);
  const statusColor = getStatusColor(status);
  const highLoad = isHighLoad(metrics);
  const meshRef = useRef();

  useFrame(({ clock }) => {
     if (highLoad && meshRef.current) {
        const t = (Math.sin(clock.getElapsedTime() * 10) + 1) / 2;
        meshRef.current.position.y = (size[1]/2) + (t * 0.1); // 紧张的抖动
     }
  });

  // 渲染不同模型
  const renderModel = () => {
    switch (effectiveType) {
      case 'core':
      case 'aggregation':
      case 'access':
      case 'edge':
        return <RackDevice size={size} color={baseColor} ports={true} statusColor={statusColor} />;
      case 'server':
        return <RackDevice size={size} color={baseColor} isServer={true} statusColor={statusColor} />;
      case 'router':
        return <RouterDevice size={size} color={baseColor} statusColor={statusColor} />;
      case 'pc':
        return <TerminalDevice size={size} color={baseColor} statusColor={statusColor} />;
      default:
        return <RackDevice size={size} color={baseColor} statusColor={statusColor} />;
    }
  };

  return (
    <group 
      ref={meshRef}
      position={[position.x, size[1] / 2, position.z]} 
      onClick={(e) => { e.stopPropagation(); onClick && onClick(e); }}
    >
      {/* 悬浮动画容器 */}
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        {renderModel()}
      </Float>

      {/* 设备名称 (公告牌效果) */}
      <Text
        position={[0, size[1] + 0.5, 0]}
        fontSize={0.4}
        color={highLoad ? "#ef4444" : "white"}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {name}
        {highLoad && "\n⚠ HIGH LOAD"}
      </Text>

      {/* 选中/交互光圈 (VLAN 指示器) */}
      <mesh position={[0, -size[1]/2 + 0.02, 0]} rotation={[-Math.PI/2, 0, 0]}>
        <ringGeometry args={[size[0]/2, size[0]/2 + 0.15, 32]} />
        <meshBasicMaterial 
            color={ringColor} 
            opacity={vlanId ? 0.6 : 0.3} // 有VLAN时更亮
            transparent 
            side={THREE.DoubleSide} 
            toneMapped={false} // 配合Bloom发光
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
function LinkLine({ link, devices }) {
  const srcId = link.srcDevice;
  const dstId = link.dstDevice;

  const from = devices.find((d) => String(d.id) === String(srcId));
  const to = devices.find((d) => String(d.id) === String(dstId));

  if (!from || !to || !from.position || !to.position) return null;

  const points = [
    [from.position.x, 0.5, from.position.z],
    [to.position.x, 0.5, to.position.z],
  ];

  const status = String(link.status || '');
  const isDown = status.toLowerCase() === 'down';
  const isActive = isLinkActiveLoose(status);
  const utilization = Number(link.utilization ?? 0);
  const isPeak = Boolean(link.is_peak) || utilization >= 0.75 || String(link.peak_level || '').toLowerCase() === 'high' || String(link.peak_level || '').toLowerCase() === 'critical';
  const color = isActive ? '#3b82f6' : '#334155'; // 非 active 链路统一灰色

  return (
    <group>
      {/* 核心光束 */}
      <Line
        points={points}
        color={color}
        lineWidth={2}
        opacity={isPeak ? 0.9 : 0.6}
        transparent
      />
      {/* 辉光层 (只在连接时显示) */}
      {isActive && !isDown && (
         <Line
           points={points}
           color={color}
           lineWidth={5}
           opacity={isPeak ? 0.18 : 0.1}
           transparent
         />
      )}

    </group>
  );
}

/**
 * ===========================
 * 数据流粒子（脉冲）
 * ===========================
 */
function FlowParticles({ link, devices }) {
  const srcId = link.srcDevice;
  const dstId = link.dstDevice;

  const from = devices.find((d) => String(d.id) === String(srcId));
  const to = devices.find((d) => String(d.id) === String(dstId));

  // Hooks 必须无条件调用
  const particlesRef = useRef();

  // 粒子流：统一蓝色（移除 DDoS 特殊效果）
  const status = String(link.status || '');
  const isActive = isLinkActiveLoose(status);
  const particleCount = 5;
  const speed = 1.0;
  const color = '#38bdf8';

  const particlesGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [particleCount]);

  useFrame(({ clock }) => {
    // 在帧循环内检查是否存在
    if (!particlesRef.current || !from || !to) return;
    
    const start = new THREE.Vector3(from.position.x, 0.5, from.position.z);
    const end = new THREE.Vector3(to.position.x, 0.5, to.position.z);
    const elapsed = clock.getElapsedTime() * speed;
    
    const positions = particlesRef.current.geometry.attributes.position;
    
    for (let i = 0; i < particleCount; i++) {
      const t = (elapsed + i / particleCount) % 1;
      const pos = new THREE.Vector3().lerpVectors(start, end, t);
      positions.setXYZ(i, pos.x, pos.y, pos.z);
    }
    positions.needsUpdate = true;
  });

  // 仅在 hooks 之后提前返回以进行渲染
  if (!from || !to) return null;
  if (!isActive) return null;

  return (
    <points ref={particlesRef}>
      <bufferGeometry attach="geometry" {...particlesGeometry} />
      <pointsMaterial
        color={color}
        size={0.15}
        transparent
        opacity={1}
        toneMapped={false} // 对 Bloom 效果至关重要
      />
    </points>
  );
}

function Scene({ topology, onDeviceClick }) {
  const safe = normalizeTopology(topology);

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

      {safe.devices.map((device) => (
        <DeviceMesh key={device.id} device={device} onClick={(e) => { e.stopPropagation(); onDeviceClick && onDeviceClick(device); }} />
      ))}
      {safe.links.map((link) => (
        <React.Fragment key={link.id}>
            <LinkLine link={link} devices={safe.devices} />
            <FlowParticles link={link} devices={safe.devices} />
        </React.Fragment>
      ))}
    </>
  );
}

export default function NetworkTopology3D({ topology, onDeviceClick }) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#0b1220' }}>
        <Canvas
          shadows
          camera={{ position: [15, 12, 15], fov: 45 }}
          dpr={[1, 2]} // 优化高分屏
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
