// One-shot particle bursts for card clicks — a small CPU-integrated point
// cloud that sprays toward the camera and dissolves, Active Theory style.
import { createProgram } from './gl.js';

const MAX = 1024;

const VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;
layout(location = 2) in float aLife;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uPixelRatio;
out vec3 vColor;
out float vLife;
out float vDepth;
void main() {
    vec4 view = uView * vec4(aPos, 1.0);
    gl_Position = uProj * view;
    vDepth = -view.z;
    // Sparks start large and shrink as they die; perspective-scaled
    gl_PointSize = (1.0 + aLife * 5.0) * uPixelRatio * (9.0 / max(vDepth, 0.5));
    vColor = aColor;
    vLife = aLife;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vColor;
in float vLife;
in float vDepth;
out vec4 fragColor;
void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    float a = smoothstep(0.5, 0.0, r) * vLife;
    a *= smoothstep(0.2, 1.2, vDepth);
    fragColor = vec4(vColor * a, a);
}`;

export class Bursts {
    constructor(gl) {
        this.gl = gl;
        this.program = createProgram(gl, VS, FS);
        this.count = 0;

        // Interleaved per-particle data: position(3) color(3) life(1)
        this.data = new Float32Array(MAX * 7);
        this.vel = new Float32Array(MAX * 3);
        this.life = new Float32Array(MAX);

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);

        const stride = 7 * 4;
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * 4);

        gl.bindVertexArray(null);
    }

    // Spray `n` particles from a world-space point toward the camera.
    spawn(world, color, cameraPos, n = 96) {
        const [cx, cy, cz] = cameraPos;
        const [px, py, pz] = world;
        let dx = cx - px, dy = cy - py, dz = cz - pz;
        const dl = Math.hypot(dx, dy, dz) || 1;
        dx /= dl; dy /= dl; dz /= dl;

        for (let k = 0; k < n && this.count < MAX; k++) {
            const i = this.count++;
            const o = i * 7;

            // Start scattered slightly around the hit point
            this.data[o] = px + (Math.random() - 0.5) * 0.35;
            this.data[o + 1] = py + (Math.random() - 0.5) * 0.35;
            this.data[o + 2] = pz + (Math.random() - 0.5) * 0.2;

            // Mostly toward the camera, plus a random outward spray
            const speed = 5 + Math.random() * 9;
            this.vel[i * 3] = dx * speed + (Math.random() - 0.5) * 7;
            this.vel[i * 3 + 1] = dy * speed + (Math.random() - 0.5) * 7;
            this.vel[i * 3 + 2] = dz * speed + (Math.random() - 0.5) * 7;

            // Accent color lifted toward white so it reads as sparks
            const w = 0.25 + Math.random() * 0.5;
            this.data[o + 3] = Math.min(1, color[0] * 0.85 + w * 0.4);
            this.data[o + 4] = Math.min(1, color[1] * 0.85 + w * 0.4);
            this.data[o + 5] = Math.min(1, color[2] * 0.85 + w * 0.4);

            const life = 0.55 + Math.random() * 0.6;
            this.life[i] = life;
            this.data[o + 6] = 1;
        }
    }

    update(dt) {
        if (this.count === 0) return;
        const data = this.data, vel = this.vel, life = this.life;
        const damp = Math.pow(0.06, dt); // heavy drag, sparks slow quickly

        for (let i = 0; i < this.count;) {
            life[i] -= dt;
            if (life[i] <= 0) {
                // Swap-remove with the last live particle
                const last = --this.count;
                if (i !== last) {
                    data.copyWithin(i * 7, last * 7, last * 7 + 7);
                    const e = i * 3, l = last * 3;
                    vel[e] = vel[l]; vel[e + 1] = vel[l + 1]; vel[e + 2] = vel[l + 2];
                    life[i] = life[last];
                }
                continue;
            }
            const o = i * 7, v = i * 3;
            vel[v] *= damp; vel[v + 1] *= damp; vel[v + 2] *= damp;
            data[o] += vel[v] * dt;
            data[o + 1] += vel[v + 1] * dt;
            data[o + 2] += vel[v + 2] * dt;
            data[o + 6] = Math.min(1, life[i] * 1.8);
            i++;
        }

        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, this.count * 7);
    }

    draw(camera, pixelRatio) {
        if (this.count === 0) return;
        const gl = this.gl;

        gl.useProgram(this.program.program);
        gl.uniformMatrix4fv(this.program.uniforms.uProj, false, camera.proj);
        gl.uniformMatrix4fv(this.program.uniforms.uView, false, camera.view);
        gl.uniform1f(this.program.uniforms.uPixelRatio, pixelRatio);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.POINTS, 0, this.count);
        gl.depthMask(true);
        gl.bindVertexArray(null);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
    }
}
