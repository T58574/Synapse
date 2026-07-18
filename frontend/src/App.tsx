import { useState, useEffect, useRef } from 'react';
import './App.css';
import { EventsOn } from "../wailsjs/runtime/runtime";
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
    SetAudioDevice,
    SetEQ
} from "../wailsjs/go/backend/App";

import { TrackInfo, PlaylistInfo } from './types';
import { AppHeader } from './components/AppHeader';
import { LibrarySidebar } from './components/LibrarySidebar';
import { LibraryHero } from './components/LibraryHero';
import { LibraryTable } from './components/LibraryTable';
import { SettingsView } from './components/SettingsView';
import { PlaybackBar } from './components/PlaybackBar';
import { VisualizerContainer } from './features/visualizer/VisualizerContainer';
import { MusiciansView } from './components/MusiciansView';
import { splitArtists } from './utils';
import { Language, useTranslation } from './localization';

function App() {
    const [language, setLanguage] = useState<Language>(() => {
        try {
            return (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('soundplayer_lang') as Language) || 'en';
        } catch {
            return 'en';
        }
    });
    const { t } = useTranslation(language);

    useEffect(() => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem('soundplayer_lang', language);
            }
        } catch {
            // Ignore
        }
    }, [language]);

    const [activeTab, setActiveTab] = useState<'library' | 'settings' | 'musicians'>('library');
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
    const [autoMix, setAutoMix] = useState<boolean>(false);
    const [shuffle, setShuffle] = useState<boolean>(false);
    const [repeat, setRepeat] = useState<boolean>(false);
    const [isMyWave, setIsMyWave] = useState<boolean>(false);
    const [showEqualizer, setShowEqualizer] = useState<boolean>(false);
    const [eqValues, setEQValues] = useState<[number, number, number]>(() => {
        try {
            const val = localStorage.getItem('soundplayer_eq');
            if (val) {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed) && parsed.length === 3) {
                    return [Number(parsed[0]), Number(parsed[1]), Number(parsed[2])];
                }
            }
        } catch {}
        return [0.0, 0.0, 0.0];
    });

    const setEQValue = async (bandIndex: number, val: number) => {
        const newEq = [...eqValues] as [number, number, number];
        newEq[bandIndex] = val;
        setEQValues(newEq);
        uiLog('INFO', `EQ change band=${bandIndex} val=${val.toFixed(1)}`);
        try {
            await SetEQ(0, newEq[0], newEq[1], newEq[2]);
            await SetEQ(1, newEq[0], newEq[1], newEq[2]);
        } catch (err) {
            uiLog('ERROR', `Failed to SetEQ: ${String(err)}`);
        }
        try {
            localStorage.setItem('soundplayer_eq', JSON.stringify(newEq));
        } catch {}
    };

    const handleToggleMyWave = async () => {
        if (libraryTracks.length === 0) {
            uiLog('WARN', 'handleToggleMyWave: библиотека пуста');
            return;
        }
        const val = !isMyWave;
        setIsMyWave(val);
        uiLog('INFO', `handleToggleMyWave -> ${val ? 'ON' : 'OFF'}`);
        if (val) {
            setAutoMix(true);
            await ToggleAutoMix(true);
            const randIdx = Math.floor(Math.random() * libraryTracks.length);
            setCurrentTrackIndex(randIdx);
            const track = libraryTracks[randIdx];
            await handleLoadDeck(activeSlot, track.filePath);
            await Play(activeSlot);
            const updated = [...playing] as [boolean, boolean];
            updated[activeSlot] = true;
            setPlaying(updated);
        }
    };
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
    const ignorePositionUntilRef = useRef<number>(0);

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
        dragPosition: null as number | null
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
            try { await SetEQ(slot, eqValues[0], eqValues[1], eqValues[2]); } catch { /* ok */ }
            const cachedTrack = libraryTracks.find(t => t.filePath === path);
            const updated = [...tracks] as [TrackInfo | null, TrackInfo | null];
            updated[slot] = {
                filePath: path,
                durationSec: cachedTrack ? cachedTrack.durationSec : meta.durationSec,
                bpm: cachedTrack ? cachedTrack.bpm : meta.bpm,
                keySignature: cachedTrack ? cachedTrack.keySignature : meta.keySignature,
                waveform: (cachedTrack && cachedTrack.waveform && cachedTrack.waveform.length > 0)
                    ? cachedTrack.waveform
                    : (meta.waveform || [])
            };
            setTracks(updated);

            const updatedPlaying = [...playing] as [boolean, boolean];
            updatedPlaying[slot] = false;
            setPlaying(updatedPlaying);

            const updatedPos = [...positions] as [number, number];
            updatedPos[slot] = 0;
            setPositions(updatedPos);



            uiLog('INFO', `handleLoadDeck: OK slot=${slot} dur=${updated[slot]?.durationSec.toFixed(2)}s bpm=${updated[slot]?.bpm.toFixed(1)} key=${updated[slot]?.keySignature}`);
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

    handleNextRef.current = handleNext;
    handleLoadDeckRef.current = handleLoadDeck;

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text).then(() => {
            if (label === 'title') {
                setToastMessage(t('copiedTitle', { text }));
            } else {
                setToastMessage(t('copiedArtist', { text }));
            }
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
            const defaultDevName = language === 'ru' ? 'Устройство по умолчанию' : 'Default Device';
            const name = audioDevices.find(d => d.id === deviceId)?.name || defaultDevName;
            setToastMessage(t('audioRouted', { name }));
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

    const handleSeek = async (slot: number, pct: number) => {
        const track = tracks[slot];
        if (!track) return;
        const newPos = pct * track.durationSec;
        uiLog('INFO', `handleSeek slot=${slot} pct=${pct.toFixed(3)} -> ${newPos.toFixed(2)}s`);
        
        ignorePositionUntilRef.current = Date.now() + 600;

        const updated = [...positions] as [number, number];
        updated[slot] = newPos;
        setPositions(updated);

        try {
            await Seek(slot, newPos);
        } catch (err) {
            uiLog('ERROR', `Seek failed: ${String(err)}`);
        }
    };

    handleSeekRef.current = handleSeek;

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
        SetEQ(0, eqValues[0], eqValues[1], eqValues[2]).catch(() => {});
        SetEQ(1, eqValues[0], eqValues[1], eqValues[2]).catch(() => {});
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
        stateRef.current = { tracks, playing, positions, activeSlot, currentTrackIndex, autoMix, libraryTracks, shuffle, repeat, currentPlaylistTracks, isMyWave, dragPosition };
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
        const cancel = EventsOn("track_analyzed", (slot: number, meta: any) => {
            setTracks(prev => {
                const updated = [...prev] as [TrackInfo | null, TrackInfo | null];
                if (updated[slot] && updated[slot]?.filePath === meta.filePath) {
                    updated[slot] = {
                        ...updated[slot]!,
                        bpm: meta.bpm,
                        keySignature: meta.keySignature,
                        waveform: meta.waveform || []
                    };
                }
                return updated;
            });
        });
        return cancel;
    }, []);

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
                            const isDragging = st.dragPosition !== null;
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
                            const isDragging = st.dragPosition !== null;
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
                setPlaying(updatedPlaying);
                setPositions(updatedPos);

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

                if (st.autoMix && (st.currentPlaylistTracks.length > 0 || (st.isMyWave && st.libraryTracks.length > 0))) {
                    const otherSlot = st.activeSlot === 0 ? 1 : 0;
                    const currentTrack = st.tracks[st.activeSlot];
                    let nextTrack: TrackInfo;
                    if (st.isMyWave && st.libraryTracks.length > 0) {
                        const randIndex = Math.floor(Math.random() * st.libraryTracks.length);
                        nextTrack = st.libraryTracks[randIndex];
                    } else {
                        let playlistIndex = st.currentPlaylistTracks.findIndex(t => t.filePath === currentTrack?.filePath);
                        let nextPlaylistIndex = (playlistIndex + 1) % st.currentPlaylistTracks.length;
                        if (st.repeat) {
                            nextPlaylistIndex = playlistIndex >= 0 ? playlistIndex : 0;
                        } else if (st.shuffle) {
                            nextPlaylistIndex = Math.floor(Math.random() * st.currentPlaylistTracks.length);
                        }
                        nextTrack = st.currentPlaylistTracks[nextPlaylistIndex];
                    }
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
                showEqualizer={showEqualizer}
                setShowEqualizer={setShowEqualizer}
                eqValues={eqValues}
                setEQValue={setEQValue}
                language={language}
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
                                language={language}
                            />
                            <div className="library-main-content">
                                <LibraryHero
                                    selectedPlaylist={selectedPlaylist}
                                    selectedArtist={selectedArtist}
                                    currentPlaylistTracks={currentPlaylistTracks}
                                    totalDurationStr={totalDurationStr}
                                    musicDir={musicDir}
                                    language={language}
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
                                    isMyWave={isMyWave}
                                    onToggleMyWave={handleToggleMyWave}
                                    language={language}
                                />
                            </div>
                        </div>
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
                            language={language}
                            setLanguage={setLanguage}
                            handleOpenDir={OpenMusicDir}
                        />
                    )}
                    {activeTab === 'musicians' && (
                        <MusiciansView
                            libraryTracks={libraryTracks}
                            setActiveTab={setActiveTab}
                            setSelectedArtist={setSelectedArtist}
                            setSelectedPlaylist={setSelectedPlaylist}
                            handlePlayLibraryTrack={handlePlayLibraryTrack}
                            language={language}
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
                language={language}
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
