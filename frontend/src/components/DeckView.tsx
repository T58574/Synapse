import React from 'react';
import { LoadIcon, PlayIcon, PauseIcon, ResetIcon } from './Icons';
import { TrackInfo } from '../types';

interface DeckViewProps {
    tracks: [TrackInfo | null, TrackInfo | null];
    playing: [boolean, boolean];
    handleSelectAndLoad: (slot: 0 | 1) => void;
    canvasRef0: React.Ref<HTMLCanvasElement>;
    canvasRef1: React.Ref<HTMLCanvasElement>;
    spectrumRef0: React.Ref<HTMLCanvasElement>;
    spectrumRef1: React.Ref<HTMLCanvasElement>;
    getFilename: (path: string) => string;
    volumes: [number, number];
    tempos: [number, number];
    pitches: [number, number];
    eqs: [[number, number, number], [number, number, number]];
    handleVolume: (slot: number, val: number) => void;
    handleTempo: (slot: number, val: number) => void;
    handlePitch: (slot: number, val: number) => void;
    handleEq: (slot: number, band: 'bass' | 'mid' | 'treble', val: number) => void;
    handleCanvasClick: (e: React.MouseEvent<HTMLCanvasElement>, slot: number) => void;
    handlePlayPause: (slot: number) => void;
}

export const DeckView: React.FC<DeckViewProps> = ({
    tracks,
    playing,
    handleSelectAndLoad,
    canvasRef0,
    canvasRef1,
    spectrumRef0,
    spectrumRef1,
    getFilename,
    volumes,
    tempos,
    pitches,
    eqs,
    handleVolume,
    handleTempo,
    handlePitch,
    handleEq,
    handleCanvasClick,
    handlePlayPause
}) => {
    return (
        <div className="decks-view-tab">
            <div className="decks-layout">
                {[0, 1].map((idx) => {
                    const slot = idx as 0 | 1;
                    const track = tracks[slot];
                    const canvasRef = slot === 0 ? canvasRef0 : canvasRef1;
                    const spectrumRef = slot === 0 ? spectrumRef0 : spectrumRef1;

                    return (
                        <section key={slot} className={`deck-card ${playing[slot] ? 'deck-active' : ''}`}>
                            <div className="deck-header">
                                <h2 className="deck-title">DECK {slot === 0 ? 'A' : 'B'}</h2>
                                <button className="load-btn" onClick={() => handleSelectAndLoad(slot)}>
                                    <LoadIcon />
                                    <span>Load Track</span>
                                </button>
                            </div>

                            {track ? (
                                <div className="track-details">
                                    <h3 className="track-name">{getFilename(track.filePath)}</h3>
                                    <div className="stats-grid">
                                        <div className="stat-box">
                                            <span className="stat-label">BPM</span>
                                            <span className="stat-val">{track.bpm.toFixed(1)}</span>
                                        </div>
                                        <div className="stat-box">
                                            <span className="stat-label">KEY</span>
                                            <span className="stat-val signature-glowing">{track.keySignature}</span>
                                        </div>
                                        <div className="stat-box">
                                            <span className="stat-label">TEMPO</span>
                                            <span className="stat-val">{tempos[slot].toFixed(2)}x</span>
                                        </div>
                                    </div>

                                    <div className="visualizer-container" style={{ position: 'relative' }}>
                                        <canvas
                                            ref={spectrumRef}
                                            width={600}
                                            height={120}
                                            className="spectrum-canvas"
                                            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', opacity: 0.8 }}
                                        />
                                        <canvas
                                            ref={canvasRef}
                                            width={600}
                                            height={120}
                                            className="waveform-canvas"
                                            onClick={(e) => handleCanvasClick(e, slot)}
                                            style={{ position: 'relative', zIndex: 10, mixBlendMode: 'screen' }}
                                        />
                                    </div>

                                    <div className="controls-grid">
                                        <div className="playback-controls">
                                            <button className="play-btn" onClick={() => handlePlayPause(slot)}>
                                                {playing[slot] ? <PauseIcon /> : <PlayIcon />}
                                            </button>
                                        </div>

                                        <div className="sliders-section">
                                            <div className="slider-group">
                                                <label>Volume</label>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.01"
                                                    value={volumes[slot]}
                                                    onChange={(e) => handleVolume(slot, parseFloat(e.target.value))}
                                                    className="slider"
                                                    style={{
                                                        background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${volumes[slot] * 100}%, var(--border-color) ${volumes[slot] * 100}%, var(--border-color) 100%)`
                                                    }}
                                                />
                                                <span className="slider-badge">{(volumes[slot] * 100).toFixed(0)}%</span>
                                            </div>

                                            <div className="slider-group">
                                                <label>Tempo</label>
                                                <input
                                                    type="range"
                                                    min="0.8"
                                                    max="1.2"
                                                    step="0.01"
                                                    value={tempos[slot]}
                                                    onChange={(e) => handleTempo(slot, parseFloat(e.target.value))}
                                                    className="slider"
                                                    style={{
                                                        background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((tempos[slot] - 0.8) / 0.4) * 100}%, var(--border-color) ${((tempos[slot] - 0.8) / 0.4) * 100}%, var(--border-color) 100%)`
                                                    }}
                                                />
                                                <span 
                                                    className="slider-badge resetable"
                                                    onClick={() => handleTempo(slot, 1.0)}
                                                >
                                                    <ResetIcon />
                                                    <span>{tempos[slot].toFixed(2)}x</span>
                                                </span>
                                            </div>

                                            <div className="slider-group">
                                                <label>Pitch Shift</label>
                                                <input
                                                    type="range"
                                                    min="-6"
                                                    max="6"
                                                    step="1"
                                                    value={pitches[slot]}
                                                    onChange={(e) => handlePitch(slot, parseInt(e.target.value))}
                                                    className="slider"
                                                    style={{
                                                        background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((pitches[slot] + 6) / 12) * 100}%, var(--border-color) ${((pitches[slot] + 6) / 12) * 100}%, var(--border-color) 100%)`
                                                    }}
                                                />
                                                <span 
                                                    className="slider-badge resetable"
                                                    onClick={() => handlePitch(slot, 0.0)}
                                                >
                                                    <ResetIcon />
                                                    <span>{pitches[slot] > 0 ? `+${pitches[slot]}` : pitches[slot]} st</span>
                                                </span>
                                            </div>

                                            <div className="eq-section" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                                                <div className="slider-group">
                                                    <label>Bass</label>
                                                    <input
                                                        type="range"
                                                        min="-12"
                                                        max="12"
                                                        step="1"
                                                        value={eqs[slot][0]}
                                                        onChange={(e) => handleEq(slot, 'bass', parseFloat(e.target.value))}
                                                        className="slider"
                                                        style={{
                                                            background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((eqs[slot][0] + 12) / 24) * 100}%, var(--border-color) ${((eqs[slot][0] + 12) / 24) * 100}%, var(--border-color) 100%)`
                                                        }}
                                                    />
                                                    <span className="slider-badge resetable" onClick={() => handleEq(slot, 'bass', 0)}>
                                                        <ResetIcon />
                                                        <span>{eqs[slot][0] > 0 ? `+${eqs[slot][0]}` : eqs[slot][0]} dB</span>
                                                    </span>
                                                </div>

                                                <div className="slider-group">
                                                    <label>Mid</label>
                                                    <input
                                                        type="range"
                                                        min="-12"
                                                        max="12"
                                                        step="1"
                                                        value={eqs[slot][1]}
                                                        onChange={(e) => handleEq(slot, 'mid', parseFloat(e.target.value))}
                                                        className="slider"
                                                        style={{
                                                            background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((eqs[slot][1] + 12) / 24) * 100}%, var(--border-color) ${((eqs[slot][1] + 12) / 24) * 100}%, var(--border-color) 100%)`
                                                        }}
                                                    />
                                                    <span className="slider-badge resetable" onClick={() => handleEq(slot, 'mid', 0)}>
                                                        <ResetIcon />
                                                        <span>{eqs[slot][1] > 0 ? `+${eqs[slot][1]}` : eqs[slot][1]} dB</span>
                                                    </span>
                                                </div>

                                                <div className="slider-group">
                                                    <label>Treble</label>
                                                    <input
                                                        type="range"
                                                        min="-12"
                                                        max="12"
                                                        step="1"
                                                        value={eqs[slot][2]}
                                                        onChange={(e) => handleEq(slot, 'treble', parseFloat(e.target.value))}
                                                        className="slider"
                                                        style={{
                                                            background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((eqs[slot][2] + 12) / 24) * 100}%, var(--border-color) ${((eqs[slot][2] + 12) / 24) * 100}%, var(--border-color) 100%)`
                                                        }}
                                                    />
                                                    <span className="slider-badge resetable" onClick={() => handleEq(slot, 'treble', 0)}>
                                                        <ResetIcon />
                                                        <span>{eqs[slot][2] > 0 ? `+${eqs[slot][2]}` : eqs[slot][2]} dB</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="deck-empty">
                                    <div className="empty-card">
                                        <div className="empty-icon-container">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="32" height="32">
                                                <circle cx="12" cy="12" r="10" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        </div>
                                        <h3>Deck is empty</h3>
                                        <p>Click "Load Track" or drag a file to load.</p>
                                    </div>
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
        </div>
    );
};
