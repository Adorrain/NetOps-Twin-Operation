import React from 'react';

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
  
  // 计算点
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
          className="transition-all duration-500 ease-in-out"
        />
      )}
      
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-500 ease-in-out drop-shadow-md"
      />
      
      {/* 结束点 */}
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
