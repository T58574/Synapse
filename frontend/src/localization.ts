export type Language = 'en' | 'ru';

export const translations = {
    en: {
        // AppHeader
        library: "Library",
        musicians: "Musicians",
        openFolder: "Open Folder",
        scanFolder: "Scan Folder",
        searchPlaceholder: "Search in library...",
        equalizer: "EQUALIZER",
        reset: "Reset",
        bass: "BASS",
        mid: "MID",
        treble: "TREBLE",

        // Sidebar
        playlists: "PLAYLISTS",
        newPlaylistPlaceholder: "New playlist name...",
        clearFilter: "Clear",
        artists: "ARTISTS",
        genres: "GENRES",
        allTracks: "All Tracks",

        // Hero
        artistTag: "ARTIST",
        customPlaylistTag: "CUSTOM PLAYLIST",
        localPlaylistTag: "LOCAL PLAYLIST",
        homeLibrary: "Home Library",

        // LibraryTable
        titleCol: "TITLE",
        bpmCol: "BPM",
        keyCol: "KEY",
        durationCol: "DURATION",
        addToPlaylist: "Add to Playlist",
        removeFromPlaylist: "Remove from Playlist",
        noPlaylistsCreated: "No playlists created",
        libraryEmptyTitle: "Your library is empty",
        libraryEmptyDesc: "Drop audio files into `.0xplayer` directory under your home folder.",
        selectFileDirectly: "Select File Directly",
        openDirectory: "Open Directory",
        unknownArtist: "Unknown Artist",
        myWave: "My Wave",
        myWaveOn: "My Wave: ON",
        openMusicDir: "Open Music Dir",
        clickToCopyTitle: "Click to copy title",
        clickToCopyArtist: "Click to copy artist",

        // Settings
        appSettings: "App Settings",
        appSettingsDesc: "Customize your 0xSoundPlayer experience and theme styles",
        colorPaletteTheme: "Color Palette Theme",
        audioTransitions: "Audio & Transitions",
        automixCrossfade: "Auto-Mix Crossfade Duration",
        automixCrossfadeDesc: "Adjust the crossfade time between tracks when Auto-Mix is active.",
        audioOutputDevice: "Audio Output Device",
        audioOutputDeviceDesc: "Route playback audio stream to a custom hardware device.",
        systemStorage: "System & Storage",
        audioSampleRate: "Audio Sample Rate",
        playbackChannels: "Playback Channels",
        libraryDirPath: "Library Directory Path",
        themeSaas: "Modern SaaS & Dark Dashboard",
        themeNeutrals: "Elevated Neutrals (Light Mode)",
        themeFintech: "Fintech & AI Innovation",
        themeTrust: "Classic Trust (Light Mode)",
        themeEco: "Eco-Digital & Wellness",
        appLanguage: "Application Language",
        appLanguageDesc: "Choose interface language.",

        // Musicians
        discover: "DISCOVER",
        searchArtistsPlaceholder: "Search artists...",
        noArtistsFound: "No artists found",
        noArtistsMatch: 'No artists match your search query: "{query}"',
        clearSearch: "Clear Search",

        // PlaybackBar
        noTrackPlaying: "No Track Playing",
        automixLabel: "AUTO-MIX",

        // Toast Notifications
        copiedTitle: 'Copied title: "{text}"',
        copiedArtist: 'Copied artist: "{text}"',
        audioRouted: "Audio output routed to: {name}",
        copyFailed: "Failed to copy: {err}",
        routeFailed: "Failed to route audio output to {device}",
        soundEnhancement: "Sound FX & Mastering",
        limiterMaximizer: "Brickwall Limiter / Maximizer",
        stereoWidener: "Stereo Widener",
        reverb: "Reverb (Ambient)",
        bassBoost: "Psychoacoustic Bass Boost",
        exciter: "Exciter (Treble Air)",
        presets: "EQ Presets",
        customPresets: "Custom Presets",
        savePreset: "Save Preset",
        presetName: "Preset Name",
        eq10: "10-Band Graphic EQ",
    },
    ru: {
        // AppHeader
        library: "Библиотека",
        musicians: "Исполнители",
        openFolder: "Открыть папку",
        scanFolder: "Сканировать",
        searchPlaceholder: "Поиск в библиотеке...",
        equalizer: "ЭКВАЛАЙЗЕР",
        reset: "Сброс",
        bass: "НЧ",
        mid: "СЧ",
        treble: "ВЧ",

        // Sidebar
        playlists: "ПЛЕЙЛИСТЫ",
        newPlaylistPlaceholder: "Новый плейлист...",
        clearFilter: "Сбросить",
        artists: "ИСПОЛНИТЕЛИ",
        genres: "ЖАНРЫ",
        allTracks: "Все треки",

        // Hero
        artistTag: "ИСПОЛНИТЕЛЬ",
        customPlaylistTag: "ПОЛЬЗОВАТЕЛЬСКИЙ ПЛЕЙЛИСТ",
        localPlaylistTag: "ЛОКАЛЬНАЯ БИБЛИОТЕКА",
        homeLibrary: "Моя медиатека",

        // LibraryTable
        titleCol: "НАЗВАНИЕ",
        bpmCol: "BPM",
        keyCol: "ТОНАЛЬНОСТЬ",
        durationCol: "ДЛИТЕЛЬНОСТЬ",
        addToPlaylist: "Добавить в плейлист",
        removeFromPlaylist: "Удалить из плейлиста",
        noPlaylistsCreated: "Нет созданных плейлистов",
        libraryEmptyTitle: "Ваша библиотека пуста",
        libraryEmptyDesc: "Переместите аудиофайлы в директорию `.0xplayer` в вашей домашней папке.",
        selectFileDirectly: "Выбрать файл напрямую",
        openDirectory: "Открыть папку",
        unknownArtist: "Неизвестный исполнитель",
        myWave: "Моя волна",
        myWaveOn: "Моя волна: ВКЛ",
        openMusicDir: "Открыть папку музыки",
        clickToCopyTitle: "Нажмите для копирования названия",
        clickToCopyArtist: "Нажмите для копирования исполнителя",

        // Settings
        appSettings: "Настройки приложения",
        appSettingsDesc: "Персонализация интерфейса и стилей тем 0xSoundPlayer",
        colorPaletteTheme: "Цветовая схема темы",
        audioTransitions: "Звук и переходы",
        automixCrossfade: "Длительность кроссфейда автомикса",
        automixCrossfadeDesc: "Регулировка времени кроссфейда при активном автомиксе.",
        audioOutputDevice: "Устройство вывода звука",
        audioOutputDeviceDesc: "Направление аудиопотока на определенное физическое устройство.",
        systemStorage: "Система и хранилище",
        audioSampleRate: "Частота дискретизации",
        playbackChannels: "Каналы воспроизведения",
        libraryDirPath: "Путь к папке библиотеки",
        themeSaas: "Современный SaaS и темная панель",
        themeNeutrals: "Светлые нейтральные тона (Светлая тема)",
        themeFintech: "Финтех и ИИ инновации",
        themeTrust: "Классическое доверие (Светлая тема)",
        themeEco: "Эко-диджитал и велнес",
        appLanguage: "Язык приложения",
        appLanguageDesc: "Выберите язык интерфейса.",

        // Musicians
        discover: "ОТКРЫВАЙТЕ",
        searchArtistsPlaceholder: "Поиск исполнителей...",
        noArtistsFound: "Исполнители не найдены",
        noArtistsMatch: 'По запросу "{query}" нет совпадений',
        clearSearch: "Очистить поиск",

        // PlaybackBar
        noTrackPlaying: "Нет воспроизводимого трека",
        automixLabel: "АВТОМИКС",

        // Toast Notifications
        copiedTitle: 'Скопировано название: "{text}"',
        copiedArtist: 'Скопирован исполнитель: "{text}"',
        audioRouted: "Звук перенаправлен на: {name}",
        copyFailed: "Не удалось скопировать: {err}",
        routeFailed: "Не удалось перенаправить звук на {device}",
        soundEnhancement: "Обработка и Мастеринг",
        limiterMaximizer: "Brickwall Лимитер / Максимайзер",
        stereoWidener: "Расширитель стереобазы",
        reverb: "Реверберация (Окружение)",
        bassBoost: "Усиление басов (Sub-Bass)",
        exciter: "Эксайтер (Четкость ВЧ)",
        presets: "Пресеты EQ",
        customPresets: "Пользовательские",
        savePreset: "Сохранить пресет",
        presetName: "Название пресета",
        eq10: "10-полосный эквалайзер",
    }
};

export function getPluralTracks(count: number, lang: Language): string {
    if (lang === 'en') {
        return count === 1 ? '1 track' : `${count} tracks`;
    }
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
        return `${count} треков`;
    }
    if (lastDigit === 1) {
        return `${count} трек`;
    }
    if (lastDigit >= 2 && lastDigit <= 4) {
        return `${count} трека`;
    }
    return `${count} треков`;
}

export function getPluralArtists(count: number, lang: Language): string {
    if (lang === 'en') {
        return `${count} unique artists found in your library`;
    }
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
        return `В вашей библиотеке найдено ${count} уникальных исполнителей`;
    }
    if (lastDigit === 1) {
        return `В вашей библиотеке найден ${count} уникальный исполнитель`;
    }
    if (lastDigit >= 2 && lastDigit <= 4) {
        return `В вашей библиотеке найдено ${count} уникальных исполнителя`;
    }
    return `В вашей библиотеке найдено ${count} уникальных исполнителей`;
}

export function useTranslation(lang: Language) {
    const t = (key: keyof typeof translations['en'], params?: Record<string, string | number>) => {
        let text = translations[lang][key] || translations['en'][key] || String(key);
        if (params) {
            Object.keys(params).forEach(pKey => {
                text = text.replace(`{${pKey}}`, String(params[pKey]));
            });
        }
        return text;
    };
    return { t };
}
