// GPU fluid simulation (semi-Lagrangian advection + pressure projection).
// Pointer movement injects velocity and dye; the result also drives
// screen-space distortion in post-processing.
import { createProgram, createDouble, createTarget, pass, FULLSCREEN_VS, formats } from './gl.js';

const HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
`;

const SPLAT = HEADER + `
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uValue;
uniform float uRadius;
uniform float uAspect;
void main() {
    vec2 d = vUv - uPoint;
    d.x *= uAspect;
    vec3 splat = exp(-dot(d, d) / uRadius) * uValue;
    fragColor = vec4(texture(uTarget, vUv).xyz + splat, 1.0);
}`;

const ADVECT = HEADER + `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDissipation;
void main() {
    vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexel;
    fragColor = texture(uSource, coord) / (1.0 + uDissipation * uDt);
}`;

const DIVERGENCE = HEADER + `
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
    float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
    float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
    fragColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
}`;

const CURL = HEADER + `
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
    float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
    float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
    float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
    fragColor = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
}`;

// Re-adds small swirls that numerical dissipation smooths away
const VORTICITY = HEADER + `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uStrength;
uniform float uDt;
void main() {
    float l = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x;
    float c = texture(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
    force /= length(force) + 1e-4;
    force *= uStrength * c * vec2(1.0, -1.0);
    vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
    fragColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
}`;

const PRESSURE = HEADER + `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main() {
    float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    float div = texture(uDivergence, vUv).x;
    fragColor = vec4((l + r + b + t - div) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = HEADER + `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
    float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    vec2 vel = texture(uVelocity, vUv).xy - vec2(r - l, t - b);
    fragColor = vec4(vel, 0.0, 1.0);
}`;

const FADE = HEADER + `
uniform sampler2D uSource;
uniform float uValue;
void main() { fragColor = texture(uSource, vUv) * uValue; }`;

export class Fluid {
    constructor(gl, vao, hasFloat, params) {
        this.gl = gl;
        this.vao = vao;
        this.params = params;
        this.fmt = formats(gl, hasFloat);
        // Velocity and pressure are signed; without float render targets they
        // clamp to [0,1] and the sim silently renders wrong. Bail out instead
        // so the caller can fall back to a neutral dummy texture.
        if (this.fmt.rg.type === gl.UNSIGNED_BYTE) {
            throw new Error('Fluid simulation requires float render targets');
        }
        this.programs = Object.fromEntries(
            Object.entries({ SPLAT, ADVECT, DIVERGENCE, CURL, VORTICITY, PRESSURE, GRADIENT, FADE })
                .map(([k, src]) => [k, createProgram(gl, FULLSCREEN_VS, src)])
        );
        this.splats = [];
        this.resize(gl.drawingBufferWidth / gl.drawingBufferHeight);
    }

    resize(aspect) {
        const { gl, fmt } = this;
        this.aspect = aspect;
        const size = (base) => aspect >= 1
            ? [Math.round(base * aspect), base]
            : [base, Math.round(base / aspect)];
        const [sw, sh] = size(this.params.simRes);
        const [dw, dh] = size(this.params.dyeRes);

        for (const t of [this.velocity, this.dye, this.pressure, this.divergence, this.curl]) t?.dispose();
        this.velocity = createDouble(gl, sw, sh, fmt.rg);
        this.dye = createDouble(gl, dw, dh, fmt.rgba);
        this.pressure = createDouble(gl, sw, sh, fmt.r);
        this.divergence = createTarget(gl, sw, sh, { ...fmt.r, filter: gl.NEAREST });
        this.curl = createTarget(gl, sw, sh, { ...fmt.r, filter: gl.NEAREST });
    }

    // uv in [0,1], delta in uv units per frame, color as rgb
    splat(uv, delta, color) {
        this.splats.push({ uv, delta, color });
    }

    step(dt) {
        const { gl, vao, programs: p, params } = this;
        dt = Math.min(dt, 1 / 30);
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);

        // The SPLAT shader already corrects d.x by aspect, so the radius stays
        // in UV units — scaling it here too would make splats elliptical
        const radius = params.splatRadius / 100;
        for (const s of this.splats) {
            const force = params.splatForce;
            pass(gl, vao, p.SPLAT, this.velocity.write, {
                uTarget: this.velocity.read.tex, uPoint: s.uv, uAspect: this.aspect, uRadius: radius,
                uValue: [s.delta[0] * force, s.delta[1] * force, 0]
            });
            this.velocity.swap();
            pass(gl, vao, p.SPLAT, this.dye.write, {
                uTarget: this.dye.read.tex, uPoint: s.uv, uAspect: this.aspect, uRadius: radius, uValue: s.color
            });
            this.dye.swap();
        }
        this.splats.length = 0;

        const texel = this.velocity.read.texel;
        pass(gl, vao, p.CURL, this.curl, { uVelocity: this.velocity.read.tex, uTexel: texel });
        pass(gl, vao, p.VORTICITY, this.velocity.write, {
            uVelocity: this.velocity.read.tex, uCurl: this.curl.tex, uTexel: texel, uStrength: params.curl, uDt: dt
        });
        this.velocity.swap();

        pass(gl, vao, p.DIVERGENCE, this.divergence, { uVelocity: this.velocity.read.tex, uTexel: texel });

        // Warm-start the pressure solve from a decayed copy of last frame's result
        pass(gl, vao, p.FADE, this.pressure.write, { uSource: this.pressure.read.tex, uValue: params.pressureDecay });
        this.pressure.swap();
        for (let i = 0; i < params.pressureIterations; i++) {
            pass(gl, vao, p.PRESSURE, this.pressure.write, {
                uPressure: this.pressure.read.tex, uDivergence: this.divergence.tex, uTexel: texel
            });
            this.pressure.swap();
        }

        pass(gl, vao, p.GRADIENT, this.velocity.write, {
            uPressure: this.pressure.read.tex, uVelocity: this.velocity.read.tex, uTexel: texel
        });
        this.velocity.swap();

        pass(gl, vao, p.ADVECT, this.velocity.write, {
            uVelocity: this.velocity.read.tex, uSource: this.velocity.read.tex, uTexel: texel,
            uDt: dt, uDissipation: params.velocityDissipation
        });
        this.velocity.swap();

        pass(gl, vao, p.ADVECT, this.dye.write, {
            uVelocity: this.velocity.read.tex, uSource: this.dye.read.tex, uTexel: texel,
            uDt: dt, uDissipation: params.dyeDissipation
        });
        this.dye.swap();
    }

    get velocityTexture() { return this.velocity.read.tex; }
    get dyeTexture() { return this.dye.read.tex; }
}
