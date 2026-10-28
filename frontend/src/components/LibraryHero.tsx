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

export const LibraryHero: React.FC<LibraryHeroProps> = React.memo(({
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
        <header className="library-hero cyber-hero-hud">
            {isArtist && (
                <div className="hero-artist-container">
                    <ArtistShape name={selectedArtist} />
                </div>
            )}
            <div className="hero-content">
                <div className="hero-status-row">
                    <span className="hero-status-dot"></span>
                    <span className="hero-tag">[ SYS_STREAM // {tagText} ]</span>
                    <span className="hero-telemetry-badge">REV.2077</span>
                </div>
                <h1 className="hero-title">{titleText}</h1>
                <div className="hero-stats cyber-tech-mono">
                    <span className="hero-author">Synapse</span>
                    <span className="hero-separator">/</span>
                    <span className="hero-stat-highlight">{getPluralTracks(currentPlaylistTracks.length, language)}</span>
                    <span className="hero-separator">/</span>
                    <span>{totalDurationStr}</span>
                </div>
                <div className="hero-mount-container cyber-tech-mono">
                    <span className="hero-mount-prefix">&gt; MOUNT:</span>
                    <span className="hero-path">{pathText}</span>
                </div>
            </div>
            <div className="hero-hud-decorations">
                <div className="hud-corner-bracket top-right"></div>
                <div className="hud-corner-bracket bottom-right"></div>
                <div className="hud-barcode-lines"></div>
            </div>
        </header>
    );
});
