import { Layout, Typography } from 'antd'
import '../../index.css'

const { Header: AntHeader } = Layout
const { Text } = Typography

export default function Header() {
  return (
    <AntHeader className="app-header">
      <div className="header-content">
        <Text className="header-title">
          网络数字孪生实验平台
        </Text>
      </div>
    </AntHeader>
  )
}