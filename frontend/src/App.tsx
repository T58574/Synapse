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
    SetEQ,
    SetEQ10,
    SetDSP,
    UpdateTrackMetadata,
    DeleteTrack
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
import { AudioEffectsModal } from './components/AudioEffectsModal';

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

    const [trackToEdit, setTrackToEdit] = useState<TrackInfo | null>(null);
    const [editForm, setEditForm] = useState({ title: '', artist: '', genre: '', bpm: 120, keySignature: '8A' });
    const [trackToDelete, setTrackToDelete] = useState<TrackInfo | null>(null);

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

    const [eq10Values, setEQ10Values] = useState<[number, number, number, number, number, number, number, number, number, number]>(() => {
        try {
            const val = localStorage.getItem('soundplayer_eq10');
            if (val) {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed) && parsed.length === 10) {
                    return parsed as any;
                }
            }
        } catch {}
        return [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    });

    const [dspParams, setDSPParams] = useState({
        limiterBoost: 0.0,
        stereoWidth: 1.0,
        reverbMix: 0.0,
        bassBoost: 0.0,
        trebleExciter: 0.0
    });

    useEffect(() => {
        try {
            const val = localStorage.getItem('soundplayer_dsp');
            if (val) {
                const parsed = JSON.parse(val);
                if (parsed && typeof parsed === 'object') {
                    setDSPParams({
                        limiterBoost: Number(parsed.limiterBoost ?? 0.0),
                        stereoWidth: Number(parsed.stereoWidth ?? 1.0),
                        reverbMix: Number(parsed.reverbMix ?? 0.0),
                        bassBoost: Number(parsed.bassBoost ?? 0.0),
                        trebleExciter: Number(parsed.trebleExciter ?? 0.0)
                    });
                }
            }
        } catch {}
    }, []);

    const [customPresets, setCustomPresets] = useState<Record<string, number[]>>(() => {
        try {
            const val = localStorage.getItem('soundplayer_custom_presets');
            if (val) {
                return JSON.parse(val);
            }
        } catch {}
        return {};
    });

    const setEQ10Value = async (bandIndex: number, val: number) => {
        const newEq = [...eq10Values] as [number, number, number, number, number, number, number, number, number, number];
        newEq[bandIndex] = val;
        setEQ10Values(newEq);
        uiLog('INFO', `EQ10 change band=${bandIndex} val=${val.toFixed(1)}`);
        try {
            await SetEQ10(0, newEq);
            await SetEQ10(1, newEq);
        } catch (err) {
            uiLog('ERROR', `Failed to SetEQ10: ${String(err)}`);
        }
        try {
            localStorage.setItem('soundplayer_eq10', JSON.stringify(newEq));
        } catch {}
    };

    const setEQ10Whole = async (bands: number[]) => {
        if (bands.length !== 10) return;
        const newEq = [...bands] as [number, number, number, number, number, number, number, number, number, number];
        setEQ10Values(newEq);
        uiLog('INFO', `EQ10 preset apply`);
        try {
            await SetEQ10(0, newEq);
            await SetEQ10(1, newEq);
        } catch (err) {
            uiLog('ERROR', `Failed to SetEQ10 whole: ${String(err)}`);
        }
        try {
            localStorage.setItem('soundplayer_eq10', JSON.stringify(newEq));
        } catch {}
    };

    const setDSPParam = async (param: string, val: number) => {
        setDSPParams(prev => {
            const updated = { ...prev, [param]: val };
            uiLog('INFO', `DSP change param=${param} val=${val.toFixed(2)}`);
            SetDSP(0, updated.limiterBoost, updated.stereoWidth, updated.reverbMix, updated.bassBoost, updated.trebleExciter).catch(err => {
                uiLog('ERROR', `Failed to SetDSP deck0: ${String(err)}`);
            });
            SetDSP(1, updated.limiterBoost, updated.stereoWidth, updated.reverbMix, updated.bassBoost, updated.trebleExciter).catch(err => {
                uiLog('ERROR', `Failed to SetDSP deck1: ${String(err)}`);
            });
            try {
                localStorage.setItem('soundplayer_dsp', JSON.stringify(updated));
            } catch {}
            return updated;
        });
    };

    const handleSavePreset = (name: string, bands: number[]) => {
        const updated = { ...customPresets, [name]: bands };
        setCustomPresets(updated);
        try {
            localStorage.setItem('soundplayer_custom_presets', JSON.stringify(updated));
        } catch {}
        uiLog('INFO', `Saved custom preset: ${name}`);
    };

    const handleDeletePreset = (name: string) => {
        const updated = { ...customPresets };
        delete updated[name];
        setCustomPresets(updated);
        try {
            localStorage.setItem('soundplayer_custom_presets', JSON.stringify(updated));
        } catch {}
        uiLog('INFO', `Deleted custom preset: ${name}`);
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

    const handleEditTrackClick = (track: TrackInfo) => {
        setTrackToEdit(track);
        setEditForm({
            title: track.title || getFilename(track.filePath),
            artist: track.artist || '',
            genre: track.genre || '',
            bpm: Math.round(track.bpm),
            keySignature: track.keySignature || '8A'
        });
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!trackToEdit) return;
        try {
            await UpdateTrackMetadata(
                trackToEdit.filePath,
                editForm.title,
                editForm.artist,
                editForm.genre,
                Number(editForm.bpm),
                editForm.keySignature
            );
            uiLog('INFO', `Successfully updated metadata for ${trackToEdit.filePath}`);
            setToastMessage(language === 'ru' ? 'Метаданные обновлены' : 'Metadata updated successfully');
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 2500);
            setTrackToEdit(null);
            await loadLibrary();
        } catch (err) {
            uiLog('ERROR', `Failed to update metadata: ${String(err)}`);
        }
    };

    const handleDeleteTrackClick = (track: TrackInfo) => {
        setTrackToDelete(track);
    };

    const handleDeleteConfirm = async () => {
        if (!trackToDelete) return;
        try {
            await DeleteTrack(trackToDelete.filePath);
            uiLog('INFO', `Successfully deleted track ${trackToDelete.filePath}`);
            setToastMessage(language === 'ru' ? 'Трек удален с диска' : 'Track deleted from disk');
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 2500);
            
            setTracks(prev => {
                const updated = [...prev] as [TrackInfo | null, TrackInfo | null];
                if (updated[0]?.filePath === trackToDelete.filePath) updated[0] = null;
                if (updated[1]?.filePath === trackToDelete.filePath) updated[1] = null;
                return updated;
            });

            setTrackToDelete(null);
            await loadLibrary();
        } catch (err) {
            uiLog('ERROR', `Failed to delete track: ${String(err)}`);
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
            try { await SetEQ10(slot, eq10Values); } catch { /* ok */ }
            try { await SetDSP(slot, dspParams.limiterBoost, dspParams.stereoWidth, dspParams.reverbMix, dspParams.bassBoost, dspParams.trebleExciter); } catch { /* ok */ }
            const cachedTrack = libraryTracks.find(t => t.filePath === path);
            setTracks(prev => {
                const updated = [...prev] as [TrackInfo | null, TrackInfo | null];
                updated[slot] = {
                    filePath: path,
                    durationSec: cachedTrack ? cachedTrack.durationSec : meta.durationSec,
                    bpm: cachedTrack ? cachedTrack.bpm : meta.bpm,
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

            uiLog('INFO', `handleLoadDeck: OK slot=${slot} dur=${(cachedTrack ? cachedTrack.durationSec : meta.durationSec).toFixed(2)}s bpm=${(cachedTrack ? cachedTrack.bpm : meta.bpm).toFixed(1)} key=${cachedTrack ? cachedTrack.keySignature : meta.keySignature}`);
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
        SetEQ10(0, eq10Values).catch(() => {});
        SetEQ10(1, eq10Values).catch(() => {});
        SetDSP(0, dspParams.limiterBoost, dspParams.stereoWidth, dspParams.reverbMix, dspParams.bassBoost, dspParams.trebleExciter).catch(() => {});
        SetDSP(1, dspParams.limiterBoost, dspParams.stereoWidth, dspParams.reverbMix, dspParams.bassBoost, dspParams.trebleExciter).catch(() => {});
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
        const cancel = EventsOn("library_changed", (list: any) => {
            setLibraryTracks(list || []);
            uiLog('INFO', `library_changed: background scan finished, loaded ${list?.length ?? 0} tracks`);
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
                                    onEditTrack={handleEditTrackClick}
                                    onDeleteTrack={handleDeleteTrackClick}
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

            <AudioEffectsModal
                isOpen={showEqualizer}
                onClose={() => setShowEqualizer(false)}
                eq10Values={eq10Values}
                setEQ10Value={setEQ10Value}
                setEQ10Whole={setEQ10Whole}
                dspParams={dspParams}
                setDSPParam={setDSPParam}
                language={language}
                activeSlot={activeSlot}
                customPresets={customPresets}
                onSavePreset={handleSavePreset}
                onDeletePreset={handleDeletePreset}
            />

            {trackToEdit && (
                <div className="modal-overlay" onClick={() => setTrackToEdit(null)}>
                    <div className="modal-content edit-track-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{language === 'ru' ? 'Редактировать метаданные' : 'Edit Metadata'}</h2>
                            <button className="close-btn" onClick={() => setTrackToEdit(null)}>✕</button>
                        </div>
                        <form onSubmit={handleEditSubmit} className="edit-track-form">
                            <div className="form-group">
                                <label>{language === 'ru' ? 'Название трека' : 'Track Title'}</label>
                                <input 
                                    type="text" 
                                    className="modal-text-input"
                                    value={editForm.title} 
                                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} 
                                    required 
                                    placeholder="Enter title"
                                />
                            </div>
                            <div className="form-group">
                                <label>{language === 'ru' ? 'Исполнитель' : 'Artist'}</label>
                                <input 
                                    type="text" 
                                    className="modal-text-input"
                                    value={editForm.artist} 
                                    onChange={(e) => setEditForm({ ...editForm, artist: e.target.value })} 
                                    placeholder="Enter artist"
                                />
                            </div>
                            <div className="form-group">
                                <label>{language === 'ru' ? 'Жанр / Стиль' : 'Genre / Style'}</label>
                                <input 
                                    type="text" 
                                    className="modal-text-input"
                                    value={editForm.genre} 
                                    onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })} 
                                    placeholder="Enter genre"
                                />
                            </div>
                            <div className="form-row" style={{ display: 'flex', gap: '16px' }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>BPM</label>
                                    <input 
                                        type="number" 
                                        className="modal-text-input"
                                        value={editForm.bpm} 
                                        onChange={(e) => setEditForm({ ...editForm, bpm: Number(e.target.value) })} 
                                        min="20"
                                        max="300"
                                        required
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>{language === 'ru' ? 'Тональность' : 'Key'}</label>
                                    <input 
                                        type="text" 
                                        className="modal-text-input"
                                        value={editForm.keySignature} 
                                        onChange={(e) => setEditForm({ ...editForm, keySignature: e.target.value.toUpperCase() })} 
                                        placeholder="e.g. 8A, 8B"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                                <button type="button" className="btn-secondary" onClick={() => setTrackToEdit(null)}>
                                    {language === 'ru' ? 'Отмена' : 'Cancel'}
                                </button>
                                <button type="submit" className="btn-primary">
                                    {language === 'ru' ? 'Сохранить' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {trackToDelete && (
                <div className="modal-overlay" onClick={() => setTrackToDelete(null)}>
                    <div className="modal-content delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 style={{ color: '#F43F5E' }}>{language === 'ru' ? 'Удалить трек?' : 'Delete Track?'}</h2>
                            <button className="close-btn" onClick={() => setTrackToDelete(null)}>✕</button>
                        </div>
                        <div className="modal-body" style={{ margin: '16px 0', fontSize: '13px', color: 'var(--muted-text-color)', lineHeight: '1.5', textAlign: 'left' }}>
                            <p>
                                {language === 'ru' 
                                    ? `Вы действительно хотите навсегда удалить этот файл с диска? Это действие нельзя отменить.`
                                    : `Are you sure you want to permanently delete this file from your disk? This action cannot be undone.`}
                            </p>
                            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', color: 'var(--text-color)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                <strong>{trackToDelete.title || getFilename(trackToDelete.filePath)}</strong>
                                <div style={{ fontSize: '11px', color: 'var(--muted-text-color)', marginTop: '4px' }}>{trackToDelete.filePath}</div>
                            </div>
                        </div>
                        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                            <button className="btn-secondary" onClick={() => setTrackToDelete(null)}>
                                {language === 'ru' ? 'Отмена' : 'Cancel'}
                            </button>
                            <button 
                                className="btn-primary" 
                                style={{ background: 'linear-gradient(135deg, #F43F5E 0%, #BE123C 100%)', boxShadow: '0 4px 15px rgba(244, 63, 94, 0.2)' }}
                                onClick={handleDeleteConfirm}
                            >
                                {language === 'ru' ? 'Удалить' : 'Delete Permanently'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
