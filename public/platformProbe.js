/**
 * Browser-side platform reachability probes (uses user's actual network path).
 */

const PROBE_TIMEOUT_MS = 8000;
const PROBE_CONCURRENCY = 4;
const HARD_BLOCKED = new Set([451]);
const OK_STATUSES = new Set([200, 301, 302, 307, 308, 401, 405]);

function classifyStatus(status) {
  if (HARD_BLOCKED.has(status)) {
    return { reachable: false, blocked: true, status, error: null };
  }
  // 403/429 usually mean anti-bot or rate limit, not geo-block — site is reachable
  if (OK_STATUSES.has(status) || status === 403 || status === 429) {
    return { reachable: true, blocked: false, status, error: null };
  }
  return { reachable: false, blocked: false, status, error: null };
}

function probeImage(origin) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 5000);
    img.onload = () => {
      clearTimeout(timer);
      resolve({ reachable: true, blocked: false, status: 0, error: null });
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    try {
      img.referrerPolicy = 'no-referrer';
      img.src = `${new URL(origin).origin}/favicon.ico?t=${Date.now()}`;
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function probeNoCors(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(url, {
      mode: 'no-cors',
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    return { reachable: true, blocked: false, status: 0, error: null };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function probeCors(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
    });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        cache: 'no-store',
      });
    }
    clearTimeout(timer);
    return classifyStatus(res.status);
  } catch (err) {
    clearTimeout(timer);
    const msg = err?.name === 'AbortError' ? 'timeout' : (err?.message || 'error');
    return { reachable: false, blocked: false, status: 0, error: msg };
  }
}

async function probeOne(checkUrl, pageUrl) {
  const targets = [checkUrl, pageUrl].filter(Boolean);
  const seen = new Set();
  const urls = targets.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  for (const url of urls) {
    const noCors = await probeNoCors(url);
    if (noCors?.reachable) return noCors;
  }

  for (const url of urls) {
    try {
      const img = await probeImage(url);
      if (img?.reachable) return img;
    } catch {
      // try next
    }
  }

  for (const url of urls) {
    const cors = await probeCors(url);
    if (cors.reachable) return cors;
    if (cors.blocked) return cors;
  }

  return { reachable: false, blocked: false, status: 0, error: 'unreachable' };
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function probeAllPlatforms(platforms, onProgress) {
  const probes = {};

  await mapPool(platforms, PROBE_CONCURRENCY, async (platform) => {
    if (onProgress) onProgress(`检测 ${platform.name || platform.id} 连通性...`);
    probes[platform.id] = await probeOne(platform.checkUrl, platform.url);
  });

  return probes;
}

window.PlatformProbe = { probeAllPlatforms };
