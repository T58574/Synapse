import React from 'react';
import { PlayIcon, PauseIcon, RowPlayIcon, RowPauseIcon, PlusIcon, MusicIcon, FolderIcon, LoadIcon, QueueIcon, EditIcon, TrashIcon } from './Icons';
import { TrackInfo, PlaylistInfo } from '../types';
import { splitArtists, getFilename, formatTime } from '../utils';
import { Language, useTranslation } from '../localization';

interface LibraryTableProps {
    playing: [boolean, boolean];
    activeSlot: 0 | 1;
    tracks: [TrackInfo | null, TrackInfo | null];
    handleHeroPlayClick: () => void;
    filteredTracks: TrackInfo[];
    libraryTracks: TrackInfo[];
    currentTrackIndex: number;
    handlePlayLibraryTrack: (idx: number, keepMyWave?: boolean) => void;
    activePlaylistMenuTrack: string | null;
    setActivePlaylistMenuTrack: (trackPath: string | null) => void;
    playlists: PlaylistInfo[];
    selectedPlaylist: string | null;
    handleRemoveTrackFromPlaylist: (plName: string, trackPath: string) => void;
    handleAddTrackToPlaylist: (plName: string, trackPath: string) => void;
    OpenMusicDir: () => void;
    handleSelectAndLoad: (slot: 0 | 1) => void;
    onSelectArtist?: (artistName: string) => void;
    copyToClipboard?: (text: string, label: string) => void;
    isMyWave: boolean;
    onToggleMyWave: () => void;
    language: Language;
    onEditTrack?: (track: TrackInfo) => void;
    onDeleteTrack?: (track: TrackInfo) => void;
    onAddToQueue?: (track: TrackInfo) => void;
}

export const LibraryTable: React.FC<LibraryTableProps> = React.memo(({
    playing,
    activeSlot,
    tracks,
    handleHeroPlayClick,
    filteredTracks,
    libraryTracks,
    currentTrackIndex,
    handlePlayLibraryTrack,
    activePlaylistMenuTrack,
    setActivePlaylistMenuTrack,
    playlists,
    selectedPlaylist,
    handleRemoveTrackFromPlaylist,
    handleAddTrackToPlaylist,
    OpenMusicDir,
    handleSelectAndLoad,
    onSelectArtist,
    copyToClipboard,
    isMyWave,
    onToggleMyWave,
    language,
    onEditTrack,
    onDeleteTrack,
    onAddToQueue
}) => {
    const { t } = useTranslation(language);
    const sortedTracks = filteredTracks;

    return (
        <div className="library-main-content">
            <div className="library-controls-bar">
                <button className="hero-play-button cyber-play-btn" onClick={handleHeroPlayClick} title="INIT PLAYBACK">
                    <span className="cyber-play-bracket left">&lt;</span>
                    {playing[activeSlot] && tracks[activeSlot] ? <PauseIcon /> : <PlayIcon />}
                    <span className="cyber-play-bracket right">&gt;</span>
                </button>
                <div className="controls-right-actions">
                    <button 
                        className={`my-wave-btn cyber-wave-btn ${isMyWave ? 'active' : ''}`}
                        onClick={onToggleMyWave}
                        title={isMyWave ? t('myWaveOn') : t('myWave')}
                    >
                        <div className="wave-cyber-indicator">
                            <span className="wave-cyber-bar bar-1"></span>
                            <span className="wave-cyber-bar bar-2"></span>
                            <span className="wave-cyber-bar bar-3"></span>
                            <span className="wave-cyber-bar bar-4"></span>
                        </div>
                        <span className="wave-text-label">{isMyWave ? 'NEURAL WAVE // ACTIVE' : 'NEURAL WAVE'}</span>
                    </button>
                    <button className="sidebar-btn cyber-dir-btn" onClick={OpenMusicDir}>
                        <FolderIcon />
                        <span>{t('openMusicDir')}</span>
                    </button>
                </div>
            </div>

            {sortedTracks.length > 0 ? (
                <div className="tracks-list-container">
                    <table className="tracks-table">
                        <thead>
                            <tr>
                                <th style={{ width: '50px' }}>#</th>
                                <th>{t('titleCol')}</th>
                                <th style={{ width: '120px' }}>{t('bpmCol')}</th>
                                <th style={{ width: '120px' }}>{t('keyCol')}</th>
                                <th style={{ width: '100px' }}>{t('durationCol')}</th>
                                <th style={{ width: '80px', textAlign: 'center' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedTracks.map((track) => {
                                const filename = getFilename(track.filePath);
                                const isCurrent = tracks[activeSlot]?.filePath === track.filePath;
                                return (
                                    <tr 
                                        key={track.filePath} 
                                        className={`track-row ${isCurrent ? 'current' : ''}`}
                                        onClick={() => handlePlayLibraryTrack(libraryTracks.findIndex(t => t.filePath === track.filePath))}
                                    >
                                        <td>
                                            {isCurrent && playing[activeSlot] ? (
                                                <span className="row-play-btn glowing-green"><RowPauseIcon /></span>
                                            ) : (
                                                <span className="row-play-btn"><RowPlayIcon /></span>
                                            )}
                                        </td>
                                        <td className="track-title-cell">
                                            <div 
                                                className="track-title-main clickable-copy"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const displayTitle = track.title || filename;
                                                    if (copyToClipboard) {
                                                        copyToClipboard(displayTitle, 'title');
                                                    } else {
                                                        navigator.clipboard.writeText(displayTitle);
                                                    }
                                                }}
                                                title={t('clickToCopyTitle')}
                                            >
                                                {track.title || filename}
                                            </div>
                                            {(track.artist || track.genre) && (
                                                <div className="track-artist-sub">
                                                    {track.artist ? (
                                                        splitArtists(track.artist).map((art, idx, arr) => (
                                                            <React.Fragment key={art}>
                                                                <span 
                                                                    className="clickable-artist" 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (onSelectArtist) onSelectArtist(art);
                                                                    }}
                                                                >
                                                                    {art}
                                                                </span>
                                                                {idx < arr.length - 1 ? ', ' : ''}
                                                            </React.Fragment>
                                                        ))
                                                    ) : (
                                                        <span 
                                                            className="clickable-artist"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (onSelectArtist) onSelectArtist(t('unknownArtist'));
                                                            }}
                                                        >
                                                            {t('unknownArtist')}
                                                        </span>
                                                    )}
                                                    {track.genre && ` • ${track.genre}`}
                                                </div>
                                            )}
                                        </td>
                                        <td>{track.bpm.toFixed(1)}</td>
                                        <td className="glowing-key">{track.keySignature}</td>
                                        <td>{formatTime(track.durationSec)}</td>
                                        <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                                            <div className="action-buttons-group">
                                                <button 
                                                    className="track-action-btn edit-btn"
                                                    onClick={() => onEditTrack && onEditTrack(track)}
                                                    title={language === 'ru' ? 'Редактировать метаданные' : 'Edit metadata'}
                                                >
                                                    <EditIcon />
                                                </button>
                                                <button 
                                                    className="track-action-btn delete-btn"
                                                    onClick={() => onDeleteTrack && onDeleteTrack(track)}
                                                    title={language === 'ru' ? 'Удалить трек' : 'Delete track'}
                                                >
                                                    <TrashIcon />
                                                </button>
                                                <button 
                                                    className="track-action-btn queue-btn"
                                                    onClick={() => onAddToQueue && onAddToQueue(track)}
                                                    title={t('addToQueue')}
                                                >
                                                    <QueueIcon />
                                                </button>
                                                <button 
                                                    className="track-action-btn add-btn"
                                                    onClick={() => setActivePlaylistMenuTrack(activePlaylistMenuTrack === track.filePath ? null : track.filePath)}
                                                    title={t('addToPlaylist')}
                                                >
                                                    <PlusIcon />
                                                </button>
                                                {selectedPlaylist && (
                                                    <button 
                                                        className="track-action-btn remove-btn"
                                                        onClick={() => handleRemoveTrackFromPlaylist(selectedPlaylist, track.filePath)}
                                                        title={t('removeFromPlaylist')}
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                                {activePlaylistMenuTrack === track.filePath && (
                                                    <>
                                                        <div className="playlist-dropdown-backdrop" onClick={() => setActivePlaylistMenuTrack(null)} />
                                                        <div className="playlist-dropdown-menu">
                                                            <span className="dropdown-menu-title">{t('addToPlaylist')}</span>
                                                            {playlists.length === 0 ? (
                                                                <span className="dropdown-no-playlists">{t('noPlaylistsCreated')}</span>
                                                            ) : (
                                                                playlists.map((pl) => {
                                                                    const alreadyHas = pl.trackPaths?.includes(track.filePath);
                                                                    return (
                                                                        <button 
                                                                            key={pl.name}
                                                                            className={`dropdown-menu-item ${alreadyHas ? 'disabled' : ''}`}
                                                                            onClick={() => {
                                                                                if (!alreadyHas) {
                                                                                    handleAddTrackToPlaylist(pl.name, track.filePath);
                                                                                }
                                                                            }}
                                                                            disabled={alreadyHas}
                                                                        >
                                                                            <span>{pl.name}</span>
                                                                            {alreadyHas && <span className="already-has-check">✓</span>}
                                                                        </button>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="empty-library cyber-empty-terminal">
                    <div className="cyber-terminal-card">
                        <div className="terminal-header-bar">
                            <div className="terminal-title-group">
                                <span className="terminal-beacon red"></span>
                                <span className="terminal-title">SYS_STATUS // NO_MEDIA_FEED</span>
                            </div>
                            <span className="terminal-code">ERR::0x00_EMPTY</span>
                        </div>
                        <div className="terminal-body">
                            <div className="terminal-radar-icon">
                                <div className="radar-sweep"></div>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
                                    <circle cx="12" cy="12" r="10" />
                                    <circle cx="12" cy="12" r="6" />
                                    <circle cx="12" cy="12" r="2" />
                                    <line x1="12" y1="2" x2="12" y2="4" />
                                    <line x1="12" y1="20" x2="12" y2="22" />
                                    <line x1="2" y1="12" x2="4" y2="12" />
                                    <line x1="20" y1="12" x2="22" y2="12" />
                                </svg>
                            </div>
                            <h3 className="terminal-main-heading">{t('libraryEmptyTitle').toUpperCase()}</h3>
                            <div className="terminal-log-output cyber-tech-mono">
                                <p>&gt; SCAN_TARGET: %USERPROFILE%\.0xplayer</p>
                                <p>&gt; DETECTED_AUDIO_STREAMS: 0</p>
                                <p>&gt; PROMPT: {t('libraryEmptyDesc')}</p>
                            </div>
                            <div className="empty-actions">
                                <button className="btn-primary cyber-terminal-btn" onClick={OpenMusicDir}>
                                    <FolderIcon />
                                    <span>[ {t('openDirectory').toUpperCase()} ]</span>
                                </button>
                                <button className="btn-secondary cyber-terminal-btn" onClick={() => handleSelectAndLoad(activeSlot)}>
                                    <LoadIcon />
                                    <span>[ {t('selectFileDirectly').toUpperCase()} ]</span>
                                </button>
                            </div>
                        </div>
                        <div className="terminal-footer-line cyber-tech-mono">
                            <span>PORT::LOCAL_IO</span>
                            <span>SYS_BUS::OK</span>
                            <span>BUFFER::STANDBY</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});
