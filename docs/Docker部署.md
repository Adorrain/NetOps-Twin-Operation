# Docker 部署说明

本项目的 Dockerfile 已放在 `backend` 和 `frontend` 目录下，可直接构建并启动容器。

> Docker相关学习文档：https://www.quanxiaoha.com/docker/docker-tutorial.html

![docker](../Pictures/docker.png)

## 1. 进入项目根目录

```bash
cd NetOps-Twin-Operation
```

## 2. 创建 Docker 网络

```docker
docker network create netops-net
```

## 3. 构建后端镜像

```docker
docker build -t netops-backend:latest ./backend
```

## 4. 构建前端镜像（将 API 地址编译进前端）

将 `VITE_API_BASE` 替换为你的实际后端接口地址，例如：

```docker
docker build -t netops-frontend:latest \
  --build-arg VITE_API_BASE="https://demo.zfank.site/api" \
  ./frontend
```

## 5. 启动后端容器

根据实际环境设置跨域来源（`CORS_ORIGINS`）：

```docker
docker run -d --name netops-backend \
  --restart unless-stopped \
  --network netops-net \
  -e CORS_ORIGINS="https://demo.zfank.site" \
  netops-backend:latest
```

## 6. 启动前端容器

前端容器仅用于内网转发场景，可不直接对外暴露端口：

```docker
docker run -d --name netops-frontend \
  --restart unless-stopped \
  --network netops-net \
  netops-frontend:latest
```

## 7.启动网关（Caddy/Nginx）这里以Caddy为例

> 关于Caddy网关的相关文档，参考：https://caddyserver.com/docs/

```docker
docker run -d --name netops-gateway \
  --restart unless-stopped \
  --network netops-net \
  -p 80:80 -p 443:443 \
  -v "$(pwd)/deploy/Caddyfile:/etc/caddy/Caddyfile" \
  -v caddy_data:/data \
  -v caddy_config:/config \
  caddy:2
```