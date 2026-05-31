const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getClientIp, getAllIpInfos } = require('./src/ipInfo');
const { checkAllPlatforms } = require('./src/checker');
const { PLATFORMS } = require('./src/platforms');

const GH_PAGES_URL = 'https://hk59775634.github.io/check-ip-for-ai';
const PORT = process.env.PORT || 3456;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_TTL_MS = 5 * 60 * 1000;
const sessions = new Map();

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function isCurl(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  return ua.includes('curl');
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function createSession(discovered, probes = null) {
  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, { discovered, probes, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

function takeSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  sessions.delete(token);
  if (session.expires < Date.now()) return null;
  return session;
}

function serveStatic(req, res) {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.cmd': 'application/octet-stream',
    '.sh': 'text/plain; charset=utf-8',
  };

  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function formatCurlStatus(result) {
  if (result.status === 'ok') {
    const ips = (result.supportedIps || []).join(', ');
    const suffix = ips ? ` (${ips})` : '';
    return `${ANSI.green}Supported${ANSI.reset}${suffix}`;
  }
  if (result.status === 'blocked') {
    return `${ANSI.red}Blocked${ANSI.reset}`;
  }
  return `${ANSI.yellow}Unknown${ANSI.reset}`;
}

const ROUTE_PRIORITY = ['China', 'Global', 'CF-v4', 'CF-v6', 'Dual', 'IPv4', 'IPv6'];

function shortRouteTag(info) {
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
  }
  return info.version || 'IP';
}

function routeTag(info) {
  return shortRouteTag(info);
}

function writeCurlIpSection(res, ipInfos) {
  res.write(`\n${ANSI.bold}Your IP${ipInfos.length > 1 ? 's' : ''}:${ANSI.reset}\n`);
  for (const info of ipInfos) {
    const tag = shortRouteTag(info);
    const asnIsp = [info.asn, info.isp].filter(Boolean).join(' · ') || 'N/A';
    res.write(
      `  ${ANSI.cyan}${info.ip}${ANSI.reset}  ` +
      `${ANSI.dim}${tag} ${asnIsp} | ${info.country} (${info.countryCode})${ANSI.reset}\n`
    );
  }
  if (ipInfos.length > 1) {
    res.write(`${ANSI.dim}Split tunnel: ${ipInfos.length} unique egress IP(s) detected${ANSI.reset}\n`);
  }
  res.write('\n');
}

const CURL_MULTI_IP_TIP_LINUX =
  `curl -fsSL ${GH_PAGES_URL}/linux-check.sh | bash`;

function writeCurlMultiIpTips(res) {
  res.write(`${ANSI.dim}Tip: full local check (Linux/macOS):${ANSI.reset}\n`);
  res.write(`${ANSI.dim}${CURL_MULTI_IP_TIP_LINUX}${ANSI.reset}\n\n`);
}

async function handleStream(req, res, url, curlMode = false, session = null) {
  res.writeHead(200, {
    'Content-Type': curlMode ? 'text/plain; charset=us-ascii' : 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (curlMode) {
    res.write(`${ANSI.bold}${ANSI.cyan}AI IP Connectivity Checker${ANSI.reset}\n`);
    res.write(`${ANSI.dim}${GH_PAGES_URL}${ANSI.reset}\n`);
    res.write('-'.repeat(40) + '\n');
  }

  try {
    const clientDiscovered = session?.discovered || null;
    const clientProbes = session?.probes || null;
    const ipInfos = await getAllIpInfos(req, url, clientDiscovered);

    if (curlMode) {
      writeCurlIpSection(res, ipInfos);
      if (ipInfos.length === 1) {
        writeCurlMultiIpTips(res);
      }
    } else {
      writeSse(res, 'ip', { ips: ipInfos, splitTunnel: ipInfos.length > 1 });
    }

    if (curlMode) {
      const curlRows = [];
      await checkAllPlatforms(ipInfos, (result, index) => {
        curlRows.push({ result, index });
      }, clientProbes);

      curlRows.sort((a, b) => a.index - b.index);
      for (const { result, index } of curlRows) {
        const num = String(index + 1).padStart(2, '0');
        const icon = result.status === 'ok' ? `${ANSI.green}OK${ANSI.reset}` : result.status === 'blocked' ? `${ANSI.red}XX${ANSI.reset}` : `${ANSI.yellow}??${ANSI.reset}`;
        const label = formatCurlStatus(result);
        res.write(`${num} [${icon}] ${result.name.padEnd(16)} ${label}\n`);
      }
    } else {
      await checkAllPlatforms(ipInfos, (result) => {
        writeSse(res, 'result', result);
      }, clientProbes);
    }

    if (curlMode) {
      res.write(`\n${ANSI.dim}Done. Checked ${PLATFORMS.length} platforms across ${ipInfos.length} IP(s).${ANSI.reset}\n`);
    } else {
      writeSse(res, 'done', { total: PLATFORMS.length, ipCount: ipInfos.length });
    }
  } catch (err) {
    if (curlMode) {
      res.write(`${ANSI.red}Error: ${err.message}${ANSI.reset}\n`);
    } else {
      writeSse(res, 'error', { message: err.message });
    }
  }

  res.end();
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/myip') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=us-ascii' });
    res.end(getClientIp(req));
    return;
  }

  if (url.pathname === '/api/platforms') {
    sendJson(res, 200, PLATFORMS.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      url: p.url,
      checkUrl: p.checkUrl,
    })));
    return;
  }

  if (url.pathname === '/api/ips' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body || '{}');
      const token = createSession(
        Array.isArray(data.discovered) ? data.discovered : [],
        data.probes && typeof data.probes === 'object' ? data.probes : null
      );
      sendJson(res, 200, { token, count: data.discovered?.length || 0 });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (url.pathname === '/api/stream') {
    const session = takeSession(url.searchParams.get('token'));
    await handleStream(req, res, url, false, session);
    return;
  }

  if (url.pathname === '/api/check') {
    try {
      let session = takeSession(url.searchParams.get('token'));
      let clientDiscovered = session?.discovered || null;
      let clientProbes = session?.probes || null;
      if (req.method === 'POST') {
        const body = await readBody(req);
        const data = JSON.parse(body || '{}');
        if (Array.isArray(data.discovered)) clientDiscovered = data.discovered;
        if (data.probes && typeof data.probes === 'object') clientProbes = data.probes;
      }
      const ipInfos = await getAllIpInfos(req, url, clientDiscovered);
      const results = await checkAllPlatforms(ipInfos, null, clientProbes);
      sendJson(res, 200, { ips: ipInfos, results, splitTunnel: ipInfos.length > 1 });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  if (url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/' || url.pathname.startsWith('/public/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.cmd') || url.pathname.endsWith('.sh')) {
    if (isCurl(req) && url.pathname === '/') {
      await handleStream(req, res, url, true, null);
      return;
    }

    if (url.pathname === '/') {
      serveStatic(req, res);
      return;
    }

    req.url = url.pathname.replace(/^\/public/, '') || '/index.html';
    serveStatic(req, res);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`AI IP Checker running on http://127.0.0.1:${PORT}`);
});
