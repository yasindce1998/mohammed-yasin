// Post-processing chain:
// scene (HDR) -> bright pass -> mip blur chain (bloom)
//             -> anamorphic streaks + screen-space god rays -> cinematic composite.
// See shaders/cinematic.js for the lens, grading and film effects.
import { createProgram, createTarget, pass, FULLSCREEN_VS, formats } from './gl.js';
import { STREAK, GODRAYS, COMPOSITE } from './shaders/cinematic.js';

const HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
`;

const BRIGHT = HEADER + `
uniform sampler2D uSource;
uniform float uThreshold;
void main() {
    vec3 c = texture(uSource, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    // Soft knee so the threshold doesn't produce hard edges
    float k = clamp((l - uThreshold + 0.5) / 1.0, 0.0, 1.0);
    k = k * k * 0.5 + max(l - uThreshold, 0.0);
    fragColor = vec4(c * (k / max(l, 1e-4)), 1.0);
}`;

// 13-tap downsample: stable against flicker from small bright pixels
const DOWN = HEADER + `
uniform sampler2D uSource;
uniform vec2 uTexel;
void main() {
    vec2 t = uTexel;
    vec3 a = texture(uSource, vUv + t * vec2(-2, 2)).rgb;
    vec3 b = texture(uSource, vUv + t * vec2(0, 2)).rgb;
    vec3 c = texture(uSource, vUv + t * vec2(2, 2)).rgb;
    vec3 d = texture(uSource, vUv + t * vec2(-2, 0)).rgb;
    vec3 e = texture(uSource, vUv).rgb;
    vec3 f = texture(uSource, vUv + t * vec2(2, 0)).rgb;
    vec3 g = texture(uSource, vUv + t * vec2(-2, -2)).rgb;
    vec3 h = texture(uSource, vUv + t * vec2(0, -2)).rgb;
    vec3 i = texture(uSource, vUv + t * vec2(2, -2)).rgb;
    vec3 j = texture(uSource, vUv + t * vec2(-1, 1)).rgb;
    vec3 k = texture(uSource, vUv + t * vec2(1, 1)).rgb;
    vec3 l = texture(uSource, vUv + t * vec2(-1, -1)).rgb;
    vec3 m = texture(uSource, vUv + t * vec2(1, -1)).rgb;
    vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
    fragColor = vec4(col, 1.0);
}`;

// 3x3 tent upsample, blended additively onto the next larger mip
const UP = HEADER + `
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uRadius;
void main() {
    vec2 t = uTexel * uRadius;
    vec3 c = texture(uSource, vUv).rgb * 4.0;
    c += (texture(uSource, vUv + vec2(-t.x, 0)).rgb + texture(uSource, vUv + vec2(t.x, 0)).rgb
        + texture(uSource, vUv + vec2(0, -t.y)).rgb + texture(uSource, vUv + vec2(0, t.y)).rgb) * 2.0;
    c += texture(uSource, vUv + vec2(-t.x, -t.y)).rgb + texture(uSource, vUv + vec2(t.x, -t.y)).rgb
        + texture(uSource, vUv + vec2(-t.x, t.y)).rgb + texture(uSource, vUv + vec2(t.x, t.y)).rgb;
    fragColor = vec4(c / 16.0, 1.0);
}`;

export class Post {
    constructor(gl, vao, hasFloat) {
        this.gl = gl;
        this.vao = vao;
        this.fmt = formats(gl, hasFloat);
        this.programs = {
            bright: createProgram(gl, FULLSCREEN_VS, BRIGHT),
            down: createProgram(gl, FULLSCREEN_VS, DOWN),
            up: createProgram(gl, FULLSCREEN_VS, UP),
            streak: createProgram(gl, FULLSCREEN_VS, STREAK),
            rays: createProgram(gl, FULLSCREEN_VS, GODRAYS),
            composite: createProgram(gl, FULLSCREEN_VS, COMPOSITE)
        };
        this.mips = [];
        this.extra = [];
    }

    resize(w, h) {
        const { gl, fmt } = this;
        this.scene?.dispose();
        this.mips.forEach((m) => m.dispose());
        this.extra.forEach((m) => m.dispose());
        this.scene = createTarget(gl, w, h, { ...fmt.rgba, depth: true });
        this.mips = [];
        // Always keep at least one (tiny) bloom mip so render() never indexes
        // an empty chain on very small canvases
        let mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
        for (let i = 0; i < 6 && mw >= 1 && mh >= 1; i++) {
            this.mips.push(createTarget(gl, mw, mh, fmt.rgba));
            mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
        }
        // Streaks: very wide, very short buffers so a few blur passes cover the whole screen width
        const sw = Math.max(8, w >> 2), sh = Math.max(8, h >> 3);
        this.streakA = createTarget(gl, sw, sh, fmt.rgba);
        this.streakB = createTarget(gl, sw, sh, fmt.rgba);
        this.rays = createTarget(gl, Math.max(8, w >> 2), Math.max(8, h >> 2), fmt.rgba);
        this.extra = [this.streakA, this.streakB, this.rays];
        this.w = w; this.h = h;
    }

    render(fluid, u) {
        const { gl, vao, programs: p, mips } = this;
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);

        pass(gl, vao, p.bright, mips[0], { uSource: this.scene.tex, uThreshold: u.bloomThreshold });
        for (let i = 1; i < mips.length; i++) {
            pass(gl, vao, p.down, mips[i], { uSource: mips[i - 1].tex, uTexel: mips[i - 1].texel });
        }

        // Anamorphic streak: repeated horizontal blurs with growing step size, from the half-res bright pass
        let src = mips[0];
        let dst = this.streakA;
        for (let i = 0; i < 4; i++) {
            pass(gl, vao, p.streak, dst, { uSource: src.tex, uTexel: src.texel, uStep: Math.pow(3, i) * 0.6 });
            src = dst;
            dst = dst === this.streakA ? this.streakB : this.streakA;
        }
        const streakTex = src.tex;

        // 48-tap radial blur: skip it entirely when it wouldn't contribute
        const raysOn = (u.raysStrength ?? 0) > 0 || (u.lensDirt ?? 0) > 0;
        if (raysOn) {
            pass(gl, vao, p.rays, this.rays, {
                uSource: (mips[1] || mips[0]).tex, uCenter: u.lightPos || [0.5, 0.5], uDensity: 0.8, uDecay: 0.95
            });
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        for (let i = mips.length - 1; i > 0; i--) {
            pass(gl, vao, p.up, mips[i - 1], { uSource: mips[i].tex, uTexel: mips[i].texel, uRadius: u.bloomRadius });
        }
        gl.disable(gl.BLEND);

        pass(gl, vao, p.composite, null, {
            uScene: this.scene.tex,
            uBloom: mips[0].tex,
            uStreak: streakTex,
            uRays: this.rays.tex,
            uVelocity: fluid?.velocityTexture || fluid?.velocity?.read?.tex || this.scene.tex,
            uDye: fluid?.dyeTexture || fluid?.dye?.read?.tex || this.scene.tex,
            uBloomStrength: u.bloomStrength ?? 0.5,
            uStreakStrength: u.streakStrength ?? 0.15,
            uStreakTint: u.streakTint || [1, 1, 1],
            uRaysStrength: u.raysStrength ?? 0.0,
            uDirt: u.lensDirt ?? 0.0,
            uDistortion: u.distortion ?? u.liquidDistortion ?? 1.0,
            uBarrel: u.barrel ?? 0.0,
            uAberration: u.aberration ?? u.chromaticAberration ?? 0.025,
            uWarp: u.warp ?? 0.0,
            uDyeAmount: u.dyeAmount ?? 0.0,
            uGrain: u.grain ?? 0.045,
            uVignette: u.vignette ?? 0.85,
            uExposure: u.exposure ?? 0.95,
            uScanlines: u.scanlines ?? 0.0,
            uGrade: u.grade ?? 0.0,
            uTime: u.time ?? 0.0,
            uResolution: [this.w, this.h],
            uFlash: u.flash ?? 0.0,
            uFade: u.fade ?? 1.0
        });
    }
}
