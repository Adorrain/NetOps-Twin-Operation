<div align="center">
  <img src="./logo.svg" alt="NetOps Logo" width="120" height="120" />
  <h1>NetOps 网络运维数字孪生系统</h1>
  <p>基于 NetOps 理念的网络运维数字孪生系统，通过 YAML 脚本定义网络设备参数，使用 Three.js 进行 3D 可视化展示，实现网络拓扑的数字孪生仿真。</p>

  <p>
    <a href="https://github.com/Adorrain/NetOps-Twin-Operation"><img src="https://img.shields.io/badge/GitHub-Repo-blue?style=flat&logo=github" alt="GitHub Repo" /></a>
    <a href="https://github.com/Adorrain/NetOps-Twin-Operation/tags"><img src="https://img.shields.io/badge/version-v1.2.0-2ea44f?style=flat" alt="version" /></a>
    <a href="./backend"><img src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat&logo=python&logoColor=white" alt="Python 3.10+" /></a>
    <a href="./frontend"><img src="https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black" alt="React" /></a>
    <a href="./frontend"><img src="https://img.shields.io/badge/Three.js-3D-000000?style=flat&logo=threedotjs&logoColor=white" alt="Three.js" /></a>
    <a href="./frontend"><img src="https://img.shields.io/badge/Tailwind%20CSS-UI-06B6D4?style=flat&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
  </p>
</div>

## 项目概述

本项目旨在创建一个现代化的网络运维管理平台，通过数字孪生技术实现网络设备的 3D 可视化展示和运维管理。系统支持通过 YAML 配置文件定义网络拓扑结构，包括 PC、路由器、交换机等设备的参数配置，并在前端通过 Three.js 进行逼真的 3D 渲染展示。

## 核心功能

- 🌐 **网络拓扑可视化**: 基于 YAML 配置的 3D 网络拓扑展示
- 🔧 **设备参数管理**: 支持 PC、路由器、交换机等设备的参数配置
- 📊 **实时监控**: 网络设备状态和性能实时监控
- 🎮 **交互式运维**: 3D 场景中的设备交互和运维操作
- 📱 **现代化界面**: 响应式设计，支持多设备访问

## 技术栈

### 前端技术

- **React 18** + **TypeScript**: 现代化前端开发框架
- **Three.js**: 3D 图形渲染引擎
- **React Three Fiber**: React 的 Three.js 渲染器
- **Tailwind CSS**: 现代化 CSS 框架
- **Zustand**: 轻量级状态管理
- **Vite**: 快速构建工具

### 后端技术

- **Python 3.10+**: 后端开发语言
- **FastAPI**: 现代化 Web 框架
- **Pydantic**: 数据验证和序列化
- **PyYAML**: YAML 配置文件解析
- **WebSocket**: 实时通信

### 数据库

- **PostgreSQL**: 生产环境推荐

## 项目结构

```
netvops/
├── frontend/                 # 前端项目目录
│   ├── src/
│   │   ├── components/       # React组件
│   │   │   ├── 3d/          # 3D场景组件
│   │   │   ├── ui/          # UI组件
│   │   │   └── layout/      # 布局组件
│   │   ├── hooks/           # 自定义React Hooks
│   │   ├── stores/          # Zustand状态管理
│   │   ├── utils/           # 工具函数
│   │   ├── types/           # TypeScript类型定义
│   │   └── assets/          # 静态资源
│   ├── public/              # 公共资源
│   └── package.json
├── backend/                 # 后端项目目录
│   ├── app/
│   │   ├── api/             # API路由
│   │   ├── core/            # 核心配置
│   │   ├── models/          # 数据模型
│   │   ├── services/        # 业务逻辑
│   │   ├── utils/           # 工具函数
│   │   └── schemas/         # Pydantic模型
│   ├── config/              # 配置文件
│   ├── tests/               # 测试文件
│   ├── requirements.txt
│   └── main.py
├── config/                  # 共享配置文件
│   └── network_configs/     # YAML网络配置示例
├── docs/                    # 项目文档
└── docker-compose.yml       # Docker部署配置
```

## 快速开始

### 环境要求

- Node.js 18+
- Python 3.10+
- npm 或 pnpm

### 安装依赖

```bash
# 安装前端依赖
cd frontend
npm install

# 安装后端依赖
cd ../backend
pip install -r requirements.txt
```

### 开发环境启动

```bash
# 启动前端开发服务器
cd frontend
npm run dev

# 启动后端API服务器
cd backend
python main.py
```

## 使用说明

1. **配置网络拓扑**: 在`config/network_configs/`目录下创建 YAML 配置文件
2. **上传配置文件**: 通过前端界面上传或编辑 YAML 配置
3. **3D 可视化**: 系统自动解析 YAML 并生成 3D 网络拓扑图
4. **网络运维**: 在 3D 场景中进行设备交互和运维操作

## 配置文件格式

系统使用 YAML 格式定义网络拓扑结构，支持以下设备类型：

- PC（个人计算机）
- Router（路由器）
- Switch（交换机）
- Server（服务器）
