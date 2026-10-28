package backend

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"

	"github.com/dhowden/tag"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func extractTagsOrFilename(path string) (string, string, string) {
	title := ""
	artist := ""
	genre := ""
	f, err := os.Open(path)
	if err == nil {
		defer f.Close()
		m, err := tag.ReadFrom(f)
		if err == nil {
			title = m.Title()
			artist = m.Artist()
			genre = m.Genre()
		}
	}
	filename := filepath.Base(path)
	filenameNoExt := strings.TrimSuffix(filename, filepath.Ext(path))
	parts := strings.SplitN(filenameNoExt, " - ", 2)

	if title == "" {
		if len(parts) == 2 {
			title = strings.TrimSpace(parts[1])
		} else {
			title = filenameNoExt
		}
	}
	if artist == "" {
		if len(parts) == 2 {
			artist = strings.TrimSpace(parts[0])
		} else {
			artist = "Unknown Artist"
		}
	}
	if genre == "" {
		genre = "Unknown Genre"
	}
	return title, artist, genre
}

func (a *App) UpdateTrackMetadata(filePath string, title string, artist string, genre string, bpm float64, keySignature string) error {
	bpm = math.Round(bpm)
	Log(LogInfo, "library", "UpdateTrackMetadata file=%q title=%q artist=%q genre=%q bpm=%.0f key=%q", filePath, title, artist, genre, bpm, keySignature)
	dir, err := a.GetMusicDir()
	if err != nil {
		return err
	}
	cachePath := filepath.Join(dir, "cache.json")

	scanMu.Lock()
	defer scanMu.Unlock()

	var cachedList []CacheEntry
	if cacheBytes, readErr := os.ReadFile(cachePath); readErr == nil {
		_ = json.Unmarshal(cacheBytes, &cachedList)
	}

	found := false
	mood := DetermineMood(bpm, keySignature, genre)
	for i, entry := range cachedList {
		if entry.FilePath == filePath {
			cachedList[i].Title = title
			cachedList[i].Artist = artist
			cachedList[i].Genre = genre
			cachedList[i].BPM = math.Round(bpm)
			cachedList[i].KeySignature = keySignature
			cachedList[i].Mood = mood
			found = true
			break
		}
	}

	if !found {
		info, err := os.Stat(filePath)
		if err != nil {
			return err
		}
		cachedList = append(cachedList, CacheEntry{
			FilePath:     filePath,
			Title:        title,
			Artist:       artist,
			Genre:        genre,
			BPM:          bpm,
			KeySignature: keySignature,
			Mood:         mood,
			Size:         info.Size(),
			ModTime:      info.ModTime().Unix(),
		})
	}

	if cacheBytes, marshalErr := json.Marshal(cachedList); marshalErr == nil {
		_ = os.WriteFile(cachePath, cacheBytes, 0600)
	}

	a.currentPathsMu.Lock()
	p0 := a.currentPaths[0] == filePath
	p1 := a.currentPaths[1] == filePath
	a.currentPathsMu.Unlock()

	newMeta := TrackMetadata{
		FilePath:     filePath,
		Title:        title,
		Artist:       artist,
		Genre:        genre,
		BPM:          bpm,
		KeySignature: keySignature,
		Mood:         mood,
	}

	if p0 {
		SetTrackMetadata(0, newMeta)
		if a.ctx != nil {
			wailsRuntime.EventsEmit(a.ctx, "track_analyzed", 0, newMeta)
		}
	}
	if p1 {
		SetTrackMetadata(1, newMeta)
		if a.ctx != nil {
			wailsRuntime.EventsEmit(a.ctx, "track_analyzed", 1, newMeta)
		}
	}

	go func() {
		_, _ = a.ScanMusicDir()
	}()

	return nil
}

func (a *App) DeleteTrack(filePath string) error {
	Log(LogInfo, "library", "DeleteTrack file=%q", filePath)

	a.currentPathsMu.Lock()
	if a.currentPaths[0] == filePath {
		PauseTrack(0)
		a.currentPaths[0] = ""
	}
	if a.currentPaths[1] == filePath {
		PauseTrack(1)
		a.currentPaths[1] = ""
	}
	a.currentPathsMu.Unlock()

	if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		Log(LogError, "library", "DeleteTrack Remove file error: %v", err)
		return err
	}

	dir, err := a.GetMusicDir()
	if err == nil {
		cachePath := filepath.Join(dir, "cache.json")
		scanMu.Lock()
		var cachedList []CacheEntry
		if cacheBytes, readErr := os.ReadFile(cachePath); readErr == nil {
			_ = json.Unmarshal(cacheBytes, &cachedList)
		}
		var updatedCache []CacheEntry
		for _, entry := range cachedList {
			if entry.FilePath != filePath {
				updatedCache = append(updatedCache, entry)
			}
		}
		if cacheBytes, marshalErr := json.Marshal(updatedCache); marshalErr == nil {
			_ = os.WriteFile(cachePath, cacheBytes, 0600)
		}
		scanMu.Unlock()
	}

	playlistMu.Lock()
	playlists, err := a.getPlaylistsInternal()
	if err == nil {
		changed := false
		for i, p := range playlists {
			var updatedPaths []string
			for _, pt := range p.TrackPaths {
				if pt != filePath {
					updatedPaths = append(updatedPaths, pt)
				} else {
					changed = true
				}
			}
			playlists[i].TrackPaths = updatedPaths
		}
		if changed {
			_ = a.savePlaylistsInternal(playlists)
		}
	}
	playlistMu.Unlock()

	go func() {
		_, _ = a.ScanMusicDir()
	}()

	return nil
}
