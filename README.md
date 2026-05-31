# AI IP Connectivity Checker

Detect whether your egress IP can access major AI platforms.

- **Web:** https://hk59775634.github.io/check-ip-for-ai/
- **API:** https://aicheck.ai101.eu.org

## Quick start

```bash
# Single IP check (API)
curl -A curl https://aicheck.ai101.eu.org

# Multi-route IP check (Linux/macOS)
curl https://hk59775634.github.io/check-ip-for-ai/linux-check.sh | bash
```

## Self-host

```bash
npm start
# listens on http://127.0.0.1:3456
```

## License

MIT
