import React, { useEffect } from 'react'
import { Layout, notification, Spin } from 'antd'
import Header from './Header'
import Sidebar from './Sidebar'
import { useAppStore } from '../../utils/appStore'

const { Content } = Layout

const MainLayout = ({ children }) => {
  const { ui, markNotificationAsRead } = useAppStore()
  const [, contextHolder] = notification.useNotification()

  const globalLoading = ui.loadingStates?.size > 0

  useEffect(() => {
    const timers = {}
    ui.notifications.forEach(n => {
      if (!n.read) {
        timers[n.id] = setTimeout(() => markNotificationAsRead(n.id), 5000)
      }
    })
    return () => Object.values(timers).forEach(clearTimeout)
  }, [ui.notifications, markNotificationAsRead])

  return (
    <Layout style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden', background: 'transparent' }}>
      {contextHolder}

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
            border: '1px solid #1f2937',
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
