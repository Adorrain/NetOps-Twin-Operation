import React from 'react'
import { Layout } from 'antd'
import Header from './Header'
import Sidebar from './Sidebar'

const { Content } = Layout

const MainLayout = ({ children, networkTopology }) => {
  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sidebar networkTopology={networkTopology} />
      <Layout style={{ minHeight: 0, overflow: 'hidden' }}>
        <Header />
        <Content style={{ background: '#0b1220', minHeight: 0, overflow: 'hidden' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
