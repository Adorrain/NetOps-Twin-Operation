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
import { BASE_COLOR_BY_TYPE, DEVICE_SIZE_CONFIG, VLAN_PALETTE } from '../../types';
import { getDisplayVlanId } from '../../utils/utils';
import { getDeviceStatusColor } from '../../utils/deviceUtils';

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
/** 判断设备是否处于高负载状态。 */
const isHighLoad = (metrics) => {
  return Boolean(metrics && (metrics.cpuUsage > 90 || metrics.networkIn > 8000));
};

/** 提取并标准化设备类型相关字符串字段。 */
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

/** 计算设备用于渲染分类的基础类型。 */
const getDeviceRenderType = (device) => {
  const { role, deviceType } = getDeviceTypeStrings(device);
  return String(role || deviceType || 'access').toLowerCase();
};

/** 推断设备在配色/尺寸规则中的有效类型。 */
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

/** 解析设备尺寸映射所使用的类型键。 */
const resolveSizeType = (device) => {
  const renderType = getDeviceRenderType(device);
  const effectiveType = inferEffectiveDeviceType(device);

  if (effectiveType !== 'router') return effectiveType;

  if (renderType.includes('core')) return 'core';
  if (renderType.includes('aggregation') || renderType.includes('agg')) return 'aggregation';
  if (renderType.includes('edge')) return 'edge';
  return 'access';
};

/** 获取设备模型尺寸。 */
const getDeviceSize = (device) => {
  const sizeType = resolveSizeType(device);
  return DEVICE_SIZE_CONFIG[sizeType]?.size || DEVICE_SIZE_CONFIG.access.size;
};

/** 获取设备基础颜色。 */
const getDeviceBaseColor = (device) => {
  const effectiveType = inferEffectiveDeviceType(device);
  return BASE_COLOR_BY_TYPE[effectiveType] || BASE_COLOR_BY_TYPE.access;
};

/** 获取设备底部环形指示器颜色。 */
const getRingColor = (device, baseColor) => {
  const vlanId = getDisplayVlanId(device);
  return vlanId ? VLAN_PALETTE[parseInt(vlanId, 10) % VLAN_PALETTE.length] : baseColor;
};

/** 宽松判断链路是否为活跃状态。 */
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

/** 渲染交换机设备模型。 */
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

      <group position={[0, 0.4, size[2] / 2 + 0.03]}>
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

/**
 * ===========================
 * 设备 Mesh（主入口）
 * ===========================
 */
/** 渲染单个设备及其标签、状态光圈和交互效果。 */
function DeviceMesh({ device, onClick }) {
  const { position = { x: 0, y: 0, z: 0 }, name, status, metrics } = device;
  const effectiveType = inferEffectiveDeviceType(device);
  const modelType = String(effectiveType || 'access').toLowerCase();
  const
    size = getDeviceSize(device),
    baseColor = getDeviceBaseColor(device),
    vlanId = getDisplayVlanId(device),
    ringColor = getRingColor(device, baseColor),
    statusColor = getDeviceStatusColor(status),
    highLoad = isHighLoad(metrics);
  const meshRef = useRef();

  /** 按模型类型渲染对应设备外观。 */
  const renderModel = () => {
    switch (modelType) {
      case 'core':
      case 'aggregation':
      case 'access':
      case 'edge':
      case 'switch':
        return <SwitchDevice size={size} color={baseColor} statusColor={statusColor} />;
      case 'server':
        return <ServerDevice size={size} color={baseColor} statusColor={statusColor} />;
      case 'router':
        return <RouterDevice size={size} color={baseColor} statusColor={statusColor} />;
      case 'pc':
        return <TerminalDevice size={size} color={baseColor} statusColor={statusColor} />;
      default:
        return <ServerDevice size={size} color={baseColor} statusColor={statusColor} />;
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
        color={highLoad ? "#ef4444" : "white"}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {name}
        {highLoad && "\n⚠ HIGH LOAD"}
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
/** 渲染设备之间的链路线与辉光层。 */
function LinkLine({ link, devices }) {
  const from = devices.find((d) => String(d.id) === String(link.srcDevice));
  const to = devices.find((d) => String(d.id) === String(link.dstDevice));

  if (!from || !to || !from.position || !to.position) return null;

  const points = [
    [from.position.x, 0.5, from.position.z],
    [to.position.x, 0.5, to.position.z],
  ];

  const status = String(link.status || ''),
    isDown = status.toLowerCase() === 'down',
    isActive = isLinkActiveLoose(status),
    utilization = Number(link.utilization ?? 0);
  const isPeak = Boolean(link.is_peak) || utilization >= 0.75 || String(link.peak_level || '').toLowerCase() === 'high' || String(link.peak_level || '').toLowerCase() === 'critical';
  const color = isActive ? '#3b82f6' : '#334155';

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
/** 渲染链路上的流动粒子脉冲效果。 */
function FlowParticles({ link, devices }) {
  const from = devices.find((d) => String(d.id) === String(link.srcDevice));
  const to = devices.find((d) => String(d.id) === String(link.dstDevice));

  // Hook 调用顺序必须稳定，避免条件调用导致规则破坏。
  const particlesRef = useRef();

  // 粒子参数：统一蓝色脉冲。
  const status = String(link.status || ''),
    isActive = isLinkActiveLoose(status),
    particleCount = 5,
    speed = 1.0,
    color = '#38bdf8';

  const particlesGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [particleCount]);

  useFrame(({ clock }) => {
    // 帧更新：沿链路方向推进粒子位置。
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

  // 在 Hook 调用后再做渲染短路，保证 Hook 规则正确。
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
        toneMapped={false}
      />
    </points>
  );
}

/** 渲染拓扑场景中的网格、设备、链路与流粒子。 */
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
