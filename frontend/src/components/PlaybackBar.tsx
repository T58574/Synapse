import React, { useState } from 'react';
import { ShuffleIcon, PrevIcon, PauseIcon, PlayIcon, NextIcon, RepeatIcon, BoltIcon, LightningIcon, VolumeIcon, QueueIcon } from './Icons';
import { TrackInfo } from '../types';
import { Language, useTranslation } from '../localization';
import { getFilename, formatTime } from '../utils';

interface PlaybackBarProps {
    tracks: [TrackInfo | null, TrackInfo | null];
    activeSlot: 0 | 1;
    playing: [boolean, boolean];
    shuffle: boolean;
    setShuffle: (shuffle: boolean) => void;
    repeat: boolean;
    setRepeat: (repeat: boolean) => void;
    handlePrev: () => void;
    handleNext: () => void;
    handleGlobalPlayPause: () => void;
    dragPosition: number | null;
    setDragPosition: (pos: number | null) => void;
    dragPositionRef: React.MutableRefObject<number | null>;
    positions: [number, number];
    volumes: [number, number];
    handleVolume: (slot: number, val: number) => void;
    autoMix: boolean;
    handleToggleAutoMix: () => void;
    copyToClipboard?: (text: string, label: string) => void;
    language: Language;
    currentCover?: string | null;
    queue?: TrackInfo[];
    removeFromQueue?: (index: number) => void;
    clearQueue?: () => void;
}

export const PlaybackBar: React.FC<PlaybackBarProps> = ({
    tracks,
    activeSlot,
    playing,
    shuffle,
    setShuffle,
    repeat,
    setRepeat,
    handlePrev,
    handleNext,
    handleGlobalPlayPause,
    dragPosition,
    setDragPosition,
    dragPositionRef,
    positions,
    volumes,
    handleVolume,
    autoMix,
    handleToggleAutoMix,
    copyToClipboard,
    language,
    currentCover,
    queue = [],
    removeFromQueue,
    clearQueue
}) => {
    const { t } = useTranslation(language);
    const [isQueueOpen, setIsQueueOpen] = useState(false);
    const activeTrack = tracks[activeSlot];
    const duration = activeTrack?.durationSec ?? 0;
    const progress = dragPosition !== null ? dragPosition : (activeTrack && duration > 0 ? positions[activeSlot] / duration : 0);

    return (
        <footer className="playback-bar">
            <div className="playback-left">
                {activeTrack ? (
                    <div className="playing-meta">
                        {currentCover ? (
                            <img src={currentCover} alt="cover" className="playing-cover-img" />
                        ) : (
                            <span className="playing-spark"><BoltIcon /></span>
                        )}
                        <div className="meta-text">
                            <span 
                                className="playing-title clickable-copy"
                                onClick={() => {
                                    const title = activeTrack.title || getFilename(activeTrack.filePath);
                                    if (copyToClipboard) {
                                        copyToClipboard(title, 'title');
                                    } else {
                                        navigator.clipboard.writeText(title);
                                    }
                                }}
                                title={t('clickToCopyTitle')}
                            >
                                {activeTrack.title || getFilename(activeTrack.filePath)}
                            </span>
                            <span className="playing-stats">
                                {activeTrack.artist && (
                                    <span 
                                        className="playing-artist-copy clickable-copy"
                                        onClick={() => {
                                            const art = activeTrack.artist || '';
                                            if (copyToClipboard) {
                                                copyToClipboard(art, 'artist');
                                            } else {
                                                navigator.clipboard.writeText(art);
                                            }
                                        }}
                                        title={t('clickToCopyArtist')}
                                        style={{ marginRight: '8px', color: 'var(--accent-color)', fontWeight: 'bold' }}
                                    >
                                        {activeTrack.artist}
                                    </span>
                                )}
                                BPM: {Math.round(activeTrack.bpm)} | {t('keyCol')}: {activeTrack.keySignature}
                            </span>
                        </div>
                    </div>
                ) : (
                    <span className="no-playing">{t('noTrackPlaying')}</span>
                )}
            </div>

            <div className="playback-middle">
                <div className="playback-bar-controls">
                    <button className={`nav-ctrl-btn ${shuffle ? 'active' : ''}`} onClick={() => setShuffle(!shuffle)}>
                        <ShuffleIcon />
                    </button>
                    <button className="nav-ctrl-btn" onClick={handlePrev}>
                        <PrevIcon />
                    </button>
                    <button className="global-play-btn" onClick={handleGlobalPlayPause}>
                        {playing[activeSlot] ? <PauseIcon /> : <PlayIcon />}
                    </button>
                    <button className="nav-ctrl-btn" onClick={handleNext}>
                        <NextIcon />
                    </button>
                    <button className={`nav-ctrl-btn ${repeat ? 'active' : ''}`} onClick={() => setRepeat(!repeat)}>
                        <RepeatIcon />
                    </button>
                </div>

                <div className="progress-container">
                    <span className="progress-time">
                        {formatTime(dragPosition !== null ? dragPosition * duration : positions[activeSlot])}
                    </span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.001"
                        value={progress}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            dragPositionRef.current = val;
                            setDragPosition(val);
                        }}
                        className="progress-slider"
                        style={{
                            background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${progress * 100}%, var(--border-color) ${progress * 100}%, var(--border-color) 100%)`
                        }}
                    />
                    <span className="progress-time">
                        {activeTrack ? formatTime(activeTrack.durationSec) : "0:00"}
                    </span>
                </div>
            </div>

            <div className="playback-right">
                <div className="bar-queue-container" style={{ position: 'relative' }}>
                    <button 
                        className={`nav-ctrl-btn ${isQueueOpen ? 'active' : ''}`}
                        onClick={() => setIsQueueOpen(!isQueueOpen)}
                        title={t('queueTitle')}
                        style={{ position: 'relative', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <QueueIcon />
                        {queue.length > 0 && (
                            <span className="queue-badge">{queue.length}</span>
                        )}
                    </button>
                    {isQueueOpen && (
                        <div className="queue-popover">
                            <div className="queue-header">
                                <span style={{ fontWeight: 600 }}>{t('queueTitle')} ({queue.length})</span>
                                {queue.length > 0 && clearQueue && (
                                    <button className="clear-queue-btn" onClick={clearQueue}>
                                        {t('clearQueue')}
                                    </button>
                                )}
                            </div>
                            <div className="queue-list">
                                {queue.length === 0 ? (
                                    <div className="queue-empty">{t('emptyQueue')}</div>
                                ) : (
                                    queue.map((tItem, qIdx) => (
                                        <div key={`${tItem.filePath}-${qIdx}`} className="queue-item">
                                            <span className="queue-item-num">{qIdx + 1}</span>
                                            <div className="queue-item-meta">
                                                <span className="queue-item-title">{tItem.title || getFilename(tItem.filePath)}</span>
                                                <span className="queue-item-artist">{tItem.artist || 'Unknown Artist'}</span>
                                            </div>
                                            {removeFromQueue && (
                                                <button className="queue-item-remove" onClick={() => removeFromQueue(qIdx)}>✕</button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bar-automix">
                    <span className="bar-automix-label">{t('automixLabel')}</span>
                    <button 
                        className={`bar-automix-toggle ${autoMix ? 'active' : ''}`}
                        onClick={handleToggleAutoMix}
                    >
                        <LightningIcon />
                        <span>{autoMix ? (language === 'ru' ? 'ВКЛ' : 'ON') : (language === 'ru' ? 'ВЫКЛ' : 'OFF')}</span>
                    </button>
                </div>

                <div className="bar-volume">
                    <span className="vol-icon"><VolumeIcon /></span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volumes[activeSlot]}
                        onChange={(e) => handleVolume(activeSlot, parseFloat(e.target.value))}
                        className="volume-slider"
                        style={{
                            background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${volumes[activeSlot] * 100}%, var(--border-color) ${volumes[activeSlot] * 100}%, var(--border-color) 100%)`
                        }}
                    />
                </div>
            </div>
        </footer>
    );
};
