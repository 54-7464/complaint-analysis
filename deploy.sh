#!/bin/bash
# 卫生投诉分析平台 — 一键部署脚本
# 用法: chmod +x deploy.sh && ./deploy.sh

set -e

echo "========================================"
echo "  卫生投诉分析平台 — 部署脚本"
echo "========================================"

# 1. 生成随机密钥
if [ ! -f .env ]; then
  SECRET_KEY=$(openssl rand -hex 32)
  FERNET_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || openssl rand -base64 32)
  cat > .env <<EOF
SECRET_KEY=$SECRET_KEY
FERNET_KEY=$FERNET_KEY
EOF
  echo "已生成随机密钥 (.env)"
fi

# 2. 检查 Docker
if ! command -v docker &> /dev/null; then
  echo "请先安装 Docker: curl -fsSL https://get.docker.com | bash"
  exit 1
fi

# 3. 构建和启动
echo "正在构建镜像..."
docker compose build

echo "正在启动服务..."
docker compose up -d

echo ""
echo "========================================"
echo "  部署完成！"
echo "  访问地址: http://$(curl -s ifconfig.me 2>/dev/null || echo '服务器IP'):8000"
echo "========================================"
echo ""
echo "常用命令:"
echo "  docker compose logs -f    查看日志"
echo "  docker compose restart    重启服务"
echo "  docker compose down       停止服务"
echo "  docker compose up -d      启动服务"
