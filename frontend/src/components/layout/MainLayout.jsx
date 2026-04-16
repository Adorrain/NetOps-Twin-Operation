import React from 'react'
import { Layout } from 'antd'
import Header from './Header'
import Sidebar from './Sidebar'

const { Content } = Layout

const MainLayout = ({ children }) => {
  return (
    <Layout style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden', background: 'transparent' }}>

      <Sidebar />

      <Layout style={{ padding: 12, gap: 12, minHeight: 0, overflow: 'hidden', background: 'transparent' }}>
        <Header />

        <Content
          style={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
            background: '#0b1220',
            borderRadius: 12,
            boxShadow: 'none',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
