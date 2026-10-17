// State quản lý toàn cục
let currentLanIp = '127.0.0.1';
let currentPrefix = null;
let proxiesList = [];
let isBulkMode = false;

// Khởi chạy khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  loadSystemStatus();
  loadProxies();
  loadSettings();

  // Nút refresh chung
  document.getElementById('btn-refresh-all').addEventListener('click', () => {
    loadSystemStatus();
    loadProxies();
    showToast('Đã làm mới dữ liệu!', 'info');
  });

  // Tự động làm mới status định kỳ mỗi 15 giây
  setInterval(loadSystemStatus, 15000);
});

// Chuyển Tab
function switchTab(tabName) {
  const tabs = ['proxies', 'system', 'settings'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const content = document.getElementById(`tab-content-${t}`);
    if (t === tabName) {
      btn.classList.add('border-emerald-500', 'text-emerald-400');
      btn.classList.remove('border-transparent', 'text-slate-400');
      content.classList.remove('hidden');
    } else {
      btn.classList.remove('border-emerald-500', 'text-emerald-400');
      btn.classList.add('border-transparent', 'text-slate-400');
      content.classList.add('hidden');
    }
  });
  lucide.createIcons();

  if (tabName === 'settings') {
    loadHealingLogs();
  }
}

// 1. Tải và hiển thị thông tin hệ thống & Checklist
async function loadSystemStatus() {
  try {
    const res = await fetch('/api/system/status');
    const json = await res.json();
    if (!json.success) return;

    const data = json.data;
    currentLanIp = data.network.lanIp || '127.0.0.1';
    currentPrefix = data.network.ipv6?.prefix;

    // Cập nhật header & cards
    document.getElementById('badge-lan-ip').textContent = currentLanIp;
    document.getElementById('stat-lan-ip').textContent = currentLanIp;
    document.getElementById('stat-iface').textContent = `Card mạng: ${data.network.interface || '--'}`;

    const prefixEl = document.getElementById('stat-prefix');
    if (data.network.ipv6?.found) {
      prefixEl.textContent = data.network.ipv6.cidr;
      prefixEl.title = `Prefix: ${data.network.ipv6.cidr}`;
    } else {
      prefixEl.textContent = 'Chưa có IPv6';
      prefixEl.title = 'Chưa phát hiện IPv6 từ nhà mạng trên card mạng';
    }

    // RAM
    const ram = data.os.ram;
    document.getElementById('stat-ram-text').textContent = `${ram.usedMb} / ${ram.totalMb} MB (${ram.usagePercent}%)`;
    document.getElementById('stat-ram-bar').style.width = `${ram.usagePercent}%`;

    // Render Checklist trong Tab Chuẩn đoán
    renderChecklist(data.checks, data.isReady);

  } catch (err) {
    console.error('Lỗi khi tải system status:', err);
  }
}

function renderChecklist(checks, isReady) {
  const container = document.getElementById('system-checks-container');
  container.innerHTML = '';

  const checkKeys = Object.keys(checks);
  checkKeys.forEach(key => {
    const item = checks[key];
    const isPass = item.pass;

    const card = document.createElement('div');
    card.className = `p-4 rounded-xl border flex items-start space-x-3.5 transition-all ${
      isPass ? 'bg-slate-900/60 border-slate-800' : 'bg-red-950/20 border-red-900/40'
    }`;

    const iconHtml = isPass
      ? `<div class="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5"><i data-lucide="check-circle" class="w-4 h-4"></i></div>`
      : `<div class="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center shrink-0 mt-0.5"><i data-lucide="alert-circle" class="w-4 h-4"></i></div>`;

    card.innerHTML = `
      ${iconHtml}
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold text-white">${item.label}</span>
          <span class="text-[11px] font-medium px-2 py-0.5 rounded-full ${
            isPass ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          }">${isPass ? 'ĐẠT' : 'CHƯA ĐẠT'}</span>
        </div>
        <p class="text-xs text-slate-400 mt-0.5 truncate">${item.detail}</p>
      </div>
    `;
    container.appendChild(card);
  });

  lucide.createIcons();
}

// 2. Chạy 1-Click Auto Setup với Server-Sent Events (SSE)
function startAutoSetup() {
  const terminal = document.getElementById('setup-terminal');
  const btn = document.getElementById('btn-auto-setup');

  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>ĐANG CÀI ĐẶT...</span>`;
  lucide.createIcons();

  terminal.innerHTML = '<p class="text-amber-400">> Đang kết nối tới trình cài đặt hệ thống...</p>';

  const eventSource = new EventSource('/api/system/setup/stream');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const p = document.createElement('p');

      if (data.type === 'log') {
        p.textContent = `[${data.timestamp}] ${data.message}`;
        if (data.message.includes('[SUCCESS]')) {
          p.className = 'text-emerald-400 font-bold';
        } else if (data.message.includes('[ERROR]') || data.message.includes('[FATAL]')) {
          p.className = 'text-red-400 font-bold';
        } else if (data.message.includes('[CẢNH BÁO]')) {
          p.className = 'text-amber-400';
        }
      } else if (data.type === 'done') {
        eventSource.close();
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="zap" class="w-4 h-4 fill-slate-950"></i><span>TỰ ĐỘNG CÀI ĐẶT 1-CLICK</span>`;
        lucide.createIcons();

        if (data.message === 'SUCCESS') {
          showToast('Cài đặt hệ thống thành công 100%!', 'success');
        } else {
          showToast('Cài đặt hoàn tất nhưng có cảnh báo hoặc lỗi.', 'warning');
        }

        // Tải lại status và danh sách
        setTimeout(loadSystemStatus, 1000);
      }

      terminal.appendChild(p);
      terminal.scrollTop = terminal.scrollHeight;
    } catch (e) {
      console.error(e);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="zap" class="w-4 h-4 fill-slate-950"></i><span>TỰ ĐỘNG CÀI ĐẶT 1-CLICK</span>`;
    lucide.createIcons();
    const p = document.createElement('p');
    p.className = 'text-red-400';
    p.textContent = '> Mất kết nối tới tiến trình cài đặt.';
    terminal.appendChild(p);
  };
}

function clearConsole() {
  document.getElementById('setup-terminal').innerHTML = '<p class="text-slate-400">> Terminal đã được dọn sạch.</p>';
}

// 3. Tải danh sách Proxy
async function loadProxies() {
  try {
    const res = await fetch('/api/proxies');
    const json = await res.json();
    if (!json.success) return;

    proxiesList = json.data || [];
    currentLanIp = json.lanIp || currentLanIp;

    document.getElementById('stat-proxy-count').textContent = proxiesList.length;
    renderProxyTable(proxiesList);
  } catch (err) {
    console.error('Lỗi khi tải danh sách proxy:', err);
  }
}

function renderProxyTable(list) {
  const tbody = document.getElementById('proxy-table-body');
  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-12 text-center text-slate-400 font-sans">
          <div class="flex flex-col items-center justify-center space-y-3">
            <i data-lucide="inbox" class="w-10 h-10 text-slate-600"></i>
            <span>Chưa có Proxy nào được tạo. Hãy bấm nút "Tạo Proxy Mới" ở trên!</span>
          </div>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = list.map(p => {
    const hasAuth = p.username && p.password;
    const authText = hasAuth ? `${p.username}:******` : '<span class="text-slate-400">Không mật khẩu</span>';
    const proxyConnectString = hasAuth
      ? `${currentLanIp}:${p.port}:${p.username}:${p.password}`
      : `${currentLanIp}:${p.port}`;

    return `
      <tr class="hover:bg-slate-800/40 transition-colors" id="row-proxy-${p.id}">
        <!-- Port -->
        <td class="py-3 px-4 font-bold text-white text-sm">
          ${p.port}
        </td>

        <!-- Type -->
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
            p.type === 'socks5' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
          }">
            ${p.type}
          </span>
        </td>

        <!-- Inbound -->
        <td class="py-3 px-4 text-slate-300">
          <span class="font-mono text-emerald-400">${currentLanIp}:${p.port}</span>
        </td>

        <!-- Outbound IPv6 -->
        <td class="py-3 px-4 text-slate-300 max-w-xs truncate" title="${p.outboundIpv6}">
          <span class="text-white">${p.outboundIpv6}</span>
        </td>

        <!-- Auth -->
        <td class="py-3 px-4 text-slate-300">
          ${authText}
        </td>

        <!-- Test Status -->
        <td class="py-3 px-4 text-center" id="test-col-${p.id}">
          <button onclick="testProxy('${p.id}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-sans transition-colors inline-flex items-center gap-1">
            <i data-lucide="activity" class="w-3 h-3"></i>
            <span>Test</span>
          </button>
        </td>

        <!-- Actions -->
        <td class="py-3 px-4 text-right space-x-1 whitespace-nowrap">
          <!-- Rotate -->
          <button onclick="rotateProxy('${p.id}')" class="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors" title="Đổi sang IPv6 mới ngay">
            <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
          </button>

          <!-- Copy -->
          <button onclick="copyToClipboard('${proxyConnectString}')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors" title="Copy proxy kết nối">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          </button>

          <!-- Delete -->
          <button onclick="deleteProxy('${p.id}')" class="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors" title="Xóa port này">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

// 4. Modal Tạo Proxy
function openCreateModal(bulk = false) {
  isBulkMode = bulk;
  const modal = document.getElementById('create-modal');
  const title = document.getElementById('modal-title');
  const countGroup = document.getElementById('form-group-count');
  const countInput = document.getElementById('input-count');

  if (bulk) {
    title.innerHTML = `<i data-lucide="layers" class="w-5 h-5 text-emerald-400"></i><span>Tạo Proxy Hàng Loạt (Bulk)</span>`;
    countGroup.classList.remove('hidden');
    countInput.value = 10;
  } else {
    title.innerHTML = `<i data-lucide="plus-circle" class="w-5 h-5 text-emerald-400"></i><span>Tạo 1 Proxy Mới</span>`;
    countGroup.classList.add('hidden');
    countInput.value = 1;
  }

  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeCreateModal() {
  document.getElementById('create-modal').classList.add('hidden');
}

async function handleCreateProxy(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-submit-proxy');
  btn.disabled = true;
  btn.textContent = 'Đang xử lý...';

  const count = parseInt(document.getElementById('input-count').value, 10) || 1;
  const startPort = document.getElementById('input-start-port').value;
  const type = document.querySelector('input[name="proxy-type"]:checked').value;
  const username = document.getElementById('input-username').value.trim();
  const password = document.getElementById('input-password').value.trim();

  try {
    const res = await fetch('/api/proxies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count, startPort, type, username, password })
    });
    const json = await res.json();

    if (json.success) {
      showToast(json.message, 'success');
      closeCreateModal();
      loadProxies();
      // Reset form
      document.getElementById('create-proxy-form').reset();
    } else {
      showToast(json.error || 'Lỗi khi tạo proxy', 'error');
    }
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Tạo Ngay';
  }
}

// 5. Xoay IP (Rotate)
async function rotateProxy(id) {
  try {
    showToast('Đang tạo IPv6 mới...', 'info');
    const res = await fetch(`/api/proxies/${id}/rotate`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast(`Đã xoay IP thành công!`, 'success');
      loadProxies();
    } else {
      showToast(json.error || 'Lỗi khi xoay IP', 'error');
    }
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  }
}

async function rotateAllProxies() {
  if (proxiesList.length === 0) {
    showToast('Chưa có proxy nào để xoay IP', 'warning');
    return;
  }
  if (!confirm(`Bạn có chắc muốn đổi IPv6 ngẫu nhiên mới cho toàn bộ ${proxiesList.length} proxy?`)) return;

  try {
    showToast('Đang xoay IP cho toàn bộ danh sách...', 'info');
    const res = await fetch('/api/proxies/rotate-all', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast(json.message, 'success');
      loadProxies();
    } else {
      showToast(json.error || 'Lỗi khi xoay IP', 'error');
    }
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  }
}

// 6. Test Proxy
async function testProxy(id) {
  const col = document.getElementById(`test-col-${id}`);
  if (!col) return;

  col.innerHTML = `<span class="text-amber-400 font-mono text-[11px] animate-pulse">Testing...</span>`;

  try {
    const res = await fetch(`/api/proxies/${id}/test`, { method: 'POST' });
    const json = await res.json();

    if (json.success && json.data.success) {
      col.innerHTML = `
        <span class="inline-flex items-center gap-1 text-emerald-400 font-mono text-[11px]" title="Outbound IP: ${json.data.returnedIp}">
          <i data-lucide="check" class="w-3.5 h-3.5"></i>
          <span>${json.data.latencyMs}ms</span>
        </span>
      `;
    } else {
      col.innerHTML = `
        <span class="inline-flex items-center gap-1 text-red-400 font-mono text-[11px]" title="${json.data?.returnedIp || json.error || 'Timeout'}">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
          <span>Lỗi</span>
        </span>
      `;
    }
    lucide.createIcons();
  } catch (err) {
    col.innerHTML = `<span class="text-red-400 text-[11px]">Lỗi test</span>`;
  }
}

// 7. Xóa Proxy
async function deleteProxy(id) {
  if (!confirm('Bạn có chắc muốn xóa cổng Proxy này?')) return;
  try {
    const res = await fetch(`/api/proxies/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast('Đã xóa thành công', 'success');
      loadProxies();
    }
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  }
}

async function deleteAllProxies() {
  if (proxiesList.length === 0) return;
  if (!confirm('CẢNH BÁO: Bạn có chắc muốn xóa TẤT CẢ Proxy đang chạy?')) return;

  try {
    const res = await fetch('/api/proxies', { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast('Đã xóa toàn bộ Proxy', 'success');
      loadProxies();
    }
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  }
}

// 8. Xuất file TXT
function exportProxies(format = 'standard') {
  if (proxiesList.length === 0) {
    showToast('Chưa có proxy nào để xuất file', 'warning');
    return;
  }
  window.open(`/api/proxies/export?format=${format}`, '_blank');
}

// 9. Cài đặt & Auto Healing
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (!json.success) return;

    document.getElementById('setting-auto-healing').checked = json.data.autoHealing;
    document.getElementById('setting-interval').value = json.data.checkIntervalMinutes || 5;
    document.getElementById('setting-lan-only').checked = json.data.allowLanOnly;
  } catch (e) {}
}

async function saveSettings() {
  const autoHealing = document.getElementById('setting-auto-healing').checked;
  const checkIntervalMinutes = parseInt(document.getElementById('setting-interval').value, 10) || 5;
  const allowLanOnly = document.getElementById('setting-lan-only').checked;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoHealing, checkIntervalMinutes, allowLanOnly })
    });
    const json = await res.json();
    if (json.success) {
      showToast('Đã lưu cấu hình thành công!', 'success');
      loadHealingLogs();
    }
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  }
}

async function loadHealingLogs() {
  try {
    const res = await fetch('/api/auto-healing/logs');
    const json = await res.json();
    const container = document.getElementById('healing-logs-container');

    if (!json.success || !json.data || json.data.length === 0) {
      container.innerHTML = '<p class="text-slate-400">Chưa có sự kiện đổi IP nào được ghi nhận.</p>';
      return;
    }

    container.innerHTML = json.data.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      return `<p><span class="text-slate-400">[${time}]</span> ${log.message}</p>`;
    }).join('');
  } catch (e) {}
}

// 10. Tiện ích Copy & Toast
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Đã copy: ${text}`, 'success');
  }).catch(() => {
    showToast('Không thể sao chép vào clipboard', 'error');
  });
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const msg = document.getElementById('toast-message');

  msg.textContent = message;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = '<i data-lucide="check-circle" class="w-5 h-5 text-emerald-400"></i>';
    toast.className = 'fixed bottom-6 right-6 max-w-sm bg-slate-900 border border-emerald-500/40 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-3 transform transition-all duration-300 z-50';
  } else if (type === 'error') {
    iconSvg = '<i data-lucide="alert-triangle" class="w-5 h-5 text-red-400"></i>';
    toast.className = 'fixed bottom-6 right-6 max-w-sm bg-slate-900 border border-red-500/40 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-3 transform transition-all duration-300 z-50';
  } else if (type === 'warning') {
    iconSvg = '<i data-lucide="alert-circle" class="w-5 h-5 text-amber-400"></i>';
    toast.className = 'fixed bottom-6 right-6 max-w-sm bg-slate-900 border border-amber-500/40 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-3 transform transition-all duration-300 z-50';
  } else {
    iconSvg = '<i data-lucide="info" class="w-5 h-5 text-blue-400"></i>';
    toast.className = 'fixed bottom-6 right-6 max-w-sm bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-3 transform transition-all duration-300 z-50';
  }

  icon.innerHTML = iconSvg;
  lucide.createIcons();

  // Hiện toast
  toast.classList.remove('translate-y-24', 'opacity-0');

  setTimeout(() => {
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 3500);
}
