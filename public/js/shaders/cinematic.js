// Cinematic lens + film effects, kept separate from the core bloom chain.

export const STREAK = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uStep;
// Wide horizontal blur: stretches highlights into anamorphic lens streaks
void main() {
    vec3 c = vec3(0.0);
    float total = 0.0;
    for (int i = -8; i <= 8; i++) {
        float w = exp(-float(i * i) / 24.0);
        c += texture(uSource, vUv + vec2(float(i) * uStep * uTexel.x, 0.0)).rgb * w;
        total += w;
    }
    fragColor = vec4(c / total, 1.0);
}`;

export const GODRAYS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
uniform vec2 uCenter;
uniform float uDensity;
uniform float uDecay;
// Radial blur toward the light source: volumetric light shafts in screen space
void main() {
    const int SAMPLES = 48;
    vec2 delta = (vUv - uCenter) * uDensity / float(SAMPLES);
    vec2 uv = vUv;
    float illum = 1.0;
    vec3 c = vec3(0.0);
    for (int i = 0; i < SAMPLES; i++) {
        uv -= delta;
        c += texture(uSource, uv).rgb * illum;
        illum *= uDecay;
    }
    fragColor = vec4(c / float(SAMPLES), 1.0);
}`;

export const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uStreak;
uniform sampler2D uRays;
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform float uBloomStrength;
uniform float uStreakStrength;
uniform vec3 uStreakTint;
uniform float uRaysStrength;
uniform float uDirt;
uniform float uDistortion;
uniform float uBarrel;
uniform float uAberration;
uniform float uWarp;
uniform float uDyeAmount;
uniform float uGrain;
uniform float uVignette;
uniform float uExposure;
uniform float uScanlines;
uniform float uGrade;
uniform float uTime;
uniform vec2 uResolution;
uniform float uFlash;
uniform float uFade;
uniform vec2 uLight;
uniform float uFlashlight;

vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}

// Procedural lens dirt: smudges and specks only visible where bright light hits the lens
float lensDirt(vec2 uv) {
    vec2 p = uv * vec2(uResolution.x / uResolution.y, 1.0);
    float smudge = smoothstep(0.55, 0.95, vnoise(p * 3.0) * 0.6 + vnoise(p * 9.0) * 0.4);
    float specks = smoothstep(0.92, 1.0, vnoise(p * 42.0)) * 0.8;
    return smudge * 0.7 + specks;
}

// Teal shadows, warm highlights: classic blockbuster split toning
vec3 grade(vec3 c) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 shadows = vec3(0.0, 0.07, 0.11);
    vec3 highs = vec3(0.12, 0.05, -0.04);
    c += shadows * (1.0 - smoothstep(0.0, 0.5, l)) + highs * smoothstep(0.4, 1.0, l);
    c = mix(vec3(l), c, 1.12);
    // Gentle S-curve for deeper blacks without crushing the core
    c = c * c * (3.0 - 2.0 * min(c, vec3(1.0))) * 0.35 + c * 0.65;
    return max(c, 0.0);
}

void main() {
    // Barrel distortion, like a wide anamorphic lens
    vec2 cc = vUv - 0.5;
    float r2 = dot(cc, cc);
    vec2 uv = 0.5 + cc * (1.0 + uBarrel * r2) / (1.0 + uBarrel * 0.25);

    vec2 vel = texture(uVelocity, uv).xy;
    // Cap the displacement so a violent swipe ripples the frame instead of tearing it
    vec2 disp = vel * uDistortion * 0.0005;
    float dispLen = length(disp);
    if (dispLen > 0.025) disp *= 0.025 / dispLen;
    uv -= disp;

    vec2 dir = uv - 0.5;
    float strength = uAberration * (dot(dir, dir) * 2.0 + length(vel) * 0.002) + uWarp * 0.02;
    vec3 col = vec3(0.0);
    // Warp: radial motion blur toward the centre during hyperspace jumps
    const int TAPS = 8;
    for (int i = 0; i < TAPS; i++) {
        float k = 1.0 - float(i) / float(TAPS) * uWarp * 0.35;
        vec2 suv = 0.5 + dir * k;
        col.r += texture(uScene, suv + dir * strength).r;
        col.g += texture(uScene, suv).g;
        col.b += texture(uScene, suv - dir * strength).b;
    }
    col /= float(TAPS);

    vec3 bloom = texture(uBloom, uv).rgb;
    vec3 streak = texture(uStreak, uv).rgb;
    vec3 rays = texture(uRays, uv).rgb;
    col += bloom * uBloomStrength;
    col += streak * uStreakTint * uStreakStrength;
    col += rays * uRaysStrength;
    col += (bloom + rays) * lensDirt(vUv) * uDirt;
    col += texture(uDye, uv).rgb * uDyeAmount;

    col *= uExposure;
    col += uFlash;
    col = mix(col, grade(col), uGrade);
    col = aces(col);
    col = pow(col, vec3(1.0 / 2.2));

    // Pointer "flashlight": a soft cool glow that follows the cursor and
    // gently lifts the scene around it
    vec2 ld = (vUv - uLight) * vec2(uResolution.x / uResolution.y, 1.0);
    float light = exp(-dot(ld, ld) * 9.0) * uFlashlight;
    col += light * vec3(0.55, 0.72, 0.85) * 0.16;

    float vig = smoothstep(0.9, 0.15, length(cc * vec2(uResolution.x / uResolution.y, 1.0) * 0.9));
    col *= mix(1.0, vig, uVignette);

    float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159 * 0.5);
    col *= 1.0 - uScanlines * scan;
    col *= 1.0 - uScanlines * 0.5 * smoothstep(0.0, 1.0, sin(vUv.y * 3.0 - uTime * 2.0) * 0.5 + 0.5);

    float g = hash12(gl_FragCoord.xy + fract(uTime * 37.0) * 1000.0) - 0.5;
    col += g * uGrain;

    col *= uFade;
    fragColor = vec4(col, 1.0);
}`;
