export const VERTEX_SHADER_SOURCE = `
attribute vec2 position;
varying vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER_SOURCE = `
precision mediump float;
varying vec2 vUv;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_phaseBass;
uniform float u_phaseMid;
uniform float u_phaseHigh;
uniform vec3 u_colorBg;
uniform vec3 u_colorAccent;
uniform vec3 u_colorSurface;
uniform vec3 u_colorMuted;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    vec2 blobCenter = vec2(aspect * 0.52, 0.25);
    vec2 warped = p - blobCenter;
    warped.x += sin(warped.y * 1.5 + u_phaseBass * 0.8) * 0.35;
    warped.y += cos(warped.x * 1.5 + u_phaseMid * 0.6) * 0.35;
    warped.x += sin(warped.y * 3.0 + u_phaseMid * 1.0) * 0.15;
    warped.y += cos(warped.x * 3.0 + u_phaseHigh * 0.8) * 0.15;
    float d = length(warped);
    float baseRadius = 0.5 + 0.18 * sin(u_phaseBass * 0.5);
    float glow = smoothstep(baseRadius + 0.8, baseRadius - 0.2, d);
    vec2 orbit = vec2(0.45 * sin(u_time * 0.5 + u_phaseMid * 0.3), 0.35 * cos(u_time * 0.4 + u_phaseHigh * 0.2));
    vec2 satelliteWarped = p - blobCenter - orbit;
    satelliteWarped.x += sin(satelliteWarped.y * 2.0 + u_phaseMid * 0.5) * 0.15;
    satelliteWarped.y += cos(satelliteWarped.x * 2.0 + u_phaseBass * 0.4) * 0.15;
    float dSatellite = length(satelliteWarped);
    float satelliteGlow = smoothstep(0.35, -0.05, dSatellite) * 0.7;
    float totalGlow = clamp(glow + satelliteGlow, 0.0, 1.0);
    float pattern1 = sin(warped.x * 2.2 + u_phaseBass * 0.7);
    float pattern2 = cos(warped.y * 2.2 + u_phaseMid * 0.5);
    float pattern3 = sin((warped.x + warped.y) * 1.5 + u_phaseHigh * 0.9);
    float w1 = clamp(0.5 + 0.5 * pattern1, 0.0, 1.0);
    float w2 = clamp(0.5 + 0.5 * pattern2, 0.0, 1.0);
    float w3 = clamp(0.5 + 0.5 * pattern3, 0.0, 1.0);
    vec3 mix1 = mix(u_colorAccent, u_colorSurface, w1);
    vec3 mix2 = mix(u_colorMuted, u_colorAccent * 1.3, w2);
    vec3 coreColor = mix(mix1, mix2, w3);
    coreColor += u_colorAccent * pow(max(0.0, 1.0 - min(d, dSatellite)), 3.0) * (0.5 + 0.25 * sin(u_phaseBass));
    vec3 col = mix(u_colorBg, coreColor, totalGlow);
    col = pow(col, vec3(0.85));
    col = clamp(col, 0.0, 1.0);
    float vig = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    vig = clamp(pow(16.0 * vig, 0.25), 0.0, 1.0);
    col *= mix(0.75, 1.0, vig);
    gl_FragColor = vec4(col, 1.0);
}
`;

export function compileShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

export function createWebGLProgram(
    gl: WebGLRenderingContext,
    vsSource: string,
    fsSource: string
): WebGLProgram | null {
    const vs = compileShader(gl, vsSource, gl.VERTEX_SHADER);
    const fs = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

