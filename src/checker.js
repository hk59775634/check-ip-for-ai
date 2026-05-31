const { PLATFORMS } = require('./platforms');
const { USER_AGENT } = require('./ipInfo');

const HARD_BLOCKED_STATUSES = new Set([451]);
const OK_STATUSES = new Set([200, 301, 302, 307, 308, 401, 405]);

function classifyProbe(status, url, contentType = '') {
  const blockedByHeader =
    contentType.includes('text/plain') && url.includes('openai');

  if (blockedByHeader || HARD_BLOCKED_STATUSES.has(status)) {
    return { reachable: false, blocked: true, status, error: null };
  }
  // 403/429: anti-bot or rate limit — site responds, not geo-blocked
  if (OK_STATUSES.has(status) || status === 403 || status === 429) {
    return { reachable: true, blocked: false, status, error: null };
  }
  return { reachable: false, blocked: false, status, error: null };
}

async function probeUrl(url) {  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    let res = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
    }

    clearTimeout(timer);
    const contentType = res.headers.get('content-type') || '';
    return classifyProbe(res.status, url, contentType);  } catch (err) {
    clearTimeout(timer);
    const msg = err?.name === 'AbortError' ? 'timeout' : (err?.code || err?.message || 'error');
    return {
      reachable: false,
      status: 0,
      blocked: false,
      error: msg,
    };
  }
}

function evaluateIpForPlatform(platform, ipInfo, probe) {
  const regionOk = platform.regionCheck(ipInfo.countryCode);

  if (!regionOk) {
    return { supported: false, reason: 'region' };
  }

  if (probe.blocked) {
    return { supported: false, reason: 'network' };
  }

  if (probe.reachable) {
    return { supported: true, reason: 'ok' };
  }

  return { supported: false, reason: 'unknown' };
}

function pickProbe(platform, clientProbes) {
  const clientProbe = clientProbes?.[platform.id];
  if (!clientProbe) return { probe: null, source: 'server' };
  // Browser inconclusive (CORS/no-cors failed) — fall back to server probe like curl
  if (!clientProbe.reachable && !clientProbe.blocked) {
    return { probe: null, source: 'server' };
  }
  return { probe: clientProbe, source: 'client' };
}

function summarizeBlocked(blockedIps, probe) {
  const reasons = new Set(blockedIps.map((item) => item.reason));

  if (reasons.has('network')) {
    return {
      status: 'blocked',
      label: '受限',
      reason: 'network',
      detail: probe.error || `HTTP ${probe.status}` || 'Network blocked',
    };
  }
  if (reasons.has('region')) {
    return {
      status: 'blocked',
      label: '受限',
      reason: 'region',
      detail: blockedIps.length > 1
        ? 'Region not supported for some egress IP(s)'
        : 'Region not supported',
    };
  }
  return {
    status: 'unknown',
    label: '未知',
    reason: 'unknown',
    detail: probe.error || `HTTP ${probe.status}` || 'Unknown',
  };
}

function evaluatePlatformMulti(platform, ipInfos, probe) {
  const supportedIps = [];
  const blockedIps = [];

  for (const ipInfo of ipInfos) {
    const verdict = evaluateIpForPlatform(platform, ipInfo, probe);
    if (verdict.supported) {
      supportedIps.push(ipInfo.ip);
    } else {
      blockedIps.push({ ip: ipInfo.ip, reason: verdict.reason });
    }
  }

  if (supportedIps.length > 0) {
    return {
      status: 'ok',
      label: '支持',
      reason: 'ok',
      detail: `Supported by ${supportedIps.join(', ')}`,
      supportedIps,
      blockedIps,
    };
  }

  const allUnknown = blockedIps.every((item) => item.reason === 'unknown');

  if (allUnknown) {
    return {
      status: 'unknown',
      label: '未知',
      reason: 'unknown',
      detail: probe.error || `HTTP ${probe.status}` || 'Unknown',
      supportedIps: [],
      blockedIps,
    };
  }

  const summary = summarizeBlocked(blockedIps, probe);
  return {
    ...summary,
    supportedIps: [],
    blockedIps,
  };
}

async function checkPlatform(platform, ipInfos, clientProbes) {
  const { probe: clientProbe, source: probeSourceHint } = pickProbe(platform, clientProbes);
  const probe = clientProbe || await probeUrl(platform.checkUrl);
  const result = evaluatePlatformMulti(platform, ipInfos, probe);
  return {
    id: platform.id,
    name: platform.name,
    icon: platform.icon,
    url: platform.url,
    ...result,
    httpStatus: probe.status,
    probeSource: clientProbe ? probeSourceHint : 'server',
  };
}

async function checkAllPlatforms(ipInfos, onResult, clientProbes = null) {
  const list = Array.isArray(ipInfos) ? ipInfos : [{ countryCode: ipInfos }];
  const tasks = PLATFORMS.map(async (platform, index) => {
    const result = await checkPlatform(platform, list, clientProbes);
    if (onResult) onResult(result, index);
    return result;
  });

  return Promise.all(tasks);
}

module.exports = { checkPlatform, checkAllPlatforms, probeUrl, evaluatePlatformMulti };
