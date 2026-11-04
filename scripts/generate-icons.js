// Generates the PWA / apple-touch icons from the same geometry as the inline
// SVG favicon in public/index.html (dark tile, cyan delta, red ring).
// Zero dependencies: raw RGBA raster -> zlib deflate -> PNG chunks.
// Usage: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---- Minimal PNG encoder ----
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // color type RGBA
    // filter each scanline with 0 (none)
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- Raster helpers ----
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#050508');
const CYAN = hex('#00f2fe');
const RED = hex('#ff2a4d');

// Distance from point p to segment ab
function distSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const x = ax + t * dx, y = ay + t * dy;
    return Math.hypot(px - x, py - y);
}

// Soft stroke coverage: 1 inside the stroke, fading over 1px at the edges
function strokeCov(dist, halfWidth) {
    return Math.max(0, Math.min(1, halfWidth + 0.75 - dist));
}

function renderIcon(size) {
    const s = size / 32; // favicon viewBox is 32x32
    const rgba = Buffer.alloc(size * size * 4);

    // Favicon path: M6 24 L16 6 L26 24 (stroke #00f2fe, width 2)
    // Circle: cx16 cy19 r2.5 (stroke #ff2a4d, width 2)
    const tri = [[6, 24], [16, 6], [26, 24]].map(([x, y]) => [x * s, y * s]);
    const cc = [16 * s, 19 * s];
    const cr = 2.5 * s;
    const halfW = 1.0 * s;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const px = x + 0.5, py = y + 0.5;
            const i = (y * size + x) * 4;

            let r = BG[0], g = BG[1], b = BG[2], a = 255;

            const triD = Math.min(
                distSeg(px, py, tri[0][0], tri[0][1], tri[1][0], tri[1][1]),
                distSeg(px, py, tri[1][0], tri[1][1], tri[2][0], tri[2][1]),
                distSeg(px, py, tri[2][0], tri[2][1], tri[0][0], tri[0][1])
            );
            const tc = strokeCov(triD, halfW);

            const circD = Math.abs(Math.hypot(px - cc[0], py - cc[1]) - cr);
            const rc = strokeCov(circD, halfW);

            // Red ring draws over the cyan delta
            const cov = Math.max(tc, rc);
            const col = rc >= tc ? RED : CYAN;
            r = Math.round(BG[0] * (1 - cov) + col[0] * cov);
            g = Math.round(BG[1] * (1 - cov) + col[1] * cov);
            b = Math.round(BG[2] * (1 - cov) + col[2] * cov);

            rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
        }
    }
    return encodePNG(size, size, rgba);
}

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
