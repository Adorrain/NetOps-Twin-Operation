/**
 * 迷你折线图（Sparkline）组件。
 *
 * Author: Adorrain
 * Date: 2026-01-30
 */

import React from 'react';

/**
 * SparkLine：以 SVG 渲染简单折线，可选填充渐变。
 *
 * @param {{data?: number[], width?: number, height?: number, color?: string, fill?: boolean}} props 组件属性。
 * @returns {JSX.Element|null} 图表组件；数据不足返回 null。
 */
const SparkLine = ({
  data = [],
  width = 100,
  height = 40,
  color = "#3b82f6",
  fill = false
}) => {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const fillPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} overflow="visible">
      {fill && (
        <defs>
          <linearGradient id={`gradient-${color.replace('#','')}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      
      {fill && (
        <polygon
          points={fillPoints}
          fill={`url(#gradient-${color.replace('#','')})`}
          style={{ transition: 'all 0.5s ease-in-out' }}
        />
      )}
      
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: 'all 0.5s ease-in-out', filter: 'drop-shadow(0 4px 3px rgb(0 0 0 / 0.07)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.06))' }}
      />
      
      <circle 
        cx={width} 
        cy={height - ((data[data.length - 1] - min) / range) * height} 
        r="3" 
        fill={color}
        className="animate-pulse"
      />
    </svg>
  );
};

export default SparkLine;
