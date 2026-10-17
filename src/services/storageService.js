const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROXIES_FILE = path.join(DATA_DIR, 'proxies.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Đảm bảo thư mục data luôn tồn tại
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getProxies() {
  try {
    if (!fs.existsSync(PROXIES_FILE)) {
      fs.writeFileSync(PROXIES_FILE, JSON.stringify([], null, 2));
      return [];
    }
    const data = fs.readFileSync(PROXIES_FILE, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Lỗi khi đọc file proxies.json:', err.message);
    return [];
  }
}

function saveProxies(proxies) {
  try {
    fs.writeFileSync(PROXIES_FILE, JSON.stringify(proxies, null, 2));
    return true;
  } catch (err) {
    console.error('Lỗi khi ghi file proxies.json:', err.message);
    return false;
  }
}

function getSettings() {
  const defaultSettings = {
    webPort: 8080,
    proxyStartPort: 10000,
    authRequired: false,
    defaultUsername: '',
    defaultPassword: '',
    autoHealing: true,
    checkIntervalMinutes: 5,
    allowLanOnly: true,
    lastDetectedPrefix: ''
  };

  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
      return defaultSettings;
    }
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return { ...defaultSettings, ...JSON.parse(data || '{}') };
  } catch (err) {
    console.error('Lỗi khi đọc file settings.json:', err.message);
    return defaultSettings;
  }
}

function saveSettings(settings) {
  try {
    const current = getSettings();
    const updated = { ...current, ...settings };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
    return updated;
  } catch (err) {
    console.error('Lỗi khi ghi file settings.json:', err.message);
    return null;
  }
}

module.exports = {
  getProxies,
  saveProxies,
  getSettings,
  saveSettings
};
