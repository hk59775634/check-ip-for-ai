/**
 * Multi-route egress IP discovery.
 * Based on https://github.com/jason5ng32/MyIP (IPCheck.ing + proxy rule tests).
 */

const IP_FETCH_TIMEOUT_MS = 6000;
const DISCOVERY_TIMEOUT_MS = 18000;

async function fetchTextSafe(url, timeoutMs = IP_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonSafe(url, timeoutMs = IP_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.includes('json')) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseCloudflareTrace(text) {
  const map = {};
  for (const line of text.trim().split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
  }
  return {
    ip: map.ip || '',
    country: (map.loc || map.country || '').toUpperCase(),
  };
}

function isValidIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const v = ip.trim();
  if (!v || v === 'unknown') return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return true;
  if (v.includes(':')) return true;
  return false;
}

function makeResult(ip, country, source, route) {
  const clean = String(ip || '').trim();
  if (!isValidIp(clean)) return null;
  return {
    ip: clean,
    country: (country || '').toUpperCase(),
    source,
    route,
    version: clean.includes(':') ? 'IPv6' : 'IPv4',
  };
}

async function probeIpCheckingHost(host, source, route) {
  const j = await fetchJsonSafe(`https://${host}`);
  if (j?.ip) return makeResult(j.ip, j.country || j.country_code || '', source, route);

  const t = await fetchTextSafe(`https://${host}/cdn-cgi/trace`);
  if (!t) return null;
  const p = parseCloudflareTrace(t);
  return makeResult(p.ip, p.country, source, route);
}

async function probeCloudflareTrace(url, source, route) {
  const t = await fetchTextSafe(url);
  if (!t) return null;
  const p = parseCloudflareTrace(t);
  return makeResult(p.ip, p.country, source, route);
}

async function probeIPIP() {
  const j = await fetchJsonSafe('https://myip.ipip.net/json');
  if (!j?.data?.ip) return null;
  return makeResult(j.data.ip, j.data.country_code || j.data.country || '', 'IPIP.net', 'China');
}

async function probeIpinfo() {
  const j = await fetchJsonSafe('https://ipinfo.io/json');
  if (!j?.ip) return null;
  return makeResult(j.ip, j.country, 'ipinfo.io', 'Global');
}

async function probeAllPtests() {
  const tasks = Array.from({ length: 8 }, (_, i) => {
    const n = i + 1;
    const host = `ptest-${n}.ipcheck.ing`;
    return fetchTextSafe(`https://${host}/cdn-cgi/trace`).then((t) => {
      if (!t) return null;
      const p = parseCloudflareTrace(t);
      return makeResult(p.ip, p.country, host, `Proxy-${n}`);
    });
  });
  return Promise.all(tasks);
}

function mergeResults(byIp, rows) {
  for (const row of rows.filter(Boolean)) {
    if (!byIp.has(row.ip)) {
      byIp.set(row.ip, { ...row, sources: [row.source], routes: [row.route] });
      continue;
    }
    const existing = byIp.get(row.ip);
    if (!existing.sources.includes(row.source)) existing.sources.push(row.source);
    if (!existing.routes.includes(row.route)) existing.routes.push(row.route);
    if (!existing.country && row.country) existing.country = row.country;
  }
}

/**
 * Discover all unique egress IPs (MyIP-style multi-source + ptest proxy rules).
 * @param {(msg: string) => void} [onProgress]
 */
async function discoverAllIps(onProgress) {
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve([]), DISCOVERY_TIMEOUT_MS);
  });

  const work = (async () => {
    if (onProgress) onProgress('MyIP-style egress IP discovery...');

    const baseProbes = [
      { name: 'IPCheck IPv4', fn: () => probeIpCheckingHost('4.ipcheck.ing', 'IPCheck.ing IPv4', 'IPv4') },
      { name: 'IPCheck IPv6', fn: () => probeIpCheckingHost('6.ipcheck.ing', 'IPCheck.ing IPv6', 'IPv6') },
      { name: 'IPCheck dual', fn: () => probeIpCheckingHost('64.ipcheck.ing', 'IPCheck.ing IPv6/4', 'Dual') },
      { name: 'Cloudflare IPv4', fn: () => probeCloudflareTrace('https://1.0.0.1/cdn-cgi/trace', 'Cloudflare IPv4', 'CF-v4') },
      { name: 'Cloudflare IPv6', fn: () => probeCloudflareTrace('https://[2606:4700:4700::1111]/cdn-cgi/trace', 'Cloudflare IPv6', 'CF-v6') },
      { name: 'IPIP.net', fn: probeIPIP },
      { name: 'ipinfo.io', fn: probeIpinfo },
    ];

    const baseResults = await Promise.all(
      baseProbes.map(async (p) => {
        try {
          if (onProgress) onProgress(`Probing ${p.name}...`);
          return await p.fn();
        } catch {
          return null;
        }
      })
    );

    if (onProgress) onProgress('Proxy rule tests (ptest-1..8)...');
    const ptestResults = await probeAllPtests();

    const byIp = new Map();
    mergeResults(byIp, baseResults);
    mergeResults(byIp, ptestResults);

    return [...byIp.values()];
  })();

  const result = await Promise.race([work, timeout]);
  return result || [];
}

window.IpDiscovery = { discoverAllIps };
