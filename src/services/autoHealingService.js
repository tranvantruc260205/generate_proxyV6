const system = require('./systemService');
const storage = require('./storageService');
const proxyService = require('./proxyService');
const os = require('os');

let intervalTimer = null;
let healingLogs = [];

function addHealingLog(message) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message: message
  };
  healingLogs.unshift(logEntry);
  if (healingLogs.length > 50) healingLogs.pop();
  console.log(`[AutoHealing] ${message}`);
}

async function checkAndHeal() {
  if (os.platform() !== 'linux') return;

  const settings = storage.getSettings();
  if (!settings.autoHealing) return;

  try {
    const iface = await system.getDefaultInterface();
    const ipv6Info = await system.getIpv6Prefix(iface);

    if (!ipv6Info.found || !ipv6Info.prefix) {
      addHealingLog('[CẢNH BÁO] Không phát hiện thấy dải IPv6 trên card mạng lúc này.');
      return;
    }

    const currentPrefix = ipv6Info.prefix;
    const lastPrefix = settings.lastDetectedPrefix;

    if (!lastPrefix) {
      // Lần đầu ghi nhận prefix
      storage.saveSettings({ lastDetectedPrefix: currentPrefix });
      addHealingLog(`Ghi nhận dải IPv6 ban đầu: ${currentPrefix}::/64`);
      return;
    }

    if (currentPrefix !== lastPrefix) {
      addHealingLog(`[PHÁT HIỆN ĐỔI IP] Dải IPv6 đã thay đổi từ ${lastPrefix} sang ${currentPrefix}! Đang tự động sửa chữa...`);

      // 1. Cập nhật route loopback
      await system.runCmd(`ip -6 route del local ${lastPrefix}::/64 dev lo 2>/dev/null || true`);
      await system.runCmd(`ip -6 route add local ${currentPrefix}::/64 dev lo 2>/dev/null || true`);

      // 2. Cập nhật ndppd.conf
      const ndppdConf = `
route-ttl 30000
proxy ${iface} {
   router yes
   timeout 500
   ttl 30000
   rule ${currentPrefix}::/64 {
      auto
   }
}
`;
      require('fs').writeFileSync('/etc/ndppd.conf', ndppdConf.trim(), 'utf-8');
      await system.runCmd('systemctl restart ndppd 2>/dev/null || true');

      // 3. Cập nhật lại toàn bộ danh sách proxy sang prefix mới
      const proxies = storage.getProxies();
      for (let p of proxies) {
        const suffix = proxyService.generateRandomIpv6Suffix();
        p.prefix = currentPrefix;
        p.outboundIpv6 = `${currentPrefix}::${suffix}`;
        p.lastRotatedAt = new Date().toISOString();
      }
      storage.saveProxies(proxies);
      storage.saveSettings({ lastDetectedPrefix: currentPrefix });

      // 4. Reload 3proxy
      await proxyService.applyAndReload();

      addHealingLog(`[HOÀN TẤT] Đã cập nhật xong tất cả Proxy sang dải IPv6 mới: ${currentPrefix}::/64!`);
    }
  } catch (err) {
    addHealingLog(`[LỖI] Xảy ra lỗi khi tự động kiểm tra IPv6: ${err.message}`);
  }
}

function startAutoHealing(intervalMinutes = 5) {
  if (intervalTimer) clearInterval(intervalTimer);

  addHealingLog(`Khởi động dịch vụ tự động giám sát dải IPv6 (Chu kỳ: ${intervalMinutes} phút)`);
  
  // Chạy ngay lần đầu
  checkAndHeal();

  // Định kỳ
  intervalTimer = setInterval(() => {
    checkAndHeal();
  }, intervalMinutes * 60 * 1000);
}

function stopAutoHealing() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
  addHealingLog('Đã tạm dừng dịch vụ tự động giám sát IPv6.');
}

function getHealingLogs() {
  return healingLogs;
}

module.exports = {
  startAutoHealing,
  stopAutoHealing,
  checkAndHeal,
  getHealingLogs
};
