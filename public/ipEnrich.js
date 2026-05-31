/**
 * Browser-side IP geolocation enrichment (ip-api.com + ip.sb fallback).
 */

const LOOKUP_TIMEOUT_MS = 8000;

function isValidIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const v = ip.trim();
  if (!v || v === 'unknown') return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return true;
  return v.includes(':');
}

function baseInfo(ip, meta = {}) {
  return {
    ip,
    version: ip.includes(':') ? 'IPv6' : 'IPv4',
    country: 'Unknown',
    countryCode: 'XX',
    region: '',
    city: '',
    isp: 'Unknown',
    asn: '',
    org: 'Unknown',
    route: meta.route || '',
    source: meta.source || '',
    routes: meta.routes || (meta.route ? [meta.route] : []),
    sources: meta.sources || (meta.source ? [meta.source] : []),
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupIp(ip) {
  if (!isValidIp(ip)) return baseInfo(ip || 'unknown');

  const data = await fetchJson(
    `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,regionName,city,isp,as,org,query`
  );
  if (data?.status === 'success') {
    const asnMatch = data.as?.match(/AS(\d+)/);
    return {
      ip: data.query || ip,
      version: (data.query || ip).includes(':') ? 'IPv6' : 'IPv4',
      country: data.country || 'Unknown',
      countryCode: data.countryCode || 'XX',
      region: data.regionName || '',
      city: data.city || '',
      isp: data.isp || data.org || 'Unknown',
      asn: asnMatch ? `AS${asnMatch[1]}` : (data.as || ''),
      org: data.org || data.isp || 'Unknown',
    };
  }

  const fallback = await fetchJson(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`);
  if (fallback) {
    return {
      ip: fallback.ip || ip,
      version: (fallback.ip || ip).includes(':') ? 'IPv6' : 'IPv4',
      country: fallback.country || 'Unknown',
      countryCode: fallback.country_code || 'XX',
      region: fallback.region || '',
      city: fallback.city || '',
      isp: fallback.organization || fallback.isp || 'Unknown',
      asn: fallback.asn ? `AS${fallback.asn}` : '',
      org: fallback.organization || 'Unknown',
    };
  }

  return baseInfo(ip);
}

function mergeDiscoveryMeta(info, meta) {
  if (meta.route) info.route = meta.route;
  if (meta.source) info.source = meta.source;
  if (meta.routes?.length) info.routes = meta.routes;
  if (meta.sources?.length) info.sources = meta.sources;
  if (meta.country && meta.country.length === 2) {
    info.countryCode = meta.country.toUpperCase();
  }
  return info;
}

/**
 * @param {Array<object>} discovered rows from IpDiscovery
 * @param {(msg: string) => void} [onProgress]
 */
async function enrichDiscovered(discovered, onProgress) {
  const rows = Array.isArray(discovered) ? discovered.filter((r) => r?.ip) : [];
  if (!rows.length) return [];

  const results = [];
  let i = 0;
  for (const meta of rows) {
    i += 1;
    if (onProgress) onProgress(`查询 IP 归属 (${i}/${rows.length})...`);
    const looked = await lookupIp(meta.ip);
    results.push(mergeDiscoveryMeta(looked, meta));
  }
  return results;
}

window.IpEnrich = { enrichDiscovered, lookupIp };
