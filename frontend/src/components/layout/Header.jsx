import React from 'react'
import { Layout, Typography } from 'antd'

const { Header: AntHeader } = Layout
const { Text } = Typography

const Header = () => {
  return (
    <AntHeader
      style={{
        height: 64,
        padding: '0 16px',
        background: '#0b1220',
      }}
    >
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <Text strong style={{ color: '#e5e7eb', fontSize: 18, textAlign: 'center' }}>
          网络数字孪生实验平台
        </Text>
      </div>
    </AntHeader>
  )
}

export default Header