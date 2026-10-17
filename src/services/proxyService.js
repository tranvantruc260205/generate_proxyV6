const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const storage = require('./storageService');
const system = require('./systemService');

const CONFIG_PATH = '/etc/3proxy/3proxy.cfg';

/**
 * Sinh ngẫu nhiên 64 bit sau cho IPv6 (4 cụm hex: xxxx:xxxx:xxxx:xxxx)
 */
function generateRandomIpv6Suffix() {
  const bytes = crypto.randomBytes(8);
  const hex = bytes.toString('hex');
  return hex.match(/.{1,4}/g).join(':');
}

/**
 * Tạo địa chỉ IPv6 đầy đủ từ Prefix /64 và Suffix
 */
function makeFullIpv6(prefix, customSuffix) {
  const suffix = customSuffix || generateRandomIpv6Suffix();
  return `${prefix}::${suffix}`;
}

/**
 * Sinh nội dung file 3proxy.cfg từ danh sách proxies trong storage
 */
async function generate3proxyConfig() {
  const settings = storage.getSettings();
  const proxies = storage.getProxies();
  const lanIp = system.getLanIp();

  let cfg = [];
  cfg.push('# ==========================================');
  cfg.push('# Tự động sinh bởi MiniPC IPv6 Proxy Manager');
  cfg.push(`# Cập nhật lúc: ${new Date().toISOString()}`);
  cfg.push('# ==========================================');
  cfg.push('daemon');
  cfg.push('maxconn 1000');
  cfg.push('nserver 1.1.1.1');
  cfg.push('nserver 8.8.8.8');
  cfg.push('nserver 2606:4700:4700::1111');
  cfg.push('nscache 65536');
  cfg.push('timeouts 1 5 30 60 180 1800 15 60');
  cfg.push('');

  // Cấu hình xác thực (User/Pass) nếu có
  const usersWithPass = proxies.filter(p => p.username && p.password);
  if (usersWithPass.length > 0) {
    const userLines = usersWithPass.map(p => `users ${p.username}:CL:${p.password}`).join('\n');
    cfg.push('# Danh sách người dùng');
    cfg.push(userLines);
    cfg.push('');
  }

  // Quy tắc cấp quyền (Allow)
  if (settings.allowLanOnly) {
    // Chỉ cho phép mạng nội bộ truy cập
    cfg.push('# Chỉ cho phép dải mạng nội bộ kết nối');
    cfg.push('allow * 192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,127.0.0.1');
  } else {
    cfg.push('allow *');
  }
  cfg.push('');

  cfg.push('# Danh sách các cổng Proxy và Outbound IPv6');
  for (const p of proxies) {
    if (!p.enabled) continue;

    // Bật xác thực auth strong nếu proxy đó có user/pass
    if (p.username && p.password) {
      cfg.push(`auth strong`);
      cfg.push(`allow ${p.username}`);
    } else {
      cfg.push(`auth none`);
      cfg.push(`allow *`);
    }

    const type = p.type || 'http';
    const internalBind = p.bindIp || lanIp || '0.0.0.0';

    if (type === 'socks5' || type === 'socks') {
      // SOCKS5 Proxy
      cfg.push(`socks -p${p.port} -i${internalBind} -e${p.outboundIpv6}`);
    } else {
      // HTTP/HTTPS Proxy
      cfg.push(`proxy -p${p.port} -i${internalBind} -e${p.outboundIpv6}`);
    }

    // Reset lại auth
    cfg.push('flush');
    cfg.push('');
  }

  return cfg.join('\n');
}

/**
 * Áp dụng cấu hình và reload 3proxy
 */
async function applyAndReload() {
  const isLinux = os.platform() === 'linux';
  const configContent = await generate3proxyConfig();

  if (isLinux) {
    try {
      if (!fs.existsSync('/etc/3proxy')) {
        fs.mkdirSync('/etc/3proxy', { recursive: true });
      }
      fs.writeFileSync(CONFIG_PATH, configContent, 'utf-8');

      // Đảm bảo route loopback cho prefix vẫn tồn tại
      const iface = await system.getDefaultInterface();
      const ipv6Info = await system.getIpv6Prefix(iface);
      if (ipv6Info.found) {
        await system.runCmd(`ip -6 route add local ${ipv6Info.cidr} dev lo 2>/dev/null || true`);
      }

      // Reload service
      await system.runCmd('systemctl restart 3proxy 2>/dev/null || killall -HUP 3proxy 2>/dev/null || 3proxy /etc/3proxy/3proxy.cfg &');
      return { success: true, message: 'Đã cập nhật cấu hình và tải lại 3proxy thành công!' };
    } catch (err) {
      return { success: false, message: `Lỗi khi lưu cấu hình: ${err.message}` };
    }
  } else {
    // Lưu tạm file config mẫu trong data/3proxy.cfg để dev kiểm tra trên Windows/Mac
    const localDevCfg = path.join(__dirname, '..', '..', 'data', '3proxy.cfg');
    fs.writeFileSync(localDevCfg, configContent, 'utf-8');
    return { success: true, message: `[DEV MODE] Đã lưu file cấu hình mẫu tại: ${localDevCfg}` };
  }
}

/**
 * Thêm một hoặc nhiều Proxy
 */
async function addProxies({ count = 1, startPort, type = 'http', username = '', password = '', prefix }) {
  let detectedPrefix = prefix;
  if (!detectedPrefix) {
    const iface = await system.getDefaultInterface();
    const ipv6Info = await system.getIpv6Prefix(iface);
    detectedPrefix = ipv6Info.prefix;
  }

  if (!detectedPrefix) {
    throw new Error('Chưa phát hiện được dải IPv6 Prefix của nhà mạng! Vui lòng kiểm tra lại kết nối mạng.');
  }

  const currentProxies = storage.getProxies();
  const existingPorts = new Set(currentProxies.map(p => Number(p.port)));

  let currentPort = Number(startPort);
  if (!currentPort || isNaN(currentPort)) {
    // Tự tìm port trống từ 10000 trở đi
    currentPort = 10000;
    while (existingPorts.has(currentPort)) {
      currentPort++;
    }
  }

  const newProxies = [];
  for (let i = 0; i < count; i++) {
    // Tìm port khả dụng tiếp theo nếu bị trùng
    while (existingPorts.has(currentPort)) {
      currentPort++;
    }

    const outboundIpv6 = makeFullIpv6(detectedPrefix);
    const proxyItem = {
      id: crypto.randomUUID(),
      port: currentPort,
      type: type.toLowerCase(),
      outboundIpv6: outboundIpv6,
      prefix: detectedPrefix,
      username: username || '',
      password: password || '',
      enabled: true,
      createdAt: new Date().toISOString(),
      lastRotatedAt: new Date().toISOString()
    };

    existingPorts.add(currentPort);
    newProxies.push(proxyItem);
    currentPort++;
  }

  const updatedList = [...currentProxies, ...newProxies];
  storage.saveProxies(updatedList);

  await applyAndReload();
  return newProxies;
}

/**
 * Xoay IP (Rotate) cho 1 proxy cụ thể
 */
async function rotateProxyIp(proxyId) {
  const proxies = storage.getProxies();
  const proxyIndex = proxies.findIndex(p => p.id === proxyId);

  if (proxyIndex === -1) {
    throw new Error('Không tìm thấy Proxy cần xoay IP');
  }

  const iface = await system.getDefaultInterface();
  const ipv6Info = await system.getIpv6Prefix(iface);
  const activePrefix = ipv6Info.prefix || proxies[proxyIndex].prefix;

  const newSuffix = generateRandomIpv6Suffix();
  const newIpv6 = `${activePrefix}::${newSuffix}`;

  proxies[proxyIndex].outboundIpv6 = newIpv6;
  proxies[proxyIndex].prefix = activePrefix;
  proxies[proxyIndex].lastRotatedAt = new Date().toISOString();

  storage.saveProxies(proxies);
  await applyAndReload();

  return proxies[proxyIndex];
}

/**
 * Xoay IP cho TOÀN BỘ danh sách proxies
 */
async function rotateAllProxies() {
  const proxies = storage.getProxies();
  if (proxies.length === 0) return [];

  const iface = await system.getDefaultInterface();
  const ipv6Info = await system.getIpv6Prefix(iface);
  const defaultPrefix = ipv6Info.prefix;

  for (let p of proxies) {
    const prefixToUse = defaultPrefix || p.prefix;
    if (prefixToUse) {
      p.outboundIpv6 = `${prefixToUse}::${generateRandomIpv6Suffix()}`;
      p.prefix = prefixToUse;
      p.lastRotatedAt = new Date().toISOString();
    }
  }

  storage.saveProxies(proxies);
  await applyAndReload();
  return proxies;
}

/**
 * Xóa một proxy theo ID
 */
async function deleteProxy(proxyId) {
  const proxies = storage.getProxies();
  const filtered = proxies.filter(p => p.id !== proxyId);
  storage.saveProxies(filtered);
  await applyAndReload();
  return true;
}

/**
 * Xóa toàn bộ proxies
 */
async function deleteAllProxies() {
  storage.saveProxies([]);
  await applyAndReload();
  return true;
}

/**
 * Test kết nối của 1 Proxy (dùng curl để kiểm tra ra ngoài)
 */
async function testProxy(proxyId) {
  const proxies = storage.getProxies();
  const p = proxies.find(item => item.id === proxyId);
  if (!p) throw new Error('Không tìm thấy Proxy');

  const lanIp = system.getLanIp();
  const proxyUrl = p.username && p.password
    ? `${p.type}://${p.username}:${p.password}@${lanIp}:${p.port}`
    : `${p.type}://${lanIp}:${p.port}`;

  if (os.platform() !== 'linux') {
    // Giả lập kết quả test khi dev trên Windows
    return {
      success: true,
      port: p.port,
      expectedIpv6: p.outboundIpv6,
      returnedIp: p.outboundIpv6,
      latencyMs: Math.floor(Math.random() * 30) + 10,
      isSimulated: true
    };
  }

  // Gọi curl qua proxy tới API kiểm tra IP công khai có hỗ trợ IPv6 (api64.ipify.org hoặc ifconfig.co)
  const startTime = Date.now();
  const cmd = `curl -s -m 8 -x "${proxyUrl}" https://api64.ipify.org || curl -s -m 8 -x "${proxyUrl}" https://ipv6.icanhazip.com`;
  const res = await system.runCmd(cmd);
  const latency = Date.now() - startTime;

  const returnedIp = res.stdout.trim();
  const success = returnedIp.length > 0 && returnedIp.includes(':');

  return {
    success: success,
    port: p.port,
    expectedIpv6: p.outboundIpv6,
    returnedIp: returnedIp || res.stderr || 'Không có phản hồi (Timeout)',
    latencyMs: latency
  };
}

module.exports = {
  addProxies,
  rotateProxyIp,
  rotateAllProxies,
  deleteProxy,
  deleteAllProxies,
  applyAndReload,
  testProxy,
  makeFullIpv6,
  generateRandomIpv6Suffix
};
