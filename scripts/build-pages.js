const fs = require('fs');
const path = require('path');
const { PLATFORMS, serializeRegionRule } = require('../src/platforms');

const root = path.join(__dirname, '..');
const src = path.join(root, 'public');
const dest = path.join(root, '_site');
const GH_PAGES_URL = 'https://hk59775634.github.io/check-ip-for-ai';

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const srcPath = path.join(from, name);
    const destPath = path.join(to, name);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true, force: true });
}

copyDir(src, dest);

const platforms = PLATFORMS.map((p) => ({
  id: p.id,
  name: p.name,
  icon: p.icon,
  url: p.url,
  checkUrl: p.checkUrl,
  regionRule: serializeRegionRule(p.regionRule),
}));
const platformsJson = JSON.stringify(platforms, null, 2);
fs.writeFileSync(path.join(dest, 'platforms.json'), platformsJson, 'utf8');
fs.writeFileSync(path.join(src, 'platforms.json'), platformsJson, 'utf8');

console.log(`GitHub Pages site prepared in _site/ (${GH_PAGES_URL})`);
