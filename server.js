/**
 * Zero-dependency local static dev server.
 *
 * - Serves files from ./public (override with ROOT env var)
 * - HTTP Range support for audio/video
 * - SPA fallback: extensionless routes return index.html
 * - Safe path resolution (requests can never escape the root directory)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 7890;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT_DIR = path.resolve(process.env.ROOT || path.join(__dirname, 'public'));

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.htm': 'text/html; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.mjs': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ktx2': 'image/ktx2',
    '.ico': 'image/x-icon',
    '.bin': 'application/octet-stream',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.wasm': 'application/wasm',
    '.glsl': 'text/plain; charset=UTF-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.otf': 'font/otf',
    '.ttf': 'font/ttf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.xml': 'application/xml',
    '.txt': 'text/plain; charset=UTF-8',
    '.webmanifest': 'application/manifest+json; charset=UTF-8'
};

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "media-src 'self'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'self'"
    ].join('; ')
};

function sendError(res, status, message) {
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end(`${status} ${message}\n`);
}

function cacheControlFor(ext) {
    if (ext === '.html' || ext === '.htm') return 'no-cache';
    if (ext === '.woff' || ext === '.woff2' || ext === '.otf' || ext === '.ttf') {
        return 'public, max-age=31536000, immutable';
    }
    if (ext === '.js' || ext === '.css' || ext === '.png' || ext === '.webmanifest') {
        return 'public, max-age=3600, stale-while-revalidate=86400';
    }
    return 'no-cache';
}

// Resolves a URL path to a file inside ROOT_DIR, or null if it would escape it.
function resolveSafePath(urlPath) {
    if (urlPath.includes('\0')) return null;
    const resolved = path.resolve(ROOT_DIR, '.' + path.posix.normalize('/' + urlPath));
    if (resolved !== ROOT_DIR && !resolved.startsWith(ROOT_DIR + path.sep)) return null;
    return resolved;
}

function parseRange(header, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match || (match[1] === '' && match[2] === '')) return null;

    let start;
    let end;
    if (match[1] === '') {
        // Suffix range: last N bytes
        start = Math.max(size - Number(match[2]), 0);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
    }
    if (start > end || start >= size) return null;
    return { start, end };
}

function serveFile(filePath, stat, req, res, statusOverride = 0) {
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
        ...SECURITY_HEADERS,
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Last-Modified': stat.mtime.toUTCString(),
        'Cache-Control': cacheControlFor(ext)
    };

    const since = req.headers['if-modified-since'];
    if (!statusOverride && since && !req.headers.range && Math.floor(stat.mtimeMs / 1000) <= Math.floor(Date.parse(since) / 1000)) {
        res.writeHead(304, headers);
        return res.end();
    }

    let status = statusOverride || 200;
    let streamOpts = {};
    headers['Content-Length'] = stat.size;

    if (req.headers.range && !statusOverride) {
        const range = parseRange(req.headers.range, stat.size);
        if (!range) {
            res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
            return res.end();
        }
        status = 206;
        streamOpts = range;
        headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
        headers['Content-Length'] = range.end - range.start + 1;
    }

    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(filePath, streamOpts);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
}

function tryStat(filePath) {
    try {
        return fs.statSync(filePath);
    } catch {
        return null;
    }
}

const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return sendError(res, 405, 'Method Not Allowed');
    }

    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
        return sendError(res, 400, 'Bad Request');
    }

    let filePath = resolveSafePath(pathname);
    if (!filePath) return sendError(res, 403, 'Forbidden');

    let stat = tryStat(filePath);
    if (stat && stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        stat = tryStat(filePath);
    }

    if (!stat || !stat.isFile()) {
        console.warn(`[404] ${pathname}`);
        const notFound = path.join(ROOT_DIR, '404.html');
        const notFoundStat = tryStat(notFound);
        if (notFoundStat && notFoundStat.isFile()) {
            return serveFile(notFound, notFoundStat, req, res, 404);
        }
        return sendError(res, 404, 'Not Found');
    }

    serveFile(filePath, stat, req, res);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Try: PORT=3001 npm start`);
    } else {
        console.error(err);
    }
    process.exit(1);
});

server.listen(PORT, HOST, () => {
    console.log(`Serving ${ROOT_DIR}`);
    console.log(`  → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
