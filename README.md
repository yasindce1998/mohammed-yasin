# Mohammed Yasin · Immersive WebGL Portfolio

Security engineer working on kernel-level offense and cloud-native defense. This portfolio is a real-time WebGL 2 experience: open-source projects sit on a curved 3D ribbon you can drag and fling, with liquid-displacement shaders, a GPU fluid sim, synthesized Web Audio, and full case-study views. The runtime has no dependencies, no bundler, and no external assets.

```bash
npm start            # or: node server.js, ./start.sh, start.bat
npm run build        # regenerate the static layer, OG image, sitemap, and SW
```

Open **http://localhost:7890**. Drag to explore, click a card to open its case study, use the arrow keys to step between projects, and press **G** for the live parameter panel.

## Content

All portfolio content is in [`public/js/config.js`](public/js/config.js):

| Export | What it drives |
| :--- | :--- |
| `SITE` | Canonical URL, title, description for generated pages and metadata |
| `OWNER` | Name, role, location/timezone (header clock), contact links |
| `ABOUT` | About-modal summary and stats, also used by `/resume/` |
| `PROJECTS` | The ribbon cards, case studies, `/work/` pages, sitemap, and service-worker precache |
| `EXPERIENCE` | Experience timeline in the About modal and résumé |
| `CLIENT_WORK` | Proprietary client work in the About modal and résumé |
| `SKILLS` | Skills list on the résumé and in JSON-LD |

To add a project, append an entry to `PROJECTS`, run `npm run build`, and add a matching `drawProjectArt` branch in [`cards.js`](public/js/cards.js) for its schematic. Projects without a branch get the default radar art.

## Static layer

`npm run build` ([`scripts/build-static.js`](scripts/build-static.js)) generates:

- `/work/` — crawlable index of every project
- `/work/<id>/` — per-project case study with metadata, JSON-LD, and prev/next links
- `/resume/` — printable résumé with an honest "Print / Save as PDF" flow
- `/404.html`, `robots.txt`, `sitemap.xml`
- `assets/meta/og.png` — 1200×630 social card, generated without native dependencies
- `sw.js` — versioned offline cache; registered only over HTTPS (or `?sw=1` locally)

`index.html` also gets its no-JS and WebGL-failure project lists injected from `config.js`, so those fallbacks cannot drift from the real content. The build is deterministic; CI fails if generated files are stale.

## Features

- **Boot sequence**: the enter screen reports real initialization work (shader compilation, GPGPU particle upload, per-project card rasterization) with a progress readout before unlocking the ENTER buttons.
- **Dot-matrix splash title**: the name is sampled into a dot grid that converges on load, repels from the pointer, and scatters into the scene on entry.
- **Pointer flashlight**: a soft cool glow follows the cursor across the graded scene (tunable as `flashlight` in the live panel).
- **Category filters** (`ALL / OFFENSE / DEFENSE / RESEARCH`): filtered-out cards shrink and fade off the ribbon, and dragging, arrow keys and pagination only cycle through the visible set.
- **Deep links**: `/#/<project-id>` (e.g. `/#/neurontrace`) jumps to that project and opens its case study once you enter. The hash updates as case studies open and close.
- **Security-console card art**: every card is drawn procedurally on a canvas, with scan lines, terminal logs that type themselves as you hover, and a schematic for its domain (agent toolchain, ring-0 mirror, container breakout, syscall fence, boot chain, eBPF↔WASM bridge, rogue-tower radar).
- **Click bursts**: selecting a card sprays accent-colored sparks toward the camera.
- **HUD telemetry**: live FPS / particle count / render-quality readout next to the Bengaluru clock.
- **Accessibility layer**: a visually hidden DOM mirror of the ribbon (revealed on focus), a skip link, a polite live region, focus trapping, `inert` backgrounds behind dialogs, and a keyboard-first enter flow.
- **No-JS / WebGL fallback**: the full project index, résumé, and contact links remain usable without JavaScript; a boot watchdog replaces a stalled splash after 15 seconds.
- **Installable / offline**: manifest, generated icons, iOS standalone meta, and an opt-in service worker with network-first navigation.
- **Self-hosted type**: Space Grotesk + Space Mono (SIL OFL, see [OFL.txt](public/fonts/OFL.txt)) with no external font requests.
- **SEO / sharing**: canonical URLs, Open Graph / Twitter large-image cards, generated OG image, sitemap, robots, and JSON-LD for the person and each project.
- **Analytics-ready, not analytics-dependent**: [`analytics.js`](public/js/analytics.js) forwards events to `window.va`, Plausible, or gtag only if the host enables one, and always emits a `portfolio:analytics` DOM event.

## Deploying to Vercel

The site is fully static. `vercel.json` runs `node scripts/build-static.js` during the build, serves `public/`, adds a CSP/security headers, and sets cache policy per asset type. Static routes are real directories, so there is no SPA catch-all rewrite.

```bash
npx vercel          # preview deployment
npx vercel --prod   # production
```

To enable Vercel Analytics, turn it on in the project dashboard. The CSP already allows the same-origin `/_vercel/insights/` script and beacon. No tracker is loaded otherwise.

## Tests

The runtime stays dependency-free; Playwright is a dev-only dependency.

```bash
npm install
npx playwright install chromium
npm test                    # build + static checks + browser smoke suite
npm run test:static         # fast Node checks for generated HTML/SEO/SW
npm run test:e2e            # Playwright: boot, modals, filters, a11y, no-JS, mobile
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the same suite and fails if `public/` generated files are stale.

## Architecture

| System | File |
| :--- | :--- |
| Momentum drag, fling, wheel, magnetic snap, keyboard nav | [input.js](public/js/input.js) |
| 3D card ribbon, procedural card art, raycast hover, filtering | [cards.js](public/js/cards.js) |
| Liquid ripple, chromatic aberration, click shockwave | [shaders/card.js](public/js/shaders/card.js) |
| UI overlay, cursor, modals, filters, deep links, a11y mirror | [ui.js](public/js/ui.js) |
| Dot-matrix splash title | [splash.js](public/js/splash.js) |
| Click-burst sparks | [burst.js](public/js/burst.js) |
| GPU fluid simulation | [fluid.js](public/js/fluid.js) |
| Bloom, streaks, tone mapping, grain, flashlight | [post.js](public/js/post.js), [shaders/cinematic.js](public/js/shaders/cinematic.js) |
| Synthesized ticks, latches, modal transitions | [audio.js](public/js/audio.js) |
| Static route/OG/sitemap/SW generator | [scripts/build-static.js](scripts/build-static.js) |
| Zero-dependency PNG + bitmap-font OG renderer | [scripts/png.js](scripts/png.js) |
| Boot watchdog and fallback trigger | [js/boot-watchdog.js](public/js/boot-watchdog.js) |
| Provider-neutral analytics hooks | [js/analytics.js](public/js/analytics.js) |

Regenerate the PWA icons (zero-dependency PNG encoder) with:

```bash
node scripts/generate-icons.js
```

The OG image is regenerated by `npm run build`. It uses a bundled 5×7 bitmap font so the build needs no native image libraries.

## Live Parameter Panel (press **G**)

- **Ribbon Physics:** `friction`, `dragSpeed`, `wheelSpeed`, `snapStrength`, `cardTilt`, `cardElevate`
- **Liquid Shaders:** `liquidDistortion`, `chromaticAberration`, `cardRippleSpeed`
- **Post-Processing:** `bloomStrength`, `bloomThreshold`, `exposure`, `grain`, `vignette`
- **Atmosphere:** `dustIntensity`, `cameraSway`, `fov`
