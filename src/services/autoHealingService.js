const system = require('./systemService');
const storage = require('./storageService');
const proxyService = require('./proxyService');
const os = require('os');

let intervalTimer = null;

async function logHealing(message) {
  console.log(`[AutoHealing] ${message}`);
  try {
    await storage.addHealingLog(message);
  } catch (e) {
    console.error('Lỗi khi ghi log AutoHealing vào DB:', e.message);
  }
}

async function checkAndHeal() {
  if (os.platform() !== 'linux') return;

  const settings = await storage.getSettings();
  if (!settings.autoHealing) return;

  try {
    const iface = await system.getDefaultInterface();
    const ipv6Info = await system.getIpv6Prefix(iface);

    if (!ipv6Info.found || !ipv6Info.prefix) {
      await logHealing('[CẢNH BÁO] Không phát hiện thấy dải IPv6 trên card mạng lúc này.');
      return;
    }

    const currentPrefix = ipv6Info.prefix;
    const lastPrefix = settings.lastDetectedPrefix;

    if (!lastPrefix) {
      // Lần đầu ghi nhận prefix
      await storage.saveSettings({ lastDetectedPrefix: currentPrefix });
      await logHealing(`Ghi nhận dải IPv6 ban đầu: ${currentPrefix}::/64`);
      return;
    }

    if (currentPrefix !== lastPrefix) {
      await logHealing(`[PHÁT HIỆN ĐỔI IP] Dải IPv6 đã thay đổi từ ${lastPrefix} sang ${currentPrefix}! Đang tự động sửa chữa...`);

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

      // 3. Cập nhật lại toàn bộ danh sách proxy trong SQLite sang prefix mới
      await storage.updateAllProxiesOutbound((proxy) => {
        const suffix = proxyService.generateRandomIpv6Suffix();
        return {
          prefix: currentPrefix,
          newIpv6: `${currentPrefix}::${suffix}`
        };
      });

      await storage.saveSettings({ lastDetectedPrefix: currentPrefix });

      // 4. Reload 3proxy
      await proxyService.applyAndReload();

      await logHealing(`[HOÀN TẤT] Đã cập nhật xong tất cả Proxy sang dải IPv6 mới: ${currentPrefix}::/64!`);
    }
  } catch (err) {
    await logHealing(`[LỖI] Xảy ra lỗi khi tự động kiểm tra IPv6: ${err.message}`);
  }
}

async function startAutoHealing(intervalMinutes = 5) {
  if (intervalTimer) clearInterval(intervalTimer);

  await logHealing(`Khởi động dịch vụ tự động giám sát dải IPv6 (Chu kỳ: ${intervalMinutes} phút)`);
  
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
  logHealing('Đã tạm dừng dịch vụ tự động giám sát IPv6.');
}

async function getHealingLogs() {
  return storage.getHealingLogs(50);
}

module.exports = {
  startAutoHealing,
  stopAutoHealing,
  checkAndHeal,
  getHealingLogs
};
