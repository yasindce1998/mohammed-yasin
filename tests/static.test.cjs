// Build-time checks for the generated static layer. Run with:
//   npm run test:static
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function runBuild() {
    execFileSync(process.execPath, ['scripts/build-static.js'], { cwd: ROOT, stdio: 'pipe' });
}

function read(rel) {
    return fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
}

function loadConfig() {
    // Build script writes a temporary .mjs; replicate the import here without
    // depending on Node's experimental CJS/ESM interop.
    const source = fs.readFileSync(path.join(PUBLIC, 'js', 'config.js'), 'utf8');
    const file = path.join(ROOT, 'tests', '.config.tmp.mjs');
    fs.writeFileSync(file, source);
    return import(`file://${file}?t=${Date.now()}`).finally(() => {
        fs.rmSync(file, { force: true });
    });
}

let config;
let projects;
test.before(async () => {
    runBuild();
    config = await loadConfig();
    projects = config.PROJECTS;
});

test('build emits the crawlable route set', () => {
    const required = [
        'index.html', '404.html', 'robots.txt', 'sitemap.xml', 'sw.js',
        'assets/meta/og.png', 'work/index.html', 'resume/index.html'
    ];
    for (const rel of required) {
        assert.ok(fs.existsSync(path.join(PUBLIC, rel)), `missing ${rel}`);
    }
    for (const project of projects) {
        assert.ok(fs.existsSync(path.join(PUBLIC, 'work', project.id, 'index.html')), `missing project page ${project.id}`);
    }
});

test('index.html has canonical, OG, and a visible pre-JS title', () => {
    const html = read('index.html');
    assert.match(html, /<link rel="canonical" href="https:\/\/mohammedyasin\.vercel\.app\/">/);
    assert.match(html, /og:image" content="https:\/\/mohammedyasin\.vercel\.app\/assets\/meta\/og\.png"/);
    assert.match(html, /twitter:card" content="summary_large_image"/);
    assert.match(html, /<h1 id="enter-title" class="enter-title">MOHAMMED YASIN<\/h1>/);
    assert.match(html, /boot-watchdog\.js/);
    assert.doesNotMatch(html, /__SITE_URL__/);
});

test('index.html no-JS and fallback lists are generated from config', () => {
    const html = read('index.html');
    assert.match(html, /<noscript>/);
    assert.match(html, /class="nojs-page"/);
    assert.match(html, /class="fallback-projects"/);
    for (const project of projects) {
        const href = `/work/${project.id}/`;
        assert.ok(html.includes(href), `fallback missing ${href}`);
    }
    // Build must be idempotent: no duplicated injected blocks.
    assert.equal((html.match(/class="nojs-page"/g) || []).length, 1);
    assert.equal((html.match(/class="fallback-projects"/g) || []).length, 2);
});

test('every project page has metadata, schema, and a source link', () => {
    for (const project of projects) {
        const html = read(path.join('work', project.id, 'index.html'));
        assert.ok(html.includes(`<title>${project.title} — Mohammed Yasin</title>`));
        assert.ok(html.includes(`https://mohammedyasin.vercel.app/work/${project.id}/`));
        assert.ok(html.includes(project.url));
        assert.ok(html.includes('application/ld+json'));
        assert.ok(html.includes('SoftwareSourceCode'));
        assert.ok(html.includes(project.tags[0]));
    }
});

test('work index and resume expose readable content without JavaScript', () => {
    const work = read('work/index.html');
    const resume = read('resume/index.html');
    for (const project of projects) {
        assert.ok(work.includes(`/work/${project.id}/`), `work index missing ${project.id}`);
        assert.ok(resume.includes(`/work/${project.id}/`), `resume missing ${project.id}`);
    }
    for (const item of config.EXPERIENCE) {
        assert.ok(resume.includes(item.company), `resume missing ${item.company}`);
    }
    assert.match(resume, /Print \/ Save as PDF/);
    assert.match(read('css/static.css'), /@media print/);
});

test('robots and sitemap cover every public route', () => {
    const robots = read('robots.txt');
    const sitemap = read('sitemap.xml');
    assert.match(robots, /Sitemap: https:\/\/mohammedyasin\.vercel\.app\/sitemap\.xml/);
    for (const url of ['/', '/work/', '/resume/', ...projects.map(p => `/work/${p.id}/`)]) {
        assert.ok(sitemap.includes(`https://mohammedyasin.vercel.app${url}<`), `sitemap missing ${url}`);
    }
});

test('service worker is versioned and precaches generated pages', () => {
    const sw = read('sw.js');
    assert.match(sw, /const VERSION = '[a-f0-9]{12}'/);
    assert.match(sw, /"\/"/);
    assert.match(sw, /"\/work\/"/);
    assert.match(sw, /"\/resume\/"/);
    for (const project of projects) {
        assert.ok(sw.includes(`"/work/${project.id}/"`), `sw missing ${project.id}`);
    }
    assert.doesNotMatch(sw, /"\/sw\.js"/);
});

test('OG image is a 1200x630 RGBA PNG', () => {
    const png = fs.readFileSync(path.join(PUBLIC, 'assets/meta/og.png'));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    assert.equal(png[24], 8);
    assert.equal(png[25], 6);
    assert.ok(png.length > 10000);
});

test('deployment config has a build step, security headers, and no SPA catch-all', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    assert.equal(vercel.buildCommand, 'node scripts/build-static.js');
    assert.equal(vercel.outputDirectory, 'public');
    assert.equal(vercel.rewrites, undefined);
    const headers = vercel.headers.flatMap(h => h.headers).map(h => h.key);
    assert.ok(headers.includes('Content-Security-Policy'));
    assert.ok(headers.includes('X-Content-Type-Options'));
    assert.ok(headers.includes('Cache-Control'));
});
