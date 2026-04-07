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
          background: '#0f172a',
        }}
      >
        <Text strong style={{ color: '#fff', fontSize: 28 }}>
        网络数字孪生实验平台
        </Text>
      </div>
    </AntHeader>
  )
}

export default Header