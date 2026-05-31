const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'public');
const dest = path.join(root, '_site');
const API_BASE = 'https://aicheck.ai101.eu.org';

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

fs.writeFileSync(
  path.join(dest, 'api-base.js'),
  `window.API_BASE='${API_BASE}';\n`,
  'utf8'
);

const indexPath = path.join(dest, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(
  '<script src="./ipDiscovery.js',
  '<script src="./api-base.js"></script>\n  <script src="./ipDiscovery.js'
);
fs.writeFileSync(indexPath, html, 'utf8');

console.log('GitHub Pages site prepared in _site/');
