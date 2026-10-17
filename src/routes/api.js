const express = require('express');
const router = express.Router();
const system = require('../services/systemService');
const proxyService = require('../services/proxyService');
const storage = require('../services/storageService');
const autoHealing = require('../services/autoHealingService');

// 1. Lấy thông tin trạng thái hệ thống
router.get('/system/status', async (req, res) => {
  try {
    const status = await system.checkSystemStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Chạy 1-Click Auto Setup với Server-Sent Events (SSE) để stream log trực tiếp
router.get('/system/setup/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (type, message) => {
    res.write(`data: ${JSON.stringify({ type, message, timestamp: new Date().toLocaleTimeString() })}\n\n`);
  };

  system.runAutoSetup(
    (logMsg) => {
      sendEvent('log', logMsg);
    },
    (success) => {
      sendEvent('done', success ? 'SUCCESS' : 'FAILED');
      res.end();
    }
  );

  req.on('close', () => {
    res.end();
  });
});

// 3. Lấy danh sách proxies
router.get('/proxies', (req, res) => {
  try {
    const proxies = storage.getProxies();
    const lanIp = system.getLanIp();
    res.json({ success: true, lanIp, count: proxies.length, data: proxies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Thêm proxies mới (Đơn lẻ hoặc Hàng loạt)
router.post('/proxies', async (req, res) => {
  try {
    const { count, startPort, type, username, password, prefix } = req.body;
    const added = await proxyService.addProxies({
      count: parseInt(count, 10) || 1,
      startPort: startPort ? parseInt(startPort, 10) : undefined,
      type: type || 'http',
      username: username || '',
      password: password || '',
      prefix: prefix
    });

    res.json({ success: true, message: `Đã tạo thành công ${added.length} Proxy!`, data: added });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 5. Xoay IP (Rotate) cho 1 proxy cụ thể
router.post('/proxies/:id/rotate', async (req, res) => {
  try {
    const updated = await proxyService.rotateProxyIp(req.params.id);
    res.json({ success: true, message: `Đã đổi sang IPv6 mới: ${updated.outboundIpv6}`, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 6. Xoay IP cho TOÀN BỘ proxies
router.post('/proxies/rotate-all', async (req, res) => {
  try {
    const list = await proxyService.rotateAllProxies();
    res.json({ success: true, message: `Đã xoay IPv6 cho toàn bộ ${list.length} Proxy!`, count: list.length });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 7. Xóa 1 proxy
router.delete('/proxies/:id', async (req, res) => {
  try {
    await proxyService.deleteProxy(req.params.id);
    res.json({ success: true, message: 'Đã xóa Proxy thành công' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 8. Xóa toàn bộ proxies
router.delete('/proxies', async (req, res) => {
  try {
    await proxyService.deleteAllProxies();
    res.json({ success: true, message: 'Đã xóa toàn bộ danh sách Proxy' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 9. Test kết nối của 1 Proxy
router.post('/proxies/:id/test', async (req, res) => {
  try {
    const result = await proxyService.testProxy(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 10. Export danh sách Proxy ra file TXT
router.get('/proxies/export', (req, res) => {
  try {
    const proxies = storage.getProxies();
    const lanIp = system.getLanIp();
    const format = req.query.format || 'standard'; // standard: ip:port hoặc ip:port:user:pass

    const lines = proxies.map(p => {
      if (p.username && p.password) {
        if (format === 'url') {
          return `${p.type}://${p.username}:${p.password}@${lanIp}:${p.port}`;
        }
        return `${lanIp}:${p.port}:${p.username}:${p.password}`;
      }
      if (format === 'url') {
        return `${p.type}://${lanIp}:${p.port}`;
      }
      return `${lanIp}:${p.port}`;
    });

    const content = lines.join('\r\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="proxies_export.txt"');
    res.send(content);
  } catch (err) {
    res.status(500).send(`Lỗi khi xuất file: ${err.message}`);
  }
});

// 11. Cài đặt & Auto Healing
router.get('/settings', (req, res) => {
  res.json({ success: true, data: storage.getSettings() });
});

router.post('/settings', (req, res) => {
  try {
    const updated = storage.saveSettings(req.body);
    if (req.body.checkIntervalMinutes || req.body.autoHealing !== undefined) {
      if (updated.autoHealing) {
        autoHealing.startAutoHealing(updated.checkIntervalMinutes);
      } else {
        autoHealing.stopAutoHealing();
      }
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/auto-healing/logs', (req, res) => {
  res.json({ success: true, data: autoHealing.getHealingLogs() });
});

module.exports = router;
