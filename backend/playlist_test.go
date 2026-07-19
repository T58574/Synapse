package backend

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func TestPlaylists(t *testing.T) {
	tmpDir := t.TempDir()

	origHomeDir := osUserHomeDir
	osUserHomeDir = func() (string, error) {
		return tmpDir, nil
	}
	defer func() { osUserHomeDir = origHomeDir }()

	app := NewApp()
	app.Startup(nil)
	defer app.Shutdown(nil)

	playlists, err := app.GetPlaylists()
	if err != nil {
		t.Fatalf("GetPlaylists failed: %v", err)
	}
	if len(playlists) != 0 {
		t.Errorf("Expected 0 playlists initially, got %d", len(playlists))
	}

	err = app.CreatePlaylist("Favorites")
	if err != nil {
		t.Fatalf("CreatePlaylist failed: %v", err)
	}

	err = app.CreatePlaylist("Favorites")
	if err == nil {
		t.Error("Expected error when creating duplicate playlist")
	}

	playlists, err = app.GetPlaylists()
	if err != nil {
		t.Fatalf("GetPlaylists failed: %v", err)
	}
	if len(playlists) != 1 || playlists[0].Name != "Favorites" {
		t.Errorf("Expected 1 playlist named Favorites, got %v", playlists)
	}

	trackPath := filepath.Join(tmpDir, "track1.mp3")
	if err := os.WriteFile(trackPath, []byte("dummy audio content"), 0644); err != nil {
		t.Fatalf("Failed to create dummy track file: %v", err)
	}
	err = app.AddTrackToPlaylist("Favorites", trackPath)
	if err != nil {
		t.Fatalf("AddTrackToPlaylist failed: %v", err)
	}

	err = app.AddTrackToPlaylist("Favorites", trackPath)
	if err != nil {
		t.Fatalf("AddTrackToPlaylist failed for duplicate: %v", err)
	}

	playlists, err = app.GetPlaylists()
	if err != nil {
		t.Fatalf("GetPlaylists failed: %v", err)
	}
	if len(playlists[0].TrackPaths) != 1 || playlists[0].TrackPaths[0] != trackPath {
		t.Errorf("Expected 1 track path, got %v", playlists[0].TrackPaths)
	}

	err = app.AddTrackToPlaylist("NonExistent", trackPath)
	if err == nil {
		t.Error("Expected error adding track to non-existent playlist")
	}

	err = app.RemoveTrackFromPlaylist("Favorites", trackPath)
	if err != nil {
		t.Fatalf("RemoveTrackFromPlaylist failed: %v", err)
	}

	playlists, err = app.GetPlaylists()
	if err != nil {
		t.Fatalf("GetPlaylists failed: %v", err)
	}
	if len(playlists[0].TrackPaths) != 0 {
		t.Errorf("Expected 0 track paths, got %v", playlists[0].TrackPaths)
	}

	err = app.RemoveTrackFromPlaylist("NonExistent", trackPath)
	if err == nil {
		t.Error("Expected error removing track from non-existent playlist")
	}

	err = app.DeletePlaylist("Favorites")
	if err != nil {
		t.Fatalf("DeletePlaylist failed: %v", err)
	}

	playlists, err = app.GetPlaylists()
	if err != nil {
		t.Fatalf("GetPlaylists failed: %v", err)
	}
	if len(playlists) != 0 {
		t.Errorf("Expected 0 playlists, got %d", len(playlists))
	}

	err = app.DeletePlaylist("Favorites")
	if err == nil {
		t.Error("Expected error deleting non-existent playlist")
	}
}

func TestMalformedPlaylistJson(t *testing.T) {
	tmpDir := t.TempDir()

	origHomeDir := osUserHomeDir
	osUserHomeDir = func() (string, error) {
		return tmpDir, nil
	}
	defer func() { osUserHomeDir = origHomeDir }()

	app := NewApp()
	app.Startup(nil)
	defer app.Shutdown(nil)

	dir, err := app.GetMusicDir()
	if err != nil {
		t.Fatalf("GetMusicDir failed: %v", err)
	}

	path := filepath.Join(dir, "playlists.json")
	err = os.WriteFile(path, []byte("{malformed: json}"), 0644)
	if err != nil {
		t.Fatalf("Writing malformed JSON failed: %v", err)
	}

	_, err = app.GetPlaylists()
	if err == nil {
		t.Error("Expected error parsing malformed JSON")
	}
}

func TestPlaylistsErrorPaths(t *testing.T) {
	origHomeDir := osUserHomeDir
	osUserHomeDir = func() (string, error) {
		return "", fmt.Errorf("mock home error")
	}
	defer func() { osUserHomeDir = origHomeDir }()

	app := NewApp()
	app.Startup(nil)
	defer app.Shutdown(nil)

	_, err := app.GetPlaylists()
	if err == nil {
		t.Error("Expected error from GetPlaylists when GetMusicDir fails")
	}

	err = app.SavePlaylists([]Playlist{})
	if err == nil {
		t.Error("Expected error from SavePlaylists when GetMusicDir fails")
	}

	err = app.CreatePlaylist("Favorites")
	if err == nil {
		t.Error("Expected error from CreatePlaylist when GetMusicDir fails")
	}

	err = app.DeletePlaylist("Favorites")
	if err == nil {
		t.Error("Expected error from DeletePlaylist when GetMusicDir fails")
	}

	err = app.AddTrackToPlaylist("Favorites", "path")
	if err == nil {
		t.Error("Expected error from AddTrackToPlaylist when GetMusicDir fails")
	}

	err = app.RemoveTrackFromPlaylist("Favorites", "path")
	if err == nil {
		t.Error("Expected error from RemoveTrackFromPlaylist when GetMusicDir fails")
	}
}

func TestAppGetSpectrum(t *testing.T) {
	ok := InitAudioEngine(44100, 2)
	if !ok {
		t.Fatalf("InitAudioEngine failed")
	}
	defer CleanupAudioEngine()

	app := NewApp()
	app.Startup(nil)
	defer app.Shutdown(nil)

	spectrum := app.GetSpectrum(0)
	if len(spectrum) != 64 {
		t.Errorf("Expected spectrum length of 64, got %d", len(spectrum))
	}
}

func TestSelectAudioFileError(t *testing.T) {
	origOpenFileDialog := openFileDialog
	defer func() { openFileDialog = origOpenFileDialog }()

	openFileDialog = func(ctx context.Context, dialogOptions wailsRuntime.OpenDialogOptions) (string, error) {
		return "", fmt.Errorf("mock dialog error")
	}

	app := NewApp()
	app.Startup(nil)
	defer app.Shutdown(nil)

	_, err := app.SelectAudioFile()
	if err == nil {
		t.Error("Expected error from SelectAudioFile when openFileDialog fails")
	}
}
