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
import * as THREE from 'three';
import { getDisplayVlanId } from '../../utils/net';

/**
 * ===========================
 * 工具：标准化拓扑数据（防炸核心）
 * ===========================
 */
/**
 * 标准化拓扑数据结构，兼容不同字段命名与缺省情况。
 *
 * @param {any} raw 原始拓扑对象。
 * @returns {{devices:any[], links:any[], flows:any[], alerts:any[]}} 标准化后的拓扑对象。
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
/**
 * 机架设备（交换机/服务器）几何体渲染。
 *
 * @param {{size:number[], color:any, ports?:boolean, isServer?:boolean, statusColor:any}} props 组件属性。
 * @returns {JSX.Element} 3D 设备组件。
 */
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

// 2. 路由器 (未来派集线器)
/**
 * 路由器几何体渲染。
 *
 * @param {{size:number[], color:any, statusColor:any}} props 组件属性。
 * @returns {JSX.Element} 3D 设备组件。
 */
const RouterDevice = ({ size, color, statusColor }) => {
  return (
    <group>
      {/* 中心圆盘 */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[size[0]/2, size[0]/2, size[1]*0.6, 32]} />
        <meshPhysicalMaterial 
          color="#1e293b"
          roughness={0.2}
          metalness={0.9}
        />
      </mesh>
      
      {/* 发光环 (状态) */}
      <mesh position={[0, 0, 0]}>
        <torusGeometry args={[size[0]/2 + 0.05, 0.05, 16, 100]} />
        <meshBasicMaterial color={statusColor} toneMapped={false} />
      </mesh>

      {/* 悬浮天线 (科幻风格) */}
      <group rotation={[0, Math.PI / 4, 0]}>
        {[0, 1, 2, 3].map(i => (
          <mesh key={i} position={[0, size[1]/2, 0]} rotation={[0, (i * Math.PI) / 2, 0]}>
            <boxGeometry args={[0.1, 0.8, 0.1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

// 3. 防火墙 (盾牌/堡垒外观)
/**
 * 防火墙几何体渲染。
 *
 * @param {{size:number[], color:any, statusColor:any}} props 组件属性。
 * @returns {JSX.Element} 3D 设备组件。
 */
const FirewallDevice = ({ size, color, statusColor }) => {
  return (
    <group>
      {/* 坚固的底座 */}
      <RoundedBox args={[size[0], size[1], size[2]]} radius={0.1}>
        <meshPhysicalMaterial color="#450a0a" roughness={0.4} metalness={0.6} />
      </RoundedBox>
      
      {/* 红色全息盾牌效果 */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[size[0] + 0.2, size[1] + 0.2, size[2] + 0.2]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.3} toneMapped={false} />
      </mesh>

      {/* 状态核心 */}
      <mesh position={[0, 0, size[2]/2 + 0.05]}>
        <circleGeometry args={[0.3, 32]} />
        <meshBasicMaterial color={statusColor} toneMapped={false} />
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
  const { position = { x: 0, y: 0, z: 0 }, type, deviceType, role, name, status, metrics } = device;
  
  // 尺寸配置
  const config = {
    core: { size: [3, 0.8, 2] },
    aggregation: { size: [2.5, 0.6, 1.8] },
    access: { size: [2, 0.5, 1.5] },
    server: { size: [1.2, 2.5, 1.2] },
    firewall: { size: [1.5, 1.5, 1.5] },
    router: { size: [1.8, 1, 1.8] },
    pc: { size: [0.8, 0.6, 0.1] },
  };

  const renderType = (role || deviceType || type || 'access').toLowerCase();
  
  // 智能推断类型
  let effectiveType = renderType;
  const lowerName = (name || '').toLowerCase();
  if (lowerName.includes('core')) effectiveType = 'core';
  else if (lowerName.includes('agg')) effectiveType = 'aggregation';
  else if (lowerName.includes('fw') || lowerName.includes('firewall')) effectiveType = 'firewall';
  else if (renderType.includes('router')) effectiveType = 'router';
  else if (renderType.includes('server')) effectiveType = 'server';
  else if (renderType.includes('pc') || renderType.includes('terminal')) effectiveType = 'pc';
  else if (renderType.includes('switch')) effectiveType = 'access';

  const { size } = config[effectiveType] || config.access;

  // 霓虹配色方案
  const neonColors = {
    core: '#00ffff',       // 青色
    aggregation: '#38bdf8', // 天蓝色
    access: '#3b82f6',     // 蓝色
    router: '#4ade80',     // 霓虹绿
    firewall: '#f43f5e',   // 霓虹红/粉
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
        return <RackDevice size={size} color={baseColor} ports={true} statusColor={statusColor} />;
      case 'server':
        return <RackDevice size={size} color={baseColor} isServer={true} statusColor={statusColor} />;
      case 'router':
        return <RouterDevice size={size} color={baseColor} statusColor={statusColor} />;
      case 'firewall':
        return <FirewallDevice size={size} color={baseColor} statusColor={statusColor} />;
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
  const from = devices.find((d) => String(d.id) === String(link.from));
  const to = devices.find((d) => String(d.id) === String(link.to));

  if (!from || !to || !from.position || !to.position) return null;

  const points = [
    [from.position.x, 0.5, from.position.z],
    [to.position.x, 0.5, to.position.z],
  ];
  
  const isDown = link.status === 'down';
  const color = isDown ? '#334155' : '#38bdf8'; // 电光蓝

  return (
    <group>
      {/* 核心光束 */}
      <Line
        points={points}
        color={color}
        lineWidth={2}
        opacity={isDown ? 0.2 : 0.6}
        transparent
      />
      {/* 辉光层 (只在连接时显示) */}
      {!isDown && (
         <Line
           points={points}
           color={color}
           lineWidth={5}
           opacity={0.1}
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
  const from = devices.find((d) => String(d.id) === String(link.from));
  const to = devices.find((d) => String(d.id) === String(link.to));
  
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
    const s = String(status || '').toLowerCase();
    return s === 'up' || s === 'active';
  };
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
        <DeviceMesh key={device.id} device={device} onClick={() => onDeviceClick && onDeviceClick(device)} />
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

          <Suspense fallback={<Html center><div className="text-white">Loading 3D Engine...</div></Html>}>
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
