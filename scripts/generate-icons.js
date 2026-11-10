// Generates the PWA / apple-touch icons from the same geometry as the inline
// SVG favicon in public/index.html (dark tile, cyan delta, red ring).
// Zero dependencies: raw RGBA raster -> zlib deflate -> PNG chunks.
// Usage: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');
const { renderIcon } = require('./png');

const outDir = path.join(__dirname, '..', 'public', 'assets', 'meta');
fs.mkdirSync(outDir, { recursive: true });
const targets = [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['apple-touch-icon.png', 180]
];
for (const [name, size] of targets) {
    const file = path.join(outDir, name);
    fs.writeFileSync(file, renderIcon(size));
    console.log(`${name} (${size}x${size}) -> ${fs.statSync(file).size} bytes`);
}
