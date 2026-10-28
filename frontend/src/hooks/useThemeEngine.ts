import { useState, useEffect } from 'react';
import { ThemeConfig } from '../types';

export const THEMES: Record<string, ThemeConfig> = {
    night_city: {
        accent: '#FCEE0A',       // Cyberpunk iconic yellow
        dark: '#D8CA00',
        hover: '#FFF04D',
        bg: '#08090D',          // Void Obsidian
        surface: '#11141D',     // Carbon Panel
        text: '#F2F5F8',
        mutedText: '#7A889B',
        border: '#232D3F',
        accentText: '#08090D'
    },
    arasaka: {
        accent: '#E50012',       // Arasaka corporate blood crimson
        dark: '#99000B',
        hover: '#FF1A2B',
        bg: '#050507',          // Monolithic void black
        surface: '#0E0C0E',     // Deep obsidian panel
        text: '#F5F5F7',
        mutedText: '#8A8488',
        border: '#420D14',
        accentText: '#FFFFFF'
    },
    netrunner: {
        accent: '#00FF66',       // Terminal phosphor green
        dark: '#00CC52',
        hover: '#33FF85',
        bg: '#04090C',          // Deep matrix void
        surface: '#0B171A',     // Cyan-green tinted terminal surface
        text: '#E0FFF0',
        mutedText: '#5A8F78',
        border: '#103F35',
        accentText: '#04090C'
    },
    trauma_team: {
        accent: '#00F0FF',       // Trauma cyan
        dark: '#00B8C4',
        hover: '#33F3FF',
        bg: '#090D12',          // Cold tactical slate
        surface: '#121A22',
        text: '#EEF6FA',
        mutedText: '#6C8394',
        border: '#1D3545',
        accentText: '#090D12'
    },
    kang_tao: {
        accent: '#FF9900',       // Industrial hazard amber
        dark: '#CC7A00',
        hover: '#FFAD33',
        bg: '#0A0A0C',
        surface: '#171618',
        text: '#F7F4F0',
        mutedText: '#877E75',
        border: '#382D1D',
        accentText: '#0A0A0C'
    }
};

export function useThemeEngine() {
    const [currentTheme, setCurrentTheme] = useState<string>(() => {
        try {
            const saved = (typeof window !== 'undefined' && window.localStorage && (localStorage.getItem('synapse_theme') || localStorage.getItem('soundplayer_theme')));
            if (saved && THEMES[saved]) return saved;
            return 'night_city';
        } catch {
            return 'night_city';
        }
    });

    useEffect(() => {
        const theme = THEMES[currentTheme] || THEMES.night_city;
        const root = document.documentElement;
        root.style.setProperty('--accent-color', theme.accent);
        root.style.setProperty('--accent-color-dark', theme.dark);
        root.style.setProperty('--accent-color-hover', theme.hover);
        root.style.setProperty('--accent-text-color', theme.accentText);
        root.style.setProperty('--bg-color', theme.bg);
        root.style.setProperty('--surface-color', theme.surface);
        root.style.setProperty('--text-color', theme.text);
        root.style.setProperty('--muted-text-color', theme.mutedText);
        root.style.setProperty('--border-color', theme.border);
        root.style.setProperty('--accent-bg-glow', theme.accent + '26');
        root.style.setProperty('--accent-row-active', theme.accent + '14');
        root.style.setProperty('--hover-color', theme.text + '0f');
        // Cyberpunk HUD global constants
        root.style.setProperty('--cyber-yellow', '#FCEE0A');
        root.style.setProperty('--cyber-cyan', '#00F0FF');
        root.style.setProperty('--cyber-crimson', '#FF003C');
        root.style.setProperty('--cyber-green', '#00FF66');
        root.style.setProperty('--cyber-amber', '#FF9900');

        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem('synapse_theme', currentTheme);
            }
        } catch {
            // Ignore
        }
    }, [currentTheme]);

    return {
        themes: THEMES,
        currentTheme,
        setCurrentTheme
    };
}
