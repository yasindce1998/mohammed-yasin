// Zero-dependency raster helpers: PNG encoding, PWA icons, and the OG card.
// Shared by scripts/generate-icons.js and scripts/build-static.js.

const zlib = require('zlib');

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
const WHITE = hex('#f5f5f8');

function distSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const x = ax + t * dx, y = ay + t * dy;
    return Math.hypot(px - x, py - y);
}

function strokeCov(dist, halfWidth) {
    return Math.max(0, Math.min(1, halfWidth + 0.75 - dist));
}

// Icons use the same geometry as the inline SVG favicon:
// dark tile, cyan delta, red ring.
function renderIcon(size) {
    const s = size / 32;
    const rgba = Buffer.alloc(size * size * 4);

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

// ---- 5x7 bitmap font for the OG card (no native font rasteriser needed) ----
const FONT = {
    ' ': [0, 0, 0, 0, 0, 0, 0],
    'A': [14, 17, 17, 31, 17, 17, 17],
    'B': [30, 17, 17, 30, 17, 17, 30],
    'C': [14, 17, 16, 16, 16, 17, 14],
    'D': [28, 18, 17, 17, 17, 18, 28],
    'E': [31, 16, 16, 30, 16, 16, 31],
    'F': [31, 16, 16, 30, 16, 16, 16],
    'G': [14, 17, 16, 23, 17, 17, 15],
    'H': [17, 17, 17, 31, 17, 17, 17],
    'I': [14, 4, 4, 4, 4, 4, 14],
    'J': [7, 2, 2, 2, 2, 18, 12],
    'K': [17, 18, 20, 24, 20, 18, 17],
    'L': [16, 16, 16, 16, 16, 16, 31],
    'M': [17, 27, 21, 21, 17, 17, 17],
    'N': [17, 25, 21, 19, 17, 17, 17],
    'O': [14, 17, 17, 17, 17, 17, 14],
    'P': [30, 17, 17, 30, 16, 16, 16],
    'Q': [14, 17, 17, 17, 21, 18, 13],
    'R': [30, 17, 17, 30, 20, 18, 17],
    'S': [15, 16, 16, 14, 1, 1, 30],
    'T': [31, 4, 4, 4, 4, 4, 4],
    'U': [17, 17, 17, 17, 17, 17, 14],
    'V': [17, 17, 17, 17, 17, 10, 4],
    'W': [17, 17, 17, 21, 21, 27, 17],
    'X': [17, 17, 10, 4, 10, 17, 17],
    'Y': [17, 17, 10, 4, 4, 4, 4],
    'Z': [31, 1, 2, 4, 8, 16, 31],
    '0': [14, 17, 19, 21, 25, 17, 14],
    '1': [4, 12, 4, 4, 4, 4, 14],
    '2': [14, 17, 1, 2, 4, 8, 31],
    '3': [31, 2, 4, 2, 1, 17, 14],
    '4': [2, 6, 10, 18, 31, 2, 2],
    '5': [31, 16, 30, 1, 1, 17, 14],
    '6': [6, 8, 16, 30, 17, 17, 14],
    '7': [31, 1, 2, 4, 8, 8, 8],
    '8': [14, 17, 17, 14, 17, 17, 14],
    '9': [14, 17, 17, 15, 1, 2, 12],
    '/': [1, 2, 2, 4, 8, 8, 16],
    '-': [0, 0, 0, 31, 0, 0, 0],
    '.': [0, 0, 0, 0, 0, 12, 12],
    ':': [0, 4, 4, 0, 4, 4, 0],
    '+': [0, 4, 4, 31, 4, 4, 0],
    '>': [8, 4, 2, 1, 2, 4, 8]
};

function blendPixel(rgba, w, h, x, y, col, alpha = 1) {
    if (x < 0 || y < 0 || x >= w || y >= h || alpha <= 0) return;
    const i = (y * w + x) * 4;
    const a = Math.max(0, Math.min(1, alpha));
    rgba[i] = Math.round(rgba[i] * (1 - a) + col[0] * a);
    rgba[i + 1] = Math.round(rgba[i + 1] * (1 - a) + col[1] * a);
    rgba[i + 2] = Math.round(rgba[i + 2] * (1 - a) + col[2] * a);
    rgba[i + 3] = 255;
}

function drawText(rgba, w, h, text, x, y, scale, col, { alpha = 1, spacing = 1, glow = 0 } = {}) {
    const chars = String(text).toUpperCase();
    let cursor = x;
    for (const ch of chars) {
        const glyph = FONT[ch] || FONT[' '];
        for (let row = 0; row < 7; row++) {
            const bits = glyph[row];
            for (let colIdx = 0; colIdx < 5; colIdx++) {
                if (!(bits & (1 << (4 - colIdx)))) continue;
                for (let sy = 0; sy < scale; sy++) {
                    for (let sx = 0; sx < scale; sx++) {
                        const px = cursor + colIdx * scale + sx;
                        const py = y + row * scale + sy;
                        if (glow > 0) {
                            for (let gy = -glow; gy <= glow; gy++) {
                                for (let gx = -glow; gx <= glow; gx++) {
                                    blendPixel(rgba, w, h, px + gx, py + gy, col, alpha * 0.055);
                                }
                            }
                        }
                        blendPixel(rgba, w, h, px, py, col, alpha);
                    }
                }
            }
        }
        cursor += (5 + spacing) * scale;
    }
    return cursor;
}

function textWidth(text, scale, spacing = 1) {
    return Math.max(0, String(text).length * (5 + spacing) * scale - spacing * scale);
}

function mix(a, b, t) {
    return [
        Math.round(a[0] * (1 - t) + b[0] * t),
        Math.round(a[1] * (1 - t) + b[1] * t),
        Math.round(a[2] * (1 - t) + b[2] * t)
    ];
}

// 1200x630 social card: deep-space background, geometric mark, name, role.
function renderOG(width = 1200, height = 630) {
    const rgba = Buffer.alloc(width * height * 4);
    const cx = width * 0.78;
    const cy = height * 0.34;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const dx = (x - cx) / width;
            const dy = (y - cy) / height;
            const radial = Math.max(0, 1 - Math.hypot(dx * 1.15, dy * 1.7) * 2.1);
            const base = mix(BG, [10, 14, 24], y / height);
            const tint = mix(base, CYAN, radial * 0.10);
            const grid = (x % 48 === 0 || y % 48 === 0) ? 3 : 0;
            rgba[i] = Math.min(255, tint[0] + grid);
            rgba[i + 1] = Math.min(255, tint[1] + grid);
            rgba[i + 2] = Math.min(255, tint[2] + grid);
            rgba[i + 3] = 255;
        }
    }

    // Faint corner brackets
    const bracket = [40, 40, width - 40, height - 40];
    for (const [x0, y0, x1, y1] of [
        [bracket[0], bracket[1], bracket[0] + 42, bracket[1]],
        [bracket[0], bracket[1], bracket[0], bracket[1] + 42],
        [bracket[2], bracket[1], bracket[2] - 42, bracket[1]],
        [bracket[2], bracket[1], bracket[2], bracket[1] + 42],
        [bracket[0], bracket[3], bracket[0] + 42, bracket[3]],
        [bracket[0], bracket[3], bracket[0], bracket[3] - 42],
        [bracket[2], bracket[3], bracket[2] - 42, bracket[3]],
        [bracket[2], bracket[3], bracket[2], bracket[3] - 42]
    ]) {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let s = 0; s <= steps; s++) {
            const t = steps === 0 ? 0 : s / steps;
            blendPixel(rgba, width, height, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), CYAN, 0.35);
        }
    }

    // Geometric mark: cyan delta + red ring.
    const mx = 150, my = 158, ms = 3.1;
    const tri = [[6, 24], [16, 6], [26, 24]].map(([x, y]) => [mx + (x - 16) * ms, my + (y - 16) * ms]);
    const halfW = 1.0 * ms;
    for (let y = Math.floor(my - 45); y <= Math.ceil(my + 45); y++) {
        for (let x = Math.floor(mx - 45); x <= Math.ceil(mx + 45); x++) {
            const triD = Math.min(
                distSeg(x, y, tri[0][0], tri[0][1], tri[1][0], tri[1][1]),
                distSeg(x, y, tri[1][0], tri[1][1], tri[2][0], tri[2][1]),
                distSeg(x, y, tri[2][0], tri[2][1], tri[0][0], tri[0][1])
            );
            const tc = strokeCov(triD, halfW);
            const ccx = mx, ccy = my + 3 * ms;
            const circD = Math.abs(Math.hypot(x - ccx, y - ccy) - 2.5 * ms);
            const rc = strokeCov(circD, halfW);
            if (tc > 0) blendPixel(rgba, width, height, x, y, CYAN, tc);
            if (rc > 0) blendPixel(rgba, width, height, x, y, RED, rc);
        }
    }

    // Text block
    const titleScale = 8;
    const title = 'MOHAMMED YASIN';
    const titleX = 150;
    const titleY = 296;
    drawText(rgba, width, height, title, titleX, titleY, titleScale, WHITE, { glow: 3 });
    drawText(rgba, width, height, 'SECURITY ENGINEER // DIGITAL ARCHITECT', titleX, titleY + 88, 2, CYAN, { spacing: 2 });

    // Accent rule
    for (let x = titleX; x < titleX + 360; x++) {
        for (let y = titleY + 132; y < titleY + 135; y++) blendPixel(rgba, width, height, x, y, CYAN, 0.8);
    }

    drawText(rgba, width, height, 'EBPF / RUST / GOLANG / KUBERNETES', titleX, titleY + 158, 2, [150, 158, 176], {});
    drawText(rgba, width, height, 'KERNEL-LEVEL OFFENSE > CLOUD-NATIVE DEFENSE', titleX, titleY + 196, 2, [100, 108, 126], {});

    // Bottom-right URL
    const url = 'MOHAMMEDYASIN.VERCEL.APP';
    const urlScale = 2;
    drawText(rgba, width, height, url, width - 150 - textWidth(url, urlScale, 2), height - 78, urlScale, [120, 128, 146], { spacing: 2 });

    return encodePNG(width, height, rgba);
}

module.exports = { encodePNG, renderIcon, renderOG, drawText, textWidth };
