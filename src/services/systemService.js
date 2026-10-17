const { exec, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const util = require('util');
const execPromise = util.promisify(exec);

// Helper chạy lệnh với Promise
async function runCmd(cmd) {
  try {
    const { stdout, stderr } = await execPromise(cmd);
    return { stdout: stdout.trim(), stderr: stderr ? stderr.trim() : null, code: 0 };
  } catch (err) {
    return { stdout: '', stderr: err.message, code: err.code || 1 };
  }
}

/**
 * Lấy IP LAN của máy
 */
function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Bỏ qua loopback và chỉ lấy IPv4 nội bộ (thường là 192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      if (!iface.internal && iface.family === 'IPv4') {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Tìm card mạng chính kết nối ra ngoài
 */
async function getDefaultInterface() {
  if (os.platform() !== 'linux') {
    return 'eth0'; // Giả lập nếu dev trên Windows/Mac
  }

  // Tìm interface của default route
  const res = await runCmd("ip route | grep default | awk '{print $5}' | head -n1");
  if (res.stdout) {
    return res.stdout;
  }
  // Dự phòng: Lấy interface đầu tiên không phải lo
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    if (name !== 'lo') return name;
  }
  return 'eth0';
}

/**
 * Phát hiện tiền tố IPv6 Prefix /64 từ nhà mạng
 */
async function getIpv6Prefix(ifaceName) {
  if (os.platform() !== 'linux') {
    // Giá trị mẫu cho dev môi trường ngoài Linux
    return {
      prefix: '2402:800:6312:1234',
      cidr: '2402:800:6312:1234::/64',
      found: false,
      isSimulated: true
    };
  }

  const iface = ifaceName || await getDefaultInterface();
  // Lấy các địa chỉ inet6 global (loại trừ link-local fe80:: và ULA fc00::/fd00::)
  const cmd = `ip -6 addr show dev ${iface} scope global | grep -v "scope host" | grep -v "fe80:" | grep inet6 | awk '{print $2}'`;
  const res = await runCmd(cmd);

  if (!res.stdout) {
    return { prefix: null, cidr: null, found: false };
  }

  const lines = res.stdout.split('\n');
  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    const [addrWithMask] = cleanLine.split(' ');
    const [addr, mask] = addrWithMask.split('/');

    // Mở rộng các dấu :: nếu có để bóc tách 4 cụm đầu (64 bit đầu)
    const parts = addr.split(':');
    if (parts.length >= 4) {
      // Lấy 4 cụm hex đầu tiên làm prefix /64
      const prefix = parts.slice(0, 4).join(':');
      return {
        prefix: prefix,
        cidr: `${prefix}::/64`,
        found: true,
        fullIp: addr,
        mask: mask || '64',
        interface: iface
      };
    }
  }

  return { prefix: null, cidr: null, found: false };
}

/**
 * Kiểm tra các điều kiện hệ thống (System Checklist)
 */
async function checkSystemStatus() {
  const isLinux = os.platform() === 'linux';
  const lanIp = getLanIp();
  const iface = await getDefaultInterface();
  const ipv6Info = await getIpv6Prefix(iface);

  let nonlocalBind = false;
  let ipv6Forwarding = false;
  let has3proxy = false;
  let hasNdppd = false;
  let is3proxyRunning = false;
  let isNdppdRunning = false;

  if (isLinux) {
    // 1. Check sysctl
    const checkNonlocal = await runCmd("cat /proc/sys/net/ipv6/ip_nonlocal_bind 2>/dev/null || sysctl -n net.ipv6.ip_nonlocal_bind 2>/dev/null");
    nonlocalBind = checkNonlocal.stdout === '1';

    const checkForw = await runCmd("cat /proc/sys/net/ipv6/conf/all/forwarding 2>/dev/null || sysctl -n net.ipv6.conf.all.forwarding 2>/dev/null");
    ipv6Forwarding = checkForw.stdout === '1';

    // 2. Check binary cài đặt
    const check3p = await runCmd("which 3proxy");
    has3proxy = check3p.stdout.length > 0;

    const checkNdp = await runCmd("which ndppd");
    hasNdppd = checkNdp.stdout.length > 0;

    // 3. Check service đang chạy
    const check3pService = await runCmd("systemctl is-active 3proxy 2>/dev/null || pgrep -x 3proxy");
    is3proxyRunning = check3pService.stdout === 'active' || check3pService.stdout.length > 0;

    const checkNdpService = await runCmd("systemctl is-active ndppd 2>/dev/null || pgrep -x ndppd");
    isNdppdRunning = checkNdpService.stdout === 'active' || checkNdpService.stdout.length > 0;
  }

  // Tính toán điều kiện đã đủ để tạo Proxy chưa
  const isReady = isLinux && ipv6Info.found && nonlocalBind && has3proxy && hasNdppd;

  return {
    os: {
      platform: os.platform(),
      type: os.type(),
      release: os.release(),
      isLinux: isLinux,
      uptimeSeconds: os.uptime(),
      hostname: os.hostname(),
      ram: {
        totalMb: Math.round(os.totalmem() / 1024 / 1024),
        freeMb: Math.round(os.freemem() / 1024 / 1024),
        usedMb: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024),
        usagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
      },
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || 'Generic CPU'
      }
    },
    network: {
      lanIp: lanIp,
      interface: iface,
      ipv6: ipv6Info
    },
    checks: {
      isLinux: {
        label: 'Hệ điều hành Linux',
        pass: isLinux,
        detail: isLinux ? `${os.type()} ${os.release()}` : `Đang chạy trên ${os.platform()} (Cần Linux khi triển khai thực tế)`
      },
      hasIpv6Prefix: {
        label: 'Dải IPv6 /64 từ nhà mạng',
        pass: ipv6Info.found,
        detail: ipv6Info.found ? ipv6Info.cidr : 'Không tìm thấy dải IPv6 public trên card mạng'
      },
      ipNonlocalBind: {
        label: 'Kernel ip_nonlocal_bind',
        pass: nonlocalBind,
        detail: nonlocalBind ? 'Đã bật (= 1)' : 'Chưa bật (Cần để nhận hàng triệu IPv6 không cần gán card mạng)'
      },
      ipv6Forwarding: {
        label: 'Kernel IPv6 Forwarding',
        pass: ipv6Forwarding,
        detail: ipv6Forwarding ? 'Đã bật (= 1)' : 'Chưa bật (Khuyến nghị bật)'
      },
      has3proxy: {
        label: 'Gói phần mềm 3proxy',
        pass: has3proxy,
        detail: has3proxy ? 'Đã cài đặt' : 'Chưa cài đặt (Sẽ tự cài khi bấm Setup)'
      },
      hasNdppd: {
        label: 'Gói phần mềm ndppd (NDP Daemon)',
        pass: hasNdppd,
        detail: hasNdppd ? 'Đã cài đặt' : 'Chưa cài đặt (Cần để trả lời Router nhà mạng)'
      },
      service3proxy: {
        label: 'Trạng thái 3proxy Service',
        pass: is3proxyRunning,
        detail: is3proxyRunning ? 'Đang chạy' : 'Đang dừng'
      },
      serviceNdppd: {
        label: 'Trạng thái ndppd Service',
        pass: isNdppdRunning,
        detail: isNdppdRunning ? 'Đang chạy' : 'Đang dừng'
      }
    },
    isReady: isReady
  };
}

/**
 * Chạy 1-Click Auto Setup
 * Hỗ trợ truyền callback để stream log trực tiếp ra giao diện web
 */
function runAutoSetup(onLog, onComplete) {
  if (os.platform() !== 'linux') {
    onLog('[INFO] Giả lập Setup (Bạn đang mở trên máy không phải Linux)');
    onLog('[INFO] Khi chạy trên Mini PC Linux, script sẽ tự động cài 3proxy, ndppd, sysctl, route...');
    setTimeout(() => {
      onLog('[SUCCESS] Giả lập setup thành công 100%!');
      onComplete(true);
    }, 1500);
    return;
  }

  onLog('=== BẮT ĐẦU CÀI ĐẶT TỰ ĐỘNG CHO MINI PC ===');
  onLog('[1/6] Đang cập nhật danh sách gói (apt-get update)...');

  const setupProcess = spawn('bash', ['-c', `
    set -e
    echo "[1/6] Cài đặt các gói phụ trợ (3proxy, ndppd, curl, iptables)..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq 3proxy ndppd curl iptables openssl >/dev/null 2>&1

    echo "[2/6] Bật cấu hình sysctl cho kernel Linux..."
    cat << 'EOF' > /etc/sysctl.d/99-ipv6-proxy.conf
net.ipv6.ip_nonlocal_bind=1
net.ipv6.conf.all.forwarding=1
net.ipv6.conf.default.forwarding=1
net.ipv6.conf.all.proxy_ndp=1
EOF
    sysctl -p /etc/sysctl.d/99-ipv6-proxy.conf >/dev/null 2>&1 || sysctl -w net.ipv6.ip_nonlocal_bind=1

    echo "[3/6] Phát hiện card mạng và dải IPv6..."
    IFACE=$(ip route | grep default | awk '{print $5}' | head -n1)
    if [ -z "$IFACE" ]; then IFACE="eth0"; fi
    
    IPV6_PREFIX=$(ip -6 addr show dev $IFACE scope global | grep -v "scope host" | grep -v "fe80:" | grep inet6 | head -n1 | awk '{print $2}' | cut -d: -f1-4)

    if [ -n "$IPV6_PREFIX" ]; then
      echo "      Tìm thấy dải IPv6: \${IPV6_PREFIX}::/64 trên card $IFACE"
      echo "[4/6] Cấu hình route local cho dải IPv6..."
      ip -6 route add local \${IPV6_PREFIX}::/64 dev lo 2>/dev/null || true

      echo "[5/6] Khởi tạo cấu hình cho ndppd (/etc/ndppd.conf)..."
      cat << 'EOF' > /etc/ndppd.conf
route-ttl 30000
proxy IFACE_PLACEHOLDER {
   router yes
   timeout 500
   ttl 30000
   rule PREFIX_PLACEHOLDER::/64 {
      auto
   }
}
EOF
      sed -i "s/IFACE_PLACEHOLDER/$IFACE/g" /etc/ndppd.conf
      sed -i "s/PREFIX_PLACEHOLDER/$IPV6_PREFIX/g" /etc/ndppd.conf
      
      systemctl enable ndppd >/dev/null 2>&1 || true
      systemctl restart ndppd >/dev/null 2>&1 || true
    else
      echo "      [CẢNH BÁO] Chưa tìm thấy dải IPv6 public! ndppd sẽ được cấu hình sau khi router cấp IPv6."
    fi

    echo "[6/6] Chuẩn bị thư mục cấu hình 3proxy..."
    mkdir -p /etc/3proxy
    touch /etc/3proxy/3proxy.cfg
    systemctl enable 3proxy >/dev/null 2>&1 || true

    echo "=== HOÀN TẤT THIẾT LẬP HỆ THỐNG THÀNH CÔNG! ==="
  `]);

  setupProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (text) onLog(text);
  });

  setupProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text) onLog(`[STDERR] ${text}`);
  });

  setupProcess.on('close', (code) => {
    if (code === 0) {
      onLog('[SUCCESS] Cài đặt hoàn tất 100%! Mini PC đã sẵn sàng tạo IPv6 Proxy.');
      onComplete(true);
    } else {
      onLog(`[ERROR] Quá trình cài đặt kết thúc với mã lỗi: ${code}`);
      onComplete(false);
    }
  });

  setupProcess.on('error', (err) => {
    onLog(`[FATAL] Không thể thực thi lệnh: ${err.message}`);
    onComplete(false);
  });
}

module.exports = {
  getLanIp,
  getDefaultInterface,
  getIpv6Prefix,
  checkSystemStatus,
  runAutoSetup,
  runCmd
};
