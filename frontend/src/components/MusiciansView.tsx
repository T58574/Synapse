import React, { useState } from 'react';
import { TrackInfo } from '../types';
import { ArtistShape } from './ArtistShape';
import { PlayIcon } from './Icons';
import { splitArtists } from '../utils';

interface MusiciansViewProps {
    libraryTracks: TrackInfo[];
    setActiveTab: (tab: 'library' | 'settings' | 'musicians') => void;
    setSelectedArtist: (artist: string | null) => void;
    setSelectedPlaylist: (playlist: string | null) => void;
    handlePlayLibraryTrack: (index: number) => Promise<void>;
}

export const MusiciansView: React.FC<MusiciansViewProps> = ({
    libraryTracks,
    setActiveTab,
    setSelectedArtist,
    setSelectedPlaylist,
    handlePlayLibraryTrack
}) => {
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
                    <span className="hero-tag">DISCOVER</span>
                    <h1 className="hero-title">Musicians</h1>
                    <p className="hero-stats" style={{ marginTop: '4px' }}>
                        {sortedArtists.length} unique artists found in your library
                    </p>
                </div>
                <div className="search-bar-container">
                    <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input 
                        type="text" 
                        placeholder="Search artists..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                    {searchQuery && (
                        <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
                    )}
                </div>
            </div>

            {filteredArtists.length === 0 ? (
                <div className="empty-library">
                    <div className="empty-card">
                        <h3>No artists found</h3>
                        <p>No artists match your search query: "{searchQuery}"</p>
                        <button className="btn-secondary" onClick={() => setSearchQuery('')}>
                            Clear Search
                        </button>
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
                                    title={`Play ${artist.name}`}
                                >
                                    <PlayIcon />
                                </button>
                            </div>
                            <div className="artist-info">
                                <h3 className="artist-name">{artist.name}</h3>
                                <span className="artist-count">
                                    {artist.tracks.length} {artist.tracks.length === 1 ? 'track' : 'tracks'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
