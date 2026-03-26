import React from 'react'
import { Layout, Typography } from 'antd'

const { Header: AntHeader } = Layout
const { Text } = Typography

const Header = () => {
  return (
    <AntHeader
      style={{
        height: 64,
        padding: '8px 16px',
        background: 'transparent',
      }}
    >
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.85)',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}
      >
        <Text strong style={{ color: '#fff', fontSize: 22 }}>
          NetOps 数字孪生平台
        </Text>
      </div>
    </AntHeader>
  )
}

export default Header