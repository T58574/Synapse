export interface TrackInfo {
    filePath: string;
    title?: string;
    durationSec: number;
    bpm: number;
    keySignature: string;
    waveform: number[];
    artist?: string;
    genre?: string;
    mood?: string;
}

export interface PlaylistInfo {
    name: string;
    trackPaths: string[];
}

export interface ThemeConfig {
    accent: string;
    dark: string;
    hover: string;
    bg: string;
    surface: string;
    text: string;
    mutedText: string;
    border: string;
    accentText: string;
}
