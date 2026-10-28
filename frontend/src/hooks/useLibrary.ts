import React, { useState, useMemo, useRef, useEffect } from 'react';
import { TrackInfo, PlaylistInfo } from '../types';
import {
    GetMusicDir,
    ScanMusicDir,
    OpenMusicDir,
    UpdateTrackMetadata,
    DeleteTrack
} from '../../wailsjs/go/backend/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { splitArtists, getFilename } from '../utils';
import { Language } from '../localization';

export function useLibrary(
    language: Language,
    selectedPlaylist: string | null,
    playlists: PlaylistInfo[],
    uiLog: (level: 'INFO' | 'WARN' | 'ERROR', msg: string) => void,
    onTrackDeleted?: (filePath: string) => void
) {
    const [musicDir, setMusicDir] = useState<string>('');
    const [libraryTracks, setLibraryTracks] = useState<TrackInfo[]>([]);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
    const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 2500);
    };

    const [trackToEdit, setTrackToEdit] = useState<TrackInfo | null>(null);
    const [editForm, setEditForm] = useState({
        title: '',
        artist: '',
        genre: '',
        bpm: 120,
        keySignature: '8A'
    });

    const [trackToDelete, setTrackToDelete] = useState<TrackInfo | null>(null);

    const loadLibrary = async () => {
        try {
            uiLog('INFO', 'loadLibrary: старт сканирования');
            const dir = await GetMusicDir();
            setMusicDir(dir);
            const list = await ScanMusicDir();
            setLibraryTracks(list || []);
            uiLog('INFO', `loadLibrary: найдено ${list?.length ?? 0} треков`);
        } catch (err) {
            uiLog('ERROR', `loadLibrary: ошибка: ${String(err)}`);
        }
    };

    useEffect(() => {
        const cancel = EventsOn("library_changed", (list: TrackInfo[]) => {
            setLibraryTracks(list || []);
            uiLog('INFO', `library_changed: background scan finished, loaded ${list?.length ?? 0} tracks`);
        });
        return cancel;
    }, []);

    const currentPlaylistTracks = useMemo(() => {
        if (!selectedPlaylist) return libraryTracks;
        const pl = playlists.find(p => p.name === selectedPlaylist);
        if (!pl?.trackPaths) return [];
        const pathsSet = new Set(pl.trackPaths);
        return libraryTracks.filter(t => pathsSet.has(t.filePath));
    }, [selectedPlaylist, playlists, libraryTracks]);

    const availableArtists = useMemo(() => {
        return Array.from(
            new Set(libraryTracks.flatMap(t => splitArtists(t.artist || 'Unknown Artist')))
        ).filter(Boolean).sort();
    }, [libraryTracks]);

    const availableGenres = useMemo(() => {
        return Array.from(
            new Set(libraryTracks.map(t => t.genre || 'Unknown Genre'))
        ).filter(Boolean).sort();
    }, [libraryTracks]);

    const filteredTracks = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        return currentPlaylistTracks.filter(track => {
            const filename = getFilename(track.filePath).toLowerCase();
            const artist = (track.artist || 'Unknown Artist').toLowerCase();
            const genre = (track.genre || 'Unknown Genre').toLowerCase();

            const matchesQuery = !query || filename.includes(query) || artist.includes(query) || genre.includes(query);
            const matchesArtist = !selectedArtist || splitArtists(track.artist || 'Unknown Artist').includes(selectedArtist);
            const matchesGenre = !selectedGenre || (track.genre || 'Unknown Genre') === selectedGenre;

            return matchesQuery && matchesArtist && matchesGenre;
        });
    }, [currentPlaylistTracks, searchQuery, selectedArtist, selectedGenre]);

    const totalDuration = useMemo(() => {
        return currentPlaylistTracks.reduce((acc, t) => acc + (t.durationSec || 0), 0);
    }, [currentPlaylistTracks]);

    const totalDurationStr = useMemo(() => {
        const h = Math.floor(totalDuration / 3600);
        const m = Math.floor((totalDuration % 3600) / 60);
        const s = Math.floor(totalDuration % 60);
        if (h > 0) {
            return `${h} hr ${m} min`;
        }
        return `${m} min ${s} sec`;
    }, [totalDuration]);

    const handleEditTrackClick = (track: TrackInfo) => {
        setTrackToEdit(track);
        setEditForm({
            title: track.title || getFilename(track.filePath),
            artist: track.artist || '',
            genre: track.genre || '',
            bpm: Math.round(track.bpm),
            keySignature: track.keySignature || '8A'
        });
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!trackToEdit) return;
        try {
            await UpdateTrackMetadata(
                trackToEdit.filePath,
                editForm.title,
                editForm.artist,
                editForm.genre,
                Number(editForm.bpm),
                editForm.keySignature
            );
            uiLog('INFO', `Successfully updated metadata for ${trackToEdit.filePath}`);
            showToast(language === 'ru' ? 'Метаданные обновлены' : 'Metadata updated successfully');
            setTrackToEdit(null);
            await loadLibrary();
        } catch (err) {
            uiLog('ERROR', `Failed to update metadata: ${String(err)}`);
        }
    };

    const handleDeleteTrackClick = (track: TrackInfo) => {
        setTrackToDelete(track);
    };

    const handleDeleteConfirm = async () => {
        if (!trackToDelete) return;
        try {
            await DeleteTrack(trackToDelete.filePath);
            uiLog('INFO', `Successfully deleted track ${trackToDelete.filePath}`);
            showToast(language === 'ru' ? 'Трек удален с диска' : 'Track deleted from disk');

            if (onTrackDeleted) {
                onTrackDeleted(trackToDelete.filePath);
            }

            setTrackToDelete(null);
            await loadLibrary();
        } catch (err) {
            uiLog('ERROR', `Failed to delete track: ${String(err)}`);
        }
    };

    return {
        musicDir,
        setMusicDir,
        libraryTracks,
        setLibraryTracks,
        searchQuery,
        setSearchQuery,
        selectedArtist,
        setSelectedArtist,
        selectedGenre,
        setSelectedGenre,
        currentPlaylistTracks,
        availableArtists,
        availableGenres,
        filteredTracks,
        totalDuration,
        totalDurationStr,
        loadLibrary,
        handleOpenMusicDir: OpenMusicDir,
        toastMessage,
        showToast,
        trackToEdit,
        setTrackToEdit,
        editForm,
        setEditForm,
        handleEditTrackClick,
        handleEditSubmit,
        trackToDelete,
        setTrackToDelete,
        handleDeleteTrackClick,
        handleDeleteConfirm
    };
}
