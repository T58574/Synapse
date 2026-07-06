import React, { useEffect, useRef } from 'react';
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import { TrackInfo } from '../../types';
import { createWebGLProgram, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE } from './FluidWaveShader';

interface VisualizerContainerProps {
    activeSlot: 0 | 1;
    tracks: [TrackInfo | null, TrackInfo | null];
    playing: [boolean, boolean];
    currentTheme: string;
}

interface Palette {
    bg: [number, number, number];
    accent: [number, number, number];
    surface: [number, number, number];
    muted: [number, number, number];
}

const PALETTES: Record<string, Palette> = {
    saas: {
        bg: [11/255, 13/255, 16/255],
        accent: [0/255, 255/255, 194/255],
        surface: [21/255, 26/255, 33/255],
        muted: [138/255, 153/255, 173/255]
    },
    neutrals: {
        bg: [240/255, 238/255, 233/255],
        accent: [99/255, 91/255, 255/255],
        surface: [255/255, 255/255, 255/255],
        muted: [98/255, 104/255, 117/255]
    },
    fintech: {
        bg: [7/255, 7/255, 10/255],
        accent: [0/255, 229/255, 229/255],
        surface: [17/255, 16/255, 30/255],
        muted: [136/255, 132/255, 164/255]
    },
    trust: {
        bg: [248/255, 250/255, 252/255],
        accent: [26/255, 115/255, 232/255],
        surface: [255/255, 255/255, 255/255],
        muted: [100/255, 116/255, 139/255]
    },
    eco: {
        bg: [231/255, 216/255, 198/255],
        accent: [49/255, 98/255, 99/255],
        surface: [250/255, 246/255, 240/255],
        muted: [106/255, 95/255, 80/255]
    }
};

const MOOD_TO_PALETTE: Record<string, string> = {
    energetic: 'saas',
    dark: 'fintech',
    chill: 'eco',
    happy: 'neutrals',
    calm: 'trust',
    peaceful: 'trust'
};

const getTrackPalette = (filePath: string, isLight: boolean): Palette => {
    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
        hash = filePath.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);
    const baseHue = hash % 360;
    const secondaryHue = (baseHue + 40 + (hash % 80)) % 360;
    const accentHue = (baseHue + 120 + (hash % 120)) % 360;
    const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
        h /= 360;
        s /= 100;
        l /= 100;
        let r = l;
        let g = l;
        let b = l;
        if (s !== 0) {
            const hue2rgb = (p: number, q: number, t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return [r, g, b];
    };
    return {
        bg: isLight ? hslToRgb(baseHue, 15, 95) : hslToRgb(baseHue, 35, 4),
        accent: isLight ? hslToRgb(accentHue, 85, 45) : hslToRgb(accentHue, 95, 55),
        surface: isLight ? hslToRgb(baseHue, 30, 85) : hslToRgb(baseHue, 90, 45),
        muted: isLight ? hslToRgb(secondaryHue, 25, 65) : hslToRgb(secondaryHue, 85, 40)
    };
};

export const VisualizerContainer: React.FC<VisualizerContainerProps> = ({
    activeSlot,
    tracks,
    playing,
    currentTheme
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const audioStateRef = useRef({ activeSlot, playing });
    const spectrumDataRef = useRef<number[]>(new Array(64).fill(0));

    useEffect(() => {
        audioStateRef.current = { activeSlot, playing };
    }, [activeSlot, playing]);

    useEffect(() => {
        const unsubscribe = EventsOn("spectrum", (data: { deck0: number[], deck1: number[] }) => {
            const currentActiveSlot = audioStateRef.current.activeSlot;
            const currentPlaying = audioStateRef.current.playing[currentActiveSlot];
            if (currentPlaying) {
                const spec = currentActiveSlot === 0 ? data.deck0 : data.deck1;
                if (spec) {
                    spectrumDataRef.current = spec;
                }
            } else {
                spectrumDataRef.current = spectrumDataRef.current.map(v => v * 0.9);
            }
        });
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const gl = canvas.getContext('webgl');
        if (!gl) return;

        const program = createWebGLProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
        if (!program) return;

        gl.useProgram(program);

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        const vertices = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        const uniforms = {
            u_time: gl.getUniformLocation(program, 'u_time'),
            u_resolution: gl.getUniformLocation(program, 'u_resolution'),
            u_phaseBass: gl.getUniformLocation(program, 'u_phaseBass'),
            u_phaseMid: gl.getUniformLocation(program, 'u_phaseMid'),
            u_phaseHigh: gl.getUniformLocation(program, 'u_phaseHigh'),
            u_colorBg: gl.getUniformLocation(program, 'u_colorBg'),
            u_colorAccent: gl.getUniformLocation(program, 'u_colorAccent'),
            u_colorSurface: gl.getUniformLocation(program, 'u_colorSurface'),
            u_colorMuted: gl.getUniformLocation(program, 'u_colorMuted'),
        };

        let animationFrameId = 0;
        let lastTime = performance.now();
        let totalTime = 0;

        let phaseBass = 0;
        let phaseMid = 0;
        let phaseHigh = 0;

        const smoothed = { bass: 0, mid: 0, high: 0 };
        const currentColors = {
            bg: [0, 0, 0] as [number, number, number],
            accent: [0, 0, 0] as [number, number, number],
            surface: [0, 0, 0] as [number, number, number],
            muted: [0, 0, 0] as [number, number, number],
        };

        const isLightTheme = currentTheme === 'neutrals' || currentTheme === 'trust' || currentTheme === 'eco';
        const activeTrack = tracks[activeSlot];
        const initialPalette = (activeTrack?.filePath)
            ? getTrackPalette(activeTrack.filePath, isLightTheme)
            : (PALETTES[currentTheme] || PALETTES.saas);

        currentColors.bg = [...initialPalette.bg];
        currentColors.accent = [...initialPalette.accent];
        currentColors.surface = [...initialPalette.surface];
        currentColors.muted = [...initialPalette.muted];

        const resizeCanvas = () => {
            const downsample = 3;
            const width = Math.max(32, Math.floor(canvas.clientWidth / downsample));
            const height = Math.max(32, Math.floor(canvas.clientHeight / downsample));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                gl.viewport(0, 0, width, height);
            }
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        const fpsLimit = 30;
        const interval = 1000 / fpsLimit;
        let lastDrawTime = performance.now();

        const render = (now: number) => {
            animationFrameId = requestAnimationFrame(render);

            const elapsed = now - lastDrawTime;
            if (elapsed < interval) {
                return;
            }

            lastDrawTime = now - (elapsed % interval);

            const dt = (now - lastTime) / 1000;
            lastTime = now;
            totalTime += dt;

            const frameDt = Math.min(dt, 0.1);

            const spec = spectrumDataRef.current;
            let rawBass = 0;
            let rawMid = 0;
            let rawHigh = 0;

            for (let i = 0; i < 7; i++) rawBass += spec[i] || 0;
            for (let i = 7; i < 25; i++) rawMid += spec[i] || 0;
            for (let i = 25; i < 64; i++) rawHigh += spec[i] || 0;

            rawBass = Math.min(1.0, (rawBass / 7) / 75.0);
            rawMid = Math.min(1.0, (rawMid / 18) / 75.0);
            rawHigh = Math.min(1.0, (rawHigh / 39) / 75.0);

            smoothed.bass = smoothed.bass * 0.88 + rawBass * 0.12;
            smoothed.mid = smoothed.mid * 0.88 + rawMid * 0.12;
            smoothed.high = smoothed.high * 0.88 + rawHigh * 0.12;

            phaseBass += frameDt * (0.35 + smoothed.bass * 3.5);
            phaseMid += frameDt * (0.25 + smoothed.mid * 2.5);
            phaseHigh += frameDt * (0.18 + smoothed.high * 1.8);

            const currentActiveTrack = tracks[audioStateRef.current.activeSlot];
            const targetPalette = (currentActiveTrack?.filePath)
                ? getTrackPalette(currentActiveTrack.filePath, isLightTheme)
                : (PALETTES[currentTheme] || PALETTES.saas);

            const lerpSpeed = 0.04;
            for (let i = 0; i < 3; i++) {
                currentColors.bg[i] = currentColors.bg[i] * (1 - lerpSpeed) + targetPalette.bg[i] * lerpSpeed;
                currentColors.accent[i] = currentColors.accent[i] * (1 - lerpSpeed) + targetPalette.accent[i] * lerpSpeed;
                currentColors.surface[i] = currentColors.surface[i] * (1 - lerpSpeed) + targetPalette.surface[i] * lerpSpeed;
                currentColors.muted[i] = currentColors.muted[i] * (1 - lerpSpeed) + targetPalette.muted[i] * lerpSpeed;
            }

            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.useProgram(program);

            gl.uniform1f(uniforms.u_time, totalTime);
            gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
            gl.uniform1f(uniforms.u_phaseBass, phaseBass);
            gl.uniform1f(uniforms.u_phaseMid, phaseMid);
            gl.uniform1f(uniforms.u_phaseHigh, phaseHigh);
            gl.uniform3fv(uniforms.u_colorBg, currentColors.bg);
            gl.uniform3fv(uniforms.u_colorAccent, currentColors.accent);
            gl.uniform3fv(uniforms.u_colorSurface, currentColors.surface);
            gl.uniform3fv(uniforms.u_colorMuted, currentColors.muted);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        };

        animationFrameId = requestAnimationFrame(render);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
            gl.deleteBuffer(positionBuffer);
            gl.deleteProgram(program);
        };
    }, [tracks, activeSlot, currentTheme]);

    return (
        <canvas
            ref={canvasRef}
            className="fluid-visualizer-canvas"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'block',
                pointerEvents: 'none',
                zIndex: 0,
                opacity: 0.55
            }}
        />
    );
};
