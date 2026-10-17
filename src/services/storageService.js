const { queryAll, queryGet, queryRun, db } = require('./db');

/**
 * Format 1 dòng từ DB sang object chuẩn của ứng dụng
 */
function mapProxyRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    port: row.port,
    type: row.type,
    outboundIpv6: row.outbound_ipv6,
    prefix: row.prefix,
    username: row.username || '',
    password: row.password || '',
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    lastRotatedAt: row.last_rotated_at
  };
}

/**
 * Lấy toàn bộ danh sách Proxy từ bảng SQLite (sắp xếp theo port tăng dần)
 */
async function getAllProxies() {
  const sql = `SELECT * FROM proxies ORDER BY port ASC`;
  const rows = await queryAll(sql);
  return rows.map(mapProxyRow);
}

/**
 * Lấy 1 proxy theo ID
 */
async function getProxyById(id) {
  const sql = `SELECT * FROM proxies WHERE id = ?`;
  const row = await queryGet(sql, [id]);
  return mapProxyRow(row);
}

/**
 * Thêm 1 hoặc nhiều proxy vào SQL bằng Transaction
 */
async function insertProxies(proxiesList) {
  if (!proxiesList || proxiesList.length === 0) return [];

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      const stmt = db.prepare(`
        INSERT INTO proxies (id, port, type, outbound_ipv6, prefix, username, password, enabled, created_at, last_rotated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const p of proxiesList) {
        stmt.run(
          p.id,
          p.port,
          p.type,
          p.outboundIpv6,
          p.prefix,
          p.username || '',
          p.password || '',
          p.enabled ? 1 : 0,
          p.createdAt,
          p.lastRotatedAt
        );
      }

      stmt.finalize();

      db.run('COMMIT', (err) => {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
        } else {
          resolve(proxiesList);
        }
      });
    });
  });
}

/**
 * Cập nhật IPv6 mới cho 1 proxy (Rotate)
 */
async function updateProxyOutbound(id, newOutboundIpv6, prefix) {
  const now = new Date().toISOString();
  const sql = `
    UPDATE proxies 
    SET outbound_ipv6 = ?, prefix = ?, last_rotated_at = ?
    WHERE id = ?
  `;
  await queryRun(sql, [newOutboundIpv6, prefix, now, id]);
  return getProxyById(id);
}

/**
 * Xoay toàn bộ proxies trong Database
 */
async function updateAllProxiesOutbound(updaterCallback) {
  const currentProxies = await getAllProxies();
  if (currentProxies.length === 0) return [];

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      const stmt = db.prepare(`
        UPDATE proxies 
        SET outbound_ipv6 = ?, prefix = ?, last_rotated_at = ?
        WHERE id = ?
      `);

      const now = new Date().toISOString();
      const updatedList = [];

      for (const p of currentProxies) {
        const { newIpv6, prefix } = updaterCallback(p);
        p.outboundIpv6 = newIpv6;
        p.prefix = prefix;
        p.lastRotatedAt = now;
        stmt.run(newIpv6, prefix, now, p.id);
        updatedList.push(p);
      }

      stmt.finalize();

      db.run('COMMIT', (err) => {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
        } else {
          resolve(updatedList);
        }
      });
    });
  });
}

/**
 * Xóa 1 proxy theo ID
 */
async function deleteProxyById(id) {
  const sql = `DELETE FROM proxies WHERE id = ?`;
  await queryRun(sql, [id]);
  return true;
}

/**
 * Xóa toàn bộ proxies
 */
async function deleteAllProxies() {
  const sql = `DELETE FROM proxies`;
  await queryRun(sql);
  return true;
}

/**
 * Lấy toàn bộ Settings từ bảng settings
 */
async function getSettings() {
  const sql = `SELECT key, value FROM settings`;
  const rows = await queryAll(sql);
  
  const settingsObj = {
    webPort: 8080,
    proxyStartPort: 10000,
    authRequired: false,
    autoHealing: true,
    checkIntervalMinutes: 5,
    allowLanOnly: true,
    lastDetectedPrefix: ''
  };

  for (const r of rows) {
    if (r.key === 'autoHealing' || r.key === 'authRequired' || r.key === 'allowLanOnly') {
      settingsObj[r.key] = r.value === 'true' || r.value === '1';
    } else if (r.key === 'webPort' || r.key === 'proxyStartPort' || r.key === 'checkIntervalMinutes') {
      settingsObj[r.key] = parseInt(r.value, 10);
    } else {
      settingsObj[r.key] = r.value;
    }
  }

  return settingsObj;
}

/**
 * Lưu Settings vào SQLite
 */
async function saveSettings(settingsObj) {
  const keys = Object.keys(settingsObj);
  for (const k of keys) {
    const val = String(settingsObj[k]);
    await queryRun(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [k, val]
    );
  }
  return getSettings();
}

/**
 * Thêm 1 dòng log Auto Healing
 */
async function addHealingLog(message) {
  const now = new Date().toISOString();
  await queryRun(`INSERT INTO healing_logs (timestamp, message) VALUES (?, ?)`, [now, message]);
  // Giữ lại 100 log gần nhất
  await queryRun(`
    DELETE FROM healing_logs WHERE id NOT IN (
      SELECT id FROM healing_logs ORDER BY id DESC LIMIT 100
    )
  `);
}

/**
 * Lấy các dòng log Auto Healing gần nhất
 */
async function getHealingLogs(limit = 50) {
  const sql = `SELECT timestamp, message FROM healing_logs ORDER BY id DESC LIMIT ?`;
  return queryAll(sql, [limit]);
}

module.exports = {
  getAllProxies,
  getProxyById,
  insertProxies,
  updateProxyOutbound,
  updateAllProxiesOutbound,
  deleteProxyById,
  deleteAllProxies,
  getSettings,
  saveSettings,
  addHealingLog,
  getHealingLogs
};
