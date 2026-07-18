import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

vi.mock('../wailsjs/runtime/runtime', () => ({
    EventsOn: vi.fn().mockReturnValue(() => {}),
    EventsOff: vi.fn(),
    EventsEmit: vi.fn(),
}));

vi.mock('../wailsjs/go/backend/App', () => ({
    LoadTrack: vi.fn(),
    Play: vi.fn(),
    Pause: vi.fn(),
    Seek: vi.fn(),
    SetVolume: vi.fn().mockResolvedValue(undefined),
    SetTempo: vi.fn(),
    SetPitch: vi.fn(),
    GetPosition: vi.fn(),
    IsPlaying: vi.fn(),
    ToggleAutoMix: vi.fn(),
    SelectAudioFile: vi.fn(),
    GetMusicDir: vi.fn().mockResolvedValue('/mock/music/dir'),
    ScanMusicDir: vi.fn().mockResolvedValue([]),
    OpenMusicDir: vi.fn(),
    SetCrossfadeDuration: vi.fn(),
    LogFromJS: vi.fn().mockResolvedValue(undefined),
    GetPlaylists: vi.fn().mockResolvedValue([]),
    SavePlaylists: vi.fn().mockResolvedValue(undefined),
    CreatePlaylist: vi.fn().mockResolvedValue(undefined),
    DeletePlaylist: vi.fn().mockResolvedValue(undefined),
    AddTrackToPlaylist: vi.fn().mockResolvedValue(undefined),
    RemoveTrackFromPlaylist: vi.fn().mockResolvedValue(undefined),
    SearchSoundCloud: vi.fn().mockResolvedValue([]),
    DownloadFromSoundCloud: vi.fn().mockResolvedValue(undefined),
    GetAudioDevices: vi.fn().mockResolvedValue([]),
    SetAudioDevice: vi.fn().mockResolvedValue(true),
    SetEQ: vi.fn().mockResolvedValue(undefined),
    SetEQ10: vi.fn().mockResolvedValue(undefined),
    SetDSP: vi.fn().mockResolvedValue(undefined),
}));

describe('App Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the header control buttons', async () => {
        render(<App />);

        expect(screen.getByRole('button', { name: /Open Folder/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Scan Folder/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Settings/i })).toBeInTheDocument();
    });

    it('shows the library view by default with empty state message', async () => {
        render(<App />);

        await waitFor(() => {
            expect(screen.getByText('Your library is empty')).toBeInTheDocument();
        });

        expect(screen.getByText('Home Library')).toBeInTheDocument();
    });

    it('navigates to Settings view and shows App Settings', async () => {
        render(<App />);

        const settingsButton = screen.getByRole('button', { name: /Settings/i });
        fireEvent.click(settingsButton);

        await waitFor(() => {
            expect(screen.getByText('App Settings')).toBeInTheDocument();
            expect(screen.getByText('Customize your 0xSoundPlayer experience and theme styles')).toBeInTheDocument();
        });
    });

    it('navigates to Musicians view and shows Musicians header', async () => {
        render(<App />);

        const musiciansButton = screen.getByRole('button', { name: /Musicians/i });
        fireEvent.click(musiciansButton);

        await waitFor(() => {
            expect(screen.getByText(/unique artists found in your library/i)).toBeInTheDocument();
        });
    });
});
