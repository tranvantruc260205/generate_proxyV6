#!/bin/bash

# ==========================================================
# Cài đặt dịch vụ chạy ngầm 24/24 tự bật cùng máy
# ==========================================================

set -e

if [ "$EUID" -ne 0 ]; then
  echo "⚠️ Vui lòng chạy với quyền root: sudo bash install_service.sh"
  exit 1
fi

CURRENT_DIR=$(pwd)
NODE_PATH=$(which node || echo "/usr/bin/node")

echo "🔧 Đang đăng ký dịch vụ IPv6 Proxy Manager vào Systemd..."

# Thay thế đường dẫn vào template
sed -e "s|WORKING_DIR_PLACEHOLDER|$CURRENT_DIR|g" \
    -e "s|/usr/bin/node|$NODE_PATH|g" \
    systemd/ipv6-proxy.service > /etc/systemd/system/ipv6-proxy.service

systemctl daemon-reload
systemctl enable ipv6-proxy.service
systemctl restart ipv6-proxy.service

echo "=========================================================="
echo "✅ Dịch vụ đã được cài đặt và kích hoạt thành công!"
echo "🔄 Máy chủ sẽ tự khởi động lại dịch vụ nếu Mini PC reboot."
echo "👉 Kiểm tra trạng thái: sudo systemctl status ipv6-proxy"
echo "=========================================================="
