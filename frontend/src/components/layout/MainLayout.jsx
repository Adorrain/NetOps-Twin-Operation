import React from 'react'
import { Layout, Spin } from 'antd'
import Header from './Header'
import Sidebar from './Sidebar'
import { useAppState } from '../../utils/appStore'

const { Content } = Layout

const MainLayout = ({ children }) => {
  const { ui } = useAppState()

  const globalLoading = ui.loadingStates?.size > 0

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

          {globalLoading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.4)',
              }}
            >
              <Spin size="large" />
            </div>
          )}
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
