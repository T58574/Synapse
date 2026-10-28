import { useState, useEffect, useRef } from 'react';
import './App.css';
import { LogFromJS } from "../wailsjs/go/backend/App";
import { AppHeader } from './components/AppHeader';
import { LibrarySidebar } from './components/LibrarySidebar';
import { LibraryHero } from './components/LibraryHero';
import { LibraryTable } from './components/LibraryTable';
import { SettingsView } from './components/SettingsView';
import { PlaybackBar } from './components/PlaybackBar';
import { VisualizerContainer } from './features/visualizer/VisualizerContainer';
import { MusiciansView } from './components/MusiciansView';
import { Language, useTranslation } from './localization';
import { AudioEffectsModal } from './components/AudioEffectsModal';

// Modular Custom Hooks
import { useWindowVisibility } from './hooks/useWindowVisibility';
import { useThemeEngine } from './hooks/useThemeEngine';
import { useEqualizer } from './hooks/useEqualizer';
import { usePlaylists } from './hooks/usePlaylists';
import { useLibrary } from './hooks/useLibrary';
import { useAudioPlayback } from './hooks/useAudioPlayback';
import { useAudioDevices } from './hooks/useAudioDevices';
import { getFilename, formatTime } from './utils';

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
        } catch {}
    }, [language]);

    const [activeTab, setActiveTab] = useState<'library' | 'settings' | 'musicians'>('library');

    const [visualizerEnabled, setVisualizerEnabled] = useState<boolean>(() => {
        try {
            const val = localStorage.getItem('soundplayer_visualizer_enabled');
            return val !== null ? val === 'true' : true;
        } catch {
            return true;
        }
    });

    const handleSetVisualizerEnabled = (enabled: boolean) => {
        setVisualizerEnabled(enabled);
        try {
            localStorage.setItem('soundplayer_visualizer_enabled', String(enabled));
        } catch {}
    };

    const uiLog = (level: 'INFO' | 'WARN' | 'ERROR', msg: string) => {
        const timeStr = new Date().toISOString().split('T')[1]?.replace('Z', '') ?? '';
        const prefix = `%c[${timeStr}] [${level}] [ui]`;
        const color = level === 'ERROR' ? 'color:#ef4444' : level === 'WARN' ? 'color:#f59e0b' : 'color:#22c55e';
        // eslint-disable-next-line no-console
        console.log(prefix, color, msg);
        LogFromJS(level, msg).catch(() => {});
    };

    // 1. Theme engine
    const { themes, currentTheme, setCurrentTheme } = useThemeEngine();

    // 2. Window visibility coordinator (halts Go FFT & IPC spectrum when minimized / hidden)
    useWindowVisibility(visualizerEnabled);

    // 3. Equalizer & DSP rack
    const {
        showEqualizer,
        setShowEqualizer,
        eqValues,
        eq10Values,
        setEQ10Value,
        setEQ10Whole,
        dspParams,
        setDSPParam,
        customPresets,
        handleSavePreset,
        handleDeletePreset
    } = useEqualizer(uiLog);

    // 4. Playlists management
    const {
        playlists,
        selectedPlaylist,
        setSelectedPlaylist,
        isCreatingPlaylist,
        setIsCreatingPlaylist,
        newPlaylistName,
        setNewPlaylistName,
        activePlaylistMenuTrack,
        setActivePlaylistMenuTrack,
        loadPlaylists,
        handleCreatePlaylistSubmit,
        handleDeletePlaylist,
        handleAddTrackToPlaylist,
        handleRemoveTrackFromPlaylist
    } = usePlaylists(uiLog);

    // Track deletion callback to clear decks
    const onTrackDeletedRef = useRef<(path: string) => void>(() => {});

    // 5. Library management
    const {
        musicDir,
        libraryTracks,
        searchQuery,
        setSearchQuery,
        selectedArtist,
        setSelectedArtist,
        selectedGenre,
        setSelectedGenre,
        currentPlaylistTracks,
        availableArtists,
        availableGenres,
        filteredTracks,
        totalDurationStr,
        loadLibrary,
        handleOpenMusicDir,
        toastMessage,
        showToast,
        trackToEdit,
        setTrackToEdit,
        editForm,
        setEditForm,
        handleEditTrackClick,
        handleEditSubmit,
        trackToDelete,
        setTrackToDelete,
        handleDeleteTrackClick,
        handleDeleteConfirm
    } = useLibrary(language, selectedPlaylist, playlists, uiLog, (path) => onTrackDeletedRef.current(path));

    // 6. Audio Devices management
    const { audioDevices, selectedDevice, handleDeviceChange } = useAudioDevices(language, uiLog, showToast);

    // 7. Audio playback & Decks orchestration
    const {
        tracks,
        playing,
        positions,
        volumes,
        activeSlot,
        currentTrackIndex,
        autoMix,
        crossfadeDuration,
        shuffle,
        setShuffle,
        repeat,
        setRepeat,
        isMyWave,
        dragPosition,
        setDragPosition,
        dragPositionRef,
        handlePlayPause,
        handleGlobalPlayPause,
        handleHeroPlayClick,
        handleNext,
        handlePrev,
        handleVolume,
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
    } = useAudioPlayback({
        libraryTracks,
        currentPlaylistTracks,
        eqValues,
        eq10Values,
        dspParams,
        uiLog,
        showToast,
        language
    });

    onTrackDeletedRef.current = onTrackDeleted;

    // Initial library & playlists load
    useEffect(() => {
        loadLibrary();
        loadPlaylists();
    }, []);

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text).then(() => {
            if (label === 'title') {
                showToast(t('copiedTitle', { text }));
            } else {
                showToast(t('copiedArtist', { text }));
            }
        }).catch(err => {
            uiLog('ERROR', `Failed to copy: ${String(err)}`);
        });
    };

    return (
        <div className="container">
            <VisualizerContainer
                activeSlot={activeSlot}
                tracks={tracks}
                playing={playing}
                currentTheme={currentTheme}
                enabled={visualizerEnabled}
            />
            <AppHeader
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                handleSelectDirectory={handleOpenMusicDir}
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
                                    handleHeroPlayClick={() => handleHeroPlayClick(filteredTracks)}
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
                                    OpenMusicDir={handleOpenMusicDir}
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
                                    onAddToQueue={addToQueue}
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
                            handleOpenDir={handleOpenMusicDir}
                            visualizerEnabled={visualizerEnabled}
                            setVisualizerEnabled={handleSetVisualizerEnabled}
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
                copyToClipboard={copyToClipboard}
                language={language}
                currentCover={currentCover}
                queue={queue}
                removeFromQueue={removeFromQueue}
                clearQueue={clearQueue}
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
