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
import { OrbitControls, Grid, Text, Cone, RoundedBox, Line, Html, Environment, Float } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Spin } from 'antd';
import * as THREE from 'three';
import { getDisplayVlanId } from '../../utils/net';

/**
 * ===========================
 * 工具：标准化拓扑数据（防炸核心）
 * ===========================
 */
/**
 * 标准化拓扑数据结构，兼容不同字段命名与缺省情况
 */
function normalizeTopology(raw) {
  return {
    devices: Array.isArray(raw?.devices) ? raw.devices : [],
    links: Array.isArray(raw?.links) ? raw.links : (Array.isArray(raw?.connections) ? raw.connections : []),
    flows: Array.isArray(raw?.flows) ? raw.flows : [],
    alerts: Array.isArray(raw?.alerts) ? raw.alerts : [],
  };
}

/**
 * ===========================
 * 3D 几何组件库 (更好的模型)
 * ===========================
 */

// 1. 机架式交换机/服务器 (机架式风格)
const RackDevice = ({ size, color, ports = false, isServer = false, statusColor }) => {
  return (
    <group>
      <RoundedBox args={size} radius={0.05} smoothness={4}>
        <meshStandardMaterial 
          color="#475569" 
          roughness={0.4}
          metalness={0.3} 
        />
      </RoundedBox>
      
      <mesh position={[0, size[1]/2 - 0.05, size[2]/2 + 0.01]}>
        <boxGeometry args={[size[0] * 0.9, 0.05, 0.02]} />
        <meshBasicMaterial color={statusColor} toneMapped={false} />
      </mesh>
      {ports && (
        <group position={[0, 0, size[2]/2 + 0.01]}>
          {Array.from({ length: 8 }).map((_, i) => (
             <mesh key={i} position={[(i - 3.5) * (size[0]/10), 0, 0]}>
               <boxGeometry args={[size[0]/14, size[1]/3, 0.02]} />
               <meshStandardMaterial color="#0f172a" emissive="#38bdf8" emissiveIntensity={0.5} />
             </mesh>
          ))}
        </group>
      )}
      {isServer && (
        <group position={[size[0]/3, size[1]/4, size[2]/2 + 0.01]}>
           {[0, 1, 2].map(i => (
             <mesh key={i} position={[0, -i * 0.15, 0]}>
               <circleGeometry args={[0.04, 16]} />
               <meshBasicMaterial color={color} toneMapped={false} />
             </mesh>
           ))}
        </group>
      )}
    </group>
  );
};

const RouterDevice = ({ size, color = "#38bdf8", statusColor = "#22c55e" }) => {
  const radius = Math.max(size[0], size[2]) * 0.4;
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

      <group position={[0, thickness / 2 + 0.02, 0]}>
        <mesh>
          <boxGeometry args={[radius * 1.2, 0.03, 0.06]} />
          <meshBasicMaterial color="#e2e8f0" toneMapped={false} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[radius * 1.2, 0.03, 0.06]} />
          <meshBasicMaterial color="#e2e8f0" toneMapped={false} />
        </mesh>
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
      <RoundedBox args={[size[0], size[1]*0.8, 0.1]} radius={0.05} position={[0, size[1]/2, 0]}>
        <meshPhysicalMaterial color="#0f172a" roughness={0.2} metalness={0.8} />
      </RoundedBox>
      <mesh position={[0, size[1]/2, 0.06]}>
        <planeGeometry args={[size[0] - 0.1, size[1]*0.8 - 0.1]} />
        <meshBasicMaterial color={color} toneMapped={false} opacity={0.8} transparent />
      </mesh>
      <mesh position={[size[0]/2 - 0.05, size[1]/2 - 0.25, 0.06]}>
        <circleGeometry args={[0.02, 16]} />
        <meshBasicMaterial color={statusColor} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.2]}>
        <cylinderGeometry args={[0.05, 0.1, 0.5]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
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
  const { position = { x: 0, y: 0, z: 0 }, role, name, status, metrics } = device;
  const device_type = device.device_type || device.deviceType || device.type;
  const config = {
    core: { size: [3, 0.8, 2] },
    aggregation: { size: [2.5, 0.6, 1.8] },
    access: { size: [2, 0.5, 1.5] },
    edge: { size: [2.3, 0.7, 1.7] },
    server: { size: [1.2, 2.5, 1.2] },
    router: { size: [2, 0.5, 1.5] },
    pc: { size: [0.8, 0.6, 0.1] },
  };

  const renderType = (role || device_type || 'access').toLowerCase();
  let effectiveType = renderType;
  const lowerName = (name || '').toLowerCase();
  const lowerDeviceType = String(device_type || '').toLowerCase();
  if (lowerDeviceType.includes('router') || renderType.includes('router')) effectiveType = 'router';
  else if (lowerName.includes('core')) effectiveType = 'core';
  else if (lowerName.includes('agg')) effectiveType = 'aggregation';
  else if (renderType.includes('edge') || renderType.includes('firewall') || lowerName.includes('fw')) effectiveType = 'edge';
  else if (lowerDeviceType.includes('server') || renderType.includes('server')) effectiveType = 'server';
  else if (renderType.includes('pc') || renderType.includes('terminal')) effectiveType = 'pc';
  else if (renderType.includes('switch')) effectiveType = 'access';

  const sizeType =
    effectiveType === 'router'
      ? (renderType.includes('core')
          ? 'core'
          : (renderType.includes('aggregation') || renderType.includes('agg'))
            ? 'aggregation'
            : (renderType.includes('edge') || renderType.includes('firewall') || lowerName.includes('fw'))
              ? 'edge'
            : 'access')
      : effectiveType;

  const { size } = config[sizeType] || config.access;

  // 霓虹配色方案
  const neonColors = {
    core: '#00ffff',       // 青色
    aggregation: '#38bdf8', // 天蓝色
    access: '#3b82f6',     // 蓝色
    edge: '#f97316',       // 橙色
    router: '#4ade80',     // 霓虹绿
    server: '#a855f7',     // 紫色
    pc: '#94a3b8',         // 板岩色
    unknown: '#64748b'
  };

  const baseColor = neonColors[effectiveType] || neonColors.access;

  const vlanId = getDisplayVlanId(device);
  const vlanPalette = [
    '#f472b6', // 粉色 (VLAN N)
    '#22d3ee', // 青色
    '#a78bfa', // 紫色
    '#34d399', // 绿色
    '#fbbf24', // 琥珀色
    '#f87171', // 红色
    '#60a5fa', // 蓝色
    '#c084fc', // 紫罗兰色
  ];

  const ringColor = vlanId 
    ? vlanPalette[parseInt(vlanId) % vlanPalette.length] 
    : baseColor;

  let statusColor = '#22c55e'; // 绿色 (正常)
  if (status === 'offline' || status === 'down') statusColor = '#64748b';
  if (status === 'warning') statusColor = '#eab308';
  if (status === 'error') statusColor = '#ef4444';

  const isHighLoad = metrics && (metrics.cpuUsage > 90 || metrics.networkIn > 8000);
  const meshRef = useRef();

  useFrame(({ clock }) => {
     if (isHighLoad && meshRef.current) {
        const t = (Math.sin(clock.getElapsedTime() * 10) + 1) / 2;
        meshRef.current.position.y = (size[1]/2) + (t * 0.1);
     }
  });

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
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        {renderModel()}
      </Float>

      <Text
        position={[0, size[1] + 0.5, 0]}
        fontSize={0.4}
        color={isHighLoad ? "#ef4444" : "white"}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {name}
        {isHighLoad && "\n⚠ HIGH LOAD"}
      </Text>

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
  const srcId = link.src_device || link.source || link.sourceDeviceId || link.from;
  const dstId = link.dst_device || link.target || link.targetDeviceId || link.to;

  const from = devices.find((d) => String(d.id) === String(srcId));
  const to = devices.find((d) => String(d.id) === String(dstId));

  if (!from || !to || !from.position || !to.position) return null;

  const getDeviceRenderSize = (device) => {
    const device_type = device?.device_type || device?.deviceType || device?.type;
    const role = device?.role;
    const name = device?.name;

    const renderType = (role || device_type || 'access').toLowerCase();
    let effectiveType = renderType;
    const lowerName = String(name || '').toLowerCase();
    const lowerDeviceType = String(device_type || '').toLowerCase();

    if (lowerDeviceType.includes('router') || renderType.includes('router')) effectiveType = 'router';
    else if (lowerName.includes('core')) effectiveType = 'core';
    else if (lowerName.includes('agg')) effectiveType = 'aggregation';
    else if (renderType.includes('edge') || renderType.includes('firewall') || lowerName.includes('fw')) effectiveType = 'edge';
    else if (lowerDeviceType.includes('server') || renderType.includes('server')) effectiveType = 'server';
    else if (renderType.includes('pc') || renderType.includes('terminal')) effectiveType = 'pc';
    else if (renderType.includes('switch')) effectiveType = 'access';

    const sizeType =
      effectiveType === 'router'
        ? (renderType.includes('core')
            ? 'core'
            : ((renderType.includes('aggregation') || renderType.includes('agg'))
                ? 'aggregation'
                : ((renderType.includes('edge') || renderType.includes('firewall') || lowerName.includes('fw'))
                    ? 'edge'
                    : 'access')))
        : effectiveType;

    const config = {
      core: { size: [3, 0.8, 2] },
      aggregation: { size: [2.5, 0.6, 1.8] },
      access: { size: [2, 0.5, 1.5] },
      edge: { size: [2.3, 0.7, 1.7] },
      server: { size: [1.2, 2.5, 1.2] },
      pc: { size: [0.8, 0.6, 0.1] },
    };

    return config[sizeType]?.size || config.access.size;
  };

  const points = [
    [from.position.x, 0.5, from.position.z],
    [to.position.x, 0.5, to.position.z],
  ];
  
  const isDown = link.status === 'down';
  const utilization = Number(link.utilization ?? 0);
  const isPeak = Boolean(link.is_peak) || utilization >= 0.75 || String(link.peak_level || '').toLowerCase() === 'high' || String(link.peak_level || '').toLowerCase() === 'critical';
  const isOptimized = String(link.optimization_state || '').toLowerCase() === 'optimized';
  const color = isDown ? '#334155' : (isOptimized ? '#22c55e' : (isPeak ? '#ef4444' : '#38bdf8'));

  const formatBandwidth = (value) => {
    if (value == null || value === '') return 'bw';
    const raw = String(value).trim();
    const low = raw.toLowerCase();
    if (low.endsWith('g') || low.endsWith('m') || low.endsWith('k')) return raw.toUpperCase();
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    if (n >= 1000) {
      const g = n / 1000;
      return `${Number.isInteger(g) ? g : g.toFixed(2).replace(/\.?0+$/, '')}G`;
    }
    if (n >= 1) {
      return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, '')}M`;
    }
    const k = n * 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1).replace(/\.?0+$/, '')}K`;
  };

  const formatUtilization = (u) => {
    if (!Number.isFinite(u)) return '-';
    const pct = Math.max(0, Math.min(100, u * 100));
    return `${pct.toFixed(1).replace(/\.0$/, '')}%`;
  };

  const bandwidthRaw = link.bandwidth;
  const utilText = formatUtilization(utilization);
  const bwText = formatBandwidth(bandwidthRaw);

  const shouldRenderSideLabels = bandwidthRaw != null || link.utilization != null;

  const fromSize = getDeviceRenderSize(from);
  const toSize = getDeviceRenderSize(to);
  const fromTopY = fromSize[1] + 0.22;
  const toTopY = toSize[1] + 0.22;
  const labelY = (fromTopY + toTopY) / 2;

  const lx = to.position.x - from.position.x;
  const lz = to.position.z - from.position.z;
  const lLen = Math.max(0.0001, Math.hypot(lx, lz));
  const nx = -lz / lLen;
  const nz = lx / lLen;
  const midX = (from.position.x + to.position.x) / 2;
  const midZ = (from.position.z + to.position.z) / 2;
  const sideOffset = 0.45;

  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={2}
        opacity={isDown ? 0.2 : (isPeak ? 0.9 : 0.6)}
        transparent
      />
      {!isDown && (
         <Line
           points={points}
           color={color}
           lineWidth={5}
           opacity={isPeak ? 0.18 : 0.1}
           transparent
         />
      )}

      {shouldRenderSideLabels && (
        <>
          <Text
            position={[midX + nx * sideOffset, labelY, midZ + nz * sideOffset]}
            fontSize={0.22}
            color={color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.01}
            outlineColor="#000000"
            toneMapped={false}
          >
            {utilText}
          </Text>
          <Text
            position={[midX - nx * sideOffset, labelY, midZ - nz * sideOffset]}
            fontSize={0.22}
            color={color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.01}
            outlineColor="#000000"
            toneMapped={false}
          >
            {bwText}
          </Text>
        </>
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
  const srcId = link.src_device || link.source || link.sourceDeviceId || link.from;
  const dstId = link.dst_device || link.target || link.targetDeviceId || link.to;

  const from = devices.find((d) => String(d.id) === String(srcId));
  const to = devices.find((d) => String(d.id) === String(dstId));
  
  const isDDoS = to?.metrics && to.metrics.cpuUsage > 90;
  
  const particlesRef = useRef();
  
  const particleCount = isDDoS ? 20 : 5;
  const speed = isDDoS ? 3.0 : 1.0;
  const color = isDDoS ? '#ff0000' : '#00ffff'; // 青色或红色

  const particlesGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [particleCount]);

  useFrame(({ clock }) => {
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

  if (!from || !to) return null;

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

function Scene({ topology, onDeviceClick }) {
  const safe = normalizeTopology(topology);
  const isLinkActive = (status) => {
    if (status == null || status === '') return true;
    const s = String(status || '').toLowerCase();
    return s === 'up' || s === 'active' || s === 'online';
  };

  const DashedEllipseArc = ({ p0, p1, color }) => {
    const geometry = useMemo(() => {
      if (!p0 || !p1) return null;

      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const dist = Math.max(0.0001, Math.hypot(dx, dz));

      const rx = dist / 2;
      const rz = Math.max(1.6, rx * 0.55);

      const cx = (p0.x + p1.x) / 2;
      const cz = (p0.z + p1.z) / 2;

      const angle = Math.atan2(dz, dx);

      const N = 220;
      const dashSteps = 10;
      const gapSteps = 8;
      const cycle = dashSteps + gapSteps;

      const positions = [];
      const y = 0.03;

      let prev = null;
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * Math.PI * 2;
        const localX = rx * Math.cos(t);
        const localZ = rz * Math.sin(t);

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const x = cx + localX * cosA - localZ * sinA;
        const z = cz + localX * sinA + localZ * cosA;

        const cur = { x, z };

        if (prev) {
          const shouldDraw = (i - 1) % cycle < dashSteps;
          if (shouldDraw) {
            positions.push(prev.x, y, prev.z, cur.x, y, cur.z);
          }
        }

        prev = cur;
      }

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      return g;
    }, [p0, p1, color]);

    if (!geometry) return null;
    return (
      <lineSegments geometry={geometry}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={0.55}
          toneMapped={false}
        />
      </lineSegments>
    );
  };

  const areaRings = useMemo(() => {
    const palette = ['#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#22d3ee', '#fbbf24', '#60a5fa'];

    const devById = new Map(
      safe.devices.map(d => [String(d.id), d])
    );

    const getAreaOfDevice = (dev) => {
      const raw = dev?.ospf?.area ?? dev?.ospf_area ?? dev?.configuration?.ospf?.area;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    const arcsByArea = new Map();
    const midSumByArea = new Map();

    const addArc = (areaX, p0, p1) => {
      if (!arcsByArea.has(areaX)) arcsByArea.set(areaX, []);
      arcsByArea.get(areaX).push({ p0, p1 });
    };

    safe.links
      .filter(l => isLinkActive(l.status))
      .forEach((link) => {
        const srcId = link.src_device || link.source || link.sourceDeviceId || link.from;
        const dstId = link.dst_device || link.target || link.targetDeviceId || link.to;
        if (srcId == null || dstId == null) return;

        const sDev = devById.get(String(srcId));
        const dDev = devById.get(String(dstId));
        if (!sDev || !dDev || !sDev.position || !dDev.position) return;

        const sArea = getAreaOfDevice(sDev);
        const dArea = getAreaOfDevice(dDev);
        if (sArea == null || dArea == null) return;

        if (sArea === dArea) return;

        if (sArea === 0 && dArea !== 0) {
          const areaX = dArea;
          addArc(areaX, { x: sDev.position.x, z: sDev.position.z }, { x: dDev.position.x, z: dDev.position.z });
        } else if (dArea === 0 && sArea !== 0) {
          const areaX = sArea;
          addArc(areaX, { x: dDev.position.x, z: dDev.position.z }, { x: sDev.position.x, z: sDev.position.z });
        }
      });

    return Array.from(arcsByArea.entries())
      .filter(([areaId]) => Number(areaId) !== 0)
      .map(([areaId, arcs]) => {
      const color = palette[Number(areaId) % palette.length];
      const mid = {
        x: arcs.reduce((s, a) => s + (a.p0.x + a.p1.x) / 2, 0) / arcs.length,
        z: arcs.reduce((s, a) => s + (a.p0.z + a.p1.z) / 2, 0) / arcs.length,
      };
      return { areaId, arcs, mid, color };
    });
  }, [safe.devices]);

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

      {areaRings.map((r) => (
        <group key={`area-${r.areaId}`}>
          {r.arcs.map((a, idx) => (
            <DashedEllipseArc key={`${r.areaId}-arc-${idx}`} p0={a.p0} p1={a.p1} color={r.color} />
          ))}
          <Text
            position={[r.mid.x, 0.1, r.mid.z]}
            fontSize={0.3}
            color={r.color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.01}
            outlineColor="#000000"
            toneMapped={false}
          >
            {`Area ${r.areaId}`}
          </Text>
        </group>
      ))}

      {safe.devices.map((device) => (
        <DeviceMesh key={device.id} device={device} onClick={(e) => { e.stopPropagation(); onDeviceClick && onDeviceClick(device); }} />
      ))}
      {safe.links.filter(l => isLinkActive(l.status)).map((link) => (
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
    <div style={{ width: '100%', height: '100%', background: '#020617' }}>
        <Canvas
          shadows
          camera={{ position: [15, 12, 15], fov: 45 }}
          dpr={[1, 2]}
        >
          <ambientLight intensity={1.5} />
          <hemisphereLight intensity={1.0} groundColor="#1e293b" skyColor="#ffffff" />
          <directionalLight position={[10, 10, 5]} intensity={2.5} castShadow />
          <pointLight position={[-10, 10, -10]} intensity={2.0} />

          <Suspense fallback={
            <Html center>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <Spin size="large" />
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, letterSpacing: 0.4 }}>正在加载 3D 场景…</div>
              </div>
            </Html>
          }>
            <Scene topology={topology} onDeviceClick={onDeviceClick} />
          </Suspense>
          <EffectComposer disableNormalPass>
            <Bloom 
                luminanceThreshold={1.2} 
                mipmapBlur 
                intensity={1.0} 
                radius={0.6}
            />
            <Vignette eskil={false} offset={0.1} darkness={0.6} />
          </EffectComposer>

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
