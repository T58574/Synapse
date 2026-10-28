package backend

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type Playlist struct {
	Name       string   `json:"name"`
	TrackPaths []string `json:"trackPaths"`
}

func (a *App) getPlaylistsPath() (string, error) {
	dir, err := a.GetMusicDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "playlists.json"), nil
}

func (a *App) getPlaylistsInternal() ([]Playlist, error) {
	path, err := a.getPlaylistsPath()
	if err != nil {
		return nil, err
	}
	bytes, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []Playlist{}, nil
		}
		return nil, err
	}
	var playlists []Playlist
	if err := json.Unmarshal(bytes, &playlists); err != nil {
		return nil, err
	}
	if playlists == nil {
		return []Playlist{}, nil
	}
	return playlists, nil
}

func (a *App) savePlaylistsInternal(playlists []Playlist) error {
	path, err := a.getPlaylistsPath()
	if err != nil {
		return err
	}
	bytes, err := json.Marshal(playlists)
	if err != nil {
		return err
	}
	return os.WriteFile(path, bytes, 0600)
}

func (a *App) GetPlaylists() ([]Playlist, error) {
	playlistMu.Lock()
	defer playlistMu.Unlock()

	playlists, err := a.getPlaylistsInternal()
	if err != nil {
		return nil, err
	}

	var validatedPlaylists []Playlist
	changed := false
	for _, p := range playlists {
		var validPaths []string
		for _, path := range p.TrackPaths {
			if _, err := os.Stat(path); err == nil {
				validPaths = append(validPaths, path)
			} else {
				changed = true
				Log(LogWarn, "playlist", "track path no longer exists, removing from playlist %q: %s", p.Name, path)
			}
		}
		validatedPlaylists = append(validatedPlaylists, Playlist{
			Name:       p.Name,
			TrackPaths: validPaths,
		})
	}

	if changed {
		_ = a.savePlaylistsInternal(validatedPlaylists)
	}

	return validatedPlaylists, nil
}

func (a *App) SavePlaylists(playlists []Playlist) error {
	playlistMu.Lock()
	defer playlistMu.Unlock()
	return a.savePlaylistsInternal(playlists)
}

func (a *App) CreatePlaylist(name string) error {
	playlistMu.Lock()
	defer playlistMu.Unlock()
	playlists, err := a.getPlaylistsInternal()
	if err != nil {
		return err
	}
	for _, p := range playlists {
		if p.Name == name {
			return fmt.Errorf("playlist already exists")
		}
	}
	playlists = append(playlists, Playlist{Name: name, TrackPaths: []string{}})
	return a.savePlaylistsInternal(playlists)
}

func (a *App) DeletePlaylist(name string) error {
	playlistMu.Lock()
	defer playlistMu.Unlock()
	playlists, err := a.getPlaylistsInternal()
	if err != nil {
		return err
	}
	index := -1
	for i, p := range playlists {
		if p.Name == name {
			index = i
			break
		}
	}
	if index == -1 {
		return fmt.Errorf("playlist not found")
	}
	playlists = append(playlists[:index], playlists[index+1:]...)
	return a.savePlaylistsInternal(playlists)
}

func (a *App) AddTrackToPlaylist(playlistName string, trackPath string) error {
	playlistMu.Lock()
	defer playlistMu.Unlock()
	playlists, err := a.getPlaylistsInternal()
	if err != nil {
		return err
	}
	for i, p := range playlists {
		if p.Name == playlistName {
			for _, pt := range p.TrackPaths {
				if pt == trackPath {
					return nil
				}
			}
			playlists[i].TrackPaths = append(playlists[i].TrackPaths, trackPath)
			return a.savePlaylistsInternal(playlists)
		}
	}
	return fmt.Errorf("playlist not found")
}

func (a *App) RemoveTrackFromPlaylist(playlistName string, trackPath string) error {
	playlistMu.Lock()
	defer playlistMu.Unlock()
	playlists, err := a.getPlaylistsInternal()
	if err != nil {
		return err
	}
	for i, p := range playlists {
		if p.Name == playlistName {
			var updatedPaths []string
			for _, pt := range p.TrackPaths {
				if pt != trackPath {
					updatedPaths = append(updatedPaths, pt)
				}
			}
			playlists[i].TrackPaths = updatedPaths
			return a.savePlaylistsInternal(playlists)
		}
	}
	return fmt.Errorf("playlist not found")
}
