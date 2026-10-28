import React, { useState } from 'react';
import { TrackInfo } from '../types';
import { ArtistShape } from './ArtistShape';
import { PlayIcon } from './Icons';
import { splitArtists } from '../utils';
import { Language, useTranslation, getPluralTracks, getPluralArtists } from '../localization';

interface MusiciansViewProps {
    libraryTracks: TrackInfo[];
    setActiveTab: (tab: 'library' | 'settings' | 'musicians') => void;
    setSelectedArtist: (artist: string | null) => void;
    setSelectedPlaylist: (playlist: string | null) => void;
    handlePlayLibraryTrack: (index: number) => Promise<void>;
    language: Language;
}

export const MusiciansView: React.FC<MusiciansViewProps> = React.memo(({
    libraryTracks,
    setActiveTab,
    setSelectedArtist,
    setSelectedPlaylist,
    handlePlayLibraryTrack,
    language
}) => {
    const { t } = useTranslation(language);
    const [searchQuery, setSearchQuery] = useState('');

    // Extract unique artists and their tracks
    const artistGroups = React.useMemo(() => {
        const groups: { [key: string]: TrackInfo[] } = {};
        libraryTracks.forEach(track => {
            const artists = splitArtists(track.artist);
            artists.forEach(artist => {
                if (!groups[artist]) {
                    groups[artist] = [];
                }
                groups[artist].push(track);
            });
        });
        return groups;
    }, [libraryTracks]);

    const sortedArtists = React.useMemo(() => {
        return Object.keys(artistGroups)
            .sort((a, b) => a.localeCompare(b))
            .map(name => ({
                name,
                tracks: artistGroups[name]
            }));
    }, [artistGroups]);

    const filteredArtists = sortedArtists.filter(artist => 
        artist.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleArtistClick = (artistName: string) => {
        setSelectedArtist(artistName);
        setSelectedPlaylist(null);
        setActiveTab('library');
    };

    const handlePlayArtist = async (e: React.MouseEvent, artistName: string, tracks: TrackInfo[]) => {
        e.stopPropagation();
        if (tracks.length === 0) return;
        
        // Find index of the first track of this artist in the global libraryTracks
        const firstTrackPath = tracks[0].filePath;
        const globalIndex = libraryTracks.findIndex(t => t.filePath === firstTrackPath);
        if (globalIndex !== -1) {
            await handlePlayLibraryTrack(globalIndex);
        }
    };

    return (
        <div className="musicians-view">
            <div className="musicians-header-row">
                <div>
                    <span className="hero-tag">{t('discover')}</span>
                    <h1 className="hero-title">{t('musicians')}</h1>
                    <p className="hero-stats" style={{ marginTop: '4px' }}>
                        {getPluralArtists(sortedArtists.length, language)}
                    </p>
                </div>
                <div className="search-bar-container">
                    <span className="search-prefix">&gt;</span>
                    <input 
                        type="text" 
                        placeholder={`// ${t('searchArtistsPlaceholder').toUpperCase()}`} 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                    {searchQuery ? (
                        <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
                    ) : (
                        <span className="search-shortcut">ART::FND</span>
                    )}
                </div>
            </div>

            {filteredArtists.length === 0 ? (
                <div className="empty-library cyber-empty-terminal">
                    <div className="cyber-terminal-card">
                        <div className="terminal-header-bar">
                            <div className="terminal-title-group">
                                <span className="terminal-beacon red"></span>
                                <span className="terminal-title">SYS_SEARCH // NO_MATCH</span>
                            </div>
                            <span className="terminal-code">404_NOT_FOUND</span>
                        </div>
                        <div className="terminal-body">
                            <h3 className="terminal-main-heading">{t('noArtistsFound')}</h3>
                            <div className="terminal-log-output cyber-tech-mono">
                                <p>&gt; QUERY: &quot;{searchQuery}&quot;</p>
                                <p>&gt; STATUS: {t('noArtistsMatch', { query: searchQuery })}</p>
                            </div>
                            <button className="btn-secondary cyber-terminal-btn" onClick={() => setSearchQuery('')}>
                                [ {t('clearSearch').toUpperCase()} ]
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="artists-grid">
                    {filteredArtists.map(artist => (
                        <div 
                            key={artist.name} 
                            className="artist-card"
                            onClick={() => handleArtistClick(artist.name)}
                        >
                            <div className="artist-avatar-container">
                                <ArtistShape name={artist.name} size={150} />
                                <button 
                                    className="artist-play-btn" 
                                    onClick={(e) => handlePlayArtist(e, artist.name, artist.tracks)}
                                    title={`${language === 'ru' ? 'Играть' : 'Play'} ${artist.name}`}
                                >
                                    <PlayIcon />
                                </button>
                            </div>
                            <div className="artist-info">
                                <h3 className="artist-name">{artist.name}</h3>
                                <span className="artist-count">
                                    {getPluralTracks(artist.tracks.length, language)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});
