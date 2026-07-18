import React from 'react';
import { PlayIcon, PauseIcon, RowPlayIcon, RowPauseIcon, PlusIcon, MusicIcon, FolderIcon, LoadIcon } from './Icons';
import { TrackInfo, PlaylistInfo } from '../types';
import { splitArtists } from '../utils';
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
    getFilename: (path: string) => string;
    formatTime: (sec: number) => string;
    OpenMusicDir: () => void;
    handleSelectAndLoad: (slot: 0 | 1) => void;
    onSelectArtist?: (artistName: string) => void;
    copyToClipboard?: (text: string, label: string) => void;
    isMyWave: boolean;
    onToggleMyWave: () => void;
    language: Language;
}

export const LibraryTable: React.FC<LibraryTableProps> = ({
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
    getFilename,
    formatTime,
    OpenMusicDir,
    handleSelectAndLoad,
    onSelectArtist,
    copyToClipboard,
    isMyWave,
    onToggleMyWave,
    language
}) => {
    const { t } = useTranslation(language);
    const sortedTracks = filteredTracks;

    return (
        <div className="library-main-content">
            <div className="library-controls-bar">
                <button className="hero-play-button" onClick={handleHeroPlayClick}>
                    {playing[activeSlot] && tracks[activeSlot] ? <PauseIcon /> : <PlayIcon />}
                </button>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <button 
                        className={`my-wave-btn ${isMyWave ? 'active' : ''}`}
                        onClick={onToggleMyWave}
                        title={isMyWave ? t('myWaveOn') : t('myWave')}
                    >
                        <svg className="my-wave-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                            <line x1="4" y1="9" x2="4" y2="15" />
                            <line x1="8" y1="6" x2="8" y2="18" />
                            <line x1="12" y1="3" x2="12" y2="21" />
                            <line x1="16" y1="6" x2="16" y2="18" />
                            <line x1="20" y1="9" x2="20" y2="15" />
                        </svg>
                        <span>{isMyWave ? t('myWaveOn') : t('myWave')}</span>
                    </button>
                    <button className="sidebar-btn" onClick={OpenMusicDir}>
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
                                                    if (copyToClipboard) {
                                                        copyToClipboard(filename, 'title');
                                                    } else {
                                                        navigator.clipboard.writeText(filename);
                                                    }
                                                }}
                                                title={t('clickToCopyTitle')}
                                            >
                                                {filename}
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
                <div className="empty-library">
                    <div className="empty-card">
                        <MusicIcon />
                        <h3>{t('libraryEmptyTitle')}</h3>
                        <p>{t('libraryEmptyDesc')}</p>
                        <div className="empty-actions">
                            <button className="btn-primary" onClick={OpenMusicDir}>
                                <FolderIcon />
                                <span>{t('openDirectory')}</span>
                            </button>
                            <button className="btn-secondary" onClick={() => handleSelectAndLoad(activeSlot)}>
                                <LoadIcon />
                                <span>{t('selectFileDirectly')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
