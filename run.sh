#!/bin/bash

# ==========================================================
# MiniPC IPv6 Proxy Manager - Script Khởi Chạy Nhanh 1-Click
# ==========================================================

set -e

# Kiểm tra quyền root
if [ "$EUID" -ne 0 ]; then
  echo "⚠️ Vui lòng chạy script với quyền sudo/root:"
  echo "👉 sudo bash run.sh"
  exit 1
fi

echo "=========================================================="
echo "🚀 Đang kiểm tra môi trường trên Mini PC..."
echo "=========================================================="

# 1. Kiểm tra và cài đặt Node.js nếu chưa có
if ! command -v node >/dev/null 2>&1; then
    echo "📦 Đang cài đặt Node.js LTS cho Mini PC..."
    apt-get update -qq
    apt-get install -y -qq curl
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs
    echo "✅ Đã cài đặt xong Node.js $(node -v)!"
else
    echo "✅ Node.js đã sẵn sàng: $(node -v)"
fi

# 2. Cài đặt các thư viện npm cần thiết
cd "$(dirname "$0")"
if [ ! -d "node_modules" ]; then
    echo "📦 Đang cài đặt thư viện ứng dụng (npm install)..."
    npm install --production --silent
    echo "✅ Đã cài đặt xong thư viện!"
fi

# 3. Tạo thư mục data nếu chưa có
mkdir -p data

# 4. Khởi chạy ứng dụng
echo ""
echo "🚀 Đang khởi động Web Dashboard..."
node server.js

