import React from 'react';
import { BoltIcon, FolderIcon, LoadIcon, SettingsIcon, SlidersIcon } from './Icons';
import { Language, useTranslation } from '../localization';

interface AppHeaderProps {
    activeTab: 'library' | 'settings' | 'musicians';
    setActiveTab: (tab: 'library' | 'settings' | 'musicians') => void;
    handleSelectDirectory: () => void;
    handleScan: () => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    showEqualizer: boolean;
    setShowEqualizer: (show: boolean) => void;
    language: Language;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
    activeTab,
    setActiveTab,
    handleSelectDirectory,
    handleScan,
    searchQuery,
    setSearchQuery,
    showEqualizer,
    setShowEqualizer,
    language
}) => {
    const { t } = useTranslation(language);

    return (
        <header className="app-header">
            <div className="header-left">
                <button className="header-btn brand-btn" onClick={() => { setActiveTab('library'); }} title="Synapse Core">
                    <BoltIcon />
                    <span className="brand-text">SYNAPSE</span>
                </button>
                <button className={`header-btn ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}>
                    <span className="btn-hud-bracket">[</span>
                    <span>{t('library')}</span>
                    <span className="btn-hud-bracket">]</span>
                </button>
                <button className={`header-btn ${activeTab === 'musicians' ? 'active' : ''}`} onClick={() => setActiveTab('musicians')}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                    </svg>
                    <span>{t('musicians')}</span>
                </button>
                <button className="header-btn" onClick={handleSelectDirectory}>
                    <FolderIcon />
                    <span>{t('openFolder')}</span>
                </button>
                <button className="header-btn" onClick={handleScan}>
                    <LoadIcon />
                    <span>{t('scanFolder')}</span>
                </button>
            </div>

            <div className="header-center">
                <div className="search-bar-container">
                    <span className="search-prefix">&gt;</span>
                    <input 
                        type="text" 
                        placeholder={`// ${t('searchPlaceholder').toUpperCase()}`} 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                    {searchQuery ? (
                        <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
                    ) : (
                        <span className="search-shortcut">SYS::FND</span>
                    )}
                </div>
            </div>

            <div className="header-right" style={{ position: 'relative' }}>
                <button
                    className={`settings-toggle-btn ${showEqualizer ? 'active' : ''}`}
                    onClick={() => {
                        setShowEqualizer(!showEqualizer);
                        if (activeTab === 'settings') setActiveTab('library');
                    }}
                    title={t('equalizer')}
                >
                    <SlidersIcon />
                </button>
                <button
                    className={`settings-toggle-btn ${activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => {
                        setActiveTab(activeTab === 'settings' ? 'library' : 'settings');
                        setShowEqualizer(false);
                    }}
                    title="Settings"
                >
                    <SettingsIcon />
                </button>
            </div>
        </header>
    );
};
