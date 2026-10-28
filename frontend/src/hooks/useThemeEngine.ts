import { useState, useEffect } from 'react';
import { ThemeConfig } from '../types';

export const THEMES: Record<string, ThemeConfig> = {
    saas: {
        accent: '#00FFC2',
        dark: '#00B388',
        hover: '#33FFCE',
        bg: '#0B0D10',
        surface: '#151A21',
        text: '#E9EEF5',
        mutedText: '#8A99AD',
        border: '#273140',
        accentText: '#0B0D10'
    },
    neutrals: {
        accent: '#635BFF',
        dark: '#4E45E0',
        hover: '#827BFF',
        bg: '#F0EEE9',
        surface: '#FFFFFF',
        text: '#141414',
        mutedText: '#626875',
        border: '#D2CEC4',
        accentText: '#FFFFFF'
    },
    fintech: {
        accent: '#00E5E5',
        dark: '#00B2B2',
        hover: '#33EBEB',
        bg: '#07070A',
        surface: '#11101E',
        text: '#F3F0FF',
        mutedText: '#8884A4',
        border: '#2C2B47',
        accentText: '#07070A'
    },
    trust: {
        accent: '#1A73E8',
        dark: '#1152A3',
        hover: '#3B8AF3',
        bg: '#F8FAFC',
        surface: '#FFFFFF',
        text: '#1E293B',
        mutedText: '#64748B',
        border: '#E2E8F0',
        accentText: '#FFFFFF'
    },
    eco: {
        accent: '#316263',
        dark: '#224445',
        hover: '#417F80',
        bg: '#E7D8C6',
        surface: '#FAF6F0',
        text: '#101417',
        mutedText: '#6A5F50',
        border: '#D6C8B7',
        accentText: '#FFFFFF'
    }
};

export function useThemeEngine() {
    const [currentTheme, setCurrentTheme] = useState<string>(() => {
        try {
            return (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('soundplayer_theme')) || 'saas';
        } catch {
            return 'saas';
        }
    });

    useEffect(() => {
        const theme = THEMES[currentTheme] || THEMES.saas;
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
        root.style.setProperty('--accent-bg-glow', theme.accent + '1c');
        root.style.setProperty('--accent-row-active', theme.accent + '0f');
        root.style.setProperty('--hover-color', theme.text + '0f');

        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem('soundplayer_theme', currentTheme);
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
