const net = require('net');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function normalizeIp(raw) {
  if (!raw) return null;
  let ip = raw.trim().replace(/^::ffff:/i, '');
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  return ip;
}

function isValidIp(ip) {
  if (!ip || ip === 'unknown') return false;
  return net.isIP(ip) > 0;
}

function getIpVersion(ip) {
  return ip.includes(':') ? 'IPv6' : 'IPv4';
}

function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return normalizeIp(cfIp.split(',')[0]);

  const xff = req.headers['x-forwarded-for'];
  if (xff) return normalizeIp(xff.split(',')[0]);

  const xri = req.headers['x-real-ip'];
  if (xri) return normalizeIp(xri);

  return normalizeIp(req.socket?.remoteAddress) || 'unknown';
}

function parseExtraIps(url) {
  const ips = new Set();
  const ipv4 = url.searchParams.get('ipv4');
  const ipv6 = url.searchParams.get('ipv6');
  const ipsParam = url.searchParams.get('ips');

  if (ipv4) {
    const ip = normalizeIp(ipv4);
    if (isValidIp(ip)) ips.add(ip);
  }
  if (ipv6) {
    const ip = normalizeIp(ipv6);
    if (isValidIp(ip)) ips.add(ip);
  }
  if (ipsParam) {
    ipsParam.split(',').forEach((part) => {
      const ip = normalizeIp(part);
      if (isValidIp(ip)) ips.add(ip);
    });
  }

  return [...ips];
}

function getCfCountry(req) {
  return req.headers['cf-ipcountry'] || null;
}

async function lookupIp(ip) {
  if (!isValidIp(ip)) {
    return {
      ip: ip || 'unknown',
      version: 'Unknown',
      country: 'Unknown',
      countryCode: 'XX',
      region: '',
      city: '',
      isp: 'Unknown',
      asn: '',
      org: 'Unknown',
    };
  }

  const base = {
    ip,
    version: getIpVersion(ip),
    country: 'Unknown',
    countryCode: 'XX',
    region: '',
    city: '',
    isp: 'Unknown',
    asn: '',
    org: 'Unknown',
  };

  try {
    const res = await fetch(`https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,regionName,city,isp,as,org,query`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (data.status === 'success') {
      const asnMatch = data.as?.match(/AS(\d+)/);
      return {
        ip: data.query || ip,
        version: getIpVersion(data.query || ip),
        country: data.country || 'Unknown',
        countryCode: data.countryCode || 'XX',
        region: data.regionName || '',
        city: data.city || '',
        isp: data.isp || data.org || 'Unknown',
        asn: asnMatch ? `AS${asnMatch[1]}` : (data.as || ''),
        org: data.org || data.isp || 'Unknown',
      };
    }
  } catch {
    // fallback below
  }

  try {
    const res = await fetch(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return {
      ip: data.ip || ip,
      version: getIpVersion(data.ip || ip),
      country: data.country || 'Unknown',
      countryCode: data.country_code || 'XX',
      region: data.region || '',
      city: data.city || '',
      isp: data.organization || data.isp || 'Unknown',
      asn: data.asn ? `AS${data.asn}` : '',
      org: data.organization || 'Unknown',
    };
  } catch {
    return base;
  }
}

async function getAllIpInfos(req, url, clientDiscovered = null) {
  const connectingIp = getClientIp(req);
  const extraIps = url ? parseExtraIps(url) : [];
  const orderedIps = [];
  const seen = new Set();
  const metaMap = new Map();

  const candidates = [
    ...(Array.isArray(clientDiscovered) ? clientDiscovered : []),
    ...extraIps.map((ip) => ({ ip })),
    { ip: connectingIp },
  ];

  for (const item of candidates) {
    const ip = normalizeIp(typeof item === 'string' ? item : item.ip);
    if (!isValidIp(ip) || seen.has(ip)) continue;
    seen.add(ip);
    orderedIps.push(ip);
    if (item && typeof item === 'object' && item.ip) {
      metaMap.set(ip, item);
    }
  }

  if (orderedIps.length === 0 && isValidIp(connectingIp)) {
    orderedIps.push(connectingIp);
  }

  const cfCountry = getCfCountry(req);
  const infos = await Promise.all(orderedIps.map(async (ip) => {
    const info = await lookupIp(ip);
    const meta = metaMap.get(ip);
    if (meta?.country) {
      info.countryCode = String(meta.country).toUpperCase();
    }
    if (meta?.route) info.route = meta.route;
    if (meta?.source) info.source = meta.source;
    if (meta?.routes?.length) info.routes = meta.routes;
    if (meta?.sources?.length) info.sources = meta.sources;
    return info;
  }));

  const connectingInfo = infos.find((info) => info.ip === connectingIp);
  if (connectingInfo && cfCountry && cfCountry !== 'XX') {
    connectingInfo.countryCode = cfCountry;
  }

  return infos;
}

async function getIpInfo(req, url, clientDiscovered) {
  const infos = await getAllIpInfos(req, url, clientDiscovered);
  return infos[0];
}

module.exports = {
  getClientIp,
  getIpInfo,
  getAllIpInfos,
  lookupIp,
  isValidIp,
  getIpVersion,
  USER_AGENT,
};
