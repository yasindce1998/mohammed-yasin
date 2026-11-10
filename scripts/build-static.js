// Generates the crawlable static layer from public/js/config.js:
//   /work/, /work/<id>/, /resume/, /404.html, robots.txt, sitemap.xml,
//   assets/meta/og.png, and a versioned service worker precache manifest.
// The runtime stays dependency-free; this is a build-time Node script.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { renderOG } = require('./png');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const SITE_URL = 'https://mohammedyasin.vercel.app';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

async function loadConfig() {
    const source = fs.readFileSync(path.join(PUBLIC, 'js', 'config.js'), 'utf8');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-config-'));
    const file = path.join(dir, 'config.mjs');
    fs.writeFileSync(file, source);
    try {
        return await import(pathToFileURL(file).href);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function nav(active = '') {
    const link = (href, label, key) =>
        `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
    return `<header class="site-header">
    <a class="site-brand" href="/" aria-label="Mohammed Yasin — home">
        <span class="site-mark" aria-hidden="true"></span>
        <span>MOHAMMED YASIN</span>
    </a>
    <nav class="site-nav" aria-label="Primary">
        ${link('/work/', 'WORK', 'work')}
        ${link('/resume/', 'RÉSUMÉ', 'resume')}
        <a href="https://github.com/yasindce1998" target="_blank" rel="noopener noreferrer">GITHUB ↗</a>
    </nav>
</header>`;
}

function footer(owner) {
    return `<footer class="site-footer">
    <p>${escapeHtml(owner.role)} · ${escapeHtml(owner.location)}</p>
    <p>
        <a href="mailto:${escapeAttr(owner.email)}">${escapeHtml(owner.email)}</a>
        <span aria-hidden="true"> / </span>
        <a href="${escapeAttr(owner.github)}" target="_blank" rel="noopener noreferrer">GitHub</a>
        <span aria-hidden="true"> / </span>
        <a href="${escapeAttr(owner.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        <span aria-hidden="true"> / </span>
        <a href="${escapeAttr(owner.twitter)}" target="_blank" rel="noopener noreferrer">X</a>
    </p>
</footer>`;
}

function shell({ title, description, canonical, body, ogImage = `${SITE_URL}/assets/meta/og.png`, structuredData = null, active = '', noindex = false }) {
    const jsonLd = structuredData
        ? `\n    <script type="application/ld+json">${JSON.stringify(structuredData)}</script>`
        : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#050508">
    <meta name="color-scheme" content="dark">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttr(description)}">
    ${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index,follow">'}
    <link rel="canonical" href="${escapeAttr(canonical)}">
    <meta property="og:site_name" content="Mohammed Yasin">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeAttr(title)}">
    <meta property="og:description" content="${escapeAttr(description)}">
    <meta property="og:url" content="${escapeAttr(canonical)}">
    <meta property="og:image" content="${escapeAttr(ogImage)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Mohammed Yasin — Security Engineer and Digital Architect">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeAttr(title)}">
    <meta name="twitter:description" content="${escapeAttr(description)}">
    <meta name="twitter:image" content="${escapeAttr(ogImage)}">
    <meta name="twitter:site" content="@yasindce1998">
    <meta name="twitter:creator" content="@yasindce1998">
    <link rel="manifest" href="/manifest.webmanifest">
    <link rel="icon" href="/assets/meta/icon-192.png" sizes="192x192">
    <link rel="apple-touch-icon" href="/assets/meta/apple-touch-icon.png">
    <link rel="preload" href="/fonts/space-grotesk.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/fonts/space-mono-400.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/css/static.css">${jsonLd}
</head>
<body>
    <a class="skip-link" href="#main">Skip to content</a>
    ${nav(active)}
    <main id="main" tabindex="-1">
${body}
    </main>
    ${footer({ role: 'Security Engineer & Digital Architect', location: 'Bengaluru, India', email: 'yasindce1998@gmail.com', github: 'https://github.com/yasindce1998', linkedin: 'https://linkedin.com/in/mohammed-yasin-4660b9206', twitter: 'https://x.com/yasindce1998' })}
    <script src="/js/static.js" defer></script>
</body>
</html>
`;
}

function projectCard(project) {
    return `<article class="work-card">
    <div class="work-card-top">
        <span class="eyebrow">[ ${escapeHtml(project.num)} // ${escapeHtml(project.category)} ]</span>
        <span class="muted">${escapeHtml(project.status)} · ${escapeHtml(project.year)}</span>
    </div>
    <h2><a href="/work/${escapeAttr(project.id)}/">${escapeHtml(project.title)}</a></h2>
    <p class="work-tagline">${escapeHtml(project.tagline)}</p>
    <p>${escapeHtml(project.subtitle)}</p>
    <ul class="tag-list" aria-label="Technology">
        ${project.tags.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
    </ul>
    <a class="text-link" href="/work/${escapeAttr(project.id)}/">Read case study →</a>
</article>`;
}

function workIndex({ projects, site, about }) {
    const body = `        <section class="page-intro">
            <p class="eyebrow">[ SELECTED WORK ]</p>
            <h1>Security engineering, from ring 0 to cloud.</h1>
            <p class="lede">${escapeHtml(about.summary)}</p>
        </section>
        <section class="work-grid" aria-label="Projects">
            ${projects.map(projectCard).join('\n            ')}
        </section>
        <section class="cta-row">
            <a class="button" href="/resume/">View résumé</a>
            <a class="button button-quiet" href="/">Open the interactive portfolio</a>
        </section>`;
    return shell({
        title: `Selected Work — Mohammed Yasin`,
        description: 'Open-source security engineering projects across eBPF, Linux kernel research, Kubernetes offense, AI agent containment, firmware, telecom, and runtime defense.',
        canonical: `${site.url}/work/`,
        body,
        active: 'work',
        structuredData: {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Selected Work — Mohammed Yasin',
            url: `${site.url}/work/`,
            mainEntity: {
                '@type': 'ItemList',
                itemListElement: projects.map((p, i) => ({
                    '@type': 'ListItem',
                    position: i + 1,
                    url: `${site.url}/work/${p.id}/`,
                    name: p.title
                }))
            }
        }
    });
}

function projectPage({ project, prev, next, site, owner }) {
    const desc = project.description;
    const body = `        <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="/">Home</a> <span aria-hidden="true">/</span>
            <a href="/work/">Work</a> <span aria-hidden="true">/</span>
            <span aria-current="page">${escapeHtml(project.title)}</span>
        </nav>
        <article class="case-study">
            <header>
                <p class="eyebrow">[ ${escapeHtml(project.num)} // ${escapeHtml(project.category)} · ${escapeHtml(project.year)} ]</p>
                <h1>${escapeHtml(project.title)}</h1>
                <p class="lede">${escapeHtml(project.tagline)}</p>
                <ul class="tag-list" aria-label="Technology">
                    ${project.tags.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
                </ul>
            </header>

            <div class="case-grid">
                <section>
                    <h2>Overview</h2>
                    <p>${escapeHtml(desc)}</p>

                    <h2>What it does</h2>
                    <pre class="terminal-lines" aria-label="Example terminal output">${project.logs.map(l => escapeHtml(l)).join('\n')}</pre>
                </section>
                <aside class="case-meta">
                    <dl>
                        <div><dt>Focus</dt><dd>${escapeHtml(project.focus)}</dd></div>
                        <div><dt>Year</dt><dd>${escapeHtml(project.year)}</dd></div>
                        <div><dt>Status</dt><dd>${escapeHtml(project.status)}</dd></div>
                        <div><dt>Repository</dt><dd><a href="${escapeAttr(project.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(project.url.replace('https://', ''))}</a></dd></div>
                    </dl>
                    <a class="button" href="${escapeAttr(project.url)}" target="_blank" rel="noopener noreferrer">View source ↗</a>
                </aside>
            </div>

            <nav class="project-pager" aria-label="More projects">
                ${prev ? `<a class="pager-prev" href="/work/${escapeAttr(prev.id)}/"><span class="muted">← Previous</span><strong>${escapeHtml(prev.title)}</strong></a>` : ''}
                ${next ? `<a class="pager-next" href="/work/${escapeAttr(next.id)}/"><span class="muted">Next →</span><strong>${escapeHtml(next.title)}</strong></a>` : ''}
            </nav>
            <p class="back-link"><a href="/work/">← All work</a></p>
        </article>`;
    return shell({
        title: `${project.title} — Mohammed Yasin`,
        description: `${project.tagline} ${project.subtitle}`,
        canonical: `${site.url}/work/${project.id}/`,
        body,
        active: 'work',
        structuredData: {
            '@context': 'https://schema.org',
            '@type': 'SoftwareSourceCode',
            name: project.title,
            description: desc,
            codeRepository: project.url,
            programmingLanguage: project.tags.join(', '),
            author: { '@type': 'Person', name: owner.name, url: site.url },
            dateCreated: project.year,
            keywords: project.tags.join(', '),
            url: `${site.url}/work/${project.id}/`
        }
    });
}

function resumePage({ owner, about, experience, clients, projects, skills, site }) {
    const body = `        <section class="resume-head">
            <p class="eyebrow">[ RÉSUMÉ ]</p>
            <h1>${escapeHtml(owner.name)}</h1>
            <p class="lede">${escapeHtml(owner.role)} · ${escapeHtml(owner.location)}</p>
            <p class="contact-line">
                <a href="mailto:${escapeAttr(owner.email)}">${escapeHtml(owner.email)}</a>
                <span aria-hidden="true"> / </span>
                <a href="${escapeAttr(owner.github)}" target="_blank" rel="noopener noreferrer">GitHub</a>
                <span aria-hidden="true"> / </span>
                <a href="${escapeAttr(owner.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
                <span aria-hidden="true"> / </span>
                <a href="${escapeAttr(owner.leetcode)}" target="_blank" rel="noopener noreferrer">LeetCode</a>
            </p>
            <p class="no-print"><button class="button" type="button" data-print>Print / Save as PDF</button></p>
        </section>

        <section class="resume-section">
            <h2>Summary</h2>
            <p>${escapeHtml(about.summary)}</p>
            <ul class="stat-row">
                ${about.stats.map(s => `<li><strong>${escapeHtml(s.value)}</strong><span>${escapeHtml(s.label)}</span></li>`).join('')}
            </ul>
        </section>

        <section class="resume-section">
            <h2>Experience</h2>
            <ol class="timeline">
                ${experience.map(e => `<li><div><strong>${escapeHtml(e.role)}</strong><span class="muted">${escapeHtml(e.company)}</span></div><span class="period">${escapeHtml(e.period)}</span></li>`).join('')}
            </ol>
        </section>

        <section class="resume-section">
            <h2>Selected client work</h2>
            <ul class="client-list">
                ${clients.map(c => `<li><strong>${escapeHtml(c.client)}</strong> <span class="muted">via ${escapeHtml(c.via)}</span><p>${escapeHtml(c.note)}</p></li>`).join('')}
            </ul>
        </section>

        <section class="resume-section">
            <h2>Open-source &amp; research</h2>
            <ul class="project-list">
                ${projects.map(p => `<li><a href="/work/${escapeAttr(p.id)}/"><strong>${escapeHtml(p.title)}</strong></a> — ${escapeHtml(p.tagline)}<span class="muted"> · ${escapeHtml(p.tags.join(', '))}</span></li>`).join('')}
            </ul>
        </section>

        <section class="resume-section">
            <h2>Skills</h2>
            <ul class="tag-list">${skills.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
        </section>

        <p class="resume-note no-print">This page is print-optimised. Use <strong>Print / Save as PDF</strong> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>P</kbd>. A downloadable PDF is not bundled because it would duplicate this source of truth.</p>`;
    return shell({
        title: `Résumé — Mohammed Yasin`,
        description: `${owner.name} — ${owner.role}. Experience across IBM, EPAM, Infosys, and AccuKnox; eBPF, Rust, Golang, Kubernetes, and security engineering.`,
        canonical: `${site.url}/resume/`,
        body,
        active: 'resume',
        structuredData: {
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: owner.name,
            jobTitle: owner.role,
            email: `mailto:${owner.email}`,
            url: `${site.url}/resume/`,
            address: { '@type': 'PostalAddress', addressLocality: 'Bengaluru', addressCountry: 'IN' },
            sameAs: [owner.github, owner.linkedin, owner.twitter, owner.leetcode],
            knowsAbout: skills
        }
    });
}

function notFoundPage({ owner, site }) {
    const body = `        <section class="page-intro compact">
            <p class="eyebrow">[ 404 // ROUTE NOT FOUND ]</p>
            <h1>That route does not exist.</h1>
            <p class="lede">The link may be old, or the project may have moved. Try the work index or the interactive portfolio.</p>
            <div class="cta-row">
                <a class="button" href="/work/">Browse work</a>
                <a class="button button-quiet" href="/">Open portfolio</a>
            </div>
            <p class="muted">Still stuck? <a href="mailto:${escapeAttr(owner.email)}">${escapeHtml(owner.email)}</a></p>
        </section>`;
    return shell({
        title: '404 — Mohammed Yasin',
        description: 'Page not found.',
        canonical: `${site.url}/404.html`,
        body,
        active: '',
        noindex: true
    });
}

// Static list injected into index.html so the no-JS and fallback experiences
// are generated from the same config as the interactive ribbon.
function projectListMarkup(projects, { heading = 'Selected work' } = {}) {
    return `<div class="fallback-projects">
    <h2>${escapeHtml(heading)}</h2>
    <ul>
        ${projects.map(p => `<li><a href="/work/${escapeAttr(p.id)}/"><strong>${escapeHtml(p.title)}</strong></a> — ${escapeHtml(p.tagline)}</li>`).join('\n        ')}
    </ul>
</div>`;
}

function injectIndex({ projects, about, owner }) {
    const file = path.join(PUBLIC, 'index.html');
    let html = fs.readFileSync(file, 'utf8');
    const list = projectListMarkup(projects);
    const noJs = `<noscript>
    <style>
        html, body { overflow: auto !important; height: auto !important; }
        #enter, .top, #content, .bottom-bar, .frame, #cursor, #gl { display: none !important; }
        .nojs-page { display: block; position: relative; max-width: 760px; margin: 0 auto; padding: 72px 24px 96px; }
    </style>
    <div class="nojs-page">
        <p class="fallback-kicker">[ NO JAVASCRIPT ]</p>
        <h1>Mohammed Yasin</h1>
        <p class="fallback-role">${escapeHtml(owner.role)} · ${escapeHtml(owner.location)}</p>
        <p>${escapeHtml(about.summary)}</p>
        ${projectListMarkup(projects, { heading: 'Selected work' })}
        <p><a href="/resume/">Résumé</a> · <a href="mailto:${escapeAttr(owner.email)}">Email</a> · <a href="${escapeAttr(owner.github)}">GitHub</a> · <a href="${escapeAttr(owner.linkedin)}">LinkedIn</a></p>
        <p class="muted">The interactive WebGL ribbon needs JavaScript. Every project above has a crawlable page.</p>
    </div>
</noscript>`;

    html = replaceBetween(html, 'BUILD:NOJS', noJs);
    html = replaceBetween(html, 'BUILD:FALLBACK-PROJECTS', projectListMarkup(projects));
    html = html.replaceAll('__SITE_URL__', SITE_URL);
    fs.writeFileSync(file, html);
    return { list };
}

function replaceBetween(source, marker, replacement) {
    const re = new RegExp(`(<!-- ${marker}:START -->)[\\s\\S]*?(<!-- ${marker}:END -->)`);
    if (!re.test(source)) throw new Error(`Missing ${marker} markers in index.html`);
    return source.replace(re, `$1\n${replacement}\n$2`);
}

function walk(dir, base = PUBLIC, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, base, out);
        } else {
            out.push(full);
        }
    }
    return out;
}

function assetUrl(file) {
    let rel = path.relative(PUBLIC, file).split(path.sep).join('/');
    if (rel === 'index.html') return '/';
    if (rel.endsWith('/index.html')) rel = rel.slice(0, -'index.html'.length);
    return `/${rel}`;
}

function collectPrecache() {
    const exts = new Set(['.html', '.css', '.js', '.woff2', '.png', '.webmanifest', '.svg']);
    return walk(PUBLIC)
        .filter(f => !f.endsWith(`${path.sep}sw.js`))
        .filter(f => exts.has(path.extname(f)))
        .map(assetUrl)
        .filter(u => u !== '/404.html')
        .sort();
}

function writeServiceWorker(site) {
    const assets = collectPrecache();
    const hash = crypto.createHash('sha256');
    for (const url of assets) {
        const rel = url === '/' ? 'index.html' : url.endsWith('/') ? `${url.slice(1)}index.html` : url.slice(1);
        const file = path.join(PUBLIC, rel);
        hash.update(url);
        hash.update(fs.readFileSync(file));
    }
    const version = hash.digest('hex').slice(0, 12);
    const source = `// Generated by scripts/build-static.js. Do not edit by hand.
const VERSION = '${version}';
const CACHE = 'portfolio-' + VERSION;
const PRECACHE = ${JSON.stringify(assets, null, 4)};

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
        );
        return;
    }

    if (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/') ||
        url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/assets/')) {
        event.respondWith(
            caches.match(request).then((cached) => cached || fetch(request).then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE).then((cache) => cache.put(request, copy));
                }
                return response;
            }))
        );
    }
});
`;
    fs.writeFileSync(path.join(PUBLIC, 'sw.js'), source);
    return { version, assets };
}

function writeSitemap(site, projects) {
    const urls = ['/', '/work/', '/resume/', ...projects.map(p => `/work/${p.id}/`)];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `    <url><loc>${site.url}${u}</loc></url>`).join('\n')}
</urlset>
`;
    fs.writeFileSync(path.join(PUBLIC, 'sitemap.xml'), xml);
}

function writeRobots(site) {
    fs.writeFileSync(path.join(PUBLIC, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);
}

function writeFile(rel, content) {
    const file = path.join(PUBLIC, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
}

async function main() {
    const config = await loadConfig();
    const projects = config.PROJECTS;
    const owner = config.OWNER;
    const site = config.SITE || { url: SITE_URL, title: '', description: '', locale: 'en_US' };

    const about = config.ABOUT;
    const experience = config.EXPERIENCE;
    const clients = config.CLIENT_WORK;
    const skills = config.SKILLS || [];

    // Root JSON-LD and canonical are maintained in index.html; static pages
    // get their own generated metadata below.
    writeFile('work/index.html', workIndex({ projects, site, about }));
    projects.forEach((project, i) => {
        writeFile(
            path.join('work', project.id, 'index.html'),
            projectPage({
                project,
                prev: projects[(i - 1 + projects.length) % projects.length],
                next: projects[(i + 1) % projects.length],
                site,
                owner
            })
        );
    });
    writeFile('resume/index.html', resumePage({ owner, about, experience, clients, projects, skills, site }));
    writeFile('404.html', notFoundPage({ owner, site }));
    writeSitemap(site, projects);
    writeRobots(site);
    injectIndex({ projects, about, owner });

    const og = renderOG();
    writeFile(path.join('assets', 'meta', 'og.png'), og);

    const sw = writeServiceWorker(site);
    console.log(`Generated ${projects.length} project pages, /work/, /resume/, /404.html, robots.txt, sitemap.xml, og.png`);
    console.log(`Service worker portfolio-${sw.version} precaches ${sw.assets.length} assets`);

    // Fail the build if an obvious content/config mismatch slips through.
    const indexHtml = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
    for (const p of projects) {
        if (!indexHtml.includes(`/work/${p.id}/`)) throw new Error(`index fallback missing ${p.title}`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
