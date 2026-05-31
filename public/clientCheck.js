/**
 * Browser-side platform verdict (region rules + probe results, multi-IP aware).
 */

function regionOk(platform, countryCode) {
  const rule = platform.regionRule || { type: 'always' };
  const cc = (countryCode || 'XX').toUpperCase();

  if (rule.type === 'always') return true;
  if (rule.type === 'allowlist') {
    return (rule.codes || []).includes(cc);
  }
  if (rule.type === 'blocklist') {
    return !(rule.codes || []).includes(cc);
  }
  return true;
}

function evaluateIpForPlatform(platform, ipInfo, probe) {
  const cc = ipInfo.countryCode || ipInfo.country || 'XX';

  if (!regionOk(platform, cc)) {
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

function summarizeBlocked(blockedIps, probe) {
  const reasons = new Set(blockedIps.map((item) => item.reason));

  if (reasons.has('network')) {
    return { status: 'blocked', reason: 'network' };
  }
  if (reasons.has('region')) {
    return { status: 'blocked', reason: 'region' };
  }
  return { status: 'unknown', reason: 'unknown' };
}

function evaluatePlatform(platform, ipInfos, probe) {
  const list = Array.isArray(ipInfos) && ipInfos.length ? ipInfos : [{ countryCode: 'XX' }];
  const safeProbe = probe || { reachable: false, blocked: false, status: 0, error: 'unreachable' };

  const supportedIps = [];
  const blockedIps = [];

  for (const ipInfo of list) {
    const verdict = evaluateIpForPlatform(platform, ipInfo, safeProbe);
    if (verdict.supported) {
      supportedIps.push(ipInfo.ip);
    } else {
      blockedIps.push({ ip: ipInfo.ip, reason: verdict.reason });
    }
  }

  if (supportedIps.length > 0) {
    return {
      id: platform.id,
      status: 'ok',
      reason: 'ok',
      supportedIps,
    };
  }

  if (blockedIps.every((item) => item.reason === 'unknown')) {
    return {
      id: platform.id,
      status: 'unknown',
      reason: 'unknown',
      supportedIps: [],
    };
  }

  const summary = summarizeBlocked(blockedIps, safeProbe);
  return {
    id: platform.id,
    status: summary.status,
    reason: summary.reason,
    supportedIps: [],
  };
}

window.ClientCheck = { evaluatePlatform, regionOk };
