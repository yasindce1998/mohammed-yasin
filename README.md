# Mohammed Yasin · Immersive WebGL Portfolio

Security engineer working on kernel-level offense and cloud-native defense. This portfolio is a real-time WebGL 2 experience: open-source projects sit on a curved 3D ribbon you can drag and fling, with liquid-displacement shaders, a GPU fluid sim, synthesized Web Audio, and full case-study views. It has no dependencies, no build step, and no external assets.

```bash
npm start            # or: node server.js, ./start.sh, start.bat
```

Open **http://localhost:7890**. Drag to explore, click a card to open its case study, use the arrow keys to step between projects, and press **G** for the live parameter panel.

## Content

All portfolio content is in [`public/js/config.js`](public/js/config.js):

| Export | What it drives |
| :--- | :--- |
| `OWNER` | Name, role, location/timezone (header clock), contact links |
| `PROJECTS` | The ribbon cards and their case studies: title, tagline, category, status, GitHub URL, tags, accent color, and the terminal log lines drawn on each card |
| `EXPERIENCE` | Experience timeline in the About modal |
| `CLIENT_WORK` | Proprietary client work listed in the About modal |

To add a project, append an entry to `PROJECTS` and add a matching `drawProjectArt` branch in [`cards.js`](public/js/cards.js) for its schematic. Projects without a branch get the default radar art.

## Features

- **Boot sequence**: the enter screen reports real initialization work (shader compilation, GPGPU particle upload, per-project card rasterization) with a progress readout before unlocking the ENTER buttons.
- **Dot-matrix splash title**: the name is sampled into a dot grid that converges on load, repels from the pointer, and scatters into the scene on entry.
- **Pointer flashlight**: a soft cool glow follows the cursor across the graded scene (tunable as `flashlight` in the live panel).
- **Category filters** (`ALL / OFFENSE / DEFENSE / RESEARCH`): filtered-out cards shrink and fade off the ribbon, and dragging, arrow keys and pagination only cycle through the visible set.
- **Deep links**: `/#/<project-id>` (e.g. `/#/neurontrace`) jumps to that project and opens its case study once you enter. The hash updates as case studies open and close.
- **Security-console card art**: every card is drawn procedurally on a canvas, with scan lines, terminal logs that type themselves as you hover, and a schematic for its domain (agent toolchain, ring-0 mirror, container breakout, syscall fence, boot chain, eBPF↔WASM bridge, rogue-tower radar).
- **Click bursts**: selecting a card sprays accent-colored sparks toward the camera.
- **HUD telemetry**: live FPS / particle count / render-quality readout next to the Bengaluru clock.
- **Accessibility layer**: a visually hidden DOM mirror of the ribbon (revealed on focus) plus a polite live region announcing the focused project.
- **Installable**: web app manifest with generated icons and iOS standalone meta tags.
- **Self-hosted type**: Space Grotesk + Space Mono (SIL OFL, see [OFL.txt](public/fonts/OFL.txt)) with no external font requests.
- **SEO**: Open Graph / Twitter meta tags and JSON-LD `Person` structured data.

## Deploying to Vercel

The site is fully static. Everything lives in `public/`. `vercel.json` serves `public/` as-is, rewrites extensionless routes to `index.html`, and adds basic security headers.

```bash
npx vercel          # preview deployment
npx vercel --prod   # production
```

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

Regenerate the PWA icons (zero-dependency PNG encoder) with:

```bash
node scripts/generate-icons.js
```

## Live Parameter Panel (press **G**)

- **Ribbon Physics:** `friction`, `dragSpeed`, `wheelSpeed`, `snapStrength`, `cardTilt`, `cardElevate`
- **Liquid Shaders:** `liquidDistortion`, `chromaticAberration`, `cardRippleSpeed`
- **Post-Processing:** `bloomStrength`, `bloomThreshold`, `exposure`, `grain`, `vignette`
- **Atmosphere:** `dustIntensity`, `cameraSway`, `fov`
