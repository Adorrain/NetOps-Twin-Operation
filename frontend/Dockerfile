# 设置基础镜像
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 拷贝依赖
COPY package*.json /app/
RUN npm ci

# 拷贝代码
COPY . /app

# 设置环境变量
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=${VITE_API_BASE}

# 构建应用
RUN npm run build

# 设置基础镜像
FROM nginx:1.27-alpine

# 拷贝配置
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动应用
CMD ["nginx", "-g", "daemon off;"]