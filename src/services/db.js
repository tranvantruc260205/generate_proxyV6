const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');

// Đảm bảo thư mục data tồn tại
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Khởi tạo kết nối SQLite database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Lỗi kết nối SQLite Database:', err.message);
  } else {
    console.log('✅ Đã kết nối thành công tới SQLite Database:', DB_PATH);
  }
});

// Helper chạy query dạng Promise cho SQL thuần
function queryRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function queryGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Khởi tạo các bảng SQL
function initDatabase() {
  db.serialize(() => {
    // 1. Bảng lưu trữ Proxies
    db.run(`
      CREATE TABLE IF NOT EXISTS proxies (
        id TEXT PRIMARY KEY,
        port INTEGER UNIQUE NOT NULL,
        type TEXT NOT NULL DEFAULT 'http',
        outbound_ipv6 TEXT NOT NULL,
        prefix TEXT NOT NULL,
        username TEXT DEFAULT '',
        password TEXT DEFAULT '',
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        last_rotated_at TEXT NOT NULL
      )
    `);

    // Tạo Index cho port để query cực nhanh
    db.run(`CREATE INDEX IF NOT EXISTS idx_proxies_port ON proxies(port)`);

    // 2. Bảng lưu cấu hình Settings (Key - Value)
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Khởi tạo cài đặt mặc định nếu chưa có
    const defaultSettings = [
      ['webPort', '8080'],
      ['proxyStartPort', '10000'],
      ['authRequired', 'false'],
      ['autoHealing', 'true'],
      ['checkIntervalMinutes', '5'],
      ['allowLanOnly', 'true'],
      ['lastDetectedPrefix', '']
    ];

    for (const [k, v] of defaultSettings) {
      db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [k, v]);
    }

    // 3. Bảng lưu lịch sử Auto Healing
    db.run(`
      CREATE TABLE IF NOT EXISTS healing_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        message TEXT NOT NULL
      )
    `);
  });
}

// Chạy khởi tạo bảng ngay khi load module
initDatabase();

module.exports = {
  db,
  queryRun,
  queryGet,
  queryAll
};

