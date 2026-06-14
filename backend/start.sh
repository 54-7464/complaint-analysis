#!/bin/bash
set -e

# 如果 SECRET_KEY 不存在，生成一个
if [ -z "$SECRET_KEY" ]; then
  export SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || echo "default-dev-key-change-me")
fi

echo "启动卫生投诉分析平台..."

# 确保目录存在
mkdir -p /app/data /app/uploads

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
