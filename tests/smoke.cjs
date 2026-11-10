// End-to-end smoke suite for the interactive experience and the static layer.
// Uses the Playwright library directly so the repo has one test entry point:
//   npm run test:e2e
//
// In CI, `npx playwright install chromium` provides the browser. Locally you
// can point at an existing Chromium with PLAYWRIGHT_CHROMIUM_EXECUTABLE.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = 7900 + Math.floor(Math.random() * 80);
const BASE = `http://127.0.0.1:${PORT}`;
const HOST = '127.0.0.1';

function loadPlaywright() {
    const candidates = [
        'playwright',
        process.env.PLAYWRIGHT_MODULE,
        '/home/yasin/.npm/_npx/9833c18b2d85bc59/node_modules/playwright'
    ].filter(Boolean);
    for (const candidate of candidates) {
        try {
            return require(candidate);
        } catch (e) { /* try next */ }
    }
    throw new Error('Playwright is not installed. Run `npm install` and `npx playwright install chromium`.');
}

function loadConfig() {
    const source = fs.readFileSync(path.join(PUBLIC, 'js', 'config.js'), 'utf8');
    const file = path.join(__dirname, '.config.tmp.mjs');
    fs.writeFileSync(file, source);
    return import(`file://${file}?t=${Date.now()}`).finally(() => fs.rmSync(file, { force: true }));
}

// Playwright version updates can change the browser revision it expects. When
// the exact revision is unavailable but another Chromium build is in the local
// cache, use that instead of failing before the suite starts.
function findLocalChromium() {
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
    const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
    if (!fs.existsSync(cache)) return undefined;
    const candidates = fs.readdirSync(cache)
        .filter(name => /^chromium-\d+$/.test(name))
        .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const name of candidates) {
        for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
            const file = path.join(cache, name, rel);
            if (fs.existsSync(file)) return file;
        }
    }
    return undefined;
}

function waitForServer(url, timeout = 15000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
        const tick = async () => {
            try {
                const response = await fetch(url);
                if (response.ok) return resolve();
            } catch (e) { /* not ready */ }
            if (Date.now() - started > timeout) return reject(new Error(`server did not start: ${url}`));
            setTimeout(tick, 100);
        };
        tick();
    });
}

const results = [];
async function check(name, fn) {
    try {
        await fn();
        results.push({ name, ok: true });
        console.log(`  ✓ ${name}`);
    } catch (error) {
        results.push({ name, ok: false, error });
        console.log(`  ✗ ${name}: ${error.message}`);
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function main() {
    const config = await loadConfig();
    const { chromium } = loadPlaywright();
    const executablePath = findLocalChromium();
    const server = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(PORT), HOST, ROOT: PUBLIC },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverOutput = '';
    server.stdout.on('data', (d) => { serverOutput += d; });
    server.stderr.on('data', (d) => { serverOutput += d; });

    try {
        await waitForServer(`${BASE}/`);

        console.log('\nHTTP / static routes');
        const routes = ['/', '/work/', '/resume/', '/404.html', '/robots.txt', '/sitemap.xml', '/sw.js', '/assets/meta/og.png'];
        for (const project of config.PROJECTS) routes.push(`/work/${project.id}/`);
        for (const route of routes) {
            await check(`GET ${route}`, async () => {
                const response = await fetch(BASE + route);
                assertEqual(response.status, 200, 'status');
                const type = response.headers.get('content-type') || '';
                if (route === '/') assert(type.includes('text/html'), 'html content type');
                if (route.endsWith('.js')) assert(type.includes('javascript'), 'js content type');
                if (route.endsWith('.xml')) assert(type.includes('xml'), 'xml content type');
            });
        }

        await check('unknown route returns generated 404 page', async () => {
            const response = await fetch(`${BASE}/definitely-not-a-route`);
            assertEqual(response.status, 404, 'status');
            const body = await response.text();
            assert(body.includes('That route does not exist.'), '404 body');
        });

        await check('security and cache headers are present', async () => {
            const response = await fetch(`${BASE}/`);
            const csp = response.headers.get('content-security-policy') || '';
            assert(csp.includes("script-src 'self'"), 'CSP script-src');
            assertEqual(response.headers.get('x-content-type-options'), 'nosniff', 'nosniff');
            assert(response.headers.get('cache-control').includes('no-cache'), 'html cache policy');
        });

        const browser = await chromium.launch({
            executablePath,
            args: [
                '--no-sandbox',
                '--use-angle=swiftshader',
                '--enable-unsafe-swiftshader',
                '--disable-gpu-sandbox'
            ]
        });
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();
        const consoleProblems = [];
        page.on('console', (message) => {
            if (message.type() === 'error' || message.type() === 'warning') {
                consoleProblems.push(`${message.type()}: ${message.text()}`);
            }
        });
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));

        console.log('\nInteractive experience');
        await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
        await check('pre-JS splash title is present', async () => {
            const title = page.locator('#enter-title');
            assertEqual((await title.textContent()).trim(), 'MOHAMMED YASIN', 'title text');
            assert(await title.isVisible(), 'title is visible before the canvas takes over');
        });

        await page.waitForFunction(() => {
            const root = document.documentElement;
            return window.__portfolioBoot === 'ready' ||
                root.classList.contains('no-webgl') ||
                root.classList.contains('boot-timeout');
        }, null, { timeout: 60000 });

        await check('WebGL boot completes and unlocks the enter actions', async () => {
            const state = await page.evaluate(() => window.__portfolioBoot);
            assertEqual(state, 'ready', 'boot state');
            assert(await page.locator('#enter-silent').isEnabled(), 'silent enter enabled');
            assert(await page.locator('#enter-sound').isEnabled(), 'sound enter enabled');
            const label = await page.locator('#enter-progress-label').textContent();
            assert(label.includes('SYSTEMS ONLINE'), 'boot label');
        });

        await check('enter action reveals the ribbon UI and moves focus', async () => {
            await page.locator('#enter-silent').click();
            await page.waitForFunction(() => document.documentElement.classList.contains('entered'));
            assert(await page.locator('#gl').isVisible(), 'canvas visible');
            assert(await page.locator('.bottom-bar').isVisible(), 'bottom bar visible');
            const activeId = await page.evaluate(() => document.activeElement && document.activeElement.id);
            assertEqual(activeId, 'content', 'focus moved to main content');
        });

        await check('project metadata and counter are populated', async () => {
            await page.waitForTimeout(250);
            const title = await page.locator('#project-title').getAttribute('aria-label');
            assert(title && title.length > 0, 'project title');
            const counter = (await page.locator('#project-counter').textContent()).trim();
            assert(/\[\s*01\s*\/\s*07\s*\]/.test(counter), `counter: ${counter}`);
        });

        await check('case study modal opens with full-page and source links', async () => {
            const current = await page.evaluate(() => {
                const el = document.getElementById('project-title');
                return el ? (el.getAttribute('aria-label') || el.textContent) : '';
            });
            await page.locator('#btn-view-project').click();
            await page.waitForFunction(() => document.getElementById('case-study-modal').classList.contains('active'));
            const modalTitle = (await page.locator('#modal-title').textContent()).trim();
            assertEqual(modalTitle, current, 'modal title');
            const fullPage = await page.locator('#modal-fullpage').getAttribute('href');
            assert(/^\/work\/[a-z0-9-]+\/$/.test(fullPage), `full page link: ${fullPage}`);
            const source = await page.locator('#modal-launch').getAttribute('href');
            assert(source.startsWith('https://github.com/'), 'source link');
            assert((await page.title()).includes('Mohammed Yasin'), 'document title updated');
            assert((await page.evaluate(() => location.hash)).startsWith('#/'), 'hash deep link');
        });

        await check('Escape closes the modal and restores focus/title', async () => {
            const original = 'Mohammed Yasin — Security Engineer & Digital Architect';
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => !document.getElementById('case-study-modal').classList.contains('active'));
            assertEqual(await page.title(), original, 'document title restored');
            const inertCount = await page.evaluate(() => document.querySelectorAll('[inert]').length);
            assertEqual(inertCount, 0, 'background inert cleared');
        });

        await check('category filter updates the visible ribbon set', async () => {
            await page.locator('.tab-btn[data-filter="DEFENSE"]').click();
            await page.waitForTimeout(150);
            const filtered = await page.locator('.pag-dot.filtered-out').count();
            assertEqual(filtered, 5, 'defense filter hides five projects');
            assert(await page.locator('.tab-btn[data-filter="DEFENSE"]').evaluate(el => el.classList.contains('active')), 'active tab');
            await page.locator('.tab-btn[data-filter="ALL"]').click();
            await page.waitForTimeout(150);
            assertEqual(await page.locator('.pag-dot.filtered-out').count(), 0, 'ALL restores dots');
        });

        await check('keyboard navigation changes the focused project', async () => {
            const before = await page.locator('#sr-status').textContent();
            await page.keyboard.press('ArrowRight');
            // The announcement fires when the ribbon spring crosses into the
            // next slot. SwiftShader in CI is slow enough that a fixed sleep is
            // flaky, so wait for the state change instead of guessing a frame
            // budget.
            await page.waitForFunction(
                (previous) => {
                    const status = document.getElementById('sr-status');
                    return !!status && status.textContent !== previous;
                },
                before,
                { timeout: 15000 }
            );
            const after = await page.locator('#sr-status').textContent();
            assert(before !== after, 'status announced a different project');
        });

        await check('mobile layout has no horizontal overflow', async () => {
            await page.setViewportSize({ width: 360, height: 740 });
            await page.waitForTimeout(250);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            assert(overflow <= 1, `horizontal overflow: ${overflow}px`);
        });

        await check('no console errors or page exceptions', async () => {
            assertEqual(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
            assertEqual(consoleProblems.length, 0, `console problems: ${consoleProblems.join(' | ')}`);
        });

        await check('service worker is not registered on localhost by default', async () => {
            const count = await page.evaluate(async () => {
                if (!navigator.serviceWorker) return 0;
                const regs = await navigator.serviceWorker.getRegistrations();
                return regs.length;
            });
            assertEqual(count, 0, 'registration count');
        });

        await check('deep link opens the matching case study after entry', async () => {
            const deep = await context.newPage();
            await deep.goto(`${BASE}/#/neurontrace`, { waitUntil: 'domcontentloaded' });
            await deep.waitForFunction(() => window.__portfolioBoot === 'ready', null, { timeout: 60000 });
            await deep.locator('#enter-silent').click();
            await deep.waitForFunction(() => document.getElementById('case-study-modal').classList.contains('active'), null, { timeout: 15000 });
            assertEqual((await deep.locator('#modal-title').textContent()).trim(), 'NeuronTrace', 'deep-linked project');
            await deep.close();
        });

        await check('reduced motion enters without waiting for the cinematic intro', async () => {
            const reduced = await context.newPage();
            await reduced.emulateMedia({ reducedMotion: 'reduce' });
            await reduced.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
            await reduced.waitForFunction(() => window.__portfolioBoot === 'ready', null, { timeout: 60000 });
            await reduced.locator('#enter-silent').click();
            await reduced.waitForFunction(() => document.documentElement.classList.contains('entered'));
            await reduced.waitForTimeout(100);
            assert(await reduced.locator('#project-title').isVisible(), 'project title visible');
            await reduced.close();
        });

        await check('the main page exposes OG/Twitter metadata', async () => {
            const meta = await page.evaluate(() => ({
                og: document.querySelector('meta[property="og:image"]')?.content,
                twitter: document.querySelector('meta[name="twitter:card"]')?.content,
                canonical: document.querySelector('link[rel="canonical"]')?.href
            }));
            assert(meta.og.includes('/assets/meta/og.png'), 'og image');
            assertEqual(meta.twitter, 'summary_large_image', 'twitter card');
            assert(meta.canonical.endsWith('/'), 'canonical');
        });

        await page.close();
        await context.close();

        console.log('\nNo-JavaScript and static pages');
        const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
        const noJsPage = await noJs.newPage();

        await check('home page renders its no-JS project index', async () => {
            await noJsPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
            assert(await noJsPage.locator('.nojs-page').isVisible(), 'no-JS page visible');
            assertEqual(await noJsPage.locator('.nojs-page .fallback-projects li').count(), config.PROJECTS.length, 'project count');
            assert(await noJsPage.locator('.nojs-page a[href="/resume/"]').isVisible(), 'resume link');
        });

        await check('work index is readable without JavaScript', async () => {
            await noJsPage.goto(`${BASE}/work/`, { waitUntil: 'domcontentloaded' });
            assert((await noJsPage.locator('h1').textContent()).includes('Security engineering'), 'work heading');
            assertEqual(await noJsPage.locator('.work-card').count(), config.PROJECTS.length, 'work cards');
        });

        await check('project case studies are readable without JavaScript', async () => {
            await noJsPage.goto(`${BASE}/work/redhands/`, { waitUntil: 'domcontentloaded' });
            assertEqual((await noJsPage.locator('h1').textContent()).trim(), 'RedHands', 'case study heading');
            assert(await noJsPage.locator('a[href*="github.com/yasindce1998/RedHands"]').count() > 0, 'source link');
            assert(await noJsPage.locator('.terminal-lines').isVisible(), 'terminal lines');
        });

        await check('resume is readable and print-optimised', async () => {
            await noJsPage.goto(`${BASE}/resume/`, { waitUntil: 'domcontentloaded' });
            assert((await noJsPage.locator('h1').textContent()).includes('Mohammed Yasin'), 'resume heading');
            assert(await noJsPage.locator('[data-print]').isVisible(), 'print button');
            for (const item of config.EXPERIENCE) {
                assert((await noJsPage.content()).includes(item.company), `resume company ${item.company}`);
            }
        });

        await check('static pages do not overflow at 320px', async () => {
            for (const route of ['/work/', '/work/redhands/', '/resume/', '/404.html']) {
                await noJsPage.setViewportSize({ width: 320, height: 700 });
                await noJsPage.goto(BASE + route, { waitUntil: 'domcontentloaded' });
                const overflow = await noJsPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
                assert(overflow <= 1, `${route} overflow ${overflow}px`);
            }
        });

        await noJs.close();
        await browser.close();

        const failures = results.filter(r => !r.ok);
        console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
        if (failures.length) {
            console.error(`\n${failures.length} failed:`);
            for (const failure of failures) console.error(` - ${failure.name}: ${failure.error.stack || failure.error.message}`);
            process.exitCode = 1;
        }
    } catch (error) {
        console.error('\nSmoke suite crashed:', error);
        if (serverOutput) console.error(serverOutput);
        process.exitCode = 1;
    } finally {
        server.kill('SIGTERM');
    }
}

main();
