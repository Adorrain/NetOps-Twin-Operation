<div align="center">
  <img src="./coverage.png" alt="NetOps Logo" width="80%" style="box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25); border-radius: 12px;" />
  <h1>基于NetOps的网络运维数字孪生系统的研究与设计</h1>
  <p>基于 NetOps 理念的网络运维数字孪生系统，通过 YAML 脚本定义网络设备参数，使用 Three.js 进行 3D 可视化展示，实现网络拓扑的数字孪生仿真。</p>

  <p>
    <a href="https://github.com/Adorrain/NetOps-Twin-Operation"><img src="https://img.shields.io/badge/GitHub-Repo-blue?style=for-the-badge&logo=github" alt="GitHub Repo" /></a>
    <a href="https://github.com/Adorrain/NetOps-Twin-Operation/tags"><img src="https://img.shields.io/badge/version-v1.5.0-2ea44f?style=for-the-badge" alt="version" /></a>
    <a href="./backend"><img src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.10+" /></a>
    <a href="./frontend"><img src="https://img.shields.io/badge/React-18%2B-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" /></a>
    <a href="./frontend"><img src="https://img.shields.io/badge/Three.js-3D-000000?style=for-the-badge&logo=threedotjs&logoColor=white" alt="Three.js" /></a>
    <a href="./frontend"><img src="https://img.shields.io/badge/Ant%20Design-UI-0170FE?style=for-the-badge&logo=ant-design&logoColor=white" alt="Ant Design" /></a>
  </p>
</div>

## 项目概述

本项目旨在创建一个现代化的网络运维管理平台，通过数字孪生技术实现网络设备的 3D 可视化展示和运维管理。系统支持通过 YAML 配置文件定义网络拓扑结构，包括 PC、路由器、交换机等设备的参数配置，并在前端通过 Three.js 进行逼真的 3D 渲染展示。

## 文档

- 技术文档（产品定位/设计/技术栈/前后端/数据库/接口与响应格式）：[docs/techdocs.md](docs/techdocs.md)


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
# 启动前端服务
cd frontend
npm run dev

# 启动后端服务
cd backend
python main.py
```

