// GLSL Shaders for 3D Project Cards in the Portfolio Showcase
// Supports dynamic liquid displacement, chromatic aberration, velocity skew,
// expanding click shockwaves, and edge specular sheen.

export const CARD_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uVelocity;
uniform float uHover;
uniform float uTime;

out vec2 vUv;
out vec3 vNormal;
out vec3 vViewPos;
out vec3 vWorldPos;

void main() {
    vUv = aUv;
    
    vec3 pos = aPosition;
    
    // Dynamic aerodynamic skew & curve based on drag velocity
    float skew = clamp(uVelocity * 0.08, -0.4, 0.4);
    pos.x += pos.y * skew;
    
    // Slight cylindrical bend for card depth
    float bend = sin(aUv.x * 3.14159) * (0.08 + abs(uVelocity) * 0.05);
    pos.z -= bend;

    vec4 world = uModel * vec4(pos, 1.0);
    vec4 view = uView * world;
    
    vNormal = mat3(uModel) * aNormal;
    vWorldPos = world.xyz;
    vViewPos = view.xyz;
    
    gl_Position = uProj * view;
}
`;

export const CARD_FS = `#version 300 es
precision highp float;

in vec2 vUv;
in vec3 vNormal;
in vec3 vViewPos;
in vec3 vWorldPos;

uniform sampler2D uTexture;
uniform sampler2D uLogTexture;
uniform vec4 uLogRect;  // xy: uv origin, zw: uv size
uniform vec3 uAccent;
uniform vec2 uPointer; // Normalized pointer [0..1] on card
uniform float uHover;   // 0..1 smooth hover state
uniform float uVelocity;
uniform float uTime;
uniform vec4 uRipple;   // xy: center, z: time/age, w: intensity
uniform float uDistortion;
uniform float uAberration;

out vec4 fragColor;

void main() {
    vec2 uv = vUv;
    
    // 1. Interactive water-ripple surface displacement from cursor
    vec2 pDiff = uv - uPointer;
    float pDist = length(pDiff);
    float pFactor = exp(-pDist * 5.0) * uHover;
    float pWave = sin(pDist * 32.0 - uTime * 6.0) * pFactor * 0.02 * uDistortion;
    vec2 pDisp = (pDiff / max(pDist, 0.001)) * pWave;
    
    // 2. Expanding click shockwave
    vec2 rDiff = uv - uRipple.xy;
    float rDist = length(rDiff);
    float rAge = uRipple.z;
    float rIntensity = uRipple.w;
    float rOffset = (rDist - rAge * 0.8) * 8.0;
    float rBand = exp(-(rOffset * rOffset));
    float rWave = sin((rDist - rAge * 0.8) * 40.0) * rBand * rIntensity * exp(-rAge * 2.0) * 0.035;
    vec2 rDisp = (rDiff / max(rDist, 0.001)) * rWave;
    
    // 3. Velocity fluid wave
    float vWave = sin(uv.y * 8.0 + uTime * 3.0) * uVelocity * 0.015 * uDistortion;
    
    vec2 totalDisp = pDisp + rDisp + vec2(vWave, 0.0);
    
    // 4. Chromatic aberration sampling
    float split = min(uAberration * (0.6 + abs(uVelocity) * 2.5 + uHover * 0.8 + rBand * 1.5), 0.03);
    vec2 splitDir = normalize(totalDisp + vec2(0.8, 0.2));
    if (length(totalDisp) < 1e-4) splitDir = vec2(1.0, 0.0);
    
    vec2 uvR = uv + totalDisp + splitDir * split;
    vec2 uvG = uv + totalDisp;
    vec2 uvB = uv + totalDisp - splitDir * split;
    
    float r = texture(uTexture, clamp(uvR, 0.001, 0.999)).r;
    float g = texture(uTexture, clamp(uvG, 0.001, 0.999)).g;
    float b = texture(uTexture, clamp(uvB, 0.001, 0.999)).b;
    vec3 col = vec3(r, g, b);

    // 4b. Composite the typed terminal log overlay. The base poster excludes
    //     this region, so only the small log texture needs re-uploading on hover.
    if (uLogRect.z > 0.0) {
        vec2 logUv = (uv - uLogRect.xy) / uLogRect.zw;
        if (logUv.x >= 0.0 && logUv.x <= 1.0 && logUv.y >= 0.0 && logUv.y <= 1.0) {
            vec4 logSample = texture(uLogTexture, logUv);
            col = mix(col, logSample.rgb, logSample.a);
        }
    }
    
    // 5. Border frame highlight (minimalist geometric edge)
    vec2 edgeDist = min(uv, 1.0 - uv);
    float edge = min(edgeDist.x, edgeDist.y);
    float borderLine = smoothstep(0.012, 0.004, edge);
    float innerGaze = smoothstep(0.08, 0.0, edge) * 0.25;
    
    col = mix(col, uAccent * 1.2, borderLine * (0.35 + uHover * 0.65));
    col += uAccent * innerGaze * (0.15 + uHover * 0.3);
    
    // 6. View rim specular sheen
    vec3 viewDir = normalize(-vViewPos);
    vec3 norm = normalize(vNormal);
    float fresnel = pow(1.0 - max(dot(norm, viewDir), 0.0), 3.0);
    col += uAccent * fresnel * (0.12 + uHover * 0.35);
    
    // 7. Interactive cursor spot illumination
    float spot = exp(-pDist * 3.5) * uHover * 0.12;
    col += (uAccent + vec3(0.5)) * spot;
    
    // 8. Subtle contrast / exposure boost when hovered
    col = mix(col, col * 1.15 + vec3(0.02), uHover * 0.7);
    
    fragColor = vec4(col, 1.0);
}
`;
