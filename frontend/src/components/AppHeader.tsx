import React from 'react';
import { BoltIcon, FolderIcon, LoadIcon, SettingsIcon, SlidersIcon } from './Icons';

interface AppHeaderProps {
    activeTab: 'library' | 'settings' | 'musicians';
    setActiveTab: (tab: 'library' | 'settings' | 'musicians') => void;
    handleSelectDirectory: () => void;
    handleScan: () => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    showEqualizer: boolean;
    setShowEqualizer: (show: boolean) => void;
    eqValues: [number, number, number];
    setEQValue: (bandIndex: number, val: number) => void;
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
    eqValues,
    setEQValue
}) => {
    const handleEQReset = () => {
        setEQValue(0, 0.0);
        setEQValue(1, 0.0);
        setEQValue(2, 0.0);
    };

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

            <div className="header-right" style={{ position: 'relative' }}>
                <button
                    className={`settings-toggle-btn ${showEqualizer ? 'active' : ''}`}
                    onClick={() => {
                        setShowEqualizer(!showEqualizer);
                        if (activeTab === 'settings') setActiveTab('library');
                    }}
                    title="Equalizer"
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

                {showEqualizer && (
                    <div className="equalizer-popover">
                        <div className="eq-popover-header">
                            <span>EQUALIZER</span>
                            <button className="eq-reset-btn" onClick={handleEQReset}>Reset</button>
                        </div>
                        <div className="eq-popover-sliders">
                            <div className="eq-slider-col">
                                <span className="eq-band-label">BASS</span>
                                <div className="eq-slider-wrapper">
                                    <input
                                        type="range"
                                        min="-12"
                                        max="12"
                                        step="0.5"
                                        value={eqValues[0]}
                                        onChange={(e) => setEQValue(0, parseFloat(e.target.value))}
                                        className="eq-slider"
                                    />
                                </div>
                                <span className="eq-val-label">{eqValues[0] > 0 ? `+${eqValues[0].toFixed(1)}` : eqValues[0].toFixed(1)} dB</span>
                            </div>
                            <div className="eq-slider-col">
                                <span className="eq-band-label">MID</span>
                                <div className="eq-slider-wrapper">
                                    <input
                                        type="range"
                                        min="-12"
                                        max="12"
                                        step="0.5"
                                        value={eqValues[1]}
                                        onChange={(e) => setEQValue(1, parseFloat(e.target.value))}
                                        className="eq-slider"
                                    />
                                </div>
                                <span className="eq-val-label">{eqValues[1] > 0 ? `+${eqValues[1].toFixed(1)}` : eqValues[1].toFixed(1)} dB</span>
                            </div>
                            <div className="eq-slider-col">
                                <span className="eq-band-label">TREBLE</span>
                                <div className="eq-slider-wrapper">
                                    <input
                                        type="range"
                                        min="-12"
                                        max="12"
                                        step="0.5"
                                        value={eqValues[2]}
                                        onChange={(e) => setEQValue(2, parseFloat(e.target.value))}
                                        className="eq-slider"
                                    />
                                </div>
                                <span className="eq-val-label">{eqValues[2] > 0 ? `+${eqValues[2].toFixed(1)}` : eqValues[2].toFixed(1)} dB</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </header>
    );
};
