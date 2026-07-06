import React from 'react';
import { BoltIcon, FolderIcon, LoadIcon, SettingsIcon } from './Icons';

interface AppHeaderProps {
    activeTab: 'library' | 'settings' | 'musicians';
    setActiveTab: (tab: 'library' | 'settings' | 'musicians') => void;
    handleSelectDirectory: () => void;
    handleScan: () => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
    activeTab,
    setActiveTab,
    handleSelectDirectory,
    handleScan,
    searchQuery,
    setSearchQuery
}) => {
    return (
        <header className="app-header">
            <div className="header-left">
                <button className="header-btn brand-btn" onClick={() => { setActiveTab('library'); }}>
                    <BoltIcon />
                </button>
                <button className={`header-btn ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}>
                    <span>Library</span>
                </button>
                <button className={`header-btn ${activeTab === 'musicians' ? 'active' : ''}`} onClick={() => setActiveTab('musicians')}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                    </svg>
                    <span>Musicians</span>
                </button>
                <button className="header-btn" onClick={handleSelectDirectory}>
                    <FolderIcon />
                    <span>Open Folder</span>
                </button>
                <button className="header-btn" onClick={handleScan}>
                    <LoadIcon />
                    <span>Scan Folder</span>
                </button>
            </div>

            <div className="header-center">
                <div className="search-bar-container">
                    <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input 
                        type="text" 
                        placeholder="Search in library..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                    {searchQuery && (
                        <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
                    )}
                </div>
            </div>

            <div className="header-right">
                <button
                    className={`settings-toggle-btn ${activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => setActiveTab(activeTab === 'settings' ? 'library' : 'settings')}
                    title="Settings"
                >
                    <SettingsIcon />
                </button>
            </div>
        </header>
    );
};
