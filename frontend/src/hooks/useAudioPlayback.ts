import React, { useState, useEffect, useRef } from 'react';
import { TrackInfo } from '../types';
import {
    LoadTrack,
    Play,
    Pause,
    Seek,
    SetVolume,
    GetPosition,
    IsPlaying,
    ToggleAutoMix,
    SelectAudioFile,
    SetCrossfadeDuration,
    GetTrackCover,
    SetEQ,
    SetEQ10,
    SetDSP
} from '../../wailsjs/go/backend/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

interface UseAudioPlaybackParams {
    libraryTracks: TrackInfo[];
    currentPlaylistTracks: TrackInfo[];
    eqValues: [number, number, number];
    eq10Values: [number, number, number, number, number, number, number, number, number, number];
    dspParams: {
        limiterBoost: number;
        stereoWidth: number;
        reverbMix: number;
        bassBoost: number;
        trebleExciter: number;
    };
    uiLog: (level: 'INFO' | 'WARN' | 'ERROR', msg: string) => void;
    showToast: (msg: string) => void;
    language: string;
}

export function useAudioPlayback({
    libraryTracks,
    currentPlaylistTracks,
    eqValues,
    eq10Values,
    dspParams,
    uiLog,
    showToast,
    language
}: UseAudioPlaybackParams) {
    const [tracks, setTracks] = useState<[TrackInfo | null, TrackInfo | null]>([null, null]);
    const [playing, setPlaying] = useState<[boolean, boolean]>([false, false]);
    const [positions, setPositions] = useState<[number, number]>([0, 0]);
    const [volumes, setVolumes] = useState<[number, number]>(() => {
        try {
            const val = localStorage.getItem('synapse_volume') || localStorage.getItem('soundplayer_volume');
            if (val) {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed) && parsed.length === 2) {
                    return [Number(parsed[0]), Number(parsed[1])];
                }
            }
        } catch {}
        return [0.8, 0.8];
    });

    const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
    const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
    const [autoMix, setAutoMix] = useState<boolean>(false);
    const [crossfadeDuration, setCrossfadeDurationState] = useState<number>(8.0);
    const [shuffle, setShuffle] = useState<boolean>(false);
    const [repeat, setRepeat] = useState<boolean>(false);
    const [isMyWave, setIsMyWave] = useState<boolean>(false);
    const [queue, setQueue] = useState<TrackInfo[]>([]);
    const [currentCover, setCurrentCover] = useState<string | null>(null);
    const coversCacheRef = useRef<Map<string, string>>(new Map());

    const addToQueue = (track: TrackInfo) => {
        setQueue(prev => [...prev, track]);
        const parts = track.filePath.split(/[/\\]/);
        const filename = parts[parts.length - 1] || track.filePath;
        const trackTitle = track.title || filename;
        showToast(language === 'ru' ? `Добавлено в очередь: ${trackTitle}` : `Added to queue: ${trackTitle}`);
        uiLog('INFO', `addToQueue: ${track.filePath}`);
    };

    const removeFromQueue = (index: number) => {
        setQueue(prev => prev.filter((_, i) => i !== index));
    };

    const clearQueue = () => {
        setQueue([]);
    };

    useEffect(() => {
        const activeTrack = tracks[activeSlot];
        if (!activeTrack?.filePath) {
            setCurrentCover(null);
            return;
        }
        const path = activeTrack.filePath;
        if (coversCacheRef.current.has(path)) {
            setCurrentCover(coversCacheRef.current.get(path) || null);
            return;
        }

        GetTrackCover(path).then((dataUrl) => {
            if (dataUrl) {
                coversCacheRef.current.set(path, dataUrl);
                setCurrentCover(dataUrl);
            } else {
                coversCacheRef.current.set(path, '');
                setCurrentCover(null);
            }
        }).catch(() => {
            setCurrentCover(null);
        });
    }, [tracks[activeSlot]?.filePath]);

    const [dragPosition, setDragPosition] = useState<number | null>(null);
    const dragPositionRef = useRef<number | null>(null);
    const ignorePositionUntilRef = useRef<number>(0);
    const switchingRef = useRef(false);
    const loadingPathRef = useRef<[string | null, string | null]>([null, null]);

    const stateRef = useRef({
        tracks: [null, null] as [TrackInfo | null, TrackInfo | null],
        playing: [false, false] as [boolean, boolean],
        positions: [0, 0] as [number, number],
        activeSlot: 0 as 0 | 1,
        currentTrackIndex: -1,
        autoMix: false,
        libraryTracks: [] as TrackInfo[],
        shuffle: false,
        repeat: false,
        currentPlaylistTracks: [] as TrackInfo[],
        isMyWave: false,
        dragPosition: null as number | null,
        queue: [] as TrackInfo[]
    });

    useEffect(() => {
        stateRef.current = {
            tracks,
            playing,
            positions,
            activeSlot,
            currentTrackIndex,
            autoMix,
            libraryTracks,
            shuffle,
            repeat,
            currentPlaylistTracks,
            isMyWave,
            dragPosition,
            queue
        };
    });

    useEffect(() => {
        dragPositionRef.current = dragPosition;
    }, [dragPosition]);

    const handleLoadDeck = async (slot: number, path: string) => {
        if (loadingPathRef.current[slot as 0 | 1] === path) {
            uiLog('WARN', `handleLoadDeck: уже грузится slot=${slot} path=${path} — пропуск`);
            return;
        }
        loadingPathRef.current[slot as 0 | 1] = path;
        uiLog('INFO', `handleLoadDeck: начало slot=${slot} path=${path}`);
        try {
            try { await Pause(slot); } catch {}

            const meta = await LoadTrack(slot, path);
            try { await SetEQ(slot, eqValues[0], eqValues[1], eqValues[2]); } catch {}
            try { await SetEQ10(slot, eq10Values); } catch {}
            try { await SetDSP(slot, dspParams.limiterBoost, dspParams.stereoWidth, dspParams.reverbMix, dspParams.bassBoost, dspParams.trebleExciter); } catch {}

            const cachedTrack = libraryTracks.find(t => t.filePath === path);
            setTracks(prev => {
                const updated = [...prev] as [TrackInfo | null, TrackInfo | null];
                updated[slot] = {
                    filePath: path,
                    title: cachedTrack?.title || meta.title,
                    artist: cachedTrack?.artist || meta.artist,
                    genre: cachedTrack?.genre || meta.genre,
                    durationSec: cachedTrack ? cachedTrack.durationSec : meta.durationSec,
                    bpm: Math.round(cachedTrack ? cachedTrack.bpm : meta.bpm),
                    keySignature: cachedTrack ? cachedTrack.keySignature : meta.keySignature,
                    waveform: (cachedTrack && cachedTrack.waveform && cachedTrack.waveform.length > 0)
                        ? cachedTrack.waveform
                        : (meta.waveform || [])
                };
                return updated;
            });

            setPlaying(prev => {
                const updated = [...prev] as [boolean, boolean];
                updated[slot] = false;
                return updated;
            });

            setPositions(prev => {
                const updated = [...prev] as [number, number];
                updated[slot] = 0;
                return updated;
            });

            uiLog('INFO', `handleLoadDeck: OK slot=${slot}`);
        } catch (err) {
            uiLog('ERROR', `handleLoadDeck: ошибка slot=${slot} path=${path}: ${String(err)}`);
        } finally {
            loadingPathRef.current[slot as 0 | 1] = null;
        }
    };

    const handleSelectAndLoad = async (slot: number) => {
        const path = await SelectAudioFile();
        if (path) {
            await handleLoadDeck(slot, path);
        }
    };

    const handlePlayPause = async (slot: number) => {
        if (!tracks[slot]) return;
        setActiveSlot(slot as 0 | 1);
        if (playing[slot]) {
            uiLog('INFO', `handlePlayPause: pause slot=${slot}`);
            await Pause(slot);
            setPlaying(prev => {
                const updated = [...prev] as [boolean, boolean];
                updated[slot] = false;
                return updated;
            });
        } else {
            uiLog('INFO', `handlePlayPause: play slot=${slot}`);
            await Play(slot);
            setPlaying(prev => {
                const updated = [...prev] as [boolean, boolean];
                updated[slot] = true;
                return updated;
            });
        }
    };

    const handlePlayLibraryTrack = async (index: number, keepMyWave = false) => {
        if (libraryTracks.length === 0) {
            uiLog('WARN', 'handlePlayLibraryTrack: библиотека пуста');
            return;
        }
        if (currentTrackIndex === index) {
            uiLog('INFO', `handlePlayLibraryTrack: тот же индекс ${index} — play/pause`);
            await handleGlobalPlayPause();
            return;
        }
        if (switchingRef.current) {
            uiLog('WARN', `handlePlayLibraryTrack: уже идёт переключение — пропуск index=${index}`);
            return;
        }
        switchingRef.current = true;
        uiLog('INFO', `handlePlayLibraryTrack: переключение на index=${index} slot=${activeSlot}`);
        try {
            if (!keepMyWave) {
                setIsMyWave(false);
            }
            setCurrentTrackIndex(index);
            const track = libraryTracks[index];
            await handleLoadDeck(activeSlot, track.filePath);
            await Play(activeSlot);
            setPlaying(prev => {
                const updated = [...prev] as [boolean, boolean];
                updated[activeSlot] = true;
                return updated;
            });
            uiLog('INFO', `handlePlayLibraryTrack: запущен index=${index}`);
        } finally {
            switchingRef.current = false;
        }
    };

    const handleGlobalPlayPause = async () => {
        const slot = activeSlot;
        if (!tracks[slot]) {
            if (libraryTracks.length > 0) {
                await handlePlayLibraryTrack(0);
            }
            return;
        }
        if (playing[slot]) {
            uiLog('INFO', `handleGlobalPlayPause: pause slot=${slot}`);
            await Pause(slot);
            setPlaying(prev => {
                const updated = [...prev] as [boolean, boolean];
                updated[slot] = false;
                return updated;
            });
        } else {
            uiLog('INFO', `handleGlobalPlayPause: play slot=${slot}`);
            await Play(slot);
            setPlaying(prev => {
                const updated = [...prev] as [boolean, boolean];
                updated[slot] = true;
                return updated;
            });
        }
    };

    const handleHeroPlayClick = async (filteredTracks: TrackInfo[]) => {
        const activeTrack = tracks[activeSlot];
        if (!activeTrack) {
            const playlist = filteredTracks.length > 0 ? filteredTracks : libraryTracks;
            if (playlist.length > 0) {
                const idx = libraryTracks.findIndex(t => t.filePath === playlist[0].filePath);
                await handlePlayLibraryTrack(idx >= 0 ? idx : 0);
            }
        } else {
            await handleGlobalPlayPause();
        }
    };

    const handleNext = async () => {
        if (switchingRef.current) {
            uiLog('WARN', 'handleNext: уже идёт переключение — пропуск');
            return;
        }

        // 1. Play from custom Up Next queue if available
        if (queue.length > 0) {
            const nextTrack = queue[0];
            setQueue(prev => prev.slice(1));
            const nextOriginalIndex = libraryTracks.findIndex(t => t.filePath === nextTrack.filePath);
            uiLog('INFO', `handleNext: playing from queue -> ${nextTrack.filePath}`);
            if (nextOriginalIndex >= 0) {
                await handlePlayLibraryTrack(nextOriginalIndex, isMyWave);
            } else {
                await handleLoadDeck(activeSlot, nextTrack.filePath);
                await Play(activeSlot);
                setPlaying(prev => {
                    const updated = [...prev] as [boolean, boolean];
                    updated[activeSlot] = true;
                    return updated;
                });
            }
            return;
        }

        if (currentPlaylistTracks.length === 0) return;
        const currentTrack = libraryTracks[currentTrackIndex];
        let playlistIndex = currentPlaylistTracks.findIndex(t => t.filePath === currentTrack?.filePath);
        let nextPlaylistIndex = (playlistIndex + 1) % currentPlaylistTracks.length;
        let nextTrack = currentPlaylistTracks[nextPlaylistIndex];
        if (isMyWave) {
            const randIdx = Math.floor(Math.random() * libraryTracks.length);
            nextTrack = libraryTracks[randIdx];
        } else if (shuffle) {
            nextPlaylistIndex = Math.floor(Math.random() * currentPlaylistTracks.length);
            nextTrack = currentPlaylistTracks[nextPlaylistIndex];
        }
        const nextOriginalIndex = libraryTracks.findIndex(t => t.filePath === nextTrack.filePath);
        uiLog('INFO', `handleNext: ${currentTrackIndex} -> ${nextOriginalIndex}`);
        await handlePlayLibraryTrack(nextOriginalIndex, isMyWave);
    };

    const handlePrev = async () => {
        if (currentPlaylistTracks.length === 0) return;
        if (switchingRef.current) {
            uiLog('WARN', 'handlePrev: уже идёт переключение — пропуск');
            return;
        }
        const currentTrack = libraryTracks[currentTrackIndex];
        let playlistIndex = currentPlaylistTracks.findIndex(t => t.filePath === currentTrack?.filePath);
        let prevPlaylistIndex = (playlistIndex - 1 + currentPlaylistTracks.length) % currentPlaylistTracks.length;
        let prevTrack = currentPlaylistTracks[prevPlaylistIndex];
        if (isMyWave) {
            const randIdx = Math.floor(Math.random() * libraryTracks.length);
            prevTrack = libraryTracks[randIdx];
        } else if (shuffle) {
            prevPlaylistIndex = Math.floor(Math.random() * currentPlaylistTracks.length);
            prevTrack = currentPlaylistTracks[prevPlaylistIndex];
        }
        const prevOriginalIndex = libraryTracks.findIndex(t => t.filePath === prevTrack.filePath);
        uiLog('INFO', `handlePrev: ${currentTrackIndex} -> ${prevOriginalIndex}`);
        await handlePlayLibraryTrack(prevOriginalIndex, isMyWave);
    };

    const handleVolume = async (slot: number, val: number) => {
        const updated = [...volumes] as [number, number];
        updated[slot] = val;
        setVolumes(updated);
        uiLog('INFO', `handleVolume slot=${slot} vol=${val.toFixed(2)}`);
        await SetVolume(slot, val);
        try {
            localStorage.setItem('synapse_volume', JSON.stringify(updated));
        } catch {}
    };

    const handleSeek = async (slot: number, pct: number) => {
        const track = tracks[slot];
        if (!track) return;
        const newPos = pct * track.durationSec;
        uiLog('INFO', `handleSeek slot=${slot} pct=${pct.toFixed(3)} -> ${newPos.toFixed(2)}s`);
        ignorePositionUntilRef.current = Date.now() + 600;

        setPositions(prev => {
            const updated = [...prev] as [number, number];
            updated[slot] = newPos;
            return updated;
        });

        try {
            await Seek(slot, newPos);
        } catch (err) {
            uiLog('ERROR', `Seek failed: ${String(err)}`);
        }
    };

    const handleToggleAutoMix = async () => {
        const val = !autoMix;
        setAutoMix(val);
        uiLog('INFO', `handleToggleAutoMix -> ${val ? 'ON' : 'OFF'}`);
        await ToggleAutoMix(val);
    };

    const handleToggleMyWave = async () => {
        const val = !isMyWave;
        setIsMyWave(val);
        uiLog('INFO', `handleToggleMyWave -> ${val ? 'ON' : 'OFF'}`);
        if (val) {
            setAutoMix(true);
            await ToggleAutoMix(true);
            const randIdx = Math.floor(Math.random() * libraryTracks.length);
            setCurrentTrackIndex(randIdx);
            const track = libraryTracks[randIdx];
            if (track) {
                await handleLoadDeck(activeSlot, track.filePath);
                await Play(activeSlot);
                setPlaying(prev => {
                    const updated = [...prev] as [boolean, boolean];
                    updated[activeSlot] = true;
                    return updated;
                });
            }
        }
    };

    const handleCrossfadeChange = async (val: number) => {
        setCrossfadeDurationState(val);
        uiLog('INFO', `handleCrossfadeChange: ${val}s`);
        await SetCrossfadeDuration(val);
    };

    // Stored stable refs to avoid stale closures in background loops
    const handleNextRef = useRef(handleNext);
    const handleLoadDeckRef = useRef(handleLoadDeck);
    const handleSeekRef = useRef(handleSeek);
    useEffect(() => {
        handleNextRef.current = handleNext;
        handleLoadDeckRef.current = handleLoadDeck;
        handleSeekRef.current = handleSeek;
    });

    // Window global release for drag seek
    useEffect(() => {
        if (dragPosition === null) return;

        const handleGlobalRelease = () => {
            const currentPos = dragPositionRef.current;
            if (currentPos !== null) {
                handleSeekRef.current(activeSlot, currentPos);
                dragPositionRef.current = null;
                setDragPosition(null);
            }
        };

        window.addEventListener('mouseup', handleGlobalRelease);
        window.addEventListener('touchend', handleGlobalRelease);
        return () => {
            window.removeEventListener('mouseup', handleGlobalRelease);
            window.removeEventListener('touchend', handleGlobalRelease);
        };
    }, [dragPosition === null, activeSlot]);

    // Initial audio volume setup
    useEffect(() => {
        SetVolume(0, volumes[0]).catch(() => {});
        SetVolume(1, volumes[1]).catch(() => {});
    }, []);

    // Listen to background track analysis
    useEffect(() => {
        const cancel = EventsOn("track_analyzed", (slot: number, meta: TrackInfo) => {
            setTracks(prev => {
                const updated = [...prev] as [TrackInfo | null, TrackInfo | null];
                if (updated[slot] && updated[slot]?.filePath === meta.filePath) {
                    updated[slot] = {
                        ...updated[slot]!,
                        bpm: Math.round(meta.bpm),
                        keySignature: meta.keySignature,
                        waveform: meta.waveform || []
                    };
                }
                return updated;
            });
        });
        return cancel;
    }, []);

    // Dynamic background polling loop: throttles to 1000ms when hidden / minimized
    useEffect(() => {
        let timerId: ReturnType<typeof setTimeout> | null = null;
        let isCancelled = false;

        const poll = async () => {
            if (isCancelled) return;
            const st = stateRef.current;
            const isHidden = typeof document !== 'undefined' && document.hidden;
            const pollInterval = isHidden ? 1000 : 100;

            const updatedPlaying = [...st.playing] as [boolean, boolean];
            const updatedPos = [...st.positions] as [number, number];
            const promises: Promise<void>[] = [];

            if (st.tracks[0]) {
                const needsPoll = st.playing[0] || (st.autoMix && st.playing[1]);
                if (needsPoll) {
                    promises.push((async () => {
                        const isPlay = await IsPlaying(0);
                        updatedPlaying[0] = isPlay;
                        if (isPlay) {
                            const pos = await GetPosition(0);
                            const isDragging = dragPositionRef.current !== null;
                            const isIgnored = Date.now() < ignorePositionUntilRef.current;
                            if (!isDragging && !isIgnored) {
                                updatedPos[0] = pos;
                            }
                        }
                    })());
                }
            }

            if (st.tracks[1]) {
                const needsPoll = st.playing[1] || (st.autoMix && st.playing[0]);
                if (needsPoll) {
                    promises.push((async () => {
                        const isPlay = await IsPlaying(1);
                        updatedPlaying[1] = isPlay;
                        if (isPlay) {
                            const pos = await GetPosition(1);
                            const isDragging = dragPositionRef.current !== null;
                            const isIgnored = Date.now() < ignorePositionUntilRef.current;
                            if (!isDragging && !isIgnored) {
                                updatedPos[1] = pos;
                            }
                        }
                    })());
                }
            }

            if (promises.length > 0) {
                await Promise.all(promises);

                // When minimized, avoid setting positions state every 100ms to eliminate UI re-render churn
                const playingChanged = updatedPlaying[0] !== st.playing[0] || updatedPlaying[1] !== st.playing[1];
                if (!isHidden || playingChanged) {
                    setPlaying(updatedPlaying);
                    setPositions(updatedPos);
                }

                const activeWasPlaying = st.playing[st.activeSlot];
                const activeIsPlaying = updatedPlaying[st.activeSlot];
                const activePos = updatedPos[st.activeSlot];
                const activeTrack = st.tracks[st.activeSlot];
                const otherSlot = st.activeSlot === 0 ? 1 : 0;
                const otherIsPlaying = updatedPlaying[otherSlot];

                const reachedEnd = activeTrack && activeTrack.durationSec > 0 && (
                    (activeIsPlaying && activePos >= activeTrack.durationSec - 0.5) ||
                    (activeWasPlaying && !activeIsPlaying && activePos >= activeTrack.durationSec - 2.0)
                );

                if (reachedEnd) {
                    if (!st.autoMix) {
                        uiLog('INFO', `interval: трек закончен pos=${activePos.toFixed(2)} dur=${activeTrack.durationSec.toFixed(2)} -> next`);
                        if (st.repeat) {
                            handleSeekRef.current(st.activeSlot, 0);
                        } else {
                            handleNextRef.current();
                        }
                    } else {
                        if (!activeIsPlaying && !otherIsPlaying) {
                            uiLog('WARN', `interval: automix failed/skipped, both decks stopped. Transitioning to next track.`);
                            handleNextRef.current();
                        }
                    }
                }

                if (st.autoMix && (st.queue.length > 0 || st.currentPlaylistTracks.length > 0 || (st.isMyWave && st.libraryTracks.length > 0))) {
                    let nextTrack: TrackInfo | undefined;
                    if (st.queue.length > 0) {
                        nextTrack = st.queue[0];
                    } else if (st.isMyWave && st.libraryTracks.length > 0) {
                        const randIndex = Math.floor(Math.random() * st.libraryTracks.length);
                        nextTrack = st.libraryTracks[randIndex];
                    } else {
                        const currentTrack = st.tracks[st.activeSlot];
                        let playlistIndex = st.currentPlaylistTracks.findIndex(t => t.filePath === currentTrack?.filePath);
                        let nextPlaylistIndex = (playlistIndex + 1) % st.currentPlaylistTracks.length;
                        if (st.repeat) {
                            nextPlaylistIndex = playlistIndex >= 0 ? playlistIndex : 0;
                        } else if (st.shuffle) {
                            nextPlaylistIndex = Math.floor(Math.random() * st.currentPlaylistTracks.length);
                        }
                        nextTrack = st.currentPlaylistTracks[nextPlaylistIndex];
                    }

                    if (nextTrack) {
                        const nextOriginalIndex = st.libraryTracks.findIndex(t => t.filePath === nextTrack?.filePath);

                        if (updatedPlaying[st.activeSlot] && activeTrack && !updatedPlaying[otherSlot]) {
                            const otherTrack = st.tracks[otherSlot];
                            if (!otherTrack || otherTrack.filePath !== nextTrack.filePath) {
                                await handleLoadDeckRef.current(otherSlot, nextTrack.filePath);
                            }
                        }

                        if (updatedPlaying[otherSlot] && !st.playing[otherSlot]) {
                            if (st.queue.length > 0 && st.queue[0].filePath === nextTrack.filePath) {
                                setQueue(prev => prev.slice(1));
                            }
                            setActiveSlot(otherSlot as 0 | 1);
                            setCurrentTrackIndex(nextOriginalIndex);
                        }
                    }
                }
            }

            if (!isCancelled) {
                timerId = setTimeout(poll, pollInterval);
            }
        };

        timerId = setTimeout(poll, 100);

        return () => {
            isCancelled = true;
            if (timerId) clearTimeout(timerId);
        };
    }, []);

    const onTrackDeleted = (filePath: string) => {
        setTracks(prev => {
            const updated = [...prev] as [TrackInfo | null, TrackInfo | null];
            if (updated[0]?.filePath === filePath) updated[0] = null;
            if (updated[1]?.filePath === filePath) updated[1] = null;
            return updated;
        });
    };

    return {
        tracks,
        setTracks,
        playing,
        setPlaying,
        positions,
        volumes,
        activeSlot,
        setActiveSlot,
        currentTrackIndex,
        setCurrentTrackIndex,
        autoMix,
        crossfadeDuration,
        shuffle,
        setShuffle,
        repeat,
        setRepeat,
        isMyWave,
        setIsMyWave,
        dragPosition,
        setDragPosition,
        dragPositionRef,
        handlePlayPause,
        handleGlobalPlayPause,
        handleHeroPlayClick,
        handleNext,
        handlePrev,
        handleVolume,
        handleSeek,
        handleLoadDeck,
        handleSelectAndLoad,
        handlePlayLibraryTrack,
        handleToggleAutoMix,
        handleToggleMyWave,
        handleCrossfadeChange,
        onTrackDeleted,
        queue,
        addToQueue,
        removeFromQueue,
        clearQueue,
        currentCover
    };
}
