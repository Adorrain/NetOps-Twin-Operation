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
      {/* 机箱主体 - 金属质感 (降低金属度以适应本地光照) */}
      <RoundedBox args={size} radius={0.05} smoothness={4}>
        <meshStandardMaterial 
          color="#475569" // 提亮颜色 (Slate-600)
          roughness={0.4}
          metalness={0.3} // 降低金属度，避免在无 HDR 环境下变黑
        />
      </RoundedBox>
      
      {/* 前面板发光条 (状态指示) */}
      <mesh position={[0, size[1]/2 - 0.05, size[2]/2 + 0.01]}>
        <boxGeometry args={[size[0] * 0.9, 0.05, 0.02]} />
        <meshBasicMaterial color={statusColor} toneMapped={false} />
      </mesh>

      {/* 端口面板 */}
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

      {/* 服务器特有的闪烁灯 */}
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
      {/* 屏幕内容 (发光) */}
      <mesh position={[0, size[1]/2, 0.06]}>
        <planeGeometry args={[size[0] - 0.1, size[1]*0.8 - 0.1]} />
        <meshBasicMaterial color={color} toneMapped={false} opacity={0.8} transparent />
      </mesh>
      
      {/* 状态灯 (状态指示器) */}
      <mesh position={[size[0]/2 - 0.05, size[1]/2 - 0.25, 0.06]}>
        <circleGeometry args={[0.02, 16]} />
        <meshBasicMaterial color={statusColor} toneMapped={false} />
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
  const { position = { x: 0, y: 0, z: 0 }, role, name, status, metrics } = device;
  const device_type = device.device_type || device.deviceType || device.type;
  
  // 尺寸配置
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
  
  // 智能推断类型
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

  // 路由器也要“同层级尺寸”，避免路由器永远小一号
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

  // ---------------------------
  // VLAN 颜色逻辑 (新特性)
  // ---------------------------
  const vlanId = getDisplayVlanId(device);
  
  // 预定义一组高辨识度的 VLAN 霓虹色
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

  // 如果有 VLAN ID，则计算颜色；否则回退到 baseColor
  const ringColor = vlanId 
    ? vlanPalette[parseInt(vlanId) % vlanPalette.length] 
    : baseColor;

  // 状态颜色
  let statusColor = '#22c55e'; // 绿色 (正常)
  if (status === 'offline' || status === 'down') statusColor = '#64748b';
  if (status === 'warning') statusColor = '#eab308';
  if (status === 'error') statusColor = '#ef4444';

  // DDoS 效果
  const isHighLoad = metrics && (metrics.cpuUsage > 90 || metrics.networkIn > 8000);
  const meshRef = useRef();

  useFrame(({ clock }) => {
     if (isHighLoad && meshRef.current) {
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
        color={isHighLoad ? "#ef4444" : "white"}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {name}
        {isHighLoad && "\n⚠ HIGH LOAD"}
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

    // 路由器的“尺寸类型”与 DeviceMesh 保持一致
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

  const bandwidthRaw = link.bandwidth;
  const bandwidth = bandwidthRaw != null && bandwidthRaw !== '' ? String(bandwidthRaw) : '';
  const utilText = `${Math.round(utilization * 100)}%`;
  const bwText = bandwidth || 'bw';

  const shouldRenderSideLabels = bandwidthRaw != null || link.utilization != null;

  const fromSize = getDeviceRenderSize(from);
  const toSize = getDeviceRenderSize(to);
  // DeviceMesh 世界坐标：group 位置 y = size[1]/2，因此设备顶部 y = size[1]；这里在顶部再抬一点点
  const fromTopY = fromSize[1] + 0.22;
  const toTopY = toSize[1] + 0.22;
  const labelY = (fromTopY + toTopY) / 2;

  // 根据链路方向，在 XZ 平面取法向量，将文本放在“链路两侧”
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
      {/* 核心光束 */}
      <Line
        points={points}
        color={color}
        lineWidth={2}
        opacity={isDown ? 0.2 : (isPeak ? 0.9 : 0.6)}
        transparent
      />
      {/* 辉光层 (只在连接时显示) */}
      {!isDown && (
         <Line
           points={points}
           color={color}
           lineWidth={5}
           opacity={isPeak ? 0.18 : 0.1}
           transparent
         />
      )}

      {/* 链路两侧标签：利用率 + 带宽 */}
      {shouldRenderSideLabels && (
        <>
          <Text
            // 利用率：一侧
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
            // 带宽：另一侧
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
  
  // 先计算派生状态 (即使 from/to 未定义也是安全的)
  const isDDoS = to?.metrics && to.metrics.cpuUsage > 90;
  
  // Hooks 必须无条件调用
  const particlesRef = useRef();
  
  // 减少粒子数量但增加亮度
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
  const isLinkActive = (status) => {
    if (status == null || status === '') return true;
    const s = String(status || '').toLowerCase();
    return s === 'up' || s === 'active' || s === 'online';
  };

  // area 椭圆虚线：在“两个同区设备”之间画椭圆弧线
  const DashedEllipseArc = ({ p0, p1, color }) => {
    const geometry = useMemo(() => {
      if (!p0 || !p1) return null;

      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const dist = Math.max(0.0001, Math.hypot(dx, dz));

      // 让椭圆的主轴长度严格穿过两个端点：rx=dist/2
      const rx = dist / 2;
      // 次轴控制“椭圆弧度”大小；太小看不见
      const rz = Math.max(1.6, rx * 0.55);

      const cx = (p0.x + p1.x) / 2;
      const cz = (p0.z + p1.z) / 2;

      const angle = Math.atan2(dz, dx); // 主轴方向在 x-z 平面夹角

      // 画完整椭圆：对称再来一个，形成椭圆边界
      const N = 220; // 采样点
      const dashSteps = 10; // 实段步数
      const gapSteps = 8; // 间隔步数
      const cycle = dashSteps + gapSteps;

      const positions = [];
      const y = 0.03;

      // t 从 0 -> 2pi
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * Math.PI * 2;
        const localX = rx * Math.cos(t);
        const localZ = rz * Math.sin(t);

        // rotate local->world
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // 按你的描述：把椭圆画在“area0 与 areaX 的设备接口之间”
    // 实现方式：遍历 topology.links，找到 area 不同的链路；若一端为 area0，另一端为 areaX，则在两端设备之间画椭圆。

    const palette = ['#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#22d3ee', '#fbbf24', '#60a5fa'];

    const devById = new Map(
      safe.devices.map(d => [String(d.id), d])
    );

    const getAreaOfDevice = (dev) => {
      const raw = dev?.ospf?.area ?? dev?.ospf_area ?? dev?.configuration?.ospf?.area;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    const arcsByArea = new Map(); // areaX -> array of {p0,p1}
    const midSumByArea = new Map(); // areaX -> {x,z,count}

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

        // area0 内部不画：只画 area0 与其他 area 的“外围边界”
        if (sArea === dArea) return;

        // 只处理包含 area0 的边：0 <-> X
        if (sArea === 0 && dArea !== 0) {
          const areaX = dArea;
          addArc(areaX, { x: sDev.position.x, z: sDev.position.z }, { x: dDev.position.x, z: dDev.position.z });
        } else if (dArea === 0 && sArea !== 0) {
          const areaX = sArea;
          addArc(areaX, { x: dDev.position.x, z: dDev.position.z }, { x: sDev.position.x, z: sDev.position.z });
        }
      });

    return Array.from(arcsByArea.entries())
      // 完全不绘制 Area 0
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
          dpr={[1, 2]} // 优化高分屏
        >
          {/* 环境与光照 - 均衡亮度版 */}
          <ambientLight intensity={1.5} />
          <hemisphereLight intensity={1.0} groundColor="#1e293b" skyColor="#ffffff" />
          <directionalLight position={[10, 10, 5]} intensity={2.5} castShadow />
          <pointLight position={[-10, 10, -10]} intensity={2.0} />
          {/* <Environment preset="city" /> */} 

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

          {/* 后处理特效 (美化部分) */}
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
