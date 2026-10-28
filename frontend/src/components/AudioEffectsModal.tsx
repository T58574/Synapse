import React, { useState, useEffect, useRef } from 'react';
import { Language, useTranslation } from '../localization';
import { EventsOn } from "../../wailsjs/runtime/runtime";

interface AudioEffectsModalProps {
    isOpen: boolean;
    onClose: () => void;
    eq10Values: [number, number, number, number, number, number, number, number, number, number];
    setEQ10Value: (bandIndex: number, val: number) => void;
    setEQ10Whole: (bands: number[]) => void;
    dspParams: {
        limiterBoost: number;
        stereoWidth: number;
        reverbMix: number;
        bassBoost: number;
        trebleExciter: number;
    };
    setDSPParam: (param: string, val: number) => void;
    language: Language;
    activeSlot: 0 | 1;
    customPresets: Record<string, number[]>;
    onSavePreset: (name: string, bands: number[]) => void;
    onDeletePreset: (name: string) => void;
}

export const FACTORY_PRESETS: Record<string, number[]> = {
    Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Rock: [4.0, 3.0, 2.0, -1.0, -2.0, -1.0, 1.0, 3.0, 4.0, 4.0],
    Pop: [-2.0, -1.0, 0.0, 2.0, 3.0, 3.0, 1.0, 0.0, -1.0, -2.0],
    Jazz: [3.0, 2.0, 1.0, 2.0, -1.0, -1.0, 0.0, 1.0, 2.0, 3.0],
    Electronic: [5.0, 4.0, 1.0, 0.0, -2.0, 2.0, 1.0, 0.0, 4.0, 5.0],
    BassBoost: [6.0, 5.0, 4.0, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    VocalBoost: [-3.0, -3.0, -2.0, 0.0, 2.0, 4.0, 4.0, 3.0, 1.0, -1.0]
};

const BANDS_LABELS = ['31Hz', '62Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];

export const AudioEffectsModal: React.FC<AudioEffectsModalProps> = ({
    isOpen,
    onClose,
    eq10Values,
    setEQ10Value,
    setEQ10Whole,
    dspParams,
    setDSPParam,
    language,
    activeSlot,
    customPresets,
    onSavePreset,
    onDeletePreset
}) => {
    const { t } = useTranslation(language);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [newPresetName, setNewPresetName] = useState('');
    const [selectedPresetKey, setSelectedPresetKey] = useState<string>('Custom');
    const spectrumRef = useRef<Float32Array>(new Float32Array(64));

    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);

        // Subscribe to spectrum events for real-time visualization
        const cancel = EventsOn("spectrum", (data: { deck0?: number[]; deck1?: number[] }) => {
            const deckKey = activeSlot === 0 ? "deck0" : "deck1";
            if (data && data[deckKey]) {
                spectrumRef.current = new Float32Array(data[deckKey]);
            }
        });

        return () => {
            window.removeEventListener('keydown', handleEscape);
            cancel();
        };
    }, [isOpen, activeSlot, onClose]);

    // Canvas rendering loop for visualizer behind EQ sliders
    useEffect(() => {
        if (!isOpen) return;

        let animationFrameId: number;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resizeCanvas = () => {
            canvas.width = canvas.parentElement?.clientWidth || 550;
            canvas.height = canvas.parentElement?.clientHeight || 260;
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        const render = () => {
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // Fetch accent color from CSS variables
            const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#00FFC2';

            const spec = spectrumRef.current;
            const numPoints = 10; // Match 10 EQ bands
            const points: { x: number; y: number }[] = [];

            ctx.beginPath();
            ctx.moveTo(0, h);

            for (let i = 0; i < numPoints; i++) {
                // Map the spectrum bins to our 10 frequencies
                // Logarithmic mapping: lower bands take lower spectrum indices, higher bands take higher
                const specIndex = Math.min(Math.floor(Math.pow(i / (numPoints - 1), 1.5) * spec.length), spec.length - 1);
                const magnitude = spec[specIndex] || 0.0;
                
                const x = (i / (numPoints - 1)) * w;
                // High peak visualization
                const y = h - (magnitude * h * 0.75) - 10;
                points.push({ x, y });
            }

            // Draw a smooth bezier curve through points
            ctx.lineTo(points[0].x, points[0].y);
            for (let i = 0; i < points.length - 1; i++) {
                const xc = (points[i].x + points[i + 1].x) / 2;
                const yc = (points[i].y + points[i + 1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }
            ctx.lineTo(w, points[points.length - 1].y);
            ctx.lineTo(w, h);
            ctx.closePath();

            // Create gradient fill
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, accentColor + '2A');
            grad.addColorStop(1, accentColor + '00');
            ctx.fillStyle = grad;
            ctx.fill();

            // Draw border line
            ctx.beginPath();
            ctx.moveTo(0, points[0].y);
            for (let i = 0; i < points.length - 1; i++) {
                const xc = (points[i].x + points[i + 1].x) / 2;
                const yc = (points[i].y + points[i + 1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }
            ctx.lineTo(w, points[points.length - 1].y);
            ctx.strokeStyle = accentColor + '88';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            animationFrameId = requestAnimationFrame(render);
        };
        render();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handlePresetChange = (name: string) => {
        setSelectedPresetKey(name);
        if (FACTORY_PRESETS[name]) {
            setEQ10Whole(FACTORY_PRESETS[name]);
        } else if (customPresets[name]) {
            setEQ10Whole(customPresets[name]);
        }
    };

    const handleSaveCustomPreset = () => {
        const trimmed = newPresetName.trim();
        if (!trimmed) return;
        onSavePreset(trimmed, [...eq10Values]);
        setSelectedPresetKey(trimmed);
        setNewPresetName('');
    };

    const handleOverlayClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).classList.contains('effects-modal-backdrop')) {
            onClose();
        }
    };

    return (
        <div className="effects-modal-backdrop" onClick={handleOverlayClick}>
            <div className="effects-modal-container">
                <header className="effects-modal-header">
                    <h2>{t('soundEnhancement')}</h2>
                    <button className="close-modal-btn" onClick={onClose}>✕</button>
                </header>

                <div className="effects-modal-layout">
                    {/* LEFT PANEL: 10-Band EQ with Real-time Spectrum Background */}
                    <div className="eq-panel-section">
                        <h3>{t('eq10')}</h3>
                        <div className="eq-canvas-container">
                            <canvas ref={canvasRef} className="eq-visualizer-canvas" />
                            <div className="eq-sliders-row">
                                {eq10Values.map((val, idx) => (
                                    <div key={idx} className="eq-slider-column">
                                        <span className="eq-val-bubble">
                                            {val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}
                                        </span>
                                        <div className="eq-slider-vertical-wrapper">
                                            <input
                                                type="range"
                                                min="-12"
                                                max="12"
                                                step="0.5"
                                                value={val}
                                                onChange={(e) => {
                                                    setEQ10Value(idx, parseFloat(e.target.value));
                                                    setSelectedPresetKey('Custom');
                                                }}
                                                className="eq-slider-vertical"
                                            />
                                        </div>
                                        <span className="eq-freq-label">{BANDS_LABELS[idx]}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANEL: DSP Effects & Presets */}
                    <div className="fx-presets-section">
                        {/* Presets Subsection */}
                        <div className="presets-block">
                            <h3>{t('presets')}</h3>
                            <div className="presets-controls-row">
                                <select
                                    value={selectedPresetKey}
                                    onChange={(e) => handlePresetChange(e.target.value)}
                                    className="preset-select-dropdown"
                                >
                                    <option value="Custom" disabled>{language === 'ru' ? 'Пользовательский' : 'Custom/Modified'}</option>
                                    <optgroup label={language === 'ru' ? 'Заводские пресеты' : 'Factory Presets'}>
                                        {Object.keys(FACTORY_PRESETS).map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </optgroup>
                                    {Object.keys(customPresets).length > 0 && (
                                        <optgroup label={language === 'ru' ? 'Пользовательские' : 'Custom Presets'}>
                                            {Object.keys(customPresets).map(name => (
                                                <option key={name} value={name}>{name}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                </select>
                                {customPresets[selectedPresetKey] && (
                                    <button 
                                        className="delete-preset-btn"
                                        onClick={() => {
                                            onDeletePreset(selectedPresetKey);
                                            setSelectedPresetKey('Custom');
                                        }}
                                        title={language === 'ru' ? 'Удалить пресет' : 'Delete preset'}
                                    >
                                        🗑
                                    </button>
                                )}
                            </div>
                            <div className="save-preset-input-row">
                                <input
                                    type="text"
                                    placeholder={t('presetName')}
                                    value={newPresetName}
                                    onChange={(e) => setNewPresetName(e.target.value)}
                                    className="preset-name-input"
                                />
                                <button className="preset-save-btn" onClick={handleSaveCustomPreset}>
                                    {language === 'ru' ? 'Сохранить' : 'Save'}
                                </button>
                            </div>
                        </div>

                        {/* DSP FX Subsection */}
                        <div className="dsp-sliders-block">
                            <h3>DSP Effects</h3>

                            {/* 1. Limiter / Maximizer */}
                            <div className="dsp-fx-item">
                                <div className="dsp-fx-header">
                                    <label>{t('limiterMaximizer')}</label>
                                    <span className="dsp-fx-val">+{dspParams.limiterBoost.toFixed(1)} dB</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="12"
                                    step="0.5"
                                    value={dspParams.limiterBoost}
                                    onChange={(e) => setDSPParam('limiterBoost', parseFloat(e.target.value))}
                                    className="dsp-slider-horizontal"
                                />
                            </div>

                            {/* 2. Stereo Widener */}
                            <div className="dsp-fx-item">
                                <div className="dsp-fx-header">
                                    <label>{t('stereoWidener')}</label>
                                    <span className="dsp-fx-val">{Math.round(dspParams.stereoWidth * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.05"
                                    value={dspParams.stereoWidth}
                                    onChange={(e) => setDSPParam('stereoWidth', parseFloat(e.target.value))}
                                    className="dsp-slider-horizontal"
                                />
                            </div>

                            {/* 3. Psychoacoustic Bass Boost */}
                            <div className="dsp-fx-item">
                                <div className="dsp-fx-header">
                                    <label>{t('bassBoost')}</label>
                                    <span className="dsp-fx-val">{Math.round(dspParams.bassBoost * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={dspParams.bassBoost}
                                    onChange={(e) => setDSPParam('bassBoost', parseFloat(e.target.value))}
                                    className="dsp-slider-horizontal"
                                />
                            </div>

                            {/* 4. Exciter */}
                            <div className="dsp-fx-item">
                                <div className="dsp-fx-header">
                                    <label>{t('exciter')}</label>
                                    <span className="dsp-fx-val">{Math.round(dspParams.trebleExciter * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={dspParams.trebleExciter}
                                    onChange={(e) => setDSPParam('trebleExciter', parseFloat(e.target.value))}
                                    className="dsp-slider-horizontal"
                                />
                            </div>

                            {/* 5. Reverb Mix */}
                            <div className="dsp-fx-item">
                                <div className="dsp-fx-header">
                                    <label>{t('reverb')}</label>
                                    <span className="dsp-fx-val">{Math.round(dspParams.reverbMix * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={dspParams.reverbMix}
                                    onChange={(e) => setDSPParam('reverbMix', parseFloat(e.target.value))}
                                    className="dsp-slider-horizontal"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
