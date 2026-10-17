const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const apiRouter = require('./src/routes/api');
const system = require('./src/services/systemService');
const autoHealing = require('./src/services/autoHealingService');
const storage = require('./src/services/storageService');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ giao diện tĩnh Frontend
app.use(express.static(path.join(__dirname, 'public')));

// Gắn API routes
app.use('/api', apiRouter);

// Fallback route cho SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer() {
  const settings = await storage.getSettings();
  const PORT = process.env.PORT || settings.webPort || 8080;

  app.listen(PORT, '0.0.0.0', () => {
    const lanIp = system.getLanIp();
    console.log('\n======================================================');
    console.log('🚀 MiniPC IPv6 Proxy Manager đã sẵn sàng hoạt động!');
    console.log(`🌐 Cơ sở dữ liệu: SQLite (Chuẩn SQL ACID)`);
    console.log(`🌐 Truy cập Dashboard từ máy tính chính cùng mạng LAN:`);
    console.log(`👉 http://${lanIp}:${PORT}`);
    console.log(`👉 http://localhost:${PORT} (Truy cập nội bộ trên Mini PC)`);
    console.log('======================================================\n');

    // Bắt đầu background worker tự động thích ứng dải IPv6
    if (settings.autoHealing) {
      autoHealing.startAutoHealing(settings.checkIntervalMinutes || 5);
    }
  });
}

startServer().catch((err) => {
  console.error('❌ Lỗi khởi động Web Server:', err);
});
