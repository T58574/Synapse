import React from 'react';
import { TrackInfo } from '../types';
import { ArtistShape } from './ArtistShape';
import { Language, useTranslation, getPluralTracks } from '../localization';

interface LibraryHeroProps {
    selectedPlaylist: string | null;
    selectedArtist: string | null;
    currentPlaylistTracks: TrackInfo[];
    totalDurationStr: string;
    musicDir: string;
    language: Language;
}

export const LibraryHero: React.FC<LibraryHeroProps> = ({
    selectedPlaylist,
    selectedArtist,
    currentPlaylistTracks,
    totalDurationStr,
    musicDir,
    language
}) => {
    const { t } = useTranslation(language);
    const isArtist = !!selectedArtist;
    const tagText = isArtist ? t('artistTag') : (selectedPlaylist ? t('customPlaylistTag') : t('localPlaylistTag'));
    const titleText = selectedArtist || selectedPlaylist || t('homeLibrary');
    const pathText = selectedArtist ? `${t('artistTag')}: ${selectedArtist}` : (selectedPlaylist ? `${t('customPlaylistTag')}: ${selectedPlaylist}` : musicDir);

    return (
        <header className="library-hero">
            {isArtist && (
                <div style={{ width: '130px', height: '130px', flexShrink: 0, borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                    <ArtistShape name={selectedArtist} />
                </div>
            )}
            <div className="hero-content">
                <span className="hero-tag">{tagText}</span>
                <h1 className="hero-title">{titleText}</h1>
                <div className="hero-stats">
                    <span className="hero-author">0xPlayer</span>
                    <span className="hero-dot">•</span>
                    <span>{getPluralTracks(currentPlaylistTracks.length, language)}</span>
                    <span className="hero-dot">•</span>
                    <span>{totalDurationStr}</span>
                </div>
                <p className="hero-path">{pathText}</p>
            </div>
        </header>
    );
};
