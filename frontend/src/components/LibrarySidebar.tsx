import React from 'react';
import { PlusIcon, MusicIconSmall, TrashIcon } from './Icons';
import { PlaylistInfo } from '../types';
import { Language, useTranslation } from '../localization';

interface LibrarySidebarProps {
    playlists: PlaylistInfo[];
    selectedPlaylist: string | null;
    setSelectedPlaylist: (pl: string | null) => void;
    activeTab: 'library' | 'settings' | 'musicians';
    setActiveTab: (tab: 'library' | 'settings' | 'musicians') => void;
    isCreatingPlaylist: boolean;
    setIsCreatingPlaylist: (creating: boolean) => void;
    newPlaylistName: string;
    setNewPlaylistName: (name: string) => void;
    handleCreatePlaylistSubmit: () => void;
    handleDeletePlaylist: (plName: string) => void;
    selectedArtist: string | null;
    setSelectedArtist: (artist: string | null) => void;
    availableArtists: string[];
    selectedGenre: string | null;
    setSelectedGenre: (genre: string | null) => void;
    availableGenres: string[];
    language: Language;
}

export const LibrarySidebar: React.FC<LibrarySidebarProps> = React.memo(({
    playlists,
    selectedPlaylist,
    setSelectedPlaylist,
    activeTab,
    setActiveTab,
    isCreatingPlaylist,
    setIsCreatingPlaylist,
    newPlaylistName,
    setNewPlaylistName,
    handleCreatePlaylistSubmit,
    handleDeletePlaylist,
    selectedArtist,
    setSelectedArtist,
    availableArtists,
    selectedGenre,
    setSelectedGenre,
    availableGenres,
    language
}) => {
    const { t } = useTranslation(language);

    return (
        <aside className="library-sidebar cyber-sidebar">
            <div className="sidebar-hud-header">
                <span className="sidebar-telemetry-tag">SYS_BUS // 0xNODE</span>
            </div>
            <button
                className={`sidebar-playlist-item-btn home-library-sidebar-btn ${(!selectedPlaylist && !selectedArtist && !selectedGenre) ? 'active' : ''}`}
                onClick={() => {
                    setSelectedPlaylist(null);
                    setSelectedArtist(null);
                    setSelectedGenre(null);
                    setActiveTab('library');
                }}
            >
                <span className="sidebar-node-index">01</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <span>{t('allTracks')}</span>
            </button>

            <div className="playlists-sidebar-section">
                <div className="playlists-sidebar-header">
                    <div className="sidebar-section-title-wrap">
                        <span className="sidebar-section-prefix">02 //</span>
                        <span className="theme-section-title">{t('playlists')}</span>
                    </div>
                    <button 
                        className="create-playlist-sidebar-btn" 
                        onClick={() => setIsCreatingPlaylist(!isCreatingPlaylist)}
                        title={t('addToPlaylist')}
                    >
                        <PlusIcon />
                    </button>
                </div>
                {isCreatingPlaylist && (
                    <div className="sidebar-playlist-input-container">
                        <input
                            type="text"
                            placeholder={t('newPlaylistPlaceholder')}
                            value={newPlaylistName}
                            onChange={(e) => setNewPlaylistName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreatePlaylistSubmit();
                                if (e.key === 'Escape') setIsCreatingPlaylist(false);
                            }}
                            className="sidebar-playlist-input"
                            autoFocus
                        />
                        <button className="sidebar-playlist-submit-btn" onClick={handleCreatePlaylistSubmit}>✓</button>
                    </div>
                )}
                <div className="sidebar-playlists-list">
                    {playlists.map((pl) => {
                        const isActive = selectedPlaylist === pl.name && activeTab === 'library';
                        return (
                            <div key={pl.name} className={`sidebar-playlist-row ${isActive ? 'active' : ''}`}>
                                <button 
                                    className="sidebar-playlist-item-btn"
                                    onClick={() => {
                                        setSelectedPlaylist(pl.name);
                                        setActiveTab('library');
                                    }}
                                >
                                    <MusicIconSmall />
                                    <span className="sidebar-playlist-name">{pl.name}</span>
                                </button>
                                <button 
                                    className="sidebar-delete-playlist-btn"
                                    onClick={() => handleDeletePlaylist(pl.name)}
                                    title="Delete Playlist"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="categories-sidebar-section">
                <div className="categories-sidebar-header">
                    <div className="sidebar-section-title-wrap">
                        <span className="sidebar-section-prefix">03 //</span>
                        <span className="theme-section-title">{t('artists')}</span>
                    </div>
                    {selectedArtist && (
                        <button className="clear-filter-btn" onClick={() => setSelectedArtist(null)}>{t('clearFilter')}</button>
                    )}
                </div>
                <div className="sidebar-categories-list">
                    {availableArtists.map(artist => (
                        <button
                            key={artist}
                            className={`sidebar-category-item-btn ${selectedArtist === artist ? 'active' : ''}`}
                            onClick={() => {
                                setSelectedArtist(selectedArtist === artist ? null : artist);
                                setSelectedPlaylist(null);
                                setActiveTab('library');
                            }}
                        >
                            <span>{artist}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="categories-sidebar-section">
                <div className="categories-sidebar-header">
                    <div className="sidebar-section-title-wrap">
                        <span className="sidebar-section-prefix">04 //</span>
                        <span className="theme-section-title">{t('genres')}</span>
                    </div>
                    {selectedGenre && (
                        <button className="clear-filter-btn" onClick={() => setSelectedGenre(null)}>{t('clearFilter')}</button>
                    )}
                </div>
                <div className="sidebar-categories-list">
                    {availableGenres.map(genre => (
                        <button
                            key={genre}
                            className={`sidebar-category-item-btn ${selectedGenre === genre ? 'active' : ''}`}
                            onClick={() => {
                                setSelectedGenre(selectedGenre === genre ? null : genre);
                                setSelectedPlaylist(null);
                                setActiveTab('library');
                            }}
                        >
                            <span>{genre}</span>
                        </button>
                    ))}
                </div>
            </div>
        </aside>
    );
});
