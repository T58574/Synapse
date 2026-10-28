export const splitArtists = (artistStr: string | undefined): string[] => {
    if (!artistStr) return ['Unknown Artist'];
    
    // Regular expression to split by commas, ampersands, or feat/ft indicators
    // Separators: "," or "&" or case-insensitive "feat." / "feat" / "ft." / "ft"
    const regex = /\s*(?:,|\b(?:feat|ft)\.?|&)\s*/i;
    
    const parts = artistStr.split(regex);
    const artists = parts
        .map(p => p.replace(/^[.\s]+|[.\s]+$/g, '').trim())
        .filter(p => p.length > 0 && p.toLowerCase() !== 'unknown artist');
        
    return artists.length > 0 ? artists : ['Unknown Artist'];
};

export const getFilename = (path: string): string => {
    if (!path) return '';
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
};

export const formatTime = (sec: number): string => {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
};
