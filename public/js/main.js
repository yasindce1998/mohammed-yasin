// Mohammed Yasin — Immersive WebGL Portfolio Entry Point
// High-performance 120 FPS render loop coordinating the 3D card ribbon,
// momentum physics, liquid shaders, ambient dust particles, audio, and UI.

import { createContext, createProgram, createTexture, pass, bindTarget, FULLSCREEN_VS } from './gl.js';
import { perspective, lookAt, damp, lerp, clamp, hexToRgb } from './math.js';
import { Cards, CARD_W } from './cards.js';
import { Particles } from './particles.js';
import { Post } from './post.js';
import { Fluid } from './fluid.js';
import { Input } from './input.js';
import { Soundscape } from './audio.js';
import { Gui } from './gui.js';
import { UI } from './ui.js';
import { SplashTitle } from './splash.js';
import { Bursts } from './burst.js';
import { PROJECTS, PARAMS, SCHEMA } from './config.js';
import { track } from './analytics.js';
import { NOISE } from './shaders/noise.js';

// Deep-space luxury atmosphere: subtle ambient cosmic dust and directional vignette
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalf;
uniform float uAspect;
uniform float uIntensity;
${NOISE}

float fbm(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
        s += a * abs(gnoise(p));
        p = p * 2.05 + vec3(2.1, 4.3, 1.7);
        a *= 0.5;
    }
    return s;
}

void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 dir = normalize(uForward + uRight * ndc.x * uTanHalf * uAspect + uUp * ndc.y * uTanHalf);
    vec3 p = dir * 2.5 + vec3(0.0, 0.0, uTime * 0.008);
    float n = fbm(p);
    float neb = pow(n, 4.0) * 0.35;
    
    // Deep black base with subtle tinted dust
    vec3 col = mix(uColorA * 0.12, uColorB * 0.3, neb);
    
    // Smooth radial vignette
    float vig = 1.0 - smoothstep(0.3, 1.2, length(ndc));
    col *= vig;
    
    fragColor = vec4(col * uIntensity, 1.0);
}
`;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ACCENTS = PROJECTS.map((p) => hexToRgb(p.accent));

async function start() {
    const canvas = document.getElementById('gl');
    const ctx = createContext(canvas);
    if (!ctx) {
        document.documentElement.classList.add('no-webgl');
        window.__portfolioBoot = 'static';
        window.dispatchEvent(new CustomEvent('portfolio:boot-settled'));
        return;
    }
    const { gl, hasFloat } = ctx;

    // ---- Boot sequence UI: report real initialization work ----
    const bootBar = document.getElementById('enter-progress-bar');
    const bootLabel = document.getElementById('enter-progress-label');
    const bootTrack = document.getElementById('enter-progress');
    const enterButtons = [document.getElementById('enter-sound'), document.getElementById('enter-silent')];
    const BOOT_TOTAL = 11;
    let bootDone = 0;
    const nextFrame = () => new Promise((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
    });
    const boot = async (label) => {
        bootDone++;
        if (bootBar) bootBar.style.width = `${Math.min(100, (bootDone / BOOT_TOTAL) * 100)}%`;
        if (bootLabel) bootLabel.textContent = label;
        await nextFrame();
    };

    const params = PARAMS;
    const gui = new Gui(params, SCHEMA);
    const input = new Input(canvas, { sections: PROJECTS.length, params });
    const audio = new Soundscape();
    const cards = new Cards(gl);
    const ui = new UI(PROJECTS, input, audio, gui, cards);

    // Self-hosted fonts should be ready before card art samples them, but a
    // stalled font request must never block the boot sequence
    try {
        await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 1500))
        ]);
    } catch (e) { /* fonts may be unavailable */ }

    // Dot-matrix splash title. The plain h1 stays visible until the canvas has
    // actually drawn, so the page never shows a blank enter screen if JS or
    // canvas initialisation stalls.
    let splashTitle = null;
    const enterTitle = document.getElementById('enter-title');
    try {
        const splashCanvas = document.getElementById('enter-canvas');
        if (splashCanvas) {
            splashTitle = new SplashTitle(splashCanvas, 'MOHAMMED YASIN', { reduceMotion });
            if (!splashTitle.ctx) throw new Error('2D context unavailable');
            splashTitle.init()
                .then(() => {
                    enterTitle?.classList.add('sr-only');
                    document.getElementById('enter')?.classList.add('has-canvas');
                })
                .catch(() => { /* keep the visible h1 */ });
        }
    } catch (e) {
        splashTitle = null;
    }

    const quadVao = gl.createVertexArray();
    const sky = createProgram(gl, FULLSCREEN_VS, SKY_FS);
    await boot('BOOT // ATMOSPHERE ONLINE');

    const isMobile = matchMedia('(pointer: coarse)').matches;

    let particles;
    try {
        particles = new Particles(gl, quadVao, hasFloat, isMobile ? 32768 : 65536);
        await boot(`BOOT // PARTICLES ${particles.count}`);
    } catch (e) {
        console.warn('Particles disabled:', e);
        particles = { update() {}, draw() {}, count: 0 };
        await boot('BOOT // PARTICLES OFFLINE');
    }

    const post = new Post(gl, quadVao, hasFloat);

    let bursts;
    try {
        bursts = new Bursts(gl);
    } catch (e) {
        console.warn('Click bursts disabled:', e);
        bursts = { spawn() {}, update() {}, draw() {} };
    }
    await boot('BOOT // LENS STACK');

    let fluid;
    try {
        fluid = new Fluid(gl, quadVao, hasFloat, params);
        await boot('BOOT // FLUID SOLVER');
    } catch (e) {
        console.warn('Fluid simulation fallback:', e);
        const dummyTex = createTexture(gl, 2, 2, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
        fluid = {
            resize() {},
            splat() {},
            step() {},
            velocity: { read: { tex: dummyTex } },
            dye: { read: { tex: dummyTex } }
        };
        await boot('BOOT // FLUID OFFLINE');
    }

    // Card art is the slowest real step: one full canvas poster per project
    for (let i = 0; i < PROJECTS.length; i++) {
        cards.initTexture(i);
        await boot(`BOOT // CARD ART ${String(i + 1).padStart(2, '0')}/${String(PROJECTS.length).padStart(2, '0')}`);
    }

    const camera = {
        proj: new Float32Array(16),
        view: new Float32Array(16),
        pos: [0, 0, 32], // Starts pulled back for warp-in intro
        target: [0, 0, 0],
        roll: 0,
        fov: params.fov
    };

    // Cap the render buffer lower on phones: a 3x DPR screen at 2x is already
    // 4x the pixels of a 1x screen, and the fluid/post stack is fill-rate bound.
    const maxDpr = isMobile ? 1.5 : 2;
    let pixelRatio = Math.min(window.devicePixelRatio || 1, maxDpr);
    let quality = isMobile ? 0.85 : 1;
    let frameAvg = 16;
    let aspect = 1;

    function resize() {
        // Re-read DPR: browser zoom and monitor moves can change it at runtime
        pixelRatio = Math.min(window.devicePixelRatio || 1, maxDpr);
        const w = Math.max(1, Math.floor(window.innerWidth * pixelRatio * quality));
        const h = Math.max(1, Math.floor(window.innerHeight * pixelRatio * quality));
        if (post.scene && canvas.width === w && canvas.height === h) return;
        canvas.width = w;
        canvas.height = h;
        aspect = w / h;
        post.resize(w, h);
        fluid.resize(aspect);
    }
    window.addEventListener('resize', resize);
    resize();

    // Splash intro state
    const intro = { started: false, t: 0, duration: reduceMotion ? 0.4 : 2.8 };
    ui.onEnter = (withSound) => {
        intro.started = true;
        input.enabled = true;
        if (withSound) audio.start();
        splashTitle?.scatter();
        track('enter', { sound: withSound, motion: reduceMotion ? 'reduced' : 'full' });
        // Move keyboard focus into the experience instead of leaving it on the
        // now-hidden splash button.
        document.getElementById('content')?.focus({ preventScroll: true });
    };

    // Click on canvas triggers card selection / case study modal
    input.onClick(() => {
        if (ui.modalOpen) return;
        const hit = cards.hitTest(input.pointer, camera, aspect);
        if (hit) {
            cards.triggerClick(hit.cardIndex, hit.uv);
            if (!reduceMotion && hit.world) {
                bursts.spawn(hit.world, ACCENTS[hit.cardIndex] || ACCENTS[0], camera.pos);
                // Let the sparks read for a beat before the backdrop covers them
                setTimeout(() => ui.openCaseStudy(hit.project), 200);
            } else {
                ui.openCaseStudy(hit.project);
            }
        }
    });

    // Boot complete: unlock the enter buttons and start rendering
    enterButtons.forEach((b) => { if (b) b.disabled = false; });
    if (bootLabel) bootLabel.textContent = 'BOOT // SYSTEMS ONLINE';
    if (bootTrack) bootTrack.classList.add('done');
    const telemetryStats = document.getElementById('telemetry-stats');

    window.__portfolioBoot = 'ready';
    window.dispatchEvent(new CustomEvent('portfolio:boot-ready'));
    // The dialog's primary actions are now enabled; put focus on the silent
    // action so keyboard/screen-reader users are not stranded on the splash.
    document.getElementById('enter-silent')?.focus({ preventScroll: true });

    let lastSection = input.activeIndex;
    let lastScrollInt = Math.floor(input.scroll.current);
    let lastStats = 0;
    let last = performance.now();
    let time = 0;
    let paused = false;

    // Stop GPU/audio work in background tabs. rAF is throttled by browsers, but
    // the audio graph keeps running unless the context is suspended.
    document.addEventListener('visibilitychange', () => {
        paused = document.hidden;
        last = performance.now();
        if (!audio.ctx) return;
        if (paused) audio.ctx.suspend?.().catch?.(() => {});
        else if (audio.enabled) audio.ctx.resume?.().catch?.(() => {});
    });

    function frame(now) {
        if (paused) {
            last = now;
            return;
        }
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        time += dt;

        // Dynamic framerate scaling
        frameAvg = lerp(frameAvg, dt * 1000, 0.05);
        if (time > 3) {
            const prevQuality = quality;
            if (frameAvg > 24 && quality > 0.5) quality = Math.max(0.5, quality - 0.1);
            else if (frameAvg < 14 && quality < 1) quality = Math.min(1, quality + 0.05);
            if (prevQuality !== quality) { frameAvg = 16; resize(); }
        }

        if (intro.started) intro.t = Math.min(1, intro.t + dt / intro.duration);
        const introE = 1 - Math.pow(1 - intro.t, 3);

        // Update physics
        input.update(dt);
        // input.activeIndex is a slot in the filtered ribbon; map to the project
        const activeIdx = cards.visibleList[input.activeIndex] ?? 0;
        const accentCol = ACCENTS[activeIdx] || ACCENTS[0];

        // Trigger section UI and audio updates
        if (activeIdx !== lastSection) {
            lastSection = activeIdx;
            ui.updateProjectUI(input.activeIndex);
            audio.setSection(activeIdx);
        }

        // Mechanical tick sound when passing card boundaries
        const currentInt = Math.floor(input.scroll.current + 0.5);
        if (currentInt !== lastScrollInt && Math.abs(input.scroll.speed) > 0.04) {
            lastScrollInt = currentInt;
            audio.tick(1600 + (Math.abs(input.scroll.speed) * 800));
        }

        // Raycast hit test for mouse hover on 3D cards
        // Touch has no hover: only track it while a finger is down
        const canHover = ui.entered && !ui.modalOpen && (input.pointer.type !== 'touch' || input.pointer.down);
        const hit = canHover ? cards.hitTest(input.pointer, camera, aspect) : null;
        if (hit) {
            cards.hoveredIndex = hit.cardIndex;
            cards.hoveredUv = hit.uv;
            if (!ui.modalOpen) ui.setCursorState('view');
        } else {
            cards.hoveredIndex = -1;
            if (!ui.modalOpen) ui.setCursorState('drag');
        }

        // Camera positioning with subtle mouse parallax sway
        const sway = reduceMotion ? 0 : (params.cameraSway || 0.8);
        const p = input.pointer;
        const introZ = (1 - introE) * 24;
        
        // Base camera sits looking at center of the active arc, pulled back on
        // narrow/portrait screens so the active card still fits the width
        const fov = isMobile && aspect < 1 ? params.fov * 1.25 : params.fov;
        const fitZ = (CARD_W * 0.5 / 0.88) / (Math.tan(fov * Math.PI / 360) * aspect);
        const desiredCam = [
            (p.x - 0.5) * 1.2 * sway,
            (p.y - 0.5) * -0.6 * sway,
            Math.max(7.8, fitZ) + introZ
        ];
        const followSpeed = intro.t < 1 ? 16 : 3.0;
        for (let i = 0; i < 3; i++) {
            camera.pos[i] = damp(camera.pos[i], desiredCam[i], followSpeed, dt);
            camera.target[i] = damp(camera.target[i], 0.0, 2.5, dt);
        }

        // Camera view & projection
        const up = [0, 1, 0];
        lookAt(camera.view, camera.pos, camera.target, up);
        perspective(camera.proj, fov * Math.PI / 180, aspect, 0.1, 100);

        const v = camera.view;
        const right = [v[0], v[4], v[8]];
        const upv = [v[1], v[5], v[9]];
        const forward = [-v[2], -v[6], -v[10]];

        // Fluid simulation step
        if (p.moved && (Math.abs(p.dx) + Math.abs(p.dy) > 1e-5)) {
            // Normalise to a 60Hz frame so splat strength doesn't depend on frame rate
            const k = 1 / Math.max(dt * 60, 1);
            fluid.splat([p.x, 1 - p.y], [p.dx * k, -p.dy * k], accentCol.map(c => c * 0.1));
        }
        fluid.step(dt);

        // Update 3D Cards
        // Cap visual speed so fast flings tilt/smear the cards without blowing them apart
        const cardSpeed = clamp(input.scroll.speed, -2.5, 2.5);
        cards.update(dt, time, input.scroll.current, cardSpeed, input.pointer, params);

        // Update ambient dust particles drifting in 3D around the ribbon
        particles.update(dt, time, {
            shapeA: 0,
            shapeB: 0,
            morph: 0,
            curlStrength: 0.15,
            attraction: 0.6,
            pointer: [0, 0, 0],
            pointerForce: 0
        });

        // ---- Render Scene to HDR FBO ----
        bindTarget(gl, post.scene);
        gl.clearColor(0.02, 0.02, 0.03, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // 1. Draw background sky
        pass(gl, quadVao, sky, post.scene, {
            uTime: time,
            uColorA: accentCol.map(c => c * 0.3),
            uColorB: accentCol,
            uRight: right, uUp: upv, uForward: forward,
            uTanHalf: Math.tan(fov * Math.PI / 360), uAspect: aspect,
            uIntensity: 0.5 * introE
        });

        // 2. Draw 3D Cards Ribbon
        cards.draw(camera, cardSpeed, time, params);

        // 3. Draw ambient atmospheric particles around cards
        const dustIntensity = (params.dustIntensity || 0.75) * 0.05 * introE;
        particles.draw(camera, [
            accentCol.map(c => c * dustIntensity),
            [0.12 * dustIntensity, 0.14 * dustIntensity, 0.18 * dustIntensity]
        ], pixelRatio * quality, 8.0, 0.12);

        // 4. Click-burst sparks (in front of the ribbon)
        bursts.update(dt);
        bursts.draw(camera, pixelRatio * quality);

        // 5. Post-processing (Bloom, Grade, ACES Tone Mapping, Grain)
        post.render(fluid, {
            ...params,
            time,
            flash: 0,
            warp: 0,
            fade: introE,
            streakStrength: 0.15,
            streakTint: accentCol,
            raysStrength: 0,
            lightPos: [p.x, 1 - p.y],
            // Touch devices have no persistent cursor, so the glow would sit
            // wherever the last tap landed
            flashlight: isMobile ? 0 : (params.flashlight ?? 0) * introE
        });

        // Audio & UI updates
        audio.update(input.scroll.speed, p.speed);
        ui.update(dt, input.scroll.speed);

        // HUD telemetry readout (twice a second)
        if (time - lastStats > 0.5) {
            lastStats = time;
            if (telemetryStats) {
                const fps = Math.round(1000 / Math.max(frameAvg, 4));
                telemetryStats.textContent = `${fps} FPS · ${particles.count || 0} PTCL · Q${quality.toFixed(2)}`;
            }
        }

        p.moved = p.moved && p.speed > 0.001;
    }

    function loop(now) {
        requestAnimationFrame(loop);
        try {
            frame(now);
        } catch (e) {
            console.error('Render frame error:', e);
        }
    }

    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        document.documentElement.classList.add('no-webgl');
        window.__portfolioBoot = 'static';
        window.dispatchEvent(new CustomEvent('portfolio:boot-settled'));
    });

    canvas.addEventListener('webglcontextrestored', () => location.reload());

    requestAnimationFrame(loop);
}

start().catch((err) => {
    console.error('WebGL Initialization Error:', err);
    const p = document.getElementById('fallback-message');
    if (p) p.textContent = `Initialization notice: ${err.message || err}`;
    document.documentElement.classList.add('no-webgl');
    window.__portfolioBoot = 'error';
    window.dispatchEvent(new CustomEvent('portfolio:boot-error', {
        detail: { message: err.message || String(err) }
    }));
});
