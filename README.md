# AI IP Connectivity Checker

Detect whether your egress IP can access major AI platforms.

- **Web (browser):** https://hk59775634.github.io/check-ip-for-ai/
- **CLI (Linux/macOS, pure local curl):**

```bash
curl -fsSL https://hk59775634.github.io/check-ip-for-ai/linux-check.sh | bash
```

The bash script discovers egress IPs, enriches geolocation, probes 30 AI platforms via curl, and prints ANSI results — **no backend API required**.

## Build GitHub Pages

```bash
node scripts/build-pages.js
# regenerates _site/, platforms.json, and linux-check.sh
```

## Optional self-host (Node curl API)

```bash
npm start
curl -A curl http://127.0.0.1:3456
```

## License

MIT
