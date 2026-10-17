# 🌐 MiniPC IPv6 Residential Proxy Manager

Hệ thống biến Mini PC Linux trong mạng gia đình thành **Trạm phát IPv6 Proxy Dân dụng (Residential Proxy Farm)** chạy 24/24. Quản lý toàn bộ thông qua Web Dashboard trực quan từ máy tính chính cùng mạng LAN.

---

## 🌟 Tính Năng Nổi Bật

- **Giao diện Web trực quan:** Truy cập trực tiếp qua IP LAN của Mini PC (ví dụ `http://192.168.1.50:8080`).
- **Chuẩn đoán điều kiện 1-Click (Diagnostic & Auto Setup):**
  - Tự động kiểm tra hệ điều hành, card mạng, dải tiền tố IPv6 `/64` do ISP cấp, kernel sysctl, 3proxy, ndppd.
  - Nút bấm **"TỰ ĐỘNG CÀI ĐẶT 1-CLICK"** kèm Live Terminal Log: tự động cài gói phần mềm và mở cấu hình mạng của Linux mà không cần gõ lệnh.
- **Quản lý Proxy linh hoạt:**
  - Tạo từng cổng hoặc tạo hàng loạt (**Bulk Create** 10, 50, 100 ports).
  - Hỗ trợ cả **HTTP/HTTPS** và **SOCKS5**.
  - Tự động sinh ngẫu nhiên địa chỉ IPv6 trong dải $2^{64}$ địa chỉ của mạng nhà.
  - 🔄 **Xoay IPv6 (Rotate IP):** Đổi sang IPv6 mới tức thì cho 1 port cụ thể hoặc toàn bộ các port.
  - 🧪 **Kiểm tra trực tiếp (Live Test):** Kiểm tra độ trễ (latency ms) và IP outbound thực tế bằng `curl`.
  - 📥 **Xuất file TXT:** Xuất danh sách proxy theo định dạng chuẩn để nhập thẳng vào Antidetect Browser (AdsPower, GoLogin, Genlogin, Hidemyacc...).
- **Tự động thích ứng khi đổi dải IPv6 (Auto Healing):**
  - Tự động theo dõi dải IPv6 của nhà mạng. Nếu router nhà bạn khởi động lại làm thay đổi dải IPv6, hệ thống sẽ tự động cập nhật toàn bộ proxies sang dải mới mà bạn không cần cấu hình lại.
- **Siêu nhẹ cho Mini PC 2GB RAM:**
  - Tiêu thụ dưới 80MB RAM cho toàn bộ Web Dashboard, 3proxy và ndppd.

---

## 📁 Cấu Trúc Dự Án

```
generate_proxyV6/
├── server.js                   # Điểm khởi chạy Web Server & Background Tasks
├── package.json                # Cấu hình dependency Node.js
├── run.sh                      # Script 1-Click khởi chạy ứng dụng
├── install_service.sh          # Đăng ký chạy ngầm 24/24 cùng hệ điều hành
├── systemd/
│   └── ipv6-proxy.service      # File cấu hình Linux Systemd
├── src/
│   ├── routes/
│   │   └── api.js              # REST API & SSE Realtime Stream
│   └── services/
│       ├── systemService.js    # Chuẩn đoán hệ điều hành, dải IPv6, 1-Click Setup
│       ├── proxyService.js     # Sinh IP, cấu hình 3proxy, xoay IP, test proxy
│       ├── autoHealingService.js # Giám sát tự động thích ứng dải IPv6
│       └── storageService.js   # Quản lý lưu trữ proxies.json & settings.json
├── public/                     # Giao diện Web Dashboard (Frontend)
│   ├── index.html              # Trang chủ giao diện
│   └── app.js                  # Logic tương tác Dashboard & API
└── data/                       # Thư mục lưu dữ liệu (Tự động sinh khi chạy)
    ├── proxies.json
    └── settings.json
```

---

## 🚀 Hướng Dẫn Sử Dụng Trên Mini PC

### Bước 1: Đưa code lên Mini PC
Bạn có thể đẩy code này lên GitHub repo của bạn, sau đó trên Mini PC chỉ cần clone về:
```bash
git clone https://github.com/<tai-khoan-cua-ban>/generate_proxyV6.git
cd generate_proxyV6
```

*(Hoặc dùng SCP / FileZilla chép thư mục này sang Mini PC).*

---

### Bước 2: Khởi chạy lần đầu (1-Click)
Tại thư mục dự án trên Mini PC, chạy lệnh:
```bash
sudo bash run.sh
```
> Script sẽ tự động cài đặt Node.js LTS (nếu máy chưa có), cài các thư viện cần thiết và khởi động Web Server.

Khi màn hình hiện ra:
```
======================================================
🚀 MiniPC IPv6 Proxy Manager đã sẵn sàng hoạt động!
🌐 Truy cập Dashboard từ máy tính chính cùng mạng LAN:
👉 http://192.168.1.50:8080
======================================================
```

---

### Bước 3: Cấu hình và sử dụng từ Máy tính chính (Main PC)
1. Trên máy tính chính (cùng mạng WiFi/LAN), mở trình duyệt truy cập:
   ```
   http://<IP_LAN_CUA_MINIPC>:8080
   ```
2. Chuyển sang tab **"Chuẩn Đoán & Tự Động Cài Đặt"**:
   - Bấm nút **"TỰ ĐỘNG CÀI ĐẶT 1-CLICK"**.
   - Màn hình Console sẽ chạy các bước cài `3proxy`, `ndppd`, cấu hình kernel sysctl và route loopback.
3. Chuyển sang tab **"Danh Sách Proxy"**:
   - Bấm **"Tạo Proxy Hàng Loạt"** (ví dụ tạo 10 proxy từ port 10000).
   - Ngay lập tức bạn sẽ có 10 proxy với 10 địa chỉ IPv6 khác biệt hoàn toàn!
4. Cài proxy vào trình duyệt trên Main PC:
   - Host/IP: IP của Mini PC (vd: `192.168.1.50`)
   - Port: `10000` (hoặc `10001`, `10002`...)
   - Kiểm tra IP ra ngoài tại https://api64.ipify.org để thấy địa chỉ IPv6.

---

### Bước 4: Thiết lập chạy vĩnh viễn 24/24 (Tự bật khi cắm nguồn)
Sau khi test mọi thứ hoạt động trơn tru, bạn cho hệ thống chạy ngầm vĩnh viễn bằng cách chạy lệnh sau trên Mini PC:
```bash
sudo bash install_service.sh
```
Từ lúc này, bạn có thể rút bàn phím, màn hình của Mini PC ra. Cứ mỗi lần Mini PC có điện khởi động, hệ thống proxy và dashboard web sẽ tự động chạy trong nền!

- Kiểm tra trạng thái: `sudo systemctl status ipv6-proxy`
- Xem log hệ thống: `sudo journalctl -u ipv6-proxy -f`
- Dừng dịch vụ: `sudo systemctl stop ipv6-proxy`
- Khởi động lại: `sudo systemctl restart ipv6-proxy`

---

## 📌 Giai Đoạn 2 (Học DevOps CI/CD - Tiếp theo)
Trong buổi tiếp theo, bạn sẽ tự tay tạo pipeline GitHub Actions với file `.github/workflows/deploy.yml` và Self-hosted Runner trên Mini PC để:
- Mỗi khi `git push` code mới lên GitHub, Mini PC sẽ tự động pull code và reload dịch vụ trong 3 giây!

