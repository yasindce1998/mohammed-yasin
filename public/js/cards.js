// 3D Interactive Project Ribbon for Mohammed Yasin's portfolio
// Renders security-console themed project cards along a curved 3D ribbon
// with velocity-based tilt, raycasted hover detection, and liquid displacement.

import { createProgram, setUniforms } from './gl.js';
import { CARD_VS, CARD_FS } from './shaders/card.js';
import { PROJECTS } from './config.js';
import {
    damp, clamp, hexToRgb,
    mat4Create, mat4Identity, mat4Multiply, mat4Translate,
    mat4RotateX, mat4RotateY, mat4RotateZ, mat4Scale, mat4Invert,
    vec3TransformMat4
} from './math.js';

export const CARD_W = 4.2;
const CARD_H = 2.65;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Cards {
    constructor(gl) {
        this.gl = gl;
        this.projects = PROJECTS;
        this.program = createProgram(gl, CARD_VS, CARD_FS);
        this.textures = [];
        this.cardStates = [];
        this.hoveredIndex = -1;
        this.hoveredUv = [0.5, 0.5];
        this.hoveredCard = null;

        this.initGeometry();
        this.initStates();
        this.textures = new Array(this.projects.length).fill(null);

        // Category filtering: null = all projects visible
        this.visible = null;
    }

    // Logical ribbon index -> project index mapping (respects active filter)
    get visibleList() {
        return this.visible || this.projects.map((_, i) => i);
    }

    projectAt(logicalIndex) {
        const list = this.visibleList;
        return this.projects[list[((logicalIndex % list.length) + list.length) % list.length]];
    }

    setVisible(indices) {
        this.visible = indices;
    }

    initGeometry() {
        const gl = this.gl;
        const hw = CARD_W / 2;
        const hh = CARD_H / 2;

        // Quad centered at (0, 0, 0) facing +Z
        const vertices = new Float32Array([
            // Position (x,y,z), UV (u,v), Normal (nx,ny,nz)
            -hw, -hh, 0,   0, 0,   0, 0, 1,
             hw, -hh, 0,   1, 0,   0, 0, 1,
             hw,  hh, 0,   1, 1,   0, 0, 1,
            -hw,  hh, 0,   0, 1,   0, 0, 1
        ]);

        const indices = new Uint16Array([
            0, 1, 2,
            0, 2, 3
        ]);

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        const stride = 8 * 4; // 8 floats per vertex
        // Location 0: Position (vec3)
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);

        // Location 1: UV (vec2)
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 3 * 4);

        // Location 2: Normal (vec3)
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 5 * 4);

        gl.bindVertexArray(null);
    }

    initTextures() {
        this.projects.forEach((_, i) => this.initTexture(i));
    }

    // Builds one card's canvas art + GPU texture. Split out so the boot loader
    // can report progress per card instead of blocking on all seven at once.
    initTexture(i) {
        const gl = this.gl;
        const p = this.projects[i];

        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 640;
        const ctx = canvas.getContext('2d');

        this.renderCardGraphic(ctx, p, canvas.width, canvas.height, 1);

        // Keep the canvas around so hover can re-render the terminal logs
        const state = this.cardStates[i];
        if (state) {
            state.canvas = canvas;
            state.ctx = ctx;
        }

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // Canvas rows run top-down; quad UVs have v = 0 at the bottom
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

        this.textures[i] = tex;
        return tex;
    }

    // Re-renders a card's logs at a given typing progress and re-uploads it
    updateCardLogs(i, time) {
        const card = this.cardStates[i];
        if (!card || !card.ctx || !this.textures[i]) return;

        let progress = 1;
        if (time !== Infinity) {
            const logs = card.project.logs || [];
            const total = logs.reduce((n, l) => n + l.length, 0);
            const typeDur = Math.max(0.6, total * 0.035);
            const hold = 2.2;
            const phase = time % (typeDur + hold);
            progress = phase >= typeDur ? 1 : phase / typeDur;
        }

        this.renderCardGraphic(card.ctx, card.project, card.canvas.width, card.canvas.height, progress);

        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, card.canvas);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    // Security-console themed graphic generator for project posters
    renderCardGraphic(ctx, project, w, h, logProgress = 1) {
        const accent = project.accent || '#00f2fe';

        // Deep terminal background
        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, '#0a0a0e');
        bgGrad.addColorStop(0.5, '#06060a');
        bgGrad.addColorStop(1, '#040406');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Ambient accent glow behind the art zone
        const glow = ctx.createRadialGradient(w * 0.68, h * 0.48, 10, w * 0.68, h * 0.48, w * 0.5);
        glow.addColorStop(0, `${accent}30`);
        glow.addColorStop(0.4, `${accent}12`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);

        // Fine grid
        ctx.strokeStyle = 'rgba(120, 160, 200, 0.05)';
        ctx.lineWidth = 1;
        const gridStep = 32;
        for (let x = 0; x < w; x += gridStep) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += gridStep) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // Scan lines
        ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
        for (let y = 0; y < h; y += 4) {
            ctx.fillRect(0, y, w, 1.5);
        }

        // Giant background project number
        ctx.font = '700 240px "Space Grotesk", -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(project.num, w - 40, 20);

        // Thematic schematic art per project
        ctx.save();
        ctx.translate(w * 0.68, h * 0.46);
        this.drawProjectArt(ctx, project.id, accent);
        ctx.restore();

        // Terminal log lines (top-left, under index)
        ctx.font = '400 12px "Space Mono", ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const logs = project.logs || [];
        // Type-on animation: reveal a fraction of the total characters across
        // all lines, with a block cursor at the active position
        let remaining = Math.round(logs.reduce((n, l) => n + l.length, 0) * Math.max(0, Math.min(1, logProgress)));
        logs.forEach((line, i) => {
            const count = Math.max(0, Math.min(line.length, remaining));
            const shown = line.slice(0, count);
            remaining -= line.length;
            const isAlert = /BLOCKED|DETECTED|LOW|escape/i.test(line);
            ctx.fillStyle = isAlert ? 'rgba(255, 80, 90, 0.75)' : `${accent}aa`;
            ctx.fillText(shown, 48, 96 + i * 22);
            if (count > 0 && count < line.length) {
                const cw = ctx.measureText(shown).width;
                ctx.fillRect(48 + cw + 2, 96 + i * 22, 7, 12);
            }
        });

        // Top Left: Project Index & Category
        ctx.font = '600 13px "Space Mono", ui-monospace, monospace';
        ctx.fillStyle = accent;
        ctx.fillText(`[ ${project.num} // ${project.category} ]`, 48, 48);

        // Status & Year in top right
        ctx.font = '500 12px "Space Mono", ui-monospace, monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.textAlign = 'right';
        ctx.fillText(`${project.status} · ${project.year}`, w - 48, 48);

        // Main Project Title
        ctx.font = '700 54px "Space Grotesk", -apple-system, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(project.title, 48, h - 108);

        // Tagline / Subtitle
        ctx.font = '400 17px "Space Grotesk", -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.fillText(project.tagline, 48, h - 72);

        // Tech badges (bottom)
        ctx.font = '600 11px "Space Mono", ui-monospace, monospace';
        ctx.fillStyle = `${accent}bb`;
        ctx.fillText(project.tags.slice(0, 4).join(' · '), 48, h - 42);

        // Framing corner crosshairs
        ctx.strokeStyle = `${accent}66`;
        ctx.lineWidth = 1.5;
        const cl = 16;
        ctx.beginPath(); ctx.moveTo(28, 28 + cl); ctx.lineTo(28, 28); ctx.lineTo(28 + cl, 28); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w - 28 - cl, 28); ctx.lineTo(w - 28, 28); ctx.lineTo(w - 28, 28 + cl); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(28, h - 28 - cl); ctx.lineTo(28, h - 28); ctx.lineTo(28 + cl, h - 28); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w - 28 - cl, h - 28); ctx.lineTo(w - 28, h - 28); ctx.lineTo(w - 28, h - 28 - cl); ctx.stroke();
    }

    drawProjectArt(ctx, id, accent) {
        ctx.strokeStyle = accent;
        ctx.fillStyle = `${accent}15`;
        ctx.lineWidth = 1.5;

        if (id === 'redhands') {
            // Agent-to-toolchain topology: central agent node branching to tools
            ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.font = '700 14px "Space Mono", ui-monospace, monospace';
            ctx.fillStyle = accent;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('AI', 0, 1);
            for (let i = 0; i < 6; i++) {
                const a = (-Math.PI / 2) + (i / 5) * Math.PI * 1.25;
                const x = Math.cos(a) * 115;
                const y = Math.sin(a) * 95;
                ctx.beginPath(); ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); ctx.lineTo(x, y); ctx.stroke();
                ctx.beginPath(); ctx.rect(x - 16, y - 10, 32, 20); ctx.stroke();
            }
        } else if (id === 'aegis-shadow') {
            // Twin ring-0 modules: rootkit and auditor mirrored
            for (const s of [-1, 1]) {
                ctx.save(); ctx.translate(s * 78, 0);
                ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 22, Math.sin(a) * 22);
                    ctx.lineTo(Math.cos(a) * 44, Math.sin(a) * 44);
                    ctx.stroke();
                }
                ctx.restore();
            }
            ctx.setLineDash([6, 6]);
            ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(34, 0); ctx.stroke();
            ctx.setLineDash([]);
        } else if (id === 'kubedagger') {
            // Container breakout: nested boxes with escape vector
            ctx.strokeRect(-105, -70, 210, 140);
            ctx.strokeRect(-70, -42, 140, 88);
            ctx.strokeRect(-35, -16, 70, 40);
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = 'rgba(255, 80, 90, 0.8)';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(95, -90);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(95, -90, 5, 0, Math.PI * 2); ctx.fill();
        } else if (id === 'neurontrace') {
            // Syscall fence: neural net bounded by kernel wall
            for (let layer = 0; layer < 3; layer++) {
                const lx = -80 + layer * 62;
                for (let n = 0; n < 3 - Math.abs(layer - 1); n++) {
                    const ny = (n - 1) * 44 + (layer === 1 ? 0 : 22);
                    ctx.beginPath(); ctx.arc(lx, ny, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                    if (layer < 2) {
                        for (let m = 0; m < 2; m++) {
                            const my = (m - 0.5) * 44;
                            ctx.beginPath(); ctx.moveTo(lx + 9, ny); ctx.lineTo(lx + 53, my); ctx.stroke();
                        }
                    }
                }
            }
            // Kernel boundary wall
            ctx.strokeStyle = 'rgba(255, 80, 90, 0.75)';
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(58, -85); ctx.lineTo(58, 85); ctx.stroke();
            for (let y = -85; y <= 85; y += 24) {
                ctx.beginPath(); ctx.moveTo(58, y); ctx.lineTo(66, y); ctx.stroke();
            }
        } else if (id === 'barzakh') {
            // Boot chain: UEFI → bootloader → kernel stages
            const stages = ['UEFI', 'SHIM', 'GRUB', 'KERNEL'];
            ctx.font = '600 11px "Space Mono", ui-monospace, monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            stages.forEach((s, i) => {
                const x = -110 + i * 74;
                ctx.strokeRect(x - 28, -16, 56, 32);
                ctx.fillStyle = accent;
                ctx.fillText(s, x, 1);
                if (i < 3) {
                    ctx.beginPath(); ctx.moveTo(x + 30, 0); ctx.lineTo(x + 44, 0); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(x + 40, -5); ctx.lineTo(x + 46, 0); ctx.lineTo(x + 40, 5); ctx.stroke();
                }
            });
            ctx.strokeStyle = 'rgba(255, 80, 90, 0.7)';
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(-124, 34); ctx.lineTo(124, 34); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255, 80, 90, 0.85)';
            ctx.font = '600 10px "Space Mono", ui-monospace, monospace';
            ctx.fillText('TRUST BOUNDARY', 0, 48);
        } else if (id === 'warmor') {
            // Two runtimes bridged: eBPF hex ring + WASM module
            ctx.save(); ctx.translate(-72, 0);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const x = Math.cos(a) * 42, y = Math.sin(a) * 42;
                ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                const a2 = ((i + 1) / 6) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(Math.cos(a2) * 42, Math.sin(a2) * 42);
                ctx.stroke();
            }
            ctx.font = '600 11px "Space Mono", ui-monospace, monospace';
            ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('eBPF', 0, 0);
            ctx.restore();
            ctx.save(); ctx.translate(72, 0);
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
                const x = Math.cos(a) * 40, y = Math.sin(a) * 40;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath(); ctx.stroke();
            ctx.fillStyle = accent;
            ctx.font = '600 11px "Space Mono", ui-monospace, monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('WASM', 0, 0);
            ctx.restore();
            // Bridge events flowing between them
            for (let i = 0; i < 3; i++) {
                const y = -18 + i * 18;
                ctx.beginPath(); ctx.moveTo(-26, y); ctx.lineTo(26, y); ctx.stroke();
                ctx.beginPath(); ctx.arc(-2 + i * 4, y, 3, 0, Math.PI * 2); ctx.fill();
            }
        } else {
            // StaticZero default: cellular tower radar with rogue detection
            for (let r = 30; r <= 120; r += 30) {
                ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
            }
            // Sweep wedge
            ctx.fillStyle = `${accent}20`;
            ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.arc(0, 0, 120, -0.5, 0.1); ctx.closePath(); ctx.fill();
            // Tower
            ctx.beginPath();
            ctx.moveTo(-10, 34); ctx.lineTo(0, -18); ctx.lineTo(10, 34); ctx.closePath(); ctx.stroke();
            // Rogue tower blip
            ctx.strokeStyle = 'rgba(255, 80, 90, 0.85)';
            ctx.fillStyle = 'rgba(255, 80, 90, 0.9)';
            ctx.beginPath(); ctx.arc(-72, -54, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(-72, -54, 14, 0, Math.PI * 2); ctx.stroke();
        }
    }

    initStates() {
        this.cardStates = this.projects.map((p, i) => ({
            index: i,
            project: p,
            accent: hexToRgb(p.accent),
            modelMatrix: mat4Create(),
            invModelMatrix: mat4Create(),
            pos: [0, 0, 0],
            hover: 0,
            alpha: 1,
            pointer: [0.5, 0.5],
            ripple: [0.5, 0.5, 999.0, 0.0] // x, y, age, intensity
        }));
    }

    // Raycast hit test against all cards in 3D
    hitTest(pointerNorm, camera, aspect) {
        // pointerNorm: x,y in [0..1], 0,0 top-left
        const v = camera.view;
        const right = [v[0], v[4], v[8]];
        const up = [v[1], v[5], v[9]];
        const fwd = [-v[2], -v[6], -v[10]];
        const tanHalf = 1 / camera.proj[5];

        const nx = (pointerNorm.x * 2 - 1) * tanHalf * aspect;
        const ny = ((1 - pointerNorm.y) * 2 - 1) * tanHalf;

        // Camera ray in world space
        const rayDir = [
            fwd[0] + right[0] * nx + up[0] * ny,
            fwd[1] + right[1] * nx + up[1] * ny,
            fwd[2] + right[2] * nx + up[2] * ny
        ];
        const len = Math.hypot(...rayDir) || 1;
        rayDir[0] /= len; rayDir[1] /= len; rayDir[2] /= len;
        const rayOrigin = [...camera.pos];

        let closestDist = Infinity;
        let hitResult = null;

        const hw = CARD_W / 2;
        const hh = CARD_H / 2;

        for (let i = 0; i < this.cardStates.length; i++) {
            const card = this.cardStates[i];
            if ((card.alpha ?? 1) < 0.5) continue;
            const invM = card.invModelMatrix;

            // Transform ray origin and direction into card's local object space
            const originLoc = vec3TransformMat4([0, 0, 0], rayOrigin, invM);
            const farWorld = [rayOrigin[0] + rayDir[0] * 100, rayOrigin[1] + rayDir[1] * 100, rayOrigin[2] + rayDir[2] * 100];
            const farLoc = vec3TransformMat4([0, 0, 0], farWorld, invM);

            const dirLoc = [farLoc[0] - originLoc[0], farLoc[1] - originLoc[1], farLoc[2] - originLoc[2]];
            const dLen = Math.hypot(...dirLoc) || 1;
            dirLoc[0] /= dLen; dirLoc[1] /= dLen; dirLoc[2] /= dLen;

            // Check intersection with plane z = 0
            if (Math.abs(dirLoc[2]) < 1e-5) continue;
            const t = -originLoc[2] / dirLoc[2];
            if (t <= 0) continue;

            const hitX = originLoc[0] + dirLoc[0] * t;
            const hitY = originLoc[1] + dirLoc[1] * t;

            // Check if hit falls within card dimensions
            if (hitX >= -hw && hitX <= hw && hitY >= -hh && hitY <= hh) {
                if (t < closestDist) {
                    closestDist = t;
                    const u = (hitX / CARD_W) + 0.5;
                    const v = (hitY / CARD_H) + 0.5;
                    hitResult = {
                        cardIndex: i,
                        uv: [u, v],
                        // Local hit point transformed to world space (for click bursts)
                        world: vec3TransformMat4([0, 0, 0], [hitX, hitY, 0], card.modelMatrix),
                        project: card.project
                    };
                }
            }
        }

        return hitResult;
    }

    triggerClick(index, uv = [0.5, 0.5]) {
        if (index >= 0 && index < this.cardStates.length) {
            const card = this.cardStates[index];
            card.ripple = [uv[0], uv[1], 0.0, 1.0];
            return card.project;
        }
        return null;
    }

    update(dt, time, scrollProgress, velocity, pointer, params) {
        const N = this.projects.length;
        const radius = params.cardRadius || 13.5;
        const spacingRad = (params.cardSpacing || 3.5) / radius;
        const tiltFactor = params.cardTilt || 1.3;
        const elevateDist = params.cardElevate || 0.8;
        const list = this.visibleList;
        const M = list.length;

        for (let i = 0; i < N; i++) {
            const card = this.cardStates[i];
            const logical = list.indexOf(i);

            // Cards outside the active filter fade out
            const targetAlpha = logical === -1 ? 0 : 1;
            card.alpha = damp(card.alpha ?? 1, targetAlpha, 8, dt);
            if (card.alpha < 0.01 && logical === -1) continue;

            // Circular wrapping around active scroll position (over logical list)
            let diff = (logical - scrollProgress);
            // Wrap to range [-M/2, M/2]
            diff = ((diff % M) + M * 1.5) % M - M * 0.5;

            const theta = diff * spacingRad;
            const x = Math.sin(theta) * radius;
            const z = -Math.cos(theta) * radius + radius;
            const y = 0.0;

            card.pos = [x, y, z];

            // Smooth hover state interpolation
            const isHovered = (this.hoveredIndex === i);
            const targetHover = isHovered ? 1.0 : 0.0;
            card.hover = damp(card.hover, targetHover, 8, dt);

            // Live terminal logs: type in while hovered (mouse only — touch
            // has no hover and re-uploading textures would waste bandwidth)
            if (isHovered && pointer && pointer.type === 'mouse' && !reduceMotion) {
                card.logT = (card.logT || 0) + dt;
                if (card.logT - (card.texAt || 0) > 0.09) {
                    card.texAt = card.logT;
                    this.updateCardLogs(i, card.logT);
                    card.animating = true;
                }
            } else if (card.animating) {
                card.animating = false;
                card.logT = 0;
                card.texAt = 0;
                this.updateCardLogs(i, Infinity);
            }

            if (isHovered && this.hoveredUv) {
                card.pointer[0] = damp(card.pointer[0], this.hoveredUv[0], 12, dt);
                card.pointer[1] = damp(card.pointer[1], this.hoveredUv[1], 12, dt);
            }

            // Update ripple shockwave
            card.ripple[2] += dt * (params.cardRippleSpeed || 3.2);
            card.ripple[3] = Math.max(0.0, card.ripple[3] - dt * 1.4);

            // Compute Model Matrix:
            // Translate to arc -> Elevate on hover -> Rotate Y (arc) -> Rotate Z (velocity roll) -> Tilt to pointer
            const m = card.modelMatrix;
            mat4Identity(m);
            
            // Base arc position + hover elevation along camera direction (+Z)
            const elevZ = card.hover * elevateDist;
            mat4Translate(m, m, [x, y, z + elevZ]);

            // Arc facing angle
            mat4RotateY(m, m, -theta);

            // Velocity-based aerodynamic roll and bank
            const vRoll = clamp(-velocity * tiltFactor * 0.4, -0.35, 0.35);
            mat4RotateZ(m, m, vRoll);
            mat4RotateY(m, m, velocity * 0.15);

            // Mouse hover parallax tilt
            if (card.hover > 0.01) {
                const tiltX = (card.pointer[1] - 0.5) * -0.25 * card.hover;
                const tiltY = (card.pointer[0] - 0.5) * 0.3 * card.hover;
                mat4RotateX(m, m, tiltX);
                mat4RotateY(m, m, tiltY);
            }

            // Scale slightly on hover
            const s = 1.0 + card.hover * 0.04;
            mat4Scale(m, m, [s, s, 1.0]);
            // Filtered-out cards shrink away as they fade
            if (card.alpha < 1) mat4Scale(m, m, [card.alpha, card.alpha, 1.0]);

            // Cache inverse matrix for raycasting
            mat4Invert(card.invModelMatrix, m);
        }
    }

    draw(camera, velocity, time, params) {
        const gl = this.gl;
        gl.useProgram(this.program.program);
        gl.bindVertexArray(this.vao);

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Sort cards by camera distance (draw back to front)
        const sorted = [...this.cardStates].sort((a, b) => {
            const da = Math.hypot(camera.pos[0] - a.pos[0], camera.pos[2] - a.pos[2]);
            const db = Math.hypot(camera.pos[0] - b.pos[0], camera.pos[2] - b.pos[2]);
            return db - da;
        });

        for (let i = 0; i < sorted.length; i++) {
            const card = sorted[i];
            const tex = this.textures[card.index];

            setUniforms(gl, this.program, {
                uModel: card.modelMatrix,
                uView: camera.view,
                uProj: camera.proj,
                uTexture: tex,
                uAccent: card.accent,
                uPointer: card.pointer,
                uHover: card.hover,
                uVelocity: velocity,
                uTime: time,
                uRipple: card.ripple,
                uDistortion: params.liquidDistortion || 1.4,
                uAberration: params.chromaticAberration || 0.035
            });

            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }

        gl.bindVertexArray(null);
    }
}
