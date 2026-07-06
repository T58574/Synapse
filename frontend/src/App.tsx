import { useState, useEffect, useRef } from 'react';
import './App.css';
import { EventsOn } from "../wailsjs/runtime/runtime";
import {
    LoadTrack,
    Play,
    Pause,
    Seek,
    SetVolume,
    SetTempo,
    SetPitch,
    GetPosition,
    IsPlaying,
    ToggleAutoMix,
    SelectAudioFile,
    GetMusicDir,
    ScanMusicDir,
    OpenMusicDir,
    SetCrossfadeDuration,
    LogFromJS,
    GetPlaylists,
    CreatePlaylist,
    DeletePlaylist,
    AddTrackToPlaylist,
    RemoveTrackFromPlaylist,
    GetAudioDevices,
    SetAudioDevice
} from "../wailsjs/go/backend/App";

import { TrackInfo, PlaylistInfo } from './types';
import { AppHeader } from './components/AppHeader';
import { LibrarySidebar } from './components/LibrarySidebar';
import { LibraryHero } from './components/LibraryHero';
import { LibraryTable } from './components/LibraryTable';
import { DeckView } from './components/DeckView';
import { SettingsView } from './components/SettingsView';
import { PlaybackBar } from './components/PlaybackBar';
import { VisualizerContainer } from './features/visualizer/VisualizerContainer';
import { MusiciansView } from './components/MusiciansView';
import { splitArtists } from './utils';

function App() {
    const [activeTab, setActiveTab] = useState<'library' | 'decks' | 'settings' | 'search' | 'musicians'>('library');
    const [crossfadeDuration, setCrossfadeDurationState] = useState<number>(8.0);
    const [musicDir, setMusicDir] = useState<string>('');
    const [libraryTracks, setLibraryTracks] = useState<TrackInfo[]>([]);
    const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
    const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [dragPosition, setDragPosition] = useState<number | null>(null);
    const dragPositionRef = useRef<number | null>(null);
    const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
    const [isCreatingPlaylist, setIsCreatingPlaylist] = useState<boolean>(false);
    const [newPlaylistName, setNewPlaylistName] = useState<string>('');
    const [activePlaylistMenuTrack, setActivePlaylistMenuTrack] = useState<string | null>(null);
    const [currentTheme, setCurrentTheme] = useState<string>(() => {
        try {
            return (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('soundplayer_theme')) || 'saas';
        } catch {
            return 'saas';
        }
    });
    const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
    const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimeoutRef = useRef<any>(null);
    const [audioDevices, setAudioDevices] = useState<{name: string, id: string, isDefault: boolean}[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<string>(() => {
        try {
            return localStorage.getItem('soundplayer_device') || 'default';
        } catch {
            return 'default';
        }
    });

    const themes = {
        saas: {
            accent: '#00FFC2',
            dark: '#00B388',
            hover: '#33FFCE',
            bg: '#0B0D10',
            surface: '#151A21',
            text: '#E9EEF5',
            mutedText: '#8A99AD',
            border: '#273140',
            accentText: '#0B0D10'
        },
        neutrals: {
            accent: '#635BFF',
            dark: '#4E45E0',
            hover: '#827BFF',
            bg: '#F0EEE9',
            surface: '#FFFFFF',
            text: '#141414',
            mutedText: '#626875',
            border: '#D2CEC4',
            accentText: '#FFFFFF'
        },
        fintech: {
            accent: '#00E5E5',
            dark: '#00B2B2',
            hover: '#33EBEB',
            bg: '#07070A',
            surface: '#11101E',
            text: '#F3F0FF',
            mutedText: '#8884A4',
            border: '#2C2B47',
            accentText: '#07070A'
        },
        trust: {
            accent: '#1A73E8',
            dark: '#1152A3',
            hover: '#3B8AF3',
            bg: '#F8FAFC',
            surface: '#FFFFFF',
            text: '#1E293B',
            mutedText: '#64748B',
            border: '#E2E8F0',
            accentText: '#FFFFFF'
        },
        eco: {
            accent: '#316263',
            dark: '#224445',
            hover: '#417F80',
            bg: '#E7D8C6',
            surface: '#FAF6F0',
            text: '#101417',
            mutedText: '#6A5F50',
            border: '#D6C8B7',
            accentText: '#FFFFFF'
        }
    };

    useEffect(() => {
        const theme = themes[currentTheme as keyof typeof themes] || themes.saas;
        const root = document.documentElement;
        root.style.setProperty('--accent-color', theme.accent);
        root.style.setProperty('--accent-color-dark', theme.dark);
        root.style.setProperty('--accent-color-hover', theme.hover);
        root.style.setProperty('--accent-text-color', theme.accentText);
        root.style.setProperty('--bg-color', theme.bg);
        root.style.setProperty('--surface-color', theme.surface);
        root.style.setProperty('--text-color', theme.text);
        root.style.setProperty('--muted-text-color', theme.mutedText);
        root.style.setProperty('--border-color', theme.border);
        root.style.setProperty('--accent-bg-glow', theme.accent + '1c');
        root.style.setProperty('--accent-row-active', theme.accent + '0f');
        root.style.setProperty('--hover-color', theme.text + '0f');
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem('soundplayer_theme', currentTheme);
            }
        } catch {
            // Ignore
        }
    }, [currentTheme]);

    const [tracks, setTracks] = useState<[TrackInfo | null, TrackInfo | null]>([null, null]);
    const [playing, setPlaying] = useState<[boolean, boolean]>([false, false]);
    const [positions, setPositions] = useState<[number, number]>([0, 0]);
    const [volumes, setVolumes] = useState<[number, number]>(() => {
        try {
            const val = localStorage.getItem('soundplayer_volume');
            if (val) {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed) && parsed.length === 2) {
                    return [Number(parsed[0]), Number(parsed[1])];
                }
            }
        } catch {
        }
        return [0.8, 0.8];
    });
    const [tempos, setTempos] = useState<[number, number]>([1.0, 1.0]);
    const [pitches, setPitches] = useState<[number, number]>([0.0, 0.0]);
    const [autoMix, setAutoMix] = useState<boolean>(false);
    const [shuffle, setShuffle] = useState<boolean>(false);
    const [repeat, setRepeat] = useState<boolean>(false);

    const canvasRef0 = useRef<HTMLCanvasElement | null>(null);
    const canvasRef1 = useRef<HTMLCanvasElement | null>(null);
    const spectrumRef0 = useRef<HTMLCanvasElement | null>(null);
    const spectrumRef1 = useRef<HTMLCanvasElement | null>(null);

    const smoothedSpectrum0 = useRef<number[]>(new Array(64).fill(0));
    const smoothedSpectrum1 = useRef<number[]>(new Array(64).fill(0));
    const peakSpectrum0 = useRef<number[]>(new Array(64).fill(0));
    const peakSpectrum1 = useRef<number[]>(new Array(64).fill(0));
    const currentThemeRef = useRef<string>(currentTheme);

    useEffect(() => {
        currentThemeRef.current = currentTheme;
    }, [currentTheme]);

    const uiLog = (level: 'INFO' | 'WARN' | 'ERROR', msg: string) => {
        const t = new Date().toISOString().split('T')[1]?.replace('Z', '') ?? '';
        const prefix = `%c[${t}] [${level}] [ui]`;
        const color = level === 'ERROR' ? 'color:#ef4444' : level === 'WARN' ? 'color:#f59e0b' : 'color:#22c55e';
        // eslint-disable-next-line no-console
        console.log(prefix, color, msg);
        LogFromJS(level, msg).catch(() => {});
    };

    const switchingRef = useRef(false);
    const loadingPathRef = useRef<[string | null, string | null]>([null, null]);
    const handleNextRef = useRef<() => void>(() => {});
    const handleLoadDeckRef = useRef<(slot: number, path: string) => Promise<void>>(async () => {});
    const handleSeekRef = useRef<(slot: number, pct: number) => Promise<void>>(async () => {});

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
        currentPlaylistTracks: [] as TrackInfo[]
    });

    const getFilename = (path: string) => {
        if (!path) return '';
        const parts = path.split(/[/\\]/);
        return parts[parts.length - 1];
    };

    const currentPlaylistTracks = selectedPlaylist
        ? libraryTracks.filter(t => playlists.find(p => p.name === selectedPlaylist)?.trackPaths?.includes(t.filePath))
        : libraryTracks;

    const availableArtists = Array.from(
        new Set(libraryTracks.flatMap(t => splitArtists(t.artist || 'Unknown Artist')))
    ).filter(Boolean).sort();
    const availableGenres = Array.from(new Set(libraryTracks.map(t => t.genre || 'Unknown Genre'))).filter(Boolean).sort();

    const filteredTracks = currentPlaylistTracks.filter(track => {
        const filename = getFilename(track.filePath).toLowerCase();
        const artist = (track.artist || 'Unknown Artist').toLowerCase();
        const genre = (track.genre || 'Unknown Genre').toLowerCase();
        const query = searchQuery.toLowerCase();
        
        const matchesQuery = filename.includes(query) || artist.includes(query) || genre.includes(query);
        const matchesArtist = !selectedArtist || splitArtists(track.artist || 'Unknown Artist').includes(selectedArtist);
        const matchesGenre = !selectedGenre || (track.genre || 'Unknown Genre') === selectedGenre;
        
        return matchesQuery && matchesArtist && matchesGenre;
    });

    const totalDuration = currentPlaylistTracks.reduce((acc, t) => acc + t.durationSec, 0);
    const totalDurationStr = (() => {
        const h = Math.floor(totalDuration / 3600);
        const m = Math.floor((totalDuration % 3600) / 60);
        const s = Math.floor(totalDuration % 60);
        if (h > 0) {
            return `${h} hr ${m} min`;
        }
        return `${m} min ${s} sec`;
    })();

    const loadLibrary = async () => {
        try {
            uiLog('INFO', 'loadLibrary: старт сканирования');
            const dir = await GetMusicDir();
            setMusicDir(dir);
            const list = await ScanMusicDir();
            setLibraryTracks(list || []);
            uiLog('INFO', `loadLibrary: найдено ${list?.length ?? 0} треков`);
        } catch (err) {
            uiLog('ERROR', `loadLibrary: ошибка: ${String(err)}`);
        }
    };

    const loadPlaylists = async () => {
        try {
            const list = await GetPlaylists();
            setPlaylists(list || []);
        } catch (err) {
            uiLog('ERROR', `loadPlaylists error: ${String(err)}`);
        }
    };

    const handleCreatePlaylistSubmit = async () => {
        if (!newPlaylistName.trim()) {
            setIsCreatingPlaylist(false);
            return;
        }
        try {
            await CreatePlaylist(newPlaylistName.trim());
            uiLog('INFO', `Created playlist: ${newPlaylistName}`);
            setNewPlaylistName('');
            setIsCreatingPlaylist(false);
            await loadPlaylists();
        } catch (err) {
            uiLog('ERROR', `CreatePlaylist error: ${String(err)}`);
        }
    };

    const handleDeletePlaylist = async (name: string) => {
        try {
            await DeletePlaylist(name);
            uiLog('INFO', `Deleted playlist: ${name}`);
            if (selectedPlaylist === name) {
                setSelectedPlaylist(null);
            }
            await loadPlaylists();
        } catch (err) {
            uiLog('ERROR', `DeletePlaylist error: ${String(err)}`);
        }
    };

    const handleAddTrackToPlaylist = async (playlistName: string, trackPath: string) => {
        try {
            await AddTrackToPlaylist(playlistName, trackPath);
            uiLog('INFO', `Added track ${trackPath} to playlist ${playlistName}`);
            await loadPlaylists();
            setActivePlaylistMenuTrack(null);
        } catch (err) {
            uiLog('ERROR', `AddTrackToPlaylist error: ${String(err)}`);
        }
    };

    const handleRemoveTrackFromPlaylist = async (playlistName: string, trackPath: string) => {
        try {
            await RemoveTrackFromPlaylist(playlistName, trackPath);
            uiLog('INFO', `Removed track ${trackPath} to playlist ${playlistName}`);
            await loadPlaylists();
        } catch (err) {
            uiLog('ERROR', `RemoveTrackFromPlaylist error: ${String(err)}`);
        }
    };

    const handleLoadDeck = async (slot: number, path: string) => {
        if (loadingPathRef.current[slot as 0 | 1] === path) {
            uiLog('WARN', `handleLoadDeck: уже грузится slot=${slot} path=${path} — пропуск`);
            return;
        }
        loadingPathRef.current[slot as 0 | 1] = path;
        uiLog('INFO', `handleLoadDeck: начало slot=${slot} path=${path}`);
        try {
            try { await Pause(slot); } catch { /* ok */ }

            const meta = await LoadTrack(slot, path);
            const updated = [...tracks] as [TrackInfo | null, TrackInfo | null];
            updated[slot] = {
                filePath: path,
                durationSec: meta.durationSec,
                bpm: meta.bpm,
                keySignature: meta.keySignature,
                waveform: meta.waveform || []
            };
            setTracks(updated);

            const updatedPlaying = [...playing] as [boolean, boolean];
            updatedPlaying[slot] = false;
            setPlaying(updatedPlaying);

            const updatedPos = [...positions] as [number, number];
            updatedPos[slot] = 0;
            setPositions(updatedPos);

            const updatedTempos = [...tempos] as [number, number];
            updatedTempos[slot] = 1.0;
            setTempos(updatedTempos);

            const updatedPitches = [...pitches] as [number, number];
            updatedPitches[slot] = 0.0;
            setPitches(updatedPitches);

            uiLog('INFO', `handleLoadDeck: OK slot=${slot} dur=${meta.durationSec.toFixed(2)}s bpm=${meta.bpm.toFixed(1)} key=${meta.keySignature}`);
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

    const handlePlayLibraryTrack = async (index: number) => {
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
            setCurrentTrackIndex(index);
            const track = libraryTracks[index];
            await handleLoadDeck(activeSlot, track.filePath);
            await Play(activeSlot);
            const updated = [...playing] as [boolean, boolean];
            updated[activeSlot] = true;
            setPlaying(updated);
            uiLog('INFO', `handlePlayLibraryTrack: запущен index=${index}`);
        } finally {
            switchingRef.current = false;
        }
    };

    const handlePlayPause = async (slot: number) => {
        if (!tracks[slot]) return;
        setActiveSlot(slot as 0 | 1);
        if (playing[slot]) {
            uiLog('INFO', `handlePlayPause: pause slot=${slot}`);
            await Pause(slot);
            const updated = [...playing] as [boolean, boolean];
            updated[slot] = false;
            setPlaying(updated);
        } else {
            uiLog('INFO', `handlePlayPause: play slot=${slot}`);
            await Play(slot);
            const updated = [...playing] as [boolean, boolean];
            updated[slot] = true;
            setPlaying(updated);
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
            const updated = [...playing] as [boolean, boolean];
            updated[slot] = false;
            setPlaying(updated);
        } else {
            uiLog('INFO', `handleGlobalPlayPause: play slot=${slot}`);
            await Play(slot);
            const updated = [...playing] as [boolean, boolean];
            updated[slot] = true;
            setPlaying(updated);
        }
    };

    const handleHeroPlayClick = async () => {
        const activeTrack = tracks[activeSlot];
        if (!activeTrack) {
            const playlist = searchQuery ? filteredTracks : libraryTracks;
            if (playlist.length > 0) {
                await handlePlayLibraryTrack(0);
            }
        } else {
            await handleGlobalPlayPause();
        }
    };

    const handleNext = async () => {
        if (currentPlaylistTracks.length === 0) return;
        if (switchingRef.current) {
            uiLog('WARN', 'handleNext: уже идёт переключение — пропуск');
            return;
        }
        const currentTrack = libraryTracks[currentTrackIndex];
        let playlistIndex = currentPlaylistTracks.findIndex(t => t.filePath === currentTrack?.filePath);
        let nextPlaylistIndex = (playlistIndex + 1) % currentPlaylistTracks.length;
        if (shuffle) {
            nextPlaylistIndex = Math.floor(Math.random() * currentPlaylistTracks.length);
        }
        const nextTrack = currentPlaylistTracks[nextPlaylistIndex];
        const nextOriginalIndex = libraryTracks.findIndex(t => t.filePath === nextTrack.filePath);
        uiLog('INFO', `handleNext: ${currentTrackIndex} -> ${nextOriginalIndex}`);
        await handlePlayLibraryTrack(nextOriginalIndex);
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
        if (shuffle) {
            prevPlaylistIndex = Math.floor(Math.random() * currentPlaylistTracks.length);
        }
        const prevTrack = currentPlaylistTracks[prevPlaylistIndex];
        const prevOriginalIndex = libraryTracks.findIndex(t => t.filePath === prevTrack.filePath);
        uiLog('INFO', `handlePrev: ${currentTrackIndex} -> ${prevOriginalIndex}`);
        await handlePlayLibraryTrack(prevOriginalIndex);
    };

    handleNextRef.current = handleNext;
    handleLoadDeckRef.current = handleLoadDeck;

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setToastMessage(`Copied ${label}: "${text}"`);
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
            }
            toastTimeoutRef.current = setTimeout(() => {
                setToastMessage(null);
            }, 2500);
        }).catch(err => {
            uiLog('ERROR', `Failed to copy: ${String(err)}`);
        });
    };

    const handleDeviceChange = async (deviceId: string) => {
        uiLog('INFO', `handleDeviceChange: ${deviceId}`);
        const ok = await SetAudioDevice(deviceId);
        if (ok) {
            setSelectedDevice(deviceId);
            try {
                localStorage.setItem('soundplayer_device', deviceId);
            } catch {
            }
            const name = audioDevices.find(d => d.id === deviceId)?.name || 'Default Device';
            setToastMessage(`Audio output routed to: ${name}`);
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
            }
            toastTimeoutRef.current = setTimeout(() => {
                setToastMessage(null);
            }, 3000);
        } else {
            uiLog('ERROR', `Failed to route audio output to ${deviceId}`);
        }
    };

    const handleVolume = async (slot: number, val: number) => {
        const updated = [...volumes] as [number, number];
        updated[slot] = val;
        setVolumes(updated);
        uiLog('INFO', `handleVolume slot=${slot} vol=${val.toFixed(2)}`);
        await SetVolume(slot, val);
        try {
            localStorage.setItem('soundplayer_volume', JSON.stringify(updated));
        } catch {
        }
    };

    const handleTempo = async (slot: number, val: number) => {
        const updated = [...tempos] as [number, number];
        updated[slot] = val;
        setTempos(updated);
        uiLog('INFO', `handleTempo slot=${slot} tempo=${val.toFixed(2)}`);
        await SetTempo(slot, val);
    };

    const handlePitch = async (slot: number, val: number) => {
        const updated = [...pitches] as [number, number];
        updated[slot] = val;
        setPitches(updated);
        uiLog('INFO', `handlePitch slot=${slot} pitch=${val}`);
        await SetPitch(slot, val);
    };

    const handleSeek = async (slot: number, pct: number) => {
        const track = tracks[slot];
        if (!track) return;
        const newPos = pct * track.durationSec;
        uiLog('INFO', `handleSeek slot=${slot} pct=${pct.toFixed(3)} -> ${newPos.toFixed(2)}s`);
        await Seek(slot, newPos);
        const updated = [...positions] as [number, number];
        updated[slot] = newPos;
        setPositions(updated);
    };

    handleSeekRef.current = handleSeek;

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>, slot: number) => {
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const pct = clickX / rect.width;
        handleSeek(slot, pct);
    };

    const handleToggleAutoMix = async () => {
        const val = !autoMix;
        setAutoMix(val);
        uiLog('INFO', `handleToggleAutoMix -> ${val ? 'ON' : 'OFF'}`);
        await ToggleAutoMix(val);
    };

    useEffect(() => {
        loadLibrary();
        loadPlaylists();
        SetVolume(0, volumes[0]).catch(() => {});
        SetVolume(1, volumes[1]).catch(() => {});
        GetAudioDevices().then((list) => {
            setAudioDevices(list || []);
        }).catch((err) => {
            uiLog('ERROR', `Failed to load audio devices: ${String(err)}`);
        });
        if (selectedDevice && selectedDevice !== 'default') {
            SetAudioDevice(selectedDevice).catch((err) => {
                uiLog('ERROR', `Failed to set audio device ${selectedDevice}: ${String(err)}`);
            });
        }
    }, []);

    useEffect(() => {
        stateRef.current = { tracks, playing, positions, activeSlot, currentTrackIndex, autoMix, libraryTracks, shuffle, repeat, currentPlaylistTracks };
    });

    useEffect(() => {
        dragPositionRef.current = dragPosition;
    }, [dragPosition]);

    useEffect(() => {
        if (dragPosition === null) return;

        const handleGlobalRelease = () => {
            const currentPos = dragPositionRef.current;
            if (currentPos !== null) {
                handleSeek(activeSlot, currentPos);
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

    useEffect(() => {
        const interval = setInterval(async () => {
            const st = stateRef.current;
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
                            updatedPos[0] = pos;
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
                            updatedPos[1] = pos;
                        }
                    })());
                }
            }

            if (promises.length > 0) {
                await Promise.all(promises);
                setPlaying(updatedPlaying);
                setPositions(updatedPos);

                const activeIsPlaying = updatedPlaying[st.activeSlot];
                const activePos = updatedPos[st.activeSlot];
                const activeTrack = st.tracks[st.activeSlot];
                if (activeTrack && activeIsPlaying && activeTrack.durationSec > 0 && activePos >= activeTrack.durationSec - 0.5) {
                    if (!st.autoMix) {
                        uiLog('INFO', `interval: трек закончен pos=${activePos.toFixed(2)} dur=${activeTrack.durationSec.toFixed(2)} -> next`);
                        if (st.repeat) {
                            handleSeekRef.current(st.activeSlot, 0);
                        } else {
                            handleNextRef.current();
                        }
                    }
                }

                if (st.autoMix && st.currentPlaylistTracks.length > 0) {
                    const otherSlot = st.activeSlot === 0 ? 1 : 0;
                    const currentTrack = st.tracks[st.activeSlot];
                    let playlistIndex = st.currentPlaylistTracks.findIndex(t => t.filePath === currentTrack?.filePath);
                    let nextPlaylistIndex = (playlistIndex + 1) % st.currentPlaylistTracks.length;
                    if (st.repeat) {
                        nextPlaylistIndex = playlistIndex >= 0 ? playlistIndex : 0;
                    } else if (st.shuffle) {
                        nextPlaylistIndex = Math.floor(Math.random() * st.currentPlaylistTracks.length);
                    }
                    const nextTrack = st.currentPlaylistTracks[nextPlaylistIndex];
                    const nextOriginalIndex = st.libraryTracks.findIndex(t => t.filePath === nextTrack.filePath);
                    
                    if (updatedPlaying[st.activeSlot] && activeTrack && !updatedPlaying[otherSlot]) {
                        const otherTrack = st.tracks[otherSlot];
                        if (!otherTrack || otherTrack.filePath !== nextTrack.filePath) {
                            await handleLoadDeckRef.current(otherSlot, nextTrack.filePath);
                        }
                    }

                    if (updatedPlaying[otherSlot] && !st.playing[otherSlot]) {
                        setActiveSlot(otherSlot as 0 | 1);
                        setCurrentTrackIndex(nextOriginalIndex);
                    }
                }
            }
        }, 100);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const unsubscribe = EventsOn("spectrum", (data: { deck0: number[], deck1: number[] }) => {
            if (spectrumRef0.current && data.deck0) {
                drawSpectrum(spectrumRef0.current, data.deck0, 0);
            }
            if (spectrumRef1.current && data.deck1) {
                drawSpectrum(spectrumRef1.current, data.deck1, 1);
            }
        });
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, [currentTheme]);

    const drawSpectrum = (canvas: HTMLCanvasElement, spectrum: number[], slot: number) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const theme = themes[currentTheme as keyof typeof themes] || themes.saas;
        const barGradient = ctx.createLinearGradient(0, h, 0, 0);
        barGradient.addColorStop(0, theme.accent + '15');
        barGradient.addColorStop(0.4, theme.accent + 'b3');
        barGradient.addColorStop(1, theme.accent);

        const smoothed = slot === 0 ? smoothedSpectrum0.current : smoothedSpectrum1.current;
        const peaks = slot === 0 ? peakSpectrum0.current : peakSpectrum1.current;

        for (let i = 0; i < spectrum.length; i++) {
            const rawVal = spectrum[i] || 0;
            const normalized = Math.min(1.0, rawVal / 128.0);
            const target = Math.pow(normalized, 0.75);

            if (target > smoothed[i]) {
                smoothed[i] = target;
            } else {
                smoothed[i] = smoothed[i] * 0.82 + target * 0.18;
            }

            if (smoothed[i] > peaks[i]) {
                peaks[i] = smoothed[i];
            } else {
                peaks[i] = Math.max(0, peaks[i] * 0.97 - 0.003);
            }
        }

        const barWidth = Math.max(1, (w / spectrum.length) - 1.5);
        for (let i = 0; i < spectrum.length; i++) {
            const val = smoothed[i];
            const peakVal = peaks[i];
            const x = i * (w / spectrum.length);

            if (val > 0.01) {
                const barHeight = val * h * 0.9;
                const y = h - barHeight;
                ctx.fillStyle = barGradient;
                ctx.fillRect(x, y, barWidth, barHeight);
            }

            if (peakVal > 0.01) {
                const peakY = h - peakVal * h * 0.9;
                ctx.fillStyle = currentTheme === 'neutrals' || currentTheme === 'trust' || currentTheme === 'eco' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.65)';
                ctx.fillRect(x, peakY, barWidth, 1.5);
            }
        }
    };

    const draw = (canvas: HTMLCanvasElement, peaks: number[], pos: number, dur: number) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        if (peaks.length === 0) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();
            return;
        }

        const playPct = dur > 0 ? pos / dur : 0;
        const barWidth = w / peaks.length;
        const theme = themes[currentTheme as keyof typeof themes] || themes.saas;
        const accentColor = theme.accent;

        for (let i = 0; i < peaks.length; i++) {
            const pct = i / peaks.length;
            const val = peaks[i];
            const barHeight = val * h * 0.85;
            const x = i * barWidth;
            const y = (h - barHeight) / 2;

            if (pct < playPct) {
                ctx.fillStyle = accentColor;
            } else {
                ctx.fillStyle = theme.border;
            }
            ctx.fillRect(x, y, Math.max(1, barWidth - 1), Math.max(2, barHeight));
        }
    };

    useEffect(() => {
        if (canvasRef0.current) {
            const t = tracks[0];
            draw(canvasRef0.current, t ? t.waveform : [], positions[0], t ? t.durationSec : 0);
        }
    }, [tracks[0], positions[0], currentTheme]);

    useEffect(() => {
        if (canvasRef1.current) {
            const t = tracks[1];
            draw(canvasRef1.current, t ? t.waveform : [], positions[1], t ? t.durationSec : 0);
        }
    }, [tracks[1], positions[1], currentTheme]);

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const handleCrossfadeChange = async (val: number) => {
        setCrossfadeDurationState(val);
        await SetCrossfadeDuration(val);
    };

    return (
        <div className="container">
            <VisualizerContainer
                activeSlot={activeSlot}
                tracks={tracks}
                playing={playing}
                currentTheme={currentTheme}
            />
            <AppHeader
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                handleSelectDirectory={OpenMusicDir}
                handleScan={loadLibrary}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
            />

            <div className="app-main-layout">
                <main className="content-panel">
                    {activeTab === 'library' && (
                        <div className="library-body-layout">
                            <LibrarySidebar
                                playlists={playlists}
                                selectedPlaylist={selectedPlaylist}
                                setSelectedPlaylist={setSelectedPlaylist}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                isCreatingPlaylist={isCreatingPlaylist}
                                setIsCreatingPlaylist={setIsCreatingPlaylist}
                                newPlaylistName={newPlaylistName}
                                setNewPlaylistName={setNewPlaylistName}
                                handleCreatePlaylistSubmit={handleCreatePlaylistSubmit}
                                handleDeletePlaylist={handleDeletePlaylist}
                                selectedArtist={selectedArtist}
                                setSelectedArtist={setSelectedArtist}
                                availableArtists={availableArtists}
                                selectedGenre={selectedGenre}
                                setSelectedGenre={setSelectedGenre}
                                availableGenres={availableGenres}
                            />
                            <div className="library-main-content">
                                <LibraryHero
                                    selectedPlaylist={selectedPlaylist}
                                    selectedArtist={selectedArtist}
                                    currentPlaylistTracks={currentPlaylistTracks}
                                    totalDurationStr={totalDurationStr}
                                    musicDir={musicDir}
                                />
                                <LibraryTable
                                    playing={playing}
                                    activeSlot={activeSlot}
                                    tracks={tracks}
                                    handleHeroPlayClick={handleHeroPlayClick}
                                    filteredTracks={filteredTracks}
                                    libraryTracks={libraryTracks}
                                    currentTrackIndex={currentTrackIndex}
                                    handlePlayLibraryTrack={handlePlayLibraryTrack}
                                    activePlaylistMenuTrack={activePlaylistMenuTrack}
                                    setActivePlaylistMenuTrack={setActivePlaylistMenuTrack}
                                    playlists={playlists}
                                    selectedPlaylist={selectedPlaylist}
                                    handleRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
                                    handleAddTrackToPlaylist={handleAddTrackToPlaylist}
                                    getFilename={getFilename}
                                    formatTime={formatTime}
                                    OpenMusicDir={OpenMusicDir}
                                    handleSelectAndLoad={handleSelectAndLoad}
                                    onSelectArtist={(artistName) => {
                                        setSelectedArtist(artistName);
                                        setSelectedPlaylist(null);
                                        setActiveTab('library');
                                    }}
                                    copyToClipboard={copyToClipboard}
                                />
                            </div>
                        </div>
                    )}
                    {activeTab === 'decks' && (
                        <DeckView
                            tracks={tracks}
                            playing={playing}
                            handleSelectAndLoad={handleSelectAndLoad}
                            canvasRef0={canvasRef0}
                            canvasRef1={canvasRef1}
                            spectrumRef0={spectrumRef0}
                            spectrumRef1={spectrumRef1}
                            getFilename={getFilename}
                            volumes={volumes}
                            tempos={tempos}
                            pitches={pitches}
                            handleVolume={handleVolume}
                            handleTempo={handleTempo}
                            handlePitch={handlePitch}
                            handleCanvasClick={handleCanvasClick}
                            handlePlayPause={handlePlayPause}
                        />
                    )}
                    {activeTab === 'settings' && (
                        <SettingsView
                            themes={themes}
                            currentTheme={currentTheme}
                            setCurrentTheme={setCurrentTheme}
                            crossfadeDuration={crossfadeDuration}
                            handleCrossfadeChange={handleCrossfadeChange}
                            musicDir={musicDir}
                            audioDevices={audioDevices}
                            selectedDevice={selectedDevice}
                            handleDeviceChange={handleDeviceChange}
                        />
                    )}
                    {activeTab === 'musicians' && (
                        <MusiciansView
                            libraryTracks={libraryTracks}
                            setActiveTab={setActiveTab}
                            setSelectedArtist={setSelectedArtist}
                            setSelectedPlaylist={setSelectedPlaylist}
                            handlePlayLibraryTrack={handlePlayLibraryTrack}
                        />
                    )}
                </main>
            </div>

            <PlaybackBar
                tracks={tracks}
                activeSlot={activeSlot}
                playing={playing}
                shuffle={shuffle}
                setShuffle={setShuffle}
                repeat={repeat}
                setRepeat={setRepeat}
                handlePrev={handlePrev}
                handleNext={handleNext}
                handleGlobalPlayPause={handleGlobalPlayPause}
                dragPosition={dragPosition}
                setDragPosition={setDragPosition}
                dragPositionRef={dragPositionRef}
                positions={positions}
                volumes={volumes}
                handleVolume={handleVolume}
                autoMix={autoMix}
                handleToggleAutoMix={handleToggleAutoMix}
                formatTime={formatTime}
                getFilename={getFilename}
                copyToClipboard={copyToClipboard}
            />

            {toastMessage && (
                <div className="toast-notification">
                    <span className="toast-icon">✓</span>
                    <span className="toast-text">{toastMessage}</span>
                </div>
            )}
        </div>
    );
}

export default App;
