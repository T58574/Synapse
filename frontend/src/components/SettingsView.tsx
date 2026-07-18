import React from 'react';
import { ThemeConfig } from '../types';
import { Language, useTranslation } from '../localization';

interface AudioDevice {
    name: string;
    id: string;
    isDefault: boolean;
}

interface SettingsViewProps {
    themes: Record<string, ThemeConfig>;
    currentTheme: string;
    setCurrentTheme: (theme: string) => void;
    crossfadeDuration: number;
    handleCrossfadeChange: (val: number) => Promise<void>;
    musicDir: string;
    audioDevices: AudioDevice[];
    selectedDevice: string;
    handleDeviceChange: (id: string) => Promise<void>;
    language: Language;
    setLanguage: (lang: Language) => void;
    handleOpenDir: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
    themes,
    currentTheme,
    setCurrentTheme,
    crossfadeDuration,
    handleCrossfadeChange,
    musicDir,
    audioDevices,
    selectedDevice,
    handleDeviceChange,
    language,
    setLanguage,
    handleOpenDir
}) => {
    const { t } = useTranslation(language);

    return (
        <div className="settings-view">
            <header className="settings-header">
                <h1>{t('appSettings')}</h1>
                <p>{t('appSettingsDesc')}</p>
            </header>

            <section className="settings-section">
                <h3 className="settings-section-title">{t('colorPaletteTheme')}</h3>
                <div className="themes-grid-large">
                    {Object.keys(themes).map((tKey) => {
                        const th = themes[tKey];
                        const isActive = currentTheme === tKey;
                        return (
                            <div 
                                key={tKey} 
                                className={`theme-card ${isActive ? 'active' : ''}`}
                                onClick={() => setCurrentTheme(tKey)}
                            >
                                <div className="theme-card-header">
                                    <span className="theme-card-title">{tKey}</span>
                                    <div className="theme-color-preview">
                                        <span className="color-preview-dot" style={{ backgroundColor: th.accent }}></span>
                                        <span className="color-preview-dot" style={{ backgroundColor: th.bg }}></span>
                                    </div>
                                </div>
                                <span className="theme-card-desc">
                                    {tKey === 'saas' ? t('themeSaas') : 
                                     tKey === 'neutrals' ? t('themeNeutrals') : 
                                     tKey === 'fintech' ? t('themeFintech') : 
                                     tKey === 'trust' ? t('themeTrust') : 
                                     t('themeEco')}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="settings-section">
                <h3 className="settings-section-title">{t('appLanguage')}</h3>
                <div className="settings-item">
                    <div className="settings-item-info">
                        <span className="settings-item-label">{t('appLanguage')}</span>
                        <span className="settings-item-desc">{t('appLanguageDesc')}</span>
                    </div>
                    <div className="settings-item-control">
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as Language)}
                            className="settings-device-select"
                        >
                            <option value="en">English (EN)</option>
                            <option value="ru">Русский (RU)</option>
                        </select>
                    </div>
                </div>
            </section>

            <section className="settings-section">
                <h3 className="settings-section-title">{t('audioTransitions')}</h3>
                <div className="settings-item">
                    <div className="settings-item-info">
                        <span className="settings-item-label">{t('automixCrossfade')}</span>
                        <span className="settings-item-desc">{t('automixCrossfadeDesc')}</span>
                    </div>
                    <div className="settings-item-control">
                        <input
                            type="range"
                            min="1"
                            max="20"
                            step="1"
                            value={crossfadeDuration}
                            onChange={(e) => handleCrossfadeChange(parseFloat(e.target.value))}
                            className="slider"
                            style={{
                                background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((crossfadeDuration - 1) / 19) * 100}%, var(--border-color) ${((crossfadeDuration - 1) / 19) * 100}%, var(--border-color) 100%)`
                            }}
                        />
                        <span className="settings-item-badge">{crossfadeDuration}s</span>
                    </div>
                </div>

                <div className="settings-item" style={{ marginTop: '24px' }}>
                    <div className="settings-item-info">
                        <span className="settings-item-label">{t('audioOutputDevice')}</span>
                        <span className="settings-item-desc">{t('audioOutputDeviceDesc')}</span>
                    </div>
                    <div className="settings-item-control">
                        <select
                            value={selectedDevice}
                            onChange={(e) => handleDeviceChange(e.target.value)}
                            className="settings-device-select"
                        >
                            {audioDevices.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.id === 'default' && language === 'ru' ? 'Устройство по умолчанию' : d.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </section>

            <section className="settings-section">
                <h3 className="settings-section-title">{t('systemStorage')}</h3>
                <div className="settings-info-grid">
                    <div className="info-item">
                        <span className="info-label">{t('audioSampleRate')}</span>
                        <span className="info-value">44100 Hz</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">{t('playbackChannels')}</span>
                        <span className="info-value">{language === 'ru' ? '2 (Стерео)' : '2 (Stereo)'}</span>
                    </div>
                    <div className="info-item" style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span className="info-label">{t('libraryDirPath')}</span>
                            <span className="info-value" style={{ fontSize: '11px', wordBreak: 'break-all' }}>{musicDir}</span>
                        </div>
                        <button 
                            className="sidebar-btn" 
                            onClick={handleOpenDir}
                            style={{ margin: 0, padding: '8px 16px', fontSize: '12px', height: 'fit-content' }}
                        >
                            {language === 'ru' ? 'Открыть логи и файлы' : 'Open Logs & Files'}
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
};
