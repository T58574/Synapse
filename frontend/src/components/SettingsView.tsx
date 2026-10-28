import React from 'react';
import { ThemeConfig } from '../types';
import { Language, useTranslation } from '../localization';
import { CyberSelect } from './CyberSelect';

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
    visualizerEnabled: boolean;
    setVisualizerEnabled: (enabled: boolean) => void;
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
    handleOpenDir,
    visualizerEnabled,
    setVisualizerEnabled
}) => {
    const { t } = useTranslation(language);

    return (
        <div className="settings-view">
            <header className="settings-header">
                <div className="settings-header-badge">
                    <span className="hud-corner-bracket">[</span>
                    <span className="badge-dot"></span>
                    <span className="badge-text">SYS_CONFIG // TERMINAL_CONTROL</span>
                    <span className="hud-corner-bracket">]</span>
                </div>
                <h1 className="settings-title">{t('appSettings')}</h1>
                <p className="settings-subtitle">{t('appSettingsDesc')}</p>
            </header>

            <div className="settings-grid-layout">
                {/* 1. THEMES SECTION */}
                <section className="settings-panel theme-panel-full">
                    <div className="panel-header">
                        <span className="panel-tag">01 // VISUAL_HUD</span>
                        <h3 className="panel-title">{t('colorPaletteTheme')}</h3>
                    </div>
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
                                        {tKey === 'night_city' ? t('themeNightCity') :
                                         tKey === 'arasaka' ? t('themeArasaka') :
                                         tKey === 'netrunner' ? t('themeNetrunner') :
                                         tKey === 'trauma_team' ? t('themeTraumaTeam') :
                                         tKey === 'kang_tao' ? t('themeKangTao') :
                                         tKey}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* 2. AUDIO HARDWARE BUS */}
                <section className="settings-panel">
                    <div className="panel-header">
                        <span className="panel-tag">02 // AUDIO_CORE</span>
                        <h3 className="panel-title">{t('audioTransitions')}</h3>
                    </div>

                    <div className="settings-item">
                        <div className="settings-item-info">
                            <span className="settings-item-label">{t('audioOutputDevice')}</span>
                            <span className="settings-item-desc">{t('audioOutputDeviceDesc')}</span>
                        </div>
                        <div className="settings-item-control">
                            <CyberSelect
                                value={selectedDevice}
                                onChange={(val) => handleDeviceChange(val)}
                                prefix="DEV"
                                options={audioDevices.map((d) => ({
                                    value: d.id,
                                    label: (d.id === 'default' && language === 'ru') ? 'Устройство по умолчанию' : d.name,
                                    badge: d.isDefault ? 'SYS_DEFAULT' : undefined
                                }))}
                            />
                        </div>
                    </div>

                    <div className="settings-item" style={{ marginTop: '16px' }}>
                        <div className="settings-item-info">
                            <span className="settings-item-label">{t('automixCrossfade')}</span>
                            <span className="settings-item-desc">{t('automixCrossfadeDesc')}</span>
                        </div>
                        <div className="settings-item-control crossfade-control">
                            <input
                                type="range"
                                min="1"
                                max="20"
                                step="1"
                                value={crossfadeDuration}
                                onChange={(e) => handleCrossfadeChange(parseFloat(e.target.value))}
                                className="cyber-slider"
                                style={{
                                    background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((crossfadeDuration - 1) / 19) * 100}%, var(--border-color) ${((crossfadeDuration - 1) / 19) * 100}%, var(--border-color) 100%)`
                                }}
                            />
                            <span className="settings-item-badge">{crossfadeDuration}s</span>
                        </div>
                    </div>
                </section>

                {/* 3. SYSTEM & GRAPHICS ENGINE */}
                <section className="settings-panel">
                    <div className="panel-header">
                        <span className="panel-tag">03 // SYSTEM_ENV</span>
                        <h3 className="panel-title">{language === 'ru' ? 'Система и Рендеринг' : 'System & Rendering'}</h3>
                    </div>

                    <div className="settings-item">
                        <div className="settings-item-info">
                            <span className="settings-item-label">{t('appLanguage')}</span>
                            <span className="settings-item-desc">{t('appLanguageDesc')}</span>
                        </div>
                        <div className="settings-item-control">
                            <CyberSelect
                                value={language}
                                onChange={(val) => setLanguage(val as Language)}
                                prefix="LANG"
                                options={[
                                    { value: 'ru', label: 'Русский (RU)', badge: 'CYR' },
                                    { value: 'en', label: 'English (EN)', badge: 'LAT' }
                                ]}
                            />
                        </div>
                    </div>

                    <div className="settings-item" style={{ marginTop: '16px' }}>
                        <div className="settings-item-info">
                            <span className="settings-item-label">{language === 'ru' ? 'Живой WebGL-визуализатор волны' : 'Live WebGL Wave Visualizer'}</span>
                            <span className="settings-item-desc">
                                {language === 'ru'
                                    ? 'Авто-пауза при сворачивании (0% CPU). Отключите для максимального энергосбережения.'
                                    : 'Auto-pauses when minimized (0% CPU). Disable for battery saving.'}
                            </span>
                        </div>
                        <div className="settings-item-control" style={{ justifyContent: 'flex-end' }}>
                            <button
                                className={`cyber-toggle-btn ${visualizerEnabled ? 'active' : ''}`}
                                onClick={() => setVisualizerEnabled(!visualizerEnabled)}
                            >
                                <span className="toggle-indicator"></span>
                                <span>{visualizerEnabled ? (language === 'ru' ? 'ВКЛ // ON' : 'ON') : (language === 'ru' ? 'ВЫКЛ // OFF' : 'OFF')}</span>
                            </button>
                        </div>
                    </div>
                </section>

                {/* 4. STORAGE & HARDWARE TELEMETRY */}
                <section className="settings-panel theme-panel-full">
                    <div className="panel-header">
                        <span className="panel-tag">04 // TELEMETRY & STORAGE</span>
                        <h3 className="panel-title">{t('systemStorage')}</h3>
                    </div>

                    <div className="settings-info-grid">
                        <div className="info-item">
                            <span className="info-label">{t('audioSampleRate')}</span>
                            <span className="info-value">44100 HZ / F32</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">{t('playbackChannels')}</span>
                            <span className="info-value">{language === 'ru' ? '2 КАНАЛА (СТЕРЕО)' : '2 CHANNELS (STEREO)'}</span>
                        </div>
                        <div className="info-item dir-path-card">
                            <div className="dir-path-info">
                                <span className="info-label">{t('libraryDirPath')}</span>
                                <span className="info-value dir-path-text">{musicDir}</span>
                            </div>
                            <button 
                                className="sidebar-btn cyber-dir-btn" 
                                onClick={handleOpenDir}
                            >
                                {language === 'ru' ? 'ОТКРЫТЬ ДИРЕКТОРИЮ' : 'OPEN DIRECTORY'}
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};
