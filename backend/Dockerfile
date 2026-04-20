# 设置基础镜像
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 设置 pip 国内源（全局）
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 先拷贝依赖（利用缓存）
COPY requirements.txt /app/requirements.txt

# 安装依赖
RUN pip install --no-cache-dir -r /app/requirements.txt

# 再拷贝代码
COPY . /app

# 暴露端口
EXPOSE 8000

# 启动应用
CMD ["gunicorn", "-w", "2", "-k", "gthread", "--threads", "4", "-b", "0.0.0.0:8000", "main:app"]