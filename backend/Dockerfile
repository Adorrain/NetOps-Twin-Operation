FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 设置 pip 国内源（全局）
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 先拷贝依赖（利用缓存）
COPY requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r /app/requirements.txt

# 再拷贝代码
COPY . /app

EXPOSE 8000

CMD ["gunicorn", "-w", "2", "-k", "gthread", "--threads", "4", "-b", "0.0.0.0:8000", "main:app"]