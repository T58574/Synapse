import { useState } from 'react';
import { PlaylistInfo } from '../types';
import {
    GetPlaylists,
    CreatePlaylist,
    DeletePlaylist,
    AddTrackToPlaylist,
    RemoveTrackFromPlaylist
} from '../../wailsjs/go/backend/App';

export function usePlaylists(uiLog: (level: 'INFO' | 'WARN' | 'ERROR', msg: string) => void) {
    const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
    const [isCreatingPlaylist, setIsCreatingPlaylist] = useState<boolean>(false);
    const [newPlaylistName, setNewPlaylistName] = useState<string>('');
    const [activePlaylistMenuTrack, setActivePlaylistMenuTrack] = useState<string | null>(null);

    const loadPlaylists = async () => {
        try {
            const list = await GetPlaylists();
            setPlaylists(list || []);
        } catch (err) {
            uiLog('ERROR', `loadPlaylists error: ${String(err)}`);
        }
    };

    const handleCreatePlaylistSubmit = async () => {
        if (!newPlaylistName.trim()) {
            setIsCreatingPlaylist(false);
            return;
        }
        try {
            await CreatePlaylist(newPlaylistName.trim());
            uiLog('INFO', `Created playlist: ${newPlaylistName}`);
            setNewPlaylistName('');
            setIsCreatingPlaylist(false);
            await loadPlaylists();
        } catch (err) {
            uiLog('ERROR', `CreatePlaylist error: ${String(err)}`);
        }
    };

    const handleDeletePlaylist = async (name: string) => {
        try {
            await DeletePlaylist(name);
            uiLog('INFO', `Deleted playlist: ${name}`);
            if (selectedPlaylist === name) {
                setSelectedPlaylist(null);
            }
            await loadPlaylists();
        } catch (err) {
            uiLog('ERROR', `DeletePlaylist error: ${String(err)}`);
        }
    };

    const handleAddTrackToPlaylist = async (playlistName: string, trackPath: string) => {
        try {
            await AddTrackToPlaylist(playlistName, trackPath);
            uiLog('INFO', `Added track ${trackPath} to playlist ${playlistName}`);
            await loadPlaylists();
            setActivePlaylistMenuTrack(null);
        } catch (err) {
            uiLog('ERROR', `AddTrackToPlaylist error: ${String(err)}`);
        }
    };

    const handleRemoveTrackFromPlaylist = async (playlistName: string, trackPath: string) => {
        try {
            await RemoveTrackFromPlaylist(playlistName, trackPath);
            uiLog('INFO', `Removed track ${trackPath} from playlist ${playlistName}`);
            await loadPlaylists();
        } catch (err) {
            uiLog('ERROR', `RemoveTrackFromPlaylist error: ${String(err)}`);
        }
    };

    return {
        playlists,
        setPlaylists,
        selectedPlaylist,
        setSelectedPlaylist,
        isCreatingPlaylist,
        setIsCreatingPlaylist,
        newPlaylistName,
        setNewPlaylistName,
        activePlaylistMenuTrack,
        setActivePlaylistMenuTrack,
        loadPlaylists,
        handleCreatePlaylistSubmit,
        handleDeletePlaylist,
        handleAddTrackToPlaylist,
        handleRemoveTrackFromPlaylist
    };
}
