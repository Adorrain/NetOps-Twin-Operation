# NetOps 网络运维数字孪生系统 技术文档

本文档基于当前仓库实现整理，覆盖产品定位、产品设计、技术栈、前后端与数据库设计、接口设计与响应格式规范建议。

## 1. 产品定位

- 产品定位：面向园区/企业网络的“配置驱动 + 3D 可视化 + 运维仿真”平台。通过上传网络拓扑配置（YAML）生成数字孪生场景，在孪生环境中执行运维动作并观察状态演化。
- 目标用户：网络运维工程师、网络规划/演练人员、网络教学/实验人员、值班监控人员。
- 核心价值：
  - 不触碰真实网络即可进行配置演练与故障推演
  - 以拓扑为中心融合可视化、操作与仿真结果
  - 通过快照与操作日志沉淀运维过程，形成可回溯记录
- 典型场景：
  - 拓扑与配置导入后进行连通性验证（Ping/Traceroute）
  - 模拟设备/链路/接口故障，观察路径与业务影响
  - VLAN 接入/Trunk 配置演练与跨 VLAN 通信推演
  - OSPF 配置/重置/邻居收敛过程的仿真展示
  - DDoS 攻击仿真（用于前端负载展示与告警演示）

## 2. 产品设计

### 2.1 核心用户流程

1. 配置上传：用户在前端上传 YAML 拓扑文件
2. 后端解析校验：后端校验结构与 IP 合法性，返回结构化拓扑数据
3. 前端建模渲染：前端将返回结果转换为渲染友好的前端拓扑模型（补齐布局、归一化链路字段等），渲染 3D 场景
4. 运维操作：用户在控制台执行运维动作（状态修改、VLAN、OSPF 等）
5. 状态演化与留痕：后端生成新拓扑状态并落库快照与操作日志；前端展示结果

### 2.2 功能模块划分

- 拓扑管理：上传拓扑
- 3D 数字孪生：设备模型渲染、链路光束与数据流粒子、点击选中与标签
- 运维仿真：
  - 连通性：Ping、Traceroute
  - 状态控制：设备状态、链路状态、接口状态
  - 二层配置：VLAN 分配/移除、Access/Trunk 配置
  - 三层/动态路由：OSPF 配置、OSPF Reset、OSPF 邻居列表（仿真）
  - 攻击仿真：DDoS simulate
- 监控面板：设备与连接状态展示（部分能力为 UI 侧预留）

## 3. 系统架构与运行方式

### 3.1 总体架构

- 前端：Vite + React（3D：Three.js / React Three Fiber；样式：Tailwind；状态：Zustand）
- 后端：FastAPI（解析拓扑、仿真与状态变更、快照与日志落库）
- 数据库：SQLite（当前实现为本地文件 `backend/app/netops.db`）

### 3.2 关键数据流

- 拓扑上传链路：
  - 前端上传文件到后端
  - 后端解析并返回 `TopologyData`
  - 前端将 `TopologyData` 转换为前端拓扑模型并渲染
- 运维动作链路：
  - 前端调用 `/api/ops/*`
  - 后端从“最新快照”构造仿真实例，执行运维动作，保存新快照与日志
  - 返回结果给前端展示（部分接口返回完整 device/link 数据）

## 4. 技术栈

### 4.1 前端技术栈（实际依赖）

- React 19.x
- Vite 7.x
- react-router-dom 7.x
- three + @react-three/fiber + drei + postprocessing
- Zustand
- Tailwind CSS 4.x

### 4.2 后端技术栈（实际依赖）

- Python 3.10+
- FastAPI + Uvicorn
- SQLAlchemy（SQLite）
- Pydantic（入参/出参模型）
- PyYAML（拓扑解析）
- python-multipart（文件上传）
- NetworkX（拓扑图计算；当前代码使用，但 requirements.txt 未显式列出）

## 5. 前端设计

### 5.1 路由与页面

- `/topology`：主界面（左侧 3D 孪生视图 + 右侧运维控制台）
- `/upload`：上传拓扑配置文件
- `/monitoring`：监控面板
- `/ops`：运维控制台页面（与主界面右侧控制台复用）

### 5.2 状态管理（Zustand）

- `networkTopology`：当前拓扑（前端渲染模型）
- `selectedDeviceId`：当前选中设备（由 3D 点击驱动）
- `opsLogs / ui`：运维日志与 UI 状态（加载状态、通知等）

### 5.3 3D 渲染与交互

- 3D 场景基于 `@react-three/fiber` 的 `Canvas` 进行渲染
- 使用 `drei` 提供的 `OrbitControls`、`Grid`、`Text` 等快速搭建交互与标注
- 链路渲染：光束线条 + 数据流粒子（可用于 DDoS 等场景展示）

### 5.4 前端拓扑模型（转换层）

后端返回的 `TopologyData` 更贴近配置/仿真模型；前端会将其转换为渲染友好结构（重点包括）：

- 角色推断：依据 `role/name/deviceType` 推断 core/aggregation/access/firewall/terminal
- 自动布局：按层级给设备补齐 `position`，以便 3D 场景摆放
- 链路字段归一化：将 `src_device/dst_device` 映射为 `from/to` 并构造 `connections[]`

## 6. 后端设计

### 6.1 服务入口与中间件

- 启动时自动创建数据库表（无迁移框架）
- CORS 仅放行本地开发域：`http://localhost:3000`、`http://localhost:5173`
- 路由挂载：
  - `/api/*`：Topology 管理
  - `/api/ops/*`：运维仿真

### 6.2 模块职责

- 拓扑解析校验：解析 YAML、校验结构、校验 IP 合法性与唯一性、校验链路引用关系
- 仿真服务：构建运行时图，执行 Ping/Traceroute、链路/接口/设备状态修改、VLAN 与 OSPF 仿真逻辑
- 数据持久化：保存拓扑快照与操作日志；为 ops 提供“最新快照”作为仿真输入

### 6.3 仿真逻辑摘要

- 图构建（NetworkX Graph）：
  - 设备状态为 down/offline 的节点不入图
  - 链路状态非 up/active、或任一端接口 down，会导致该边不入图
  - VLAN 可达性会影响边是否连通（access/trunk/allowed_vlans 规则）
- Ping/Traceroute：
  - 基于最短路径/最小权重路径计算路径
  - 若源/目的属于不同接入 VLAN，要求路径中存在 L3 网关/路由能力（router 或 OSPF 生效模拟）
- OSPF：
  - OSPF 配置写入 device.configuration.ospf
  - Reset 写入 last_reset_time，用于模拟收敛延迟；邻居列表会受到 reset 后的时间窗影响

## 7. 数据库设计

### 7.1 存储位置与初始化

- SQLite 文件：`backend/app/netops.db`
- 无 Alembic 等迁移；启动时自动创建表

### 7.2 表结构

#### topology_snapshots（拓扑快照）

- id：主键
- name：快照名称（索引）
- description：描述
- created_at：Date
- data：JSON，保存 TopologyData 的序列化结果

#### operation_logs（操作日志）

- id：主键
- operation_type：操作类型（索引）
- target_id：目标标识（设备/链路/接口等）
- details：详情描述
- status：状态（默认 success）
- created_at：Date

### 7.3 快照策略

- 拓扑上传：尝试写入一条“初始快照”
- 运维动作：每次状态变更/配置变更会写入“Auto-Save 快照”并追加操作日志

## 8. 配置文件（YAML）设计

### 8.1 顶层结构

```yaml
topology:
  name: "Campus"
  type: "campus"

devices:
  - id: "r1"
    name: "Core-Router"
    role: "core"
    deviceType: "router" # 或 device_type
    ip: "10.0.0.1/24"
    status: "up"
    interfaces:
      - name: "ge0/0"
        ip: "10.0.0.1/24"
        status: "up"
        mode: "access" # access/trunk
        vlan: 10
      - name: "ge0/1"
        mode: "trunk"
        allowed_vlans: [10, 20]
    configuration:
      ospf:
        area: 0
        routerId: "1.1.1.1"

links:
  - id: "l1"
    src_device: "r1"
    dst_device: "sw1"
    src_interface: "ge0/1"
    dst_interface: "ge0/0"
    status: "up"
    bandwidth: "1G"
```

### 8.2 关键校验规则（当前后端实现）

- devices/links 必须为数组
- device.id、link.id 必填且不能重复
- link 引用的 src/dst 设备必须存在
- 若 link 指定 src_interface/dst_interface，则接口名必须在对应 device.interfaces 中存在
- ip 与接口 ip 必须是合法 IP（支持 CIDR），且全拓扑 IP 不允许重复

## 9. 接口设计

### 9.1 基本约定

- Base URL：`http://localhost:8000/api`
- Content-Type：
  - 上传接口：`multipart/form-data`
  - 其它接口：`application/json`
- 错误体：FastAPI 默认错误返回 `{"detail": "..."}` 并使用 HTTP 状态码表示错误类型

### 9.2 Topology

#### POST /api/network/topology/upload

- 用途：上传 YAML/YML 文件（最大 2MB），后端解析校验
- 请求：multipart 表单字段 `file`
- 成功响应：直接返回 `TopologyData`
- 可能的错误：
  - 400：文件类型不支持、YAML 校验失败
  - 413：文件过大
  - 500：解析/内部错误

### 9.3 Ops（前缀 /api/ops）

#### POST /api/ops/ping

- Body：`{ "source_id": "pc1", "target_ip": "10.0.0.2" }`
- 响应（示例）：

```json
{
  "success": true,
  "message": "Reply from 10.0.0.2: bytes=32 time=4.20ms TTL=62",
  "rtt": 4.2,
  "path": ["pc1", "sw1", "pc2"],
  "hops": 2
}
```

#### POST /api/ops/traceroute

- Body：`{ "source_id": "pc1", "target_ip": "10.0.0.2" }`
- 响应（示例）：

```json
{
  "success": true,
  "hops": [
    {
      "hop": 1,
      "device_id": "sw1",
      "device_name": "Core-SW",
      "ip": "10.0.0.1/24",
      "rtt": "1.50 ms"
    }
  ],
  "path": ["pc1", "sw1", "pc2"]
}
```

#### POST /api/ops/device/status

- Body：`{ "device_id": "sw1", "status": "down" }`
- 响应：`{ success, status, message, data }`，data 为更新后的 device

#### POST /api/ops/link/status

- Body（二选一）：
  - `{ "link_id": "l1", "status": "down" }`
  - `{ "src_id": "sw1", "dst_id": "r1", "status": "down" }`
- 响应：`{ success, status, message, data }`，data 为 link（可能为 null）

#### POST /api/ops/interface/status

- Body：`{ "device_id": "sw1", "iface_name": "ge0/1", "status": "down" }`
- 响应：`{ success, status, message, data }`，data 为更新后的 device

#### POST /api/ops/vlan/assign

- Body：`{ "device_id": "sw1", "port": "ge0/1", "vlan_id": 10 }`
- 响应：`{ success, status, message, data }`，data 为更新后的 device

#### POST /api/ops/vlan/remove

- Body：`{ "device_id": "sw1", "port": "ge0/1" }`
- 响应：`{ success, status, message, data }`

#### POST /api/ops/vlan/configure

- access：
  - Body：`{ "device_id": "sw1", "port": "ge0/1", "mode": "access", "vlan_id": 10 }`
- trunk：
  - Body：`{ "device_id": "sw1", "port": "ge0/1", "mode": "trunk", "allowed_vlans": [10, 20] }`
- 响应：`{ success, status, message, data }`

#### POST /api/ops/ospf/config

- Body：`{ "device_id": "r1", "area": 0, "routerId": "1.1.1.1" }`
- 响应：`{ success, status, message, data }`

#### POST /api/ops/ospf/reset

- Body：`{ "device_id": "r1" }`
- 响应：`{ success, status, message, data }`

#### POST /api/ops/ospf/neighbors

- Body：`{ "device_id": "r1" }`
- 响应：`{ success, status, data }`，data 为邻居数组

#### POST /api/ops/ddos/simulate

- Body：`{ "target_id": "server1" }`
- 响应：`{ success, status, message }`

## 10. 接口响应格式（现状与规范建议）

### 10.1 现状总结

- Topology 接口直接返回 `TopologyData`
- Ping/Traceroute 直接返回 `{ success, message, ... }`
- 多数变更类接口返回 `{ success, status, message, data }`
- FastAPI 异常返回 `{"detail":"..."}`（与上面几类都不同）

这会导致前端需要分支处理错误与成功结构，且难以统一记录 traceId、错误码等信息。

### 10.2 建议的统一响应 Envelope

建议未来所有 JSON API 统一为以下结构（无论成功或失败都保持字段一致）：

```json
{
  "success": true,
  "code": "OK",
  "message": "操作成功",
  "data": {},
  "traceId": "01J..."
}
```

失败时：

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "devices[0].id is required",
  "data": null,
  "traceId": "01J..."
}
```

建议的 code（示例）：

- OK
- VALIDATION_ERROR
- NOT_FOUND
- TOPOLOGY_NOT_READY
- INTERNAL_ERROR
- FILE_TOO_LARGE

## 11. OpenAPI / Swagger 使用说明

后端基于 FastAPI，默认提供 OpenAPI 文档与交互式调试界面：

- Swagger UI：`http://localhost:8000/docs`
- OpenAPI JSON：`http://localhost:8000/openapi.json`
- ReDoc：`http://localhost:8000/redoc`

建议在对外联调时使用 `/docs` 直接调试各接口的请求体、响应体与状态码，并以此作为接口契约的单一可信来源。

## 12. 接口规范改造清单（不改代码，仅对齐方向）

以下为将“现状”逐步演进到“统一响应 Envelope”的建议改造清单：

1. 后端：新增通用响应模型（统一 success/code/message/data/traceId）并为全局异常添加统一处理
2. 后端：将 Topology、Ping/Traceroute 等接口响应改为统一 envelope（保留原 data 字段内容）
3. 前端：将 http 客户端统一处理成功/失败，集中 toast 与日志记录（按 code 分级）
4. 前后端：约定字段命名规范（snake_case 或 camelCase 二选一），并在转换层集中处理
5. 增加审计字段：操Author（如 userId）、来源、traceId 写入 operation_logs（如后续引入鉴权）
6. 引入数据库迁移（Alembic）与环境配置（API_BASE、CORS、DB 连接）
