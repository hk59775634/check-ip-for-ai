let PLATFORMS = [];
const API_BASE = window.API_BASE || '';

const grid = document.getElementById('platform-grid');
const progress = document.getElementById('progress');
const discoveryStatus = document.getElementById('ip-discovery-status');
let completed = 0;

function platformLink(platform) {
  if (!platform.url) return platform.name;
  return `<a href="${platform.url}" target="_blank" rel="noopener noreferrer" class="font-medium text-sm truncate text-slate-200 hover:text-indigo-300 hover:underline transition-colors">${platform.name}</a>`;
}

function createCard(platform) {
  const el = document.createElement('div');
  el.id = `card-${platform.id}`;
  el.className = 'glass rounded-xl p-4 flex items-center gap-3 card-pending animate-fade-in transition-all duration-300';
  el.innerHTML = `
    <span class="text-2xl">${platform.icon}</span>
    <div class="flex-1 min-w-0">
      <div class="truncate">${platformLink(platform)}</div>
      <div class="status-text text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
        <span class="inline-flex gap-0.5">
          <span class="w-1 h-1 rounded-full bg-indigo-400 animate-pulse-dot"></span>
          <span class="w-1 h-1 rounded-full bg-indigo-400 animate-pulse-dot" style="animation-delay:0.2s"></span>
          <span class="w-1 h-1 rounded-full bg-indigo-400 animate-pulse-dot" style="animation-delay:0.4s"></span>
        </span>
        检测中...
      </div>
    </div>
    <div class="status-badge w-8 h-8 rounded-lg flex items-center justify-center text-lg"></div>
  `;
  return el;
}

function updateCard(result) {
  const el = document.getElementById(`card-${result.id}`);
  if (!el) return;

  el.classList.remove('card-pending', 'card-ok', 'card-blocked', 'card-unknown');

  const statusEl = el.querySelector('.status-text');
  const badgeEl = el.querySelector('.status-badge');
  const ipNote = result.supportedIps?.length
    ? `<span class="block mt-0.5 font-mono text-green-300/80">${result.supportedIps.join(', ')}</span>`
    : '';

  if (result.status === 'ok') {
    el.classList.add('card-ok');
    statusEl.innerHTML = `<span class="text-green-400">区域支持</span>${ipNote}`;
    badgeEl.innerHTML = '✅';
    badgeEl.className = 'status-badge w-8 h-8 rounded-lg flex items-center justify-center text-lg bg-green-500/10';
  } else if (result.status === 'blocked') {
    el.classList.add('card-blocked');
    const reason = result.reason === 'region' ? '区域受限' : '网络不可达';
    statusEl.innerHTML = `<span class="text-red-400">${reason}</span>`;
    badgeEl.innerHTML = '❌';
    badgeEl.className = 'status-badge w-8 h-8 rounded-lg flex items-center justify-center text-lg bg-red-500/10';
  } else {
    el.classList.add('card-unknown');
    statusEl.innerHTML = '<span class="text-yellow-400">状态未知</span>';
    badgeEl.innerHTML = '❓';
    badgeEl.className = 'status-badge w-8 h-8 rounded-lg flex items-center justify-center text-lg bg-yellow-500/10';
  }

  completed++;
  progress.textContent = `${completed} / ${PLATFORMS.length}`;
}

const ROUTE_PRIORITY = ['China', 'Global', 'CF-v4', 'CF-v6', 'Dual', 'IPv4', 'IPv6'];

function shortRouteLabel(info) {
  const routes = info.routes?.length ? info.routes : (info.route ? [info.route] : []);
  const filtered = routes.filter((r) => !/^Proxy-\d+$/i.test(String(r)));
  for (const preferred of ROUTE_PRIORITY) {
    if (filtered.includes(preferred)) return preferred;
  }
  if (filtered.length) return filtered[0];

  const sources = info.sources?.length ? info.sources : (info.source ? [info.source] : []);
  for (const src of sources) {
    if (/IPIP/i.test(src)) return 'China';
    if (/ipinfo/i.test(src)) return 'Global';
    if (/Cloudflare IPv4|CF-v4/i.test(src)) return 'CF-v4';
    if (/Cloudflare IPv6|CF-v6/i.test(src)) return 'CF-v6';
    if (/IPv4/i.test(src)) return 'IPv4';
    if (/IPv6/i.test(src)) return 'IPv6';
  }
  return info.version || 'IP';
}

function ipSummaryLine(info) {
  const tag = shortRouteLabel(info);
  const tail = [info.asn, info.isp].filter(Boolean).join(' · ');
  return tail ? `${tag} ${tail}` : tag;
}

function routeLabel(info) {
  return shortRouteLabel(info);
}

function ipFullLine(info) {
  const loc = info.country && info.countryCode
    ? `${info.country} (${info.countryCode})`
    : (info.country || info.countryCode || '');
  const meta = ipSummaryLine(info);
  const parts = [loc, meta].filter(Boolean);
  const suffix = parts.length ? ` <span class="text-sm font-normal text-slate-400 font-sans">· ${parts.join(' · ')}</span>` : '';
  return `<span class="font-mono">${info.ip}</span>${suffix}`;
}

function updateIpInfo(data) {
  const ips = data.ips || [data];
  const splitNote = data.splitTunnel || ips.length > 1
    ? `<div class="text-xs text-amber-300/80 mt-2">检测到 ${ips.length} 个出口 IP（可能存在 IP 分流）</div>`
    : '';

  if (discoveryStatus) {
    discoveryStatus.innerHTML = ips.length > 1
      ? `多路由探测完成 · 发现 ${ips.length} 个出口 IP`
      : '多路由探测完成 · 单一出口 IP';
  }

  if (ips.length === 1) {
    document.getElementById('ip-address').innerHTML = ipFullLine(ips[0]) + splitNote;
    return;
  }

  document.getElementById('ip-address').innerHTML = ips
    .map((info) => `<div class="leading-7">${ipFullLine(info)}</div>`)
    .join('') + splitNote;
}

function setDiscoveryStatus(text) {
  if (discoveryStatus) discoveryStatus.textContent = text;
}

async function registerDiscoveredIps(discovered, probes = null) {
  const res = await fetch(`${API_BASE}/api/ips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ discovered, probes }),
  });
  if (!res.ok) throw new Error('Failed to register IPs');
  const data = await res.json();
  return data.token;
}

function startStream(token) {
  const source = new EventSource(`${API_BASE}/api/stream?token=${encodeURIComponent(token)}`);

  source.addEventListener('ip', (e) => {
    updateIpInfo(JSON.parse(e.data));
  });

  source.addEventListener('result', (e) => {
    updateCard(JSON.parse(e.data));
  });

  source.addEventListener('done', () => {
    source.close();
  });

  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) return;
    source.close();
    if (completed === 0) {
      fetch(`${API_BASE}/api/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discovered: window.__lastDiscovered || [],
          probes: window.__lastProbes || null,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          updateIpInfo(data);
          data.results.forEach(updateCard);
        })
        .catch(() => {
          document.getElementById('ip-address').textContent = '连接失败';
        });
    }
  };
}

async function probePlatformsFromBrowser(onProgress) {
  if (!window.PlatformProbe) return null;
  try {
    const res = await fetch(`${API_BASE}/api/platforms`);
    if (!res.ok) return null;
    const platforms = await res.json();
    if (onProgress) onProgress('正在从浏览器检测平台连通性...');
    return await window.PlatformProbe.probeAllPlatforms(platforms, onProgress);
  } catch {
    return null;
  }
}

async function loadPlatforms() {
  const res = await fetch(`${API_BASE}/api/platforms`);
  if (!res.ok) throw new Error('Failed to load platforms');
  PLATFORMS = await res.json();
}

async function main() {
  try {
    await loadPlatforms();
  } catch {
    setDiscoveryStatus('平台列表加载失败');
    return;
  }

  PLATFORMS.forEach((p) => grid.appendChild(createCard(p)));
  progress.textContent = `0 / ${PLATFORMS.length}`;

  let discovered = [];
  let probes = null;

  if (window.IpDiscovery) {
    try {
      setDiscoveryStatus('正在多路由探测出口 IP...');
      discovered = await window.IpDiscovery.discoverAllIps(setDiscoveryStatus);
      window.__lastDiscovered = discovered;
    } catch {
      setDiscoveryStatus('出口 IP 探测失败');
    }
  } else {
    setDiscoveryStatus('探测模块加载失败，使用服务器检测');
  }

  probes = await probePlatformsFromBrowser(setDiscoveryStatus);
  window.__lastProbes = probes;

  if (discovered.length === 0) {
    setDiscoveryStatus(probes ? '浏览器连通性检测完成，开始平台检测...' : '使用服务器检测');
    startStream(await registerDiscoveredIps([], probes));
    return;
  }

  setDiscoveryStatus(`已发现 ${discovered.length} 个出口 IP，开始平台检测...`);
  const token = await registerDiscoveredIps(discovered, probes);
  startStream(token);
}

main();
