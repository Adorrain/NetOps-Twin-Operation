import React from 'react'
import { Layout } from 'antd'
import Header from './Header'
import Sidebar from './Sidebar'

const { Content } = Layout

export default function MainLayout({ children }) {
  return (
    <Layout className="app-layout">
      <Sidebar />

      <Layout className="app-main">
        <Header />

        <Content className="app-content">
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}