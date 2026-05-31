# AI IP Connectivity Checker

Detect whether your egress IP can access major AI platforms — **100% static, runs entirely in your browser**.

- **Live site:** https://hk59775634.github.io/check-ip-for-ai/

## Features

- Multi-route egress IP discovery (ipcheck.ing, ipinfo.io, IPIP.net, …)
- IP geolocation enrichment (ASN, ISP, country)
- 30 AI platform connectivity probes (browser network path)
- Region rule evaluation (OpenAI allowlist, Anthropic blocklist, etc.)
- Streaming results — no backend required

## Usage

Open the URL in any modern browser. No install, no `npm start`.

## Optional self-host (Node CLI + API)

The repo still includes `server.js` for curl mode and SSE API if you want it:

```bash
npm start
curl -A curl http://127.0.0.1:3456
```

## Build GitHub Pages

```bash
node scripts/build-pages.js
# output in _site/
```

## License

MIT
